# Plan: Remove Multi-Tenancy from Rally Timer

## Context

The app currently supports multiple simultaneous rallies in one DB. The owner only runs one rally at a time, and will host multiple instances on separate URLs if concurrent rallies are ever needed. Drivers are kept between events (not wiped), but assignment for a given rally is still needed.

Multi-tenancy is replaced by a simpler model: stages are the top-level entity, and driver participation is controlled by an `active` boolean on the `drivers` table. To start a new event: create stages, toggle which drivers are active, wipe stage events.

---

## Migration 002 — `src/lib/server/migrations/002_remove_multitenancy.ts`

Run DDL in this order (idempotent with IF EXISTS / IF NOT EXISTS):

1. Drop the four views (`rally_leaderboard`, `stage_leaderboard`, `rally_times`, `stage_times`)
2. Drop `INDEX stages_uniq_per_rally`, then `ALTER TABLE stages DROP COLUMN IF EXISTS rally_id`
3. Add `CREATE UNIQUE INDEX IF NOT EXISTS stages_uniq_name ON stages(name)`
4. `DROP TABLE IF EXISTS rally_drivers`
5. `DROP TABLE IF EXISTS rallies`
6. `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true`
7. Recreate all four views without `rally_id` / `rally_name` columns and without `PARTITION BY rally_id`.
   The views filter on `active` drivers where relevant:
   - `stage_times`: same logic, drop `rally_id`/`rally_name`; filter `JOIN drivers d ON d.id = se.driver_id AND d.active`
   - `rally_times`: same aggregation, group by driver fields only (no rally_id)
   - `rally_leaderboard`: ROW_NUMBER OVER (ORDER BY total_ms); keep PARTITION BY class_id for class_position; no PARTITION BY rally_id
   - `stage_leaderboard`: unchanged logically (was already PARTITION BY stage_id only)

Wire it up: add `import { runMigration as run002 }` and `await run002()` in `src/lib/server/db.ts`.

---

## API Changes

### Delete entirely (whole `api/rally/` subtree)
- `src/routes/api/rally/+server.ts`
- `src/routes/api/rally/[id]/+server.ts`
- `src/routes/api/rally/[id]/stages/+server.ts`
- `src/routes/api/rally/[id]/drivers/+server.ts`
- `src/routes/api/rally/[id]/drivers/[driverId]/+server.ts`
- `src/routes/api/rally/[id]/bundle/+server.ts`

### Create: `src/routes/api/bundle/+server.ts` (GET, no auth)
Replaces the rally-scoped bundle. Returns only active drivers:
```json
{ "drivers": [...], "stages": [...], "start_events": [...], "finish_events": [...] }
```
`drivers` query: `SELECT ... FROM drivers d JOIN classes c ON c.id = d.class_id WHERE d.active ORDER BY d.name`

### Create: `src/routes/api/stage/+server.ts` (GET public, POST admin)
Replaces `/api/rally/[id]/stages`. No rally_id param; inserts `(name)` only.

### Modify: `src/routes/api/driver/+server.ts` (GET, POST)
Add `active` field to GET response. No change to POST (new drivers default to `active = true`).

### Create: `src/routes/api/driver/[id]/+server.ts` (or modify if it exists)
Add `PATCH` handler to toggle `active`. Body: `{ active: boolean }`. Admin only.
Schema: `z.object({ active: z.boolean() })` (add to `schemas.ts` as `driverActiveSchema`).

### Modify: `src/routes/api/stage/[id]/+server.ts`
Drop `rally_id` from `RETURNING` clause in PATCH handler.

### Modify: `src/routes/api/gate/+server.ts`
Remove `LEFT JOIN rallies r ON r.id = s.rally_id` and `r.name AS rally_name` from the GET query.

---

## Type / Schema Cleanup

### `src/lib/types.ts`
- Replace `RallyResponse` type with `BundleResponse` (drop top-level `rally` field)
- Remove `rally_name` from the `Gate` type
- Add `active: boolean` to `Driver` type

### `src/lib/server/schemas.ts`
- Remove `rallyCreateSchema`, `rallyDriverAddSchema`, and their exported types
- Add `driverActiveSchema = z.object({ active: z.boolean() })`

---

## UI Changes

### `src/routes/+page.ts`
Rewrite: fetch `/api/bundle`, return `{ bundle }`. Drop all rally-picker logic and `?r=` param.

### `src/routes/+page.svelte`
- Remove rally dropdown, `selectedRallyId`, `onRallyChange`, `goto` import, `?r=` URL logic
- `loadAllRaw()` calls `GET /api/bundle` with no ID (bundle already returns only active drivers)
- Remove `{#if !selectedRallyId}` guard
- All leaderboard calculation functions are unchanged (same data shape minus rally fields)
- Replace `RallyResponse` import with `BundleResponse`

