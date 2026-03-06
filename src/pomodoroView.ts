import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import { TimerStorage } from "./timerStorage";
import { TodoListManager } from "./todoListManager";
import type { TimerState, TimerMode } from "./types";
import type { PomodoroSettings } from "./settings";
import type PomodoroTimerPlugin from "./main";

export const VIEW_TYPE_POMODORO = "pomodoro-timer";

export class PomodoroView extends ItemView {
	private timerSeconds: number;
	private initialSeconds: number;
	private isRunning: boolean = false;
	private secondHand: SVGLineElement | null = null;
	private centerDot: SVGCircleElement | null = null;
	private progressPath: SVGPathElement | null = null;
	private timeDisplay: HTMLElement | null = null;
	private startBtn: HTMLElement | null = null;
	private pauseBtn: HTMLElement | null = null;
	private endSessionBtn: HTMLElement | null = null;
	private workBtn: HTMLElement | null = null;
	private breakBtn: HTMLElement | null = null;
	private mode: TimerMode = "work";
	private workDuration: number;
	private breakDuration: number;
	private lastTickTimestamp: number | null = null;
	private worker: Worker | null = null;
	private settings: PomodoroSettings;
	private audio: HTMLAudioElement | null = null;

	// Clock dimensions
	private readonly centerX = 100;
	private readonly centerY = 100;
	private readonly radius = 93;

	// Storage for timer state persistence
	private readonly storage: TimerStorage;
	// Flag to show "Resume" instead of "Start" when restoring paused state
	private wasRestoredFromPause = false;
	// Message to show if timer expired while away
	private expiredNotice: string | null = null;

