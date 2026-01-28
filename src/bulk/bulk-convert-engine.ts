/**
 * Bulk convert engine.
 * Converts existing notes into tasks by adding task metadata to their frontmatter in-place.
 * Does NOT create new files — modifies existing notes.
 */

import { TFile } from "obsidian";
import TaskNotesPlugin from "../main";
import { BasesDataItem } from "../bases/helpers";
import { getCurrentTimestamp } from "../utils/dateUtils";

export interface BulkConvertOptions {
	/** Apply default status, priority, and dateCreated to converted notes */
	applyDefaults: boolean;
	/** Link converted notes to their source .base file via projects field */
	linkToBase?: boolean;
	/** Path of the .base file to link to */
	baseFilePath?: string;
	/** Callback for progress updates */
	onProgress?: (current: number, total: number, status: string) => void;
}

export interface BulkConvertResult {
	/** Number of notes successfully converted */
	converted: number;
	/** Number of notes skipped (already tasks or non-markdown) */
	skipped: number;
	/** Number of notes that failed to convert */
	failed: number;
	/** Error messages for failed items */
	errors: string[];
	/** Paths of converted note files */
	convertedPaths: string[];
}

export interface ConvertPreCheckResult {
	toConvert: number;
	alreadyTasks: number;
	alreadyTaskPaths: Set<string>;
	/** Non-markdown files that will be skipped */
	nonMarkdown: number;
	nonMarkdownPaths: Set<string>;
	/** Breakdown of non-markdown files by extension: ext -> [filenames] */
	fileTypeBreakdown: Map<string, string[]>;
}

/**
 * BulkConvertEngine handles converting existing notes into tasks
 * by adding task identification metadata to their frontmatter.
 */
export class BulkConvertEngine {
	constructor(private plugin: TaskNotesPlugin) {}

	/**
	 * Pre-check items to determine how many can be converted vs already tasks.
	 */
	async preCheck(items: BasesDataItem[]): Promise<ConvertPreCheckResult> {
		const alreadyTaskPaths = new Set<string>();
		const nonMarkdownPaths = new Set<string>();
		const fileTypeBreakdown = new Map<string, string[]>();

		console.log("[BulkConvertEngine] preCheck:", {
			itemCount: items.length,
			itemPaths: items.map((item) => item.path || "(no path)"),
		});

		for (const item of items) {
			const sourcePath = item.path || "";
			if (!sourcePath) continue;

			const file = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
			if (!(file instanceof TFile)) continue;

			// Skip non-markdown files (e.g., .xlsx, .pdf, .png)
			if (file.extension !== "md") {
				nonMarkdownPaths.add(sourcePath);
				// Track by extension for breakdown
				const ext = file.extension.toLowerCase();
				if (!fileTypeBreakdown.has(ext)) {
					fileTypeBreakdown.set(ext, []);
				}
				fileTypeBreakdown.get(ext)!.push(file.basename);
				continue;
			}

			const metadata = this.plugin.app.metadataCache.getFileCache(file);
			const frontmatter = metadata?.frontmatter;
			if (frontmatter && this.plugin.cacheManager.isTaskFile(frontmatter)) {
				alreadyTaskPaths.add(sourcePath);
			}
		}

		const alreadyTasks = alreadyTaskPaths.size;
		const nonMarkdown = nonMarkdownPaths.size;
		const toConvert = items.length - alreadyTasks - nonMarkdown;

		console.log("[BulkConvertEngine] preCheck result:", {
			toConvert,
			alreadyTasks,
			nonMarkdown,
			alreadyTaskPaths: [...alreadyTaskPaths],
			nonMarkdownPaths: [...nonMarkdownPaths],
			fileTypeBreakdown: Object.fromEntries(fileTypeBreakdown),
		});

		return { toConvert, alreadyTasks, alreadyTaskPaths, nonMarkdown, nonMarkdownPaths, fileTypeBreakdown };
	}

