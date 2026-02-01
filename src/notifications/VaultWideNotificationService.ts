import { TFile, parseYaml } from "obsidian";
import TaskNotesPlugin from "../main";
import {
	AggregatedNotificationItem,
	NotificationSource,
	TimeCategory,
} from "../types/settings";
import { NotificationItem } from "../modals/BasesNotificationModal";

/**
 * Extended notification item with additional metadata for vault-wide aggregation.
 */
interface ExtendedNotificationItem extends NotificationItem {
	dueDate?: string;
	scheduledDate?: string;
}

/**
 * Parsed configuration from a .base file.
 */
interface BaseFileConfig {
	name?: string;
	notify?: boolean;
	source?: string;
}

/**
 * Result from evaluating a base file's query.
 */
interface BaseQueryResult {
	basePath: string;
	baseName: string;
	items: NotificationItem[];
}

/**
 * VaultWideNotificationService - Aggregates notification items from multiple sources.
 *
 * Sources:
 * 1. Bases files with `notify: true` - Query-based notifications
 * 2. NotificationService (upstream) - Task date-based reminders (future)
 * 3. ViewEntryTracker - Time-in-view notifications (future)
 *
 * The service deduplicates items by path and provides time-based categorization.
 */
export class VaultWideNotificationService {
	private plugin: TaskNotesPlugin;

