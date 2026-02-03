import { Menu, Notice, setIcon } from "obsidian";
import TaskNotesPlugin from "../main";

/**
 * Default snooze duration options shown in the toast snooze dropdown.
 */
const SNOOZE_OPTIONS: { label: string; getMinutes: () => number }[] = [
	{ label: "15 minutes", getMinutes: () => 15 },
	{ label: "1 hour", getMinutes: () => 60 },
	{ label: "4 hours", getMinutes: () => 240 },
	{
		label: "Until tomorrow",
		getMinutes: () => {
			const now = new Date();
			const tomorrow = new Date(now);
			tomorrow.setDate(tomorrow.getDate() + 1);
			tomorrow.setHours(9, 0, 0, 0);
			return Math.round((tomorrow.getTime() - now.getTime()) / (1000 * 60));
		},
	},
];

/**
 * Toast notification configuration.
 */
export interface ToastConfig {
	/** Message to display */
	message: string;
	/** Optional subtitle/details (plain text) */
	subtitle?: string;
	/** Optional subtitle as HTML (takes precedence over subtitle) */
	subtitleHtml?: string;
	/** Auto-dismiss timeout in ms (0 = no auto-dismiss) */
	timeout?: number;
	/** Show action button */
	actionLabel?: string;
	/** Action callback */
	onAction?: () => void;
	/** Dismiss callback */
	onDismiss?: () => void;
	/** Show snooze dropdown button */
	showSnooze?: boolean;
	/** Snooze callback (duration in minutes) */
	onSnooze?: (minutes: number) => void;
}

/**
 * ToastNotification - Compact bottom-right notification indicator.
 *
 * Used to alert users about items needing attention without interrupting workflow.
 * Clicking the toast opens the Upcoming view.
 *
 * Two modes:
 * 1. Aggregated rollup - "8 items need attention" with breakdown
 * 2. Individual - Specific task reminder with inline actions
 */
export class ToastNotification {
	private plugin: TaskNotesPlugin;
	private currentToast: HTMLElement | null = null;
	private dismissTimeout: ReturnType<typeof setTimeout> | null = null;
	private statusBarItem: HTMLElement | null = null;

	constructor(plugin: TaskNotesPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Show an aggregated notification toast.
	 * Used when multiple items need attention.
	 * Note: Does NOT update status bar - caller (checkAndShow) handles that.
	 */
	showAggregated(counts: {
		total: number;
		overdue: number;
		today: number;
		fromBases: number;
	}): void {
		if (counts.total === 0) {
			this.dismiss();
			return;
		}

		// Build message
		const message = `${counts.total} item${counts.total > 1 ? "s" : ""} need attention`;

		// Build subtitle with breakdown (overdue highlighted)
		const parts: string[] = [];
		if (counts.overdue > 0) parts.push(`<span class="tn-toast__overdue">${counts.overdue} overdue</span>`);
		if (counts.today > 0) parts.push(`${counts.today} due today`);
		if (counts.fromBases > 0) parts.push(`${counts.fromBases} from bases`);
		const subtitleHtml = parts.join(" · ");

		this.show({
			message,
			subtitleHtml,
			timeout: 0, // Persist until user acts (WCAG 2.2.4)
			actionLabel: "View",
			onAction: () => this.openUpcomingView(),
			showSnooze: true,
			onSnooze: (minutes) => this.snoozeAll(minutes),
		});
		// Status bar is updated by checkAndShow(), not here (avoid double-update)
	}

	/**
	 * Show an individual task notification.
	 * Used for specific task reminders.
	 */
	showIndividual(taskTitle: string, context: string): void {
		this.show({
			message: taskTitle,
			subtitle: context,
			timeout: 0, // Persist until user acts (WCAG 2.2.4)
			actionLabel: "Open",
			onAction: () => this.openUpcomingView(),
		});
	}

	/**
	 * Show a custom toast notification.
	 */
	show(config: ToastConfig): void {
		// Dismiss any existing toast
		this.dismiss();

		const doc = document;

		// Create toast container
		const toast = doc.createElement("div");
		toast.className = "tn-toast";

		// Icon
		const iconEl = doc.createElement("div");
		iconEl.className = "tn-toast__icon";
		setIcon(iconEl, "bell");
		toast.appendChild(iconEl);

		// Content
		const content = doc.createElement("div");
		content.className = "tn-toast__content";

		const messageEl = doc.createElement("div");
		messageEl.className = "tn-toast__message";
		messageEl.textContent = config.message;
		content.appendChild(messageEl);

		if (config.subtitleHtml || config.subtitle) {
			const subtitleEl = doc.createElement("div");
			subtitleEl.className = "tn-toast__subtitle";
			if (config.subtitleHtml) {
				subtitleEl.innerHTML = config.subtitleHtml;
			} else {
				subtitleEl.textContent = config.subtitle!;
			}
			content.appendChild(subtitleEl);
		}

		toast.appendChild(content);

		// Actions
		const actions = doc.createElement("div");
		actions.className = "tn-toast__actions";

		if (config.actionLabel && config.onAction) {
			const actionBtn = doc.createElement("button");
			actionBtn.className = "tn-toast__action";
			actionBtn.textContent = config.actionLabel;
			actionBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				config.onAction?.();
				this.dismiss();
			});
			actions.appendChild(actionBtn);
		}

