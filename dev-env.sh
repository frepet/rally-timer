#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() {
  echo ""
  echo "Stopping docker compose..."
  docker compose -f "$SCRIPT_DIR/docker-compose.yml" down
}
trap cleanup EXIT

docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d

cd "$SCRIPT_DIR/rally-timer-app"
npm run dev:noauth -- --host 0.0.0.0
