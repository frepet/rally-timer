#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="rally-timer-prod"
CLUSTER="rally-timer-prod-db"
REMOTE_DB="rally_timer"
LOCAL_USER="rally"
LOCAL_PASS="rally"
LOCAL_DB="rally"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Finding primary pod in $NAMESPACE..."
POD=$(kubectl get pod -n "$NAMESPACE" \
  -l "cnpg.io/cluster=$CLUSTER,cnpg.io/instanceRole=primary" \
  -o jsonpath='{.items[0].metadata.name}')
echo "Using pod: $POD"

echo "Dumping prod database and restoring to local..."
kubectl exec -n "$NAMESPACE" "$POD" -- \
  pg_dump -U postgres --no-owner --no-acl --clean --if-exists "$REMOTE_DB" \
  | docker compose -f "$SCRIPT_DIR/docker-compose.yml" exec -T postgres \
      psql -U "$LOCAL_USER" -d "$LOCAL_DB" --quiet

echo "Done."
