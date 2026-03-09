import { App, PluginSettingTab, Setting } from "obsidian";
import PomodoroTimerPlugin from "./main";

export type SoundChoice = 'alarm' | 'bell' | 'chime' | 'digital' | 'custom';

export interface PomodoroSettings {
	workDuration: number;
	breakDuration: number;
	soundEnabled: boolean;
	soundVolume: number; // 0-100
	soundChoice: SoundChoice;
	customSoundPath: string;
	soundLoop: boolean;
	workProgressColor: string; // hex or empty for theme default
	breakProgressColor: string; // hex or empty for theme default
}

export const DEFAULT_SETTINGS: PomodoroSettings = {
	workDuration: 25,
	breakDuration: 5,
	soundEnabled: true,
	soundVolume: 70,
	soundChoice: 'alarm',
	customSoundPath: '',
	soundLoop: true,
	workProgressColor: '',
	breakProgressColor: '',
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

		// ==================== Timer Settings ====================
		new Setting(containerEl).setName("Timer").setHeading();

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
			.setName("Break duration")
			.setDesc("Duration of break in minutes")
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

		// ==================== Sound Settings ====================
		new Setting(containerEl).setName("Sound").setHeading();

		new Setting(containerEl)
			.setName("Sound notification")
			.setDesc("Play sound when timer completes")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.soundEnabled)
					.onChange(async (value) => {
						this.plugin.settings.soundEnabled = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Sound volume")
			.setDesc("Volume of the alarm sound (0-100)")
			.addSlider((slider) =>
				slider
					.setLimits(0, 100, 5)
					.setValue(this.plugin.settings.soundVolume)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.soundVolume = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Alarm sound")
			.setDesc("Choose which sound to play when the timer ends")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("alarm", "Alarm")
					.addOption("bell", "Bell")
					.addOption("chime", "Chime")
					.addOption("digital", "Digital")
					.addOption("custom", "Custom file")
					.setValue(this.plugin.settings.soundChoice)
					.onChange(async (value) => {
						this.plugin.settings.soundChoice = value as SoundChoice;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		if (this.plugin.settings.soundChoice === 'custom') {
			new Setting(containerEl)
				.setName("Custom sound path")
				.setDesc("Vault-relative path to a sound file (e.g. sounds/alarm.mp3)")
				.addText((text) =>
					text
						.setPlaceholder("path/to/sound.mp3")
						.setValue(this.plugin.settings.customSoundPath)
						.onChange(async (value) => {
							this.plugin.settings.customSoundPath = value;
							await this.plugin.saveSettings();
						}),
				);
		}

		new Setting(containerEl)
			.setName("Loop sound")
			.setDesc("Loop the alarm sound until manually stopped")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.soundLoop)
					.onChange(async (value) => {
						this.plugin.settings.soundLoop = value;
						await this.plugin.saveSettings();
					}),
			);

		// ==================== Appearance Settings ====================
		new Setting(containerEl).setName("Appearance").setHeading();

		new Setting(containerEl)
			.setName("Work progress color")
			.setDesc("Custom color for the work progress arc (leave empty for theme default)")
			.addText((text) =>
				text
					.setPlaceholder("#e.g. #ff9800")
					.setValue(this.plugin.settings.workProgressColor)
					.onChange(async (value) => {
						const trimmed = value.trim();
						if (trimmed === '' || /^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
							this.plugin.settings.workProgressColor = trimmed;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Break progress color")
			.setDesc("Custom color for the break progress arc (leave empty for theme default)")
			.addText((text) =>
				text
					.setPlaceholder("#e.g. #4caf50")
					.setValue(this.plugin.settings.breakProgressColor)
					.onChange(async (value) => {
						const trimmed = value.trim();
						if (trimmed === '' || /^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
							this.plugin.settings.breakProgressColor = trimmed;
							await this.plugin.saveSettings();
						}
					}),
			);
	}
}
