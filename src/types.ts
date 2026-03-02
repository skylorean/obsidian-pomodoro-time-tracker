/**
 * Represents the current state of the timer for persistence purposes
 */
export interface TimerState {
	/** Remaining time in seconds */
	timerSeconds: number;
	/** Total duration when timer started, in seconds */
	initialSeconds: number;
	/** Whether the timer was running when saved */
	isRunning: boolean;
	/** Unix timestamp (milliseconds) when this state was saved */
	savedAt: number;
}

/**
 * Result of attempting to restore timer state
 */
export interface RestoreResult {
	/** Whether restoration was successful */
	success: boolean;
	/** The restored state, if successful */
	state?: TimerState;
	/** Number of seconds that elapsed since last save */
	elapsedSeconds?: number;
	/** Reason for failure, if unsuccessful */
	error?: string;
}

/**
 * Result type for storage operations
 */
export interface StorageResult<T> {
	success: boolean;
	data?: T;
	error?: string;
}
