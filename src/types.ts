/**
 * Timer mode - work or break
 */
export type TimerMode = 'work' | 'break';

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
	/** Current timer mode */
	mode: TimerMode;
}

/**
 * Result of attempting to restore timer state (success case)
 */
export interface RestoreSuccess {
	/** Whether restoration was successful */
	success: true;
	/** The restored state */
	state: TimerState;
	/** Number of seconds that elapsed since last save */
	elapsedSeconds: number;
}

/**
 * Result of attempting to restore timer state (failure case)
 */
export interface RestoreFailure {
	/** Whether restoration was successful */
	success: false;
	/** Number of seconds that elapsed since last save */
	elapsedSeconds?: number;
	/** Reason for failure */
	error?: string;
}

/**
 * Result of attempting to restore timer state
 */
export type RestoreResult = RestoreSuccess | RestoreFailure;

/**
 * Result type for storage operations
 */
export interface StorageResult<T> {
	success: boolean;
	data?: T;
	error?: string;
}
