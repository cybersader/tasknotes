# TaskNotes Workflow Guide: Short-Term to Long-Term

A practical workflow guide for using TaskNotes with structured note collections. Shows what works today (with workarounds) and how workflows improve with planned plugin enhancements.

## Table of Contents

1. [What This Solves](#what-this-solves)
2. [Example Domain: Document Library](#example-domain-document-library)
3. [Short-Term Workflow (Today)](#short-term-workflow-today)
4. [Long-Term Workflow (With Enhancements)](#long-term-workflow-with-enhancements)
5. [Setup Checklist](#setup-checklist)

---

## What This Solves

### The Problem

Standard todo apps treat tasks as free-floating items. But real work often means tasks tied to specific things:
- **Documents** that need periodic review
- **Controls** that need evidence collection
- **Projects** with milestone-driven deliverables
- **People** who own specific responsibilities

### What TaskNotes Enables

- **Tasks linked to notes**: Via `projects` field, tasks reference their parent document/control/project
- **Reminders by context**: See all tasks for a document, or all documents needing review
- **Workload visibility**: Dashboard views showing who owns what, what's overdue
- **Multi-user attribution**: In shared vaults, track who created/owns each task

### The Gap (Current Limitations)

TaskNotes expects tasks to be CREATED from parent notes or with manual project linking. You cannot today:

| Missing Capability | Impact |
|-------------------|--------|
| Bulk-create tasks from Bases view | Must create tasks one-by-one or use scripts |
| Notifications from Bases queries | Must manually check dashboards on schedule |
| Auto-assign user based on device | Must manually select assignee each time |

This guide shows workarounds for today and the improved workflow once enhancements ship.

---

## Example Domain: Document Library

We'll use a **Document Library** as our example: SOPs, policies, and procedures that require periodic review.

### Document Note Frontmatter

```yaml
---
type: document
title: Data Handling SOP
status: active           # active, draft, deprecated, archived
owner: "[[Jane Doe]]"    # Link to User-DB note
review_cycle: annual     # annual, quarterly, monthly
review_date: 2026-03-01  # Next review due
last_reviewed: 2025-03-01
version: 2.1
tags: [document, sop, data-handling]
---

## Purpose
[Document content...]

## Version History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 2.1 | 2025-03-01 | Jane | Updated retention policy |
```

### Goals

1. **Create review tasks** for each document approaching its review date
2. **Get notifications** when reviews are overdue
3. **Track workload** by document owner
4. **Recur automatically** for annual/quarterly cycles

---

## Short-Term Workflow (Today)

### Workaround 1: Create Tasks FROM the Document Note

The key insight: TaskNotes can auto-link to the parent note when creating tasks.

**Setup (one-time):**
1. Settings → TaskNotes → Task Creation Defaults
2. Enable: **"Use parent note as project"** = ON

**Workflow:**
1. Open the document note (e.g., `Document Library/Data-Handling-SOP.md`)
2. Run command: **"TaskNotes: Create new task"** (Cmd/Ctrl+Shift+T or command palette)
3. Fill in task details:
   - Title: "Annual review — Data Handling SOP"
   - Due: 2026-03-01
   - Assignees: [[Jane Doe]]
   - Recurrence: FREQ=YEARLY
4. Save

**Result:** Task created with `projects: [[Data-Handling-SOP]]` auto-filled.

### Workaround 2: Inline Task Conversion

For quick capture without opening the modal:

1. In your document note, add:
   ```markdown
   - [ ] Annual review due 2026-03-01 @Jane
   ```
2. Click the "Convert to task" icon that appears (or run command)
3. Task note created with project link to parent

**Tip:** Enable natural language parsing for dates and assignees.

### Workaround 3: Manual Bulk Creation (One-Time Seeding)

For initial setup, run a QuickAdd/Templater script to seed review tasks for all documents.

**Script: `scripts/seed-document-tasks.js`**

```javascript
// QuickAdd macro: Seed Document Library review tasks
module.exports = async function(params) {
  const { app } = params;
  const docs = app.vault.getMarkdownFiles()
    .filter(f => f.path.startsWith("Document Library/"));

  let created = 0;
  let skipped = 0;

  for (const doc of docs) {
    const cache = app.metadataCache.getFileCache(doc);
    const fm = cache?.frontmatter || {};

    // Skip non-document notes (folder notes, etc.)
    if (fm.type !== "document") {
      skipped++;
      continue;
    }

    const taskPath = `TaskNotes/Tasks/Review — ${doc.basename}.md`;

    // Skip if task already exists
    if (await app.vault.adapter.exists(taskPath)) {
      skipped++;
      continue;
    }

    const due = fm.review_date || "";
    const owner = fm.owner || "";
    const cycle = fm.review_cycle || "annual";

    // Map cycle to recurrence
    const recurrenceMap = {
      "annual": "FREQ=YEARLY",
      "quarterly": "FREQ=MONTHLY;INTERVAL=3",
      "monthly": "FREQ=MONTHLY"
    };
    const recurrence = recurrenceMap[cycle] || "";

    const body = `---
title: Review — ${doc.basename}
isTask: true
status: open
priority: normal
due: ${due}
projects:
  - "[[${doc.basename}]]"
assignees:
  - "${owner}"
recurrence: "${recurrence}"
tags:
  - task
  - review
---

## Review Steps

- [ ] Open [[${doc.basename}]] and review for accuracy
- [ ] Check against current procedures/regulations
- [ ] Update version history if changes made
- [ ] Set next \`review_date\` in parent document
- [ ] Mark this task complete

## Notes

_Add review notes here_
`;
    await app.vault.create(taskPath, body);
    created++;
  }

  new Notice(`Created ${created} review tasks. Skipped ${skipped} (existing or non-document).`);
  return `Created: ${created}, Skipped: ${skipped}`;
}
```

**Usage:**
1. Add script to QuickAdd as a macro
2. Run once to seed initial tasks
3. Recurrence handles future cycles automatically

### Workaround 4: "Coming Due" Dashboard (Manual Check)

Create a Bases view to show documents needing attention. **Check this manually** on a schedule (daily/weekly).

**File: `TaskNotes/Views/documents-coming-due.base`**

```yaml
# Documents Coming Due

filters:
  and:
    - file.inFolder("Document Library")
    - note.type == "document"
    - note.status == "active"

formulas:
  daysUntilReview: 'note.review_date ? ((number(date(note.review_date)) - number(today())) / 86400000).floor() : 999'
  isOverdue: 'formula.daysUntilReview < 0'
  reviewStatus: 'if(formula.daysUntilReview < 0, "OVERDUE", if(formula.daysUntilReview <= 7, "This week", if(formula.daysUntilReview <= 30, "This month", "OK")))'

views:
  - type: table
    name: "Documents Coming Due"
    filters:
      and:
        - formula.daysUntilReview <= 30
    order:
      - formula.daysUntilReview
      - file.name
      - note.owner
      - note.review_date
      - formula.reviewStatus
    sort:
      - column: formula.daysUntilReview
        direction: ASC

  - type: table
    name: "Overdue"
    filters:
      and:
        - formula.isOverdue
    order:
      - formula.daysUntilReview
      - file.name
      - note.owner
    sort:
      - column: formula.daysUntilReview
        direction: ASC

  - type: table
    name: "By Owner"
    order:
      - note.owner
      - file.name
      - formula.daysUntilReview
    group:
      - column: note.owner
    sort:
      - column: formula.daysUntilReview
        direction: ASC

properties:
  file.name:
    displayName: "Document"
  note.owner:
    displayName: "Owner"
  note.review_date:
    displayName: "Review Date"
  formula.daysUntilReview:
    displayName: "Days Until Review"
  formula.reviewStatus:
    displayName: "Status"
```

**Manual workflow:**
1. Open "Documents Coming Due" view weekly
2. Review overdue and upcoming items
3. Create tasks from document notes as needed
4. Update document frontmatter after reviews

### User Attribution (Short-Term)

Without device-user mapping, manually assign users:

1. Make `Assignees` field REQUIRED in TaskNotes settings:
   - Settings → TaskNotes → Modal Fields
   - Find "Assignees" → Enable "Required"

2. Create User-DB folder with person notes:
   ```
   User-DB/
   ├── User-DB.md          # Folder note explaining setup
   ├── Jane Doe.md         # Person note
   ├── John Smith.md
   └── ...
   ```

3. When creating tasks, select assignee from autosuggest

---

## Long-Term Workflow (With Enhancements)

### Enhancement 1: Bulk Task Creation from Bases (Priority 1)

**What changes:**
- New command in Bases views: "Generate tasks for matching items"
- Each row becomes a task with auto-linked project
- Options: skip existing, set defaults, preview before creating

**Improved workflow:**
1. Open `documents-coming-due.base` view
2. Filter to documents needing tasks
3. Click "Generate review tasks" (new command)
4. Preview shows what will be created
5. Confirm → Tasks created with project links
6. Done — no scripting needed

**Implementation notes:**
- Reuses existing task creation modal
- Passes row data to pre-fill fields
- Respects "Use parent note as project" setting
- Tracks created tasks to prevent duplicates

### Enhancement 2: Notifications from Bases Results (Priority 2)

**What changes:**
- Settings → TaskNotes → Notification Rules
- Rules tied to Bases queries
- Toast/system notification when conditions match
- Configurable: on vault load, hourly, etc.

**Improved workflow:**
1. Create notification rule:
   - Query: `documents-coming-due.base`
   - Condition: Any rows where `formula.isOverdue == true`
   - Action: System notification
   - Frequency: On vault load

2. On opening vault: "3 documents are overdue for review"

3. Click notification → Opens the Bases view

**No more forgetting to check dashboards.**

### Enhancement 3: Device → User Mapping (Priority 3)

**What changes:**
- Settings: "This device = [[Person Note]]"
- Device UUID stored persistently
- Tasks auto-populate creator/assignee fields
- Works on shared SMB/network vaults

**Improved workflow:**
1. **One-time setup per device:**
   - Settings → TaskNotes → Device Identity
   - Select your person note from User-DB
   - Saved to local plugin data (not synced)

2. **When creating tasks:**
   - Creator field auto-filled
   - Assignee defaults to creator (configurable)
   - No manual selection needed

3. **In dashboards:**
   - "My Tasks" view works automatically
   - Workload reports accurate without manual attribution

**Multi-user vault scenario:**
- Ben's laptop → mapped to `[[Ben Rader]]`
- Grace's laptop → mapped to `[[Grace Rader]]`
- Same vault, tasks correctly attributed

---

## Setup Checklist

### Initial Setup (Do Once)

- [ ] Install TaskNotes plugin from Community Plugins
- [ ] Configure settings:
  - [ ] `tasksFolder`: `TaskNotes/Tasks/`
  - [ ] `taskIdentificationMethod`: `tag` (uses `#task`) or `property` (uses `isTask: true`)
  - [ ] Enable "Use parent note as project" = ON
  - [ ] Enable Bases: ON
- [ ] Create `User-DB/` folder with team member notes
- [ ] Make `Projects` and `Assignees` REQUIRED in Modal Fields

### Document Library Setup

- [ ] Create `Document Library/` folder
- [ ] Create document template (see `Templates/document-template.md`)
- [ ] Add documents with proper frontmatter
- [ ] Create "Documents Coming Due" .base view
- [ ] (Optional) Run task seeding script

### Ongoing Workflow (Short-Term)

| When | Do |
|------|-----|
| Weekly | Check "Documents Coming Due" dashboard |
| As needed | Create tasks from document notes |
| On completion | Complete task, update parent document frontmatter |
| Automatically | Recurrence handles future review cycles |

### After Enhancements Ship

| Instead of | You'll do |
|------------|-----------|
| Manual dashboard checks | Receive notifications automatically |
| One-by-one task creation | Bulk generate from Bases view |
| Manual assignee selection | Auto-attributed to device user |

---

## File Reference

### Templates

| File | Purpose |
|------|---------|
| `Templates/document-template.md` | New document note with review fields |
| `Templates/review-task-template.md` | Review task with checklist |

### Views

| File | Purpose |
|------|---------|
| `TaskNotes/Views/documents-coming-due.base` | Documents needing review |
| `TaskNotes/Views/tasks-by-owner.base` | Workload by assignee |
| `TaskNotes/Views/all-tasks-default.base` | Standard task list |

### Scripts

| File | Purpose |
|------|---------|
| `scripts/seed-document-tasks.js` | QuickAdd macro for bulk task creation |

---

## Summary

**Today (Short-Term):**
- Create tasks FROM document notes (auto-links project)
- Use inline task conversion for quick capture
- Run one-time seeding script for bulk initialization
- Check "Coming Due" dashboard manually on schedule
- Manually select assignee for each task

**Tomorrow (With Enhancements):**
- Click "Generate tasks" from any Bases view
- Receive notifications when query conditions match
- Tasks auto-attributed to current device's user
