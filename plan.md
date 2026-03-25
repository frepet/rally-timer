# UI Improvement Plan

Item 13 (Remove Finish Capture) is already done.

## Batch 1 — Trivial / Mechanical ✅ DONE
Do all at once — string/icon substitutions, no logic changes.

| # | Task | File | Change |
|---|------|------|--------|
| 6 | Edit on stage → "Rename" | `routes/rallies/+page.svelte` | Single label string change |
| 7 | Delete buttons → Trash icons | `rallies/+page.svelte`, `drivers/+page.svelte`, `gates/+page.svelte`, `events/+page.svelte` | Replace `"Delete"` text with Flowbite trash icon |
| 8 | Fix date format on timestamp (local) | `events/+page.svelte` | Improve `fmtMs()` — currently bare `toLocaleString()`; use a readable fixed format |

## Batch 2 — Small UI Reworks ✅ DONE
No data model or API changes.

| # | Task | File | Notes |
|---|------|------|-------|
| 4 | Hamburger menu on Gates page | `routes/gates/+page.svelte` | Replace inline Rename/Unassign/Delete buttons with Flowbite `Dropdown` per row |
| 5 | Click rally to select; remove Select button | `routes/rallies/+page.svelte` | Row `onclick` → `onSelectRallyForEdit()`; remove explicit Select button |

## Individual Task 3 — Gate assignment inline in Stages table
**File:** `routes/rallies/+page.svelte`

Add a gate selector dropdown directly in the Stages table row so users don't need to navigate to Events to assign a gate. The gate assignment API pattern already exists in the Events page (`/api/gate/[id]` with `stage_id` body). Needs gates list fetched on the rallies page.

## Individual Task 9 — Date-time picker for timestamp editing
**File:** `routes/rallies/[rallyId]/stages/[stageId]/events/+page.svelte`

Replace the raw epoch-ms `<Input>` in edit mode (line 226) with an HTML `<input type="datetime-local">`. Convert between epoch ms and `datetime-local` string format on read/write. Optionally split date and time columns in display.

## Individual Task 12 — Assign gate from Start page; enforce gate required
**File:** `routes/rallies/[rallyId]/stages/[stageId]/start/+page.svelte`

Copy the gate assignment dropdown pattern from the Events page (lines 160–200). Disable Start/queue controls if no gate is assigned, with a clear prompt to assign one first.

## Individual Tasks 1 + 2 + 10 — Assign Driver: search, modal, manage
**File:** `routes/rallies/+page.svelte`

Tightly coupled — do together:
1. **#2** Add modal wrapper around the current inline driver-assign area
2. **#1** Add a filter/search input inside the modal to filter `availableDrivers()`
3. **#10** Add a "Manage / Add new driver" shortcut inside the modal

## Individual Task 11 — Replace rally selection table with dropdown
**File:** `routes/rallies/+page.svelte`

Replace the full rally selector table (Select/Edit/Delete buttons per row) with a `<Select>` or searchable combobox. Edit/Delete move to icons next to the dropdown. Most disruptive change — do last.

## Execution Order
1. ✅ Batch 1 (#6, #7, #8)
2. ✅ Batch 2 (#4, #5)
3. ✅ Task #3 (gate inline in stages table)
4. ✅ Task #9 (date-time picker)
5. Task #12 (gate on start page + enforcement)
6. Tasks #1 + #2 + #10 (assign driver modal + search + manage)
7. Task #11 (rally selection redesign — most disruptive)
