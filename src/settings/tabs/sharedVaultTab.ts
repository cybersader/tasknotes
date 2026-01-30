import { Notice, Setting, TFile } from "obsidian";
import TaskNotesPlugin from "../../main";
import { createSettingGroup } from "../components/settingHelpers";
import { FolderSuggest } from "../components/FolderSuggest";
import { TagSuggest } from "../components/TagSuggest";
import { openFileSelector } from "../../modals/FileSelectorModal";
import type { TranslationKey } from "../../i18n";
import type { UserMappedField } from "../../types/settings";

/**
 * Check if the creator User Field exists in settings
 */
function getCreatorUserField(plugin: TaskNotesPlugin): UserMappedField | undefined {
	const fieldKey = plugin.settings.creatorFieldName || "creator";
	return plugin.settings.userFields?.find((f) => f.key === fieldKey);
}

/**
 * Check if the assignee User Field exists in settings
 */
function getAssigneeUserField(plugin: TaskNotesPlugin): UserMappedField | undefined {
	const fieldKey = plugin.settings.assigneeFieldName || "assignee";
	return plugin.settings.userFields?.find((f) => f.key === fieldKey);
}

/**
 * Renders the Team & Attribution tab - device identity, person notes, and attribution settings
 */
export function renderSharedVaultTab(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	save: () => void
): void {
	container.empty();

	const t = (key: TranslationKey) => plugin.i18n.translate(key);

	// Section 1: Overview Banner - Mental model explanation
	renderOverviewSection(container, plugin, t);

	// Section 2: Team Attribution Fields - Shows Creator and Assignee status with links to Task Properties
	renderTeamAttributionFieldsSection(container, plugin, t);

	// Section 3: Person Notes Source - Configure folder and tag filtering
	renderPersonNotesSourceSection(container, plugin, save, t);

	// Section 4: Your Identity - Device registration
	renderYourIdentitySection(container, plugin, save, t);

	// Section 5: Registered Team Members - All device mappings
	renderTeamMembersSection(container, plugin, save, t);
}

/**
 * Section 1: Overview Banner
 * Explains the mental model: how device identity connects to task attribution
 */
function renderOverviewSection(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	t: (key: TranslationKey) => string
): void {
	createSettingGroup(
		container,
		{
			heading: t("settings.teamAttribution.overview.header" as TranslationKey),
			description: t("settings.teamAttribution.overview.description" as TranslationKey),
		},
		(group) => {
			// Creator vs Assignee explanation - using standard Setting for alignment
			group.addSetting((setting) => {
				setting.setName(t("settings.teamAttribution.overview.creatorVsAssignee.title" as TranslationKey));

				// Build description with clickable "Task Properties" link
				const descEl = setting.descEl;
				descEl.empty();
				descEl.style.whiteSpace = "pre-wrap";

				// Creator field explanation
				descEl.appendText(t("settings.teamAttribution.overview.creatorVsAssignee.creator" as TranslationKey));
				descEl.appendText("\n\n");

				// Assignee field explanation
				descEl.appendText(t("settings.teamAttribution.overview.creatorVsAssignee.assignee" as TranslationKey));
				descEl.appendText("\n\n");

				// Field note with clickable Task Properties link
				descEl.appendText("Both field names can be customized in ");
				const linkEl = descEl.createEl("a", {
					text: "Task Properties",
					cls: "tasknotes-settings-link",
				});
				linkEl.addEventListener("click", (e) => {
					e.preventDefault();
					navigateToTaskProperties(plugin);
				});
				descEl.appendText(" to match your workflow (e.g., 'author', 'owner', 'responsible').");
			});

			// Use case example
			group.addSetting((setting) => {
				setting
					.setName("Why this matters")
					.setDesc(t("settings.teamAttribution.overview.useCase" as TranslationKey));
			});
		}
	);
}

/**
 * Section 2: Team Attribution Fields
 * Shows status of Creator and Assignee fields with links to Task Properties
 */
