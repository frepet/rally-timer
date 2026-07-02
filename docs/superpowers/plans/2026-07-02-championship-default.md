# Championship Default ("Star") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins star one championship as the global default so all users land on it when opening the championships page.

**Architecture:** A nullable FK column `default_championship_id` is added to the singleton `settings` table via migration 022. The `GET /api/championship` endpoint joins with settings to expose `is_default: boolean` per championship. A new `PUT /api/championship/[id]/default` endpoint (admin-only) toggles the default. The UI shows a `StarOutline`/`StarSolid` icon button next to the selector (admin only) and pre-selects the default on load.

**Tech Stack:** SvelteKit (TypeScript), postgres.js tagged template literals, Flowbite Svelte components + icons (`StarOutline`, `StarSolid` from `flowbite-svelte-icons`).

## Global Constraints

- All SQL via postgres.js tagged template literals (`sql\`...\``); use `sql.unsafe()` only inside migration files.
- All timestamp columns are `BIGINT` (ms since epoch) — not relevant here, but noted for consistency.
- Every user-visible string must be in `src/lib/i18n.ts` under both `sv` and `en` objects; never hardcode text in `.svelte` files.
- Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props`) — no Svelte 4 stores.
- Strict TypeScript — no `any`.
- Auth via `throwIfNotAdmin(event)` from `src/lib/server/keycloak.ts`.
- Dev server requires `DATABASE_URL` env var; run with `npm run dev` inside `rally-timer-app/`.
- Format: tabs, single quotes, width 100, no trailing commas — `npm run format` in `rally-timer-app/`.

---

### Task 1: Database migration — add `default_championship_id` to settings

**Files:**
- Create: `rally-timer-app/src/lib/server/migrations/022_championship_default.ts`
- Modify: `rally-timer-app/src/lib/server/db.ts` (import + register migration)

**Interfaces:**
- Produces: `settings.default_championship_id UUID REFERENCES championships(id) ON DELETE SET NULL` available to all subsequent DB queries.

- [ ] **Step 1: Create the migration file**

Create `rally-timer-app/src/lib/server/migrations/022_championship_default.ts`:

```typescript
import type { Sql } from '../db';

export async function runMigration(sql: Sql) {
	await sql.unsafe(`
		ALTER TABLE settings
			ADD COLUMN IF NOT EXISTS default_championship_id UUID
				REFERENCES championships(id) ON DELETE SET NULL;
	`);
}
```

- [ ] **Step 2: Register the migration in db.ts**

In `rally-timer-app/src/lib/server/db.ts`, add the import after the existing `run021` import (line ~55):

```typescript
import { runMigration as run022 } from './migrations/022_championship_default';
```

Then append to the `MIGRATIONS` array (after `['021_start_events_stage_ts_index', run021]`):

```typescript
['022_championship_default', run022]
```

- [ ] **Step 3: Verify migration runs cleanly**

Start the dev server (requires `DATABASE_URL` pointing at a local/dev PostgreSQL):
```bash
cd rally-timer-app && npm run dev
```
Check server logs — you should see migration `022_championship_default` applied without errors. Ctrl-C to stop.

- [ ] **Step 4: Commit**

```bash
git add rally-timer-app/src/lib/server/migrations/022_championship_default.ts \
        rally-timer-app/src/lib/server/db.ts
git commit -m "feat: migration 022 — add default_championship_id to settings"
```

---

### Task 2: Update `GET /api/championship` to expose `is_default`

**Files:**
- Modify: `rally-timer-app/src/routes/api/championship/+server.ts`

**Interfaces:**
- Consumes: `settings.default_championship_id` (from Task 1).
- Produces: `GET /api/championship` returns `Array<{ id: string; name: string; created_at: number; is_default: boolean }>`.

- [ ] **Step 1: Update the GET handler**

Replace the entire `GET` function in `rally-timer-app/src/routes/api/championship/+server.ts`:

```typescript
export async function GET(): Promise<Response> {
	const rows = await sql`
		SELECT c.id, c.name, c.created_at,
		       (s.default_championship_id = c.id) AS is_default
		FROM championships c, settings s
		ORDER BY c.created_at
	`;
	return json(rows.map((r) => ({ ...r, created_at: Number(r.created_at), is_default: Boolean(r.is_default) })));
}
```

- [ ] **Step 2: Verify manually**

With the dev server running, open `http://localhost:5173/api/championship` in a browser or run:
```bash
curl -s http://localhost:5173/api/championship | jq .
```
Each championship object should have `"is_default": false` (none starred yet). If there are no championships, the response is `[]` — that's fine.

