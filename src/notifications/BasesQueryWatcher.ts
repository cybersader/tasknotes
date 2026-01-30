import { EventRef, TFile, parseYaml, WorkspaceLeaf } from "obsidian";
import TaskNotesPlugin from "../main";
import { EVENT_TASK_UPDATED } from "../types";
import {
	BasesNotificationModal,
	NotificationItem,
} from "../modals/BasesNotificationModal";

/**
 * Configuration for a monitored .base file.
 */
interface MonitoredBase {
	path: string;
	name: string;
	/** Timestamp when snooze expires (0 = not snoozed) */
	snoozedUntil: number;
	/** Last known result count */
	lastResultCount: number;
	/** Paths of items in results (for relevance checking) */
	cachedPaths: Set<string>;
}

/**
 * Parsed configuration from a .base file.
 */
interface BaseFileConfig {
	name?: string;
	notify?: boolean;
	notifyOn?: "any" | "count_threshold" | "new_items";
	notifyThreshold?: number;
	source?: string;
}

/**
 * BasesQueryWatcher - Event-driven background monitoring for Bases queries.
 *
 * Architecture:
 * - On startup, scans vault for .base files with `notify: true`
 * - Listens to EVENT_TASK_UPDATED for task changes
 * - Listens to metadataCache for note changes
 * - When a change affects a monitored query, evaluates and shows notification modal
 *
 * Efficiency:
 * - Uses cached path sets for O(1) relevance checking
 * - Only re-evaluates queries when relevant changes occur
 * - Respects snooze settings to avoid notification spam
 */
export class BasesQueryWatcher {
	private plugin: TaskNotesPlugin;
	private monitoredBases: Map<string, MonitoredBase> = new Map();
	private taskUpdateListener: EventRef | null = null;
	private metadataListener: EventRef | null = null;
	private fileDeleteListener: EventRef | null = null;
	private fileRenameListener: EventRef | null = null;
	private scanTimeout: number | null = null;
	private pendingEvaluations: Set<string> = new Set();
	private evaluationDebounceTimer: number | null = null;
	private initialized = false;

	// Configuration
	private readonly EVALUATION_DEBOUNCE_MS = 1000;
	private readonly STARTUP_SCAN_DELAY_MS = 2000; // Reduced from 5s to minimize race condition window
	private readonly PERIODIC_SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
	private readonly SAFETY_SCAN_DELAY_MS = 10000; // Safety scan if first scan found nothing

	constructor(plugin: TaskNotesPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Initialize the watcher. Called from main.ts after plugin loads.
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return;
		this.initialized = true;

		// Delay initial scan to allow vault to settle
		this.scanTimeout = window.setTimeout(async () => {
			await this.scanForMonitoredBases();
			this.setupEventListeners();
			this.startPeriodicScan();
		}, this.STARTUP_SCAN_DELAY_MS);

		// Safety net scan: if first scan found nothing, try again
		// This catches late-loading views and race conditions
		window.setTimeout(async () => {
			if (this.monitoredBases.size === 0) {
				this.plugin.debugLog.log("BasesQueryWatcher", "Safety scan - no bases found in first scan, rescanning...");
				await this.scanForMonitoredBases();
			}
		}, this.SAFETY_SCAN_DELAY_MS);

		this.plugin.debugLog.log("BasesQueryWatcher", "Initialized - will scan in 2s (safety scan at 10s if needed)");
	}

	/**
	 * Clean up the watcher. Called from main.ts on unload.
	 */
	destroy(): void {
		if (this.scanTimeout) {
			clearTimeout(this.scanTimeout);
			this.scanTimeout = null;
		}

		if (this.evaluationDebounceTimer) {
			clearTimeout(this.evaluationDebounceTimer);
			this.evaluationDebounceTimer = null;
		}

		if (this.taskUpdateListener) {
			this.plugin.emitter.offref(this.taskUpdateListener);
			this.taskUpdateListener = null;
		}

		if (this.metadataListener) {
			this.plugin.app.metadataCache.offref(this.metadataListener);
			this.metadataListener = null;
		}

		if (this.fileDeleteListener) {
			this.plugin.app.vault.offref(this.fileDeleteListener);
			this.fileDeleteListener = null;
		}

		if (this.fileRenameListener) {
			this.plugin.app.vault.offref(this.fileRenameListener);
			this.fileRenameListener = null;
		}

		this.monitoredBases.clear();
		this.pendingEvaluations.clear();
		this.initialized = false;

		this.plugin.debugLog.log("BasesQueryWatcher", "Destroyed");
	}