### `src/routes/rallies/+page.svelte` (keep the `/rallies` URL to avoid nav changes)
- Remove: `Rally` type, `rallies` state, `selectedRallyId`, `createRally`, `deleteRally`, `saveEditRally`, `loadRallies`, `onSelectRallyForEdit`, rally CRUD modal, "Rallies" card section, `newRallyModalOpen`, `rememberRally`/`forgetRally`/localStorage
- Replace driver assignment modal with an active-toggle UI:
  - Load all drivers from `GET /api/driver` (includes `active` field)
  - Show drivers as a list with a toggle/checkbox for `active`
  - On toggle: `PATCH /api/driver/${id}` with `{ active: true/false }` (admin only)
  - No separate "assign" flow — just a single driver list with active state
- `loadStages()` → `GET /api/stage` (no rally ID)
- `createStage()` → `POST /api/stage` (no rally ID)
- Stage menu links change: `/rallies/${selectedRallyId}/stages/${s.id}/events` → `/stages/${s.id}/events`
- Start links change: `/rallies/${selectedRallyId}/stages/${s.id}/start` → `/stages/${s.id}/start`
- Remove `{#if selectedRallyId !== null}` guard around Stages card — always visible
- Polling `$effect` simplifies: call `loadStages()` and `loadGates()` only (driver active state rarely changes, no need to poll)

### `src/routes/+layout.svelte`
Update nav link label: "Manage Rallies" → "Manage" (URL stays `/rallies`)

---

## Route Move: Stage Sub-Pages

Current: `src/routes/rallies/[rallyId]/stages/[stageId]/{events,start}/`
New: `src/routes/stages/[stageId]/{events,start}/`

### `src/routes/stages/[stageId]/events/+page.ts`
- Load from `/api/bundle` (no rally ID)
- Return `{ stageId, bundle }` — drop `rallyId`

### `src/routes/stages/[stageId]/events/+page.svelte`
- Fix import paths (deeper nesting removed)
- Remove `rallyId` from heading; show just stage name
- Remove `rally_name` from Gate type used locally

### `src/routes/stages/[stageId]/start/+page.svelte`
- Fix import paths
- `loadQueue()` calls `/api/bundle` instead of `/api/rally/${rallyId}/bundle`
- Remove `rallyId` from `$page.params`, remove `rally` state, remove `stages` state
- Derive stage name from `bundle.stages.find(s => s.id === stageId)`
- `drivers` comes from `bundle.drivers` — already only active drivers (bundle filters on `active`)

### Delete old route files
Remove the entire `src/routes/rallies/[rallyId]/` directory tree (the `+page.svelte` at `/rallies` itself stays).

---

## Files Summary

| Action | Path |
|--------|------|
| CREATE | `src/lib/server/migrations/002_remove_multitenancy.ts` |
| CREATE | `src/routes/api/bundle/+server.ts` |
| CREATE | `src/routes/api/stage/+server.ts` |
| CREATE | `src/routes/stages/[stageId]/events/+page.ts` |
| CREATE | `src/routes/stages/[stageId]/events/+page.svelte` |
| CREATE | `src/routes/stages/[stageId]/start/+page.svelte` |
| MODIFY | `src/lib/server/db.ts` |
| MODIFY | `src/lib/types.ts` |
| MODIFY | `src/lib/server/schemas.ts` |
| MODIFY | `src/routes/+page.ts` |
| MODIFY | `src/routes/+page.svelte` |
| MODIFY | `src/routes/rallies/+page.svelte` |
| MODIFY | `src/routes/+layout.svelte` |
| MODIFY | `src/routes/api/driver/+server.ts` |
| MODIFY | `src/routes/api/driver/[id]/+server.ts` (add PATCH for active toggle) |
| MODIFY | `src/routes/api/gate/+server.ts` |
| MODIFY | `src/routes/api/stage/[id]/+server.ts` |
| DELETE | `src/routes/api/rally/` (entire subtree) |
| DELETE | `src/routes/rallies/[rallyId]/` (entire subtree) |

---

## Verification

1. `npm run check` — no TypeScript errors
2. `npm run lint` — clean
3. Dev server: `npm run dev` — migrations run on startup; check logs confirm migration 002 applied
4. `/rallies` manage page: stages list loads, create stage works, gates appear, no rally picker visible; driver list shows with active toggles
5. Toggling a driver inactive: they disappear from `/api/bundle` and leaderboard; toggling back restores them
6. `/stages/<id>/start` — start gate page loads, only active drivers shown, UHF events flow through SSE
7. `/stages/<id>/events` — event list loads, driver names resolve from RFID tags
8. `/` results page — leaderboard renders with no rally dropdown, only active drivers shown
9. `GET /api/bundle` returns correct shape with no `rally` field, only active drivers
10. UHF gate `uhf_gate.py` — unchanged, posts to `/api/gate-event` which is unchanged
