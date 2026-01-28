/**
 * Modal for bulk task operations from Bases view items.
 * Supports two modes:
 *   - Generate: Create new task files linked to source items
 *   - Convert: Add task metadata to existing notes in-place
 */

import { App, Modal, Notice, Setting } from "obsidian";
import TaskNotesPlugin from "../main";
import { BasesDataItem } from "../bases/helpers";
import { BulkTaskEngine, BulkCreationOptions, BulkCreationResult } from "./bulk-task-engine";
import { BulkConvertEngine, BulkConvertOptions, BulkConvertResult } from "./bulk-convert-engine";

type BulkMode = "generate" | "convert";

export interface BulkTaskCreationModalOptions {
	/** Called when tasks are created or notes are converted successfully */
	onTasksCreated?: (result: BulkCreationResult | BulkConvertResult) => void;
}

/**
 * Modal for configuring and executing bulk task operations from Bases items.
 * Supports Generate (create new files) and Convert (modify existing notes) modes.
 */
export class BulkTaskCreationModal extends Modal {
	private items: BasesDataItem[];
	private plugin: TaskNotesPlugin;
	private modalOptions: BulkTaskCreationModalOptions;
	private engine: BulkTaskEngine;
	private convertEngine: BulkConvertEngine;
	private baseFilePath: string | undefined;

	// Mode state
	private mode: BulkMode;

	// Generate-mode options
	private skipExisting = true;
	private useParentAsProject = true;

	// Convert-mode options
	private skipAlreadyTasks = true;
	private applyDefaults = true;
	private linkToBase = true;

	// UI element references
	private optionsContainer: HTMLElement | null = null;
	private previewContainer: HTMLElement | null = null;
	private statusContainer: HTMLElement | null = null;
	private actionButton: HTMLButtonElement | null = null;
	private progressBar: HTMLElement | null = null;

	constructor(
		app: App,
		plugin: TaskNotesPlugin,
		items: BasesDataItem[],
		options: BulkTaskCreationModalOptions = {},
		baseFilePath?: string
	) {
		super(app);
		this.plugin = plugin;
		this.items = items;
		this.modalOptions = options;
		this.baseFilePath = baseFilePath;
		this.engine = new BulkTaskEngine(plugin);
		this.convertEngine = new BulkConvertEngine(plugin);
		this.mode = plugin.settings.defaultBulkMode || "generate";
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("tn-bulk-creation-modal");

		// Header + item count
		contentEl.createEl("h2", { text: "Bulk tasking" });
		contentEl.createDiv({
			cls: "tn-bulk-summary",
			text: `${this.items.length} item${this.items.length !== 1 ? "s" : ""} from this view`,
		});

		// Mode selector
		this.renderModeSelector(contentEl);

		// Preview section
		this.renderPreview(contentEl);

		// Options section (dynamic per mode)
		this.optionsContainer = contentEl.createDiv({ cls: "tn-bulk-options-section" });
		this.rebuildOptions();

		// Status/progress section
		this.statusContainer = contentEl.createDiv({ cls: "tn-bulk-status" });

		// Action buttons
		this.renderActions(contentEl);

		// Initial pre-check
		this.runPreCheck();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Get action button text for the current mode.
	 */
	private getActionButtonText(): string {
		return this.mode === "generate" ? "Generate tasks" : "Convert to tasks";
	}

	/**
	 * Render the mode selector dropdown.
	 */
	private renderModeSelector(container: HTMLElement) {
		const modeSection = container.createDiv({ cls: "tn-bulk-mode-section" });

		new Setting(modeSection)
			.setName("Mode")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("generate", "Generate new tasks")
					.addOption("convert", "Convert to tasks")
					.setValue(this.mode)
					.onChange((value) => {
						this.mode = value as BulkMode;
						this.onModeChanged();
					})
			);
	}

	/**
	 * Handle mode change: update description, options, button text, and re-run pre-check.
	 */
	private onModeChanged() {
		// Update action button text
		if (this.actionButton) {
			this.actionButton.textContent = this.getActionButtonText();
			this.actionButton.disabled = false;
		}

		// Rebuild options for new mode
		this.rebuildOptions();

		// Re-run pre-check
		this.runPreCheck();
	}

	/**
	 * Render the preview section showing first few items.
	 */
	private renderPreview(container: HTMLElement) {
		const previewSection = container.createDiv({ cls: "tn-bulk-preview-section" });
		this.previewContainer = previewSection.createDiv({ cls: "tn-bulk-preview" });
		this.updatePreview();
	}

