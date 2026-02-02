/**
 * Bulk operations module.
 *
 * Exports engines for bulk task creation and conversion, plus unified result types.
 */

// Engines
export { BulkTaskEngine } from "./bulk-task-engine";
export type { BulkCreationOptions, BulkCreationResult } from "./bulk-task-engine";

export { BulkConvertEngine } from "./bulk-convert-engine";
export type {
	BulkConvertOptions,
	BulkConvertResult,
	ConvertPreCheckResult,
} from "./bulk-convert-engine";

// Duplicate detection
export { DuplicateDetector } from "./duplicate-detector";
export type { DuplicateCheckResult } from "./duplicate-detector";

// Unified types
export type { BulkOperationResult } from "./types";
export {
	createEmptyResult,
	mergeResults,
	formatResultNotice,
	fromCreationResult,
	fromConvertResult,
} from "./types";
