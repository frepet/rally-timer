# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rally timing system for motorsport events. Tracks drivers, stages, and gate events across multiple hardware components.

## Components

- **`rally-timer-app/`** — SvelteKit web app (TypeScript). Central UI, API server, and SQLite database.
- **`uhf-gate/`** — Python. Reads UHF RFID tags via serial (YRM100 reader), queues events locally, syncs to API.

## Commands

### SvelteKit App (`rally-timer-app/`)
```bash
npm install       # Install dependencies
npm run dev       # Start dev server
npm run build     # Production build
npm run check     # Type check (svelte-check)
npm run lint      # Prettier + ESLint check
npm run format    # Auto-format (tabs, single quotes, width 100, no trailing commas)
```

No JS test framework is configured; add `vitest` if needed. Single test: `npx vitest run path/to/file.test.ts -t "case"`.

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
3. The SvelteKit app stores all passes in SQLite; timing reports use `MIN(timestamp)` for first finish.
4. Gates send heartbeats to `/api/gate/[id]/heartbeat` to indicate they are online.
5. The UI streams gate events in real time using an event emitter (`src/lib/server/gateEvents.ts`).

### SvelteKit App Structure
- **`src/lib/server/db.ts`** — SQLite singleton (WAL mode), runs migrations on import. All DB access goes through here.
- **`src/lib/server/keycloak.ts`** — JWT verification via JWKS, role checks (`rally-timer:admin`, realm `admin`).
- **`src/lib/server/schemas.ts`** — Zod schemas for all API inputs. Validate at every API boundary.
- **`src/lib/server/migrations/`** — Sequential migration files.
- **`src/lib/kcFetch.ts`** — Authenticated fetch wrapper; use for all internal API calls from the browser.
- **`src/lib/stores/auth.ts`** — Svelte store for auth state.
- **`src/routes/api/`** — REST endpoints as `+server.ts` files.

### Python UHF Gate Structure
- **`reader.py`** — YRM100 binary protocol driver.
- **`event_queue.py`** — SQLite queue for offline resilience; events are synced when API is reachable.
- **`api.py`** — API client (sync to central app).
- **`ntp_sync.py`** — NTP time sync for accurate timestamps.
- **`config.py`** — Config from `.env` file; gate UUID is auto-generated and persisted.

## Code Conventions

- **Imports**: Node/Svelte/3rd-party → `$lib/...` → relative. Groups separated by one blank line. No unused imports.
- **TypeScript**: Strict mode. Explicit return types for exported functions and API endpoints. No `any`; use generics or `unknown` + refinement.
- **Naming**: kebab-case files/routes, PascalCase components, camelCase functions/variables, UPPER_SNAKE constants.
- **Side effects** only in entrypoints (`+server.ts`, hooks); keep modules pure.
- **Zod** schemas at all API boundaries — never trust client input.
- **Error handling**: `throw error(code, message)` from `@sveltejs/kit`; wrap DB/external calls in try/catch; never swallow errors silently.
- **State**: Svelte 5 runes (`$state`, `$derived`, `$derived.by`, `$effect`, `$props`) — not Svelte 4 stores/reactive declarations.
- **Auth**: Use `keycloak.ts` helpers; never embed raw tokens in logs.

## UI

- **Component library**: Flowbite Svelte (`flowbite-svelte` + `flowbite-svelte-icons`). Use Flowbite components (`Card`, `Button`, `Input`, `Select`, `Modal`, `Table`, `Badge`, etc.) for all UI elements.
