/**
 * PropertyPicker - Inline searchable property selector with type badges and compatibility indicators.
 *
 * Features:
 * - Searchable input with debounce
 * - Properties grouped by type with colored badges
 * - Vault-wide toggle to scan all task files
 * - Type compatibility warnings with conversion actions
 * - "Add new property" inline form
 *
 * Inspired by PersonGroupPicker, designed to embed inline within modals.
 */

import { setIcon, Notice } from "obsidian";
import type TaskNotesPlugin from "../main";
import {
	type PropertyType,
	type DiscoveredProperty,
	type PropertyCatalogEntry,
	discoverCustomProperties,
	buildPropertyCatalog,
	getAllTaskFilePaths,
	convertPropertyType,
	keyToDisplayName,
} from "../utils/propertyDiscoveryUtils";

export interface PropertyPickerOptions {
	/** Container element to render into */
	container: HTMLElement;
	/** The TaskNotes plugin instance */
	plugin: TaskNotesPlugin;
	/** Current file path (for single-file discovery) */
	currentFilePath?: string;
	/** File paths for bulk/view items */
	itemPaths?: string[];
	/** Keys already rendered elsewhere (to exclude from results) */
	excludeKeys?: Set<string>;
	/** Callback when a property is selected */
	onSelect: (key: string, type: PropertyType, value?: any) => void;
	/** Callback for type conversion (optional) */
	onConvert?: (
		key: string,
		targetType: PropertyType,
		files: string[],
		strategy: "convert-in-place" | "create-duplicate"
	) => Promise<void>;
}

/** Type badge color mapping */
const TYPE_COLORS: Record<PropertyType, string> = {
	date: "var(--color-blue)",
	text: "var(--color-green)",
	number: "var(--color-purple)",
	boolean: "var(--color-orange)",
	list: "var(--color-cyan)",
};

/** Type badge labels */
const TYPE_LABELS: Record<PropertyType, string> = {
	date: "Date",
	text: "Text",
	number: "Num",
	boolean: "Bool",
	list: "List",
};

/**
 * Create a PropertyPicker component.
 */
