# Rallycross Heat System — Implementation Plan

## Overview

Replace the single-shot mass-start with a proper heat-based system:
- Configurable **max cars per heat** and **required laps**
- Heats are created and started one at a time
- Heats auto-close when all entries finish; manual close adds DNF penalty time
- Next-heat driver grouping follows current standings (top-N together, next-N together, etc.)
- Overall leaderboard always shows each driver's **best completed heat** total time
- Existing championship submission re-used: best heat → `rally_results`

---

## Data Model

### New config columns on `rallycross`
```sql
ALTER TABLE rallycross
  ADD COLUMN max_per_heat   INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN required_laps  INTEGER NOT NULL DEFAULT 3;
-- started_at becomes unused; leave in place to avoid breaking existing code
```

### New table: `rallycross_heats`
```sql
CREATE TABLE rallycross_heats (
    id             SERIAL PRIMARY KEY,
    number         INTEGER NOT NULL,          -- sequential heat number, 1-based
    required_laps  INTEGER NOT NULL,          -- snapshot from config at creation time
    started_at     BIGINT,                    -- NULL = created but not yet started
    closed_at      BIGINT                     -- NULL = still active / not yet closed
);
```

### New table: `rallycross_heat_entries`
```sql
CREATE TABLE rallycross_heat_entries (
    heat_id     INTEGER NOT NULL REFERENCES rallycross_heats(id) ON DELETE CASCADE,
    driver_id   INTEGER NOT NULL REFERENCES drivers(id)          ON DELETE CASCADE,
    ts_ms       BIGINT,                       -- driver start timestamp (set when heat starts)
    dnf         BOOLEAN NOT NULL DEFAULT FALSE,
    dnf_time_ms BIGINT,                       -- computed penalty time for DNF entries
    PRIMARY KEY (heat_id, driver_id)
);
```

Key points:
- `ts_ms` is set for **all** entries at `heat.started_at` time (mass start within a heat).
- `dnf_time_ms = slowest_finisher_total_ms + 30 000`. Used as the driver's result if `dnf = true` and the driver has no other completed heat.
- Gate events are matched to a heat by checking `heat.started_at <= event.timestamp < heat.closed_at` (or current time if `closed_at IS NULL`) AND the driver is in that heat's entries.

---

## Implementation Steps

Work through these steps in order. Each step is independently mergeable.

---

### Step 1 — Migration

**File:** `src/lib/server/migrations/008_rallycross_heats.ts`

```ts
export async function runMigration() {
  await sql.unsafe(`
    ALTER TABLE rallycross
      ADD COLUMN IF NOT EXISTS max_per_heat  INTEGER NOT NULL DEFAULT 4,
      ADD COLUMN IF NOT EXISTS required_laps INTEGER NOT NULL DEFAULT 3;

    CREATE TABLE IF NOT EXISTS rallycross_heats (
      id            SERIAL PRIMARY KEY,
      number        INTEGER NOT NULL,
      required_laps INTEGER NOT NULL,
      started_at    BIGINT,
      closed_at     BIGINT
    );

    CREATE TABLE IF NOT EXISTS rallycross_heat_entries (
      heat_id     INTEGER NOT NULL REFERENCES rallycross_heats(id) ON DELETE CASCADE,
      driver_id   INTEGER NOT NULL REFERENCES drivers(id)          ON DELETE CASCADE,
      ts_ms       BIGINT,
      dnf         BOOLEAN NOT NULL DEFAULT FALSE,
      dnf_time_ms BIGINT,
      PRIMARY KEY (heat_id, driver_id)
    );
  `);
}
```

Wire it into `src/lib/server/db.ts`.

---

### Step 2 — Domain logic

**File:** `src/lib/domain/rallycross.ts` — full rewrite / extension.

#### New types
```ts
type HeatEntry = {
  driver_id: number;
  driver_name: string;
  class_id: number;
  class_name: string;
  tag: string;
  ts_ms: number;        // start time for this heat
  dnf: boolean;
  dnf_time_ms: number | null;
  passes: number[];     // gate event timestamps within heat window
};

type HeatResult = {
  driver_id: number;
  driver_name: string;
  class_id: number;
  class_name: string;
  tag: string;
  heat_number: number;
  laps: number[];       // lap times in ms
  lap_count: number;
  total_ms: number | null;   // null if fewer laps than required
  best_lap_ms: number | null;
  finished: boolean;    // lap_count >= required_laps
  dnf: boolean;
  dnf_time_ms: number | null;
};

type OverallResult = {
  driver_id: number;
  driver_name: string;
  class_id: number;
  class_name: string;
  best_total_ms: number | null;
  best_heat_number: number | null;
  heat_results: HeatResult[];   // all heats this driver participated in
};
```

