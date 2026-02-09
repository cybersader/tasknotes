/**
 * Modal for bulk task operations from Bases view items.
 * Supports two modes:
 *   - Generate: Create new task files linked to source items
 *   - Convert: Add task metadata to existing notes in-place
 */

import { App, Modal, Notice, Setting, setIcon, setTooltip } from "obsidian";
import TaskNotesPlugin from "../main";
import { BasesDataItem } from "../bases/helpers";
import { BulkTaskEngine, BulkCreationOptions, BulkCreationResult } from "./bulk-task-engine";
import { BulkConvertEngine, BulkConvertOptions, BulkConvertResult, ConvertPreCheckResult } from "./bulk-convert-engine";
import { PersonNoteInfo } from "../identity/PersonNoteService";
import { GroupNoteMapping } from "../identity/GroupRegistry";
import { createPersonGroupPicker } from "../ui/PersonGroupPicker";
import { DateContextMenu } from "../components/DateContextMenu";
import { StatusContextMenu } from "../components/StatusContextMenu";
import { PriorityContextMenu } from "../components/PriorityContextMenu";
import { ReminderModal } from "../modals/ReminderModal";
import { Reminder, TaskInfo } from "../types";
import { type PropertyType } from "../utils/propertyDiscoveryUtils";
import { createPropertyPicker } from "../ui/PropertyPicker";

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
	private selectedAssignees: string[] = []; // Paths to person/group notes

	// PersonGroupPicker instance for cleanup
	private assigneePicker: { getSelection: () => string[]; setSelection: (paths: string[]) => void; destroy: () => void } | null = null;

	// Discovered persons and groups for assignee dropdown
	private discoveredPersons: PersonNoteInfo[] = [];
	private discoveredGroups: GroupNoteMapping[] = [];

	// Convert-mode options
	private skipAlreadyTasks = true;
	private applyDefaults = true;
	private linkToBase = true;
	private dueDate = "";
	private scheduledDate = "";

	// Bulk values (shared across modes where applicable)
	private bulkStatus = "";
	private bulkPriority = "";
	private bulkReminders: Reminder[] = []; // Stackable reminders via ReminderModal
	private bulkCustomProperties: Record<string, any> = {}; // Custom properties from PropertyPicker
	private propertyPickerInstance: { refresh: () => void; destroy: () => void } | null = null;
	private customPropsPanel: HTMLElement | null = null;
	private customPropsIcon: HTMLElement | null = null;

	// UI element references
	private bodyContainer: HTMLElement | null = null;
	private optionsContainer: HTMLElement | null = null;
	private itemsContainer: HTMLElement | null = null;
	private itemsListContainer: HTMLElement | null = null;
	private itemsExpanded = false;
	private statusContainer: HTMLElement | null = null;
	private compatContainer: HTMLElement | null = null;
	private actionButton: HTMLButtonElement | null = null;
	private progressBar: HTMLElement | null = null;
	private progressBarInner: HTMLElement | null = null;

	// Action bar icon references (for visual state updates)
	private dueIcon: HTMLElement | null = null;
	private scheduledIcon: HTMLElement | null = null;
	private statusIcon: HTMLElement | null = null;
	private priorityIcon: HTMLElement | null = null;
	private reminderIcon: HTMLElement | null = null;
	private assigneeIcon: HTMLElement | null = null;
	private reminderWarning: HTMLElement | null = null;

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
		const { contentEl, modalEl } = this;
		contentEl.empty();

		// Add modal classes for new styling
		modalEl.addClass("tn-bulk-modal");
		contentEl.addClass("tn-bulk-modal__content");

		// Discover persons synchronously (fast - reads from cache/files)
		this.discoveredPersons = this.plugin.personNoteService?.discoverPersons() || [];
		// Start with empty groups - will update async
		this.discoveredGroups = [];

		// Header with icon, title, and summary
		this.renderHeader(contentEl);

		// Mode tabs (segmented control)
		this.renderModeTabs(contentEl);

		// Scrollable body container
		this.bodyContainer = contentEl.createDiv({ cls: "tn-bulk-modal__body" });

		// Action bar (icon-based bulk values)
		this.renderActionBar(this.bodyContainer);

		// Assignees section (PersonGroupPicker)
		this.renderAssigneeSection(this.bodyContainer);

		// Items section (expandable)
		this.renderItemsSection(this.bodyContainer);

		// Options section (dynamic per mode)
		this.optionsContainer = this.bodyContainer.createDiv({ cls: "tn-bulk-modal__section" });
		this.rebuildOptions();

		// Compatibility section (inline badges, Convert mode only)
		this.compatContainer = this.bodyContainer.createDiv({ cls: "tn-bulk-modal__section" });
		this.compatContainer.style.display = this.mode === "convert" ? "block" : "none";

		// Sticky footer with status, progress, and buttons
		this.renderFooter(contentEl);

		// Initial pre-check
		this.runPreCheck();

		// Discover groups asynchronously and rebuild options when done
		this.discoverGroupsAsync();
	}

	/**
	 * Discover groups asynchronously and rebuild the assignee section.
	 */
	private async discoverGroupsAsync() {
		if (this.plugin.groupRegistry) {
			this.discoveredGroups = await this.plugin.groupRegistry.discoverGroups();
			// Rebuild assignee section to include groups in the picker
			if (this.discoveredGroups.length > 0) {
				this.rebuildActionBarAndAssignees();
			}
		}
	}

	/**
	 * Render the modal header with icon, title, and summary.
	 */
	private renderHeader(container: HTMLElement) {
		const header = container.createDiv({ cls: "tn-bulk-modal__header" });

		// Icon
		const iconEl = header.createDiv({ cls: "tn-bulk-modal__icon" });
		setIcon(iconEl, "list-plus");

		// Title
		header.createEl("h2", {
			cls: "tn-bulk-modal__title",
			text: "Bulk tasking",
		});

		// Summary
		header.createSpan({
			cls: "tn-bulk-modal__summary",
			text: `${this.items.length} item${this.items.length !== 1 ? "s" : ""}`,
		});
	}

	/**
	 * Render mode tabs as a segmented control.
	 */
	private renderModeTabs(container: HTMLElement) {
		const tabsContainer = container.createDiv({ cls: "tn-bulk-modal__mode-tabs" });

		// Generate tab
		const generateTab = tabsContainer.createEl("button", {
			cls: `tn-bulk-modal__tab ${this.mode === "generate" ? "tn-bulk-modal__tab--active" : ""}`,
			text: "Generate new tasks",
		});
		generateTab.addEventListener("click", () => {
			if (this.mode !== "generate") {
				this.mode = "generate";
				this.onModeChanged();
				this.updateTabStyles(tabsContainer);
			}
		});

		// Convert tab
		const convertTab = tabsContainer.createEl("button", {
			cls: `tn-bulk-modal__tab ${this.mode === "convert" ? "tn-bulk-modal__tab--active" : ""}`,
			text: "Convert to tasks",
		});
		convertTab.addEventListener("click", () => {
			if (this.mode !== "convert") {
				this.mode = "convert";
				this.onModeChanged();
				this.updateTabStyles(tabsContainer);
			}
		});
	}

	/**
	 * Update tab active states.
	 */
	private updateTabStyles(tabsContainer: HTMLElement) {
		const tabs = tabsContainer.querySelectorAll(".tn-bulk-modal__tab");
		tabs.forEach((tab, index) => {
			if ((index === 0 && this.mode === "generate") || (index === 1 && this.mode === "convert")) {
				tab.addClass("tn-bulk-modal__tab--active");
			} else {
				tab.removeClass("tn-bulk-modal__tab--active");
			}
		});
	}

	/**
	 * Render the icon action bar for bulk values.
	 */
	private renderActionBar(container: HTMLElement) {
		const section = container.createDiv({ cls: "tn-bulk-modal__section" });

		// Section header with label and help icon
		const header = section.createDiv({ cls: "tn-bulk-modal__section-header" });
		header.createSpan({ cls: "tn-bulk-modal__section-label", text: "BULK VALUES" });

		const helpIcon = header.createSpan({ cls: "tn-bulk-modal__help" });
		setIcon(helpIcon, "help-circle");
		setTooltip(helpIcon, "Set values to apply to all items. Click an icon to set a value.");

		// Action bar with icons - same for both modes
		const actionBar = section.createDiv({ cls: "tn-bulk-modal__action-bar" });

		// Date icons
		this.dueIcon = this.createActionIcon(actionBar, "calendar", "Due date", () => this.openDueDatePicker());
		this.scheduledIcon = this.createActionIcon(actionBar, "calendar-clock", "Scheduled date", () => this.openScheduledDatePicker());

		actionBar.createDiv({ cls: "tn-bulk-modal__action-separator" });

		// Status and Priority
		this.statusIcon = this.createActionIcon(actionBar, "circle-dot", "Status", () => this.openStatusPicker());
		this.priorityIcon = this.createActionIcon(actionBar, "flag", "Priority", () => this.openPriorityPicker());

		actionBar.createDiv({ cls: "tn-bulk-modal__action-separator" });

		// Reminders
		this.reminderIcon = this.createActionIcon(actionBar, "bell", "Reminders", () => this.openReminderPicker());

		actionBar.createDiv({ cls: "tn-bulk-modal__action-separator" });

		// Custom properties
		this.customPropsIcon = this.createActionIcon(actionBar, "braces", "Custom properties", () => this.toggleCustomPropertiesPanel());

		// Update icon states
		this.updateActionIconStates();
	}

	/**
	 * Render the ASSIGNEES section with PersonGroupPicker.
	 */
	private renderAssigneeSection(container: HTMLElement) {
		const section = container.createDiv({ cls: "tn-bulk-modal__section" });
		this.renderAssigneeSectionInto(section);
	}

	/**
	 * Create an action icon button.
	 */
	private createActionIcon(
		container: HTMLElement,
		iconName: string,
		tooltip: string,
		onClick: () => void
	): HTMLElement {
		const iconBtn = container.createEl("button", { cls: "tn-bulk-modal__action-icon" });
		setIcon(iconBtn, iconName);
		setTooltip(iconBtn, tooltip);
		iconBtn.addEventListener("click", onClick);
		return iconBtn;
	}

	/**
	 * Update visual state of action icons (show dot when value is set).
	 */
	private updateActionIconStates() {
		// Due date
		if (this.dueIcon) {
			this.dueIcon.toggleClass("has-value", !!this.dueDate);
			setTooltip(this.dueIcon, this.dueDate ? `Due: ${this.dueDate}` : "Due date");
		}

		// Scheduled date
		if (this.scheduledIcon) {
			this.scheduledIcon.toggleClass("has-value", !!this.scheduledDate);
			setTooltip(this.scheduledIcon, this.scheduledDate ? `Scheduled: ${this.scheduledDate}` : "Scheduled date");
		}

		// Status
		if (this.statusIcon) {
			this.statusIcon.toggleClass("has-value", !!this.bulkStatus);
			setTooltip(this.statusIcon, this.bulkStatus ? `Status: ${this.bulkStatus}` : "Status");
		}

		// Priority
		if (this.priorityIcon) {
			this.priorityIcon.toggleClass("has-value", !!this.bulkPriority);
			setTooltip(this.priorityIcon, this.bulkPriority ? `Priority: ${this.bulkPriority}` : "Priority");
		}

		// Reminders (stackable)
		if (this.reminderIcon) {
			const hasReminders = this.bulkReminders.length > 0;
			this.reminderIcon.toggleClass("has-value", hasReminders);

			// Update tooltip with count
			const count = this.bulkReminders.length;
			const tooltip = count > 0
				? `${count} reminder${count !== 1 ? "s" : ""} set`
				: "Reminders";
			setTooltip(this.reminderIcon, tooltip);

			// Update data-count attribute for CSS badge (optional)
			this.reminderIcon.setAttribute("data-count", String(count));
		}

		// Assignee
		if (this.assigneeIcon) {
			this.assigneeIcon.toggleClass("has-value", this.selectedAssignees.length > 0);
			const count = this.selectedAssignees.length;
			setTooltip(this.assigneeIcon, count > 0 ? `${count} assignee${count !== 1 ? "s" : ""} selected` : "Assignee");
		}

		// Custom properties
		if (this.customPropsIcon) {
			const count = Object.keys(this.bulkCustomProperties).length;
			this.customPropsIcon.toggleClass("has-value", count > 0);
			setTooltip(this.customPropsIcon, count > 0
				? `${count} custom propert${count !== 1 ? "ies" : "y"} set`
				: "Custom properties");
		}

		// Show/hide reminder warning (when reminders set but no dates)
		if (this.reminderWarning) {
			const hasReminders = this.bulkReminders.length > 0;
			const hasDate = !!this.dueDate || !!this.scheduledDate;
			const showWarning = hasReminders && !hasDate;
			this.reminderWarning.style.display = showWarning ? "block" : "none";
		}
	}

	/**
	 * Toggle the custom properties inline panel below the action bar.
	 */
	private toggleCustomPropertiesPanel() {
		if (this.customPropsPanel) {
			// Destroy picker and remove panel
			if (this.propertyPickerInstance) {
				this.propertyPickerInstance.destroy();
				this.propertyPickerInstance = null;
			}
			this.customPropsPanel.remove();
			this.customPropsPanel = null;
			return;
		}

		// Find the action bar section to insert after
		const actionBarSection = this.customPropsIcon?.closest(".tn-bulk-modal__section");
		if (!actionBarSection) return;

		this.customPropsPanel = actionBarSection.createDiv({ cls: "tn-bulk-modal__custom-props-panel" });

		// Create PropertyPicker with item paths from current view
		const itemPaths = this.items
			.map(item => item.path)
			.filter((p): p is string => !!p);

		const pickerContainer = this.customPropsPanel.createDiv();
		this.propertyPickerInstance = createPropertyPicker({
			container: pickerContainer,
			plugin: this.plugin,
			itemPaths,
			onSelect: (key: string, type: PropertyType, value?: any) => {
				let defaultValue: any = value ?? null;
				if (defaultValue === null) {
					switch (type) {
						case "date": defaultValue = ""; break;
						case "number": defaultValue = 0; break;
						case "boolean": defaultValue = false; break;
						case "list": defaultValue = []; break;
						default: defaultValue = ""; break;
					}
				}
				this.bulkCustomProperties[key] = defaultValue;
				this.updateActionIconStates();
				this.renderCustomPropsActiveList();
			},
		});

		// Render active custom properties
		this.renderCustomPropsActiveList();
	}

	/**
	 * Render the list of currently-set custom properties in the panel.
	 */
	private renderCustomPropsActiveList() {
		if (!this.customPropsPanel) return;

		// Remove existing active list
		const existing = this.customPropsPanel.querySelector(".tn-bulk-modal__custom-props-active");
		if (existing) existing.remove();

		const keys = Object.keys(this.bulkCustomProperties);
		if (keys.length === 0) return;

		const list = this.customPropsPanel.createDiv({ cls: "tn-bulk-modal__custom-props-active" });

		for (const key of keys) {
			const row = list.createDiv({ cls: "tn-bulk-modal__custom-prop-row" });
			row.createSpan({
				cls: "tn-bulk-modal__custom-prop-key",
				text: key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase()),
			});

			const removeBtn = row.createSpan({ cls: "tn-bulk-modal__custom-prop-remove" });
			setIcon(removeBtn, "x");
			removeBtn.addEventListener("click", () => {
				delete this.bulkCustomProperties[key];
				this.updateActionIconStates();
				this.renderCustomPropsActiveList();
			});
		}
	}

	/**
	 * Render the expandable items section.
	 */
	private renderItemsSection(container: HTMLElement) {
		const section = container.createDiv({ cls: "tn-bulk-modal__section" });

		// Section header
		const header = section.createDiv({ cls: "tn-bulk-modal__section-header" });
		header.createSpan({ cls: "tn-bulk-modal__section-label", text: "ITEMS" });

		// Summary row (clickable to expand)
		this.itemsContainer = section.createDiv({ cls: "tn-bulk-modal__items-summary" });
		this.updateItemsSummary();

		// Expandable list
		this.itemsListContainer = section.createDiv({ cls: "tn-bulk-modal__items-list" });
		this.populateItemsList();

		// Click to expand/collapse
		this.itemsContainer.addEventListener("click", () => {
			this.itemsExpanded = !this.itemsExpanded;
			this.itemsListContainer?.toggleClass("is-expanded", this.itemsExpanded);
			const expandBtn = this.itemsContainer?.querySelector(".tn-bulk-modal__expand-btn");
			expandBtn?.toggleClass("is-expanded", this.itemsExpanded);
		});
	}

	/**
	 * Update the items summary display.
	 */
	private updateItemsSummary() {
		if (!this.itemsContainer) return;
		this.itemsContainer.empty();

		const countSpan = this.itemsContainer.createSpan({ cls: "tn-bulk-modal__items-count" });
		countSpan.textContent = `${this.items.length} item${this.items.length !== 1 ? "s" : ""} selected`;

		// Expand button (text chevron - setIcon SVG doesn't render reliably here)
		const expandBtn = this.itemsContainer.createEl("button", {
			cls: `tn-bulk-modal__expand-btn ${this.itemsExpanded ? "is-expanded" : ""}`,
			text: "▾",
		});
	}

	/**
	 * Populate the expandable items list.
	 */
	private populateItemsList() {
		if (!this.itemsListContainer) return;
		this.itemsListContainer.empty();

		const maxItems = 20;
		const itemsToShow = this.items.slice(0, maxItems);

		for (const item of itemsToShow) {
			const itemEl = this.itemsListContainer.createDiv({ cls: "tn-bulk-modal__item" });
			const title = this.extractTitle(item);
			itemEl.createSpan({ cls: "tn-bulk-modal__item-title", text: title });
		}

		if (this.items.length > maxItems) {
			this.itemsListContainer.createDiv({
				cls: "tn-bulk-modal__items-more",
				text: `...and ${this.items.length - maxItems} more`,
			});
		}
	}

	/**
	 * Update items list with skip badges based on pre-check results.
	 */
	private updateItemsWithSkipBadges(skipPaths: Set<string>, badgeText: string) {
		if (!this.itemsListContainer) return;

		const items = this.itemsListContainer.querySelectorAll(".tn-bulk-modal__item");
		const maxItems = 20;

		for (let i = 0; i < Math.min(this.items.length, maxItems); i++) {
			const item = this.items[i];
			const itemEl = items[i] as HTMLElement;
			if (!itemEl) continue;

			const isSkipped = item.path && skipPaths.has(item.path);

			if (isSkipped) {
				itemEl.addClass("tn-bulk-modal__item--skipped");
				let badge = itemEl.querySelector(".tn-bulk-modal__item-badge") as HTMLElement;
				if (!badge) {
					badge = itemEl.createSpan({ cls: "tn-bulk-modal__item-badge", text: badgeText });
				} else {
					badge.textContent = badgeText;
				}
			} else {
				itemEl.removeClass("tn-bulk-modal__item--skipped");
				const badge = itemEl.querySelector(".tn-bulk-modal__item-badge");
				if (badge) badge.remove();
			}
		}
	}

	/**
	 * Render the sticky footer with status, progress, and buttons.
	 */
	private renderFooter(container: HTMLElement) {
		const footer = container.createDiv({ cls: "tn-bulk-modal__footer" });

		// Status message
		this.statusContainer = footer.createDiv({ cls: "tn-bulk-modal__status" });

		// Progress bar (hidden initially)
		this.progressBar = footer.createDiv({ cls: "tn-bulk-modal__progress" });
		this.progressBarInner = this.progressBar.createDiv({ cls: "tn-bulk-modal__progress-bar" });

		// Buttons
		const buttonsContainer = footer.createDiv({ cls: "tn-bulk-modal__buttons" });

		// Cancel button
		const cancelBtn = buttonsContainer.createEl("button", {
			text: "Cancel",
		});
		cancelBtn.addEventListener("click", () => this.close());

		// Action button
		this.actionButton = buttonsContainer.createEl("button", {
			text: this.getActionButtonText(),
			cls: "mod-cta",
		});
		this.actionButton.addEventListener("click", () => this.executeAction());
	}

	// ============================================================
	// Picker methods for action bar icons
	// ============================================================

	/**
	 * Open the due date picker.
	 */
	private openDueDatePicker() {
		if (!this.dueIcon) return;

		const menu = new DateContextMenu({
			currentValue: this.dueDate || undefined,
			title: "Set due date",
			plugin: this.plugin,
			app: this.app,
			onSelect: (date: string | null) => {
				this.dueDate = date || "";
				this.updateActionIconStates();
			},
		});
		menu.showAtElement(this.dueIcon);
	}

	/**
	 * Open the scheduled date picker.
	 */
	private openScheduledDatePicker() {
		if (!this.scheduledIcon) return;

		const menu = new DateContextMenu({
			currentValue: this.scheduledDate || undefined,
			title: "Set scheduled date",
			plugin: this.plugin,
			app: this.app,
			onSelect: (date: string | null) => {
				this.scheduledDate = date || "";
				this.updateActionIconStates();
			},
		});
		menu.showAtElement(this.scheduledIcon);
	}

	/**
	 * Open the status picker.
	 */
	private openStatusPicker() {
		if (!this.statusIcon) return;

		const menu = new StatusContextMenu({
			currentValue: this.bulkStatus,
			plugin: this.plugin,
			onSelect: (status: string) => {
				this.bulkStatus = status;
				this.updateActionIconStates();
			},
		});
		menu.showAtElement(this.statusIcon);
	}

	/**
	 * Open the priority picker.
	 */
	private openPriorityPicker() {
		if (!this.priorityIcon) return;

		const menu = new PriorityContextMenu({
			currentValue: this.bulkPriority,
			plugin: this.plugin,
			onSelect: (priority: string) => {
				this.bulkPriority = priority;
				this.updateActionIconStates();
			},
		});
		menu.showAtElement(this.priorityIcon);
	}

	/**
	 * Open the reminder picker using ReminderModal for stackable reminders.
	 */
	private openReminderPicker() {
		if (!this.reminderIcon) return;

		// Create a temporary TaskInfo object for the ReminderModal
		// The modal needs due/scheduled dates to calculate relative reminders
		const tempTask: TaskInfo = {
			title: "Bulk Task",
			status: this.bulkStatus || "",
			priority: this.bulkPriority || "",
			due: this.dueDate || undefined,
			scheduled: this.scheduledDate || undefined,
			path: "", // No path - this is a bulk operation
			archived: false,
			reminders: [...this.bulkReminders],
		};

		// Check if we have dates for relative reminders
		if (!this.dueDate && !this.scheduledDate) {
			new Notice("Set a due or scheduled date to add relative reminders");
		}

		const modal = new ReminderModal(
			this.app,
			this.plugin,
			tempTask,
			(updatedReminders) => {
				this.bulkReminders = updatedReminders;
				this.updateActionIconStates();
			}
		);
		modal.open();
	}

	/**
	 * Open the assignee picker.
	 */
	private openAssigneePicker() {
		// For assignees, we need a modal or popover with the PersonGroupPicker
		// For now, use a simple approach - create a temporary container
		// TODO: Implement proper popover with PersonGroupPicker

		const { Menu } = require("obsidian");
		const menu = new Menu();

		// Add persons
		for (const person of this.discoveredPersons) {
			const isSelected = this.selectedAssignees.includes(person.path);
			menu.addItem((item: any) => {
				item.setTitle(person.displayName);
				if (isSelected) {
					item.setIcon("check");
				}
				item.onClick(() => {
					if (isSelected) {
						this.selectedAssignees = this.selectedAssignees.filter(p => p !== person.path);
					} else {
						this.selectedAssignees.push(person.path);
					}
					this.updateActionIconStates();
				});
			});
		}

		// Separator if both exist
		if (this.discoveredPersons.length > 0 && this.discoveredGroups.length > 0) {
			menu.addSeparator();
		}

		// Add groups
		for (const group of this.discoveredGroups) {
			const isSelected = this.selectedAssignees.includes(group.notePath);
			menu.addItem((item: any) => {
				item.setTitle(`👥 ${group.displayName}`);
				if (isSelected) {
					item.setIcon("check");
				}
				item.onClick(() => {
					if (isSelected) {
						this.selectedAssignees = this.selectedAssignees.filter(p => p !== group.notePath);
					} else {
						this.selectedAssignees.push(group.notePath);
					}
					this.updateActionIconStates();
				});
			});
		}

		// Clear option
		if (this.selectedAssignees.length > 0) {
			menu.addSeparator();
			menu.addItem((item: any) => {
				item.setTitle("Clear all");
				item.onClick(() => {
					this.selectedAssignees = [];
					this.updateActionIconStates();
				});
			});
		}

		if (this.assigneeIcon) {
			const rect = this.assigneeIcon.getBoundingClientRect();
			menu.showAtPosition({ x: rect.left, y: rect.bottom });
		}
	}

	onClose() {
		// Clean up PersonGroupPicker
		this.assigneePicker?.destroy();
		this.assigneePicker = null;

		// Clean up PropertyPicker
		if (this.propertyPickerInstance) {
			this.propertyPickerInstance.destroy();
			this.propertyPickerInstance = null;
		}

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
	 * Handle mode change: update UI, rebuild sections, and re-run pre-check.
	 */
	private onModeChanged() {
		// Update action button text
		if (this.actionButton) {
			this.actionButton.textContent = this.getActionButtonText();
			this.actionButton.disabled = false;
		}

		// Rebuild action bar and assignee section for new mode
		this.rebuildActionBarAndAssignees();

		// Rebuild options for new mode
		this.rebuildOptions();

		// Show/hide compatibility section (Convert mode only)
		if (this.compatContainer) {
			this.compatContainer.style.display = this.mode === "convert" ? "block" : "none";
			if (this.mode !== "convert") {
				this.compatContainer.empty();
			}
		}

		// Re-run pre-check
		this.runPreCheck();
	}

	/**
	 * Rebuild the action bar and assignee sections.
	 * Used on mode change and when groups are discovered async.
	 */
	private rebuildActionBarAndAssignees() {
		if (!this.bodyContainer) return;

		// Clean up existing pickers
		this.assigneePicker?.destroy();
		this.assigneePicker = null;
		if (this.propertyPickerInstance) {
			this.propertyPickerInstance.destroy();
			this.propertyPickerInstance = null;
		}
		if (this.customPropsPanel) {
			this.customPropsPanel.remove();
			this.customPropsPanel = null;
		}

		// Find and remove existing action bar and assignee sections (first two sections)
		const sections = this.bodyContainer.querySelectorAll(".tn-bulk-modal__section");
		if (sections.length >= 2) {
			sections[0].remove(); // Action bar
			sections[1].remove(); // Assignees (now at index 0 after removal)
		} else if (sections.length >= 1) {
			sections[0].remove(); // Action bar
		}

		// Recreate both sections at the beginning
		const assigneeSection = this.bodyContainer.createDiv({ cls: "tn-bulk-modal__section" });
		const actionBarSection = this.bodyContainer.createDiv({ cls: "tn-bulk-modal__section" });

		// Insert in correct order (action bar first, then assignees)
		this.bodyContainer.insertBefore(actionBarSection, this.bodyContainer.firstChild);
		this.bodyContainer.insertBefore(assigneeSection, actionBarSection.nextSibling);

		// Render content
		this.renderActionBarInto(actionBarSection);
		this.renderAssigneeSectionInto(assigneeSection);
	}

	/**
	 * Render assignee section content into a container.
	 */
	private renderAssigneeSectionInto(section: HTMLElement) {
		// Section header
		const header = section.createDiv({ cls: "tn-bulk-modal__section-header" });
		header.createSpan({ cls: "tn-bulk-modal__section-label", text: "ASSIGNEES" });

		const helpIcon = header.createSpan({ cls: "tn-bulk-modal__help" });
		setIcon(helpIcon, "help-circle");
		setTooltip(helpIcon, "Assign tasks to people or groups. Supports multiple assignees.");

		// Check if persons/groups available
		const hasAssignees = this.discoveredPersons.length > 0 || this.discoveredGroups.length > 0;

		if (!hasAssignees) {
			const emptyMsg = section.createDiv({ cls: "tn-bulk-modal__section-summary" });
			emptyMsg.textContent = "No person or group notes found in vault.";
			return;
		}

		// Picker container
		const pickerContainer = section.createDiv({ cls: "tn-bulk-modal__assignee-picker" });

		// Create the PersonGroupPicker
		this.assigneePicker = createPersonGroupPicker({
			container: pickerContainer,
			persons: this.discoveredPersons,
			groups: this.discoveredGroups,
			multiSelect: true,
			placeholder: "Search people or groups...",
			initialSelection: this.selectedAssignees,
			onChange: (paths) => {
				this.selectedAssignees = paths;
			},
		});
	}

	/**
	 * Render action bar content into a container.
	 * Shows same icons for both modes - unified bulk values.
	 */
	private renderActionBarInto(section: HTMLElement) {
		// Section header with label and help icon
		const header = section.createDiv({ cls: "tn-bulk-modal__section-header" });
		header.createSpan({ cls: "tn-bulk-modal__section-label", text: "BULK VALUES" });

		const helpIcon = header.createSpan({ cls: "tn-bulk-modal__help" });
		setIcon(helpIcon, "help-circle");
		setTooltip(helpIcon, "Set values to apply to all items. Click an icon to set a value.");

		// Action bar with icons - same for both modes
		const actionBar = section.createDiv({ cls: "tn-bulk-modal__action-bar" });

		// Date icons
		this.dueIcon = this.createActionIcon(actionBar, "calendar", "Due date", () => this.openDueDatePicker());
		this.scheduledIcon = this.createActionIcon(actionBar, "calendar-clock", "Scheduled date", () => this.openScheduledDatePicker());

		actionBar.createDiv({ cls: "tn-bulk-modal__action-separator" });

		// Status and Priority
		this.statusIcon = this.createActionIcon(actionBar, "circle-dot", "Status", () => this.openStatusPicker());
		this.priorityIcon = this.createActionIcon(actionBar, "flag", "Priority", () => this.openPriorityPicker());

		actionBar.createDiv({ cls: "tn-bulk-modal__action-separator" });

		// Reminders
		this.reminderIcon = this.createActionIcon(actionBar, "bell", "Reminders", () => this.openReminderPicker());

		actionBar.createDiv({ cls: "tn-bulk-modal__action-separator" });

		// Custom properties
		this.customPropsIcon = this.createActionIcon(actionBar, "braces", "Custom properties", () => this.toggleCustomPropertiesPanel());

		// Reminder warning (hidden by default, shown when reminders set but no dates)
		this.reminderWarning = section.createDiv({
			cls: "tn-bulk-modal__reminder-warning",
			text: "⚠ Set a due or scheduled date for relative reminders to work",
		});
		this.reminderWarning.style.display = "none";

		// Update icon states
		this.updateActionIconStates();
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
	 * Note: Assignees are now set via the action bar icon.
	 */
	private renderGenerateOptions(container: HTMLElement) {
		// Section header
		const header = container.createDiv({ cls: "tn-bulk-modal__section-header" });
		header.createSpan({ cls: "tn-bulk-modal__section-label", text: "OPTIONS" });

		const helpIcon = header.createSpan({ cls: "tn-bulk-modal__help" });
		setIcon(helpIcon, "help-circle");
		setTooltip(helpIcon, "Configure how new task files are created. See Settings → Task properties for defaults.");

		// Options container
		const optionsBox = container.createDiv({ cls: "tn-bulk-modal__options" });

		new Setting(optionsBox)
			.setName("Skip existing")
			.setDesc("Skip items that already have tasks linked to them")
			.addToggle((toggle) =>
				toggle.setValue(this.skipExisting).onChange((value) => {
					this.skipExisting = value;
					this.runPreCheck();
				})
			);

		new Setting(optionsBox)
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
	 * Note: Date/reminder values are now set via the action bar icons.
	 */
	private renderConvertOptions(container: HTMLElement) {
		// Section header
		const header = container.createDiv({ cls: "tn-bulk-modal__section-header" });
		header.createSpan({ cls: "tn-bulk-modal__section-label", text: "OPTIONS" });

		const helpIcon = header.createSpan({ cls: "tn-bulk-modal__help" });
		setIcon(helpIcon, "help-circle");
		setTooltip(helpIcon, "Configure how notes are converted to tasks. See Settings → Task properties for defaults.");

		// Options container
		const optionsBox = container.createDiv({ cls: "tn-bulk-modal__options" });

		new Setting(optionsBox)
			.setName("Skip notes already recognized as tasks")
			.setDesc("Skip items that TaskNotes already identifies as tasks")
			.addToggle((toggle) =>
				toggle.setValue(this.skipAlreadyTasks).onChange((value) => {
					this.skipAlreadyTasks = value;
					this.runPreCheck();
				})
			);

		new Setting(optionsBox)
			.setName("Apply default values")
			.setDesc("Add default status, priority, and creation date")
			.addToggle((toggle) =>
				toggle.setValue(this.applyDefaults).onChange((value) => {
					this.applyDefaults = value;
				})
			);

		// Only show "Link to base view" if we know the base file path
		if (this.baseFilePath) {
			new Setting(optionsBox)
				.setName("Link to base view")
				.setDesc("Add a project link to this base view")
				.addToggle((toggle) =>
					toggle.setValue(this.linkToBase).onChange((value) => {
						this.linkToBase = value;
					})
				);
		}
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
				text: `Ready to create ${preCheck.toCreate} task${preCheck.toCreate !== 1 ? "s" : ""}, skip ${preCheck.toSkip} existing`,
			});
		} else {
			this.statusContainer.createSpan({
				text: `Ready to create ${preCheck.toCreate} task${preCheck.toCreate !== 1 ? "s" : ""}`,
			});
		}

		// Update items list with skip badges
		this.updateItemsWithSkipBadges(preCheck.existing, "exists");

		// Update items summary with skip count
		this.updateItemsSummaryWithSkips(preCheck.toSkip);

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

		// Update status with ready count
		this.statusContainer.empty();
		this.statusContainer.createSpan({
			text: `Ready to convert ${preCheck.toConvert} markdown file${preCheck.toConvert !== 1 ? "s" : ""}`,
		});

		// Render the inline compatibility badges
		this.renderCompatibilityBadges(preCheck);

		// Calculate total skips
		const totalSkips = (this.skipAlreadyTasks ? preCheck.alreadyTasks : 0) + preCheck.nonMarkdown;

		// Update items with skip badges
		const allSkipPaths = new Set<string>();
		if (this.skipAlreadyTasks) {
			preCheck.alreadyTaskPaths.forEach(p => allSkipPaths.add(p));
		}
		preCheck.nonMarkdownPaths.forEach(p => allSkipPaths.add(p));

		// Repopulate items list with badges
		this.populateItemsListWithBadges(preCheck.alreadyTaskPaths, preCheck.nonMarkdownPaths);

		// Update items summary
		this.updateItemsSummaryWithSkips(totalSkips);

		if (this.actionButton) {
			this.actionButton.disabled = preCheck.toConvert === 0;
		}
	}

	/**
	 * Update items summary to show skip count.
	 */
	private updateItemsSummaryWithSkips(skipCount: number) {
		if (!this.itemsContainer) return;

		const countSpan = this.itemsContainer.querySelector(".tn-bulk-modal__items-count");
		if (countSpan) {
			countSpan.textContent = `${this.items.length} item${this.items.length !== 1 ? "s" : ""} selected`;
		}

		// Add or update skip count span
		let skipSpan = this.itemsContainer.querySelector(".tn-bulk-modal__items-skip-count") as HTMLElement;
		if (skipCount > 0) {
			if (!skipSpan) {
				skipSpan = this.itemsContainer.createSpan({ cls: "tn-bulk-modal__items-skip-count" });
				// Insert before expand button
				const expandBtn = this.itemsContainer.querySelector(".tn-bulk-modal__expand-btn");
				if (expandBtn) {
					this.itemsContainer.insertBefore(skipSpan, expandBtn);
				}
			}
			skipSpan.textContent = `(${skipCount} will be skipped)`;
		} else if (skipSpan) {
			skipSpan.remove();
		}
	}

	/**
	 * Populate items list with appropriate skip badges for convert mode.
	 */
	private populateItemsListWithBadges(alreadyTaskPaths: Set<string>, nonMarkdownPaths: Set<string>) {
		if (!this.itemsListContainer) return;
		this.itemsListContainer.empty();

		const maxItems = 20;
		const itemsToShow = this.items.slice(0, maxItems);

		for (const item of itemsToShow) {
			const isAlreadyTask = item.path && alreadyTaskPaths.has(item.path);
			const isNonMarkdown = item.path && nonMarkdownPaths.has(item.path);
			const isSkipped = (isAlreadyTask && this.skipAlreadyTasks) || isNonMarkdown;

			const itemEl = this.itemsListContainer.createDiv({
				cls: `tn-bulk-modal__item ${isSkipped ? "tn-bulk-modal__item--skipped" : ""}`,
			});

			const title = this.extractTitle(item);
			itemEl.createSpan({ cls: "tn-bulk-modal__item-title", text: title });

			if (isNonMarkdown) {
				itemEl.createSpan({ cls: "tn-bulk-modal__item-badge", text: "non-markdown" });
			} else if (isAlreadyTask && this.skipAlreadyTasks) {
				itemEl.createSpan({ cls: "tn-bulk-modal__item-badge", text: "already task" });
			}
		}

		if (this.items.length > maxItems) {
			this.itemsListContainer.createDiv({
				cls: "tn-bulk-modal__items-more",
				text: `...and ${this.items.length - maxItems} more`,
			});
		}
	}

	/**
	 * Render inline compatibility badges (Convert mode).
	 */
	private renderCompatibilityBadges(preCheck: ConvertPreCheckResult) {
		if (!this.compatContainer) return;
		this.compatContainer.empty();

		// Section header
		const header = this.compatContainer.createDiv({ cls: "tn-bulk-modal__section-header" });
		header.createSpan({ cls: "tn-bulk-modal__section-label", text: "COMPATIBILITY" });

		// Badges container
		const badgesContainer = this.compatContainer.createDiv({ cls: "tn-bulk-modal__compat" });

		// Ready badge
		const readyBadge = badgesContainer.createSpan({ cls: "tn-bulk-modal__compat-badge tn-bulk-modal__compat-badge--ready" });
		readyBadge.createSpan({ text: `${preCheck.toConvert} ready ✓` });

		// Skip badge (if any)
		const skipCount = (this.skipAlreadyTasks ? preCheck.alreadyTasks : 0) + preCheck.nonMarkdown;
		if (skipCount > 0) {
			const skipBadge = badgesContainer.createSpan({ cls: "tn-bulk-modal__compat-badge tn-bulk-modal__compat-badge--skip" });
			skipBadge.createSpan({ text: `${skipCount} skipped` });
		}

		// Show details button (if non-markdown files exist)
		if (preCheck.nonMarkdown > 0) {
			const detailsBtn = badgesContainer.createEl("button", {
				cls: "tn-bulk-modal__compat-details-btn",
				text: "Show details",
			});

			const detailsContainer = this.compatContainer.createDiv({ cls: "tn-bulk-modal__compat-details" });

			detailsBtn.addEventListener("click", () => {
				const isExpanded = detailsContainer.hasClass("is-expanded");
				detailsContainer.toggleClass("is-expanded", !isExpanded);
				detailsBtn.textContent = isExpanded ? "Show details" : "Hide details";

				if (!isExpanded && detailsContainer.childElementCount === 0) {
					// Populate details
					this.populateFileBreakdown(detailsContainer, preCheck.fileTypeBreakdown);
				}
			});
		}

		// Warning if high skip ratio
		const totalItems = this.items.length;
		const skipRatio = totalItems > 0 ? skipCount / totalItems : 0;

		if (skipRatio > 0.5 && skipCount > 0) {
			const warningEl = this.compatContainer.createDiv({ cls: "tn-bulk-modal__compat-warning" });
			const percent = Math.round(skipRatio * 100);
			warningEl.textContent = `⚠ ${percent}% of selected files will be skipped`;
		}
	}

	/**
	 * Populate the file breakdown section with filenames grouped by extension.
	 */
	private populateFileBreakdown(container: HTMLElement, breakdown: Map<string, string[]>) {
		const MAX_FILES = 5;
		let totalShown = 0;
		const overflow: { ext: string; count: number }[] = [];

		// Flatten all files into a single list for display
		const allFiles: { name: string; ext: string }[] = [];
		for (const [ext, files] of breakdown) {
			for (const name of files) {
				allFiles.push({ name, ext });
			}
		}

		// Show first MAX_FILES
		for (let i = 0; i < Math.min(allFiles.length, MAX_FILES); i++) {
			const file = allFiles[i];
			container.createDiv({
				cls: "tn-bulk-compatibility-file",
				text: `${file.name}.${file.ext}`,
			});
			totalShown++;
		}

		// Calculate overflow
		if (allFiles.length > MAX_FILES) {
			const remaining = allFiles.length - MAX_FILES;
			// Get unique extensions in overflow
			const overflowExts = new Set<string>();
			for (let i = MAX_FILES; i < allFiles.length; i++) {
				overflowExts.add(`.${allFiles[i].ext}`);
			}
			const extList = Array.from(overflowExts).join(", ");
			container.createDiv({
				cls: "tn-bulk-compatibility-overflow",
				text: `...and ${remaining} more (${extList})`,
			});
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
		this.progressBar.addClass("is-visible");

		const options: BulkCreationOptions = {
			skipExisting: this.skipExisting,
			useParentAsProject: this.useParentAsProject,
			assignees: this.selectedAssignees.length > 0 ? this.selectedAssignees : undefined,
			// Unified bulk values
			dueDate: this.dueDate || undefined,
			scheduledDate: this.scheduledDate || undefined,
			status: this.bulkStatus || undefined,
			priority: this.bulkPriority || undefined,
			reminders: this.bulkReminders.length > 0 ? this.bulkReminders : undefined,
			customFrontmatter: Object.keys(this.bulkCustomProperties).length > 0 ? this.bulkCustomProperties : undefined,
			onProgress: (current, total, status) => {
				const percent = Math.round((current / total) * 100);
				if (this.progressBarInner) {
					this.progressBarInner.style.width = `${percent}%`;
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
				cls: result.failed > 0 ? "tn-bulk-modal__status--warning" : "tn-bulk-modal__status--success",
			});

			new Notice(resultText);
			this.modalOptions.onTasksCreated?.(result);
			setTimeout(() => this.close(), 1500);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);

			this.statusContainer.empty();
			this.statusContainer.createSpan({
				text: `Error: ${errorMsg}`,
				cls: "tn-bulk-modal__status--error",
			});

			new Notice(`Bulk task generation failed: ${errorMsg}`);

			this.actionButton.disabled = false;
			this.actionButton.textContent = "Retry";
			this.progressBar.removeClass("is-visible");
		}
	}

	/**
	 * Execute bulk conversion (modify existing notes in-place).
	 */
	private async executeConversion() {
		if (!this.actionButton || !this.progressBar || !this.statusContainer) return;

		this.actionButton.disabled = true;
		this.actionButton.textContent = "Converting...";
		this.progressBar.addClass("is-visible");

		const options: BulkConvertOptions = {
			applyDefaults: this.applyDefaults,
			linkToBase: this.linkToBase && !!this.baseFilePath,
			baseFilePath: this.baseFilePath,
			dueDate: this.dueDate || undefined,
			scheduledDate: this.scheduledDate || undefined,
			status: this.bulkStatus || undefined,
			priority: this.bulkPriority || undefined,
			reminders: this.bulkReminders.length > 0 ? this.bulkReminders : undefined,
			customFrontmatter: Object.keys(this.bulkCustomProperties).length > 0 ? this.bulkCustomProperties : undefined,
			onProgress: (current, total, status) => {
				const percent = Math.round((current / total) * 100);
				if (this.progressBarInner) {
					this.progressBarInner.style.width = `${percent}%`;
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
				cls: result.failed > 0 ? "tn-bulk-modal__status--warning" : "tn-bulk-modal__status--success",
			});

			new Notice(resultText);
			this.modalOptions.onTasksCreated?.(result);
			setTimeout(() => this.close(), 1500);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);

			this.statusContainer.empty();
			this.statusContainer.createSpan({
				text: `Error: ${errorMsg}`,
				cls: "tn-bulk-modal__status--error",
			});

			new Notice(`Bulk conversion failed: ${errorMsg}`);

			this.actionButton.disabled = false;
			this.actionButton.textContent = "Retry";
			this.progressBar.removeClass("is-visible");
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
