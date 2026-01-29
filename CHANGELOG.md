# Changelog

All notable changes to this TaskNotes fork will be documented in this file.

This fork (`cybersader/tasknotes`) adds bulk tasking, notifications, and other enhancements to the upstream [TaskNotes](https://github.com/callumalpass/tasknotes) plugin.

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
