import { App, PluginSettingTab, Setting } from "obsidian";
import PomodoroTimerPlugin from "./main";

export interface PomodoroSettings {
	workDuration: number;
	breakDuration: number;
	longBreakDuration: number;
}

export const DEFAULT_SETTINGS: PomodoroSettings = {
	workDuration: 25,
	breakDuration: 5,
	longBreakDuration: 15,
};

export class PomodoroSettingTab extends PluginSettingTab {
	plugin: PomodoroTimerPlugin;

	constructor(app: App, plugin: PomodoroTimerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Pomodoro timer settings" });

		new Setting(containerEl)
			.setName("Work duration")
			.setDesc("Duration of work session in minutes")
			.addText((text) =>
				text
					.setPlaceholder("25")
					.setValue(this.plugin.settings.workDuration.toString())
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.workDuration = num;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Short break duration")
			.setDesc("Duration of short break in minutes")
			.addText((text) =>
				text
					.setPlaceholder("5")
					.setValue(this.plugin.settings.breakDuration.toString())
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.breakDuration = num;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Long break duration")
			.setDesc("Duration of long break in minutes")
			.addText((text) =>
				text
					.setPlaceholder("15")
					.setValue(this.plugin.settings.longBreakDuration.toString())
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.longBreakDuration = num;
							await this.plugin.saveSettings();
						}
					}),
			);
	}
}