	/**
	 * Convert notes into tasks by adding task metadata to their frontmatter.
	 */
	async convertNotes(
		items: BasesDataItem[],
		options: BulkConvertOptions
	): Promise<BulkConvertResult> {
		const result: BulkConvertResult = {
			converted: 0,
			skipped: 0,
			failed: 0,
			errors: [],
			convertedPaths: [],
		};

		if (items.length === 0) {
			return result;
		}

		// Pre-check which are already tasks
		options.onProgress?.(0, items.length, "Checking existing tasks...");
		const preCheck = await this.preCheck(items);

		const total = items.length;

		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const sourcePath = item.path || "";

			options.onProgress?.(i + 1, total, `Converting ${i + 1} of ${total}...`);

			// Skip non-markdown files (e.g., .xlsx, .pdf, .png)
			if (preCheck.nonMarkdownPaths.has(sourcePath)) {
				console.log("[BulkConvertEngine] Skipping (non-markdown):", sourcePath);
				result.skipped++;
				continue;
			}

			// Skip if already a task
			if (preCheck.alreadyTaskPaths.has(sourcePath)) {
				console.log("[BulkConvertEngine] Skipping (already task):", sourcePath);
				result.skipped++;
				continue;
			}

			// Skip if no valid file
			const file = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
			if (!(file instanceof TFile)) {
				result.failed++;
				result.errors.push(`File not found: ${sourcePath}`);
				continue;
			}

			try {
				await this.convertSingleNote(file, options);
				result.converted++;
				result.convertedPaths.push(sourcePath);
			} catch (error) {
				result.failed++;
				const errorMsg = error instanceof Error ? error.message : String(error);
				result.errors.push(`Error for ${sourcePath}: ${errorMsg}`);
			}
		}

		return result;
	}

	/**
	 * Convert a single note into a task by modifying its frontmatter.
	 * Existing frontmatter fields are NEVER overwritten — only missing fields are added.
	 */
	private async convertSingleNote(file: TFile, options: BulkConvertOptions): Promise<void> {
		const settings = this.plugin.settings;
		const fieldMapper = this.plugin.fieldMapper;

		await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
			// Step 1: Add task identification
			if (settings.taskIdentificationMethod === "property") {
				// Property method: set the configured property
				const propName = settings.taskPropertyName;
				const propValue = settings.taskPropertyValue;
				// Set if missing OR if empty string (fixes buggy conversions from older versions)
				if (propName && (frontmatter[propName] === undefined || frontmatter[propName] === "")) {
					// Parse "true"/"false" strings as booleans, default to true if empty
					if (propValue === "true" || propValue === "") {
						frontmatter[propName] = true;
					} else if (propValue === "false") {
						frontmatter[propName] = false;
					} else {
						frontmatter[propName] = propValue;
					}
				}
			} else {
				// Tag method: ensure tags array includes the task tag
				const taskTag = settings.taskTag || "task";
				if (!Array.isArray(frontmatter.tags)) {
					frontmatter.tags = [];
				}
				if (!frontmatter.tags.includes(taskTag)) {
					frontmatter.tags.push(taskTag);
				}
			}

			// Step 2: Apply defaults (only if missing)
			if (options.applyDefaults) {
				const statusField = fieldMapper.toUserField("status");
				if (frontmatter[statusField] === undefined) {
					frontmatter[statusField] = settings.defaultTaskStatus || "open";
				}

				const priorityField = fieldMapper.toUserField("priority");
				if (frontmatter[priorityField] === undefined) {
					frontmatter[priorityField] = settings.defaultTaskPriority || "normal";
				}

				const dateCreatedField = fieldMapper.toUserField("dateCreated");
				if (frontmatter[dateCreatedField] === undefined) {
					frontmatter[dateCreatedField] = getCurrentTimestamp();
				}
			}

			// Step 2.5: Link to base view if requested
			if (options.linkToBase && options.baseFilePath) {
				const projectsField = fieldMapper.toUserField("projects");
				const baseFileRef = this.plugin.app.vault.getAbstractFileByPath(options.baseFilePath);
				if (baseFileRef instanceof TFile) {
					const link = this.plugin.app.fileManager.generateMarkdownLink(baseFileRef, file.path);
					if (frontmatter[projectsField] === undefined) {
						frontmatter[projectsField] = [link];
					} else if (Array.isArray(frontmatter[projectsField])) {
						if (!frontmatter[projectsField].includes(link)) {
							frontmatter[projectsField].push(link);
						}
					}
				}
			}

			// Step 3: Always update dateModified
			const dateModifiedField = fieldMapper.toUserField("dateModified");
			frontmatter[dateModifiedField] = getCurrentTimestamp();
		});

		// Wait for metadata cache to index the changes
		if (this.plugin.cacheManager.waitForFreshTaskData) {
			await this.plugin.cacheManager.waitForFreshTaskData(file);
		}
	}
}
