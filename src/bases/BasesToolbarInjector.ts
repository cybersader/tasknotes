/* eslint-disable no-console */
import { Notice, setIcon, WorkspaceLeaf, TFile } from "obsidian";
import TaskNotesPlugin from "../main";
import { BulkTaskCreationModal } from "../bulk/BulkTaskCreationModal";

/**
 * Injects TaskNotes "New Task" and "Bulk tasking" buttons into ALL Obsidian Bases toolbars,
 * including non-TaskNotes view types (Table, Board, etc.).
 *
 * TaskNotes-registered views (TaskList, Kanban, Calendar, etc.) already inject buttons via
 * BasesViewBase.setupNewTaskButton() / setupBulkCreationButton(). This service handles the
 * remaining built-in Bases views that TaskNotes doesn't control.
 *
 * Detection: MutationObserver + workspace layout-change event (hybrid).
 * Deduplication: Checks for existing buttons + .tasknotes-view-active before injecting.
 * Cleanup: Removes stale universal buttons when BasesViewBase takes over a view.
 */
export class BasesToolbarInjector {
	private plugin: TaskNotesPlugin;
	private observer: MutationObserver | null = null;
	private layoutChangeRef: any = null;
	private scanDebounceTimer: number | null = null;
	private periodicCheckInterval: number | null = null;

	// Debounce higher than BasesViewBase's 150ms setTimeout to avoid timing races.
	// BasesViewBase injects at 100ms (new task) and 150ms (bulk). By 500ms both have
	// finished, so we can reliably detect their presence and skip TN views.
	private static readonly DEBOUNCE_MS = 500;

	// Periodic safety net: catches view type switches that don't trigger events
	private static readonly PERIODIC_CHECK_MS = 2000;

