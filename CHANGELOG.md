# Changelog

All notable changes to this TaskNotes fork will be documented in this file.

This fork (`cybersader/tasknotes`) adds bulk tasking, notifications, and other enhancements to the upstream [TaskNotes](https://github.com/callumalpass/tasknotes) plugin.

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
