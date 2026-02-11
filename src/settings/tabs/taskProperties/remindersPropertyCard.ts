import { setIcon } from "obsidian";
import TaskNotesPlugin from "../../../main";
import { DefaultReminder, GlobalReminderRule } from "../../../types/settings";
import { getAvailableDateAnchors, getAnchorDisplayName } from "../../../utils/dateAnchorUtils";
import type { TranslationKey } from "../../../i18n";
import {
	createCard,
	createCardInput,
	createDeleteHeaderButton,
	showCardEmptyState,
	createCardNumberInput,
	createCardSelect,
	CardRow,
} from "../../components/CardComponent";
import { createPropertyDescription, TranslateFn } from "./helpers";

/**
 * Renders the Reminders property card with nested default reminders
 */
export function renderRemindersPropertyCard(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	save: () => void,
	translate: TranslateFn
): void {
	const propertyKeyInput = createCardInput(
		"text",
		"reminders",
		plugin.settings.fieldMapping.reminders
	);

	propertyKeyInput.addEventListener("change", () => {
		plugin.settings.fieldMapping.reminders = propertyKeyInput.value;
		save();
	});

	// Create nested content for default reminders
	const nestedContainer = document.createElement("div");
	nestedContainer.addClass("tasknotes-settings__nested-cards");

	// Timeline preview — placed above both sections
	const timelineContainer = nestedContainer.createDiv("tn-reminder-timeline");
	let timelineDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	const refreshTimeline = () => {
		if (timelineDebounceTimer) clearTimeout(timelineDebounceTimer);
		timelineDebounceTimer = setTimeout(() => renderReminderTimeline(timelineContainer, plugin, nestedContainer), 300);
	};
	// Initial render (no debounce)
	renderReminderTimeline(timelineContainer, plugin, nestedContainer);

	// Create collapsible section for default reminders
	const remindersSection = nestedContainer.createDiv("tasknotes-settings__collapsible-section tn-reminders-section tn-reminders-section--default");

	const remindersHeader = remindersSection.createDiv("tasknotes-settings__collapsible-section-header");
	remindersHeader.createSpan({ text: translate("settings.taskProperties.remindersCard.defaultReminders"), cls: "tasknotes-settings__collapsible-section-title" });
	const chevron = remindersHeader.createSpan("tasknotes-settings__collapsible-section-chevron");
	chevron.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

	const remindersContent = remindersSection.createDiv("tasknotes-settings__collapsible-section-content");

	const defaultDesc = remindersContent.createEl("p", {
		text: "Pre-configured reminders added automatically to every new task. Written to each task's frontmatter at creation time.",
		cls: "setting-item-description",
	});
	defaultDesc.style.cssText = "margin: 0 0 0.5rem 0; font-size: var(--font-ui-smaller); color: var(--text-muted);";

	// Render reminder cards
	const remindersListContainer = remindersContent.createDiv("tasknotes-reminders-container");
	renderRemindersList(remindersListContainer, plugin, save, translate, refreshTimeline);

	// Add reminder button
	const addReminderButton = remindersContent.createEl("button", {
		cls: "tn-btn tn-btn--ghost",
	});
	addReminderButton.style.cssText = "margin-top: 0.5rem; display: inline-flex; align-items: center; gap: 4px;";
	const addReminderIcon = addReminderButton.createSpan();
	addReminderIcon.style.cssText = "display: inline-flex; width: 16px; height: 16px;";
	setIcon(addReminderIcon, "plus");
	addReminderButton.createSpan({ text: translate("settings.defaults.reminders.addReminder.buttonText") });
	addReminderButton.onclick = () => {
		const newId = `reminder_${Date.now()}`;
		const newReminder = {
			id: newId,
			type: "relative" as const,
			relatedTo: "due" as const,
			offset: 1,
			unit: "hours" as const,
			direction: "before" as const,
			description: "Reminder",
		};
		plugin.settings.taskCreationDefaults.defaultReminders =
			plugin.settings.taskCreationDefaults.defaultReminders || [];
		plugin.settings.taskCreationDefaults.defaultReminders.push(newReminder);
		save();
		renderRemindersList(remindersListContainer, plugin, save, translate, refreshTimeline);
		refreshTimeline();
	};

	// Toggle collapse
	remindersHeader.addEventListener("click", () => {
		remindersSection.toggleClass("tasknotes-settings__collapsible-section--collapsed",
			!remindersSection.hasClass("tasknotes-settings__collapsible-section--collapsed"));
	});

	// --- Global reminders section ---
	const globalSection = nestedContainer.createDiv("tasknotes-settings__collapsible-section tn-reminders-section tn-reminders-section--global");

	const globalHeader = globalSection.createDiv("tasknotes-settings__collapsible-section-header");
	globalHeader.createSpan({ text: "Global reminders (all tasks)", cls: "tasknotes-settings__collapsible-section-title" });
	const globalChevron = globalHeader.createSpan("tasknotes-settings__collapsible-section-chevron");
	globalChevron.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

	const globalContent = globalSection.createDiv("tasknotes-settings__collapsible-section-content");

	const globalDesc = globalContent.createEl("p", {
		text: "Applied to all tasks with matching date fields. Evaluated at notification check time, never written to task files. Useful for vault-wide lead-time or overdue notifications.",
		cls: "setting-item-description",
	});
	globalDesc.style.cssText = "margin: 0 0 0.5rem 0; font-size: var(--font-ui-smaller); color: var(--text-muted);";

	// Cross-link to Features > Notifications
	const notifLinkPara = globalContent.createEl("p", {
		cls: "setting-item-description",
	});
	notifLinkPara.style.cssText = "margin: 0 0 0.5rem 0; font-size: var(--font-ui-smaller);";
	notifLinkPara.appendText("Configure notification delivery and behavior in ");
	const notifLink = notifLinkPara.createEl("a", {
		text: "Features \u2192 Notifications \u2192",
		href: "#",
	});
	notifLink.style.cssText = "cursor: pointer; color: var(--text-accent);";
	notifLink.addEventListener("click", (e) => {
		e.preventDefault();
		navigateToFeatureNotifications(plugin);
	});

	const globalListContainer = globalContent.createDiv("tasknotes-reminders-container");
	renderGlobalRemindersList(globalListContainer, plugin, save, translate, refreshTimeline);

	const addGlobalButton = globalContent.createEl("button", {
		cls: "tn-btn tn-btn--ghost",
	});
	addGlobalButton.style.cssText = "margin-top: 0.5rem; display: inline-flex; align-items: center; gap: 4px;";
	const addGlobalIcon = addGlobalButton.createSpan();
	addGlobalIcon.style.cssText = "display: inline-flex; width: 16px; height: 16px;";
	setIcon(addGlobalIcon, "plus");
	addGlobalButton.createSpan({ text: "Add global reminder" });
	addGlobalButton.onclick = () => {
		const newRule: GlobalReminderRule = {
			id: `global_${Date.now()}`,
			enabled: true,
			semanticType: "lead-time",
			description: "New reminder",
			anchorProperty: "due",
			offset: "-P1D",
			skipIfExplicitExists: true,
		};
		plugin.settings.globalReminderRules = plugin.settings.globalReminderRules || [];
		plugin.settings.globalReminderRules.push(newRule);
		save();
		renderGlobalRemindersList(globalListContainer, plugin, save, translate, refreshTimeline);
		refreshTimeline();
	};

	globalHeader.addEventListener("click", () => {
		globalSection.toggleClass("tasknotes-settings__collapsible-section--collapsed",
			!globalSection.hasClass("tasknotes-settings__collapsible-section--collapsed"));
	});

	// Create description element
	const descriptionEl = createPropertyDescription(
		translate("settings.taskProperties.properties.reminders.description")
	);

	const rows: CardRow[] = [
		{ label: "", input: descriptionEl, fullWidth: true },
		{ label: translate("settings.taskProperties.propertyCard.propertyKey"), input: propertyKeyInput },
		{ label: "", input: nestedContainer, fullWidth: true },
	];

	createCard(container, {
		id: "property-reminders",
		collapsible: true,
		defaultCollapsed: true,
		header: {
			primaryText: translate("settings.taskProperties.properties.reminders.name"),
			secondaryText: plugin.settings.fieldMapping.reminders,
		},
		content: {
			sections: [{ rows }],
		},
	});
}

