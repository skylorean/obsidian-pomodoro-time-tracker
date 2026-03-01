import { ItemView, WorkspaceLeaf, Notice } from "obsidian";

export const VIEW_TYPE_POMODORO = "pomodoro-timer";

export class PomodoroView extends ItemView {
	private timerSeconds: number;
	private initialSeconds: number;
	private intervalId: number | null = null;
	private isRunning: boolean = false;
	private secondHand: SVGLineElement | null = null;
	private timeDisplay: HTMLElement | null = null;
	private startBtn: HTMLElement | null = null;
	private pauseBtn: HTMLElement | null = null;
	private resetBtn: HTMLElement | null = null;

	// Clock dimensions
	private readonly centerX = 100;
	private readonly centerY = 100;
	private readonly radius = 93;

	constructor(
		leaf: WorkspaceLeaf,
		private workDuration: number,
	) {
		super(leaf);
		this.timerSeconds = workDuration * 60;
		this.initialSeconds = workDuration * 60;
	}

	getViewType(): string {
		return VIEW_TYPE_POMODORO;
	}

	getDisplayText(): string {
		return "Pomodoro timer";
	}

	async onOpen() {
		this.render();
	}

	async onClose() {
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
			text: "Start",
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
		if (this.startBtn) this.startBtn.style.display = "none";
		if (this.pauseBtn) this.pauseBtn.style.display = "inline-block";

		this.intervalId = window.setInterval(() => {
			if (this.timerSeconds > 0) {
				this.timerSeconds--;
				this.updateTimeDisplay();
				this.updateClockHands();
			} else {
				this.stopTimer();
				new Notice("Pomodoro session complete! Time for a break.");
			}
		}, 1000);
	}

	private pauseTimer() {
		if (!this.isRunning) return;

		this.stopTimer();
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
		this.updateTimeDisplay();
		this.updateClockHands();
		if (this.startBtn) {
			this.startBtn.style.display = "inline-block";
			this.startBtn.textContent = "Start";
		}
		if (this.pauseBtn) this.pauseBtn.style.display = "none";
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
	}
}