		if (config.showSnooze && config.onSnooze) {
			const snoozeBtn = doc.createElement("button");
			snoozeBtn.className = "tn-toast__snooze";
			const snoozeIcon = doc.createElement("span");
			snoozeIcon.className = "tn-toast__snooze-icon";
			setIcon(snoozeIcon, "clock");
			snoozeBtn.appendChild(snoozeIcon);
			snoozeBtn.appendText("Snooze");
			snoozeBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				const menu = new Menu();
				for (const opt of SNOOZE_OPTIONS) {
					menu.addItem((item) => {
						item.setTitle(opt.label)
							.setIcon("clock")
							.onClick(() => {
								config.onSnooze!(opt.getMinutes());
								this.dismiss();
							});
					});
				}
				menu.showAtMouseEvent(e as MouseEvent);
			});
			actions.appendChild(snoozeBtn);
		}

		const dismissBtn = doc.createElement("button");
		dismissBtn.className = "tn-toast__dismiss";
		dismissBtn.textContent = "Dismiss";
		dismissBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.dismiss();
			config.onDismiss?.();
		});
		actions.appendChild(dismissBtn);

		toast.appendChild(actions);

		// Click anywhere on toast to trigger action
		toast.addEventListener("click", () => {
			config.onAction?.();
			this.dismiss();
		});

		// Add to document
		doc.body.appendChild(toast);
		this.currentToast = toast;

		// Trigger animation
		requestAnimationFrame(() => {
			toast.classList.add("tn-toast--visible");
		});

		// Auto-dismiss
		if (config.timeout && config.timeout > 0) {
			this.dismissTimeout = setTimeout(() => {
				this.dismiss();
			}, config.timeout);
		}

		this.plugin.debugLog.log("ToastNotification", `Showing toast: ${config.message}`);
	}

	/**
	 * Dismiss the current toast.
	 */
	dismiss(): void {
		if (this.dismissTimeout) {
			clearTimeout(this.dismissTimeout);
			this.dismissTimeout = null;
		}

		if (this.currentToast) {
			this.currentToast.classList.remove("tn-toast--visible");
			this.currentToast.classList.add("tn-toast--hiding");

			// Remove after animation
			const toast = this.currentToast;
			setTimeout(() => {
				toast.remove();
			}, 300);

			this.currentToast = null;
		}
	}

	/**
	 * Update the status bar badge with notification count.
	 */
	updateStatusBar(count: number): void {
		// Only create status bar item once
		if (!this.statusBarItem) {
			// Check if there's already one from a previous session (orphaned)
			const existing = document.querySelector(".tn-status-bar-notifications");
			if (existing) {
				this.plugin.debugLog.log("ToastNotification", "Found orphaned status bar item, removing it");
				existing.remove();
			}

			// Create status bar item
			this.statusBarItem = this.plugin.addStatusBarItem();
			this.statusBarItem.className = "tn-status-bar-notifications";
			this.statusBarItem.addEventListener("click", () => {
				this.openUpcomingView();
			});
			this.plugin.debugLog.log("ToastNotification", "Created status bar item");
		}

		if (count > 0) {
			this.statusBarItem.empty();
			const iconEl = this.statusBarItem.createSpan({ cls: "tn-status-bar-notifications__icon" });
			setIcon(iconEl, "bell");
			this.statusBarItem.createSpan({
				cls: "tn-status-bar-notifications__count",
				text: count.toString()
			});
			this.statusBarItem.title = `${count} item${count > 1 ? "s" : ""} need attention`;
			this.statusBarItem.style.display = "flex";
		} else {
			this.statusBarItem.style.display = "none";
		}
	}

	/**
	 * Snooze all monitored bases and clear status bar.
	 */
	private snoozeAll(minutes: number): void {
		this.plugin.basesQueryWatcher.snoozeAllBases(minutes);
		this.updateStatusBar(0);
		const label =
			minutes >= 1440
				? "until tomorrow"
				: minutes >= 60
					? `${Math.round(minutes / 60)} hour${Math.round(minutes / 60) > 1 ? "s" : ""}`
					: `${minutes} minute${minutes > 1 ? "s" : ""}`;
		new Notice(`Snoozed all notifications for ${label}`);
	}

	/**
	 * Open the Upcoming view.
	 * Uses the same command file mapping system as other TaskNotes views.
	 * Reuses existing tab if the file is already open.
	 */
	private async openUpcomingView(): Promise<void> {
		this.plugin.debugLog.log("ToastNotification", "Opening Upcoming view via command mapping");
		await this.plugin.openBasesFileForCommand('open-upcoming-view');
	}

	/**
	 * Check for notifications and show toast if needed.
	 * Called periodically or on events.
	 */
	async checkAndShow(): Promise<void> {
		this.plugin.debugLog.log("ToastNotification", "checkAndShow() called");

		try {
			const items = await this.plugin.vaultWideNotificationService.getAggregatedItems();

			this.plugin.debugLog.log("ToastNotification", `Got ${items.length} aggregated items`, {
				items: items.map(i => ({
					title: i.title,
					timeCategory: i.timeCategory,
					sources: i.sources.map(s => s.type)
				}))
			});

			if (items.length === 0) {
				this.plugin.debugLog.log("ToastNotification", "No items - hiding status bar");
				this.updateStatusBar(0);
				return;
			}

			// Count by category
			let overdue = 0;
			let today = 0;
			let fromBases = 0;

			for (const item of items) {
				if (item.timeCategory === "overdue") overdue++;
				if (item.timeCategory === "today") today++;
				if (item.sources.some(s => s.type === "base")) fromBases++;
			}

			this.plugin.debugLog.log("ToastNotification", `Categories: overdue=${overdue}, today=${today}, fromBases=${fromBases}`);

			// Update status bar always
			this.updateStatusBar(items.length);

			// Only show toast if there are overdue or today items
			// (Don't spam for "later" items)
			if (overdue > 0 || today > 0) {
				this.plugin.debugLog.log("ToastNotification", "Showing toast (has overdue/today items)");
				this.showAggregated({
					total: items.length,
					overdue,
					today,
					fromBases,
				});
			} else {
				this.plugin.debugLog.log("ToastNotification", "Not showing toast (no overdue/today items, only status bar updated)");
			}
		} catch (error) {
			this.plugin.debugLog.error("ToastNotification", "Error checking notifications:", error);
		}
	}

	/**
	 * Clean up resources.
	 */
	destroy(): void {
		this.dismiss();
		if (this.statusBarItem) {
			this.statusBarItem.remove();
			this.statusBarItem = null;
		}
	}
}