/**
 * Renders the list of default reminder cards
 */
function renderRemindersList(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	save: () => void,
	translate: TranslateFn,
	onTimelineRefresh?: () => void
): void {
	container.empty();

	if (
		!plugin.settings.taskCreationDefaults.defaultReminders ||
		plugin.settings.taskCreationDefaults.defaultReminders.length === 0
	) {
		showCardEmptyState(
			container,
			translate("settings.defaults.reminders.emptyState")
		);
		return;
	}

	plugin.settings.taskCreationDefaults.defaultReminders.forEach((reminder, index) => {
		const timingText = formatReminderTiming(reminder, translate, plugin);

		const descInput = createCardInput(
			"text",
			translate("settings.defaults.reminders.reminderDescription"),
			reminder.description
		);

		const typeSelect = createCardSelect(
			[
				{
					value: "relative",
					label: translate("settings.defaults.reminders.types.relative"),
				},
				{
					value: "absolute",
					label: translate("settings.defaults.reminders.types.absolute"),
				},
			],
			reminder.type
		);

		const updateCallback = (updates: Partial<DefaultReminder>) => {
			Object.assign(reminder, updates);
			save();
			onTimelineRefresh?.();
			const card = container.querySelector(`[data-card-id="${reminder.id}"]`);
			if (card) {
				const secondaryText = card.querySelector(
					".tasknotes-settings__card-secondary-text"
				);
				if (secondaryText) {
					secondaryText.textContent = formatReminderTiming(reminder, translate, plugin);
				}
			}
		};

		const configRows =
			reminder.type === "relative"
				? renderRelativeReminderConfig(reminder, updateCallback, translate, plugin)
				: renderAbsoluteReminderConfig(reminder, updateCallback, translate);

		const card = createCard(container, {
			id: reminder.id,
			collapsible: true,
			defaultCollapsed: true,
			header: {
				primaryText:
					reminder.description ||
					translate("settings.defaults.reminders.unnamedReminder"),
				secondaryText: timingText,
				actions: [
					createDeleteHeaderButton(() => {
						plugin.settings.taskCreationDefaults.defaultReminders.splice(index, 1);
						save();
						onTimelineRefresh?.();
						renderRemindersList(container, plugin, save, translate, onTimelineRefresh);
					}, translate("settings.defaults.reminders.deleteTooltip")),
				],
			},
			content: {
				sections: [
					{
						rows: [
							{
								label: translate("settings.defaults.reminders.fields.description"),
								input: descInput,
							},
							{
								label: translate("settings.defaults.reminders.fields.type"),
								input: typeSelect,
							},
						],
					},
					{
						rows: configRows,
					},
				],
			},
		});

		descInput.addEventListener("input", () => {
			reminder.description = descInput.value;
			save();
			const primaryText = card.querySelector(".tasknotes-settings__card-primary-text");
			if (primaryText) {
				primaryText.textContent =
					reminder.description ||
					translate("settings.defaults.reminders.unnamedReminder");
			}
		});

		typeSelect.addEventListener("change", () => {
			reminder.type = typeSelect.value as "relative" | "absolute";
			save();
			onTimelineRefresh?.();
			renderRemindersList(container, plugin, save, translate, onTimelineRefresh);
		});
	});
}

