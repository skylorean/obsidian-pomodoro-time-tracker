import { Plugin, WorkspaceLeaf } from "obsidian";
import {
	DEFAULT_SETTINGS,
	PomodoroSettings,
	PomodoroSettingTab,
} from "./settings";
import { PomodoroView, VIEW_TYPE_POMODORO } from "./pomodoroView";

export default class PomodoroTimerPlugin extends Plugin {
	settings: PomodoroSettings;

	async onload() {
		await this.loadSettings();

		// Register the custom view
		this.registerView(
			VIEW_TYPE_POMODORO,
			(leaf) => new PomodoroView(leaf, this.settings.workDuration, this.settings.breakDuration, this.settings),
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

	private async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<PomodoroSettings>,
		);
	}

	public async saveSettings() {
		await this.saveData(this.settings);
	}
}
