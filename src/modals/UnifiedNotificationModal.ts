import { App, Modal, TFile, setIcon } from "obsidian";
import TaskNotesPlugin from "../main";
import {
	AggregatedNotificationItem,
	TimeCategory,
} from "../types/settings";

/**
 * Display labels for time categories.
 */
const TIME_CATEGORY_LABELS: Record<TimeCategory, string> = {
	overdue: "Overdue",
	today: "Today",
	tomorrow: "Tomorrow",
	thisWeek: "This week",
	thisMonth: "This month",
	later: "Later",
};

/**
 * Icons for time categories.
 */
const TIME_CATEGORY_ICONS: Record<TimeCategory, string> = {
	overdue: "alert-circle",
	today: "calendar",
	tomorrow: "calendar-plus",
	thisWeek: "calendar-range",
	thisMonth: "calendar-days",
	later: "clock",
};

/**
 * UnifiedNotificationModal - Todoist-style vault-wide notification view.
 *
 * Features:
 * - Groups items by time category (Overdue, Today, Tomorrow, This Week, etc.)
 * - Collapsible sections
 * - Per-item actions (Open, Complete)
 * - Shows source bases as metadata
 * - Bulk actions (Open All, Snooze All)
 */
export class UnifiedNotificationModal extends Modal {
	private plugin: TaskNotesPlugin;
	private groupedItems: Map<TimeCategory, AggregatedNotificationItem[]> = new Map();
	private collapsedSections: Set<TimeCategory> = new Set();

