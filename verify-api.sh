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

# Register a gate (no stage assignment → posting events has no timing side effects)
curl -s -X POST "$BASE/api/gate" -H "content-type: application/json" \
  -d "{\"id\":\"$GATE_UUID\",\"name\":\"api-test\"}" > /dev/null

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
echo "────────────────────────────────────────────────────────────────────────"
echo "  $pass passed / $((pass + fail)) total"
if [[ $fail -gt 0 ]]; then echo "  FAILED"; exit 1; fi
echo "  All assertions passed."