	/**
	 * Scan vault for .base files with notify: true.
	 */
	private async scanForMonitoredBases(): Promise<void> {
		const files = this.plugin.app.vault.getFiles();
		const baseFiles = files.filter((f) => f.extension === "base");

		this.plugin.debugLog.log("BasesQueryWatcher", `Scanning ${baseFiles.length} .base files`);

		for (const file of baseFiles) {
			await this.checkAndRegisterBase(file);
		}

		this.plugin.debugLog.log("BasesQueryWatcher", `Monitoring ${this.monitoredBases.size} bases`);
	}

	/**
	 * Check if a .base file has notify: true and register it.
	 */
	private async checkAndRegisterBase(file: TFile): Promise<void> {
		try {
			const content = await this.plugin.app.vault.read(file);
			const config = this.parseBaseConfig(content, file.path);

			if (config.notify) {
				// Check if already registered
				const existing = this.monitoredBases.get(file.path);

				this.monitoredBases.set(file.path, {
					path: file.path,
					name: config.name || file.basename,
					snoozedUntil: existing?.snoozedUntil || 0,
					lastResultCount: existing?.lastResultCount || 0,
					cachedPaths: existing?.cachedPaths || new Set(),
				});

				this.plugin.debugLog.log("BasesQueryWatcher", `Registered: ${file.path}`);
			} else {
				// Remove if notify was disabled
				this.monitoredBases.delete(file.path);
			}
		} catch (error) {
			this.plugin.debugLog.warn("BasesQueryWatcher", `Failed to parse ${file.path}`, error);
		}
	}

	/**
	 * Parse .base file content to extract configuration.
	 * Checks both top-level and per-view `notify: true` since .base files
	 * store notify as a per-view property inside views[n].
	 */
	private parseBaseConfig(content: string, filePath?: string): BaseFileConfig {
		try {
			// .base files are YAML
			const parsed = parseYaml(content);

			if (!parsed) {
				this.plugin.debugLog.warn("BasesQueryWatcher", `parseYaml returned null/undefined for ${filePath || 'unknown file'}`);
				return { notify: false };
			}

			// Check top-level notify (future-proofing)
			let hasNotify = parsed?.notify === true;

			// Also check per-view notify (current .base format)
			if (!hasNotify && Array.isArray(parsed?.views)) {
				hasNotify = parsed.views.some((v: any) => v?.notify === true);
				if (hasNotify) {
					this.plugin.debugLog.log("BasesQueryWatcher", `Found notify:true in views[] for ${filePath || 'unknown file'}`);
				}
			}

			// Debug: log what we found
			if (filePath) {
				this.plugin.debugLog.log("BasesQueryWatcher", `Parsed ${filePath}: notify=${hasNotify}, hasViews=${Array.isArray(parsed?.views)}, viewCount=${parsed?.views?.length || 0}`);
			}

			return {
				name: parsed?.name,
				notify: hasNotify,
				notifyOn: parsed?.notifyOn || "any",
				notifyThreshold: parsed?.notifyThreshold || 1,
				source: parsed?.source,
			};
		} catch (error) {
			this.plugin.debugLog.warn("BasesQueryWatcher", `YAML parse error for ${filePath || 'unknown file'}`, error);
			return { notify: false };
		}
	}

