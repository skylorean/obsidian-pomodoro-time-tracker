import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import { TimerStorage } from "./timerStorage";
import { TodoStorage } from "./todoStorage";
import { FileSuggestModal } from "./FileSuggestModal";
import { parseWikiLinks } from "./wikiLinkParser";
import type { TimerState, TimerMode, TodoTask } from "./types";

export const VIEW_TYPE_POMODORO = "pomodoro-timer";

export class PomodoroView extends ItemView {
	private timerSeconds: number;
	private initialSeconds: number;
	private intervalId: number | null = null;
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
	private breakDuration: number;

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

	// Todo list state
	private readonly todoStorage: TodoStorage;
	private tasks: TodoTask[] = [];
	private todoListEl: HTMLElement | null = null;
	private todoInputEl: HTMLInputElement | null = null;
	private todoInputContainer: HTMLElement | null = null;
	private draggedTaskId: string | null = null;
	private isEditingTask: boolean = false;

	constructor(
		leaf: WorkspaceLeaf,
		private workDuration: number,
		breakDuration: number,
	) {
		super(leaf);

		this.breakDuration = breakDuration;

		// Initialize storage with app instance
		this.storage = new TimerStorage(this.app);

		// Initialize todo storage and restore tasks
		this.todoStorage = new TodoStorage(this.app);
		const todoResult = this.todoStorage.restore();
		if (todoResult.success && todoResult.data) {
			this.tasks = todoResult.data;
		}

		// Try to restore previous state
		const restoreResult = this.storage.restore();

		if (restoreResult.success) {
			const state = restoreResult.state;
			if (state) {
				this.timerSeconds = state.timerSeconds;
				this.initialSeconds = state.initialSeconds;
				this.mode = state.mode;
				this.wasRestoredFromPause = true;
			}
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
		this.saveTodoState();
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
		this.centerDot.setAttribute("r", "8");

		// Digital time display SECOND (renders after SVG in normal flow)
		this.timeDisplay = clockContainer.createEl("div", {
			cls: "pomodoro-time-display",
		});
		this.updateTimeDisplay();
		this.updateClockHands();

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
		this.renderTodoList(wrapper);
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
		if (this.startBtn) this.startBtn.setCssProps({ display: "none" });
		if (this.pauseBtn) this.pauseBtn.setCssProps({ display: "flex" });
		if (this.endSessionBtn)
			this.endSessionBtn.setCssProps({
				visibility: "visible",
				opacity: "1",
			});

		const currentMode = this.mode === "work" ? "Work" : "Break";

		this.intervalId = window.setInterval(() => {
			if (this.timerSeconds > 0) {
				this.timerSeconds--;
				this.updateTimeDisplay();
				this.updateClockHands();
				this.saveState();
			} else {
				const nextMode: TimerMode =
					this.mode === "work" ? "break" : "work";
				this.stopTimer();
				this.storage.clear();
				new Notice(
					`Pomodoro ${currentMode} session complete! Time for a ${nextMode} session.`,
				);
				this.switchMode(nextMode);
			}
		}, 1000);
	}

	private pauseTimer() {
		if (!this.isRunning) return;

		this.stopTimer();
		this.saveState();
		if (this.startBtn) {
			this.startBtn.setCssProps({ display: "flex" });
			this.startBtn.textContent = "Resume";
		}
		if (this.pauseBtn) this.pauseBtn.setCssProps({ display: "none" });
	}

	private stopTimer() {
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
		this.isRunning = false;
	}

	private endSession() {
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

	// ==================== Todo List Methods ====================

	/**
	 * Renders the todo list section below timer controls
	 */
	private renderTodoList(wrapper: HTMLElement): void {
		const todoContainer = wrapper.createEl("div", {
			cls: "pomodoro-todo-container",
		});

		// Header with add button
		const todoHeader = todoContainer.createEl("div", {
			cls: "pomodoro-todo-header",
		});

		todoHeader.createEl("span", {
			cls: "pomodoro-todo-title",
			text: "Tasks",
		});

		const addBtn = todoHeader.createEl("button", {
			cls: "pomodoro-todo-add-btn",
			text: "+",
		});
		addBtn.addEventListener("click", () => this.showTodoInput());

		// Hidden input container
		this.todoInputContainer = todoContainer.createEl("div", {
			cls: "pomodoro-todo-input-container hidden",
		});

		this.todoInputEl = this.todoInputContainer.createEl("input", {
			cls: "pomodoro-todo-input",
			attr: {
				type: "text",
				placeholder: "Add task... (use [[link]] for wiki-links)",
			},
		});

		this.todoInputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && this.todoInputEl) {
				this.addTask(this.todoInputEl.value);
			} else if (e.key === "Escape") {
				this.hideTodoInput();
			}
		});