- [ ] **Step 3: Commit**

```bash
git add rally-timer-app/src/routes/api/championship/+server.ts
git commit -m "feat: expose is_default on GET /api/championship"
```

---

### Task 3: New `PUT /api/championship/[id]/default` endpoint

**Files:**
- Create: `rally-timer-app/src/routes/api/championship/[id]/default/+server.ts`

**Interfaces:**
- Consumes: `settings.default_championship_id` (from Task 1); `throwIfNotAdmin` from `src/lib/server/keycloak.ts`; `sql` from `src/lib/server/db.ts`.
- Produces: `PUT /api/championship/[id]/default` — 204 on success, 401/403 if not admin, 404 if championship not found. Toggles: clears default if already set to this id, sets it otherwise.

- [ ] **Step 1: Create the endpoint file**

Create `rally-timer-app/src/routes/api/championship/[id]/default/+server.ts`:

```typescript
import { error, type RequestEvent } from '@sveltejs/kit';
import { sql } from '../../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../../lib/server/keycloak';

export async function PUT(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const id = event.params.id!;

	const [champ] = await sql`SELECT id FROM championships WHERE id = ${id}::uuid`;
	if (!champ) throw error(404, 'Championship not found');

	await sql`
		UPDATE settings SET default_championship_id =
			CASE WHEN default_championship_id = ${id}::uuid THEN NULL
			     ELSE ${id}::uuid
			END
		WHERE id = 1
	`;

	return new Response(null, { status: 204 });
}
```

- [ ] **Step 2: Verify the endpoint (manual curl with auth skipped)**

Run dev server with `SKIP_AUTH=true`:
```bash
cd rally-timer-app && SKIP_AUTH=true npm run dev
```

Create a championship first if none exist, note its UUID, then:
```bash
# Star it
curl -s -X PUT http://localhost:5173/api/championship/<UUID>/default -w "%{http_code}"
# Expected: 204

# Confirm via GET
curl -s http://localhost:5173/api/championship | jq '.[] | select(.is_default)'
# Expected: the championship object with "is_default": true

# Unstar it (toggle off)
curl -s -X PUT http://localhost:5173/api/championship/<UUID>/default -w "%{http_code}"
# Expected: 204
curl -s http://localhost:5173/api/championship | jq '.[] | select(.is_default)'
# Expected: no output (none starred)
```

- [ ] **Step 3: Commit**

```bash
git add rally-timer-app/src/routes/api/championship/[id]/default/+server.ts
git commit -m "feat: PUT /api/championship/[id]/default — toggle starred default"
```

---

### Task 4: i18n — add star/unstar tooltip strings

**Files:**
- Modify: `rally-timer-app/src/lib/i18n.ts`

**Interfaces:**
- Produces: `t.starChampionship` and `t.unstarChampionship` available in both `sv` and `en` locales.

- [ ] **Step 1: Add Swedish strings**

In `rally-timer-app/src/lib/i18n.ts`, find the `// Championships page` block in the `sv` object (around line 70–79). After `deleteChampionshipTitle` (line 74), add:

```typescript
		starChampionship: 'Sätt som standardmästerskap',
		unstarChampionship: 'Ta bort som standardmästerskap',
```

- [ ] **Step 2: Add English strings**

Find the `// Championships page` block in the `en` object (around line 455–464). After `deleteChampionshipTitle` (line 459), add:

```typescript
		starChampionship: 'Set as default championship',
		unstarChampionship: 'Remove as default championship',
```

- [ ] **Step 3: Type-check**

```bash
cd rally-timer-app && npm run check
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add rally-timer-app/src/lib/i18n.ts
git commit -m "feat: i18n keys for star/unstar championship"
```

---

### Task 5: UI — star button and default pre-selection

**Files:**
- Modify: `rally-timer-app/src/routes/championships/+page.svelte`

**Interfaces:**
- Consumes:
  - `GET /api/championship` now returns `{ id: string; name: string; created_at: number; is_default: boolean }[]` (Task 2).
  - `PUT /api/championship/[id]/default` (Task 3).
  - `t.starChampionship`, `t.unstarChampionship` (Task 4).
  - `StarOutline`, `StarSolid` from `flowbite-svelte-icons`.

