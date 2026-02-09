import type TaskNotesPlugin from "../main";
import type { TaskInfo, FieldMapping } from "../types";
import { TFile } from "obsidian";
import { buildSkipKeys, normalizeDateValue, keyToDisplayName } from "./propertyDiscoveryUtils";

/**
 * Represents a date property that can serve as a reminder anchor.
 */
export interface DateAnchor {
	/** Internal/FieldMapping key (e.g., "due", "scheduled") or custom field key */
	key: string;
	/** Human-readable label (e.g., "Due date", "Review date") */
	displayName: string;
	/** Current date value on the task, if available */
	currentValue?: string;
}

/**
 * Built-in date fields that exist on TaskInfo and in FieldMapping.
 * The taskInfoKey matches the property name on the TaskInfo interface.
 */
const BUILT_IN_DATE_FIELDS: Array<{
	key: keyof FieldMapping;
	displayName: string;
	taskInfoKey: keyof TaskInfo;
}> = [
	{ key: "due", displayName: "Due date", taskInfoKey: "due" },
	{ key: "scheduled", displayName: "Scheduled date", taskInfoKey: "scheduled" },
	{ key: "dateCreated", displayName: "Date created", taskInfoKey: "dateCreated" },
	{ key: "dateModified", displayName: "Date modified", taskInfoKey: "dateModified" },
	{ key: "completedDate", displayName: "Completed date", taskInfoKey: "completedDate" },
];

/**
 * Get all available date properties that can serve as reminder anchors.
 * Combines built-in date fields with user-defined date fields from settings.
 *
 * @param plugin - The TaskNotes plugin instance
 * @param task - Optional task to populate currentValue for each anchor
 * @returns Array of DateAnchor objects
 */
export function getAvailableDateAnchors(
	plugin: TaskNotesPlugin,
	task?: TaskInfo
): DateAnchor[] {
	const anchors: DateAnchor[] = [];

	// Add built-in date fields
	for (const field of BUILT_IN_DATE_FIELDS) {
		const anchor: DateAnchor = {
			key: field.key as string,
			displayName: field.displayName,
		};

		if (task) {
			const value = task[field.taskInfoKey];
			if (typeof value === "string" && value) {
				anchor.currentValue = value;
			}
		}

		anchors.push(anchor);
	}

	// Add user-defined date fields from settings
	// buildSkipKeys includes CORE_PROPERTY_KEYS + FieldMapper-mapped frontmatter names
	const knownKeys = buildSkipKeys(plugin);
	// Also add built-in internal keys (some may differ from mapped names)
	for (const f of BUILT_IN_DATE_FIELDS) knownKeys.add(f.key as string);

	const userFields = plugin.settings?.userFields;
	if (userFields && Array.isArray(userFields)) {
		for (const field of userFields) {
			if (field.type === "date" && !knownKeys.has(field.key)) {
				const anchor: DateAnchor = {
					key: field.key,
					displayName: field.displayName || keyToDisplayName(field.key),
				};

				// Check customProperties on the task for user field values
				if (task?.customProperties && task.customProperties[field.key]) {
					const value = task.customProperties[field.key];
					if (typeof value === "string" && value) {
						anchor.currentValue = value;
					}
				}

				knownKeys.add(field.key);
				anchors.push(anchor);
			}
		}
	}

	// Auto-discover date properties from task frontmatter
	// This catches custom date fields that aren't configured as user fields
	if (task?.path && plugin.app) {
		const file = plugin.app.vault.getAbstractFileByPath(task.path);
		if (file instanceof TFile) {
			const cache = plugin.app.metadataCache.getFileCache(file);
			if (cache?.frontmatter) {
				for (const [key, value] of Object.entries(cache.frontmatter)) {
					if (knownKeys.has(key)) continue;

					// Check if the value looks like a date (handles both strings and Date objects)
					const dateStr = normalizeDateValue(value);
					if (dateStr) {
						anchors.push({
							key,
							displayName: keyToDisplayName(key),
							currentValue: dateStr,
						});
						knownKeys.add(key);
					}
				}
			}
		}
	}

	// Also check task.customProperties for date values not yet found
	if (task?.customProperties) {
		for (const [key, value] of Object.entries(task.customProperties)) {
			if (knownKeys.has(key)) continue;
			const dateStr = normalizeDateValue(value);
			if (dateStr) {
				anchors.push({
					key,
					displayName: keyToDisplayName(key),
					currentValue: dateStr,
				});
				knownKeys.add(key);
			}
		}
	}

	return anchors;
}

/**
 * Resolve a date anchor key to an actual date string from a task.
 * Handles built-in fields (via TaskInfo properties) and custom fields
 * (via customProperties or raw frontmatter lookup).
 *
 * @param task - The task to resolve the date from
 * @param anchorKey - The anchor key (e.g., "due", "scheduled", or custom field key)
 * @param plugin - The TaskNotes plugin instance (for FieldMapper and metadataCache fallback)
 * @returns The date string, or null if not found
 */
export function resolveAnchorDate(
	task: TaskInfo,
	anchorKey: string,
	plugin: TaskNotesPlugin
): string | null {
	if (!anchorKey) return null;

	// 1. Check built-in TaskInfo fields
	const builtIn = BUILT_IN_DATE_FIELDS.find((f) => f.key === anchorKey);
	if (builtIn) {
		const value = task[builtIn.taskInfoKey];
		if (typeof value === "string" && value) {
			return value;
		}
	}

	// 2. Check customProperties (populated by Bases views)
	if (task.customProperties?.[anchorKey]) {
		const value = task.customProperties[anchorKey];
		if (typeof value === "string" && value) {
			return value;
		}
	}

	// 3. Fallback: read raw frontmatter from metadataCache
	// This handles custom user date fields that aren't in customProperties
	if (task.path && plugin.app) {
		const file = plugin.app.vault.getAbstractFileByPath(task.path);
		if (file instanceof TFile) {
			const cache = plugin.app.metadataCache.getFileCache(file);
			if (cache?.frontmatter) {
				// Try the anchor key directly (for custom fields stored with their key)
				const directValue = cache.frontmatter[anchorKey];
				const normalizedDirect = normalizeDateValue(directValue);
				if (normalizedDirect) {
					return normalizedDirect;
				}

				// Try the user-configured field name via FieldMapper
				// (in case anchorKey is an internal name that maps to a different frontmatter key)
				if (plugin.fieldMapper) {
					try {
						const userFieldName = plugin.fieldMapper.toUserField(
							anchorKey as keyof FieldMapping
						);
						if (userFieldName && userFieldName !== anchorKey) {
							const mappedValue = cache.frontmatter[userFieldName];
							const normalizedMapped = normalizeDateValue(mappedValue);
							if (normalizedMapped) {
								return normalizedMapped;
							}
						}
					} catch {
						// anchorKey is not a valid FieldMapping key, skip
					}
				}
			}
		}
	}

	return null;
}

/**
 * Get a human-readable display name for an anchor key.
 * Checks built-in fields first, then user-defined fields.
 */
export function getAnchorDisplayName(
	anchorKey: string,
	plugin: TaskNotesPlugin
): string {
	// Check built-in fields
	const builtIn = BUILT_IN_DATE_FIELDS.find((f) => f.key === anchorKey);
	if (builtIn) return builtIn.displayName;

	// Check user-defined fields
	const userFields = plugin.settings?.userFields;
	if (userFields && Array.isArray(userFields)) {
		const userField = userFields.find((f) => f.key === anchorKey);
		if (userField) return userField.displayName || userField.key;
	}

	// Fallback: convert key to readable name
	return keyToDisplayName(anchorKey);
}