function renderTeamAttributionFieldsSection(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	t: (key: TranslationKey) => string
): void {
	const creatorField = getCreatorUserField(plugin);
	const creatorFieldKey = plugin.settings.creatorFieldName || "creator";
	const assigneeField = getAssigneeUserField(plugin);
	const assigneeFieldKey = plugin.settings.assigneeFieldName || "assignee";

	createSettingGroup(
		container,
		{
			heading: t("settings.teamAttribution.attributionFields.header" as TranslationKey),
			description: t("settings.teamAttribution.attributionFields.description" as TranslationKey),
		},
		(group) => {
			// Creator field status
			group.addSetting((setting) => {
				if (creatorField) {
					setting
						.setName(t("settings.teamAttribution.attributionFields.creator.configured" as TranslationKey))
						.setDesc(`Using: ${creatorFieldKey} (${creatorField.type})`)
						.addButton((btn) =>
							btn
								.setButtonText("Edit")
								.onClick(() => navigateToTaskProperties(plugin))
						);
					setting.settingEl.addClass("tasknotes-field-status-setting");
					setting.settingEl.addClass("tasknotes-field-status-setting--success");
				} else {
					setting
						.setName(t("settings.teamAttribution.attributionFields.creator.notConfigured" as TranslationKey))
						.setDesc("Go to Task Properties to set up")
						.addButton((btn) =>
							btn
								.setButtonText("Configure")
								.setCta()
								.onClick(() => navigateToTaskProperties(plugin))
						);
					setting.settingEl.addClass("tasknotes-field-status-setting");
					setting.settingEl.addClass("tasknotes-field-status-setting--warning");
				}
			});

			// Assignee field status
			group.addSetting((setting) => {
				if (assigneeField) {
					setting
						.setName(t("settings.teamAttribution.attributionFields.assignee.configured" as TranslationKey))
						.setDesc(`Using: ${assigneeFieldKey} (${assigneeField.type})`)
						.addButton((btn) =>
							btn
								.setButtonText("Edit")
								.onClick(() => navigateToTaskProperties(plugin))
						);
					setting.settingEl.addClass("tasknotes-field-status-setting");
					setting.settingEl.addClass("tasknotes-field-status-setting--success");
				} else {
					setting
						.setName(t("settings.teamAttribution.attributionFields.assignee.notConfigured" as TranslationKey))
						.setDesc("Go to Task Properties to set up")
						.addButton((btn) =>
							btn
								.setButtonText("Configure")
								.setCta()
								.onClick(() => navigateToTaskProperties(plugin))
						);
					setting.settingEl.addClass("tasknotes-field-status-setting");
					setting.settingEl.addClass("tasknotes-field-status-setting--warning");
				}
			});
		}
	);
}

/**
 * Section 3: Person Notes Source
 * Configure where person notes live (folder + optional tag filter)
 */
