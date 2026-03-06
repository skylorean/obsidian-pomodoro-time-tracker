import { App, Notice } from "obsidian";
import { FileSuggestModal } from "./FileSuggestModal";
import { parseWikiLinks } from "./wikiLinkParser";
import type { TodoTask } from "./types";
import type PomodoroTimerPlugin from "./main";

/**
 * Manages the todo list UI and functionality.
 * Encapsulates all task-related operations as a composable component.
 */
export class TodoListManager {
	// DOM element references
	private todoListEl: HTMLElement | null = null;
	private todoInputEl: HTMLInputElement | null = null;
	private todoInputContainer: HTMLElement | null = null;

	// Drag state
	private draggedTaskId: string | null = null;

	// Edit state
	private isEditingTask: boolean = false;

	// Task data reference (owned by plugin)
	private readonly tasks: TodoTask[];

	constructor(
		private readonly app: App,
		private readonly plugin: PomodoroTimerPlugin,
	) {
		// Reference to plugin's tasks array - no copy, we work directly
		this.tasks = plugin.tasks;
	}

	// ==================== Public API ====================

	/**
	 * Renders the todo list into a parent container.
	 * Call this once when the view is opened.
	 */
	renderInto(parentContainer: HTMLElement): void {
		const todoContainer = parentContainer.createEl("div", {
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
	 * Saves the current todo state to plugin data.
	 * Call this when the view is closed.
	 */
	save(): void {
		this.plugin.tasks = this.tasks;
		void this.plugin.savePluginData();
	}

	/**
	 * Cleans up resources when the view is closed.
	 * Clears DOM references.
	 */
	destroy(): void {
		this.todoListEl = null;
		this.todoInputEl = null;
		this.todoInputContainer = null;
		this.draggedTaskId = null;
	}

	// ==================== Rendering Methods ====================

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
		const firstIncompleteIndex = sortedTasks.findIndex((t) => !t.completed);

		sortedTasks.forEach((task, index) => {
			const taskEl = this.createTaskElement(
				task,
				index === firstIncompleteIndex,
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
		isCurrentTask: boolean,
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
			this.toggleTaskCompletion(task.id),
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

		// Description textarea with auto-resize
		const descriptionEl = document.createElement("textarea");
		descriptionEl.className = "pomodoro-todo-description";
		descriptionEl.placeholder = "Add description...";
		descriptionEl.value = task.description || "";

		// Initial height based on content
		setTimeout(() => {
			descriptionEl.setCssProps({ height: "auto" });
			descriptionEl.setCssProps({ height: descriptionEl.scrollHeight + "px" });
		}, 0);

		descriptionEl.addEventListener("input", () => {
			this.updateTaskDescription(task.id, descriptionEl.value);
			// Auto-resize on input
			descriptionEl.setCssProps({ height: "auto" });
			descriptionEl.setCssProps({ height: descriptionEl.scrollHeight + "px" });
		});
		taskEl.appendChild(descriptionEl);

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
					void this.openWikiLink(segment.path);
				});
			}
		}
	}

	// ==================== Task Operations ====================

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
			id: `todo-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
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
		const index = this.tasks.findIndex((t) => t.id === taskId);
		if (index !== -1) {
			this.tasks.splice(index, 1);
		}
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
	 * Updates task description
	 */
	private updateTaskDescription(taskId: string, description: string): void {
		const task = this.tasks.find((t) => t.id === taskId);
		if (task) {
			task.description = description;
			this.saveTodoState();
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
	 * Saves todo state to plugin data
	 */
	private saveTodoState(): void {
		this.plugin.tasks = this.tasks;
		void this.plugin.savePluginData();
	}

	// ==================== Drag & Drop ====================

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

	// ==================== Wiki-link Support ====================

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
	 * Opens the file suggest modal for wiki-link autocomplete
	 */
	private openFileSuggest(): void {
		if (!this.todoInputEl) return;

		const modal = new FileSuggestModal(this.app, (file) => {
			// Replace [[ with [[filename|filename]]
			const currentValue = this.todoInputEl?.value ?? "";
			const newValue = currentValue.replace(
				/\[\[$/,
				`[[${file.basename}|${file.basename}]] `,
			);
			if (this.todoInputEl) {
				this.todoInputEl.value = newValue;
				this.todoInputEl.focus();
			}
		});

		modal.open();
	}

	// ==================== Inline Editing ====================

	/**
	 * Starts editing a task inline
	 */
	private startEditTask(
		taskId: string,
		container: HTMLElement,
		currentText: string,
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
				`[[${file.basename}|${file.basename}]] `,
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
