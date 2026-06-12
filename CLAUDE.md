# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rally timing system for motorsport events. Tracks drivers, stages, and gate events across multiple hardware components.

## Components

- **`rally-timer-app/`** — SvelteKit web app (TypeScript). Central UI, API server, and PostgreSQL database.
- **`uhf-gate/`** — Python. Reads UHF RFID tags via serial (YRM100 reader), queues events locally, syncs to API.

## Commands

### SvelteKit App (`rally-timer-app/`)
```bash
npm install       # Install dependencies
npm run dev       # Start dev server (requires DATABASE_URL env var)
npm run build     # Production build
npm run check     # Type check (svelte-check)
npm run lint      # Prettier + ESLint check
npm run format    # Auto-format (tabs, single quotes, width 100, no trailing commas)
```

Unit tests (vitest): `npm test` — test files live alongside domain modules in `src/lib/domain/`.

### E2E Tests (repo root)
```bash
# Requires the dev server running with SKIP_AUTH=true and a clean database.
npm run dev:noauth          # in rally-timer-app/
./seed.sh                   # seeds drivers, stages, events, championships
./verify.sh                 # asserts API responses; exits non-zero on failure
```
`seed.sh` creates a deterministic dataset (2 championships, 3 drivers, multiple submitted rallies + one live rally).
`verify.sh` checks leaderboard calculations, stage results, championship standings, etc.

### Python UHF Gate (`uhf-gate/`)
```bash
pip install -r requirements.txt
cp .env.example .env  # Configure API URL, serial port, etc.
python uhf_gate.py
```

## Architecture

### Data Flow
1. RFID tags on cars are read by UHF gates (Raspberry Pi + YRM100).
2. Gate events POST to `/api/gate-event` or `/api/gate-sync` (bulk), authenticated with a per-gate Bearer token issued at registration (`request_token: true`); gates registered without a token are accepted unauthenticated for backward compatibility.
3. The SvelteKit app stores all passes in PostgreSQL; stage/rally timing is computed by the domain layer (`src/lib/domain/rallySubmission.ts` → `buildStageTimes`, penalties included) — there are no SQL timing views.
4. Gates send heartbeats to `/api/gate/[id]/heartbeat` to indicate they are online.
5. The UI streams gate events in real time using PostgreSQL `LISTEN`/`NOTIFY` via `src/lib/server/gateEvents.ts`; result pages refresh from the SSE stream (`src/lib/liveRefresh.ts`) with a slow fallback poll.

### Database

- PostgreSQL, managed by CloudNativePG (CNPG) operator on the fph-cluster Kubernetes cluster.
- Connection via `DATABASE_URL` environment variable (postgres.js connection string).
- Migrations run on the first request via `src/hooks.server.ts` → `runMigrations()`; applied migrations are recorded in `schema_migrations` and skipped thereafter, and the runner holds a pg advisory lock so concurrent replicas never run DDL simultaneously.
- Migration files in `src/lib/server/migrations/` — numbered sequentially; add new ones with the next number and register them in the `MIGRATIONS` list in `db.ts`.
- All timestamp columns are `BIGINT` (milliseconds since epoch) — never INTEGER (32-bit overflow).

### SvelteKit App Structure
- **`src/lib/server/db.ts`** — lazy postgres.js singleton (importable without a DB during build); exports `sql` tag and `runMigrations()`. Uses a global to survive HMR reloads.
- **`src/lib/server/gateEvents.ts`** — PostgreSQL LISTEN/NOTIFY bridge; lazily initialises `sql.listen()` on first SSE client connection and retries with backoff if the connection drops.
- **`src/lib/server/keycloak.ts`** — JWT verification via JWKS (issuer + azp checked), role checks (`rally-timer:admin`, realm `admin`). `SKIP_AUTH=true` bypasses auth in dev/e2e only (ignored when `NODE_ENV=production`).
- **`src/lib/server/gateAuth.ts`** — per-gate token issuance and verification for the gate ingestion endpoints.
- **`src/lib/server/schemas.ts`** — Zod schemas for all API inputs. Validate at every API boundary.
- **`src/lib/server/migrations/`** — Sequential migration files (idempotent, `IF NOT EXISTS` / `ON CONFLICT`).
- **`src/lib/kcFetch.ts`** — Authenticated fetch wrapper; use for all internal API calls from the browser.
- **`src/lib/stores/auth.svelte.ts`** — Svelte 5 runes auth state (`auth.isAdmin`, `auth.isAuthenticated`).
- **`src/lib/liveRefresh.ts`** — SSE-driven refresh helper for result pages.
- **`src/routes/api/`** — REST endpoints as `+server.ts` files.
- **`src/hooks.server.ts`** — Kicks off and awaits migrations before handling any request.

