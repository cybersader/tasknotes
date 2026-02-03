import { Notice } from "obsidian";
import TaskNotesPlugin from "../../main";
import {
	createSettingGroup,
	configureTextSetting,
	configureToggleSetting,
	configureDropdownSetting,
	configureNumberSetting,
} from "../components/settingHelpers";
import { showStorageLocationConfirmationModal } from "../../modals/StorageLocationConfirmationModal";
import { getAvailableLanguages } from "../../locales";
import type { TranslationKey } from "../../i18n";
import { PropertySelectorModal } from "../../modals/PropertySelectorModal";
import { getAvailableProperties, getPropertyLabels } from "../../utils/propertyHelpers";

/**
 * Renders the Features tab - optional plugin modules and their configuration
 */
export function renderFeaturesTab(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	save: () => void
): void {
	container.empty();

	const translate = (key: TranslationKey, params?: Record<string, string | number>) =>
		plugin.i18n.translate(key, params);

	// Inline Tasks Section
	const availableProperties = getAvailableProperties(plugin);
	const currentInlineProperties = plugin.settings.inlineVisibleProperties || [
		"status", "priority", "due", "scheduled", "recurrence",
	];
	const currentInlineLabels = getPropertyLabels(plugin, currentInlineProperties);

	createSettingGroup(
		container,
		{
			heading: translate("settings.features.inlineTasks.header"),
			description: translate("settings.features.inlineTasks.description"),
		},
		(group) => {
			group.addSetting((setting) =>
				configureToggleSetting(setting, {
					name: translate("settings.features.overlays.taskLinkToggle.name"),
					desc: translate("settings.features.overlays.taskLinkToggle.description"),
					getValue: () => plugin.settings.enableTaskLinkOverlay,
					setValue: async (value: boolean) => {
						plugin.settings.enableTaskLinkOverlay = value;
						save();
						renderFeaturesTab(container, plugin, save);
					},
				})
			);

			if (plugin.settings.enableTaskLinkOverlay) {
				group.addSetting((setting) =>
					configureToggleSetting(setting, {
						name: translate("settings.features.overlays.aliasExclusion.name"),
						desc: translate("settings.features.overlays.aliasExclusion.description"),
						getValue: () => plugin.settings.disableOverlayOnAlias,
						setValue: async (value: boolean) => {
							plugin.settings.disableOverlayOnAlias = value;
							save();
						},
					})
				);

				group.addSetting((setting) => {
					setting
						.setName("Inline Task Card Properties")
						.setDesc("Select which properties to show in inline task cards.")
						.addButton((button) => {
							button.setButtonText("Configure").onClick(() => {
								const modal = new PropertySelectorModal(
									plugin.app,
									availableProperties,
									currentInlineProperties,
									async (selected) => {
										plugin.settings.inlineVisibleProperties = selected;
										save();
										new Notice("Inline task card properties updated");
										renderFeaturesTab(container, plugin, save);
									},
									"Select Inline Task Card Properties",
									"Choose which properties to display in inline task cards."
								);
								modal.open();
							});
						});
				});

				group.addSetting((setting) => {
					setting.setDesc(`Currently showing: ${currentInlineLabels.join(", ")}`);
					setting.settingEl.addClass("settings-view__group-description");
				});
			}

			group.addSetting((setting) =>
				configureToggleSetting(setting, {
					name: translate("settings.features.instantConvert.toggle.name"),
					desc: translate("settings.features.instantConvert.toggle.description"),
					getValue: () => plugin.settings.enableInstantTaskConvert,
					setValue: async (value: boolean) => {
						plugin.settings.enableInstantTaskConvert = value;
						save();
						renderFeaturesTab(container, plugin, save);
					},
				})
			);
		}
	);

	// Natural Language Processing Section
	createSettingGroup(
		container,
		{
			heading: translate("settings.features.nlp.header"),
			description: translate("settings.features.nlp.description"),
		},
		(group) => {
			group.addSetting((setting) =>
				configureToggleSetting(setting, {
					name: translate("settings.features.nlp.enable.name"),
					desc: translate("settings.features.nlp.enable.description"),
					getValue: () => plugin.settings.enableNaturalLanguageInput,
					setValue: async (value: boolean) => {
						plugin.settings.enableNaturalLanguageInput = value;
						save();
						renderFeaturesTab(container, plugin, save);
					},
				})
			);

			if (plugin.settings.enableNaturalLanguageInput) {
				group.addSetting((setting) =>
					configureToggleSetting(setting, {
						name: translate("settings.features.nlp.defaultToScheduled.name"),
						desc: translate("settings.features.nlp.defaultToScheduled.description"),
						getValue: () => plugin.settings.nlpDefaultToScheduled,
						setValue: async (value: boolean) => {
							plugin.settings.nlpDefaultToScheduled = value;
							save();
						},
					})
				);

				group.addSetting((setting) =>
					configureDropdownSetting(setting, {
						name: translate("settings.features.nlp.language.name"),
						desc: translate("settings.features.nlp.language.description"),
						options: getAvailableLanguages(),
						getValue: () => plugin.settings.nlpLanguage,
						setValue: async (value: string) => {
							plugin.settings.nlpLanguage = value;
							save();
						},
					})
				);
			}
		}
	);

	// Task Creation Section (Body Templates)
	createSettingGroup(
		container,
		{
			heading: translate("settings.defaults.header.bodyTemplate"),
			description: translate("settings.defaults.description.bodyTemplate"),
		},
		(group) => {
			group.addSetting((setting) =>
				configureToggleSetting(setting, {
					name: translate("settings.defaults.bodyTemplate.useBodyTemplate.name"),
					desc: translate("settings.defaults.bodyTemplate.useBodyTemplate.description"),
					getValue: () => plugin.settings.taskCreationDefaults.useBodyTemplate,
					setValue: async (value: boolean) => {
						plugin.settings.taskCreationDefaults.useBodyTemplate = value;
						save();
						renderFeaturesTab(container, plugin, save);
					},
				})
			);

			if (plugin.settings.taskCreationDefaults.useBodyTemplate) {
				group.addSetting((setting) =>
					configureTextSetting(setting, {
						name: translate("settings.defaults.bodyTemplate.bodyTemplateFile.name"),
						desc: translate("settings.defaults.bodyTemplate.bodyTemplateFile.description"),
						placeholder: translate("settings.defaults.bodyTemplate.bodyTemplateFile.placeholder"),
						getValue: () => plugin.settings.taskCreationDefaults.bodyTemplate,
						setValue: async (value: string) => {
							plugin.settings.taskCreationDefaults.bodyTemplate = value;
							save();
						},
					})
				);

				// Template Variables Help (rendered as description text)
				group.addSetting((setting) => {
					const variables = [
						translate("settings.defaults.bodyTemplate.variables.title"),
						translate("settings.defaults.bodyTemplate.variables.details"),
						translate("settings.defaults.bodyTemplate.variables.date"),
						translate("settings.defaults.bodyTemplate.variables.time"),
						translate("settings.defaults.bodyTemplate.variables.priority"),
						translate("settings.defaults.bodyTemplate.variables.status"),
						translate("settings.defaults.bodyTemplate.variables.contexts"),
						translate("settings.defaults.bodyTemplate.variables.tags"),
						translate("settings.defaults.bodyTemplate.variables.projects"),
					];
					setting.setName(translate("settings.defaults.bodyTemplate.variablesHeader"));
					setting.setDesc(variables.join(" • "));
				});
			}

			group.addSetting((setting) =>
				configureToggleSetting(setting, {
					name: translate("settings.defaults.instantConversion.useDefaultsOnInstantConvert.name"),
					desc: translate("settings.defaults.instantConversion.useDefaultsOnInstantConvert.description"),
					getValue: () => plugin.settings.useDefaultsOnInstantConvert,
					setValue: async (value: boolean) => {
						plugin.settings.useDefaultsOnInstantConvert = value;
						save();
					},
				})
			);
		}
	);

	// Pomodoro Timer Section
	createSettingGroup(
		container,
		{
			heading: translate("settings.features.pomodoro.header"),
			description: translate("settings.features.pomodoro.description"),
		},
		(group) => {
			group.addSetting((setting) =>
				configureNumberSetting(setting, {
					name: translate("settings.features.pomodoro.workDuration.name"),
					desc: translate("settings.features.pomodoro.workDuration.description"),
					placeholder: "25",
					min: 1,
					max: 120,
					getValue: () => plugin.settings.pomodoroWorkDuration,
					setValue: async (value: number) => {
						plugin.settings.pomodoroWorkDuration = value;
						save();
					},
				})
			);

			group.addSetting((setting) =>
				configureNumberSetting(setting, {
					name: translate("settings.features.pomodoro.shortBreak.name"),
					desc: translate("settings.features.pomodoro.shortBreak.description"),
					placeholder: "5",
					min: 1,
					max: 60,
					getValue: () => plugin.settings.pomodoroShortBreakDuration,
					setValue: async (value: number) => {
						plugin.settings.pomodoroShortBreakDuration = value;
						save();
					},
				})
			);

			group.addSetting((setting) =>
				configureNumberSetting(setting, {
					name: translate("settings.features.pomodoro.longBreak.name"),
					desc: translate("settings.features.pomodoro.longBreak.description"),
					placeholder: "15",
					min: 1,
					max: 120,
					getValue: () => plugin.settings.pomodoroLongBreakDuration,
					setValue: async (value: number) => {
						plugin.settings.pomodoroLongBreakDuration = value;
						save();
					},
				})
			);

			group.addSetting((setting) =>
				configureNumberSetting(setting, {
					name: translate("settings.features.pomodoro.longBreakInterval.name"),
					desc: translate("settings.features.pomodoro.longBreakInterval.description"),
					placeholder: "4",
					min: 1,
					max: 10,
					getValue: () => plugin.settings.pomodoroLongBreakInterval,
					setValue: async (value: number) => {
						plugin.settings.pomodoroLongBreakInterval = value;
						save();
					},
				})
			);

			group.addSetting((setting) =>
				configureToggleSetting(setting, {
					name: translate("settings.features.pomodoro.autoStartBreaks.name"),
					desc: translate("settings.features.pomodoro.autoStartBreaks.description"),
					getValue: () => plugin.settings.pomodoroAutoStartBreaks,
					setValue: async (value: boolean) => {
						plugin.settings.pomodoroAutoStartBreaks = value;
						save();
					},
				})
			);

			group.addSetting((setting) =>
				configureToggleSetting(setting, {
					name: translate("settings.features.pomodoro.autoStartWork.name"),
					desc: translate("settings.features.pomodoro.autoStartWork.description"),
					getValue: () => plugin.settings.pomodoroAutoStartWork,
					setValue: async (value: boolean) => {
						plugin.settings.pomodoroAutoStartWork = value;
						save();
					},
				})
			);

			group.addSetting((setting) =>
				configureToggleSetting(setting, {
					name: translate("settings.features.pomodoro.notifications.name"),
					desc: translate("settings.features.pomodoro.notifications.description"),
					getValue: () => plugin.settings.pomodoroNotifications,
					setValue: async (value: boolean) => {
						plugin.settings.pomodoroNotifications = value;
						save();
					},
				})
			);

			group.addSetting((setting) =>
				configureToggleSetting(setting, {
					name: translate("settings.features.pomodoroSound.enabledName"),
					desc: translate("settings.features.pomodoroSound.enabledDesc"),
					getValue: () => plugin.settings.pomodoroSoundEnabled,
					setValue: async (value: boolean) => {
						plugin.settings.pomodoroSoundEnabled = value;
						save();
						renderFeaturesTab(container, plugin, save);
					},
				})
			);

			if (plugin.settings.pomodoroSoundEnabled) {
				group.addSetting((setting) =>
					configureNumberSetting(setting, {
						name: translate("settings.features.pomodoroSound.volumeName"),
						desc: translate("settings.features.pomodoroSound.volumeDesc"),
						placeholder: "50",
						min: 0,
						max: 100,
						getValue: () => plugin.settings.pomodoroSoundVolume,
						setValue: async (value: number) => {
							plugin.settings.pomodoroSoundVolume = value;
							save();
						},
					})
				);
			}

			group.addSetting((setting) =>
				configureDropdownSetting(setting, {
					name: translate("settings.features.dataStorage.name"),
					desc: translate("settings.features.dataStorage.description"),
					options: [
						{ value: "plugin", label: translate("settings.features.dataStorage.pluginData") },
						{ value: "daily-notes", label: translate("settings.features.dataStorage.dailyNotes") },
					],
					getValue: () => plugin.settings.pomodoroStorageLocation,
					setValue: async (value: string) => {
						const newLocation = value as "plugin" | "daily-notes";
						if (newLocation !== plugin.settings.pomodoroStorageLocation) {
							const data = await plugin.loadData();
							const hasExistingData =
								data?.pomodoroHistory &&
								Array.isArray(data.pomodoroHistory) &&
								data.pomodoroHistory.length > 0;

							const confirmed = await showStorageLocationConfirmationModal(plugin, hasExistingData);

							if (confirmed) {
								plugin.settings.pomodoroStorageLocation = newLocation;
								save();
								new Notice(
									translate("settings.features.dataStorage.notices.locationChanged", {
										location:
											newLocation === "plugin"
												? translate("settings.features.dataStorage.pluginData")
												: translate("settings.features.dataStorage.dailyNotes"),
									})
								);
							} else {
								renderFeaturesTab(container, plugin, save);
							}
						}
					},
				})
			);

			group.addSetting((setting) =>
				configureDropdownSetting(setting, {
					name: translate("settings.features.pomodoro.mobileSidebar.name"),
					desc: translate("settings.features.pomodoro.mobileSidebar.description"),
					options: [
						{ value: "tab", label: translate("settings.features.pomodoro.mobileSidebar.tab") },
						{ value: "left", label: translate("settings.features.pomodoro.mobileSidebar.left") },
						{ value: "right", label: translate("settings.features.pomodoro.mobileSidebar.right") },
					],
					getValue: () => plugin.settings.pomodoroMobileSidebar,
					setValue: async (value: string) => {
						plugin.settings.pomodoroMobileSidebar = value as "tab" | "left" | "right";
						save();
					},
				})
			);
		}
	);

	// Notifications Section
	createSettingGroup(
		container,
		{
			heading: translate("settings.features.notifications.header"),
			description: translate("settings.features.notifications.description"),
		},
		(group) => {
			group.addSetting((setting) =>
				configureToggleSetting(setting, {
					name: translate("settings.features.notifications.enableName"),
					desc: translate("settings.features.notifications.enableDesc"),
					getValue: () => plugin.settings.enableNotifications,
					setValue: async (value: boolean) => {
						plugin.settings.enableNotifications = value;
						save();
						renderFeaturesTab(container, plugin, save);
					},
				})
			);

			if (plugin.settings.enableNotifications) {
				group.addSetting((setting) =>
					configureDropdownSetting(setting, {
						name: translate("settings.features.notifications.typeName"),
						desc: translate("settings.features.notifications.typeDesc"),
						options: [
							{ value: "in-app", label: translate("settings.features.notifications.inAppLabel") },
							{ value: "system", label: translate("settings.features.notifications.systemLabel") },
							{ value: "both", label: "Both (system + in-app)" },
						],
						getValue: () => plugin.settings.notificationType,
						setValue: async (value: string) => {
							plugin.settings.notificationType = value as "in-app" | "system" | "both";
							save();
						},
					})
				);

				// Test notification button
				group.addSetting((setting) => {
					setting
						.setName("Test notification")
						.setDesc("Tests the vault-wide delivery type shown above. Per-device overrides are tested in Team & Attribution.")
						.addButton((button) =>
							button
								.setButtonText("Send test")
								.onClick(() => {
									const type = plugin.settings.notificationType || "in-app";
									sendTestNotification(type, plugin);
								})
						);
				});

				// System notification troubleshooting (show when system or both selected)
				if (plugin.settings.notificationType === "system" || plugin.settings.notificationType === "both") {
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

				// Cross-link to per-device scope settings
				group.addSetting((setting) => {
					const descEl = setting.descEl;
					setting.setName("Per-device scope");
					descEl.appendText("In shared vaults, each device can override the notification type and filter by assignment. ");
					const linkEl = descEl.createEl("a", {
						text: "Team & Attribution \u2192",
						href: "#",
					});
					linkEl.addEventListener("click", (e) => {
						e.preventDefault();
						navigateToNotificationScope(plugin);
					});
				});
			}
		}
	);

	// Bases Views Section
	createSettingGroup(
		container,
		{
			heading: "Bases views",
			description: "Settings for Bases view integration and toolbar buttons",
		},
		(group) => {
			group.addSetting((setting) =>
				configureToggleSetting(setting, {
					name: "Bulk tasking button",
					desc: "Show the bulk tasking button in Bases view toolbars",
					getValue: () => plugin.settings.enableBulkActionsButton,
					setValue: async (value: boolean) => {
						plugin.settings.enableBulkActionsButton = value;
						save();
					},
				})
			);

			group.addSetting((setting) =>
				setting
					.setName("Default bulk mode")
					.setDesc("Choose whether the bulk tasking modal defaults to generating new tasks or converting existing notes")
					.addDropdown((dropdown) =>
						dropdown
							.addOption("generate", "Generate new tasks")
							.addOption("convert", "Convert to tasks")
							.setValue(plugin.settings.defaultBulkMode || "generate")
							.onChange(async (value) => {
								plugin.settings.defaultBulkMode = value as "generate" | "convert";
								save();
							})
					)
			);
		}
	);

	// Performance & Behavior Section
	createSettingGroup(
		container,
		{
			heading: translate("settings.features.performance.header"),
			description: translate("settings.features.performance.description"),
		},
		(group) => {
			group.addSetting((setting) =>
				configureToggleSetting(setting, {
					name: translate("settings.features.overdue.hideCompletedName"),
					desc: translate("settings.features.overdue.hideCompletedDesc"),
					getValue: () => plugin.settings.hideCompletedFromOverdue,
					setValue: async (value: boolean) => {
						plugin.settings.hideCompletedFromOverdue = value;
						save();
					},
				})
			);

			group.addSetting((setting) =>
				configureToggleSetting(setting, {
					name: translate("settings.features.indexing.disableName"),
					desc: translate("settings.features.indexing.disableDesc"),
					getValue: () => plugin.settings.disableNoteIndexing,
					setValue: async (value: boolean) => {
						plugin.settings.disableNoteIndexing = value;
						save();
					},
				})
			);

			if (plugin.settings.suggestionDebounceMs !== undefined) {
				group.addSetting((setting) =>
					configureNumberSetting(setting, {
						name: translate("settings.features.suggestions.debounceName"),
						desc: translate("settings.features.suggestions.debounceDesc"),
						placeholder: "300",
						min: 0,
						max: 2000,
						getValue: () => plugin.settings.suggestionDebounceMs || 0,
						setValue: async (value: number) => {
							plugin.settings.suggestionDebounceMs = value > 0 ? value : undefined;
							save();
						},
					})
				);
			}
		}
	);

	// Time Tracking Section
	createSettingGroup(
		container,
		{
			heading: translate("settings.features.timeTrackingSection.header"),
			description: translate("settings.features.timeTrackingSection.description"),
		},
		(group) => {
			group.addSetting((setting) =>
				configureToggleSetting(setting, {
					name: translate("settings.features.timeTracking.autoStopName"),
					desc: translate("settings.features.timeTracking.autoStopDesc"),
					getValue: () => plugin.settings.autoStopTimeTrackingOnComplete,
					setValue: async (value: boolean) => {
						plugin.settings.autoStopTimeTrackingOnComplete = value;
						save();
					},
				})
			);

			group.addSetting((setting) =>
				configureToggleSetting(setting, {
					name: translate("settings.features.timeTracking.stopNotificationName"),
					desc: translate("settings.features.timeTracking.stopNotificationDesc"),
					getValue: () => plugin.settings.autoStopTimeTrackingNotification,
					setValue: async (value: boolean) => {
						plugin.settings.autoStopTimeTrackingNotification = value;
						save();
					},
				})
			);
		}
	);

	// Recurring Tasks Section
	createSettingGroup(
		container,
		{
			heading: translate("settings.features.recurringSection.header"),
			description: translate("settings.features.recurringSection.description"),
		},
		(group) => {
			group.addSetting((setting) =>
				configureToggleSetting(setting, {
					name: translate("settings.features.recurring.maintainOffsetName"),
					desc: translate("settings.features.recurring.maintainOffsetDesc"),
					getValue: () => plugin.settings.maintainDueDateOffsetInRecurring,
					setValue: async (value: boolean) => {
						plugin.settings.maintainDueDateOffsetInRecurring = value;
						save();
					},
				})
			);
		}
	);

	// Timeblocking Section
	createSettingGroup(
		container,
		{
			heading: translate("settings.features.timeblocking.header"),
			description: translate("settings.features.timeblocking.description"),
		},
		(group) => {
			group.addSetting((setting) =>
				configureToggleSetting(setting, {
					name: translate("settings.features.timeblocking.enableName"),
					desc: translate("settings.features.timeblocking.enableDesc"),
					getValue: () => plugin.settings.calendarViewSettings.enableTimeblocking,
					setValue: async (value: boolean) => {
						plugin.settings.calendarViewSettings.enableTimeblocking = value;
						save();
						renderFeaturesTab(container, plugin, save);
					},
				})
			);

			if (plugin.settings.calendarViewSettings.enableTimeblocking) {
				group.addSetting((setting) =>
					configureToggleSetting(setting, {
						name: translate("settings.features.timeblocking.showBlocksName"),
						desc: translate("settings.features.timeblocking.showBlocksDesc"),
						getValue: () => plugin.settings.calendarViewSettings.defaultShowTimeblocks,
						setValue: async (value: boolean) => {
							plugin.settings.calendarViewSettings.defaultShowTimeblocks = value;
							save();
						},
					})
				);

				group.addSetting((setting) => {
					setting.setDesc(translate("settings.features.timeblocking.usage"));
					setting.settingEl.addClass("settings-view__group-description");
				});
			}
		}
	);
}

/**
 * Send a test notification with diagnostic feedback.
 * Shared by both Features and Team & Attribution test buttons.
 */
export function sendTestNotification(type: "in-app" | "system" | "both", plugin: TaskNotesPlugin): void {
	const message = "This is a test notification from TaskNotes.";
	const diagnostics: string[] = [];

	if (type === "system" || type === "both") {
		if (!("Notification" in window)) {
			diagnostics.push("System: Notification API not available in this environment.");
		} else {
			diagnostics.push(`System: permission=${Notification.permission}`);
			if (Notification.permission === "granted") {
				try {
					const n = new Notification("TaskNotes Test", { body: message });
					n.onshow = () => diagnostics.push("System: onshow fired");
					n.onerror = () => {
						new Notice("System notification error. Your OS may be blocking Obsidian notifications.");
					};
					diagnostics.push("System: Notification constructor succeeded. If nothing appeared, your OS is suppressing it (DND, Focus Assist, or app-level block).");
				} catch (err) {
					diagnostics.push(`System: constructor threw: ${err}`);
					new Notice(`System notification failed: ${err}`);
				}
			} else if (Notification.permission === "default") {
				Notification.requestPermission().then((perm) => {
					if (perm === "granted") {
						new Notification("TaskNotes Test", { body: message });
						new Notice("System: permission granted. Notification sent.");
					} else {
						new Notice(`System: permission ${perm}. Notifications won't work until allowed.`);
					}
				});
				return; // async flow, skip the summary notice
			} else {
				diagnostics.push("System: permission denied. Re-enable in OS settings for Obsidian.");
				new Notice("System notifications denied. Re-enable in your OS notification settings for Obsidian.");
			}
		}
	}

	if (type === "in-app" || type === "both") {
		plugin.toastNotification.show({
			message: "3 items need attention",
			subtitleHtml: '<span class="tn-toast__overdue">1 overdue</span> \u00b7 2 due today',
			timeout: 0,
			actionLabel: "View",
			onAction: () => {
				plugin.toastNotification.dismiss();
			},
			showSnooze: true,
			onSnooze: (minutes) => {
				const label =
					minutes >= 1440
						? "until tomorrow"
						: minutes >= 60
							? `${Math.round(minutes / 60)} hour${Math.round(minutes / 60) > 1 ? "s" : ""}`
							: `${minutes} minute${minutes > 1 ? "s" : ""}`;
				new Notice(`Test: would snooze for ${label}`);
			},
		});
		diagnostics.push("In-app: toast shown.");
	}

	// Show diagnostic summary
	if (diagnostics.length > 0) {
		console.log("[TaskNotes Test Notification]", diagnostics.join(" | "));
	}
}

/**
 * Navigate to Team & Attribution tab and scroll to Notification scope section
 */
function navigateToNotificationScope(plugin: TaskNotesPlugin): void {
	const settingsTab = (plugin.app as any).setting?.activeTab;
	if (settingsTab?.containerEl) {
		const tabContent = settingsTab.containerEl.querySelector(
			"#tab-content-team-attribution"
		) as HTMLElement;
		if (tabContent) {
			tabContent.empty();
		}
		const tabButton = settingsTab.containerEl.querySelector(
			"#tab-button-team-attribution"
		) as HTMLElement;
		if (tabButton) {
			tabButton.click();
			setTimeout(() => {
				const headings = settingsTab.containerEl.querySelectorAll(
					".setting-item-heading .setting-item-name"
				);
				for (const heading of headings) {
					if (heading.textContent?.toLowerCase().includes("notification scope")) {
						(heading as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
						break;
					}
				}
			}, 200);
		}
	}
}
