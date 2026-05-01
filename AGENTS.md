# AGENTS.md — rally-timing

## Repo layout

```
rally-timing/
  rally-timer-app/   SvelteKit app (TypeScript + PostgreSQL)
  uhf-gate/          Python RFID gate client
  .github/workflows/ GitHub Actions CI (builds Docker image on push to dev)
```

## Key rules

- **Never edit `.argocd-source-rally-timer-dev.yaml`** — that file is auto-committed by ArgoCD Image Updater. Editing it manually will be overwritten.
- All database changes go through migration files in `src/lib/server/migrations/`. Migrations must be idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
- Timestamps are always `BIGINT` milliseconds — never `INTEGER` (32-bit overflow at ~2.1B ms ≈ year 2038).
- SQL uses `postgres.js` tagged templates. Never string-concatenate SQL.

## Deploying app changes

1. Push commits to the `main` branch — GitHub Actions builds and pushes a new image to `ghcr.io/frepet/rally-timer:main-<sha>`.
2. ArgoCD Image Updater (running on fph-cluster) detects the new tag within ~2 minutes and commits the updated image tag to fph-cluster/main.
3. ArgoCD syncs fph-cluster/main and rolls out the new pods.

No manual `kubectl` steps needed for normal app changes.

## Local development

Set `DATABASE_URL` to a PostgreSQL connection string before running `npm run dev`:

```bash
export DATABASE_URL="postgres://user:pass@host:5432/rally_timer"
cd rally-timer-app
npm run dev
```

To use the cluster dev database, port-forward the CNPG primary:
```bash
kubectl port-forward -n rally-timer-dev svc/rally-timer-dev-rw 5432:5432
```
Then use the connection string from the `rally-timer-dev-app` secret.

## Commands

```bash
# App
cd rally-timer-app
npm install
npm run dev
npm run build
npm run check
npm run lint

# Gate client
cd uhf-gate
pip install -r requirements.txt
python uhf_gate.py
```
