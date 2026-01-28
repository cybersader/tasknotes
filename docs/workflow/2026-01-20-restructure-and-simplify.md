# 2026-01-20: Restructure Worktrees & Simplify Notifications

**Date:** 2026-01-20
**Status:** ✅ Implemented
**Context:** Improving dev workflow and simplifying notification system

---

## Summary

This document captures the decision to:
1. **Restructure worktrees** to follow standard Obsidian plugin dev pattern
2. **Simplify notifications** from background polling to on-load triggers
3. **Keep device-user mapping** as implemented
4. **Document generate vs convert** paradigms for future reference

---

## Part 1: Restructure Worktrees

### Problem

Current structure requires manual copying of build artifacts:
```
plugin_development/
├── tasknotes-bulk-creation/          ← git repo
│   ├── src/
│   ├── main.js                       ← build outputs here
│   └── test-vault/.obsidian/plugins/tasknotes/  ← needs manual copy
```

Build outputs to project root, but Obsidian reads from test-vault's plugins folder.

### Solution

Follow standard Obsidian plugin dev pattern - git repo IS the plugin folder:
```
plugin_development/
├── tasknotes-bulk-creation-vault/
│   ├── Document Library/             ← test content at vault root
│   ├── User-DB/
│   ├── TaskNotes/
│   └── .obsidian/plugins/tasknotes/  ← git repo HERE
│       ├── src/
│       ├── main.js                   ← build outputs directly
│       ├── manifest.json
│       └── package.json
```

### Benefits

- Build outputs directly where Obsidian reads
- No manual copying
- Hot Reload plugin works immediately
- Multiple vaults for different test scenarios

### Worktrees to Restructure

1. `tasknotes-bulk-creation` → `tasknotes-bulk-creation-vault/.obsidian/plugins/tasknotes/`
2. `tasknotes-fix-parent-project` → `tasknotes-parent-fix-vault/.obsidian/plugins/tasknotes/`

---

## Part 2: Simplify Notifications

### Problem

Over-engineered notification system with:
- Background `BasesNotificationEngine` with polling intervals
- Separate `BaseFileParser` to parse .base files
- Complex rule management in settings UI
- Interval-based checking independent of view state

### Solution

Simple on-load notification via view options:
- Each TaskNotes view has a "Notify on load" toggle in view settings
- When Bases view loads with results + notify enabled → trigger notification
- Uses user's `notificationType` setting (system or in-app)

### Implementation

**View registration (registration.ts):**
```typescript
options: () => [
  // ... other options
  {
    type: "toggle",
    key: "notify",
    displayName: "Notify on load",
    default: false,
  },
]
```

**In BasesViewBase.ts:**
```typescript
onload(): void {
  // ... setup and render
  this.checkNotifyOnLoad();
}

protected checkNotifyOnLoad(): void {
  if (this.hasTriggeredNotification) return;

  const notify = this.config.get("notify");
  if (!notify) return;

  const dataItems = this.dataAdapter.extractDataItems();
  if (dataItems.length === 0) return;

  this.hasTriggeredNotification = true;
  const message = `${this.type}: ${dataItems.length} items`;
  this.triggerNotification(message);
}
```

**How to use:**
1. Open a .base file with a TaskNotes view (Task List, Kanban, Calendar, Mini Calendar)
2. Click the view settings gear icon
3. Enable "Notify on load"
4. Notification appears when view loads with results

### Files to Remove

- `src/notifications/BasesNotificationEngine.ts`
- `src/notifications/BaseFileParser.ts`
- `src/notifications/BasesNotificationRule.ts`
- `src/notifications/index.ts`
- Notification rules UI from `integrationsTab.ts`
- Related types from `settings.ts`
- Related defaults from `defaults.ts`

### Files to Modify

- `src/bases/BasesViewBase.ts` - add notify-on-load
- `src/main.ts` - remove engine init/cleanup
- `src/settings/tabs/integrationsTab.ts` - remove notification section
- `src/types/settings.ts` - remove notification types
- `src/settings/defaults.ts` - remove notification defaults

---

## Part 3: Device-User Mapping (Keep As-Is)

Already implemented and working:
- `src/identity/DeviceIdentityManager.ts` - UUID via localStorage
- `src/identity/UserRegistry.ts` - device → person mapping
- Settings UI in integrationsTab.ts ("Device identity" section)

