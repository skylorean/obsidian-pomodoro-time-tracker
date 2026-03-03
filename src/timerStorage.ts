import type { App } from "obsidian";
import type { TimerState, RestoreResult, StorageResult } from "./types";

/**
 * Storage key for timer state in localStorage
 */
const STORAGE_KEY = "pomodoro-timer-state";

/**
 * Maximum acceptable age for saved state (24 hours in milliseconds)
 * State older than this is considered stale and will be discarded
 */
const MAX_STATE_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Manages persistence of timer state using Obsidian's localStorage API.
 * Provides save, restore, and clear operations with proper error handling.
 */
export class TimerStorage {
	constructor(private readonly app: App) {}

	/**
	 * Saves the current timer state to localStorage.
	 * Should be called on each tick and on pause.
	 *
	 * @param state - The timer state to persist
	 * @returns StorageResult indicating success or failure
	 */
	save(state: TimerState): StorageResult<void> {
		try {
			const stateWithTimestamp: TimerState = {
				...state,
				savedAt: Date.now(),
			};

			this.app.saveLocalStorage(STORAGE_KEY, stateWithTimestamp);

			return { success: true };
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			console.error("[TimerStorage] Failed to save state:", errorMessage);
			return { success: false, error: errorMessage };
		}
	}

	/**
	 * Restores timer state from localStorage.
	 * Handles elapsed time calculation for running timers.
	 *
	 * @returns RestoreResult containing the restored state or error
	 */
	restore(): RestoreResult {
		try {
			const rawData = this.app.loadLocalStorage(STORAGE_KEY) as unknown;

			// No saved state - first time use
			if (rawData === null) {
				return {
					success: false,
					error: "No saved state found",
				};
			}

			// Validate the loaded data
			if (!this.isValidState(rawData)) {
				return {
					success: false,
					error: "Invalid state structure",
				};
			}

			const state = this.normalizeState(rawData);
			const elapsedSeconds = this.calculateElapsedSeconds(state.savedAt);

			// Check if state is too old
			if (this.isStateStale(state.savedAt)) {
				this.clear();
				return {
					success: false,
					error: "Saved state is too old",
					elapsedSeconds,
				};
			}

			// If timer was running, adjust for elapsed time
			if (state.isRunning) {
				const adjustedSeconds = Math.max(
					0,
					state.timerSeconds - elapsedSeconds,
				);

				// Timer expired while away
				if (adjustedSeconds === 0) {
					this.clear();
					return {
						success: false,
						error: "Timer expired while away",
						elapsedSeconds,
					};
				}

				return {
					success: true,
					state: this.normalizeState({
						...state,
						timerSeconds: adjustedSeconds,
						isRunning: false, // Don't auto-start; user must resume
					}),
					elapsedSeconds,
				};
			}

			// Timer was paused - restore as-is
			return {
				success: true,
				state: this.normalizeState(state),
				elapsedSeconds: 0,
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			console.error(
				"[TimerStorage] Failed to restore state:",
				errorMessage,
			);
			return { success: false, error: errorMessage };
		}
	}

	/**
	 * Clears the saved timer state from localStorage.
	 * Should be called when timer completes or is reset.
	 */
	clear(): void {
		try {
			this.app.saveLocalStorage(STORAGE_KEY, null);
		} catch (error) {
			console.error("[TimerStorage] Failed to clear state:", error);
		}
	}

	/**
	 * Type guard to validate TimerState structure (mode is optional for backward compatibility)
	 */
	private isValidState(value: unknown): value is Partial<TimerState> & { timerSeconds: number; initialSeconds: number; isRunning: boolean; savedAt: number } {
		if (typeof value !== "object" || value === null) {
			return false;
		}

		const obj = value as Record<string, unknown>;

		return (
			typeof obj.timerSeconds === "number" &&
			typeof obj.initialSeconds === "number" &&
			typeof obj.isRunning === "boolean" &&
			typeof obj.savedAt === "number" &&
			obj.timerSeconds >= 0 &&
			obj.initialSeconds > 0 &&
			obj.savedAt > 0
		);
	}

	/**
	 * Normalizes state by adding default mode if missing (backward compatibility)
	 */
	private normalizeState(state: Partial<TimerState> & { timerSeconds: number; initialSeconds: number; isRunning: boolean; savedAt: number }): TimerState {
		return {
			timerSeconds: state.timerSeconds,
			initialSeconds: state.initialSeconds,
			isRunning: state.isRunning,
			savedAt: state.savedAt,
			mode: state.mode ?? 'work',
		};
	}

	/**
	 * Creates a normalized state with updated values
	 */
	private createNormalizedState(base: TimerState, updates: Partial<TimerState>): TimerState {
		return {
			...base,
			...updates,
		};
	}

	/**
	 * Calculates seconds elapsed since the given timestamp
	 */
	private calculateElapsedSeconds(savedAt: number): number {
		const now = Date.now();
		const elapsedMs = now - savedAt;
		return Math.floor(elapsedMs / 1000);
	}

	/**
	 * Checks if saved state is older than the maximum acceptable age
	 */
	private isStateStale(savedAt: number): boolean {
		const now = Date.now();
		return now - savedAt > MAX_STATE_AGE_MS;
	}
}