	/**
	 * Update the preview list.
	 */
	private updatePreview() {
		if (!this.previewContainer) return;
		this.previewContainer.empty();

		const maxPreview = this.items.length > 5 ? 3 : 5;
		const itemsToShow = this.items.slice(0, maxPreview);

		for (const item of itemsToShow) {
			const itemEl = this.previewContainer.createDiv({ cls: "tn-bulk-preview-item" });
			const title = this.extractTitle(item);
			itemEl.createSpan({ cls: "tn-bulk-preview-title", text: title });
		}

		if (this.items.length > maxPreview) {
			const moreEl = this.previewContainer.createDiv({ cls: "tn-bulk-preview-more" });
			moreEl.createSpan({
				text: `... and ${this.items.length - maxPreview} more`,
			});
		}
	}

	/**
	 * Rebuild the options section based on current mode.
	 */
	private rebuildOptions() {
		if (!this.optionsContainer) return;
		this.optionsContainer.empty();

		if (this.mode === "generate") {
			this.renderGenerateOptions(this.optionsContainer);
		} else {
			this.renderConvertOptions(this.optionsContainer);
		}
	}

	/**
	 * Render Generate-mode options.
	 */
	private renderGenerateOptions(container: HTMLElement) {
		new Setting(container)
			.setName("Skip existing")
			.setDesc("Skip items that already have tasks linked to them")
			.addToggle((toggle) =>
				toggle.setValue(this.skipExisting).onChange((value) => {
					this.skipExisting = value;
					this.runPreCheck();
				})
			);

		new Setting(container)
			.setName("Link to source")
			.setDesc("Add source note as project in each created task")
			.addToggle((toggle) =>
				toggle.setValue(this.useParentAsProject).onChange((value) => {
					this.useParentAsProject = value;
				})
			);
	}

	/**
	 * Render Convert-mode options.
	 */
	private renderConvertOptions(container: HTMLElement) {
		new Setting(container)
			.setName("Skip notes already recognized as tasks")
			.setDesc("Skip items that TaskNotes already identifies as tasks")
			.addToggle((toggle) =>
				toggle.setValue(this.skipAlreadyTasks).onChange((value) => {
					this.skipAlreadyTasks = value;
					this.runPreCheck();
				})
			);

		new Setting(container)
			.setName("Apply default values")
			.setDesc("Add default status, priority, and creation date to converted notes")
			.addToggle((toggle) =>
				toggle.setValue(this.applyDefaults).onChange((value) => {
					this.applyDefaults = value;
				})
			);

		// Only show "Link to base view" if we know the base file path
		if (this.baseFilePath) {
			new Setting(container)
				.setName("Link to base view")
				.setDesc("Add a project link to the base view that triggered this conversion")
				.addToggle((toggle) =>
					toggle.setValue(this.linkToBase).onChange((value) => {
						this.linkToBase = value;
					})
				);
		}
	}

	/**
	 * Render the action buttons.
	 */
	private renderActions(container: HTMLElement) {
		const actionsEl = container.createDiv({ cls: "tn-bulk-actions" });

		// Progress bar (hidden initially)
		this.progressBar = actionsEl.createDiv({ cls: "tn-bulk-progress" });
		this.progressBar.style.display = "none";
		const progressInner = this.progressBar.createDiv({ cls: "tn-bulk-progress-bar" });
		progressInner.style.width = "0%";

		// Button container
		const buttonContainer = actionsEl.createDiv({ cls: "tn-bulk-buttons" });

		// Cancel button
		const cancelBtn = buttonContainer.createEl("button", {
			text: "Cancel",
			cls: "mod-warning",
		});
		cancelBtn.addEventListener("click", () => this.close());

		// Action button (text depends on mode)
		this.actionButton = buttonContainer.createEl("button", {
			text: this.getActionButtonText(),
			cls: "mod-cta",
		});
		this.actionButton.addEventListener("click", () => this.executeAction());
	}

	/**
	 * Run pre-check based on current mode.
	 */
	private async runPreCheck() {
		if (!this.statusContainer) return;

		this.statusContainer.empty();
		this.statusContainer.createSpan({ text: "Checking..." });

		try {
			if (this.mode === "generate") {
				await this.runGeneratePreCheck();
			} else {
				await this.runConvertPreCheck();
			}
		} catch (error) {
			this.statusContainer.empty();
			this.statusContainer.createSpan({
				text: "Error during pre-check",
				cls: "tn-bulk-status-error",
			});
		}
	}

