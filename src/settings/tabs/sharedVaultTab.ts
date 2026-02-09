import { Notice, Setting, TFile } from "obsidian";
import TaskNotesPlugin from "../../main";
import { createSettingGroup } from "../components/settingHelpers";
import { sendTestNotification } from "./featuresTab";
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

			// Person type value - what value identifies a person note
			group.addSetting((setting) => {
				setting
					.setName("Person type value")
					.setDesc("Value in the type property that identifies person notes")
					.addText((text) => {
						text
							.setPlaceholder("tn-person")
							.setValue(plugin.settings.personTypeValue)
							.onChange(async (value) => {
								plugin.settings.personTypeValue = value.trim() || "tn-person";
								save();
							});
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
			description: "Groups allow assigning tasks to teams. Group notes need the configured type property value and a members array.",
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

			// Group type value - what value identifies a group note
			group.addSetting((setting) => {
				setting
					.setName("Group type value")
					.setDesc("Value in the type property that identifies group notes")
					.addText((text) => {
						text
							.setPlaceholder("tn-group")
							.setValue(plugin.settings.groupTypeValue)
							.onChange(async (value) => {
								plugin.settings.groupTypeValue = value.trim() || "tn-group";
								save();
							});
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
			"#settings-tab-task-properties"
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
 * Navigate to Features tab and scroll to Notifications section
 */
function navigateToFeatures(plugin: TaskNotesPlugin): void {
	const settingsTab = (plugin.app as any).setting?.activeTab;
	if (settingsTab?.containerEl) {
		const tabContent = settingsTab.containerEl.querySelector(
			"#tab-content-features"
		) as HTMLElement;
		if (tabContent) {
			tabContent.empty();
		}
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
					if (heading.textContent?.toLowerCase().includes("notifications")) {
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
 * Section 6: Notification Scope (per-device)
 * Controls what notifications this device receives.
 * Settings stored in localStorage via DevicePreferencesManager.
 */
function renderNotificationFilteringSection(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	save: () => void,
	t: (key: TranslationKey) => string
): void {
	const devicePrefs = plugin.devicePrefs;
	const deviceName = plugin.deviceIdentityManager.getDeviceName();
	const shortId = plugin.deviceIdentityManager.getShortDeviceId();

	createSettingGroup(
		container,
		{
			heading: "Notification scope",
			description: `Per-device settings for "${deviceName}" (${shortId}). These settings are stored locally and do not sync across devices.`,
		},
		(group) => {
			// Cross-link to vault-wide notification settings
			group.addSetting((setting) => {
				const descEl = setting.descEl;
				setting.setName("Vault defaults");
				descEl.appendText("The vault-wide notification enable/disable and default delivery type are in ");
				const linkEl = descEl.createEl("a", {
					text: "Features \u2192",
					href: "#",
				});
				linkEl.addEventListener("click", (e) => {
					e.preventDefault();
					navigateToFeatures(plugin);
				});
			});

			// Notification type override (per-device)
			group.addSetting((setting) => {
				const vaultDefault = plugin.settings.notificationType || "in-app";
				const hasOverride = devicePrefs.hasNotificationTypeOverride();
				const desc = hasOverride
					? `Vault default: ${vaultDefault}`
					: "Using vault default";
				setting
					.setName("Notification type")
					.setDesc(desc)
					.addDropdown((dropdown) =>
						dropdown
							.addOption("vault-default", `Vault default (${vaultDefault})`)
							.addOption("in-app", "In-app notice")
							.addOption("system", "System notification")
							.addOption("both", "Both (system + in-app)")
							.setValue(hasOverride ? devicePrefs.getNotificationType() : "vault-default")
							.onChange((value) => {
								if (value === "vault-default") {
									devicePrefs.clearOverride("notificationType");
								} else {
									devicePrefs.update({ notificationType: value as "in-app" | "system" | "both" });
								}
								renderSharedVaultTab(container, plugin, save);
							})
					);
			});

			// Test notification button
			group.addSetting((setting) => {
				setting
					.setName("Test notification")
					.setDesc("Send a test notification using the current delivery type for this device.")
					.addButton((button) =>
						button
							.setButtonText("Send test")
							.onClick(() => {
								const type = devicePrefs.getNotificationType();
								sendTestNotification(type, plugin);
							})
					);
			});

			// System notification troubleshooting (show when effective type includes system)
			{
				const effectiveType = devicePrefs.getNotificationType();
				if (effectiveType === "system" || effectiveType === "both") {
					group.addSetting((setting) => {
						const descEl = setting.descEl;
						setting.setName("System notification troubleshooting");
						const permStatus = "Notification" in window ? Notification.permission : "unavailable";
						descEl.appendText(`Browser permission: ${permStatus}. `);

						const detailsEl = descEl.createEl("details");
						detailsEl.createEl("summary", {
							text: "Not seeing system notifications?",
						});
						const list = detailsEl.createEl("ul");
						list.style.marginTop = "4px";
						list.style.paddingLeft = "16px";
						list.createEl("li", {
							text: "Windows: Settings \u2192 System \u2192 Notifications. Make sure Obsidian is listed and allowed, banners are enabled, and Do Not Disturb / Focus Assist is off.",
						});
						list.createEl("li", {
							text: "macOS: System Settings \u2192 Notifications \u2192 Obsidian. Ensure alerts are enabled and Focus is off.",
						});
						list.createEl("li", {
							text: "Linux: Check your desktop environment's notification daemon is running.",
						});

						const knownIssueLi = list.createEl("li");
						knownIssueLi.appendText("Known Electron limitation: On Windows, Obsidian may not register as a notification sender with the OS. If Obsidian does not appear in your Windows notification settings, system notifications will silently fail. This is an ");
						knownIssueLi.createEl("a", {
							text: "upstream Electron issue",
							href: "https://github.com/electron/electron/issues/4973",
						});
						knownIssueLi.appendText(" that requires a fix from the Obsidian team (");
						knownIssueLi.createEl("a", {
							text: "related discussion",
							href: "https://github.com/uphy/obsidian-reminder/issues/73",
						});
						knownIssueLi.appendText("). Use \"In-app\" or \"Both\" as a workaround.");

						list.createEl("li", {
							text: "Obsidian cannot detect if your OS silently suppressed a notification (e.g., via Do Not Disturb). If the test fires but nothing appears, the OS is blocking it.",
						});
					});
				}
			}

			// Filter by assignment toggle (per-device)
			group.addSetting((setting) => {
				const vaultDefault = plugin.settings.vaultWideNotifications?.onlyNotifyIfAssignedToMe ?? false;
				const hasOverride = devicePrefs.hasFilterByAssignmentOverride();
				const effectiveValue = devicePrefs.getFilterByAssignment();
				const desc = hasOverride
					? `Per-device override active. Vault default: ${vaultDefault ? "on" : "off"}`
					: "Only receive notifications for tasks where you (or a group you belong to) are listed as an assignee.";
				setting
					.setName("Filter by assignment")
					.setDesc(desc)
					.addToggle((toggle) =>
						toggle
							.setValue(effectiveValue)
							.onChange((value) => {
								devicePrefs.updateScope({ filterByAssignment: value });
								renderSharedVaultTab(container, plugin, save);
							})
					);
			});

			// Show dependent settings only when filtering is enabled
			if (devicePrefs.getFilterByAssignment()) {
				// Include unassigned tasks toggle (per-device)
				group.addSetting((setting) => {
					setting
						.setName("Include unassigned tasks")
						.setDesc("Also receive notifications for tasks that have no assignee.")
						.addToggle((toggle) =>
							toggle
								.setValue(devicePrefs.getIncludeUnassignedTasks())
								.onChange((value) => {
									devicePrefs.updateScope({ includeUnassignedTasks: value });
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
							.setName("No identity registered")
							.setDesc("Register your device in 'Your identity' above to enable assignment filtering. Until then, all notifications will be shown.");
					});
				}
			}

			// Info text explaining the scope model
			group.addSetting((setting) => {
				setting
					.setName("How notification scope works")
					.setDesc(
						"When filtering is enabled, you receive reminders for tasks where your person note appears in the assignee field. " +
						"This includes direct assignment and group membership. " +
						"Future versions will support per-reminder targeting, allowing task creators to send specific reminders to specific people regardless of task assignment."
					);
			});
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
