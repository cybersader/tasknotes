# Changelog

All notable changes to this TaskNotes fork will be documented in this file.

This fork (`cybersader/tasknotes`) adds bulk tasking, notifications, and other enhancements to the upstream [TaskNotes](https://github.com/callumalpass/tasknotes) plugin.

## [4.3.14] - 2026-02-01

### Added
- **Upcoming View** (`tasknotesUpcoming`): New Todoist-style Bases view type for aggregated task display
  - Time-categorized sections: Overdue, Today, Tomorrow, This Week, This Month, Later, No Due Date
  - Agenda-style date navigation bar with period selectors (Year, Month, Week, 3-Day, Day, List)
  - Arrow navigation (< >) and "Today" quick-jump button
  - Collapsible sections with item counts
  - "Add task" button at bottom of each section (creates task with correct due date)
  - Reschedule action in section headers
- **Base Notification Sync Service**: Real TaskNote files for notification-enabled bases
  - Creates task files with `type: base-notification` for bases with `notify: true`
  - Fully compatible with Bases filtering (sync-to-files approach)
  - Auto-sync on plugin load, periodic checks, and manual command
  - Configurable behavior when base has no matching items
- **Base notification rendering in Upcoming view**:
  - Bell icon indicator for base notification tasks
  - Right-side accent border for visual distinction
  - Item count badge (e.g., "11" with layers icon)
  - Specialized context menu: Open base, Open task, Mark resolved, Reschedule, Snooze
- **Time display** (Todoist-style): Clock icon with formatted time for tasks with time component
- **Date row color coding**: Overdue (red), Today (green), Tomorrow (orange), This Week/Month (accent), Later (muted)

### Fixed
- **Date categorization timezone bug**: Tasks due "today" were incorrectly showing as "overdue" in negative UTC offset timezones. Root cause: `new Date("YYYY-MM-DD")` parses as UTC midnight. Fixed by using `parseDateAsLocal()` for timezone-safe local date parsing.
- **Add task date bug**: Creating task for "Tomorrow" created it on wrong day due to `toISOString()` UTC conversion. Fixed by using local date components directly.
- **Hover jitter on base notification items**: Conflicting CSS hover styles caused layout shifts. Fixed with consistent padding/margin in hover state.

### Changed
- **Overdue display**: Removed redundant "Due" prefix (e.g., "Yesterday" instead of "Due yesterday") since items are already in red Overdue section
- **Add task button indent**: Subtle 4px indent to align with task content (reduced from 26px)
- **Base notification accent**: Changed from bright purple to subtle `--text-accent` color

## [4.3.13] - 2026-01-30

### Changed
- **Opt-in debug logging**: Converted debug console statements to use DebugLog utility for Obsidian plugin guidelines compliance
  - `BasesQueryWatcher.ts`, `bulk-convert-engine.ts`, `BasesViewBase.ts` now use `plugin.debugLog.*`
  - Debug/log/warn messages only output when debug mode enabled (toggle via command)
  - Error messages still always output (allowed per Obsidian guidelines)
  - Logs written to both console and `debug.log` file when enabled

### Fixed
- **E2E cross-platform support**: Improved Obsidian binary detection for Windows/macOS/Linux in Playwright tests
- **E2E port conflict**: Changed remote debugging port from 9222 to 9333 to avoid Chrome conflicts

## [4.3.12] - 2026-01-30

### Fixed
- **What's New page missing versions**: Build script now auto-generates missing release notes from CHANGELOG.md when versions are skipped (e.g., due to CI failures)

### Added
- Release notes gap detection in `generate-release-notes-import.mjs`

## [4.3.11] - 2026-01-30

### Added
- **Folder autocomplete** for Default Tasks Folder and Archive Folder settings (Task Storage section)

### Fixed
- CI build failure due to missing device identity service imports in main.ts

## [4.3.10] - 2026-01-30

### Added
- **Team Attribution enhancements**:
  - Creator and Assignees cards now include descriptive help text
  - Type dropdown (Text/List) for changing property format
  - Type badge showing current field type in card header
  - Auto-conversion of existing task data when type changes (text↔list)
  - Delete buttons to remove Creator/Assignees fields when not needed
  - Default types documented in overview callout (Creator: text, Assignees: list)

### Fixed
- Duplicate "Add User Field" buttons in Custom User Fields section (empty state + setting)
- Translation key showing literally as label in property settings

### Changed
- Toned down success styling for Team Attribution fields (subtle green border only)
- Assignees field now defaults to "list" type for multiple people
- Clarified notification wording: "everyone using the vault" instead of "the entire team"

## [4.3.9] - 2026-01-29

### Fixed
- **isTask still empty after convert**: Replaced complex conditional logic with simple unconditional approach. Now deletes existing value and sets fresh boolean `true`. No more edge cases.

## [4.3.8] - 2026-01-29

### Fixed
- **isTask empty value bug**: When `isTask:` had no value (YAML null), the convert engine didn't repair it. Now handles `null` in addition to `undefined` and empty string.

## [4.3.7] - 2026-01-29

### Fixed
- **isTask checkbox rendering (dash/prohibition symbol)**: Added auto-repair for files with string `"true"` instead of boolean `true`. Convert mode now detects and fixes type mismatches, ensuring Obsidian Bases renders checkboxes correctly.
- **BasesQueryWatcher "monitoring 0 bases"**: Added debug logging to identify why `.base` files with `notify: true` weren't being monitored. Silent YAML parse errors are now logged.

### Changed
- Convert engine now coerces boolean-like strings (`"yes"`, `"no"`, `"1"`, `"0"`) to proper booleans

## [4.3.6] - 2026-01-28

### Fixed
- **isTask detection bug**: `TaskManager.isTaskFile()` rejected empty `taskPropertyValue` setting, so converted files with `isTask: true` were never recognized as tasks. Guard clause now treats empty value as "property existence check" (any truthy value matches).
- **Task creation with empty propValue**: `TaskService` now defaults to `isTask: true` (boolean) when `taskPropertyValue` setting is empty, matching the convert engine's behavior.

## [4.3.5] - 2026-01-28

### Added
- Compatibility panel in Convert mode showing file type breakdown before conversion
  - Shows ready-to-convert, already-task, and non-markdown file counts
  - Expandable section listing incompatible filenames (max 5, then grouped overflow)
  - Warning banner when >25% of files will be skipped

### Fixed
- "What's New" page now shows fork release notes (was only showing upstream versions)
- Re-converting files with empty `isTask: ""` from buggy v4.3.3 now properly sets `isTask: true`

## [4.3.4] - 2026-01-28

### Fixed
- Convert mode now skips non-markdown files (e.g., `.xlsx`, `.pdf`, `.png`) instead of timing out on metadata cache
- Pre-check shows non-markdown file count in status message

## [4.3.3] - 2026-01-28

### Fixed
- `isTask` property now defaults to `true` when `taskPropertyValue` setting is empty (was setting empty string)

## [4.3.2] - 2026-01-28

### Fixed
- GitHub release workflow now auto-publishes with correct assets (`main.js`, `manifest.json`, `styles.css`)

### Changed
- Bulk Tasking modal UI cleanup: removed redundant description, preview heading, file icons; tightened spacing

## [4.3.1] - 2026-01-28

### Added
- GitHub Actions release workflow for BRAT installation
- Automated releases on version bump

## [4.3.0-fork.1] - 2026-01-28

### Added
- **Bases Query Notifications**: Todoist-style modal triggered by `notify: true` in `.base` files
  - Per-item Open, Complete, Snooze, Dismiss buttons
  - Background watcher evaluates on task updates
- **Bulk Task Generation**: "Bulk tasking" button in Bases toolbar
  - Creates new task files from view results
  - Duplicate detection (wiki-link parsing, URL decode, filename fallback)
  - Skip existing toggle
- **Bulk Convert-to-Task**: Second mode in Bulk Tasking modal
  - Adds task metadata to existing notes in-place
  - Respects `taskIdentificationMethod` setting
  - Optional base-view linking
  - Default mode setting
- **Device-User Identity** (scaffolded): UUID-based device identity for future per-person task targeting
- **Dev tooling**: Test data reset script (`bun run reset`)

### Changed
- Button renamed from "Generate tasks" to "Bulk tasking"
- `.gitignore` updated to include build outputs for BRAT installation

---

## Upstream Releases

For changes in the upstream TaskNotes plugin, see: https://github.com/callumalpass/tasknotes/releases