function renderPersonNotesSourceSection(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	save: () => void,
	t: (key: TranslationKey) => string
): void {
	createSettingGroup(
		container,
		{
			heading: t("settings.teamAttribution.personNotesSource.header" as TranslationKey),
			description: t("settings.teamAttribution.personNotesSource.description" as TranslationKey),
		},
		(group) => {
			// Person notes folder - with autocomplete
			group.addSetting((setting) => {
				setting
					.setName(t("settings.teamAttribution.personNotesSource.folder.name" as TranslationKey))
					.setDesc(t("settings.teamAttribution.personNotesSource.folder.description" as TranslationKey));

				// Create text input with folder suggest
				const inputEl = setting.controlEl.createEl("input", {
					type: "text",
					cls: "tasknotes-settings__card-input folder-suggest-input",
					attr: {
						placeholder: t("settings.teamAttribution.personNotesSource.folder.placeholder" as TranslationKey),
					},
				});
				inputEl.value = plugin.settings.personNotesFolder;

				// Attach folder suggester
				new FolderSuggest(plugin.app, inputEl);

				// Handle value changes
				inputEl.addEventListener("input", () => {
					plugin.settings.personNotesFolder = inputEl.value.trim();
					save();
				});
			});

			// Person tag filter (optional) - with autocomplete
			group.addSetting((setting) => {
				setting
					.setName(t("settings.teamAttribution.personNotesSource.tag.name" as TranslationKey))
					.setDesc(t("settings.teamAttribution.personNotesSource.tag.description" as TranslationKey));

				// Create text input with tag suggest
				const inputEl = setting.controlEl.createEl("input", {
					type: "text",
					cls: "tasknotes-settings__card-input tag-suggest-input",
					attr: {
						placeholder: t("settings.teamAttribution.personNotesSource.tag.placeholder" as TranslationKey),
					},
				});
				inputEl.value = plugin.settings.personNotesTag;

				// Attach tag suggester
				new TagSuggest(plugin.app, inputEl);

				// Handle value changes (strip # if user types it)
				inputEl.addEventListener("input", () => {
					const cleaned = inputEl.value.trim().replace(/^#/, "");
					if (inputEl.value !== cleaned) {
						inputEl.value = cleaned;
					}
					plugin.settings.personNotesTag = cleaned;
					save();
				});
			});
		}
	);
}

/**
 * Section 4: Your Identity
 * Link this device to your person note
 */
function renderYourIdentitySection(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	save: () => void,
	t: (key: TranslationKey) => string
): void {
	createSettingGroup(
		container,
		{
			heading: t("settings.teamAttribution.yourIdentity.header" as TranslationKey),
			description: t("settings.teamAttribution.yourIdentity.description" as TranslationKey),
		},
		(group) => {
			// Device ID (read-only display)
			const shortId = plugin.deviceIdentityManager.getShortDeviceId();
			const fullId = plugin.deviceIdentityManager.getOrCreateDeviceId();

			group.addSetting((setting) => {
				setting
					.setName(t("settings.teamAttribution.yourIdentity.deviceId" as TranslationKey))
					.setDesc(t("settings.teamAttribution.yourIdentity.deviceIdDescription" as TranslationKey) + ` (${fullId})`)
					.addText((text) => {
						text.setValue(shortId).setDisabled(true);
						text.inputEl.addClass("tasknotes-device-id-display");
					});
			});

			// Registration status
			const currentMapping = plugin.userRegistry.getCurrentMapping();
			const isRegistered = currentMapping !== null;

			if (isRegistered && currentMapping) {
				// Show current registration
				const displayName =
					currentMapping.userDisplayName ||
					currentMapping.userNotePath.split("/").pop()?.replace(/\.md$/, "") ||
					"Unknown";

				group.addSetting((setting) => {
					setting
						.setName(t("settings.teamAttribution.yourIdentity.registered" as TranslationKey))
						.setDesc(currentMapping.userNotePath)
						.addButton((button) => {
							button.setButtonText(displayName).setDisabled(true);
						})
						.addButton((button) => {
							button.setButtonText("Change").onClick(() => {
								openPersonNoteSelector(plugin, save, container);
							});
						})
						.addButton((button) => {
							button
								.setButtonText(t("settings.teamAttribution.yourIdentity.unregisterButton" as TranslationKey))
								.setWarning()
								.onClick(async () => {
									await plugin.userRegistry.unregisterDevice();
									new Notice(t("settings.teamAttribution.yourIdentity.unregistrationSuccess" as TranslationKey));
									renderSharedVaultTab(container, plugin, save);
								});
						});
				});
			} else {
				// Show registration button
				group.addSetting((setting) => {
					setting
						.setName(t("settings.teamAttribution.yourIdentity.notRegistered" as TranslationKey))
						.setDesc(t("settings.teamAttribution.yourIdentity.selectPersonNote" as TranslationKey))
						.addButton((button) => {
							button
								.setButtonText(t("settings.teamAttribution.yourIdentity.registerButton" as TranslationKey))
								.setCta()
								.onClick(() => {
									openPersonNoteSelector(plugin, save, container);
								});
						});
				});
			}
		}
	);
}

/**
 * Navigate to Task Properties tab and scroll to Team & Attribution Properties section
 */
function navigateToTaskProperties(plugin: TaskNotesPlugin): void {
	const settingsTab = (plugin.app as any).setting?.activeTab;
	if (settingsTab && settingsTab.containerEl) {
		// Force re-render by clearing target tab
		const tabContent = settingsTab.containerEl.querySelector(
			"#tab-content-task-properties"
		) as HTMLElement;
		if (tabContent) {
			tabContent.empty();
		}

		const tabButton = settingsTab.containerEl.querySelector("#tab-button-task-properties") as HTMLElement;
		if (tabButton) {
			tabButton.click();
			// After tab switch, scroll to Team & Attribution Properties section
			// Use longer delay to ensure render completes
			setTimeout(() => {
				const headings = settingsTab.containerEl.querySelectorAll(".setting-item-heading .setting-item-name");
				for (const heading of headings) {
					if (heading.textContent?.toLowerCase().includes("team & attribution")) {
						(heading as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
						break;
					}
				}
			}, 200);
		}
	}
}

/**
 * Section 5: Registered Team Members
 * All devices that have registered in this vault
 */
function renderTeamMembersSection(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	save: () => void,
	t: (key: TranslationKey) => string
): void {
	const allMappings = plugin.userRegistry.getAllMappings();

	createSettingGroup(
		container,
		{
			heading: t("settings.teamAttribution.teamMembers.header" as TranslationKey),
			description: t("settings.teamAttribution.teamMembers.description" as TranslationKey),
		},
		(group) => {
			if (allMappings.length === 0) {
				group.addSetting((setting) => {
					setting
						.setName(t("settings.teamAttribution.teamMembers.noMembers" as TranslationKey))
						.setDesc("");
				});
				return;
			}

			for (const mapping of allMappings) {
				const isCurrentDevice =
					mapping.deviceId === plugin.deviceIdentityManager.getOrCreateDeviceId();
				const lastSeenDate = new Date(mapping.lastSeen).toLocaleDateString();
				const displayName =
					mapping.userDisplayName ||
					mapping.userNotePath.split("/").pop()?.replace(/\.md$/, "") ||
					"Unknown";

				group.addSetting((setting) => {
					const deviceLabel = `${mapping.deviceName}${isCurrentDevice ? " (this device)" : ""}`;
					const desc = `${t("settings.teamAttribution.teamMembers.person" as TranslationKey)}: ${displayName} • ${t("settings.teamAttribution.teamMembers.lastSeen" as TranslationKey)}: ${lastSeenDate}`;

					setting.setName(deviceLabel).setDesc(desc);

					if (!isCurrentDevice) {
						setting.addButton((button) => {
							button
								.setButtonText(t("settings.teamAttribution.teamMembers.removeDevice" as TranslationKey))
								.setWarning()
								.onClick(async () => {
									await plugin.userRegistry.removeMappingByDeviceId(mapping.deviceId);
									new Notice(`Removed ${mapping.deviceName}`);
									renderSharedVaultTab(container, plugin, save);
								});
						});
					}
				});
			}
		}
	);
}

/**
 * Opens the file selector modal for choosing a person note
 * Filtered by personNotesFolder and personNotesTag settings
 */
function openPersonNoteSelector(
	plugin: TaskNotesPlugin,
	save: () => void,
	container: HTMLElement
): void {
	const folder = plugin.settings.personNotesFolder;
	const tag = plugin.settings.personNotesTag;

	openFileSelector(
		plugin,
		async (file) => {
			if (file && file instanceof TFile) {
				// Get display name from frontmatter title or filename
				const cache = plugin.app.metadataCache.getFileCache(file);
				const titleField = plugin.fieldMapper.toUserField("title");
				const displayName = cache?.frontmatter?.[titleField] || file.basename;

				await plugin.userRegistry.registerDevice(file.path, displayName);
				new Notice(plugin.i18n.translate("settings.teamAttribution.yourIdentity.registrationSuccess" as TranslationKey));
				renderSharedVaultTab(container, plugin, save);
			}
		},
		{
			title: plugin.i18n.translate("settings.teamAttribution.yourIdentity.selectPersonNote" as TranslationKey),
			placeholder: "Search for a person note...",
			filter: (file: TFile) => {
				// Only markdown files
				if (file.extension !== "md") return false;

				// Folder filter
				if (folder) {
					const normalizedFolder = folder.endsWith("/") ? folder : folder + "/";
					if (!file.path.startsWith(normalizedFolder) && file.path !== folder + ".md") {
						// Check if file is in the folder or is the folder note itself
						const fileFolder = file.parent?.path || "";
						if (!fileFolder.startsWith(folder.replace(/\/$/, ""))) {
							return false;
						}
					}
				}

				// Tag filter
				if (tag) {
					const cache = plugin.app.metadataCache.getFileCache(file);
					if (!cache) return false;

					// Check frontmatter tags
					const fmTags = cache.frontmatter?.tags;
					const hasFmTag = Array.isArray(fmTags)
						? fmTags.some((t: string) => t === tag || t === `#${tag}`)
						: typeof fmTags === "string" && (fmTags === tag || fmTags === `#${tag}`);

					// Check inline tags
					const inlineTags = cache.tags?.map((t) => t.tag.replace(/^#/, "")) || [];
					const hasInlineTag = inlineTags.includes(tag);

					if (!hasFmTag && !hasInlineTag) return false;
				}

				return true;
			},
		}
	);
}
