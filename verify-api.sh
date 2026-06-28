#!/usr/bin/env bash
# E2E tests for API contract: response shapes, status codes, error handling.
# Run against a dev server started with SKIP_AUTH=true and seeded with seed.sh.
#
# Usage:  ./verify-api.sh [BASE_URL]

set -uo pipefail

BASE="${1:-http://localhost:5173}"
GATE_UUID="c0ffee00-1234-4abc-8def-0123456789ab"

pass=0
fail=0

check() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ $desc"
    ((pass++)) || true
  else
    echo "  ✗ $desc"
    echo "      expected : $expected"
    echo "      actual   : $actual"
    ((fail++)) || true
  fi
}

# Raw helpers (do NOT use -f: we assert on 4xx/5xx bodies and codes).
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
body()   { curl -s "$@"; }

echo ""
echo "── Gate event response shape ──────────────────────────────────────────"

# Register a gate with a public key, then accept it (SKIP_AUTH bypasses signing on event endpoints).
_TMP_KEY=$(mktemp)
openssl genpkey -algorithm ed25519 -out "$_TMP_KEY" 2>/dev/null
GATE_PUBKEY_JSON=$(openssl pkey -in "$_TMP_KEY" -pubout 2>/dev/null | jq -Rs .)
rm -f "$_TMP_KEY"
curl -s -X POST "$BASE/api/gate" -H "content-type: application/json" \
  -d "{\"id\":\"$GATE_UUID\",\"name\":\"api-test\",\"public_key\":$GATE_PUBKEY_JSON}" > /dev/null
curl -s -X PATCH "$BASE/api/gate/$GATE_UUID" -H "content-type: application/json" \
  -d '{"status":"accepted"}' > /dev/null

ev=$(body -X POST "$BASE/api/gate-event" -H "content-type: application/json" \
  -d "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":1700000000000,\"tag\":\"APITESTTAG\"}")
check "gate-event event_id is a number, not an object" \
  "number" "$(echo "$ev" | jq -r '.event_id | type')"

echo ""
echo "── Error handling: malformed inputs return clean 4xx, no DB internals ──"

code=$(status "$BASE/api/championship/not-a-uuid/standings")
check "bad UUID path param → 400 (not 500)" "400" "$code"

leak=$(body "$BASE/api/championship/not-a-uuid/standings" | grep -ic "invalid input syntax\|postgres\|syntax error" || true)
check "error body does not leak Postgres internals" "0" "$leak"

echo ""
echo "── Concurrent stage close does not duplicate synthetic DNF finishes ───"

# Fresh stage with two started, never-finished drivers (both DNF on close).
sid=$(body -X POST "$BASE/api/stage" -H "content-type: application/json" \
  -d '{"name":"Concurrency SS"}' | jq -r '.id')
body -X POST "$BASE/api/start" -H "content-type: application/json" \
  -d "{\"stage_id\":$sid,\"driver_id\":1}" > /dev/null
body -X POST "$BASE/api/start" -H "content-type: application/json" \
  -d "{\"stage_id\":$sid,\"driver_id\":2}" > /dev/null
# Fire several closes at once; only one synthetic DNF per driver may result.
for _ in 1 2 3 4 5; do
  curl -s -X POST "$BASE/api/stage/$sid/close" -H "content-type: application/json" >/dev/null &
done
wait
dup=$(body "$BASE/api/stage/$sid/events" \
  | jq '[.[] | select(.kind=="finish")] | group_by(.tag) | map(length) | max // 0')
check "no driver has more than one DNF finish row" "1" "$dup"

echo ""
echo "── Gate sync: idempotent, no error leak, unknown gates skipped ────────"

batch="{\"events\":[
  {\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":1700000100000,\"tag\":\"SYNCTAG1\"},
  {\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":1700000200000,\"tag\":\"SYNCTAG2\"}
]}"
r1=$(body -X POST "$BASE/api/gate-sync" -H "content-type: application/json" -d "$batch")
check "first sync stores both events"     "2" "$(echo "$r1" | jq '.stored')"
check "first sync reports no failures"    "0" "$(echo "$r1" | jq '.failed')"
r2=$(body -X POST "$BASE/api/gate-sync" -H "content-type: application/json" -d "$batch")
check "re-sync is idempotent (stored 0)"  "0" "$(echo "$r2" | jq '.stored')"

unknown="{\"events\":[{\"gate_id\":\"00000000-0000-4000-8000-000000000000\",\"timestamp_ms\":1,\"tag\":\"X\"}]}"
ru=$(body -X POST "$BASE/api/gate-sync" -H "content-type: application/json" -d "$unknown")
check "unknown gate is skipped, not failed" "1" "$(echo "$ru" | jq '.skipped')"
ucode=$(status -X POST "$BASE/api/gate-sync" -H "content-type: application/json" -d "$unknown")
check "unknown-gate batch still 200"        "200" "$ucode"

oversize=$(status -X POST "$BASE/api/gate-sync" -H "content-type: application/json" \
  -d "{\"events\":[$(python3 -c 'print(",".join(["{\"gate_id\":\"00000000-0000-4000-8000-000000000000\",\"timestamp_ms\":1,\"tag\":\"X\"}"]*1500))')]}")
check "oversized batch rejected (400)"      "400" "$oversize"

echo ""
echo "── Gate enrollment: PKI registration and admin accept ─────────────────"

PKI_UUID="d1a1a100-0000-4000-8000-000000000099"

# Generate a temporary Ed25519 key pair for tests
_TMP_KEY2=$(mktemp)
openssl genpkey -algorithm ed25519 -out "$_TMP_KEY2" 2>/dev/null
PKI_PUBKEY_JSON=$(openssl pkey -in "$_TMP_KEY2" -pubout 2>/dev/null | jq -Rs .)
rm -f "$_TMP_KEY2"

# Register gate with public_key → should be 'pending', status 201.
# Capture body and HTTP status in one request to avoid double-registration.
reg_raw=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/gate" -H "content-type: application/json" \
  -d "{\"id\":\"$PKI_UUID\",\"name\":\"pki-test\",\"public_key\":$PKI_PUBKEY_JSON}")
reg=$(echo "$reg_raw" | head -n -1)
reg_code=$(echo "$reg_raw" | tail -1)
check "PKI gate registration returns status=pending" "pending" "$(echo "$reg" | jq -r '.status')"
check "PKI gate registration status code 201" "201" "$reg_code"

# Gate list includes the PKI gate with status=pending
gate_status=$(body "$BASE/api/gate" | jq -r --arg id "$PKI_UUID" '.[] | select(.id == $id) | .status')
check "PKI gate appears in list with status=pending" "pending" "$gate_status"

# Admin accepts the gate (SKIP_AUTH bypasses Keycloak for admin endpoints)
accept=$(body -X PATCH "$BASE/api/gate/$PKI_UUID" -H "content-type: application/json" \
  -d '{"status":"accepted"}')
check "Admin accepts gate" "true" "$(echo "$accept" | jq -r '.updated')"

# Gate list shows accepted
gate_status_after=$(body "$BASE/api/gate" | jq -r --arg id "$PKI_UUID" '.[] | select(.id == $id) | .status')
check "PKI gate now shows status=accepted in list" "accepted" "$gate_status_after"

echo ""
echo "────────────────────────────────────────────────────────────────────────"
echo "  $pass passed / $((pass + fail)) total"
if [[ $fail -gt 0 ]]; then echo "  FAILED"; exit 1; fi
echo "  All assertions passed."