	/**
	 * Setup event listeners for changes.
	 */
	private setupEventListeners(): void {
		// Listen for task updates
		this.taskUpdateListener = this.plugin.emitter.on(
			EVENT_TASK_UPDATED,
			async (eventData: any) => {
				const path = eventData?.path || eventData?.taskInfo?.path;
				if (path) {
					this.handlePathChange(path);
				}
			}
		);

		// Listen for metadata changes (covers non-task notes)
		this.metadataListener = this.plugin.app.metadataCache.on(
			"changed",
			(file: TFile) => {
				if (file.extension === "base") {
					// .base file itself changed - re-check registration
					this.checkAndRegisterBase(file);
				} else if (file.extension === "md") {
					this.handlePathChange(file.path);
				}
			}
		);

		// Listen for file deletions
		this.fileDeleteListener = this.plugin.app.vault.on("delete", (file) => {
			if (file instanceof TFile) {
				if (file.extension === "base") {
					this.monitoredBases.delete(file.path);
				} else {
					this.handlePathChange(file.path);
				}
			}
		});

		// Listen for file renames
		this.fileRenameListener = this.plugin.app.vault.on(
			"rename",
			(file, oldPath) => {
				if (file instanceof TFile) {
					if (file.extension === "base") {
						// Update monitored base path
						const existing = this.monitoredBases.get(oldPath);
						if (existing) {
							this.monitoredBases.delete(oldPath);
							existing.path = file.path;
							this.monitoredBases.set(file.path, existing);
						}
					} else {
						// Note renamed - might affect queries
						this.handlePathChange(file.path);
						this.handlePathChange(oldPath);
					}
				}
			}
		);

		this.plugin.debugLog.log("BasesQueryWatcher", "Event listeners setup");
	}

	/**
	 * Handle a path change - check if it affects any monitored queries.
	 */
	private handlePathChange(changedPath: string): void {
		// Quick check: does this path appear in any cached result set?
		for (const [basePath, monitored] of this.monitoredBases) {
			if (monitored.cachedPaths.has(changedPath)) {
				this.pendingEvaluations.add(basePath);
			}
		}

		// Also, the change might ADD a new item to a query we haven't cached yet
		// So we schedule evaluation for all non-snoozed bases
		const now = Date.now();
		for (const [basePath, monitored] of this.monitoredBases) {
			if (monitored.snoozedUntil <= now) {
				this.pendingEvaluations.add(basePath);
			}
		}

		this.scheduleEvaluation();
	}

	/**
	 * Schedule debounced evaluation of pending bases.
	 */
	private scheduleEvaluation(): void {
		if (this.evaluationDebounceTimer) {
			clearTimeout(this.evaluationDebounceTimer);
		}

		this.evaluationDebounceTimer = window.setTimeout(async () => {
			this.evaluationDebounceTimer = null;
			await this.evaluatePendingBases();
		}, this.EVALUATION_DEBOUNCE_MS);
	}

	/**
	 * Evaluate all pending bases and show notifications.
	 */
	private async evaluatePendingBases(): Promise<void> {
		if (this.pendingEvaluations.size === 0) return;

		const toEvaluate = Array.from(this.pendingEvaluations);
		this.pendingEvaluations.clear();

		for (const basePath of toEvaluate) {
			const monitored = this.monitoredBases.get(basePath);
			if (!monitored) continue;

			// Check snooze
			if (monitored.snoozedUntil > Date.now()) {
				this.plugin.debugLog.log("BasesQueryWatcher", `${basePath} is snoozed`);
				continue;
			}

			try {
				const results = await this.evaluateBaseQuery(basePath);
				if (results && results.length > 0) {
					// Update cached paths for future relevance checks
					monitored.cachedPaths = new Set(results.map((r) => r.path));
					monitored.lastResultCount = results.length;

					// Show notification
					this.showNotification(monitored, results);
				} else {
					monitored.cachedPaths.clear();
					monitored.lastResultCount = 0;
				}
			} catch (error) {
				this.plugin.debugLog.error("BasesQueryWatcher", `Error evaluating ${basePath}`, error);
			}
		}
	}