#### Functions to implement / update
- **`computeHeatLaps(passes, ts_ms, cooldown_ms)`** — filter passes >= ts_ms, apply cooldown, return lap-delta array. (Same as existing `computeLaps`, just renamed.)
- **`computeHeatResult(entry, heat_number, required_laps, cooldown_ms)`** — compute `HeatResult` from a `HeatEntry`.
- **`computeDnfTime(heatEntries: HeatResult[], required_laps)`** — find slowest `total_ms` among entries where `finished = true`, add 30 000 ms. Returns `null` if no finisher.
- **`buildHeatLeaderboard(entries, heat_number, required_laps, cooldown_ms)`** → `HeatResult[]` — sorted: finished first (by total_ms asc), then DNF (by dnf_time_ms asc), then unfinished (partial lap count desc).
- **`buildOverallLeaderboard(allHeatResults: HeatResult[])`** → `OverallResult[]` — for each driver, pick the heat with the lowest `total_ms` where `finished = true`. If no finished heat, use best partial (most laps, then total_ms). Sort: drivers with finished heats first (by best_total_ms asc), then partials, then no-shows.
- **`suggestNextHeatGroups(standings: OverallResult[], max_per_heat)`** → `number[][]` — slices the standings into groups of `max_per_heat` driver IDs (top-ranked first). Groups are returned in order fastest-first (the admin starts slowest group first if they want a final-style format, or fastest first — it's up to them).
- **`buildRallycrossSubmission(overallResults)`** — maps each `OverallResult` to a `rally_results`-shaped row: `elapsed_ms = best_total_ms`, `stage_name = 'Rallycross heat ' + best_heat_number`, `dnf = best_total_ms == null`.

Update `rallycross.test.ts` for new signatures.

---

### Step 3 — Backend API

#### 3a. `GET /api/rallycross` — `src/routes/api/rallycross/+server.ts`
Return:
```json
{
  "gate_id": "...",
  "gate_name": "...",
  "cooldown_ms": 10000,
  "max_per_heat": 4,
  "required_laps": 3,
  "active_heat": { "id": 2, "number": 2, "required_laps": 3, "started_at": 123, "closed_at": null },
  "heats": [ { "id": 1, "number": 1, "started_at": 123, "closed_at": 456 }, ... ]
}
```
(Drivers and passes are fetched separately by the leaderboard endpoint.)

#### 3b. `PATCH /api/rallycross` — update config
Extend existing `rallycrossConfigSchema` to accept `max_per_heat` and `required_laps`.

#### 3c. `GET /api/rallycross/leaderboard` (new)
Fetches all heats + their entries (with gate passes from `gate_events`). Calls domain logic. Returns `OverallResult[]`.

#### 3d. `GET /api/rallycross/heat/[id]` (new)
Returns one heat's `HeatResult[]` (live if active, final if closed).

#### 3e. `POST /api/rallycross/heat` (new) — create heat
Body: `{ driver_ids: number[] }` (admin only).
- Inserts a new row into `rallycross_heats` with `number = (last number + 1)`, `required_laps` from config.
- Inserts `rallycross_heat_entries` rows (no `ts_ms` yet, heat not started).
- Returns the created heat.

#### 3f. `POST /api/rallycross/heat/[id]/start` (new)
Admin only. Sets `ts_ms = now` for all entries and `started_at = now` for the heat.

#### 3g. `POST /api/rallycross/heat/[id]/close` (new)
Admin only.
- Checks that `started_at IS NOT NULL` and `closed_at IS NULL`.
- For entries where lap count < required_laps: compute `dnf_time_ms` using `computeDnfTime`, set `dnf = true`, `dnf_time_ms`.
- Sets `heat.closed_at = now`.

#### 3h. `DELETE /api/rallycross` — reset
Extend to also `DELETE FROM rallycross_heats` (cascades to entries). Keeps gate config.

#### 3i. Gate-event auto-close hook — `src/routes/api/gate-event/+server.ts`
After storing the gate event, if the gate is the rallycross gate and there is an active heat:
1. Count passes for each entry in the heat (since `ts_ms`, applying cooldown).
2. If ALL entries have `lap_count >= required_laps` OR `dnf = true`: call the close-heat logic automatically.

This keeps the live leaderboard up to date without a separate polling endpoint.

#### 3j. `POST /api/rallycross/submit` (new)
- Fetches `OverallResult[]` from the same logic as `/leaderboard`.
- Calls `buildRallycrossSubmission()`.
- Inserts into `submitted_rallies`, `rally_results`, `championship_rallies` (same pattern as `submit-rally`).
- Body: `{ name: string, championship_ids: string[] }`.

#### 3k. `GET /api/rallycross/suggest-heat` (new)
Returns the suggested next grouping of driver IDs based on current `OverallResult[]` standings and `max_per_heat`. The frontend uses this to pre-fill the heat creation form.
Returns: `{ groups: number[][] }` — each inner array is one suggested heat's driver IDs, ordered fastest-first.

---

### Step 4 — New `/rallycross/start` page

Becomes heat creation & management (replaces the old mass-start button concept).

**Flow:**
1. Page loads and calls `GET /api/rallycross/suggest-heat` → shows suggested heat groups.
2. Admin picks one group (or edits the driver list) and clicks **"Skapa värmelopp"** → `POST /api/rallycross/heat`.
3. Once a heat is created but not started, a **"Starta värmelopp"** button appears → `POST /api/rallycross/heat/[id]/start`.
4. Once started, a live lap-counter table shows each driver's lap count / time.
5. **"Stäng värmelopp"** (manual close) → `POST /api/rallycross/heat/[id]/close` — confirms with a modal explaining that unfinished drivers get DNF + 30 s penalty.
6. After close: shows final heat results and "Create next heat" button again.

The driver picker shows:
- Suggested group pre-selected (checkboxes)
- All active drivers available to select/deselect
- Warn if selected count > `max_per_heat`

---

### Step 5 — Update `/rallycross/+page.svelte`

1. **Config card** — add `max_per_heat` and `required_laps` inputs. Remove old "Masstart" button. Add "Manage heats →" link to `/rallycross/start`.
2. **Active drivers modal** — copy from `rallies/+page.svelte`.
3. **Heat list** — below config: table of all past heats with status badge (Ej startad / Pågår / Klar), number of entries, and a link to each heat's detail.
4. **Overall leaderboard** — calls `GET /api/rallycross/leaderboard`. Shows:
   - Position
   - Driver name + class
   - Best total time (formatted mm:ss.xxx)
   - "(Värmelopp N)" label showing which heat that best came from
   - Number of completed heats
5. **Submit to championship** — same modal pattern as rallies page, calls `POST /api/rallycross/submit`.
6. Poll overall leaderboard every 2 s; poll config every 5 s.

---

### Step 6 — Championship standings: show time

**`src/lib/domain/standings.ts`**
Add `total_ms: number | null` to `RallyPointsEntry`. Forward it through `calculateStandings`.

**`src/routes/api/championship/[id]/standings/+server.ts`**
Map `total_ms` through the pipeline.

**`src/routes/championships/+page.svelte`**
In each rally cell of the standings table, show time as secondary text under the position badge (e.g. `P2 · 1:25.4`). Use existing `formatMs` utility.

---

## File Summary

### New files
| File | Purpose |
|------|---------|
| `src/lib/server/migrations/008_rallycross_heats.ts` | Schema |
| `src/routes/api/rallycross/leaderboard/+server.ts` | Overall leaderboard |
| `src/routes/api/rallycross/heat/+server.ts` | Create heat |
| `src/routes/api/rallycross/heat/[id]/+server.ts` | Get heat detail |
| `src/routes/api/rallycross/heat/[id]/start/+server.ts` | Start heat |
| `src/routes/api/rallycross/heat/[id]/close/+server.ts` | Close heat |
| `src/routes/api/rallycross/suggest-heat/+server.ts` | Next-heat grouping suggestion |
| `src/routes/api/rallycross/submit/+server.ts` | Championship submission |
| `src/routes/rallycross/start/+page.svelte` | Heat management UI |

### Modified files
| File | What changes |
|------|-------------|
| `src/lib/domain/rallycross.ts` | New heat-based types + functions |
| `src/lib/domain/rallycross.test.ts` | Updated tests |
| `src/lib/domain/standings.ts` | Add `total_ms` to `RallyPointsEntry` |
| `src/lib/server/db.ts` | Import migration 008 |
| `src/lib/server/schemas.ts` | Extend `rallycrossConfigSchema`; add heat + submit schemas |
| `src/routes/api/rallycross/+server.ts` | GET + PATCH + DELETE updates |
| `src/routes/api/rallycross/start/+server.ts` | (can be removed — replaced by heat/start) |
| `src/routes/api/gate-event/+server.ts` | Auto-close hook |
| `src/routes/api/championship/[id]/standings/+server.ts` | Forward `total_ms` |
| `src/routes/rallycross/+page.svelte` | Full UI update |
| `src/routes/championships/+page.svelte` | Show time in standings |

---

## Suggested implementation order

1. **Step 1** (migration) — get schema in place; run `./dump-prod-to-local.sh` to verify clean restore.
2. **Step 2** (domain) — pure functions + tests; no server needed.
3. **Step 3a–3h** (core APIs) — gate config, heat CRUD, close, reset.
4. **Step 4** (start/heat management page) — can be tested immediately with the new APIs.
5. **Step 5** (main rallycross page) — leaderboard + active drivers + submit.
6. **Step 3i** (gate-event auto-close) — final polish; test with synthetic events.
7. **Step 6** (championship time display) — standalone, low-risk.
