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

/**
 * Represents a single todo task
 */
export interface TodoTask {
	/** Unique identifier for the task */
	id: string;
	/** Task text content (may contain wiki-links like [[filename]]) */
	text: string;
	/** Whether the task is completed */
	completed: boolean;
	/** Unix timestamp when task was created */
	createdAt: number;
	/** Order index for sorting (lower = higher in list) */
	order: number;
}

/**
 * State for the todo list persistence
 */
export interface TodoListState {
	/** Array of all tasks */
	tasks: TodoTask[];
	/** Unix timestamp when state was last saved */
	savedAt: number;
	/** Schema version for future migrations */
	version: number;
}

/**
 * Text segment in parsed task text
 */
export type TextSegment = { type: 'text'; content: string };

/**
 * Wiki-link segment in parsed task text
 */
export type WikiLinkSegment = { type: 'wikilink'; path: string; displayText?: string };

/**
 * Result of parsing task text for wiki-links
 */
export interface ParsedTaskText {
	/** Array of text and wiki-link segments */
	segments: Array<TextSegment | WikiLinkSegment>;
	/** Whether the task contains any wiki-links */
	hasWikiLinks: boolean;
}
