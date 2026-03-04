import { FuzzySuggestModal, TFile, App } from "obsidian";

/**
 * Modal for selecting a file from the vault with fuzzy search.
 * Used for wiki-link autocomplete in todo input.
 */
export class FileSuggestModal extends FuzzySuggestModal<TFile> {
	private onSelect: (file: TFile) => void;

	constructor(app: App, onSelect: (file: TFile) => void) {
		super(app);
		this.onSelect = onSelect;
		this.setPlaceholder("Type to search files...");
		this.setInstructions([
			{ command: "↑↓", purpose: "navigate" },
			{ command: "↵", purpose: "select" },
			{ command: "esc", purpose: "close" },
		]);
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(file: TFile): string {
		return file.basename;
	}

	onChooseItem(file: TFile, _evt: MouseEvent | KeyboardEvent): void {
		this.onSelect(file);
	}
}
