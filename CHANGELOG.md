# Changelog

All notable changes to this TaskNotes fork will be documented in this file.

This fork (`cybersader/tasknotes`) adds bulk tasking, notifications, and other enhancements to the upstream [TaskNotes](https://github.com/callumalpass/tasknotes) plugin.

## [4.3.18] - 2026-02-03

### Added
- **UpcomingView 2-row Todoist layout**: Items now display in two rows
  - Row 1: Checkbox + title + assignee avatar stack
  - Row 2: Date/time (color-coded) + project/context or base indicator
  - Base notifications show layers icon + count on Row 2 (number before icon for alignment)
- **"Edit task" context menu**: Right-click any task or base notification to open the edit modal
- **"Assign" context menu**: Right-click to assign/unassign persons and groups
  - Toggle behavior: adds if not assigned, removes if already assigned (multi-select)
  - Supports multiple assignees simultaneously
- **PersonGroupPicker in Edit Task modal**: Assignee and creator fields render with full picker UI
  - Search, pills for selected items, grouped dropdown (People/Groups)
  - Pre-loads existing assignees when editing tasks

### Changed
- **Shortest wikilinks**: Assignee fields now store shortest unique path (e.g., `[[Cybersader]]` instead of `[[User-DB/People/Cybersader]]`)
- **UpcomingView item spacing**: Increased vertical padding (12px) and row gap (3px) to match Todoist density
- **Base notification avatars**: Now visible alongside the layers icon (previously hidden by if/else)

### Fixed
- **PersonGroupPicker detection**: Case-insensitive key comparison fixes field matching edge cases
- **Ctrl+click in UpcomingView**: Now opens tasks and base notifications in new tabs
- **Creator field rendering**: No longer shows as empty text box; uses PersonGroupPicker like assignee
- **Ghost user fields**: Empty-key fields in settings are skipped instead of rendering blank inputs
- **Edit Task modal spacing**: Added margin between field groups (title/contexts gap)
- **Assignee picker loading**: Resolves shortest wikilinks correctly when loading existing assignees

## [4.3.17] - 2026-02-02

### Added
- **Person avatars**: Circular avatars with initials for person/group display
  - Consistent color generation from name hash (15-color palette)
  - Size variants: xs (20px), sm (24px), md (32px), lg (40px)
  - Group indicator (folder icon in corner) for group notes
  - Avatar stacks for showing multiple assignees with overflow indicator (+N)
  - Integrated into person note selector in Settings → Team & Attribution
  - "Registered as" section shows clickable avatar that opens person note
  - **Edit button** to customize display name and avatar color without editing file
  - **Error handling** for deleted/moved person notes with visual warning
  - Custom avatar color stored in settings (persists even if file is deleted)
- **Periodic toast notification check**: Status bar and toast updates on configurable interval
  - Uses `checkInterval` setting from vault-wide notifications
  - Triggers toast for urgent items (overdue, today)
- **Bulk assignee selection**: Assign tasks in bulk from Bases view
  - Dropdown in BulkTaskCreationModal with discovered persons and groups
  - Shows avatar preview next to dropdown
  - Groups shown with folder icon indicator
  - `discoverPersons()` method added to PersonNoteService
- **Assignee-aware notification filtering**: Only notify for tasks assigned to you
  - New setting: "Only notify for my tasks" (default: off for backwards compatibility)
  - "Include unassigned tasks" option when filtering is enabled
  - Resolves group membership (nested groups supported)
  - Visual identity status in settings with registration guidance

### Changed
- File selector modal now supports avatar display via `showAvatars` option
- Person note selector in Team & Attribution settings shows avatars

## [4.3.16] - 2026-02-02

### Added
- **Zettel date fallback chain**: Configure which date to use for zettel YYMMDD portion
  - New setting `zettelDateChain` with ordered fallback: Due → Scheduled → Creation
  - Visual chain selector UI with clickable `[Due] → [Scheduled] → [Creation]` buttons
  - Live preview showing 3 scenarios with example zettel IDs and human-readable dates
  - Automatic migration from legacy `zettelDateSource` setting
- **Comprehensive filename preview**: Title property card now shows live preview at top
  - Frontmatter preview with user-configured property names
  - `← zettel date` indicator shows which property is used based on fallback chain
  - Normal filename + collision filename with highlighted suffix
  - Collision behavior description
  - Contextual tip for collision-proof naming
- **Custom template variables expansion**: Preview now supports all variables
  - `{{title}}`, `{{zettel}}`, `{{timestamp}}`
  - `{{dueDate}}` / `{{due}}`, `{{scheduledDate}}` / `{{scheduled}}`, `{{createdDate}}` / `{{created}}`
  - `{{random}}`, `{{randomLong}}`, `{{milliseconds}}` / `{{millisecondsPadded}}`
  - Preview updates on blur for instant feedback
- **Template variables documentation**: Expandable section in settings with full variable reference
  - Table showing all variables with descriptions and examples
  - Aliases note for shorthand syntax
  - Link to comprehensive docs page (`docs/filename-templates.md`)
- **Settings connection UX**: Visual indicators linking related settings
  - "Retry suffix format" shows "Uses date fallback chain below ↓" when zettel selected
  - Chain description shows "Also used by retry suffix above ↑" when relevant
  - Changing either setting updates both indicators
- **Context-aware "rich" date format** for Upcoming View
  - Smart year display: Skips year if same as current year
  - Today/Tomorrow labels: "Feb 3 • Today • Monday"
  - Clean format: "Feb 5 • Wednesday"

### Fixed
- **Configure view toggle not working**: Bases API returns toggle values as strings ("true"/"false"), not booleans. Fixed type checking in `getDateSettings()` to handle both
- **Section header duplication**: "Feb 2 • Today • Monday • Today • Monday" bug fixed by using simple date format in section headers
- **Zettel collision uniqueness**: Changed from seconds to milliseconds for sub-second collision prevention
- **FilenameCollisionModal missing context**: Now receives due date, scheduled date, and zettel settings for accurate preview
- **"Edit task" action in collision modal**: Returns to task creation screen instead of cancelling

## [4.3.15] - 2026-02-02

### Added
- **New "zettel-title" filename format**: Combines sortable date ID with readable title
  - Format: `260202abc-My Task Title.md` (zettel ID + dash + title)
  - Short, sortable, readable, and collision-proof
  - Available in Settings → Task Properties → Title → Filename format
- **Filename collision behavior setting**: Control how duplicate filenames are handled
  - "Auto-resolve silently" - append -2, -3, etc. without notification (default)
  - "Auto-resolve and notify" - append suffix and show a notice
  - "Always ask me" - show recovery modal to choose action
  - Located in Settings → Task Properties → Title → Filename settings
- **Retry suffix format setting**: Configure what suffix to append when retrying
  - Timestamp (m5abc123) - base36 timestamp (default)
  - Random (k3f) - 3-character random suffix
  - Zettel ID (260202abc) - full zettel identifier
- **Filename collision recovery modal**: User-friendly recovery when file creation fails
  - TaskNotes branding in modal header
  - Clear sections: "Change format for all future tasks" vs "One-time fix"
  - All 5 format options available: zettel-title (recommended), zettel, timestamp, title, custom
  - Preview of exact filename when using "Retry once"
  - Quick access to settings
- **New custom template variables**: For collision-proof filenames
  - `{{millisecondsPadded}}`: Zero-padded milliseconds (000-999) for proper sorting
  - `{{random}}`: 2-character base36 suffix (00-zz)
  - `{{randomLong}}`: 3-character base36 suffix (000-zzz)
  - Recommended collision-proof template: `{{year}}{{month}}{{day}}{{hour}}{{minute}}{{second}}{{millisecondsPadded}}{{random}}`
- **Note UUID system**: Persistent unique identifiers for notes that survive renames/moves
  - `NoteUuidService` generates and manages UUIDs in frontmatter (`tnId` by default)
  - Configurable property name in Settings → Task Properties → Metadata Properties
  - Auto-generates on task creation (TaskService, BulkTaskEngine, BulkConvertEngine)
  - Foundation for future state tracking (snooze, view-entry timestamps, duplicate detection)
- **Groups system**: Group notes (`type: group`) with nested group resolution
  - `GroupRegistry` discovers groups and resolves members recursively
  - Cycle detection prevents infinite loops (max depth: 10)
  - Settings UI section for group notes folder and tag filter
- **Person preferences**: `PersonNoteService` reads reminder preferences from person note frontmatter
  - Configurable `reminderTime`, `reminderLeadTimes`, `notificationEnabled`
- **Bulk operation types**: Unified `BulkOperationResult` interface for consistent result handling
  - Helper functions: `createEmptyResult`, `mergeResults`, `formatResultNotice`
  - Conversion functions: `fromCreationResult`, `fromConvertResult`
- **Device identity integration**: Creator field auto-populated in bulk task creation and conversion

### Fixed
- **Case-insensitive filename collision on Windows**: `generateUniqueFilename()` now uses case-insensitive comparison to prevent "File already exists" errors when filenames differ only by case (e.g., "Test" vs "test")
- **Folder autocomplete drill-down**: Selecting a folder with subfolders now keeps the dropdown open to show subfolders, instead of requiring manual re-entry

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