	/**
	 * Pre-check for Generate mode: check for existing tasks.
	 */
	private async runGeneratePreCheck() {
		if (!this.statusContainer) return;

		const preCheck = await this.engine.preCheck(this.items, this.skipExisting);

		this.statusContainer.empty();
		if (preCheck.toSkip > 0) {
			this.statusContainer.createSpan({
				text: `Will create ${preCheck.toCreate} task${preCheck.toCreate !== 1 ? "s" : ""}, skip ${preCheck.toSkip} existing`,
				cls: "tn-bulk-status-info",
			});
		} else {
			this.statusContainer.createSpan({
				text: `Will create ${preCheck.toCreate} task${preCheck.toCreate !== 1 ? "s" : ""}`,
				cls: "tn-bulk-status-info",
			});
		}

		this.updatePreviewWithSkipped(preCheck.existing, "exists");

		if (this.actionButton) {
			this.actionButton.disabled = preCheck.toCreate === 0;
		}
	}

	/**
	 * Pre-check for Convert mode: check which items are already tasks.
	 */
	private async runConvertPreCheck() {
		if (!this.statusContainer) return;

		const preCheck = await this.convertEngine.preCheck(this.items);

		this.statusContainer.empty();

		// Build status message parts
		const parts: string[] = [];
		parts.push(`Will convert ${preCheck.toConvert} note${preCheck.toConvert !== 1 ? "s" : ""}`);

		if (preCheck.alreadyTasks > 0 && this.skipAlreadyTasks) {
			parts.push(`skip ${preCheck.alreadyTasks} already task${preCheck.alreadyTasks !== 1 ? "s" : ""}`);
		}

		if (preCheck.nonMarkdown > 0) {
			parts.push(`skip ${preCheck.nonMarkdown} non-markdown`);
		}

		this.statusContainer.createSpan({
			text: parts.join(", "),
			cls: "tn-bulk-status-info",
		});

		// Mark skipped items in preview (combine both sets)
		const allSkipped = new Set([...preCheck.alreadyTaskPaths, ...preCheck.nonMarkdownPaths]);
		if (this.skipAlreadyTasks) {
			this.updatePreviewWithSkippedMulti(preCheck.alreadyTaskPaths, preCheck.nonMarkdownPaths);
		} else {
			this.updatePreviewWithSkippedMulti(new Set(), preCheck.nonMarkdownPaths);
		}

		if (this.actionButton) {
			this.actionButton.disabled = preCheck.toConvert === 0;
		}
	}

	/**
	 * Update preview to show which items will be skipped.
	 */
	private updatePreviewWithSkipped(existingPaths: Set<string>, badgeText = "exists") {
		if (!this.previewContainer) return;

		const items = this.previewContainer.querySelectorAll(".tn-bulk-preview-item");
		const maxPreview = this.items.length > 5 ? 3 : 5;

		for (let i = 0; i < Math.min(this.items.length, maxPreview); i++) {
			const item = this.items[i];
			const itemEl = items[i] as HTMLElement;
			if (!itemEl) continue;

			if (item.path && existingPaths.has(item.path)) {
				itemEl.addClass("tn-bulk-preview-skipped");
				// Add or update skipped indicator
				let badge = itemEl.querySelector(".tn-bulk-skip-badge") as HTMLElement;
				if (!badge) {
					badge = itemEl.createSpan({ cls: "tn-bulk-skip-badge", text: badgeText });
				} else {
					badge.textContent = badgeText;
				}
			} else {
				itemEl.removeClass("tn-bulk-preview-skipped");
				const badge = itemEl.querySelector(".tn-bulk-skip-badge");
				if (badge) badge.remove();
			}
		}
	}

	/**
	 * Update preview with multiple skip reasons (already task, non-markdown).
	 */
	private updatePreviewWithSkippedMulti(alreadyTaskPaths: Set<string>, nonMarkdownPaths: Set<string>) {
		if (!this.previewContainer) return;

		const items = this.previewContainer.querySelectorAll(".tn-bulk-preview-item");
		const maxPreview = this.items.length > 5 ? 3 : 5;

		for (let i = 0; i < Math.min(this.items.length, maxPreview); i++) {
			const item = this.items[i];
			const itemEl = items[i] as HTMLElement;
			if (!itemEl) continue;

			const isAlreadyTask = item.path && alreadyTaskPaths.has(item.path);
			const isNonMarkdown = item.path && nonMarkdownPaths.has(item.path);

			if (isAlreadyTask || isNonMarkdown) {
				itemEl.addClass("tn-bulk-preview-skipped");
				const badgeText = isNonMarkdown ? "non-markdown" : "already task";
				let badge = itemEl.querySelector(".tn-bulk-skip-badge") as HTMLElement;
				if (!badge) {
					badge = itemEl.createSpan({ cls: "tn-bulk-skip-badge", text: badgeText });
				} else {
					badge.textContent = badgeText;
				}
			} else {
				itemEl.removeClass("tn-bulk-preview-skipped");
				const badge = itemEl.querySelector(".tn-bulk-skip-badge");
				if (badge) badge.remove();
			}
		}
	}