	constructor(plugin: TaskNotesPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Get all aggregated notification items from enabled sources.
	 * Items are deduplicated by path and categorized by time.
	 */
	async getAggregatedItems(): Promise<AggregatedNotificationItem[]> {
		this.plugin.debugLog.log("VaultWideNotificationService", "getAggregatedItems called");

		const settings = this.plugin.settings.vaultWideNotifications;
		if (!settings.enabled) {
			this.plugin.debugLog.log("VaultWideNotificationService", "Service disabled in settings - returning empty");
			return [];
		}

		this.plugin.debugLog.log("VaultWideNotificationService", `Settings: enabledSources.bases=${settings.enabledSources.bases}`);

		const allItems: AggregatedNotificationItem[] = [];

		// Source 1: Bases with notify: true
		if (settings.enabledSources.bases) {
			this.plugin.debugLog.log("VaultWideNotificationService", "Fetching bases notification items...");
			const basesItems = await this.getBasesNotificationItems();
			this.plugin.debugLog.log("VaultWideNotificationService", `Got ${basesItems.length} items from bases`);
			allItems.push(...basesItems);
		}

		// Source 2: Upstream reminders (future - requires NotificationService integration)
		// if (settings.enabledSources.upstreamReminders) {
		//   const reminderItems = await this.getUpstreamReminderItems();
		//   allItems.push(...reminderItems);
		// }

		// Source 3: View-entry tracking (future - requires ViewEntryTracker)
		// if (settings.enabledSources.viewEntry) {
		//   const viewEntryItems = await this.getViewEntryItems();
		//   allItems.push(...viewEntryItems);
		// }

		// Deduplicate by path, merging sources
		const deduped = this.deduplicateItems(allItems);

		// Sort by time category priority
		return this.sortByTimeCategory(deduped);
	}

	/**
	 * Get notification items from all bases with notify: true.
	 */
	private async getBasesNotificationItems(): Promise<AggregatedNotificationItem[]> {
		const items: AggregatedNotificationItem[] = [];

		// Find all .base files with notify: true
		const baseFiles = this.plugin.app.vault.getFiles().filter(f => f.extension === "base");
		this.plugin.debugLog.log("VaultWideNotificationService", `Found ${baseFiles.length} .base files`);

		for (const file of baseFiles) {
			try {
				const config = await this.parseBaseConfig(file);
				this.plugin.debugLog.log("VaultWideNotificationService", `Checking ${file.path}: notify=${config?.notify}`);
				if (!config?.notify) continue;

				// Evaluate the query using BasesViewBase infrastructure
				this.plugin.debugLog.log("VaultWideNotificationService", `Evaluating query for ${file.path}`);
				const queryResults = await this.evaluateBaseQuery(file);
				this.plugin.debugLog.log("VaultWideNotificationService", `Query results for ${file.path}: ${queryResults?.length ?? 0} items`);
				if (!queryResults || queryResults.length === 0) continue;

				// Convert to aggregated items
				for (const result of queryResults) {
					const timeCategory = this.categorizeByTime(result);
					const timeContext = this.getTimeContext(result);

					// Debug: Log raw title value and type
					this.plugin.debugLog.log("VaultWideNotificationService", `Converting result: ${result.path}`, {
						rawTitleType: typeof result.title,
						rawTitleValue: result.title,
						isTask: result.isTask,
					});

					// Ensure title is a string (handle objects, arrays, etc.)
					let finalTitle: string;
					if (typeof result.title === "string") {
						finalTitle = result.title || "Untitled";
					} else if (result.title && typeof result.title === "object") {
						// Title is an object (possibly Link object from Bases)
						finalTitle = (result.title as any).display ||
							(result.title as any).path ||
							(result.title as any).toString?.() ||
							"Untitled";
						this.plugin.debugLog.log("VaultWideNotificationService", `Title was object, extracted: ${finalTitle}`);
					} else {
						finalTitle = "Untitled";
					}

					items.push({
						path: result.path,
						title: finalTitle,
						isTask: result.isTask ?? false,
						status: result.status,
						dueDate: result.dueDate,
						scheduledDate: result.scheduledDate,
						sources: [{
							type: 'base',
							path: file.path,
							name: config.name || file.basename,
						}],
						timeCategory,
						timeContext,
					});
				}
			} catch (error) {
				this.plugin.debugLog.log("VaultWideNotificationService", `Error processing ${file.path}:`, error);
			}
		}

		return items;
	}

	/**
	 * Parse a .base file to extract configuration.
	 * Checks both top-level notify and per-view notify in views[].
	 */
	private async parseBaseConfig(file: TFile): Promise<BaseFileConfig | null> {
		try {
			const content = await this.plugin.app.vault.read(file);
			const parsed = parseYaml(content);

			if (!parsed) {
				return null;
			}

			// Check top-level notify (future-proofing)
			let hasNotify = parsed?.notify === true;

			// Also check per-view notify (current .base format)
			if (!hasNotify && Array.isArray(parsed?.views)) {
				hasNotify = parsed.views.some((v: any) => v?.notify === true);
			}

			return {
				name: parsed?.name,
				notify: hasNotify,
				source: parsed?.source,
			};
		} catch {
			return null;
		}
	}

	/**
	 * Evaluate a base file's query and return matching items.
	 * Uses BasesQueryWatcher's evaluation infrastructure which checks open views
	 * or parses the source filter directly.
	 */
	private async evaluateBaseQuery(file: TFile): Promise<ExtendedNotificationItem[]> {
		try {
			// Use BasesQueryWatcher to evaluate the query
			// This leverages the same logic used for individual base notifications
			const results = await this.plugin.basesQueryWatcher.getQueryResults(file.path);

			if (!results || results.length === 0) {
				return [];
			}

			// Enhance results with date information from frontmatter
			const items: ExtendedNotificationItem[] = [];
			for (const result of results) {
				const noteFile = this.plugin.app.vault.getAbstractFileByPath(result.path);
				let dueDate: string | undefined;
				let scheduledDate: string | undefined;

				if (noteFile instanceof TFile) {
					const frontmatter = this.plugin.app.metadataCache.getFileCache(noteFile)?.frontmatter;
					if (frontmatter) {
						// Get dates using field mapper for custom field names
						dueDate = frontmatter[this.plugin.fieldMapper.toUserField("due")] ||
								  frontmatter.due ||
								  frontmatter.Review_date; // Support document library dates too
						scheduledDate = frontmatter[this.plugin.fieldMapper.toUserField("scheduled")] ||
									   frontmatter.scheduled;
					}
				}

				items.push({
					path: result.path,
					title: result.title,
					isTask: result.isTask ?? false,
					status: result.status,
					dueDate,
					scheduledDate,
				});
			}

			return items;
		} catch (error) {
			this.plugin.debugLog.log("VaultWideNotificationService", `Error evaluating query for ${file.path}:`, error);
			return [];
		}
	}

	/**
	 * Categorize an item by time (overdue, today, tomorrow, etc.).
	 */
	private categorizeByTime(item: ExtendedNotificationItem): TimeCategory {
		// Get due date from task if available
		const dueDate = item.dueDate;
		if (!dueDate) {
			return 'later';
		}

		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const due = new Date(dueDate);
		const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

		const diffDays = Math.floor((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

		if (diffDays < 0) return 'overdue';
		if (diffDays === 0) return 'today';
		if (diffDays === 1) return 'tomorrow';
		if (diffDays <= 7) return 'thisWeek';
		if (diffDays <= 30) return 'thisMonth';
		return 'later';
	}

	/**
	 * Get human-readable time context for an item.
	 */
	private getTimeContext(item: ExtendedNotificationItem): string | undefined {
		const dueDate = item.dueDate;
		if (!dueDate) {
			return undefined;
		}

		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const due = new Date(dueDate);
		const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

		const diffDays = Math.floor((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

		if (diffDays < -1) return `Due ${Math.abs(diffDays)} days ago`;
		if (diffDays === -1) return 'Due yesterday';
		if (diffDays === 0) return 'Due today';
		if (diffDays === 1) return 'Due tomorrow';
		if (diffDays <= 7) return `Due in ${diffDays} days`;
		return `Due ${due.toLocaleDateString()}`;
	}

	/**
	 * Deduplicate items by path, merging sources.
	 */
	private deduplicateItems(items: AggregatedNotificationItem[]): AggregatedNotificationItem[] {
		const byPath = new Map<string, AggregatedNotificationItem>();

		for (const item of items) {
			const existing = byPath.get(item.path);
			if (existing) {
				// Merge sources
				for (const source of item.sources) {
					const hasSource = existing.sources.some(
						s => s.type === source.type && s.path === source.path
					);
					if (!hasSource) {
						existing.sources.push(source);
					}
				}
				// Keep the most urgent time category
				if (this.getTimeCategoryPriority(item.timeCategory) < this.getTimeCategoryPriority(existing.timeCategory)) {
					existing.timeCategory = item.timeCategory;
					existing.timeContext = item.timeContext;
				}
			} else {
				byPath.set(item.path, { ...item });
			}
		}

		return Array.from(byPath.values());
	}

	/**
	 * Get priority for a time category (lower = more urgent).
	 */
	private getTimeCategoryPriority(category: TimeCategory): number {
		const priorities: Record<TimeCategory, number> = {
			overdue: 0,
			today: 1,
			tomorrow: 2,
			thisWeek: 3,
			thisMonth: 4,
			later: 5,
		};
		return priorities[category];
	}

	/**
	 * Sort items by time category priority.
	 */
	private sortByTimeCategory(items: AggregatedNotificationItem[]): AggregatedNotificationItem[] {
		return items.sort((a, b) => {
			const priorityDiff = this.getTimeCategoryPriority(a.timeCategory) - this.getTimeCategoryPriority(b.timeCategory);
			if (priorityDiff !== 0) return priorityDiff;
			// Within same category, sort by title
			return a.title.localeCompare(b.title);
		});
	}

	/**
	 * Get items grouped by time category.
	 */
	async getItemsGroupedByTime(): Promise<Map<TimeCategory, AggregatedNotificationItem[]>> {
		const items = await this.getAggregatedItems();
		const grouped = new Map<TimeCategory, AggregatedNotificationItem[]>();

		// Initialize all categories
		const categories: TimeCategory[] = ['overdue', 'today', 'tomorrow', 'thisWeek', 'thisMonth', 'later'];
		for (const cat of categories) {
			grouped.set(cat, []);
		}

		// Group items
		for (const item of items) {
			const group = grouped.get(item.timeCategory) || [];
			group.push(item);
			grouped.set(item.timeCategory, group);
		}

		return grouped;
	}

	/**
	 * Get total count of notification items.
	 */
	async getTotalCount(): Promise<number> {
		const items = await this.getAggregatedItems();
		return items.length;
	}

	/**
	 * Check if there are any notification items.
	 */
	async hasItems(): Promise<boolean> {
		const count = await this.getTotalCount();
		return count > 0;
	}
}