No changes needed.

---

## Part 4: Generate vs Convert Paradigms

### Two Approaches to Task Creation

| Paradigm | Name | Description | Use Case |
|----------|------|-------------|----------|
| **A** | **Generate Tasks** | Creates NEW separate task files linking to source via `projects` | Source is document/meeting. Task is separate. |
| **B** | **Convert to Tasks** | Adds task metadata IN-PLACE to existing notes | Note's purpose IS to be a task. |

### Current Status

- **Generate Tasks** (Paradigm A) - ✅ Implemented in PR #2
- **Convert to Tasks** (Paradigm B) - ⬜ Future work (Phase 3)

### Future Implementation for Convert

- Toggle in bulk creation modal: "Generate" vs "Convert"
- Convert adds task tag or `isTask: true` to source note
- Respects `taskIdentificationMethod` setting
- No new file created

### Configurable Parent Linking (Future)

When generating, `projects` can link to:
- Source note (current default)
- Source folder
- Folder note
- Bases file
- Custom property
- None

---

## Implementation Steps

### Step 1: Restructure tasknotes-bulk-creation

```bash
# Create new vault structure
mkdir -p "plugin_development/tasknotes-bulk-creation-vault/.obsidian/plugins"

# Move git repo into plugins folder
mv "plugin_development/tasknotes-bulk-creation" \
   "plugin_development/tasknotes-bulk-creation-vault/.obsidian/plugins/tasknotes"

# Move test content to vault root
cd "plugin_development/tasknotes-bulk-creation-vault"
mv ".obsidian/plugins/tasknotes/test-vault/Document Library" .
mv ".obsidian/plugins/tasknotes/test-vault/User-DB" .
mv ".obsidian/plugins/tasknotes/test-vault/TaskNotes" .
mv ".obsidian/plugins/tasknotes/test-vault/Testing" .
mv ".obsidian/plugins/tasknotes/test-vault/Templates" .

# Clean up old test-vault folder
rm -rf ".obsidian/plugins/tasknotes/test-vault"

# Fresh npm install (correct platform binaries)
cd ".obsidian/plugins/tasknotes"
rm -rf node_modules
npm install
```

### Step 2: Restructure tasknotes-fix-parent-project

Same process for PR #1 worktree.

### Step 3: Simplify Notifications

1. Delete `src/notifications/` directory
2. Remove settings from `integrationsTab.ts`
3. Remove types from `settings.ts`
4. Remove defaults from `defaults.ts`
5. Remove init/cleanup from `main.ts`
6. Add simple notify-on-load in `BasesViewBase.ts`

### Step 4: Verify

1. Open restructured vault in Obsidian
2. `npm run dev` builds in place
3. Hot Reload auto-refreshes plugin
4. Device Identity section visible in settings
5. .base files with `notify: true` trigger notifications

---

## Verification Checklist

- [ ] tasknotes-bulk-creation-vault opens in Obsidian
- [ ] Plugin loads from `.obsidian/plugins/tasknotes/`
- [ ] `npm run dev` outputs main.js in same directory
- [ ] Settings → Integrations shows "Device identity"
- [ ] .base file with `notify: true` triggers notification on load
- [ ] "Generate tasks" button works in Bases views

---

## Change Log

| Date | Change |
|------|--------|
| 2026-01-20 | Decision to restructure worktrees to standard pattern |
| 2026-01-20 | Decision to simplify notifications to on-load trigger |
| 2026-01-20 | Documented generate vs convert paradigms |
| 2026-01-20 | ✅ Implemented worktree restructuring via symlinks |
| 2026-01-20 | ✅ Removed `src/notifications/` directory (complex engine) |
| 2026-01-20 | ✅ Removed notification settings/types/defaults |
| 2026-01-20 | ✅ Added "Notify on load" toggle to all TaskNotes Bases views |
| 2026-01-20 | ✅ Added `checkNotifyOnLoad()` in BasesViewBase.ts |

---

## References

- Original roadmap: `docs/workflow/2026-01-16-bulk-task-creation-roadmap.md`
- TaskNotes upstream: https://github.com/callumalpass/tasknotes
- Project brief: `PROJECT_BRIEF.md`
