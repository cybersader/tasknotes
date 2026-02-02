/**
 * PersonNoteService - Reads preferences from person notes
 *
 * Person notes have `type: person` in frontmatter and can include
 * notification preferences like reminderTime and reminderLeadTimes.
 *
 * Features:
 * - Reads person preferences from frontmatter
 * - Caches preferences for performance
 * - Provides defaults when preferences are not set
 */

import { TFile } from "obsidian";
import type TaskNotesPlugin from "../main";
import type { PersonPreferences, LeadTime } from "../types/settings";

// Re-export types for convenience
export type { PersonPreferences, LeadTime } from "../types/settings";

/**
 * Default preferences for person notes without explicit configuration.
 */
export const DEFAULT_PERSON_PREFERENCES: PersonPreferences = {
	reminderTime: "09:00",
	reminderLeadTimes: [
		{ value: 1, unit: "days" },
		{ value: 15, unit: "minutes" },
	],
	notificationEnabled: true,
};

export class PersonNoteService {
	private plugin: TaskNotesPlugin;
	private preferencesCache: Map<string, PersonPreferences> = new Map();

	constructor(plugin: TaskNotesPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Get preferences for a person note.
	 * Returns cached value if available, otherwise reads from file.
	 */
	getPreferences(personPath: string): PersonPreferences {
		// Check cache first
		const cached = this.preferencesCache.get(personPath);
		if (cached) {
			return cached;
		}

		// Read from file
		const preferences = this.readPreferencesFromFile(personPath);
		this.preferencesCache.set(personPath, preferences);
		return preferences;
	}

	/**
	 * Read preferences from a person note's frontmatter.
	 */
	private readPreferencesFromFile(personPath: string): PersonPreferences {
		const file = this.plugin.app.vault.getAbstractFileByPath(personPath);
		if (!(file instanceof TFile)) {
			return { ...DEFAULT_PERSON_PREFERENCES };
		}

		const cache = this.plugin.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;

		if (!fm) {
			return { ...DEFAULT_PERSON_PREFERENCES };
		}

		// Build preferences from frontmatter with defaults
		const preferences: PersonPreferences = {
			reminderTime: this.parseReminderTime(fm.reminderTime),
			reminderLeadTimes: this.parseLeadTimes(fm.reminderLeadTimes),
			notificationEnabled: this.parseBoolean(
				fm.notificationEnabled,
				DEFAULT_PERSON_PREFERENCES.notificationEnabled
			),
		};

		return preferences;
	}

	/**
	 * Parse reminderTime from frontmatter.
	 * Expects "HH:MM" format.
	 */
	private parseReminderTime(value: unknown): string {
		if (typeof value === "string" && /^\d{1,2}:\d{2}$/.test(value)) {
			return value;
		}
		return DEFAULT_PERSON_PREFERENCES.reminderTime;
	}

	/**
	 * Parse reminderLeadTimes from frontmatter.
	 * Expects array of { value: number, unit: string }.
	 */
	private parseLeadTimes(value: unknown): LeadTime[] {
		if (!Array.isArray(value)) {
			return [...DEFAULT_PERSON_PREFERENCES.reminderLeadTimes];
		}

		const validUnits = ["minutes", "hours", "days", "weeks"];
		const leadTimes: LeadTime[] = [];

		for (const item of value) {
			if (
				typeof item === "object" &&
				item !== null &&
				typeof item.value === "number" &&
				typeof item.unit === "string" &&
				validUnits.includes(item.unit)
			) {
				leadTimes.push({
					value: item.value,
					unit: item.unit as LeadTime["unit"],
				});
			}
		}

		return leadTimes.length > 0
			? leadTimes
			: [...DEFAULT_PERSON_PREFERENCES.reminderLeadTimes];
	}

	/**
	 * Parse a boolean value with a default.
	 */
	private parseBoolean(value: unknown, defaultValue: boolean): boolean {
		if (typeof value === "boolean") {
			return value;
		}
		if (value === "true") return true;
		if (value === "false") return false;
		return defaultValue;
	}

	/**
	 * Invalidate cached preferences for a path.
	 * Call this when a person note is modified.
	 */
	invalidateCache(path: string): void {
		this.preferencesCache.delete(path);
	}

	/**
	 * Clear all cached preferences.
	 */
	clearCache(): void {
		this.preferencesCache.clear();
	}

	/**
	 * Get the notification time for a person.
	 * Parses the reminderTime into hours and minutes.
	 */
	getNotificationTime(personPath: string): { hours: number; minutes: number } {
		const prefs = this.getPreferences(personPath);
		const [hours, minutes] = prefs.reminderTime.split(":").map(Number);
		return {
			hours: isNaN(hours) ? 9 : hours,
			minutes: isNaN(minutes) ? 0 : minutes,
		};
	}

	/**
	 * Check if notifications are enabled for a person.
	 */
	isNotificationEnabled(personPath: string): boolean {
		return this.getPreferences(personPath).notificationEnabled;
	}

	/**
	 * Convert lead times to milliseconds for a specific person.
	 * Returns an array of millisecond values.
	 */
	getLeadTimesInMs(personPath: string): number[] {
		const prefs = this.getPreferences(personPath);
		return prefs.reminderLeadTimes.map((lt) => this.leadTimeToMs(lt));
	}

	/**
	 * Convert a single lead time to milliseconds.
	 */
	private leadTimeToMs(leadTime: LeadTime): number {
		const multipliers: Record<LeadTime["unit"], number> = {
			minutes: 60 * 1000,
			hours: 60 * 60 * 1000,
			days: 24 * 60 * 60 * 1000,
			weeks: 7 * 24 * 60 * 60 * 1000,
		};
		return leadTime.value * multipliers[leadTime.unit];
	}
}
