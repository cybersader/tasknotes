import { Notice, Setting, TFile } from "obsidian";
import TaskNotesPlugin from "../../main";
import { createSettingGroup } from "../components/settingHelpers";
import { FolderSuggest } from "../components/FolderSuggest";
import { TagSuggest } from "../components/TagSuggest";
import { openFileSelector } from "../../modals/FileSelectorModal";
import { createAvatar } from "../../ui/PersonAvatar";
import type { TranslationKey } from "../../i18n";
import type { UserMappedField, DeviceUserMapping } from "../../types/settings";
import { getColorFromName } from "../../ui/PersonAvatar";

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

	// Section 3.5: Group Notes - Configure group notes for team assignment
	renderGroupNotesSection(container, plugin, save, t);

	// Section 4: Your Identity - Device registration
	renderYourIdentitySection(container, plugin, save, t);

	// Section 5: Registered Team Members - All device mappings
	renderTeamMembersSection(container, plugin, save, t);

	// Section 6: Notification Filtering - Filter notifications by assignee
	renderNotificationFilteringSection(container, plugin, save, t);
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
 * Section 3.5: Group Notes
 * Configure where group notes live for team assignment
 */
function renderGroupNotesSection(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	save: () => void,
	t: (key: TranslationKey) => string
): void {
	createSettingGroup(
		container,
		{
			heading: "Group notes",
			description: "Groups allow assigning tasks to teams. Group notes have type: group in frontmatter with a members array.",
		},
		(group) => {
			// Group notes folder - with autocomplete
			group.addSetting((setting) => {
				setting
					.setName("Group notes folder")
					.setDesc("Folder containing group notes. Leave empty to use same folder as person notes.");

				// Create text input with folder suggest
				const inputEl = setting.controlEl.createEl("input", {
					type: "text",
					cls: "tasknotes-settings__card-input folder-suggest-input",
					attr: {
						placeholder: "User-DB/Groups",
					},
				});
				inputEl.value = plugin.settings.groupNotesFolder;

				// Attach folder suggester
				new FolderSuggest(plugin.app, inputEl);

				// Handle value changes
				inputEl.addEventListener("input", () => {
					plugin.settings.groupNotesFolder = inputEl.value.trim();
					save();
				});
			});

			// Group tag filter (optional) - with autocomplete
			group.addSetting((setting) => {
				setting
					.setName("Group notes tag (optional)")
					.setDesc("Only include notes with this tag as groups");

				// Create text input with tag suggest
				const inputEl = setting.controlEl.createEl("input", {
					type: "text",
					cls: "tasknotes-settings__card-input tag-suggest-input",
					attr: {
						placeholder: "group",
					},
				});
				inputEl.value = plugin.settings.groupNotesTag;

				// Attach tag suggester
				new TagSuggest(plugin.app, inputEl);

				// Handle value changes (strip # if user types it)
				inputEl.addEventListener("input", () => {
					const cleaned = inputEl.value.trim().replace(/^#/, "");
					if (inputEl.value !== cleaned) {
						inputEl.value = cleaned;
					}
					plugin.settings.groupNotesTag = cleaned;
					save();
				});
			});

			// Discovered groups display
			group.addSetting((setting) => {
				setting
					.setName("Discovered groups")
					.setDesc("Groups found in the configured folder");

				const listEl = setting.controlEl.createDiv({ cls: "tasknotes-group-list" });

				const refreshGroups = async () => {
					listEl.empty();
					const groups = await plugin.groupRegistry.discoverGroups();

					if (groups.length === 0) {
						listEl.createSpan({
							text: "No groups found. Create a note with type: group in frontmatter.",
							cls: "tasknotes-group-list__empty"
						});
					} else {
						for (const grp of groups) {
							const itemEl = listEl.createDiv({ cls: "tasknotes-group-list__item" });
							itemEl.createSpan({
								text: `${grp.displayName} (${grp.memberPaths.length} members)`,
								cls: "tasknotes-group-list__name"
							});
						}
					}
				};

				// Refresh button
				setting.addButton((btn) => {
					btn.setButtonText("Refresh")
						.onClick(refreshGroups);
				});

				// Initial load
				refreshGroups();
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
				// Check if person note file still exists
				let personFile = plugin.app.vault.getAbstractFileByPath(currentMapping.userNotePath);
				if (!personFile) {
					const linkPath = currentMapping.userNotePath.replace(/\.md$/, "");
					personFile = plugin.app.metadataCache.getFirstLinkpathDest(linkPath, "");
				}
				const fileExists = personFile instanceof TFile;

				// Show current registration with avatar
				const displayName =
					currentMapping.userDisplayName ||
					currentMapping.userNotePath.split("/").pop()?.replace(/\.md$/, "") ||
					"Unknown";

				group.addSetting((setting) => {
					const descText = fileExists
						? currentMapping.userNotePath
						: `⚠️ File not found: ${currentMapping.userNotePath}`;
					setting
						.setName(t("settings.teamAttribution.yourIdentity.registered" as TranslationKey))
						.setDesc(descText);

					// Create clickable avatar + name container
					const avatarContainer = setting.controlEl.createDiv({
						cls: "tasknotes-identity-avatar-row",
					});

					if (fileExists) {
						avatarContainer.setAttribute("role", "button");
						avatarContainer.setAttribute("tabindex", "0");
						avatarContainer.title = "Click to open person note";
					}

					// Add avatar (with custom color if set)
					const avatar = createAvatar({
						name: displayName,
						size: "md",
						tooltip: fileExists ? `Open ${displayName}` : `${displayName} (file missing)`,
						color: currentMapping.avatarColor,
					});
					avatar.style.cursor = fileExists ? "pointer" : "default";
					if (!fileExists) {
						avatar.style.opacity = "0.6";
					}
					avatarContainer.appendChild(avatar);

					// Add name text
					const nameEl = avatarContainer.createSpan({
						cls: "tasknotes-identity-name",
						text: displayName,
					});
					if (!fileExists) {
						nameEl.style.color = "var(--text-warning)";
					}

					// Click handler to open the person note (only if file exists)
					if (fileExists) {
						const openPersonNote = async () => {
							await plugin.app.workspace.getLeaf().openFile(personFile as TFile);
						};

						avatarContainer.addEventListener("click", openPersonNote);
						avatarContainer.addEventListener("keydown", (e: KeyboardEvent) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								openPersonNote();
							}
						});
					}

					// Add action buttons
					setting
						.addButton((button) => {
							button.setButtonText("Edit").onClick(() => {
								// Toggle edit section visibility
								const parentEl = setting.settingEl.parentElement;
								if (!parentEl) return;
								const existingEdit = parentEl.querySelector(".tasknotes-identity-edit");
								if (existingEdit) {
									existingEdit.remove();
								} else {
									renderIdentityEditSection(parentEl, plugin, currentMapping, save, container);
								}
							});
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

				// Show warning if file is missing
				if (!fileExists) {
					group.addSetting((setting) => {
						setting
							.setName("⚠️ Person note missing")
							.setDesc("The linked person note was deleted or moved. Select a new one or the avatar data will be preserved from settings.")
							.addButton((button) => {
								button
									.setButtonText("Select new person note")
									.setCta()
									.onClick(() => {
										openPersonNoteSelector(plugin, save, container);
									});
							});
					});
				}
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
 * Section 6: Notification Filtering
 * Filter notifications based on task assignee
 */
function renderNotificationFilteringSection(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	save: () => void,
	t: (key: TranslationKey) => string
): void {
	createSettingGroup(
		container,
		{
			heading: "Notification filtering",
			description: "Filter notifications based on who tasks are assigned to. Useful in shared vaults where you only want to see tasks assigned to you.",
		},
		(group) => {
			// Only notify if assigned to me toggle
			group.addSetting((setting) => {
				setting
					.setName("Only notify for my tasks")
					.setDesc("Only show notifications for tasks assigned to you (or groups you belong to). When disabled, you'll see notifications for all tasks.")
					.addToggle((toggle) =>
						toggle
							.setValue(plugin.settings.vaultWideNotifications?.onlyNotifyIfAssignedToMe ?? false)
							.onChange(async (value) => {
								if (!plugin.settings.vaultWideNotifications) {
									plugin.settings.vaultWideNotifications = {} as any;
								}
								plugin.settings.vaultWideNotifications.onlyNotifyIfAssignedToMe = value;
								save();
								// Re-render to show/hide dependent settings
								renderSharedVaultTab(container, plugin, save);
							})
					);
			});

			// Show dependent settings only when filtering is enabled
			if (plugin.settings.vaultWideNotifications?.onlyNotifyIfAssignedToMe) {
				// Include unassigned tasks toggle
				group.addSetting((setting) => {
					setting
						.setName("Include unassigned tasks")
						.setDesc("Also show notifications for tasks that have no assignee. Disable to only see tasks explicitly assigned to you.")
						.addToggle((toggle) =>
							toggle
								.setValue(plugin.settings.vaultWideNotifications?.notifyForUnassignedTasks ?? true)
								.onChange(async (value) => {
									plugin.settings.vaultWideNotifications.notifyForUnassignedTasks = value;
									save();
								})
						);
				});

				// Current identity status
				const currentUser = plugin.userRegistry?.getCurrentUser();
				const currentUserDisplay = plugin.userRegistry?.getCurrentUserDisplayName();

				if (currentUser) {
					group.addSetting((setting) => {
						setting
							.setName("Your identity")
							.setDesc(`Filtering notifications for: ${currentUserDisplay || currentUser}`);
					});
				} else {
					group.addSetting((setting) => {
						setting
							.setName("⚠️ No identity registered")
							.setDesc("Register your device in 'Your Identity' above to enable assignee filtering. Until then, you'll see all notifications.");
					});
				}
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
			showAvatars: true,
			avatarSize: "sm",
		}
	);
}

/**
 * Renders the identity edit section with display name and color picker
 */
function renderIdentityEditSection(
	parentEl: HTMLElement,
	plugin: TaskNotesPlugin,
	mapping: DeviceUserMapping,
	save: () => void,
	container: HTMLElement
): void {
	const editSection = parentEl.createDiv({
		cls: "tasknotes-identity-edit",
	});

	// Display name input
	new Setting(editSection)
		.setName("Display name")
		.setDesc("Override the name shown in the avatar")
		.addText((text) => {
			text
				.setPlaceholder("Leave empty to use file name")
				.setValue(mapping.userDisplayName || "")
				.onChange(async (value) => {
					await plugin.userRegistry.updateMapping(mapping.deviceId, {
						userDisplayName: value || undefined,
					});
					save();
				});
		});

	// Color picker
	const defaultColor = getColorFromName(
		mapping.userDisplayName ||
		mapping.userNotePath.split("/").pop()?.replace(/\.md$/, "") ||
		"Unknown"
	);

	new Setting(editSection)
		.setName("Avatar color")
		.setDesc("Choose a custom color for the avatar")
		.addColorPicker((picker) => {
			picker
				.setValue(mapping.avatarColor || defaultColor)
				.onChange(async (value) => {
					await plugin.userRegistry.updateMapping(mapping.deviceId, {
						avatarColor: value,
					});
					save();
					// Re-render to show new color
					renderSharedVaultTab(container, plugin, save);
				});
		})
		.addButton((button) => {
			button
				.setButtonText("Reset")
				.onClick(async () => {
					await plugin.userRegistry.updateMapping(mapping.deviceId, {
						avatarColor: undefined,
					});
					save();
					renderSharedVaultTab(container, plugin, save);
				});
		});

	// Done button
	new Setting(editSection)
		.addButton((button) => {
			button
				.setButtonText("Done")
				.setCta()
				.onClick(() => {
					editSection.remove();
					// Re-render to apply changes
					renderSharedVaultTab(container, plugin, save);
				});
		});
}