	/**
	 * Dispatch execution based on current mode.
	 */
	private async executeAction() {
		if (this.mode === "generate") {
			await this.executeGeneration();
		} else {
			await this.executeConversion();
		}
	}

	/**
	 * Execute bulk task generation (create new files).
	 */
	private async executeGeneration() {
		if (!this.actionButton || !this.progressBar || !this.statusContainer) return;

		this.actionButton.disabled = true;
		this.actionButton.textContent = "Generating...";
		this.progressBar.style.display = "block";

		const progressInner = this.progressBar.querySelector(".tn-bulk-progress-bar") as HTMLElement;

		const options: BulkCreationOptions = {
			skipExisting: this.skipExisting,
			useParentAsProject: this.useParentAsProject,
			onProgress: (current, total, status) => {
				const percent = Math.round((current / total) * 100);
				if (progressInner) {
					progressInner.style.width = `${percent}%`;
				}
				if (this.statusContainer) {
					this.statusContainer.empty();
					this.statusContainer.createSpan({ text: status });
				}
			},
		};

		try {
			const result = await this.engine.createTasks(this.items, options);

			this.statusContainer.empty();

			let resultText = `Created ${result.created} task${result.created !== 1 ? "s" : ""}`;
			if (result.skipped > 0) {
				resultText += `, skipped ${result.skipped}`;
			}
			if (result.failed > 0) {
				resultText += `, ${result.failed} failed`;
			}

			this.statusContainer.createSpan({
				text: resultText,
				cls: result.failed > 0 ? "tn-bulk-status-warning" : "tn-bulk-status-success",
			});

			new Notice(resultText);
			this.modalOptions.onTasksCreated?.(result);
			setTimeout(() => this.close(), 1500);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);

			this.statusContainer.empty();
			this.statusContainer.createSpan({
				text: `Error: ${errorMsg}`,
				cls: "tn-bulk-status-error",
			});

			new Notice(`Bulk task generation failed: ${errorMsg}`);

			this.actionButton.disabled = false;
			this.actionButton.textContent = "Retry";
			this.progressBar.style.display = "none";
		}
	}

	/**
	 * Execute bulk conversion (modify existing notes in-place).
	 */
	private async executeConversion() {
		if (!this.actionButton || !this.progressBar || !this.statusContainer) return;

		this.actionButton.disabled = true;
		this.actionButton.textContent = "Converting...";
		this.progressBar.style.display = "block";

		const progressInner = this.progressBar.querySelector(".tn-bulk-progress-bar") as HTMLElement;

		const options: BulkConvertOptions = {
			applyDefaults: this.applyDefaults,
			linkToBase: this.linkToBase && !!this.baseFilePath,
			baseFilePath: this.baseFilePath,
			onProgress: (current, total, status) => {
				const percent = Math.round((current / total) * 100);
				if (progressInner) {
					progressInner.style.width = `${percent}%`;
				}
				if (this.statusContainer) {
					this.statusContainer.empty();
					this.statusContainer.createSpan({ text: status });
				}
			},
		};

		try {
			const result = await this.convertEngine.convertNotes(this.items, options);

			this.statusContainer.empty();

			let resultText = `Converted ${result.converted} note${result.converted !== 1 ? "s" : ""}`;
			if (result.skipped > 0) {
				resultText += `, skipped ${result.skipped}`;
			}
			if (result.failed > 0) {
				resultText += `, ${result.failed} failed`;
			}

			this.statusContainer.createSpan({
				text: resultText,
				cls: result.failed > 0 ? "tn-bulk-status-warning" : "tn-bulk-status-success",
			});

			new Notice(resultText);
			this.modalOptions.onTasksCreated?.(result);
			setTimeout(() => this.close(), 1500);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);

			this.statusContainer.empty();
			this.statusContainer.createSpan({
				text: `Error: ${errorMsg}`,
				cls: "tn-bulk-status-error",
			});

			new Notice(`Bulk conversion failed: ${errorMsg}`);

			this.actionButton.disabled = false;
			this.actionButton.textContent = "Retry";
			this.progressBar.style.display = "none";
		}
	}

	/**
	 * Extract a title from a Bases data item.
	 */
	private extractTitle(item: BasesDataItem): string {
		const props = item.properties || {};

		if (props.title && typeof props.title === "string") {
			return props.title;
		}

		if (item.file?.basename) {
			return item.file.basename;
		}

		if (item.name) {
			return item.name;
		}

		if (item.path) {
			const basename = item.path.split("/").pop() || item.path;
			return basename.replace(/\.md$/i, "");
		}

		return "Untitled";
	}
}
