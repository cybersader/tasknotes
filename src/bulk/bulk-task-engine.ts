/**
 * Bulk task creation engine.
 * Creates multiple tasks from Bases data items with progress tracking and duplicate detection.
 */

import { Notice, TFile } from "obsidian";
import TaskNotesPlugin from "../main";
import { TaskCreationData, TaskInfo } from "../types";
import { BasesDataItem } from "../bases/helpers";
import { DuplicateDetector, DuplicateCheckResult } from "./duplicate-detector";

export interface BulkCreationOptions {
	/** Skip items that already have tasks linked to them */
	skipExisting: boolean;
	/** Add source note as project link in created tasks */
	useParentAsProject: boolean;
	/** Callback for progress updates */
	onProgress?: (current: number, total: number, status: string) => void;
}

export interface BulkCreationResult {
	/** Number of tasks successfully created */
	created: number;
	/** Number of items skipped (already had tasks) */
	skipped: number;
	/** Number of items that failed to create */
	failed: number;
	/** Error messages for failed items */
	errors: string[];
	/** Paths of created task files */
	createdPaths: string[];
}

/**
 * Extract a suitable task title from a Bases data item.
 */
function extractTitle(item: BasesDataItem): string {
	// Try various sources for the title
	const props = item.properties || {};

	// Check for explicit title property
	if (props.title && typeof props.title === "string") {
		return props.title;
	}

	// Check for file basename
	if (item.file?.basename) {
		return item.file.basename;
	}

	// Check for name property
	if (item.name) {
		return item.name;
	}

	// Extract from path
	if (item.path) {
		const basename = item.path.split("/").pop() || item.path;
		return basename.replace(/\.md$/i, "");
	}

	return "Untitled task";
}

/**
 * Generate a wiki-link to a source note.
 */
function generateProjectLink(sourcePath: string, app: any): string {
	const file = app.vault.getAbstractFileByPath(sourcePath);
	if (file instanceof TFile) {
		return app.fileManager.generateMarkdownLink(file, file.path);
	}
	// Fallback: create wiki-link from path
	const basename = sourcePath.split("/").pop()?.replace(/\.md$/i, "") || sourcePath;
	return `[[${basename}]]`;
}

/**
 * BulkTaskEngine handles creating multiple tasks from Bases data items.
 */
export class BulkTaskEngine {
	private duplicateDetector: DuplicateDetector;

	constructor(private plugin: TaskNotesPlugin) {
		this.duplicateDetector = new DuplicateDetector(plugin);
	}

	/**
	 * Create tasks for all provided Bases data items.
	 *
	 * @param items - Array of Bases data items to create tasks from
	 * @param options - Creation options
	 * @returns Result object with counts and error information
	 */
	async createTasks(
		items: BasesDataItem[],
		options: BulkCreationOptions
	): Promise<BulkCreationResult> {
		const result: BulkCreationResult = {
			created: 0,
			skipped: 0,
			failed: 0,
			errors: [],
			createdPaths: [],
		};

		if (items.length === 0) {
			return result;
		}

		// Check for duplicates if skipExisting is enabled
		let duplicateCheck: DuplicateCheckResult | null = null;
		if (options.skipExisting) {
			options.onProgress?.(0, items.length, "Checking for existing tasks...");
			const sourcePaths = items.map((item) => item.path || "").filter(Boolean);
			duplicateCheck = await this.duplicateDetector.checkForDuplicates(sourcePaths);
		}

		const total = items.length;

		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const sourcePath = item.path || "";

			options.onProgress?.(i + 1, total, `Creating task ${i + 1} of ${total}...`);

			// Skip if already has a task
			if (options.skipExisting && duplicateCheck?.existingTaskPaths.has(sourcePath)) {
				result.skipped++;
				continue;
			}

			try {
				const taskFile = await this.createTaskForItem(item, options);
				if (taskFile) {
					result.created++;
					result.createdPaths.push(taskFile.path);
				} else {
					result.failed++;
					result.errors.push(`Failed to create task for: ${sourcePath}`);
				}
			} catch (error) {
				result.failed++;
				const errorMsg = error instanceof Error ? error.message : String(error);
				result.errors.push(`Error for ${sourcePath}: ${errorMsg}`);
			}
		}

		return result;
	}

	/**
	 * Create a single task for a Bases data item.
	 */
	private async createTaskForItem(
		item: BasesDataItem,
		options: BulkCreationOptions
	): Promise<TFile | null> {
		const title = extractTitle(item);
		const sourcePath = item.path || "";
		const props = item.properties || {};

		// Build task creation data
		const taskData: TaskCreationData = {
			title,
			creationContext: "manual-creation",
		};

		// Add project link if requested
		if (options.useParentAsProject && sourcePath) {
			const projectLink = generateProjectLink(sourcePath, this.plugin.app);
			taskData.projects = [projectLink];
		}

		// Copy relevant properties from source
		if (props.due) {
			taskData.due = String(props.due);
		}
		if (props.scheduled) {
			taskData.scheduled = String(props.scheduled);
		}
		if (props.priority) {
			taskData.priority = String(props.priority);
		}
		if (props.contexts && Array.isArray(props.contexts)) {
			taskData.contexts = props.contexts.map(String);
		}

		// Auto-set creator from device identity (if configured)
		if (this.plugin.userRegistry?.shouldAutoSetCreator()) {
			const creator = this.plugin.userRegistry.getCreatorValueForNewTask();
			if (creator) {
				const creatorField = this.plugin.userRegistry.getCreatorFieldName();
				(taskData as Record<string, unknown>)[creatorField] = creator;
			}
		}

		// Create the task using TaskService
		const result = await this.plugin.taskService.createTask(taskData);
		return result.file;
	}

	/**
	 * Pre-check items to determine how many will be created vs skipped.
	 *
	 * @param items - Array of Bases data items
	 * @param skipExisting - Whether to skip existing items
	 * @returns Object with counts of items to create and skip
	 */
	async preCheck(
		items: BasesDataItem[],
		skipExisting: boolean
	): Promise<{ toCreate: number; toSkip: number; existing: Set<string> }> {
		if (!skipExisting) {
			return { toCreate: items.length, toSkip: 0, existing: new Set() };
		}

		const sourcePaths = items.map((item) => item.path || "").filter(Boolean);
		const duplicateCheck = await this.duplicateDetector.checkForDuplicates(sourcePaths);

		const toSkip = duplicateCheck.existingTaskPaths.size;
		const toCreate = items.length - toSkip;

		return {
			toCreate,
			toSkip,
			existing: duplicateCheck.existingTaskPaths,
		};
	}
}
