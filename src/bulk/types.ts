/**
 * Shared types for bulk operations.
 *
 * All bulk operation implementations (BulkTaskEngine, BulkConvertEngine,
 * BulkRescheduleModal, BatchContextMenu) should return BulkOperationResult
 * for consistent result handling.
 */

/**
 * Unified result type for all bulk operations.
 * Provides consistent structure for UI to display results.
 */
export interface BulkOperationResult {
	/** Type of operation performed */
	operationType:
		| "create"
		| "convert"
		| "reschedule"
		| "update"
		| "archive"
		| "delete"
		| "complete";

	/** Number of items successfully processed */
	succeeded: number;

	/** Number of items skipped (already exists, not applicable, etc.) */
	skipped: number;

	/** Number of items that failed */
	failed: number;

	/** Error messages for debugging */
	errors: string[];

	/** Paths of files that were modified (for UI refresh) */
	affectedPaths: string[];
}

/**
 * Creates a new empty result object.
 */
export function createEmptyResult(
	operationType: BulkOperationResult["operationType"]
): BulkOperationResult {
	return {
		operationType,
		succeeded: 0,
		skipped: 0,
		failed: 0,
		errors: [],
		affectedPaths: [],
	};
}

/**
 * Merges multiple results into one.
 * Useful when combining results from parallel operations.
 */
export function mergeResults(
	results: BulkOperationResult[]
): BulkOperationResult {
	if (results.length === 0) {
		return createEmptyResult("update");
	}

	const merged: BulkOperationResult = {
		operationType: results[0].operationType,
		succeeded: 0,
		skipped: 0,
		failed: 0,
		errors: [],
		affectedPaths: [],
	};

	for (const result of results) {
		merged.succeeded += result.succeeded;
		merged.skipped += result.skipped;
		merged.failed += result.failed;
		merged.errors.push(...result.errors);
		merged.affectedPaths.push(...result.affectedPaths);
	}

	// Deduplicate paths
	merged.affectedPaths = [...new Set(merged.affectedPaths)];

	return merged;
}

/**
 * Formats a result for display in a Notice.
 */
export function formatResultNotice(result: BulkOperationResult): string {
	const parts: string[] = [];

	if (result.succeeded > 0) {
		parts.push(`${result.succeeded} succeeded`);
	}
	if (result.skipped > 0) {
		parts.push(`${result.skipped} skipped`);
	}
	if (result.failed > 0) {
		parts.push(`${result.failed} failed`);
	}

	if (parts.length === 0) {
		return "No items processed";
	}

	return parts.join(", ");
}

/**
 * Convert BulkCreationResult to unified BulkOperationResult.
 */
export function fromCreationResult(result: {
	created: number;
	skipped: number;
	failed: number;
	errors: string[];
	createdPaths: string[];
}): BulkOperationResult {
	return {
		operationType: "create",
		succeeded: result.created,
		skipped: result.skipped,
		failed: result.failed,
		errors: result.errors,
		affectedPaths: result.createdPaths,
	};
}

/**
 * Convert BulkConvertResult to unified BulkOperationResult.
 */
export function fromConvertResult(result: {
	converted: number;
	skipped: number;
	failed: number;
	errors: string[];
	convertedPaths: string[];
}): BulkOperationResult {
	return {
		operationType: "convert",
		succeeded: result.converted,
		skipped: result.skipped,
		failed: result.failed,
		errors: result.errors,
		affectedPaths: result.convertedPaths,
	};
}
