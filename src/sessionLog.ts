import { Notice } from "obsidian";
import type { TimerMode } from "./types";
import type PomodoroTimerPlugin from "./main";

/**
 * A single logged work session.
 */
export interface WorkSessionEntry {
	/** Unique id — lets readers dedupe entries after a git merge */
	id: string;
	/** Local calendar date of the session END, YYYY-MM-DD */
	date: string;
	/** Local time of the session end, HH:mm */
	end: string;
	/** Actual running seconds (paused time excluded) */
	seconds: number;
	/** True when the timer reached 00:00; false for early-ended sessions */
	full: boolean;
}

/**
 * Early-ended sessions shorter than this are noise (started by accident,
 * stopped right away) and are not logged. Completed sessions always log:
 * the user configured that duration deliberately.
 */
const MIN_EARLY_END_SECONDS = 60;

/** Hard cap behind day-based retention, as a runaway backstop. */
const MAX_SESSION_ENTRIES = 1000;

/**
 * Appends completed and early-ended WORK sessions to sessions.json next
 * to the plugin (JSONL: one JSON object per line). A separate file rather
 * than data.json on purpose: the log is append-only and git merges
 * line-based files cleanly, while data.json (settings + tasks) wants
 * "pick one side" semantics. Readers dedupe by id, so a union merge that
 * keeps both sides is always safe.
 *
 * Sessions that expire while Obsidian is closed are NOT logged — the user
 * was not at the machine, so counting that time as focus would lie
 * (TimerStorage.restore() reports them as a failure and never reaches
 * the completion path anyway).
 */
export class SessionLog {
	/**
	 * True when the current session's time is already in the log.
	 * Set by recordCompletion, cleared by recordEarlyEnd — which always
	 * runs later, because after completion the only way out of the
	 * finished timer is switchMode(). Pause/resume never touches it.
	 */
	private accounted = false;

	constructor(private readonly plugin: PomodoroTimerPlugin) {}

	/** Work timer reached 00:00. Break sessions are ignored. */
	recordCompletion(mode: TimerMode, initialSeconds: number): void {
		if (!this.plugin.settings.logSessions) return;
		if (mode !== "work") return;
		if (this.accounted) return;
		if (initialSeconds <= 0) return;

		this.accounted = true;
		void this.append(initialSeconds, true);
	}

	/**
	 * The user cut a session short (End session or a mode toggle).
	 * MUST be called before timerSeconds/initialSeconds are reset.
	 */
	recordEarlyEnd(mode: TimerMode, elapsedSeconds: number): void {
		const alreadyLogged = this.accounted;
		// A new session starts either way — reset unconditionally
		this.accounted = false;

		if (alreadyLogged) return;
		if (!this.plugin.settings.logSessions) return;
		if (mode !== "work") return;
		if (elapsedSeconds < MIN_EARLY_END_SECONDS) return;

		void this.append(Math.round(elapsedSeconds), false);
	}

	// ==================== Persistence ====================

	private get filePath(): string {
		const dir =
			this.plugin.manifest.dir ??
			`${this.plugin.app.vault.configDir}/plugins/${this.plugin.manifest.id}`;
		return `${dir}/sessions.json`;
	}

	private async append(seconds: number, full: boolean): Promise<void> {
		try {
			const now = new Date();
			const entry: WorkSessionEntry = {
				id:
					now.getTime().toString(36) +
					"-" +
					Math.random().toString(36).slice(2, 6),
				date: localDate(now),
				end: localTime(now),
				seconds,
				full,
			};

			const existing = await this.readEntries();
			if (existing === null) {
				// The file exists but is unreadable (e.g. a botched merge).
				// Never overwrite it — that would destroy the history.
				new Notice(
					"Pomodoro: sessions.json could not be read, the session was not logged. Fix the file to resume logging.",
				);
				return;
			}

			existing.push(entry);
			const kept = this.prune(existing, now);

			const adapter = this.plugin.app.vault.adapter;
			await adapter.write(
				this.filePath,
				kept.map((e) => JSON.stringify(e)).join("\n") + "\n",
			);
		} catch (e) {
			console.error("[SessionLog] Failed to persist session:", e);
		}
	}

	/**
	 * Reads and sanitizes the log. Returns [] when the file does not
	 * exist, null when it exists but cannot be read at all.
	 * Individual broken lines are skipped: after a hand-resolved git
	 * merge this file is user-edited text.
	 */
	private async readEntries(): Promise<WorkSessionEntry[] | null> {
		const adapter = this.plugin.app.vault.adapter;
		let raw: string;
		try {
			if (!(await adapter.exists(this.filePath))) return [];
			raw = await adapter.read(this.filePath);
		} catch (e) {
			console.error("[SessionLog] Failed to read sessions.json:", e);
			return null;
		}

		const out: WorkSessionEntry[] = [];
		const seen = new Set<string>();
		for (const line of raw.split(/\r?\n/)) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			let parsed: unknown;
			try {
				parsed = JSON.parse(trimmed);
			} catch {
				continue;
			}
			const entry = sanitizeEntry(parsed);
			if (!entry) continue;
			if (seen.has(entry.id)) continue;
			seen.add(entry.id);
			out.push(entry);
		}
		return out;
	}

	/**
	 * Drops entries older than the retention window. Runs on append only:
	 * pruning on load would rewrite the file merely from opening Obsidian,
	 * dirtying git on a machine that isn't even being used.
	 */
	private prune(entries: WorkSessionEntry[], now: Date): WorkSessionEntry[] {
		const days = this.plugin.settings.sessionRetentionDays;
		const cutoffDate = new Date(now);
		cutoffDate.setDate(cutoffDate.getDate() - days);
		const cutoff = localDate(cutoffDate);

		// Lexicographic compare is valid for YYYY-MM-DD
		const kept = entries.filter((e) => e.date >= cutoff);
		kept.sort((a, b) =>
			a.date === b.date ? a.end.localeCompare(b.end) : a.date.localeCompare(b.date),
		);
		return kept.length > MAX_SESSION_ENTRIES
			? kept.slice(kept.length - MAX_SESSION_ENTRIES)
			: kept;
	}
}

// ==================== Helpers ====================

const pad = (n: number): string => String(n).padStart(2, "0");

/** Local calendar date — never toISOString(), which is UTC and shifts the day. */
const localDate = (d: Date): string =>
	`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const localTime = (d: Date): string =>
	`${pad(d.getHours())}:${pad(d.getMinutes())}`;

function sanitizeEntry(raw: unknown): WorkSessionEntry | null {
	if (typeof raw !== "object" || raw === null) return null;
	const obj = raw as Record<string, unknown>;

	const date = typeof obj.date === "string" ? obj.date : "";
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

	const seconds = Number(obj.seconds);
	if (!Number.isFinite(seconds) || seconds <= 0) return null;

	const end = typeof obj.end === "string" && /^\d{2}:\d{2}$/.test(obj.end)
		? obj.end
		: "00:00";
	const id = typeof obj.id === "string" && obj.id
		? obj.id
		: `${date}|${end}|${seconds}`;

	return { id, date, end, seconds: Math.round(seconds), full: obj.full === true };
}
