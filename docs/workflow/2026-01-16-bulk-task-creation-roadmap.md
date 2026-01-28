# Bulk Task Creation Roadmap

**Date:** 2026-01-16
**Status:** Planning & Initial Implementation
**Context:** Enhancing TaskNotes plugin with bulk task creation from Obsidian Bases views

---

## Summary

This document captures the planning discussion and roadmap for implementing bulk task creation features in the TaskNotes Obsidian plugin. The goal is to allow users to generate or convert multiple tasks from items displayed in Obsidian Bases views.

---

## The Two Paradigms

We identified two distinct approaches to task creation that should both be supported:

| Paradigm | Name | Description | Use Case |
|----------|------|-------------|----------|
| **Paradigm A** | **Generate Tasks** | Creates NEW separate task files that link back to source notes via `projects` field | Source note has its own purpose (document, meeting note, reference material). Task is a separate concern. |
| **Paradigm B** | **Convert to Tasks** | Adds task metadata IN-PLACE to existing notes (e.g., `isTask: true` or task tag) | The note's primary purpose IS to be a task. No separate file needed. |

### Implementation Decision

**Both paradigms will be supported**, controlled by a setting. The user can choose their preferred behavior:
- Setting determines default behavior
- Possible future: modal choice at execution time

---

## Configurable Parent Linking

When generating tasks (Paradigm A), the `projects` field can link to various targets. This should be **user-configurable**:

| Option | Description | Example |
|--------|-------------|---------|
| **Source note** | Links to the note that triggered task creation | `projects: [[Document Name]]` |
| **Source folder** | Links to the folder containing the source note | `projects: [[Folder Name]]` |
| **Folder note** | Links to folder note if using folder notes paradigm | `projects: [[Index]]` or `[[_index]]` |
| **Bases file** | Links to the `.base` file that was used to generate tasks | `projects: [[documents-coming-due]]` |
| **Custom property** | Reads a property from source note and uses that | If source has `project: ClientA`, links to `[[ClientA]]` |
| **None** | No project linking | `projects: []` |

### Default Behavior
- Default: **Source note** (current implementation)
- User can change in plugin settings

---

## Roadmap Phases

### Phase 1: Bug Fixes & Foundation ✅ Partially Complete

| Item | Status | PR |
|------|--------|-----|
| `useParentNoteAsProject` fix | ✅ Done | PR #1 |
| Button visibility bug (persists when switching view types) | 🔧 TODO | PR #1 |
| Basic "Generate Tasks" from TaskNotes Bases views | ✅ Done | PR #2 |

### Phase 2: Configuration & Flexibility

| Item | Status | PR |
|------|--------|-----|
| Configurable parent linking options | TODO | PR #2 or #3 |
| Default values for generated tasks (settings) | TODO | PR #3 |
| Copy specific properties from source to task | TODO | PR #3 |

### Phase 3: Convert-in-Place Feature

| Item | Status | PR |
|------|--------|-----|
| "Convert to Tasks" action (Paradigm B) | TODO | PR #4 |
| Setting to choose Generate vs Convert behavior | TODO | PR #4 |
| Bulk convert from Bases view | TODO | PR #4 |

### Phase 4: Advanced Features (Future)

| Item | Status | Notes |
|------|--------|-------|
| Setting: Enable button on all Bases views | TODO | Advanced toggle, off by default |
| Context menu on Bases rows/cells | TODO | Right-click to generate/convert |
| Row selection UI in modal | TODO | Checkboxes to select which items |
| Integration with folder notes plugins | TODO | Detect and link to folder notes |

---

## PR Strategy

Using **Option B: Separate Branches per Feature** with git worktrees for parallel development.

### Branch Structure

```
main (or master)
├── fix/use-parent-note-as-project     → PR #1 (small bug fix)
├── feature/bulk-task-creation         → PR #2 (generate tasks feature)
├── feature/configurable-parent        → PR #3 (settings for parent linking)
└── feature/convert-to-tasks           → PR #4 (in-place conversion)
```

### PR Descriptions

Each PR should include:
1. Summary (1-2 sentences)
2. Problem being solved
3. Solution approach
4. Testing steps
5. Demo GIF/video
6. Files changed with brief descriptions

---

## Current Implementation Status

### Files Created (PR #2 scope)

```
src/bulk/
├── duplicate-detector.ts      # Checks if tasks already exist for source notes
├── bulk-task-engine.ts        # Iterates items and creates tasks with progress
└── BulkTaskCreationModal.ts   # Modal UI for preview and options
```

### Files Modified

```
src/bases/BasesViewBase.ts     # Added button injection and handler
styles/bases-views.css         # Added styles for button and modal
```

### Known Issues

1. **Button visibility bug**: When switching from TaskNotes view type to Table/other view type within same Bases view, the "Generate tasks" and "New Task" buttons persist incorrectly. They should only appear for TaskNotes view types.

---

## Technical Notes

### Recurring Tasks in TaskNotes

TaskNotes handles recurring tasks with a **single file + instance tracking** approach:
- Same task file throughout lifecycle
- `complete_instances: [date1, date2, ...]` tracks completed occurrences
- `skipped_instances: [...]` tracks skipped occurrences
- `scheduled` date auto-advances to next occurrence
- No file proliferation

### Task Identification Methods

TaskNotes supports two methods to identify task files:
1. **Tag-based**: Files with `#task` tag (configurable)
2. **Property-based**: Files with specific frontmatter property (e.g., `type: task`)

The "Convert to Tasks" feature (Phase 3) will need to respect this setting when adding task metadata.

### Bases Integration Points

- `BasesViewBase.ts` is the abstract base class for all TaskNotes Bases views
- Button injection happens in `setupBulkCreationButton()` and `injectBulkCreationButton()`
- Data extraction uses `BasesDataAdapter.extractDataItems()`
- View type switching doesn't trigger full unload, causing the visibility bug

---

## Documentation Strategy

**User-facing documentation** will be maintained in:
- `cybersader-vault-starters/workflows/tasknotes-workflow/`

This keeps workflow documentation separate from the plugin repo, allowing for personal perspective and direction that may differ from upstream maintainer preferences.

**Technical documentation** (this file and similar) lives in:
- `tasknotes-enhancements/docs/workflow/`

---

## Questions for Future Consideration

1. Should the modal show checkboxes for individual item selection?
2. How to handle conflicts when converting notes that already have some task metadata?
3. Should there be a "dry run" mode that shows what would happen?
4. How to integrate with existing TaskNotes templates for generated tasks?
5. Should converted tasks inherit the source note's creation date or use current date?

---

## Change Log

| Date | Change |
|------|--------|
| 2026-01-16 | Initial planning document created |
| 2026-01-16 | Implemented basic bulk generation (PR #2 scope) |
| 2026-01-16 | Identified button visibility bug |

---

## References

- TaskNotes upstream: https://github.com/callumalpass/tasknotes
- Obsidian Bases API: Internal (not publicly documented)
- Project brief: `tasknotes-enhancements/PROJECT_BRIEF.md`