- [ ] **Step 1: Add star icons to the import**

In `rally-timer-app/src/routes/championships/+page.svelte`, find the existing icon import line:
```typescript
import { TrashBinOutline, PlusOutline, PenOutline } from 'flowbite-svelte-icons';
```
Replace with:
```typescript
import { TrashBinOutline, PlusOutline, PenOutline, StarOutline, StarSolid } from 'flowbite-svelte-icons';
```

- [ ] **Step 2: Update the `Championship` type**

Find:
```typescript
type Championship = { id: string; name: string; created_at: number };
```
Replace with:
```typescript
type Championship = { id: string; name: string; created_at: number; is_default: boolean };
```

- [ ] **Step 3: Update `loadChampionships` to pre-select the default**

Find the `loadChampionships` function:
```typescript
async function loadChampionships() {
	championships = await fetchJSON<Championship[]>('/api/championship');
	if (!selectedId && championships.length) {
		const idParam = page.url.searchParams.get('id');
		const initial = championships.find((c) => c.id === idParam) ?? championships[0];
		await selectChampionship(initial.id);
	}
}
```
Replace with:
```typescript
async function loadChampionships() {
	championships = await fetchJSON<Championship[]>('/api/championship');
	if (!selectedId && championships.length) {
		const idParam = page.url.searchParams.get('id');
		const initial =
			championships.find((c) => c.id === idParam) ??
			championships.find((c) => c.is_default) ??
			championships[0];
		await selectChampionship(initial.id);
	}
}
```

- [ ] **Step 4: Add the `toggleDefault` function**

After the `deleteChampionship` function, add:

```typescript
async function toggleDefault() {
	if (!selectedId) return;
	try {
		await kcFetchJSON(`/api/championship/${selectedId}/default`, { method: 'PUT' });
		await loadChampionships();
	} catch (e) {
		alert('Error: ' + (e as Error).message);
	}
}
```

- [ ] **Step 5: Add the star button to the selector row**

Find the admin button group in the template (the pen and trash buttons):
```svelte
{#if auth.isAdmin && selectedId}
	<button
		class="rounded p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
		title={t.renameChampionshipTitle}
		onclick={openRenameModal}
	>
		<PenOutline size="sm" />
	</button>
	<button
		class="rounded p-2 text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"
		title={t.deleteChampionshipTitle}
		onclick={() => deleteChampionship(selectedId!)}
	>
		<TrashBinOutline size="sm" />
	</button>
{/if}
```
Replace with:
```svelte
{#if auth.isAdmin && selectedId}
	<button
		class="rounded p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
		title={t.renameChampionshipTitle}
		onclick={openRenameModal}
	>
		<PenOutline size="sm" />
	</button>
	<button
		class="rounded p-2 hover:bg-gray-100 dark:hover:bg-gray-700 {selectedChamp?.is_default ? 'text-yellow-400' : 'text-gray-500'}"
		title={selectedChamp?.is_default ? t.unstarChampionship : t.starChampionship}
		onclick={toggleDefault}
	>
		{#if selectedChamp?.is_default}
			<StarSolid size="sm" />
		{:else}
			<StarOutline size="sm" />
		{/if}
	</button>
	<button
		class="rounded p-2 text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"
		title={t.deleteChampionshipTitle}
		onclick={() => deleteChampionship(selectedId!)}
	>
		<TrashBinOutline size="sm" />
	</button>
{/if}
```

- [ ] **Step 6: Type-check and lint**

```bash
cd rally-timer-app && npm run check && npm run lint
```
Expected: no errors.

- [ ] **Step 7: Manual smoke test in browser**

Run dev server with `SKIP_AUTH=true npm run dev`, open `http://localhost:5173/championships`.

- With multiple championships: click the star button — it should fill solid yellow and reload with the same championship selected. Switch to another championship, click star — the first loses its star, the second gains it. Click the solid star again — it goes back to outline (no default).
- Refresh the page — the starred championship should be pre-selected.
- Add `?id=<other-uuid>` to the URL — should override the default.
- Deleting the starred championship should leave no default (star outline on whichever is selected next).

- [ ] **Step 8: Commit**

```bash
git add rally-timer-app/src/routes/championships/+page.svelte
git commit -m "feat: star button to set default championship, pre-select on load"
```