	// Todo list manager
	private todoManager: TodoListManager | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: PomodoroTimerPlugin,
	) {
		super(leaf);

		this.settings = plugin.settings;
		this.workDuration = plugin.settings.workDuration;
		this.breakDuration = plugin.settings.breakDuration;

		// Initialize storage with app instance
		this.storage = new TimerStorage(this.app);

		// Initialize todo list manager
		this.todoManager = new TodoListManager(this.app, this.plugin);

		// Try to restore previous state
		const restoreResult = this.storage.restore();

		if (restoreResult.success) {
			const state = restoreResult.state;
			if (state) {
				this.timerSeconds = state.timerSeconds;
				this.initialSeconds = state.initialSeconds;
				this.mode = state.mode;
				// Only show "Resume" if timer was paused (not running) and hasn't expired
				this.wasRestoredFromPause = !state.isRunning && state.timerSeconds > 0;
			}
		} else {
			this.timerSeconds = this.workDuration * 60;
			this.initialSeconds = this.workDuration * 60;

			if (restoreResult.error === "Timer expired while away") {
				this.expiredNotice =
					"Your previous Pomodoro session completed while you were away!";
			}
		}
	}

	getViewType(): string {
		return VIEW_TYPE_POMODORO;
	}

	getDisplayText(): string {
		return "Pomodoro timer";
	}

	async onOpen() {
		this.render();

		// Show notice if timer expired while away
		if (this.expiredNotice) {
			new Notice(this.expiredNotice);
			this.expiredNotice = null;
		}
	}

	async onClose() {
		this.saveState();
		this.todoManager?.save();
		this.todoManager?.destroy();
		this.stopTimer();
	}

	private render() {
		const container = this.containerEl.children[1];
		if (!container) return;

		container.empty();
		container.addClass("pomodoro-container");

		const wrapper = container.createEl("div", {
			cls: "pomodoro-wrapper",
		});

		// Mode toggle (Work | Break)
		const toggle = wrapper.createEl("div", {
			cls: "pomodoro-mode-toggle",
		});
		this.workBtn = toggle.createEl("button", {
			cls:
				"pomodoro-toggle-btn" + (this.mode === "work" ? " active" : ""),
			text: "Work",
		});
		this.breakBtn = toggle.createEl("button", {
			cls:
				"pomodoro-toggle-btn" +
				(this.mode === "break" ? " active" : ""),
			text: "Break",
		});
		this.workBtn.addEventListener("click", () => this.switchMode("work"));
		this.breakBtn.addEventListener("click", () => this.switchMode("break"));

		const clockContainer = wrapper.createEl("div", {
			cls: "pomodoro-clock-container",
		});

		// Create SVG for analog clock FIRST
		const svg = clockContainer.createSvg("svg");
		svg.addClass("pomodoro-clock-svg");
		svg.setAttribute("viewBox", "0 0 200 200");

		// Clock face background
		const clockFace = svg.createSvg("circle");
		clockFace.addClass("pomodoro-clock-face");
		clockFace.setAttribute("cx", this.centerX.toString());
		clockFace.setAttribute("cy", this.centerY.toString());
		clockFace.setAttribute("r", this.radius.toString());

		// Progress arc overlay
		this.progressPath = svg.createSvg("path");
		this.progressPath.addClass("pomodoro-progress-arc");
		this.progressPath.addClass(
			this.mode === "work"
				? "pomodoro-progress-work"
				: "pomodoro-progress-break",
		);
		this.updateProgressArc();

		// Tick marks

		// Second hand (thinner, shows current second)
		const clockLines = clockContainer.createSvg("svg");
		clockLines.addClass("pomodoro-clock-lines");
		clockLines.setAttribute("viewBox", "0 0 200 200");

		// this.renderTickMarks(clockLines);
		this.renderTickMarks(svg);

		this.secondHand = clockLines.createSvg("line");
		this.secondHand.addClass("pomodoro-second-hand");
		this.secondHand.setAttribute("x1", this.centerX.toString());
		this.secondHand.setAttribute("y1", this.centerY.toString());
		this.secondHand.setAttribute("x2", this.centerX.toString());
		this.secondHand.setAttribute("y2", "27");
		this.secondHand.setAttribute("stroke-linecap", "round");

		// Center dot
		this.centerDot = clockLines.createSvg("circle");
		this.centerDot.addClass("pomodoro-center-dot");
		this.centerDot.setAttribute("cx", this.centerX.toString());
		this.centerDot.setAttribute("cy", this.centerY.toString());
		this.centerDot.setAttribute("r", "4");

		// Digital time display SECOND (renders after SVG in normal flow)
		this.timeDisplay = clockContainer.createEl("div", {
			cls: "pomodoro-time-display",
		});
		this.updateTimeDisplay();
		this.updateClockHands();
		this.updateCenterDotColor();
		this.updateProgressArcColor();

		// Controls container
		const controls = wrapper.createEl("div", {
			cls: "pomodoro-controls",
		});

		// Start button
		this.startBtn = controls.createEl("button", {
			cls: "pomodoro-btn pomodoro-btn-start",
			text: this.wasRestoredFromPause ? "Resume" : "Start",
		});
		this.startBtn.addEventListener("click", () => this.startTimer());

		// Pause button
		this.pauseBtn = controls.createEl("button", {
			cls: "pomodoro-btn pomodoro-btn-pause",
			text: "Pause",
		});
		this.pauseBtn.addEventListener("click", () => this.pauseTimer());
		this.pauseBtn.setCssProps({ display: "none" });

		// End session button
		this.endSessionBtn = controls.createEl("button", {
			cls: "pomodoro-btn pomodoro-btn-end-session",
			text: "End session",
		});
		this.endSessionBtn.addEventListener("click", () => this.endSession());
		this.endSessionBtn.setCssProps({ visibility: "hidden", opacity: "0" });

		// Todo list section
		this.todoManager?.renderInto(wrapper);
	}

	private renderTickMarks(svg: SVGSVGElement) {
		for (let i = 0; i < 60; i++) {
			const angle = i * 6;
			const isMajor = i % 5 === 0;
			const length = isMajor ? 10 : 5;

			const tick = svg.createSvg("line");
			tick.addClass(
				isMajor ? "pomodoro-tick-major" : "pomodoro-tick-minor",
			);

			// Calculate position using trigonometry
			// -90 offset to start from top (12 o'clock)
			const rad = ((angle - 90) * Math.PI) / 180;
			const outerR = this.radius - 3;
			const innerR = outerR - length;

			const x1 = this.centerX + outerR * Math.cos(rad);
			const y1 = this.centerY + outerR * Math.sin(rad);
			const x2 = this.centerX + innerR * Math.cos(rad);
			const y2 = this.centerY + innerR * Math.sin(rad);

			tick.setAttribute("x1", x1.toString());
			tick.setAttribute("y1", y1.toString());
			tick.setAttribute("x2", x2.toString());
			tick.setAttribute("y2", y2.toString());
		}
	}

	private startTimer() {
		if (this.isRunning) return;

		this.isRunning = true;
		this.wasRestoredFromPause = false;
		this.lastTickTimestamp = Date.now();
		if (this.startBtn) this.startBtn.setCssProps({ display: "none" });
		if (this.pauseBtn) this.pauseBtn.setCssProps({ display: "flex" });
		if (this.endSessionBtn)
			this.endSessionBtn.setCssProps({
				visibility: "visible",
				opacity: "1",
			});

		// Create web worker for accurate timing (not throttled in background)
		this.worker = this.createTimerWorker();
		this.worker.onmessage = () => {
			if (!this.isRunning) return;

			if (this.timerSeconds > 0) {
				this.timerSeconds--;
				this.lastTickTimestamp = Date.now();

				this.updateTimeDisplay();
				this.updateClockHands();
				this.saveState();

				if (this.timerSeconds <= 0) {
					this.stopTimer();
					this.storage.clear();
					if (this.pauseBtn)
						this.pauseBtn.setCssProps({ display: "none" });
					new Notice(
						`Pomodoro ${this.mode === "work" ? "Work" : "Break"} session complete!`,
					);
					void this.playAlarmSound();
				}
			}
		};
		this.worker.postMessage("start");
	}

	private createTimerWorker(): Worker {
		const workerCode = `
			let intervalId;
			self.onmessage = function(e) {
				if (e.data === 'start') {
					intervalId = setInterval(() => self.postMessage('tick'), 1000);
				} else if (e.data === 'stop') {
					clearInterval(intervalId);
				}
			};
		`;
		const blob = new Blob([workerCode], { type: "application/javascript" });
		return new Worker(URL.createObjectURL(blob));
	}

	private pauseTimer() {
		if (!this.isRunning) return;

		this.stopTimer();
		this.lastTickTimestamp = null;
		this.saveState();
		if (this.startBtn) {
			this.startBtn.setCssProps({ display: "flex" });
			this.startBtn.textContent = "Resume";
		}
		if (this.pauseBtn) this.pauseBtn.setCssProps({ display: "none" });
	}

	private stopTimer() {
		if (this.worker) {
			this.worker.postMessage("stop");
			this.worker.terminate();
			this.worker = null;
		}
		this.isRunning = false;
	}

	private endSession() {
		this.stopAlarmSound();
		const nextMode: TimerMode = this.mode === "work" ? "break" : "work";
		this.stopTimer();
		this.switchMode(nextMode);
	}

	/**
	 * Saves current timer state to localStorage
	 */
	private saveState(): void {
		const state: TimerState = {
			timerSeconds: this.timerSeconds,
			initialSeconds: this.initialSeconds,
			isRunning: this.isRunning,
			savedAt: Date.now(),
			mode: this.mode,
		};
		this.storage.save(state);
	}

	private updateTimeDisplay() {
		if (!this.timeDisplay) return;
		const minutes = Math.floor(this.timerSeconds / 60);
		const seconds = this.timerSeconds % 60;
		this.timeDisplay.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
	}

	private updateClockHands(modeUpdated: boolean = false) {
		if (!this.secondHand) return;

		const currentSecond = this.timerSeconds % 60;
		const secondAngle = currentSecond * 6;
		this.secondHand.setAttribute(
			"transform",
			`rotate(${secondAngle} ${this.centerX} ${this.centerY})`,
		);

		this.updateProgressArc();
	}

	private updateProgressArc() {
		if (!this.progressPath) return;
		const ratio = this.timerSeconds / this.initialSeconds;
		this.progressPath.setAttribute("d", this.createProgressArcPath(ratio));
	}

	private createProgressArcPath(ratio: number): string {
		const radius = this.radius - 3;

		if (ratio <= 0) {
			return "";
		}

		if (ratio >= 1) {
			// Full circle - two semicircles
			return `M ${this.centerX} ${this.centerY}
				L ${this.centerX} ${this.centerY - radius}
				A ${radius} ${radius} 0 1 1 ${this.centerX} ${this.centerY + radius}
				A ${radius} ${radius} 0 1 1 ${this.centerX} ${this.centerY - radius}
				Z`;
		}

		const endAngle = ratio * 360;
		const endRad = (endAngle * Math.PI) / 180;
		const endX = this.centerX + radius * Math.sin(endRad);
		const endY = this.centerY - radius * Math.cos(endRad);

		const largeArcFlag = endAngle > 180 ? 1 : 0;

		return `M ${this.centerX} ${this.centerY}
			L ${this.centerX} ${this.centerY - radius}
			A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}
			Z`;
	}

	private switchMode(newMode: TimerMode) {
		if (this.mode === newMode) return;

		this.stopAlarmSound();

		this.stopTimer();
		this.mode = newMode;
		this.timerSeconds =
			(newMode === "work" ? this.workDuration : this.breakDuration) * 60;
		this.initialSeconds = this.timerSeconds;
		this.wasRestoredFromPause = false;

		this.storage.clear();

		// Reset button visibility
		if (this.startBtn) this.startBtn.setCssProps({ display: "flex" });
		if (this.pauseBtn) this.pauseBtn.setCssProps({ display: "none" });
		if (this.endSessionBtn)
			this.endSessionBtn.setCssProps({
				visibility: "hidden",
				opacity: "0",
			});

		this.updateTimeDisplay();
		this.updateClockHands(true);
		this.updateProgressArcColor();
		this.updateCenterDotColor();
		this.updateToggleButton();
		this.updateStartButtonText();
	}

	private updateProgressArcColor() {
		if (!this.progressPath) return;
		this.progressPath.removeClass("pomodoro-progress-work");
		this.progressPath.removeClass("pomodoro-progress-break");
		this.progressPath.addClass(
			this.mode === "work"
				? "pomodoro-progress-work"
				: "pomodoro-progress-break",
		);
	}

	private updateCenterDotColor() {
		if (!this.centerDot) return;
		this.centerDot.toggleClass("break-mode", this.mode === "break");
	}

	private updateToggleButton() {
		if (this.workBtn) {
			this.workBtn.toggleClass("active", this.mode === "work");
		}
		if (this.breakBtn) {
			this.breakBtn.toggleClass("active", this.mode === "break");
		}
	}

	private updateStartButtonText() {
		if (this.startBtn) {
			this.startBtn.textContent = this.wasRestoredFromPause
				? "Resume"
				: "Start";
		}
	}

	// ==================== Audio Methods ====================

	private async loadAudio(): Promise<void> {
		if (this.audio) return;

		try {
			const audioPath = `${this.app.vault.configDir}/plugins/obsidian-pomodoro-time-tracker/assets/alarm.mp3`;
			const data = await this.app.vault.adapter.readBinary(audioPath);
			const blob = new Blob([data], { type: "audio/mpeg" });
			const audioUrl = URL.createObjectURL(blob);
			this.audio = new Audio(audioUrl);
			this.audio.volume = this.settings.soundVolume / 100;
		} catch (e) {
			console.warn("Failed to load audio file:", e);
		}
	}

	private async playAlarmSound(): Promise<void> {
		if (!this.settings.soundEnabled) return;

		if (!this.audio) {
			await this.loadAudio();
		}

		if (this.audio) {
			this.audio.loop = true;
			this.audio.currentTime = 0;
			this.audio.volume = this.settings.soundVolume / 100;
			this.audio.play().catch((e) => {
				console.warn("Failed to play alarm sound:", e);
			});
		}
	}

	private stopAlarmSound(): void {
		if (this.audio) {
			this.audio.pause();
			this.audio.loop = false;
			this.audio.currentTime = 0;
		}
	}
}