function renderRelativeReminderConfig(
	reminder: DefaultReminder,
	updateItem: (updates: Partial<DefaultReminder>) => void,
	translate: TranslateFn,
	plugin: TaskNotesPlugin
): CardRow[] {
	const offsetInput = createCardNumberInput(0, undefined, 1, reminder.offset);
	offsetInput.addEventListener("input", () => {
		const offset = parseInt(offsetInput.value);
		if (!isNaN(offset) && offset >= 0) {
			updateItem({ offset });
		}
	});

	const unitSelect = createCardSelect(
		[
			{ value: "minutes", label: translate("settings.defaults.reminders.units.minutes") },
			{ value: "hours", label: translate("settings.defaults.reminders.units.hours") },
			{ value: "days", label: translate("settings.defaults.reminders.units.days") },
		],
		reminder.unit
	);
	unitSelect.addEventListener("change", () => {
		updateItem({ unit: unitSelect.value as "minutes" | "hours" | "days" });
	});

	const directionSelect = createCardSelect(
		[
			{ value: "before", label: translate("settings.defaults.reminders.directions.before") },
			{ value: "after", label: translate("settings.defaults.reminders.directions.after") },
		],
		reminder.direction
	);
	directionSelect.addEventListener("change", () => {
		updateItem({ direction: directionSelect.value as "before" | "after" });
	});

	const anchors = getAvailableDateAnchors(plugin);
	const anchorOptions = anchors.map((a) => ({
		value: a.key,
		label: a.displayName,
	}));
	const relatedToSelect = createCardSelect(anchorOptions, reminder.relatedTo);
	relatedToSelect.addEventListener("change", () => {
		updateItem({ relatedTo: relatedToSelect.value });
	});

	return [
		{ label: translate("settings.defaults.reminders.fields.offset"), input: offsetInput },
		{ label: translate("settings.defaults.reminders.fields.unit"), input: unitSelect },
		{
			label: translate("settings.defaults.reminders.fields.direction"),
			input: directionSelect,
		},
		{
			label: translate("settings.defaults.reminders.fields.relatedTo"),
			input: relatedToSelect,
		},
	];
}

function renderAbsoluteReminderConfig(
	reminder: DefaultReminder,
	updateItem: (updates: Partial<DefaultReminder>) => void,
	translate: TranslateFn
): CardRow[] {
	const dateInput = createCardInput(
		"date",
		reminder.absoluteDate || new Date().toISOString().split("T")[0]
	);
	dateInput.addEventListener("input", () => {
		updateItem({ absoluteDate: dateInput.value });
	});

	const timeInput = createCardInput("time", reminder.absoluteTime || "09:00");
	timeInput.addEventListener("input", () => {
		updateItem({ absoluteTime: timeInput.value });
	});

	return [
		{ label: translate("settings.defaults.reminders.fields.date"), input: dateInput },
		{ label: translate("settings.defaults.reminders.fields.time"), input: timeInput },
	];
}

function formatReminderTiming(
	reminder: DefaultReminder,
	translate: TranslateFn,
	plugin: TaskNotesPlugin
): string {
	if (reminder.type === "relative") {
		const direction =
			reminder.direction === "before"
				? translate("settings.defaults.reminders.directions.before")
				: translate("settings.defaults.reminders.directions.after");
		const unit = translate(
			`settings.defaults.reminders.units.${reminder.unit || "hours"}` as TranslationKey
		);
		const offset = reminder.offset ?? 1;
		const relatedTo = getAnchorDisplayName(reminder.relatedTo || "due", plugin).toLowerCase();
		return `${offset} ${unit} ${direction} ${relatedTo}`;
	} else {
		const date = reminder.absoluteDate || translate("settings.defaults.reminders.fields.date");
		const time = reminder.absoluteTime || translate("settings.defaults.reminders.fields.time");
		return `${date} at ${time}`;
	}
}

// --- Global Reminders ---