### Python UHF Gate Structure
- **`reader.py`** — YRM100 binary protocol driver (length-based framing, checksum-validated).
- **`event_queue.py`** — SQLite queue for offline resilience; the sync thread uploads events when the API is reachable (the tag-reading hot path never does network I/O).
- **`api.py`** — API client; requests a gate token at registration and sends it as a Bearer header.
- **`ntp_sync.py`** — tracks the NTP-vs-system clock offset (applied to all timestamps, re-synced periodically).
- **`config.py`** — Config from `.env` file; gate UUID and API token are auto-generated/persisted (`.gate_uuid`, `.gate_token`).
- **`tests/`** — pytest suite (`python -m pytest tests/`); runs in CI.

### CI/CD Pipeline
- `.github/workflows/build.yml` runs on pull requests and pushes to `main`: type check + lint + unit tests, Python gate tests, and the full e2e suite against PostgreSQL.
- Pushing to `main` (or a `v*` tag) additionally builds and pushes the Docker image.
- GitHub Actions builds `rally-timer-app/Dockerfile` (multi-stage, `node:24-alpine`) and pushes:
  - `ghcr.io/frepet/rally-timer:dev` (mutable latest dev build)
  - `ghcr.io/frepet/rally-timer:dev-<sha>` (immutable per-commit dev build)
- ArgoCD Image Updater on fph-cluster detects the new sha-tagged image and commits the updated tag to `fph-cluster/main`, which ArgoCD then deploys.

## Code Conventions

- **Imports**: Node/Svelte/3rd-party → `$lib/...` → relative. Groups separated by one blank line. No unused imports.
- **TypeScript**: Strict mode. Explicit return types for exported functions and API endpoints. No `any`; use generics or `unknown` + refinement.
- **Naming**: kebab-case files/routes, PascalCase components, camelCase functions/variables, UPPER_SNAKE constants.
- **SQL**: Use `postgres.js` tagged template literals (`sql\`...\``). Never string-concatenate SQL. Use `sql.unsafe()` only for DDL in migrations.
- **Async**: All DB calls are `async`/`await`. API endpoints (`+server.ts`) are `async` functions.
- **Side effects** only in entrypoints (`+server.ts`, hooks); keep modules pure.
- **Zod** schemas at all API boundaries — never trust client input.
- **Error handling**: `throw error(code, message)` from `@sveltejs/kit`; wrap DB/external calls in try/catch; never swallow errors silently.
- **State**: Svelte 5 runes (`$state`, `$derived`, `$derived.by`, `$effect`, `$props`) — not Svelte 4 stores/reactive declarations.
- **Auth**: Use `keycloak.ts` helpers; never embed raw tokens in logs.

## UI

- **Component library**: Flowbite Svelte (`flowbite-svelte` + `flowbite-svelte-icons`). Use Flowbite components (`Card`, `Button`, `Input`, `Select`, `Modal`, `Table`, `Badge`, etc.) for all UI elements.
- **i18n**: Every user-visible string must be defined in `src/lib/i18n.ts` (both `sv` and `en` objects) and referenced via the `t` proxy from `src/lib/stores/locale.svelte`. Never hardcode UI text directly in `.svelte` files. Add new keys under a comment block that groups them by feature (e.g. `// Rallycross - config`). Interpolated strings use functions: `(n: number) => \`Heat ${n}\``.
