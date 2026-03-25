# Rally Timing

Motorsport rally timing system. RFID tags on competing cars are read by UHF gates at the start and finish of each stage; times are recorded and displayed on a live leaderboard.

## Components

### `rally-timer-app/` — Web app
SvelteKit (TypeScript) app serving the timing UI and REST API. Backed by PostgreSQL.

- Driver, class, rally, and stage management
- Live gate event streaming (SSE) using PostgreSQL LISTEN/NOTIFY
- Stage and rally leaderboards with class rankings and time deltas
- Keycloak authentication for admin operations

### `uhf-gate/` — Gate client
Python app running on a Raspberry Pi at each timing gate. Reads RFID EPC tags from a YRM100 UHF reader, deduplicates by RSSI threshold, and POSTs events to the API with offline SQLite queuing for resilience.

## Deployment

The web app runs on a personal Kubernetes cluster (`fph-cluster`) at **https://rally-timer-dev.peteri.se**.

Images are built automatically via GitHub Actions on push to `dev` and deployed by ArgoCD Image Updater — no manual steps needed.

## Architecture

```
[Car with RFID tag]
       |
[YRM100 UHF reader] -- serial --> [uhf-gate Python client]
                                         |
                                    HTTP POST /api/gate-event
                                         |
                              [rally-timer-app SvelteKit]
                                    |          |
                              [PostgreSQL]   [SSE stream]
                              (CloudNativePG)    |
                                             [Browser UI]
```

## Quick start

```bash
# Web app (requires DATABASE_URL)
cd rally-timer-app
npm install
npm run dev

# Gate client
cd uhf-gate
pip install -r requirements.txt
cp .env.example .env
python uhf_gate.py
```