	/**
	 * Evaluate a .base query and return results.
	 * Uses Obsidian's Bases API to run the query.
	 */
	private async evaluateBaseQuery(basePath: string): Promise<NotificationItem[] | null> {
		// Strategy: Find an open Bases view for this file, or open one temporarily
		const file = this.plugin.app.vault.getAbstractFileByPath(basePath);
		if (!(file instanceof TFile)) return null;

		// Try to find an existing open view
		let basesLeaf: WorkspaceLeaf | null = null;
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			const viewType = leaf.view?.getViewType?.();
			if (viewType === "bases" || viewType === "obsidian-bases" || viewType === "base") {
				const view = leaf.view as any;
				if (view.file?.path === basePath) {
					basesLeaf = leaf;
				}
			}
		});

		if (basesLeaf) {
			// Extract results from existing view
			return this.extractResultsFromView(basesLeaf);
		}

		// No open view - we need to open one temporarily
		// This is expensive, so we only do it when we know changes occurred
		return await this.evaluateWithTemporaryView(file);
	}

	/**
	 * Extract notification items from an open Bases view.
	 */
	private extractResultsFromView(leaf: WorkspaceLeaf): NotificationItem[] {
		const view = leaf.view as any;
		const items: NotificationItem[] = [];

		try {
			// Access Bases data through the view
			const basesContainer = view.basesContainer || view.container;
			if (!basesContainer?.controller?.results) {
				return items;
			}

			const results = basesContainer.controller.results;
			for (const [key, entry] of results) {
				const file = (entry as any).file;
				if (!file?.path) continue;

				const frontmatter =
					(entry as any).frontmatter ||
					this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;

				const isTask = this.plugin.cacheManager.isTaskFile(frontmatter);
				const title =
					frontmatter?.title ||
					frontmatter?.[this.plugin.fieldMapper.toUserField("title")] ||
					file.basename;

				items.push({
					path: file.path,
					title,
					isTask,
					status: isTask ? frontmatter?.status : undefined,
				});
			}
		} catch (error) {
			this.plugin.debugLog.error("BasesQueryWatcher", "Error extracting results", error);
		}

		return items;
	}

	/**
	 * Evaluate a .base query by temporarily opening the file.
	 * This is more expensive but necessary when no view is open.
	 */
	private async evaluateWithTemporaryView(file: TFile): Promise<NotificationItem[] | null> {
		// For now, we use a simpler approach:
		// Parse the .base file and evaluate the source filter manually
		// This avoids opening UI but requires us to implement filter evaluation

		try {
			const content = await this.plugin.app.vault.read(file);
			const config = this.parseBaseConfig(content, file.path);

			if (!config.source) {
				return null;
			}

			// Simple evaluation: check if source mentions "inFolder"
			// and scan that folder for matching notes
			return await this.evaluateSourceFilter(config);
		} catch (error) {
			this.plugin.debugLog.error("BasesQueryWatcher", `Error evaluating ${file.path}`, error);
			return null;
		}
	}

	/**
	 * Simple evaluation of Bases source filter.
	 * This is a basic implementation that handles common patterns.
	 */
	private async evaluateSourceFilter(config: BaseFileConfig): Promise<NotificationItem[]> {
		const items: NotificationItem[] = [];

		if (!config.source) return items;

		// Parse simple inFolder pattern
		const folderMatch = config.source.match(/file\.inFolder\s*\(\s*["']([^"']+)["']\s*\)/);
		if (folderMatch) {
			const folder = folderMatch[1];
			const files = this.plugin.app.vault.getMarkdownFiles();

			for (const file of files) {
				if (file.path.startsWith(folder + "/") || file.parent?.path === folder) {
					const frontmatter =
						this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;

					const isTask = this.plugin.cacheManager.isTaskFile(frontmatter);
					const title =
						frontmatter?.title ||
						frontmatter?.[this.plugin.fieldMapper.toUserField("title")] ||
						file.basename;

					items.push({
						path: file.path,
						title,
						isTask,
						status: isTask ? frontmatter?.status : undefined,
					});
				}
			}
		}

		return items;
	}

	/**
	 * Show the notification modal for a monitored base.
	 */
	private showNotification(monitored: MonitoredBase, items: NotificationItem[]): void {
		this.plugin.debugLog.log("BasesQueryWatcher", `Showing notification for ${monitored.name}: ${items.length} items`);

		const modal = new BasesNotificationModal(this.plugin.app, this.plugin, {
			baseFilePath: monitored.path,
			baseName: monitored.name,
			items,
			maxDisplayItems: 5,
			onSnooze: (duration) => {
				this.snoozeBase(monitored.path, duration);
			},
		});

		modal.open();
	}

	/**
	 * Snooze notifications for a base.
	 */
	snoozeBase(basePath: string, durationMinutes: number): void {
		const monitored = this.monitoredBases.get(basePath);
		if (monitored) {
			monitored.snoozedUntil = Date.now() + durationMinutes * 60 * 1000;
			this.plugin.debugLog.log("BasesQueryWatcher", `Snoozed ${basePath} for ${durationMinutes} minutes`);
		}
	}

	/**
	 * Start periodic scan for changes that might have been missed.
	 */
	private startPeriodicScan(): void {
		setInterval(async () => {
			// Re-scan for new/changed .base files
			await this.scanForMonitoredBases();

			// Trigger evaluation for all non-snoozed bases
			const now = Date.now();
			for (const [basePath, monitored] of this.monitoredBases) {
				if (monitored.snoozedUntil <= now) {
					this.pendingEvaluations.add(basePath);
				}
			}

			if (this.pendingEvaluations.size > 0) {
				await this.evaluatePendingBases();
			}
		}, this.PERIODIC_SCAN_INTERVAL_MS);
	}

	/**
	 * Get list of currently monitored bases (for settings UI).
	 */
	getMonitoredBases(): Array<{ path: string; name: string; snoozed: boolean }> {
		const now = Date.now();
		return Array.from(this.monitoredBases.values()).map((m) => ({
			path: m.path,
			name: m.name,
			snoozed: m.snoozedUntil > now,
		}));
	}

	/**
	 * Manually trigger evaluation for a specific base.
	 */
	async triggerEvaluation(basePath: string): Promise<void> {
		this.pendingEvaluations.add(basePath);
		await this.evaluatePendingBases();
	}

	/**
	 * Called by BasesViewBase when a view with `notify: true` has data.
	 * This is the primary notification path - uses Bases' own query evaluation.
	 */
	showNotificationFromView(
		basePath: string,
		baseName: string,
		items: NotificationItem[]
	): void {
		if (items.length === 0) return;

		// Ensure this base is tracked
		let monitored = this.monitoredBases.get(basePath);
		if (!monitored) {
			monitored = {
				path: basePath,
				name: baseName,
				snoozedUntil: 0,
				lastResultCount: 0,
				cachedPaths: new Set(),
			};
			this.monitoredBases.set(basePath, monitored);
		}

		// Check snooze
		if (monitored.snoozedUntil > Date.now()) {
			this.plugin.debugLog.log("BasesQueryWatcher", `${basePath} is snoozed, skipping notification`);
			return;
		}

		// Update cached paths
		monitored.cachedPaths = new Set(items.map((i) => i.path));
		monitored.lastResultCount = items.length;

		// Show the notification
		this.showNotification(monitored, items);
	}

	/**
	 * Register a view for notifications. Called by BasesViewBase when it loads
	 * and detects `notify: true` in its .base file.
	 *
	 * This bypasses the race condition where the watcher's scan runs before
	 * views have loaded. Views self-register when they have data.
	 */
	registerViewForNotifications(
		filePath: string,
		baseName: string,
		items: NotificationItem[]
	): void {
		if (!filePath) {
			this.plugin.debugLog.warn("BasesQueryWatcher", "registerViewForNotifications called with no filePath");
			return;
		}

		// Add to monitored bases if not already there
		if (!this.monitoredBases.has(filePath)) {
			this.monitoredBases.set(filePath, {
				path: filePath,
				name: baseName,
				snoozedUntil: 0,
				lastResultCount: 0,
				cachedPaths: new Set(),
			});
			this.plugin.debugLog.log("BasesQueryWatcher", `View self-registered: ${filePath} (total monitored: ${this.monitoredBases.size})`);
		}

		// If items are provided, trigger notification check
		if (items && items.length > 0) {
			this.showNotificationFromView(filePath, baseName, items);
		}
	}
}