	constructor(app: App, plugin: TaskNotesPlugin) {
		super(app);
		this.plugin = plugin;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("tn-unified-notification-modal");

		// Load items
		this.groupedItems = await this.plugin.vaultWideNotificationService.getItemsGroupedByTime();

		this.renderHeader();
		await this.renderSections();
		this.renderFooter();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	private renderHeader(): void {
		const { contentEl } = this;
		const header = contentEl.createDiv({ cls: "tn-unified-modal__header" });

		// Icon
		const iconEl = header.createSpan({ cls: "tn-unified-modal__icon" });
		setIcon(iconEl, "bell");

		// Title
		header.createEl("h2", {
			cls: "tn-unified-modal__title",
			text: "Upcoming tasks",
		});

		// Subtitle with total count
		const totalCount = this.getTotalItemCount();
		const subtitle = totalCount === 1 ? "1 item needs attention" : `${totalCount} items need attention`;
		header.createEl("p", {
			cls: "tn-unified-modal__subtitle",
			text: subtitle,
		});
	}

	private async renderSections(): Promise<void> {
		const { contentEl } = this;
		const sectionsContainer = contentEl.createDiv({ cls: "tn-unified-modal__sections" });

		const categories: TimeCategory[] = ['overdue', 'today', 'tomorrow', 'thisWeek', 'thisMonth', 'later'];

		for (const category of categories) {
			const items = this.groupedItems.get(category) || [];
			if (items.length === 0) continue;

			this.renderSection(sectionsContainer, category, items);
		}

		// If no items at all
		if (this.getTotalItemCount() === 0) {
			sectionsContainer.createDiv({
				cls: "tn-unified-modal__empty",
				text: "No upcoming items. You're all caught up!",
			});
		}
	}

	private renderSection(
		container: HTMLElement,
		category: TimeCategory,
		items: AggregatedNotificationItem[]
	): void {
		const section = container.createDiv({ cls: "tn-unified-modal__section" });
		const isCollapsed = this.collapsedSections.has(category);

		// Section header (clickable to collapse)
		const headerEl = section.createDiv({
			cls: `tn-unified-modal__section-header ${isCollapsed ? 'collapsed' : ''}`,
		});

		// Collapse chevron
		const chevron = headerEl.createSpan({ cls: "tn-unified-modal__section-chevron" });
		setIcon(chevron, isCollapsed ? "chevron-right" : "chevron-down");

		// Category icon
		const iconEl = headerEl.createSpan({ cls: "tn-unified-modal__section-icon" });
		setIcon(iconEl, TIME_CATEGORY_ICONS[category]);

		// Category label and count
		headerEl.createSpan({
			cls: "tn-unified-modal__section-label",
			text: `${TIME_CATEGORY_LABELS[category]} (${items.length})`,
		});

		// Add special styling for overdue
		if (category === 'overdue') {
			section.addClass('tn-unified-modal__section--overdue');
		}

		// Click to toggle collapse
		headerEl.addEventListener("click", () => {
			this.toggleSection(category, section);
		});

		// Items container
		const itemsContainer = section.createDiv({
			cls: `tn-unified-modal__section-items ${isCollapsed ? 'collapsed' : ''}`,
		});

		// Render items
		for (const item of items) {
			this.renderItem(itemsContainer, item);
		}
	}

	private toggleSection(category: TimeCategory, sectionEl: HTMLElement): void {
		const headerEl = sectionEl.querySelector('.tn-unified-modal__section-header');
		const itemsEl = sectionEl.querySelector('.tn-unified-modal__section-items');
		const chevronEl = sectionEl.querySelector('.tn-unified-modal__section-chevron');

		if (!headerEl || !itemsEl || !chevronEl) return;

		const isCollapsed = this.collapsedSections.has(category);

		if (isCollapsed) {
			this.collapsedSections.delete(category);
			headerEl.classList.remove('collapsed');
			itemsEl.classList.remove('collapsed');
			setIcon(chevronEl as HTMLElement, "chevron-down");
		} else {
			this.collapsedSections.add(category);
			headerEl.classList.add('collapsed');
			itemsEl.classList.add('collapsed');
			setIcon(chevronEl as HTMLElement, "chevron-right");
		}
	}

	private renderItem(container: HTMLElement, item: AggregatedNotificationItem): void {
		const itemEl = container.createDiv({ cls: "tn-unified-modal__item" });

		// Item content
		const contentEl = itemEl.createDiv({ cls: "tn-unified-modal__item-content" });

		// Title row
		const titleRow = contentEl.createDiv({ cls: "tn-unified-modal__item-title-row" });

		// Bullet/checkbox indicator
		if (item.isTask) {
			const checkEl = titleRow.createSpan({ cls: "tn-unified-modal__item-check" });
			setIcon(checkEl, "circle");
		} else {
			titleRow.createSpan({ text: "• ", cls: "tn-unified-modal__item-bullet" });
		}

		// Title
		titleRow.createSpan({
			cls: "tn-unified-modal__item-title",
			text: item.title,
		});

		// Meta row (time context + sources)
		const metaRow = contentEl.createDiv({ cls: "tn-unified-modal__item-meta" });

		// Time context
		if (item.timeContext) {
			metaRow.createSpan({
				cls: "tn-unified-modal__item-time",
				text: item.timeContext,
			});
		}

		// Source badges
		if (item.sources.length > 0) {
			const sourcesEl = metaRow.createSpan({ cls: "tn-unified-modal__item-sources" });
			sourcesEl.createSpan({ text: " · From: " });

			const sourceNames = item.sources.map(s => s.name).join(", ");
			const sourceSpan = sourcesEl.createSpan({
				cls: "tn-unified-modal__item-source",
				text: sourceNames,
			});

			// Tooltip with full paths
			const fullPaths = item.sources
				.filter(s => s.path)
				.map(s => s.path)
				.join("\n");
			if (fullPaths) {
				sourceSpan.setAttribute("title", fullPaths);
			}
		}

		// Action buttons
		const actionsEl = itemEl.createDiv({ cls: "tn-unified-modal__item-actions" });

		// Open button
		const openBtn = actionsEl.createEl("button", {
			cls: "tn-unified-modal__btn tn-unified-modal__btn--secondary",
		});
		openBtn.textContent = "Open";
		openBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			await this.openItem(item);
		});