function renderGlobalRemindersList(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	save: () => void,
	translate: TranslateFn,
	onTimelineRefresh?: () => void
): void {
	container.empty();

	const rules = plugin.settings.globalReminderRules;
	if (!rules || rules.length === 0) {
		showCardEmptyState(container, "No global reminders configured");
		return;
	}

	rules.forEach((rule, index) => {
		const statusText = rule.enabled ? "Enabled" : "Disabled";
		const anchors = getAvailableDateAnchors(plugin);
		const anchorOptions = anchors.map((a) => ({ value: a.key, label: a.displayName }));

		const parsed = parseISO8601Offset(rule.offset);

		// Enabled toggle
		const enabledSelect = createCardSelect(
			[
				{ value: "true", label: "Enabled" },
				{ value: "false", label: "Disabled" },
			],
			String(rule.enabled)
		);
		enabledSelect.addEventListener("change", () => {
			rule.enabled = enabledSelect.value === "true";
			save();
			onTimelineRefresh?.();
			updateSecondaryText();
		});

		// Description
		const descInput = createCardInput("text", "Description", rule.description);
		descInput.addEventListener("input", () => {
			rule.description = descInput.value;
			save();
			const cardEl = container.querySelector(`[data-card-id="${rule.id}"]`);
			if (cardEl) {
				const primaryText = cardEl.querySelector(".tasknotes-settings__card-primary-text");
				if (primaryText) primaryText.textContent = rule.description || "Unnamed rule";
			}
		});

		// Semantic type
		const typeSelect = createCardSelect(
			[
				{ value: "lead-time", label: "Lead time (fires once)" },
				{ value: "due-date", label: "Due date (persistent)" },
				{ value: "overdue", label: "Overdue (repeating)" },
				{ value: "start-date", label: "Start date (fires once)" },
			],
			rule.semanticType
		);
		typeSelect.addEventListener("change", () => {
			rule.semanticType = typeSelect.value as GlobalReminderRule["semanticType"];
			if (rule.semanticType === "overdue" && !rule.repeatIntervalHours) {
				rule.repeatIntervalHours = 24;
			}
			save();
			onTimelineRefresh?.();
			renderGlobalRemindersList(container, plugin, save, translate, onTimelineRefresh);
		});

		// Anchor
		const anchorSelect = createCardSelect(anchorOptions, rule.anchorProperty);
		anchorSelect.addEventListener("change", () => {
			rule.anchorProperty = anchorSelect.value;
			save();
			onTimelineRefresh?.();
			updateSecondaryText();
		});

		// Offset number
		const offsetInput = createCardNumberInput(0, undefined, 1, parsed.value);
		offsetInput.addEventListener("input", () => {
			const val = parseInt(offsetInput.value);
			if (!isNaN(val) && val >= 0) {
				parsed.value = val;
				rule.offset = formatToISO8601Offset(val, parsed.unit, parsed.direction);
				save();
				onTimelineRefresh?.();
				updateSecondaryText();
			}
		});

		// Offset unit
		const unitSelect = createCardSelect(
			[
				{ value: "minutes", label: "Minutes" },
				{ value: "hours", label: "Hours" },
				{ value: "days", label: "Days" },
			],
			parsed.unit
		);
		unitSelect.addEventListener("change", () => {
			parsed.unit = unitSelect.value;
			rule.offset = formatToISO8601Offset(parsed.value, parsed.unit, parsed.direction);
			save();
			onTimelineRefresh?.();
			updateSecondaryText();
		});

		// Direction
		const directionSelect = createCardSelect(
			[
				{ value: "before", label: "Before" },
				{ value: "after", label: "After" },
			],
			parsed.direction
		);
		directionSelect.addEventListener("change", () => {
			parsed.direction = directionSelect.value;
			rule.offset = formatToISO8601Offset(parsed.value, parsed.unit, parsed.direction);
			save();
			onTimelineRefresh?.();
			updateSecondaryText();
		});

		// Skip if explicit exists
		const skipCheckbox = document.createElement("input");
		skipCheckbox.type = "checkbox";
		skipCheckbox.checked = rule.skipIfExplicitExists;
		skipCheckbox.addEventListener("change", () => {
			rule.skipIfExplicitExists = skipCheckbox.checked;
			save();
		});
		const skipWrapper = document.createElement("label");
		skipWrapper.style.cssText = "display: flex; align-items: center; gap: 8px; font-size: var(--font-ui-small);";
		skipWrapper.appendChild(skipCheckbox);
		skipWrapper.appendText("Skip if task has explicit reminder of same type");

		// Semantic type help text
		const semanticHelpEl = document.createElement("div");
		semanticHelpEl.style.cssText = "font-size: var(--font-ui-smaller); color: var(--text-muted); line-height: 1.6; padding: 4px 0;";
		semanticHelpEl.innerHTML = [
			"<strong>Types:</strong>",
			"\u2022 <strong>Lead time</strong> \u2014 One-shot notification before the anchor date",
			"\u2022 <strong>Due date</strong> \u2014 Persistent: fires on the date, repeats until task is completed",
			"\u2022 <strong>Overdue</strong> \u2014 Fires after the date passes, repeats at configured interval",
			"\u2022 <strong>Start date</strong> \u2014 One-shot notification on the anchor date",
		].join("<br>");

		const rows: CardRow[] = [
			{ label: "Status", input: enabledSelect },
			{ label: "Description", input: descInput },
			{ label: "Type", input: typeSelect },
			{ label: "", input: semanticHelpEl, fullWidth: true },
			{ label: "Anchor date", input: anchorSelect },
			{ label: "Offset", input: offsetInput },
			{ label: "Unit", input: unitSelect },
			{ label: "Direction", input: directionSelect },
		];

		if (rule.semanticType === "overdue") {
			const repeatInput = createCardNumberInput(1, undefined, 1, rule.repeatIntervalHours || 24);
			repeatInput.addEventListener("input", () => {
				const val = parseInt(repeatInput.value);
				if (!isNaN(val) && val >= 1) {
					rule.repeatIntervalHours = val;
					save();
					onTimelineRefresh?.();
					updateSecondaryText();
				}
			});
			rows.push({ label: "Repeat every (hours)", input: repeatInput });
		}

		rows.push({ label: "", input: skipWrapper, fullWidth: true });

		const anchorDisplayName = getAnchorDisplayName(rule.anchorProperty, plugin).toLowerCase();
		const timingText = formatGlobalRuleTiming(rule, anchorDisplayName);

		const card = createCard(container, {
			id: rule.id,
			collapsible: true,
			defaultCollapsed: true,
			header: {
				primaryText: rule.description || "Unnamed rule",
				secondaryText: `${statusText} \u00b7 ${timingText}`,
				actions: [
					createDeleteHeaderButton(() => {
						plugin.settings.globalReminderRules.splice(index, 1);
						save();
						onTimelineRefresh?.();
						renderGlobalRemindersList(container, plugin, save, translate, onTimelineRefresh);
					}, "Delete rule"),
				],
			},
			content: {
				sections: [{ rows }],
			},
		});

		function updateSecondaryText() {
			const secondaryEl = card.querySelector(".tasknotes-settings__card-secondary-text");
			if (secondaryEl) {
				const newStatus = rule.enabled ? "Enabled" : "Disabled";
				const newAnchor = getAnchorDisplayName(rule.anchorProperty, plugin).toLowerCase();
				const newTiming = formatGlobalRuleTiming(rule, newAnchor);
				secondaryEl.textContent = `${newStatus} \u00b7 ${newTiming}`;
			}
		}
	});
}

function formatGlobalRuleTiming(rule: GlobalReminderRule, anchorName: string): string {
	const parsed = parseISO8601Offset(rule.offset);
	if (parsed.value === 0) return `At ${anchorName}`;
	const unitLabel = parsed.value === 1 ? parsed.unit.replace(/s$/, "") : parsed.unit;
	const prefix = parsed.direction === "before" ? "before" : "after";
	let text = `${parsed.value} ${unitLabel} ${prefix} ${anchorName}`;
	if (rule.semanticType === "overdue" && rule.repeatIntervalHours) {
		text += `, repeats every ${rule.repeatIntervalHours}h`;
	}
	return text;
}