export function createPropertyPicker(options: PropertyPickerOptions): {
	refresh: () => void;
	destroy: () => void;
} {
	const {
		container,
		plugin,
		currentFilePath,
		itemPaths,
		excludeKeys = new Set(),
		onSelect,
		onConvert,
	} = options;

	// State
	let searchQuery = "";
	let isVaultWide = false;
	let isDropdownOpen = false;
	let discoveredProps: DiscoveredProperty[] = [];
	let catalogEntries: PropertyCatalogEntry[] = [];
	let showAddForm = false;

	// Create DOM structure
	container.empty();
	container.addClass("tn-property-picker");

	// Header row: search + vault-wide toggle
	const headerRow = container.createDiv({ cls: "tn-pp-header" });

	const searchContainer = headerRow.createDiv({ cls: "tn-pp-search-container" });
	const searchIcon = searchContainer.createSpan({ cls: "tn-pp-search-icon" });
	setIcon(searchIcon, "search");
	const searchInput = searchContainer.createEl("input", {
		cls: "tn-pp-search",
		attr: {
			type: "text",
			placeholder: "Search properties...",
		},
	});

	const toggleContainer = headerRow.createDiv({ cls: "tn-pp-toggle-container" });
	const toggleLabel = toggleContainer.createEl("label", {
		cls: "tn-pp-toggle-label",
		attr: { title: "When enabled, shows properties from all task files in the vault instead of just this task" },
	});
	const toggleCheckbox = toggleLabel.createEl("input", {
		attr: { type: "checkbox" },
		cls: "tn-pp-toggle-checkbox",
	});
	toggleLabel.createSpan({ text: "Vault-wide", cls: "tn-pp-toggle-text" });

	// Dropdown container - appended to body to escape modal overflow
	const dropdown = document.body.createDiv({ cls: "tn-pp-dropdown" });
	dropdown.style.display = "none";

	// ── Data loading ──────────────────────────────────

	function loadProperties() {
		if (isVaultWide) {
			const paths = itemPaths?.length
				? itemPaths
				: getAllTaskFilePaths(plugin);
			catalogEntries = buildPropertyCatalog(plugin, paths, excludeKeys);
			discoveredProps = [];
		} else if (currentFilePath) {
			discoveredProps = discoverCustomProperties(plugin, currentFilePath, excludeKeys);
			catalogEntries = [];
		} else if (itemPaths?.length) {
			catalogEntries = buildPropertyCatalog(plugin, itemPaths, excludeKeys);
			discoveredProps = [];
		} else {
			discoveredProps = [];
			catalogEntries = [];
		}
	}

	// ── Rendering ─────────────────────────────────────

	function renderDropdown() {
		dropdown.empty();

		const query = searchQuery.toLowerCase();

		if (isVaultWide || !currentFilePath) {
			renderCatalogView(query);
		} else {
			renderSingleFileView(query);
		}

		// Add new property option at bottom
		renderAddNewProperty();
	}

	function renderSingleFileView(query: string) {
		const filtered = discoveredProps.filter((p) => {
			if (query && !p.key.toLowerCase().includes(query) && !p.displayName.toLowerCase().includes(query)) {
				return false;
			}
			return true;
		});

		if (filtered.length === 0 && !showAddForm) {
			const emptyMsg = dropdown.createDiv({ cls: "tn-pp-empty" });
			emptyMsg.textContent = query
				? "No matching properties"
				: "No custom properties found";
			return;
		}

		// Group by type
		const groups = groupByType(filtered);
		for (const [type, props] of groups) {
			renderTypeSection(type as PropertyType, props);
		}
	}

	function renderCatalogView(query: string) {
		const filtered = catalogEntries.filter((e) => {
			if (query && !e.key.toLowerCase().includes(query) && !e.displayName.toLowerCase().includes(query)) {
				return false;
			}
			return true;
		});

		if (filtered.length === 0 && !showAddForm) {
			const emptyMsg = dropdown.createDiv({ cls: "tn-pp-empty" });
			emptyMsg.textContent = query
				? "No matching properties"
				: "No custom properties found across task files";
			return;
		}

		// Group by dominant type
		const groups = new Map<PropertyType, PropertyCatalogEntry[]>();
		for (const entry of filtered) {
			const existing = groups.get(entry.dominantType) || [];
			existing.push(entry);
			groups.set(entry.dominantType, existing);
		}

		// Render in type order: date, text, number, boolean, list
		const typeOrder: PropertyType[] = ["date", "text", "number", "boolean", "list"];
		for (const type of typeOrder) {
			const entries = groups.get(type);
			if (!entries?.length) continue;
			renderCatalogTypeSection(type, entries);
		}
	}

	function groupByType(props: DiscoveredProperty[]): Map<string, DiscoveredProperty[]> {
		const groups = new Map<string, DiscoveredProperty[]>();
		const typeOrder: PropertyType[] = ["date", "text", "number", "boolean", "list"];

		for (const type of typeOrder) {
			const matching = props.filter((p) => p.type === type);
			if (matching.length > 0) {
				groups.set(type, matching);
			}
		}
		return groups;
	}

	function renderTypeSection(type: PropertyType, props: DiscoveredProperty[]) {
		const section = dropdown.createDiv({ cls: "tn-pp-section" });

		// Section header with type badge
		const header = section.createDiv({ cls: "tn-pp-section-header" });
		createTypeBadge(header, type);
		header.createSpan({ text: TYPE_LABELS[type] + "s", cls: "tn-pp-section-title" });

		for (const prop of props) {
			const item = section.createDiv({ cls: "tn-pp-item" });

			// Property name
			item.createSpan({ cls: "tn-pp-item-key", text: prop.displayName });

			// Current value (if set)
			const valueText = formatValue(prop.value, prop.type);
			if (valueText) {
				item.createSpan({ cls: "tn-pp-item-value", text: valueText });
			} else {
				item.createSpan({ cls: "tn-pp-item-value tn-pp-item-value--empty", text: "(not set)" });
			}

			item.addEventListener("click", () => {
				onSelect(prop.key, prop.type, prop.value);
				closeDropdown();
			});
		}
	}

	function renderCatalogTypeSection(type: PropertyType, entries: PropertyCatalogEntry[]) {
		const section = dropdown.createDiv({ cls: "tn-pp-section" });

		// Section header
		const header = section.createDiv({ cls: "tn-pp-section-header" });
		createTypeBadge(header, type);
		header.createSpan({ text: TYPE_LABELS[type] + "s", cls: "tn-pp-section-title" });

		for (const entry of entries) {
			const item = section.createDiv({ cls: "tn-pp-item" });

			// Property name
			item.createSpan({ cls: "tn-pp-item-key", text: entry.displayName });

			// File count
			item.createSpan({
				cls: "tn-pp-item-count",
				text: `${entry.fileCount} file${entry.fileCount !== 1 ? "s" : ""}`,
			});

			// Compatibility warning
			if (!entry.isConsistent) {
				const warningContainer = item.createSpan({ cls: "tn-pp-item-warning" });
				const warningIcon = warningContainer.createSpan({ cls: "tn-pp-warning-icon" });
				setIcon(warningIcon, "alert-triangle");
				warningContainer.createSpan({
					text: `${entry.mismatchedFiles.length} mismatch`,
					cls: "tn-pp-warning-text",
				});

				// Conversion dropdown on warning click
				warningContainer.addEventListener("click", (e) => {
					e.stopPropagation();
					showConversionMenu(warningContainer, entry);
				});
			}

			item.addEventListener("click", () => {
				onSelect(entry.key, entry.dominantType);
				closeDropdown();
			});
		}
	}

	function renderAddNewProperty() {
		const addSection = dropdown.createDiv({ cls: "tn-pp-add-section" });

		if (!showAddForm) {
			const addBtn = addSection.createDiv({ cls: "tn-pp-add-btn" });
			const addIcon = addBtn.createSpan({ cls: "tn-pp-add-icon" });
			setIcon(addIcon, "plus");
			addBtn.createSpan({ text: "Add new property" });
			addBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				showAddForm = true;
				renderDropdown();
				positionDropdown();
			});
		} else {
			renderAddForm(addSection);
		}
	}

	function renderAddForm(container: HTMLElement) {
		const form = container.createDiv({ cls: "tn-pp-add-form" });

		// Key input
		const keyInput = form.createEl("input", {
			cls: "tn-pp-add-key",
			attr: { type: "text", placeholder: "Property name (e.g., review_date)" },
		});

		// Type selector
		const typeSelect = form.createEl("select", { cls: "tn-pp-add-type" });
		const types: PropertyType[] = ["text", "date", "number", "boolean", "list"];
		for (const t of types) {
			typeSelect.createEl("option", { text: TYPE_LABELS[t], attr: { value: t } });
		}

		// Submit button
		const submitBtn = form.createDiv({ cls: "tn-pp-add-submit" });
		setIcon(submitBtn, "check");
		submitBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			const key = keyInput.value.trim().replace(/\s+/g, "_");
			if (!key) return;
			const type = typeSelect.value as PropertyType;
			onSelect(key, type);
			showAddForm = false;
			closeDropdown();
		});

		// Cancel button
		const cancelBtn = form.createDiv({ cls: "tn-pp-add-cancel" });
		setIcon(cancelBtn, "x");
		cancelBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			showAddForm = false;
			renderDropdown();
		});

		// Focus key input
		setTimeout(() => keyInput.focus(), 50);
	}

	// ── Conversion menu ───────────────────────────────

	function showConversionMenu(anchor: HTMLElement, entry: PropertyCatalogEntry) {
		// Remove any existing conversion menu
		const existing = dropdown.querySelector(".tn-pp-conversion-menu");
		if (existing) existing.remove();

		const menu = anchor.createDiv({ cls: "tn-pp-conversion-menu" });

		// Convert in-place option
		const convertBtn = menu.createDiv({ cls: "tn-pp-conversion-option" });
		convertBtn.createSpan({
			text: `Convert ${entry.mismatchedFiles.length} files to ${TYPE_LABELS[entry.dominantType].toLowerCase()}`,
		});
		convertBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			menu.remove();
			if (onConvert) {
				await onConvert(entry.key, entry.dominantType, entry.mismatchedFiles, "convert-in-place");
			} else {
				await runConversion(entry.key, entry.dominantType, entry.mismatchedFiles, "convert-in-place");
			}
			refresh();
		});

		// Create duplicate option
		const duplicateBtn = menu.createDiv({ cls: "tn-pp-conversion-option" });
		duplicateBtn.createSpan({
			text: `Create ${entry.key}_${entry.dominantType} copy`,
		});
		duplicateBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			menu.remove();
			if (onConvert) {
				await onConvert(entry.key, entry.dominantType, entry.mismatchedFiles, "create-duplicate");
			} else {
				await runConversion(entry.key, entry.dominantType, entry.mismatchedFiles, "create-duplicate");
			}
			refresh();
		});

		// Show mismatched files
		const showFilesBtn = menu.createDiv({ cls: "tn-pp-conversion-option" });
		showFilesBtn.createSpan({ text: "Show affected files" });
		showFilesBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			menu.remove();
			showMismatchedFiles(anchor, entry);
		});
	}

	function showMismatchedFiles(anchor: HTMLElement, entry: PropertyCatalogEntry) {
		const existing = dropdown.querySelector(".tn-pp-files-list");
		if (existing) existing.remove();

		const list = anchor.createDiv({ cls: "tn-pp-files-list" });
		for (const filePath of entry.mismatchedFiles.slice(0, 10)) {
			const fileName = filePath.split("/").pop()?.replace(".md", "") || filePath;
			list.createDiv({ cls: "tn-pp-file-item", text: fileName });
		}
		if (entry.mismatchedFiles.length > 10) {
			list.createDiv({
				cls: "tn-pp-file-item tn-pp-file-item--more",
				text: `... and ${entry.mismatchedFiles.length - 10} more`,
			});
		}
	}

	async function runConversion(
		key: string,
		targetType: PropertyType,
		files: string[],
		strategy: "convert-in-place" | "create-duplicate"
	) {
		const result = await convertPropertyType(plugin, key, targetType, files, strategy);
		if (result.failed > 0) {
			new Notice(`Converted ${result.converted} files, ${result.failed} failed`);
		} else {
			new Notice(`Converted ${result.converted} file${result.converted !== 1 ? "s" : ""} successfully`);
		}
	}

	// ── Helpers ───────────────────────────────────────

	function createTypeBadge(parent: HTMLElement, type: PropertyType) {
		const badge = parent.createSpan({ cls: `tn-pp-type-badge tn-pp-type-badge--${type}` });
		badge.textContent = TYPE_LABELS[type];
		badge.style.setProperty("--badge-color", TYPE_COLORS[type]);
	}

	function formatValue(value: any, type: PropertyType): string {
		if (value === null || value === undefined || value === "") return "";
		if (type === "date") return String(value);
		if (type === "list" && Array.isArray(value)) return value.join(", ");
		if (type === "boolean") return value ? "Yes" : "No";
		return String(value);
	}

	// ── Dropdown positioning ──────────────────────────

	function positionDropdown() {
		const inputRect = searchInput.getBoundingClientRect();
		const dropdownHeight = 280;
		const viewportHeight = window.innerHeight;

		const spaceBelow = viewportHeight - inputRect.bottom;
		const showAbove = spaceBelow < dropdownHeight && inputRect.top > spaceBelow;

		dropdown.style.left = `${inputRect.left}px`;
		dropdown.style.width = `${Math.max(inputRect.width, 300)}px`;

		if (showAbove) {
			dropdown.style.bottom = `${viewportHeight - inputRect.top + 4}px`;
			dropdown.style.top = "auto";
		} else {
			dropdown.style.top = `${inputRect.bottom + 4}px`;
			dropdown.style.bottom = "auto";
		}
	}

	function openDropdown() {
		if (isDropdownOpen) return;
		isDropdownOpen = true;
		loadProperties();
		dropdown.style.display = "block";
		positionDropdown();
		renderDropdown();
	}

	function closeDropdown() {
		if (!isDropdownOpen) return;
		isDropdownOpen = false;
		dropdown.style.display = "none";
		showAddForm = false;
	}

	// ── Event listeners ───────────────────────────────

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	searchInput.addEventListener("focus", () => openDropdown());
	searchInput.addEventListener("click", () => openDropdown());

	searchInput.addEventListener("input", () => {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			searchQuery = searchInput.value;
			renderDropdown();
		}, 150);
	});

	searchInput.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			closeDropdown();
			searchInput.blur();
		}
	});

	toggleCheckbox.addEventListener("change", () => {
		isVaultWide = toggleCheckbox.checked;
		if (isDropdownOpen) {
			loadProperties();
			renderDropdown();
		}
	});

	// Close dropdown when clicking outside
	const handleOutsideClick = (e: MouseEvent) => {
		const target = e.target as Node;
		if (!container.contains(target) && !dropdown.contains(target)) {
			closeDropdown();
		}
	};
	document.addEventListener("click", handleOutsideClick);

	// Reposition on scroll
	const handleScroll = () => {
		if (isDropdownOpen) positionDropdown();
	};
	window.addEventListener("scroll", handleScroll, true);

	// ── Public API ────────────────────────────────────

	function refresh() {
		loadProperties();
		if (isDropdownOpen) {
			renderDropdown();
		}
	}

	return {
		refresh,
		destroy: () => {
			document.removeEventListener("click", handleOutsideClick);
			window.removeEventListener("scroll", handleScroll, true);
			if (debounceTimer) clearTimeout(debounceTimer);
			dropdown.remove();
			container.empty();
		},
	};
}