		// Complete button (only for tasks)
		if (item.isTask) {
			const completeBtn = actionsEl.createEl("button", {
				cls: "tn-unified-modal__btn tn-unified-modal__btn--secondary",
			});
			setIcon(completeBtn, "check");
			completeBtn.setAttribute("aria-label", "Complete task");
			completeBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				await this.completeTask(item, itemEl);
			});
		}
	}

	private renderFooter(): void {
		const { contentEl } = this;
		const footer = contentEl.createDiv({ cls: "tn-unified-modal__footer" });

		// Refresh button
		const refreshBtn = footer.createEl("button", {
			cls: "tn-unified-modal__btn tn-unified-modal__btn--secondary",
		});
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.createSpan({ text: " Refresh" });
		refreshBtn.addEventListener("click", async () => {
			await this.refresh();
		});

		// Settings button (opens notification settings)
		const settingsBtn = footer.createEl("button", {
			cls: "tn-unified-modal__btn tn-unified-modal__btn--secondary",
		});
		setIcon(settingsBtn, "settings");
		settingsBtn.setAttribute("aria-label", "Notification settings");
		settingsBtn.addEventListener("click", () => {
			// Open settings tab
			// @ts-ignore - accessing internal API
			this.app.setting.open();
			// @ts-ignore
			this.app.setting.openTabById('tasknotes');
			this.close();
		});

		// Dismiss button
		const dismissBtn = footer.createEl("button", {
			cls: "tn-unified-modal__btn tn-unified-modal__btn--primary",
		});
		dismissBtn.textContent = "Dismiss";
		dismissBtn.addEventListener("click", () => {
			this.close();
		});
	}

	private async openItem(item: AggregatedNotificationItem): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(item.path);
		if (file instanceof TFile) {
			await this.app.workspace.openLinkText(item.path, "", false);
			this.close();
		}
	}

	private async completeTask(item: AggregatedNotificationItem, itemEl: HTMLElement): Promise<void> {
		if (!item.isTask) return;

		try {
			// Get a completed status from StatusManager
			const completedStatuses = this.plugin.statusManager.getCompletedStatuses();
			if (!completedStatuses || completedStatuses.length === 0) {
				console.warn("[UnifiedNotificationModal] No completed status found");
				return;
			}

			// Use the first completed status
			const completedStatusValue = completedStatuses[0];

			// Update the task status
			const task = await this.plugin.cacheManager.getTaskInfo(item.path);
			if (task) {
				await this.plugin.taskService.updateTask(task, { status: completedStatusValue });

				// Visual feedback - strike through and fade
				itemEl.classList.add("tn-unified-modal__item--completed");

				// Remove from items after animation
				setTimeout(() => {
					itemEl.remove();
					this.updateCounts();
				}, 300);
			}
		} catch (error) {
			console.error("[UnifiedNotificationModal] Error completing task:", error);
		}
	}

	private async refresh(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("tn-unified-notification-modal");

		// Reload items
		this.groupedItems = await this.plugin.vaultWideNotificationService.getItemsGroupedByTime();

		this.renderHeader();
		await this.renderSections();
		this.renderFooter();
	}

	private updateCounts(): void {
		// Update header subtitle
		const subtitle = this.contentEl.querySelector('.tn-unified-modal__subtitle');
		if (subtitle) {
			const totalCount = this.getTotalItemCount();
			subtitle.textContent = totalCount === 1 ? "1 item needs attention" : `${totalCount} items need attention`;
		}

		// Update section counts
		const sectionHeaders = this.contentEl.querySelectorAll('.tn-unified-modal__section-header');
		sectionHeaders.forEach(header => {
			const section = header.closest('.tn-unified-modal__section');
			if (!section) return;

			const visibleItems = section.querySelectorAll(
				'.tn-unified-modal__item:not(.tn-unified-modal__item--completed)'
			);

			const label = header.querySelector('.tn-unified-modal__section-label');
			if (label) {
				const currentText = label.textContent || '';
				const newCount = visibleItems.length;
				label.textContent = currentText.replace(/\(\d+\)/, `(${newCount})`);
			}

			// Hide section if empty
			if (visibleItems.length === 0) {
				(section as HTMLElement).style.display = 'none';
			}
		});

		// Check if all items completed
		const totalVisible = this.contentEl.querySelectorAll(
			'.tn-unified-modal__item:not(.tn-unified-modal__item--completed)'
		).length;

		if (totalVisible === 0) {
			const sectionsContainer = this.contentEl.querySelector('.tn-unified-modal__sections');
			if (sectionsContainer) {
				sectionsContainer.empty();
				sectionsContainer.createDiv({
					cls: "tn-unified-modal__empty",
					text: "All done! No more items need attention.",
				});
			}
		}
	}

	private getTotalItemCount(): number {
		let total = 0;
		for (const items of this.groupedItems.values()) {
			total += items.length;
		}
		return total;
	}
}
