/**
 * Per-task field override utilities.
 *
 * Allows individual tasks to map custom frontmatter properties to core date
 * fields (e.g., "deadline" → due). Tracking properties like `tnDueDateProp`
 * are written to the task's frontmatter to record these overrides.
 */

/**
 * Maps internal field keys to the frontmatter tracking property names
 * that record per-task overrides.
 *
 * Example: A task with `tnDueDateProp: "deadline"` in frontmatter
 * means "read/write the due date from the `deadline` property instead
 * of the default `due` property."
 */
export const FIELD_OVERRIDE_PROPS = {
	due: "tnDueDateProp",
	scheduled: "tnScheduledDateProp",
	completedDate: "tnCompletedDateProp",
	dateCreated: "tnCreatedDateProp",
} as const;

/** Internal field keys that support per-task overrides. */
export type OverridableField = keyof typeof FIELD_OVERRIDE_PROPS;

/** All tracking property names (for use in skip/blocklists). */
export const TRACKING_PROP_NAMES = new Set(Object.values(FIELD_OVERRIDE_PROPS));

/** Human-readable labels for each overridable field. */
export const OVERRIDABLE_FIELD_LABELS: Record<OverridableField, string> = {
	due: "Due date",
	scheduled: "Scheduled date",
	completedDate: "Completed date",
	dateCreated: "Created date",
};

/**
 * Read field overrides from a task's frontmatter.
 *
 * Scans for tracking properties (tnDueDateProp, etc.) and returns
 * a map of internal field key → custom property name.
 *
 * @example
 * // frontmatter: { tnDueDateProp: "deadline", tnScheduledDateProp: "review_date" }
 * readFieldOverrides(frontmatter)
 * // Returns: { due: "deadline", scheduled: "review_date" }
 */
export function readFieldOverrides(
	frontmatter: Record<string, any> | null | undefined
): Record<string, string> {
	if (!frontmatter) return {};

	const overrides: Record<string, string> = {};

	for (const [internalKey, trackingProp] of Object.entries(FIELD_OVERRIDE_PROPS)) {
		const customPropName = frontmatter[trackingProp];
		if (typeof customPropName === "string" && customPropName.trim()) {
			overrides[internalKey] = customPropName.trim();
		}
	}

	return overrides;
}

/**
 * Write field overrides to a frontmatter object.
 *
 * For each override, writes the tracking property (e.g., tnDueDateProp: "deadline").
 * Removes tracking properties for fields that are no longer overridden.
 *
 * @example
 * writeFieldOverrides(frontmatter, { due: "deadline" })
 * // Sets frontmatter.tnDueDateProp = "deadline"
 * // Deletes frontmatter.tnScheduledDateProp (if no scheduled override)
 */
export function writeFieldOverrides(
	frontmatter: Record<string, any>,
	overrides: Record<string, string>
): void {
	for (const [internalKey, trackingProp] of Object.entries(FIELD_OVERRIDE_PROPS)) {
		if (overrides[internalKey]) {
			frontmatter[trackingProp] = overrides[internalKey];
		} else {
			delete frontmatter[trackingProp];
		}
	}
}

/**
 * Resolve the actual frontmatter property name for a given internal field,
 * considering per-task overrides.
 *
 * @param internalKey - The internal field key (e.g., "due")
 * @param overrides - Per-task overrides from readFieldOverrides()
 * @param globalMapping - The global field name from FieldMapping (e.g., "due")
 * @returns The frontmatter property name to read/write
 */
export function resolveFieldName(
	internalKey: string,
	overrides: Record<string, string>,
	globalMapping: string
): string {
	return overrides[internalKey] || globalMapping;
}
