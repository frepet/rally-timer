# AGENTS.md — rally-timer-app

## Commands

```bash
npm install          # install deps
npm run dev          # dev server (needs DATABASE_URL)
npm run dev:noauth   # dev server with SKIP_AUTH=true
npm run build        # production build
npm run check        # svelte-check (TypeScript + Svelte)
npm run lint         # Prettier + ESLint check
npm run format       # auto-format (tabs, single quotes, width 100, no trailing commas)
npm test             # vitest unit tests (run after every change)
npx vitest run src/lib/domain/foo.test.ts   # run a single test file
```

## Architecture: strict layer separation

### Domain layer — `src/lib/domain/`

All business logic lives here and nowhere else. Domain modules are pure TypeScript with no imports from SvelteKit, database, or UI code.

**Rules:**

- SQL queries fetch raw rows only — no `GROUP BY`, `SUM`, `COUNT`, `CASE`, or other logic that encodes business rules. The database is a dumb store.
- Svelte components display data only — no sorting, ranking, scoring, or aggregation in `.svelte` files or `+page.ts` load functions.
- If the same computation is needed in two views, extract it into a domain function and import it from both. Never duplicate the logic.

**Canonical example:** `rallyResults.ts` exports `aggregateRallyResults` (replaces SQL GROUP BY) and `compareRallyDrivers` (single sort comparator used by both the championship standings and the rally results page).

### Infrastructure layer — `src/lib/server/`

Database access, auth, migrations, SSE. These modules may import domain modules but not vice versa.

### Route layer — `src/routes/`

`+server.ts` endpoints: fetch raw rows from DB → call domain functions → return JSON.
`+page.svelte` / `+page.ts`: call API or server load → pass data to domain functions → render.

## Test-driven development

Domain modules have co-located test files (`foo.ts` / `foo.test.ts`). The workflow is:

1. Write failing tests that describe the intended behaviour.
2. Implement until tests pass.
3. Run `npm test` — all 177+ tests must stay green.
4. Run `npm run check` — zero TypeScript errors.

**Tests are not optional.** Any new domain function must have tests before or alongside the implementation. Refactors of existing domain functions must keep all existing tests passing.

## Naming and imports

- Files/routes: kebab-case. Components: PascalCase. Functions/variables: camelCase. Constants: UPPER_SNAKE.
- Import order: Node/Svelte/3rd-party → `$lib/...` → relative. Groups separated by one blank line. No unused imports.
- Explicit return types on all exported functions and API endpoints.

## Other rules

- Zod schemas at every API boundary (`src/lib/server/schemas.ts`). Never trust client input.
- `sql\`...\`` tagged templates only — never string-concatenate SQL.
- All timestamps are `BIGINT` milliseconds.
- Auth via `keycloak.ts` helpers. Use `kcFetch` for authenticated browser requests.
- Migrations in `src/lib/server/migrations/` — numbered sequentially, idempotent (`IF NOT EXISTS` / `ON CONFLICT`).
- Every user-visible string in `src/lib/i18n.ts` — never hardcode text in `.svelte` files.
- Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`) — not Svelte 4 stores.