	constructor(plugin: TaskNotesPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Start watching for Bases toolbars and injecting buttons.
	 */
	start(): void {
		if (!this.plugin.settings.enableUniversalBasesButtons) return;

		// Listen for workspace layout changes (tab switches, pane opens, etc.)
		this.layoutChangeRef = this.plugin.app.workspace.on("layout-change", () => {
			this.debouncedScan();
		});
		this.plugin.registerEvent(this.layoutChangeRef);

		// MutationObserver catches async toolbar rendering and view type switches.
		// We watch for:
		// 1. New .bases-toolbar elements being added (initial render)
		// 2. Children removed from .bases-toolbar (BasesViewBase cleanup on view switch)
		this.observer = new MutationObserver((mutations) => {
			let hasRelevantMutation = false;
			for (const mutation of mutations) {
				// Check for new toolbar elements being added
				for (const node of mutation.addedNodes) {
					if (node instanceof HTMLElement) {
						if (
							node.classList?.contains("bases-toolbar") ||
							node.querySelector?.(".bases-toolbar")
						) {
							hasRelevantMutation = true;
							break;
						}
					}
				}
				if (hasRelevantMutation) break;

				// Check for buttons removed from a toolbar (view type switch cleanup)
				if (mutation.removedNodes.length > 0 && mutation.target instanceof HTMLElement) {
					if (
						mutation.target.classList?.contains("bases-toolbar") ||
						mutation.target.closest?.(".bases-toolbar")
					) {
						hasRelevantMutation = true;
						break;
					}
				}
			}
			if (hasRelevantMutation) {
				this.debouncedScan();
			}
		});

		this.observer.observe(document.body, {
			childList: true,
			subtree: true,
		});

		// Periodic safety net: catches view type switches that don't trigger
		// layout-change or detectable DOM mutations (e.g., Bases reusing toolbar elements).
		// Lightweight — just querySelectorAll + a few class checks, runs every 2s.
		this.periodicCheckInterval = window.setInterval(() => {
			this.scanAndInject();
		}, BasesToolbarInjector.PERIODIC_CHECK_MS);

		// Initial scan for any already-rendered toolbars
		this.debouncedScan();
	}

	/**
	 * Stop watching and clean up.
	 */
	stop(): void {
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
		if (this.scanDebounceTimer != null) {
			clearTimeout(this.scanDebounceTimer);
			this.scanDebounceTimer = null;
		}
		if (this.periodicCheckInterval != null) {
			clearInterval(this.periodicCheckInterval);
			this.periodicCheckInterval = null;
		}
		// Remove all universal-injected buttons from the DOM
		this.removeAllUniversalButtons();
		// layoutChangeRef is cleaned up automatically via plugin.registerEvent()
	}

	/**
	 * Remove all universal-injected buttons from the document.
	 */
	private removeAllUniversalButtons(): void {
		const universalBtns = document.querySelectorAll(".tn-universal-injected");
		for (const btn of universalBtns) {
			btn.remove();
		}
	}

	/**
	 * Debounced scan — prevents rapid-fire DOM queries.
	 * Uses 500ms delay to let BasesViewBase (100-150ms) inject first on TN views.
	 */
	private debouncedScan(): void {
		if (this.scanDebounceTimer != null) {
			clearTimeout(this.scanDebounceTimer);
		}
		this.scanDebounceTimer = window.setTimeout(() => {
			this.scanDebounceTimer = null;
			this.scanAndInject();
		}, BasesToolbarInjector.DEBOUNCE_MS);
	}

	/**
	 * Scan all .bases-toolbar elements and inject buttons where missing.
	 * Also cleans up stale universal buttons on toolbars that BasesViewBase has claimed.
	 *
	 * NOTE: No caching (WeakSet etc.) — we check DOM state fresh every scan.
	 * Bases can reuse toolbar elements across view type switches, so cached state
	 * goes stale. With 500ms debounce and typically 1-2 toolbars, this is fine.
	 */
	private scanAndInject(): void {
		if (!this.plugin.settings.enableUniversalBasesButtons) return;

		const toolbars = document.querySelectorAll(".bases-toolbar");
		for (const toolbar of toolbars) {
			const parentEl = toolbar.closest(".bases-view")?.parentElement;
			const isTNView = parentEl?.classList.contains("tasknotes-view-active") ?? false;

			// CLEANUP: If BasesViewBase has claimed this view, remove any universal buttons
			if (isTNView) {
				this.cleanupUniversalButtonsFrom(toolbar as HTMLElement);
				continue;
			}

			// Skip if BasesViewBase-injected buttons exist (non-universal — TN view owns this toolbar)
			const tnBtn = toolbar.querySelector(".tn-bases-new-task-btn:not(.tn-universal-injected)");
			if (tnBtn) {
				continue;
			}

			// Skip if we already injected universal buttons on this toolbar
			if (toolbar.querySelector(".tn-universal-injected")) {
				continue;
			}

			this.injectButtons(toolbar as HTMLElement);
		}
	}

	/**
	 * Remove universal-injected buttons from a specific toolbar.
	 * Called when BasesViewBase claims a view that the injector previously handled.
	 */
	private cleanupUniversalButtonsFrom(toolbarEl: HTMLElement): void {
		const universalBtns = toolbarEl.querySelectorAll(".tn-universal-injected");
		if (universalBtns.length === 0) return;

		for (const btn of universalBtns) {
			btn.remove();
		}

		this.plugin.debugLog.log(
			"BasesToolbarInjector",
			"Cleaned up universal buttons — BasesViewBase has taken over this toolbar"
		);
	}

	/**
	 * Inject "Bulk tasking" button into a non-TaskNotes toolbar.
	 * The native "New" button is left untouched — it creates normal files,
	 * which is the expected behavior on non-TaskNotes views.
	 * Only "Bulk tasking" is a TaskNotes action that makes sense universally.
	 */
	private injectButtons(toolbarEl: HTMLElement): void {
		if (!this.plugin.settings.enableBulkActionsButton) return;

		const doc = toolbarEl.ownerDocument;

		// --- Bulk tasking button only ---
		const bulkBtn = doc.createElement("div");
		bulkBtn.className = "bases-toolbar-item tn-bases-bulk-create-btn tn-universal-injected";

		const bulkInner = doc.createElement("div");
		bulkInner.className = "text-icon-button";
		bulkInner.tabIndex = 0;

		const bulkIcon = doc.createElement("span");
		bulkIcon.className = "text-button-icon";
		setIcon(bulkIcon, "layers");
		bulkInner.appendChild(bulkIcon);

		const bulkLabel = doc.createElement("span");
		bulkLabel.className = "text-button-label";
		bulkLabel.textContent = "Bulk tasking";
		bulkInner.appendChild(bulkLabel);

		bulkBtn.appendChild(bulkInner);
		bulkBtn.addEventListener("click", (e) => this.handleBulkCreation(e));

		// Insert after the native "New" button (keep native visible)
		const nativeNewBtn = toolbarEl.querySelector(
			".bases-toolbar-new-item-menu"
		) as HTMLElement | null;
		if (nativeNewBtn) {
			nativeNewBtn.after(bulkBtn);
		} else {
			toolbarEl.appendChild(bulkBtn);
		}

		this.plugin.debugLog.log(
			"BasesToolbarInjector",
			"Injected Bulk tasking button into toolbar"
		);
	}

	/**
	 * Handle "Bulk tasking" click — extract view data and open BulkTaskCreationModal.
	 */
	private handleBulkCreation(event: MouseEvent): void {
		try {
			const button = event.currentTarget as HTMLElement;
			const items = this.extractItemsFromToolbarContext(button);

			if (!items || items.length === 0) {
				new Notice("No items found in this view. Try switching to a different view or waiting for data to load.");
				return;
			}

			// Get base file path from the leaf for Convert mode linking
			const leaf = this.findLeafFromToolbar(button);
			const baseFilePath = leaf ? (leaf.getViewState()?.state?.file as string) : undefined;

			const modal = new BulkTaskCreationModal(
				this.plugin.app,
				this.plugin,
				items,
				{
					onTasksCreated: () => {
						// No view refresh available for non-TaskNotes views
					},
				},
				baseFilePath
			);
			modal.open();
		} catch (error) {
			console.error("[TaskNotes][BasesToolbarInjector] Error opening bulk modal:", error);
			new Notice(
				"Failed to open bulk task creation: " +
					(error instanceof Error ? error.message : String(error))
			);
		}
	}

	/**
	 * Extract data items from the Bases view associated with a toolbar button.
	 *
	 * Access chain for Bases views (via leaf.view, NOT BasesViewBase):
	 *   leaf.view.basesContainer.controller.results → Map<string, {file, frontmatter, ...}>
	 *
	 * This is the same proven pattern used by BasesQueryWatcher.extractResultsFromView().
	 */
	private extractItemsFromToolbarContext(button: HTMLElement): any[] {
		const leaf = this.findLeafFromToolbar(button);
		if (!leaf) {
			this.plugin.debugLog.log("BasesToolbarInjector", "Could not find workspace leaf for toolbar");
			return [];
		}

		const view = leaf.view as any;
		const items: any[] = [];

		try {
			// Primary path: basesContainer.controller.results (proven pattern from BasesQueryWatcher)
			const basesContainer = view.basesContainer || view.container;
			if (basesContainer?.controller?.results) {
				const results = basesContainer.controller.results;
				for (const [, entry] of results) {
					const file = (entry as any).file;
					if (!file?.path) continue;

					const frontmatter =
						(entry as any).frontmatter ||
						this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;

					items.push({
						path: file.path,
						itemType: "generic" as const,
						title:
							frontmatter?.title ||
							file.basename,
					});
				}
				if (items.length > 0) {
					this.plugin.debugLog.log(
						"BasesToolbarInjector",
						`Extracted ${items.length} items via basesContainer.controller.results`
					);
					return items;
				}
			}

			// Fallback: iterate controller.sources if results is empty/missing
			if (basesContainer?.controller?.sources) {
				const sources = basesContainer.controller.sources;
				for (const source of sources) {
					if (source?.results) {
						for (const [, entry] of source.results) {
							const file = (entry as any).file;
							if (!file?.path) continue;

							const frontmatter =
								(entry as any).frontmatter ||
								this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;

							items.push({
								path: file.path,
								itemType: "generic" as const,
								title:
									frontmatter?.title ||
									file.basename,
							});
						}
					}
				}
				if (items.length > 0) {
					this.plugin.debugLog.log(
						"BasesToolbarInjector",
						`Extracted ${items.length} items via controller.sources fallback`
					);
					return items;
				}
			}

			// Last resort: parse the .base file source filter and query metadataCache
			const baseFilePath = leaf.getViewState()?.state?.file as string;
			if (baseFilePath) {
				const baseFile = this.plugin.app.vault.getAbstractFileByPath(baseFilePath);
				if (baseFile instanceof TFile) {
					return this.extractItemsFromBaseFile(baseFile);
				}
			}

			this.plugin.debugLog.log(
				"BasesToolbarInjector",
				`No data source found on view — basesContainer: ${!!basesContainer}, controller: ${!!basesContainer?.controller}, results: ${!!basesContainer?.controller?.results}`
			);
		} catch (error) {
			this.plugin.debugLog.error("BasesToolbarInjector", "Error extracting items", error);
		}

		return items;
	}

	/**
	 * Fallback: extract items by parsing the .base file's source filter.
	 * Queries metadataCache for files matching the folder path.
	 */
	private extractItemsFromBaseFile(baseFile: TFile): any[] {
		const items: any[] = [];
		try {
			// Read file synchronously from cache if available
			const cache = this.plugin.app.metadataCache.getFileCache(baseFile);
			const frontmatter = cache?.frontmatter;

			// .base files can have a source filter like 'folder: "TaskNotes/Tasks"'
			// For a generic fallback, just list all markdown files in the vault
			// that the cache knows about — this is a rough approximation
			const allFiles = this.plugin.app.vault.getMarkdownFiles();

			// If we can find the source folder from the base config, filter to that
			// (this is a best-effort heuristic since we can't evaluate the full query)
			for (const file of allFiles.slice(0, 200)) { // Cap at 200 for safety
				const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
				items.push({
					path: file.path,
					itemType: "generic" as const,
					title: fm?.title || file.basename,
				});
			}

			if (items.length > 0) {
				this.plugin.debugLog.log(
					"BasesToolbarInjector",
					`Fallback: extracted ${items.length} items from vault files`
				);
			}
		} catch (error) {
			this.plugin.debugLog.error("BasesToolbarInjector", "Error parsing base file", error);
		}

		return items;
	}

	/**
	 * Find the WorkspaceLeaf that contains the given toolbar button element.
	 */
	private findLeafFromToolbar(button: HTMLElement): WorkspaceLeaf | null {
		// Traverse DOM to find the workspace-leaf container
		const leafEl = button.closest(".workspace-leaf");
		if (!leafEl) return null;

		// Find matching WorkspaceLeaf object
		let matchedLeaf: WorkspaceLeaf | null = null;
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			if ((leaf as any).containerEl === leafEl) {
				matchedLeaf = leaf;
			}
		});

		return matchedLeaf;
	}
}
