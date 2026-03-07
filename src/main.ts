import { Plugin, WorkspaceLeaf } from "obsidian";
import {
	DEFAULT_SETTINGS,
	PomodoroSettings,
	PomodoroSettingTab,
} from "./settings";
import { PomodoroView, VIEW_TYPE_POMODORO } from "./pomodoroView";
import type { TodoTask } from "./types";

interface PomodoroPluginData {
	settings: PomodoroSettings;
	tasks: TodoTask[];
}

const DEFAULT_DATA: PomodoroPluginData = {
	settings: DEFAULT_SETTINGS,
	tasks: [],
};

export default class PomodoroTimerPlugin extends Plugin {
	settings: PomodoroSettings;
	tasks: TodoTask[] = [];

	async onload() {
		await this.loadPluginData();
		await this.migrateFromLocalStorage();

		// Register the custom view
		this.registerView(
			VIEW_TYPE_POMODORO,
			(leaf) => new PomodoroView(leaf, this),
		);

		// Add ribbon icon to open timer
		this.addRibbonIcon("clock", "Open pomodoro timer", async () => {
			await this.activateView();
		});

		// Add command to open timer
		this.addCommand({
			id: "open-pomodoro-timer",
			name: "Open pomodoro timer",
			callback: () => this.activateView(),
		});

		// Add settings tab
		this.addSettingTab(new PomodoroSettingTab(this.app, this));
	}

	private async activateView() {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf;

		const existing = workspace.getLeavesOfType(VIEW_TYPE_POMODORO);
		if (existing.length > 0) {
			leaf = existing[0]!;
		} else {
			leaf = workspace.getLeaf("tab")!;
		}

		await leaf.setViewState({ type: VIEW_TYPE_POMODORO, active: true });
		await workspace.revealLeaf(leaf);
	}

	onunload() {
		// Cleanup is handled by Obsidian's plugin system
	}

	private async loadPluginData() {
		const data = (await this.loadData()) as Partial<PomodoroPluginData>;
		this.settings = Object.assign({}, DEFAULT_DATA.settings, data?.settings);
		this.tasks = data?.tasks || [];
	}

	public async savePluginData() {
		await this.saveData({
			settings: this.settings,
			tasks: this.tasks,
		});
	}

	public async saveSettings() {
		await this.savePluginData();
	}

	/**
	 * Migrates existing tasks from localStorage to data.json (one-time migration)
	 */
	private async migrateFromLocalStorage() {
		// Only migrate if we have no tasks and localStorage has data
		if (this.tasks.length > 0) return;

		try {
			const oldData = this.app.loadLocalStorage(
				"pomodoro-todo-list",
			) as unknown;
			if (oldData && typeof oldData === "object" && oldData !== null) {
				const parsed = oldData as { tasks?: TodoTask[] };
				if (Array.isArray(parsed.tasks) && parsed.tasks.length > 0) {
					this.tasks = parsed.tasks;
					await this.savePluginData();
					// Clear old localStorage data
					this.app.saveLocalStorage("pomodoro-todo-list", null);
					console.debug(
						`[Pomodoro] Migrated ${this.tasks.length} tasks from localStorage to data.json`,
					);
				}
			}
		} catch (e) {
			console.warn("[Pomodoro] Failed to migrate from localStorage:", e);
		}
	}
}