		// Wiki-link autocomplete: detect [[ and open file suggest modal
		this.todoInputEl.addEventListener("input", () => {
			const value = this.todoInputEl?.value ?? "";
			if (value.endsWith("[[")) {
				this.openFileSuggest();
			}
		});

		// Task list
		this.todoListEl = todoContainer.createEl("div", {
			cls: "pomodoro-todo-list",
		});

		this.renderTasks();
	}

	/**
	 * Renders all tasks in the list
	 */
	private renderTasks(): void {
		if (!this.todoListEl) return;
		this.todoListEl.empty();

		if (this.tasks.length === 0) {
			this.todoListEl.createEl("div", {
				cls: "pomodoro-todo-empty",
				text: "No tasks yet. Click + to add one.",
			});
			return;
		}

		// Sort: incomplete first, then completed
		const sortedTasks = this.getSortedTasks();

		// Find the first incomplete task index for highlighting
		const firstIncompleteIndex = sortedTasks.findIndex(
			(t) => !t.completed
		);

		sortedTasks.forEach((task, index) => {
			const taskEl = this.createTaskElement(
				task,
				index === firstIncompleteIndex
			);
			this.todoListEl!.appendChild(taskEl);
		});
	}

	/**
	 * Gets tasks sorted: incomplete first (by order), then completed (by order)
	 */
	private getSortedTasks(): TodoTask[] {
		const incomplete = this.tasks
			.filter((t) => !t.completed)
			.sort((a, b) => a.order - b.order);
		const completed = this.tasks
			.filter((t) => t.completed)
			.sort((a, b) => a.order - b.order);
		return [...incomplete, ...completed];
	}

	/**
	 * Creates a single task element
	 */
	private createTaskElement(
		task: TodoTask,
		isCurrentTask: boolean
	): HTMLElement {
		const taskEl = document.createElement("div");
		taskEl.className =
			"pomodoro-todo-task" +
			(task.completed ? " completed" : "") +
			(isCurrentTask ? " current" : "");
		taskEl.setAttribute("data-task-id", task.id);
		taskEl.draggable = true;

		// Drag handle
		const dragHandle = document.createElement("span");
		dragHandle.className = "pomodoro-todo-drag-handle";
		dragHandle.textContent = "⋮⋮";
		taskEl.appendChild(dragHandle);

		// Checkbox
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.className = "pomodoro-todo-checkbox";
		checkbox.checked = task.completed;
		checkbox.addEventListener("change", () =>
			this.toggleTaskCompletion(task.id)
		);
		taskEl.appendChild(checkbox);

		// Task text (with wiki-link rendering)
		const textContainer = document.createElement("span");
		textContainer.className = "pomodoro-todo-text";
		this.renderTaskText(textContainer, task.text);
		// Double click to edit
		textContainer.addEventListener("dblclick", () => {
			this.startEditTask(task.id, textContainer, task.text);
		});
		taskEl.appendChild(textContainer);

		// Delete button
		const deleteBtn = document.createElement("button");
		deleteBtn.className = "pomodoro-todo-delete-btn";
		deleteBtn.textContent = "×";
		deleteBtn.addEventListener("click", () => this.deleteTask(task.id));
		taskEl.appendChild(deleteBtn);

		// Drag and drop event handlers
		this.attachDragHandlers(taskEl, task.id);

		return taskEl;
	}

	/**
	 * Renders task text with wiki-links as clickable elements
	 */
	private renderTaskText(container: HTMLElement, text: string): void {
		const parsed = parseWikiLinks(text);

		for (const segment of parsed.segments) {
			if (segment.type === "text") {
				container.appendChild(document.createTextNode(segment.content));
			} else {
				const linkEl = container.createEl("a", {
					cls: "pomodoro-todo-wikilink",
					text: segment.displayText || segment.path,
				});
				linkEl.addEventListener("click", (e) => {
					e.preventDefault();
					this.openWikiLink(segment.path);
				});
			}
		}
	}

	/**
	 * Opens a wiki-link in Obsidian
	 */
	private async openWikiLink(path: string): Promise<void> {
		const file = this.app.metadataCache.getFirstLinkpathDest(path, "");
		if (file) {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);
		} else {
			new Notice(`Note "${path}" not found`);
		}
	}

	/**
	 * Shows the task input field
	 */
	private showTodoInput(): void {
		if (this.todoInputContainer && this.todoInputEl) {
			this.todoInputContainer.removeClass("hidden");
			this.todoInputEl.focus();
		}
	}

	/**
	 * Hides the task input field
	 */
	private hideTodoInput(): void {
		if (this.todoInputContainer && this.todoInputEl) {
			this.todoInputContainer.addClass("hidden");
			this.todoInputEl.value = "";
		}
	}

	/**
	 * Adds a new task
	 */
	private addTask(text: string): void {
		const trimmedText = text.trim();
		if (!trimmedText) return;

		const newTask: TodoTask = {
			id: this.todoStorage.generateId(),
			text: trimmedText,
			completed: false,
			createdAt: Date.now(),
			order: this.tasks.length,
		};

		this.tasks.push(newTask);
		this.saveTodoState();
		this.renderTasks();
		this.hideTodoInput();
	}

	/**
	 * Deletes a task
	 */
	private deleteTask(taskId: string): void {
		this.tasks = this.tasks.filter((t) => t.id !== taskId);
		this.recalculateOrder();
		this.saveTodoState();
		this.renderTasks();
	}

	/**
	 * Toggles task completion status
	 */
	private toggleTaskCompletion(taskId: string): void {
		const task = this.tasks.find((t) => t.id === taskId);
		if (task) {
			task.completed = !task.completed;
			this.saveTodoState();
			this.renderTasks();
		}
	}

	/**
	 * Recalculates order values after deletion/reordering
	 */
	private recalculateOrder(): void {
		const sorted = this.getSortedTasks();
		sorted.forEach((task, index) => {
			task.order = index;
		});
	}

	/**
	 * Saves todo state to localStorage
	 */
	private saveTodoState(): void {
		this.todoStorage.save(this.tasks);
	}

	/**
	 * Attaches drag and drop handlers to a task element
	 */
	private attachDragHandlers(taskEl: HTMLElement, taskId: string): void {
		taskEl.addEventListener("dragstart", (e: DragEvent) => {
			this.draggedTaskId = taskId;
			taskEl.addClass("dragging");
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = "move";
			}
		});

		taskEl.addEventListener("dragend", () => {
			taskEl.removeClass("dragging");
			this.draggedTaskId = null;
			this.todoListEl
				?.querySelectorAll(".pomodoro-todo-task")
				.forEach((el) => {
					el.removeClass("drag-over");
				});
		});

		taskEl.addEventListener("dragover", (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = "move";
			}

			if (this.draggedTaskId && this.draggedTaskId !== taskId) {
				taskEl.addClass("drag-over");
			}
		});

		taskEl.addEventListener("dragleave", () => {
			taskEl.removeClass("drag-over");
		});

		taskEl.addEventListener("drop", (e: DragEvent) => {
			e.preventDefault();

			if (this.draggedTaskId && this.draggedTaskId !== taskId) {
				this.reorderTasks(this.draggedTaskId, taskId);
			}

			taskEl.removeClass("drag-over");
		});
	}

	/**
	 * Reorders tasks after drag and drop
	 */
	private reorderTasks(draggedId: string, targetId: string): void {
		// Use sorted array indices to match visual order
		const sortedTasks = this.getSortedTasks();
		const draggedIndex = sortedTasks.findIndex((t) => t.id === draggedId);
		const targetIndex = sortedTasks.findIndex((t) => t.id === targetId);

		if (draggedIndex === -1 || targetIndex === -1) return;

		// Reorder in sorted array
		const [draggedTask] = sortedTasks.splice(draggedIndex, 1);
		if (!draggedTask) return;

		sortedTasks.splice(targetIndex, 0, draggedTask);

		// Update order field for all tasks
		sortedTasks.forEach((task, index) => {
			task.order = index;
		});

		// Re-sort this.tasks to match new order
		this.tasks.sort((a, b) => a.order - b.order);

		this.saveTodoState();
		this.renderTasks();
	}

	/**
	 * Opens the file suggest modal for wiki-link autocomplete
	 */
	private openFileSuggest(): void {
		if (!this.todoInputEl) return;

		const modal = new FileSuggestModal(this.app, (file) => {
			// Replace [[ with [[filename|filename]]
			const currentValue = this.todoInputEl?.value ?? "";
			const newValue = currentValue.replace(
				/\[\[$/,
				`[[${file.basename}|${file.basename}]] `
			);
			if (this.todoInputEl) {
				this.todoInputEl.value = newValue;
				this.todoInputEl.focus();
			}
		});

		modal.open();
	}

	// ==================== Edit Task Methods ====================

	/**
	 * Starts editing a task inline
	 */
	private startEditTask(
		taskId: string,
		container: HTMLElement,
		currentText: string
	): void {
		this.isEditingTask = true;

		// Clear container
		container.empty();

		// Create input with current text
		const input = container.createEl("input", {
			cls: "pomodoro-todo-edit-input",
			attr: {
				type: "text",
				value: currentText,
			},
		});

		// Wiki-link autocomplete for edit input
		input.addEventListener("input", () => {
			if (input.value.endsWith("[[")) {
				this.openFileSuggestForEdit(input);
			}
		});

		// Focus and select text
		input.focus();
		input.select();

		// Save on Enter, cancel on Escape
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				this.isEditingTask = false;
				this.saveTaskEdit(taskId, input.value);
			} else if (e.key === "Escape") {
				this.isEditingTask = false;
				this.renderTasks();
			}
		});

		// Save on blur (only if not opening modal)
		input.addEventListener("blur", () => {
			if (this.isEditingTask) {
				this.saveTaskEdit(taskId, input.value);
			}
		});
	}

	/**
	 * Saves the edited task text
	 */
	private saveTaskEdit(taskId: string, newText: string): void {
		const trimmedText = newText.trim();

		if (trimmedText) {
			const task = this.tasks.find((t) => t.id === taskId);
			if (task && task.text !== trimmedText) {
				task.text = trimmedText;
				this.saveTodoState();
			}
		}

		this.renderTasks();
	}

	/**
	 * Opens file suggest modal for edit input
	 */
	private openFileSuggestForEdit(input: HTMLInputElement): void {
		// Prevent blur from saving while modal is open
		this.isEditingTask = false;

		const modal = new FileSuggestModal(this.app, (file) => {
			const currentValue = input.value;
			const newValue = currentValue.replace(
				/\[\[$/,
				`[[${file.basename}|${file.basename}]] `
			);
			input.value = newValue;
			input.focus();
			// Re-enable blur save after selection
			this.isEditingTask = true;
		});

		modal.onClose = () => {
			// Re-enable blur save when modal closes
			this.isEditingTask = true;
		};

		modal.open();
	}
}
