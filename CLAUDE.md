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

No JS test framework is configured; add `vitest` if needed.

### Python UHF Gate (`uhf-gate/`)
```bash
pip install -r requirements.txt
cp .env.example .env  # Configure API URL, serial port, etc.
python uhf_gate.py
```

## Architecture

### Data Flow
1. RFID tags on cars are read by UHF gates (Raspberry Pi + YRM100).
2. Gate events POST to `/api/gate-event` or `/api/gate-sync` (bulk).
3. The SvelteKit app stores all passes in PostgreSQL; timing reports use `MIN(timestamp)` for first finish.
4. Gates send heartbeats to `/api/gate/[id]/heartbeat` to indicate they are online.
5. The UI streams gate events in real time using PostgreSQL `LISTEN`/`NOTIFY` via `src/lib/server/gateEvents.ts`.

### Database

- PostgreSQL, managed by CloudNativePG (CNPG) operator on the fph-cluster Kubernetes cluster.
- Connection via `DATABASE_URL` environment variable (postgres.js connection string).
- Migrations run automatically on startup via `src/lib/server/db.ts` → `runMigrations()`.
- All requests are held until migrations complete (enforced by `src/hooks.server.ts`).
- Migration files: `src/lib/server/migrations/000_initial_schema.ts`, `001_gates.ts`.
- All timestamp columns are `BIGINT` (milliseconds since epoch) — never INTEGER (32-bit overflow).

### SvelteKit App Structure
- **`src/lib/server/db.ts`** — postgres.js singleton; exports `sql` tag and `runMigrations()`. Uses a global to survive HMR reloads.
- **`src/lib/server/gateEvents.ts`** — PostgreSQL LISTEN/NOTIFY bridge; lazily initialises `sql.listen()` on first SSE client connection (deferred to avoid crash during build).
- **`src/lib/server/keycloak.ts`** — JWT verification via JWKS, role checks (`rally-timer:admin`, realm `admin`).
- **`src/lib/server/schemas.ts`** — Zod schemas for all API inputs. Validate at every API boundary.
- **`src/lib/server/migrations/`** — Sequential migration files (idempotent, `IF NOT EXISTS` / `ON CONFLICT`).
- **`src/lib/kcFetch.ts`** — Authenticated fetch wrapper; use for all internal API calls from the browser.
- **`src/lib/stores/auth.ts`** — Svelte store for auth state.
- **`src/routes/api/`** — REST endpoints as `+server.ts` files.
- **`src/hooks.server.ts`** — Awaits `migrationsReady` before handling any request.

### Python UHF Gate Structure
- **`reader.py`** — YRM100 binary protocol driver.
- **`event_queue.py`** — SQLite queue for offline resilience; events are synced when API is reachable.
- **`api.py`** — API client (sync to central app).
- **`ntp_sync.py`** — NTP time sync for accurate timestamps.
- **`config.py`** — Config from `.env` file; gate UUID is auto-generated and persisted.

### CI/CD Pipeline
- Pushing to the `dev` branch triggers `.github/workflows/build.yml`.
- GitHub Actions builds `rally-timer-app/Dockerfile` (multi-stage, `node:24-alpine`) and pushes:
  - `ghcr.io/frepet/rally-timer:dev` (mutable latest)
  - `ghcr.io/frepet/rally-timer:dev-<sha>` (immutable per-commit)
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