function parseISO8601Offset(offset: string): { value: number; unit: string; direction: string } {
	const match = offset.match(/^(-?)P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
	if (!match) return { value: 0, unit: "hours", direction: "before" };

	const [, sign, days, hours, minutes] = match;
	const direction = sign === "-" ? "before" : "after";

	if (days && parseInt(days) > 0) return { value: parseInt(days), unit: "days", direction };
	if (hours && parseInt(hours) > 0) return { value: parseInt(hours), unit: "hours", direction };
	if (minutes && parseInt(minutes) > 0) return { value: parseInt(minutes), unit: "minutes", direction };
	return { value: 0, unit: "hours", direction: "before" };
}

function formatToISO8601Offset(value: number, unit: string, direction: string): string {
	if (value === 0) return "PT0S";
	const sign = direction === "before" ? "-" : "";
	switch (unit) {
		case "days": return `${sign}P${value}D`;
		case "hours": return `${sign}PT${value}H`;
		case "minutes": return `${sign}PT${value}M`;
		default: return `${sign}PT${value}H`;
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMELINE PREVIEW
// ═══════════════════════════════════════════════════════════════════════════

interface TimelineMarker {
	label: string;
	offsetHours: number; // negative = before anchor, positive = after
	source: "default" | "global";
	semanticType?: string;
	repeatIntervalHours?: number;
	reminderId: string; // ID for click-to-scroll targeting
}

function collectTimelineMarkers(plugin: TaskNotesPlugin): TimelineMarker[] {
	const markers: TimelineMarker[] = [];

	// Default reminders
	const defaults = plugin.settings.taskCreationDefaults.defaultReminders || [];
	for (const rem of defaults) {
		if (rem.type !== "relative") continue;
		const hours = normalizeToHours(rem.offset ?? 1, rem.unit || "hours");
		const sign = rem.direction === "after" ? 1 : -1;
		// Always show offset on timeline — description is in the card header
		const label = formatShortOffset(rem.offset ?? 1, rem.unit || "hours", rem.direction || "before");
		markers.push({
			label,
			offsetHours: hours * sign,
			source: "default",
			reminderId: rem.id,
		});
	}

	// Global reminders (enabled only)
	const globals = plugin.settings.globalReminderRules || [];
	for (const rule of globals) {
		if (!rule.enabled) continue;
		const parsed = parseISO8601Offset(rule.offset);
		const hours = normalizeToHours(parsed.value, parsed.unit);
		const sign = parsed.direction === "after" ? 1 : -1;
		// Always show offset on timeline — description is in the card header
		const label = formatShortOffset(parsed.value, parsed.unit, parsed.direction);
		markers.push({
			label,
			offsetHours: hours * sign,
			source: "global",
			semanticType: rule.semanticType,
			repeatIntervalHours: rule.repeatIntervalHours,
			reminderId: rule.id,
		});
	}

	return markers;
}

function normalizeToHours(value: number, unit: string): number {
	switch (unit) {
		case "minutes": return value / 60;
		case "days": return value * 24;
		default: return value;
	}
}

function formatShortOffset(value: number, unit: string, direction: string): string {
	if (value === 0) return "At anchor";
	const dir = direction === "before" ? "before" : "after";
	// Use full words for clarity on the timeline
	if (unit === "minutes") {
		return value === 1 ? `1 min ${dir}` : `${value} min ${dir}`;
	} else if (unit === "hours") {
		return value === 1 ? `1 hour ${dir}` : `${value} hours ${dir}`;
	} else if (unit === "days") {
		return value === 1 ? `1 day ${dir}` : `${value} days ${dir}`;
	}
	return `${value} ${unit} ${dir}`;
}

/**
 * Scroll to and highlight a reminder card when its timeline marker is clicked.
 * Expands collapsed parent section and card if needed.
 */
function scrollToReminderCard(scrollContext: HTMLElement, reminderId: string, source: "default" | "global"): void {
	// 1. Ensure the correct collapsible section is expanded
	const sectionClass = source === "default" ? "tn-reminders-section--default" : "tn-reminders-section--global";
	const section = scrollContext.querySelector(`.${sectionClass}`);
	if (section?.hasClass("tasknotes-settings__collapsible-section--collapsed")) {
		const header = section.querySelector(".tasknotes-settings__collapsible-section-header") as HTMLElement;
		header?.click();
	}

	// 2. Find the card by data-card-id
	const card = scrollContext.querySelector(`[data-card-id="${reminderId}"]`) as HTMLElement;
	if (!card) return;

	// 3. Expand card if collapsed
	if (card.classList.contains("tasknotes-settings__card--collapsed")) {
		const cardHeader = card.querySelector(".tasknotes-settings__card-header") as HTMLElement;
		cardHeader?.click();
	}

	// 4. Scroll into view with a small delay for expand animations
	setTimeout(() => {
		card.scrollIntoView({ behavior: "smooth", block: "center" });

		// 5. Flash highlight
		card.addClass("tn-reminder-timeline__flash");
		setTimeout(() => card.removeClass("tn-reminder-timeline__flash"), 1200);
	}, 150);
}

function renderReminderTimeline(container: HTMLElement, plugin: TaskNotesPlugin, scrollContext?: HTMLElement): void {
	container.empty();

	// Header
	const header = container.createDiv({ cls: "tn-reminder-timeline__header" });
	const iconEl = header.createSpan({ cls: "tn-reminder-timeline__header-icon" });
	setIcon(iconEl, "clock");
	header.createSpan({ text: "Timeline preview", cls: "setting-item-name" });

	const markers = collectTimelineMarkers(plugin);

	if (markers.length === 0) {
		const emptyEl = container.createDiv({ cls: "tn-reminder-timeline__empty" });
		emptyEl.textContent = "Add reminders to see them on the timeline";

		// Still show the bare timeline with anchor
		renderTimelineArea(container, markers, plugin, scrollContext);
		return;
	}

	renderTimelineArea(container, markers, plugin, scrollContext);

	// Legend
	const legend = container.createDiv({ cls: "tn-reminder-timeline__legend" });

	const hasDefaults = markers.some(m => m.source === "default");
	const hasGlobals = markers.some(m => m.source === "global");

	if (hasDefaults) {
		const item = legend.createDiv({ cls: "tn-reminder-timeline__legend-item" });
		item.createDiv({ cls: "tn-reminder-timeline__legend-dot tn-reminder-timeline__legend-dot--default" });
		item.createSpan({ text: "Default (new tasks)" });
	}
	if (hasGlobals) {
		const item = legend.createDiv({ cls: "tn-reminder-timeline__legend-item" });
		item.createDiv({ cls: "tn-reminder-timeline__legend-dot tn-reminder-timeline__legend-dot--global" });
		item.createSpan({ text: "Global (all tasks)" });
	}

	// Note about mixed anchors
	const allAnchors = new Set<string>();
	const defaults = plugin.settings.taskCreationDefaults.defaultReminders || [];
	for (const rem of defaults) {
		if (rem.type === "relative") allAnchors.add(rem.relatedTo || "due");
	}
	const globals = plugin.settings.globalReminderRules || [];
	for (const rule of globals) {
		if (rule.enabled) allAnchors.add(rule.anchorProperty || "due");
	}
	if (allAnchors.size > 1) {
		const note = container.createDiv({ cls: "tn-reminder-timeline__note" });
		const primaryAnchor = getAnchorDisplayName("due", plugin);
		note.textContent = `Showing relative to ${primaryAnchor}. Some reminders target other dates.`;
	}
}

/**
 * Layout engine: detects when markers on the same side of the anchor have
 * vastly different scales (e.g. 1 hour vs 6 months) and returns segmented
 * positions with break indicators instead of a linear scale.
 */
interface PositionedMarker { marker: TimelineMarker; pct: number }
interface TimelineLayout { positioned: PositionedMarker[]; breaks: number[]; hasJumps: boolean }

function computeTimelineLayout(markers: TimelineMarker[], anchorPct: number, minPct: number, maxPct: number): TimelineLayout {
	const GAP_RATIO = 8; // ratio between adjacent offsets to trigger a break
	const BREAK_WIDTH = 4; // percentage of timeline width per break zone

	const positioned: PositionedMarker[] = [];
	const breaks: number[] = [];

	const beforeMarkers = markers.filter(m => m.offsetHours < 0)
		.sort((a, b) => Math.abs(a.offsetHours) - Math.abs(b.offsetHours));
	const afterMarkers = markers.filter(m => m.offsetHours > 0)
		.sort((a, b) => a.offsetHours - b.offsetHours);
	const atAnchor = markers.filter(m => m.offsetHours === 0);

	for (const m of atAnchor) positioned.push({ marker: m, pct: anchorPct });

	layoutSide(beforeMarkers, anchorPct, minPct, "before", GAP_RATIO, BREAK_WIDTH, positioned, breaks);
	layoutSide(afterMarkers, anchorPct, maxPct, "after", GAP_RATIO, BREAK_WIDTH, positioned, breaks);

	return { positioned, breaks, hasJumps: breaks.length > 0 };
}

function layoutSide(
	sorted: TimelineMarker[],
	anchorPct: number,
	edgePct: number,
	side: "before" | "after",
	gapRatio: number,
	breakWidth: number,
	out: PositionedMarker[],
	outBreaks: number[]
): void {
	if (sorted.length === 0) return;

	const absOffsets = sorted.map(m => Math.abs(m.offsetHours));

	// Group into clusters — a new cluster starts when the gap ratio exceeds threshold
	const clusters: TimelineMarker[][] = [[sorted[0]]];
	for (let i = 1; i < sorted.length; i++) {
		if (absOffsets[i - 1] > 0 && absOffsets[i] / absOffsets[i - 1] > gapRatio) {
			clusters.push([]);
		}
		clusters[clusters.length - 1].push(sorted[i]);
	}

	if (clusters.length <= 1) {
		// No time jumps — linear positioning
		const maxOff = absOffsets[absOffsets.length - 1] * 1.25 || 48;
		for (const m of sorted) {
			const ratio = Math.min(Math.abs(m.offsetHours) / maxOff, 1);
			const pct = side === "before"
				? anchorPct - ratio * Math.abs(anchorPct - edgePct)
				: anchorPct + ratio * Math.abs(edgePct - anchorPct);
			out.push({ marker: m, pct: Math.max(Math.min(anchorPct, edgePct), Math.min(Math.max(anchorPct, edgePct), pct)) });
		}
		return;
	}

	// Multiple clusters — segmented layout with breaks
	const totalSpace = Math.abs(edgePct - anchorPct);
	const totalBreakSpace = (clusters.length - 1) * breakWidth;
	const spacePerCluster = (totalSpace - totalBreakSpace) / clusters.length;
	const dir = side === "before" ? -1 : 1;

	let cursor = anchorPct;

	for (let ci = 0; ci < clusters.length; ci++) {
		const cluster = clusters[ci];
		const segStart = cursor;
		const segEnd = cursor + dir * spacePerCluster;

		// Position markers within segment with internal padding
		if (cluster.length === 1) {
			out.push({ marker: cluster[0], pct: (segStart + segEnd) / 2 });
		} else {
			const clusterOffsets = cluster.map(m => Math.abs(m.offsetHours));
			const cMin = clusterOffsets[0];
			const cMax = clusterOffsets[clusterOffsets.length - 1];
			const cRange = cMax - cMin || 1;
			for (let i = 0; i < cluster.length; i++) {
				const ratio = (clusterOffsets[i] - cMin) / cRange;
				const padded = 0.15 + ratio * 0.7; // 15% padding each side
				const pct = segStart + dir * padded * Math.abs(segEnd - segStart);
				out.push({ marker: cluster[i], pct });
			}
		}

		cursor = segEnd;

		// Insert break between clusters
		if (ci < clusters.length - 1) {
			const breakCenter = cursor + dir * (breakWidth / 2);
			outBreaks.push(breakCenter);
			cursor = cursor + dir * breakWidth;
		}
	}
}

/**
 * After the timeline is rendered, measure label bounding rects and nudge
 * any that overlap horizontally. Labels are grouped into two lanes:
 *   - "above" lane: default marker labels (top of timeline)
 *   - "below" lane: global marker labels + anchor label (bottom of timeline)
 * Within each lane, overlapping labels are pushed apart.
 */
function resolveTimelineLabelOverlaps(area: HTMLElement, anchorLabel: HTMLElement): void {
	const MIN_GAP = 4; // minimum px between labels

	// Collect labels in each lane
	const aboveLabels: HTMLElement[] = [];
	const belowLabels: HTMLElement[] = [];

	// Anchor label is in the "below" lane
	belowLabels.push(anchorLabel);

	// Marker labels — sorted into lanes by above/below
	const markerEls = area.querySelectorAll<HTMLElement>(".tn-reminder-timeline__marker");
	for (const markerEl of markerEls) {
		const label = markerEl.querySelector<HTMLElement>(".tn-reminder-timeline__marker-label");
		if (!label) continue;
		if (markerEl.classList.contains("tn-reminder-timeline__marker--above")) {
			aboveLabels.push(label);
		} else {
			belowLabels.push(label);
		}
	}

	// Resolve overlaps in each lane
	nudgeLane(aboveLabels, MIN_GAP);
	nudgeLane(belowLabels, MIN_GAP);
}

function nudgeLane(labels: HTMLElement[], minGap: number): void {
	if (labels.length < 2) return;

	// Sort by horizontal center position (using screen coords from getBoundingClientRect)
	const items = labels.map(el => {
		const rect = el.getBoundingClientRect();
		return { el, left: rect.left, right: rect.right, width: rect.width, center: rect.left + rect.width / 2, nudge: 0 };
	}).sort((a, b) => a.center - b.center);

	// Greedy left-to-right: push overlapping labels apart symmetrically
	for (let i = 1; i < items.length; i++) {
		const prev = items[i - 1];
		const curr = items[i];
		const prevRight = prev.right + prev.nudge;
		const currLeft = curr.left + curr.nudge;
		const overlap = prevRight + minGap - currLeft;
		if (overlap > 0) {
			const halfNudge = Math.ceil(overlap / 2);
			prev.nudge -= halfNudge;
			curr.nudge += halfNudge;
		}
	}

	// Second pass: ensure no cascading overlaps were introduced
	for (let i = 1; i < items.length; i++) {
		const prev = items[i - 1];
		const curr = items[i];
		const prevRight = prev.right + prev.nudge;
		const currLeft = curr.left + curr.nudge;
		const overlap = prevRight + minGap - currLeft;
		if (overlap > 0) {
			curr.nudge += Math.ceil(overlap);
		}
	}

	// Apply nudges via transform (works reliably on position:absolute elements)
	for (const item of items) {
		if (item.nudge !== 0) {
			item.el.style.transform = `translateX(${item.nudge}px)`;
		}
	}
}

function renderTimelineArea(container: HTMLElement, markers: TimelineMarker[], plugin: TaskNotesPlugin, scrollContext?: HTMLElement): void {
	const area = container.createDiv({ cls: "tn-reminder-timeline__area" });

	// Horizontal line
	area.createDiv({ cls: "tn-reminder-timeline__line" });

	const ANCHOR_PCT = 65;
	const MIN_PCT = 5;
	const MAX_PCT = 95;

	// Anchor marker
	const anchor = area.createDiv({ cls: "tn-reminder-timeline__anchor" });
	anchor.style.left = `${ANCHOR_PCT}%`;
	anchor.createDiv({ cls: "tn-reminder-timeline__anchor-line" });
	anchor.createDiv({ cls: "tn-reminder-timeline__anchor-pin" });
	const anchorLabel = anchor.createDiv({ cls: "tn-reminder-timeline__anchor-label" });
	anchorLabel.textContent = getAnchorDisplayName("due", plugin);

	// Compute layout (linear or segmented with breaks)
	const layout = computeTimelineLayout(markers, ANCHOR_PCT, MIN_PCT, MAX_PCT);

	// Render break indicators ("···" gaps in the line)
	for (const breakPct of layout.breaks) {
		const breakEl = area.createDiv({ cls: "tn-reminder-timeline__break" });
		breakEl.style.left = `${breakPct}%`;
		breakEl.textContent = "\u22EF"; // ⋯ midline horizontal ellipsis
	}

	// Place each marker at its computed position
	for (const { marker, pct } of layout.positioned) {
		const isAbove = marker.source === "default";
		const sideClass = isAbove ? "tn-reminder-timeline__marker--above" : "tn-reminder-timeline__marker--below";

		const markerEl = area.createDiv({ cls: `tn-reminder-timeline__marker ${sideClass}` });
		markerEl.style.left = `${pct}%`;

		const labelEl = markerEl.createDiv({ cls: `tn-reminder-timeline__marker-label tn-reminder-timeline__marker-label--${marker.source}` });
		let labelText = marker.label;
		if (marker.semanticType === "overdue" && marker.repeatIntervalHours) {
			labelText += ` (${marker.repeatIntervalHours}h)`;
		} else if (marker.semanticType === "due-date") {
			labelText += " \u2022";
		}
		labelEl.textContent = labelText;
		labelEl.title = labelText;

		markerEl.createDiv({ cls: `tn-reminder-timeline__marker-stem tn-reminder-timeline__marker-stem--${marker.source}` });

		const dotClasses = [`tn-reminder-timeline__marker-dot`, `tn-reminder-timeline__marker-dot--${marker.source}`];
		if (marker.semanticType === "due-date") dotClasses.push("tn-reminder-timeline__marker-dot--persistent");
		if (marker.semanticType === "overdue") dotClasses.push("tn-reminder-timeline__marker-dot--repeating");
		markerEl.createDiv({ cls: dotClasses.join(" ") });

		if (scrollContext && marker.reminderId) {
			markerEl.style.cursor = "pointer";
			markerEl.title = `${labelText} — click to edit`;
			markerEl.addEventListener("click", () => {
				scrollToReminderCard(scrollContext, marker.reminderId, marker.source);
			});
		}
	}

	// Time scale ticks — only when layout is linear (ticks are misleading with breaks)
	if (!layout.hasJumps) {
		const offsets = markers.map(m => Math.abs(m.offsetHours));
		const maxOffset = Math.max(48, ...offsets) * 1.25;
		const beforeRange = maxOffset;
		const afterRange = maxOffset * ((100 - ANCHOR_PCT) / ANCHOR_PCT);
		renderTimeScaleTicks(area, beforeRange, afterRange, ANCHOR_PCT, MIN_PCT, MAX_PCT);
	}

	// Direction labels
	const dirLabels = container.createDiv({ cls: "tn-reminder-timeline__direction-labels" });
	dirLabels.createSpan({ text: "\u2190 before" });
	dirLabels.createSpan({ text: "after \u2192" });

	// Post-render: resolve overlapping labels (double rAF ensures full layout pass)
	requestAnimationFrame(() => {
		requestAnimationFrame(() => resolveTimelineLabelOverlaps(area, anchorLabel));
	});
}

function formatTickHuman(hours: number): string {
	// Convert hours to the most natural human-readable unit
	if (hours < 1) return `${Math.round(hours * 60)} min`;
	if (hours < 24) return hours === 1 ? "1 hour" : `${hours} hours`;
	const days = hours / 24;
	if (days < 7) return days === 1 ? "1 day" : `${Math.round(days)} days`;
	const weeks = days / 7;
	if (weeks <= 4 && Number.isInteger(weeks)) return weeks === 1 ? "1 week" : `${Math.round(weeks)} weeks`;
	const months = days / 30;
	if (months < 12) return months === 1 ? "1 month" : `${Math.round(months)} months`;
	const years = days / 365;
	return years === 1 ? "1 year" : `${+years.toFixed(1)} years`;
}

function chooseTickInterval(maxHours: number): { intervalHours: number; formatTick: (h: number) => string } {
	// Target ~5-8 ticks per side. Pick interval so maxHours / interval <= 8
	const targetTicks = 6;
	const idealInterval = maxHours / targetTicks;

	// Snap to a nice human-readable interval
	const niceIntervals = [
		0.25,   // 15 min
		0.5,    // 30 min
		1,      // 1 hour
		3,      // 3 hours
		6,      // 6 hours
		12,     // 12 hours
		24,     // 1 day
		72,     // 3 days
		168,    // 1 week
		720,    // ~1 month
		2160,   // ~3 months
		4380,   // ~6 months
		8760,   // 1 year
	];

	for (const interval of niceIntervals) {
		if (interval >= idealInterval) {
			return { intervalHours: interval, formatTick: formatTickHuman };
		}
	}
	// Fallback for extremely large ranges
	const fallbackInterval = Math.ceil(idealInterval / 8760) * 8760;
	return { intervalHours: fallbackInterval, formatTick: formatTickHuman };
}

function renderTimeScaleTicks(
	area: HTMLElement,
	beforeRange: number,
	afterRange: number,
	anchorPct: number,
	minPct: number,
	maxPct: number
): void {
	const { intervalHours, formatTick } = chooseTickInterval(Math.max(beforeRange, afterRange));
	const MAX_TICKS_PER_SIDE = 10;

	// Before-anchor ticks
	let beforeCount = 0;
	for (let h = intervalHours; h <= beforeRange && beforeCount < MAX_TICKS_PER_SIDE; h += intervalHours) {
		const ratio = h / beforeRange;
		const pct = anchorPct - ratio * (anchorPct - minPct);
		if (pct < minPct + 2) continue;

		const tick = area.createDiv({ cls: "tn-reminder-timeline__tick" });
		tick.style.left = `${pct}%`;
		const tickLabel = tick.createDiv({ cls: "tn-reminder-timeline__tick-label" });
		tickLabel.textContent = formatTick(h);
		beforeCount++;
	}

	// After-anchor ticks
	let afterCount = 0;
	for (let h = intervalHours; h <= afterRange && afterCount < MAX_TICKS_PER_SIDE; h += intervalHours) {
		const ratio = h / afterRange;
		const pct = anchorPct + ratio * (maxPct - anchorPct);
		if (pct > maxPct - 2) continue;

		const tick = area.createDiv({ cls: "tn-reminder-timeline__tick" });
		tick.style.left = `${pct}%`;
		const tickLabel = tick.createDiv({ cls: "tn-reminder-timeline__tick-label" });
		tickLabel.textContent = formatTick(h);
		afterCount++;
	}
}

/**
 * Navigate to Features tab and scroll to the Task notifications heading.
 */
function navigateToFeatureNotifications(plugin: TaskNotesPlugin): void {
	const settingsTab = (plugin.app as any).setting?.activeTab;
	if (settingsTab?.containerEl) {
		const tabButton = settingsTab.containerEl.querySelector(
			"#tab-button-features"
		) as HTMLElement;
		if (tabButton) {
			tabButton.click();
			setTimeout(() => {
				const headings = settingsTab.containerEl.querySelectorAll(
					".setting-item-heading .setting-item-name"
				);
				for (const heading of headings) {
					if (heading.textContent?.toLowerCase().includes("task notifications")) {
						(heading as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
						break;
					}
				}
			}, 200);
		}
	}
}
