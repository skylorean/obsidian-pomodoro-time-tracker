import type { App } from "obsidian";
import type { TodoTask, TodoListState, StorageResult } from "./types";

/**
 * Storage key for todo list state in localStorage
 */
const TODO_STORAGE_KEY = "pomodoro-todo-list";

/**
 * Schema version for future migrations
 */
const TODO_SCHEMA_VERSION = 2;

/**
 * Maximum acceptable age for saved state (30 days in milliseconds)
 */
const MAX_TODO_STATE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Manages persistence of todo list state using Obsidian's localStorage API.
 * Provides save, restore, and clear operations with proper error handling.
 */
export class TodoStorage {
	constructor(private readonly app: App) {}

	/**
	 * Saves the current todo list state to localStorage.
	 * @param tasks - The array of tasks to persist
	 * @returns StorageResult indicating success or failure
	 */
	save(tasks: TodoTask[]): StorageResult<void> {
		try {
			const state: TodoListState = {
				tasks,
				savedAt: Date.now(),
				version: TODO_SCHEMA_VERSION,
			};
			this.app.saveLocalStorage(TODO_STORAGE_KEY, state);
			return { success: true };
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			console.error("[TodoStorage] Failed to save state:", errorMessage);
			return { success: false, error: errorMessage };
		}
	}

	/**
	 * Restores todo list state from localStorage.
	 * @returns StorageResult containing the restored tasks array
	 */
	restore(): StorageResult<TodoTask[]> {
		try {
			const rawData = this.app.loadLocalStorage(TODO_STORAGE_KEY) as unknown;

			// No saved state - first time use
			if (rawData === null) {
				return { success: true, data: [] };
			}

			// Validate the loaded data
			if (!this.isValidState(rawData)) {
				console.warn(
					"[TodoStorage] Invalid state structure, starting fresh"
				);
				return { success: true, data: [] };
			}

			const state = rawData;

			// Check if state is too old
			if (this.isStateStale(state.savedAt)) {
				this.clear();
				return { success: true, data: [] };
			}

			// Handle schema migrations if needed
			const migratedTasks = this.migrateIfNeeded(state);

			// Sort by order field
			const sortedTasks = [...migratedTasks].sort(
				(a, b) => a.order - b.order
			);

			return { success: true, data: sortedTasks };
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			console.error("[TodoStorage] Failed to restore state:", errorMessage);
			return { success: false, error: errorMessage, data: [] };
		}
	}

	/**
	 * Clears the saved todo list state from localStorage.
	 */
	clear(): void {
		try {
			this.app.saveLocalStorage(TODO_STORAGE_KEY, null);
		} catch (error) {
			console.error("[TodoStorage] Failed to clear state:", error);
		}
	}

	/**
	 * Generates a unique ID for new tasks.
	 */
	generateId(): string {
		return `todo-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
	}

	/**
	 * Type guard to validate TodoListState structure
	 */
	private isValidState(value: unknown): value is TodoListState {
		if (typeof value !== "object" || value === null) {
			return false;
		}

		const obj = value as Record<string, unknown>;

		return (
			Array.isArray(obj.tasks) &&
			typeof obj.savedAt === "number" &&
			typeof obj.version === "number" &&
			obj.savedAt > 0
		);
	}

	/**
	 * Checks if saved state is older than the maximum acceptable age
	 */
	private isStateStale(savedAt: number): boolean {
		return Date.now() - savedAt > MAX_TODO_STATE_AGE_MS;
	}

	/**
	 * Handles schema migrations if needed
	 */
	private migrateIfNeeded(state: TodoListState): TodoTask[] {
		// Migration from v1 to v2: add description field
		if (state.version < 2) {
			for (const task of state.tasks) {
				if (task.description === undefined) {
					task.description = "";
				}
			}
		}
		return state.tasks;
	}
}
