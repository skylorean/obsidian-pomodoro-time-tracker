import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import { TimerStorage } from "./timerStorage";
import type { TimerState } from "./types";

export const VIEW_TYPE_POMODORO = "pomodoro-timer";

export class PomodoroView extends ItemView {
	private timerSeconds: number;
	private initialSeconds: number;
	private intervalId: number | null = null;
	private isRunning: boolean = false;
	private secondHand: SVGLineElement | null = null;
	private progressPath: SVGPathElement | null = null;
	private timeDisplay: HTMLElement | null = null;
	private startBtn: HTMLElement | null = null;
	private pauseBtn: HTMLElement | null = null;
	private resetBtn: HTMLElement | null = null;

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

	constructor(
		leaf: WorkspaceLeaf,
		private workDuration: number,
	) {
		super(leaf);

		// Initialize storage with app instance
		this.storage = new TimerStorage(this.app);

		// Try to restore previous state
		const restoreResult = this.storage.restore();

		if (restoreResult.success && restoreResult.state) {
			this.timerSeconds = restoreResult.state.timerSeconds;
			this.initialSeconds = restoreResult.state.initialSeconds;
			this.wasRestoredFromPause = true;
		} else {
			this.timerSeconds = workDuration * 60;
			this.initialSeconds = workDuration * 60;

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
		this.stopTimer();
	}

	private render() {
		const container = this.containerEl.children[1];
		if (!container) return;

		container.empty();
		container.addClass("pomodoro-container");

		const clockContainer = container.createEl("div", {
			cls: "pomodoro-clock-container",
		});

		// Create SVG for analog clock FIRST
		const svg = clockContainer.createSvg("svg");
		svg.addClass("pomodoro-clock-svg");
		svg.setAttribute("width", "200");
		svg.setAttribute("height", "200");
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
		this.updateProgressArc();

		// Tick marks

		// Second hand (thinner, shows current second)
		const clockLines = clockContainer.createSvg("svg");
		clockLines.addClass("pomodoro-clock-lines");

		// this.renderTickMarks(clockLines);
		this.renderTickMarks(svg);

		this.secondHand = clockLines.createSvg("line");
		this.secondHand.addClass("pomodoro-second-hand");
		this.secondHand.setAttribute("x1", this.centerX.toString());
		this.secondHand.setAttribute("y1", this.centerY.toString());
		this.secondHand.setAttribute("x2", this.centerX.toString());
		this.secondHand.setAttribute("y2", "23"); // Length = 77px from center
		this.secondHand.setAttribute("stroke-linecap", "round");

		// Center dot
		const centerDot = clockLines.createSvg("circle");
		centerDot.addClass("pomodoro-center-dot");
		centerDot.setAttribute("cx", this.centerX.toString());
		centerDot.setAttribute("cy", this.centerY.toString());
		centerDot.setAttribute("r", "8");

		// Digital time display SECOND (renders after SVG in normal flow)
		this.timeDisplay = clockContainer.createEl("div", {
			cls: "pomodoro-time-display",
		});
		this.updateTimeDisplay();
		this.updateClockHands();

		// Controls container
		const controls = container.createEl("div", {
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
		this.pauseBtn.style.display = "none";

		// Reset button
		this.resetBtn = controls.createEl("button", {
			cls: "pomodoro-btn pomodoro-btn-reset",
			text: "Reset",
		});
		this.resetBtn.addEventListener("click", () => this.resetTimer());
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
		if (this.startBtn) this.startBtn.style.display = "none";
		if (this.pauseBtn) this.pauseBtn.style.display = "inline-block";

		this.intervalId = window.setInterval(() => {
			if (this.timerSeconds > 0) {
				this.timerSeconds--;
				this.updateTimeDisplay();
				this.updateClockHands();
				this.saveState();
			} else {
				this.stopTimer();
				this.storage.clear();
				new Notice("Pomodoro session complete! Time for a break.");
			}
		}, 1000);
	}

	private pauseTimer() {
		if (!this.isRunning) return;

		this.stopTimer();
		this.saveState();
		if (this.startBtn) {
			this.startBtn.style.display = "inline-block";
			this.startBtn.textContent = "Resume";
		}
		if (this.pauseBtn) this.pauseBtn.style.display = "none";
	}

	private stopTimer() {
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
		this.isRunning = false;
	}

	private resetTimer() {
		this.stopTimer();
		this.timerSeconds = this.initialSeconds;
		this.wasRestoredFromPause = false;
		this.updateTimeDisplay();
		this.updateClockHands();
		this.storage.clear();
		if (this.startBtn) {
			this.startBtn.style.display = "inline-block";
			this.startBtn.textContent = "Start";
		}
		if (this.pauseBtn) this.pauseBtn.style.display = "none";
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
		};
		this.storage.save(state);
	}

	private updateTimeDisplay() {
		if (!this.timeDisplay) return;
		const minutes = Math.floor(this.timerSeconds / 60);
		const seconds = this.timerSeconds % 60;
		this.timeDisplay.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
	}

	private updateClockHands() {
		if (!this.secondHand) return;

		const currentSecond = this.timerSeconds % 60;

		// Second hand - clockwise (shows current second)
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
}
