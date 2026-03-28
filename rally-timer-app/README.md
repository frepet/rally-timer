# rally-timer-app

SvelteKit web app for the rally timing system. Provides the timing UI, REST API, and live leaderboard.

## Requirements

- Node.js 24+
- PostgreSQL (or access to the cluster dev database via port-forward)

## Local development

```bash
npm install

# Set database connection (see below)
export DATABASE_URL="postgres://user:pass@localhost:5432/rally_timer"

npm run dev
```

To connect to the cluster dev database:

```bash
kubectl port-forward -n rally-timer-dev svc/rally-timer-dev-rw 5432:5432
# Connection string is in secret rally-timer-dev-app, key: uri
```

## Commands

```bash
npm run dev       # Dev server with HMR
npm run build     # Production build (outputs to build/)
npm run preview   # Preview production build locally
npm run check     # Svelte type-check
npm run lint      # Prettier + ESLint
npm run format    # Auto-format
```

## Environment variables

| Variable       | Required | Description                       |
| -------------- | -------- | --------------------------------- |
| `DATABASE_URL` | Yes      | PostgreSQL connection string      |
| `NODE_ENV`     | No       | Set to `production` in production |

## Production

Docker image is built from `Dockerfile` (multi-stage, `node:24-alpine`). GitHub Actions builds and pushes to `ghcr.io/frepet/rally-timer` on every push to the `dev` branch. Deployed to fph-cluster by ArgoCD Image Updater.

## Key source files

| Path                           | Purpose                                        |
| ------------------------------ | ---------------------------------------------- |
| `src/lib/server/db.ts`         | postgres.js singleton + migration runner       |
| `src/lib/server/gateEvents.ts` | PostgreSQL LISTEN/NOTIFY for cross-replica SSE |
| `src/lib/server/migrations/`   | Idempotent DB migration files                  |
| `src/lib/server/schemas.ts`    | Zod validation schemas for all API inputs      |
| `src/lib/server/keycloak.ts`   | JWT/JWKS auth helper                           |
| `src/hooks.server.ts`          | Awaits migrations before handling requests     |
| `src/routes/api/`              | REST API endpoints                             |
