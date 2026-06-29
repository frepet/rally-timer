#!/usr/bin/env bash
# E2E "glue" tests for the training (free-practice lap timing) feature.
# Run against a dev server started with SKIP_AUTH=true and seeded with seed.sh.
#
# These checks verify the *wiring*, not the lap arithmetic: config CRUD, gate
# assignment auto-starting a session, gate passes flowing through the tag-join
# and the domain into the leaderboard, single-event deletion removing a lap, and
# clearing the session. The lap/median/best/sort math itself is covered
# exhaustively by src/lib/domain/training.test.ts (16 unit tests).
#
# Usage:  ./verify-training.sh [BASE_URL]   (default http://localhost:5173)

set -uo pipefail

BASE="${1:-http://localhost:5173}"
GATE_UUID="7a1c1a90-0000-4000-8000-0000000000aa"
ALICE_TAG="AABBCC001122"   # seed.sh: Alice Andersson

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

get()   { curl -sf "$BASE$1"; }
post()  { curl -sf -X POST  "$BASE$1" -H "content-type: application/json" -d "$2"; }
patch() { curl -sf -X PATCH "$BASE$1" -H "content-type: application/json" -d "$2"; }
del()   { curl -sf -X DELETE "$BASE$1"; }

# ---------------------------------------------------------------------------
echo ""
echo "── Training config: defaults and updates ──────────────────────────────"

# Reset to a clean, gate-less session before we start.
patch /api/training '{"gate_id":null}' > /dev/null

cfg=$(get /api/training)
check "no gate assigned by default"        "null" "$(echo "$cfg" | jq '.gate_id')"
check "started_at null with no gate"       "null" "$(echo "$cfg" | jq '.started_at')"
check "drivers leaderboard empty"          "[]"   "$(echo "$cfg" | jq -c '.drivers')"
check "cooldown_ms is numeric"             "number" "$(echo "$cfg" | jq -r '.cooldown_ms | type')"

patch /api/training '{"cooldown_ms":5000}' > /dev/null
check "PATCH cooldown_ms persisted"        "5000" "$(get /api/training | jq '.cooldown_ms')"

# ---------------------------------------------------------------------------
echo ""
echo "── Gate assignment auto-starts a session ──────────────────────────────"

# Register and accept a dedicated training gate (SKIP_AUTH bypasses signing).
_TMP_KEY=$(mktemp)
openssl genpkey -algorithm ed25519 -out "$_TMP_KEY" 2>/dev/null
GATE_PUBKEY_JSON=$(openssl pkey -in "$_TMP_KEY" -pubout 2>/dev/null | jq -Rs .)
rm -f "$_TMP_KEY"
curl -s -X POST "$BASE/api/gate" -H "content-type: application/json" \
  -d "{\"id\":\"$GATE_UUID\",\"name\":\"training-gate\",\"public_key\":$GATE_PUBKEY_JSON}" > /dev/null
curl -s -X PATCH "$BASE/api/gate/$GATE_UUID" -H "content-type: application/json" \
  -d '{"status":"accepted"}' > /dev/null

patch /api/training "{\"gate_id\":\"$GATE_UUID\"}" > /dev/null
cfg=$(get /api/training)
START=$(echo "$cfg" | jq '.started_at')

check "gate assigned to training"          "$GATE_UUID" "$(echo "$cfg" | jq -r '.gate_id')"
check "gate_name resolved in response"     "training-gate" "$(echo "$cfg" | jq -r '.gate_name')"
check "assigning a gate auto-set started_at" "true" "$( [[ "$START" -gt 0 ]] && echo true || echo false )"

# ---------------------------------------------------------------------------
echo ""
echo "── Gate passes flow into the leaderboard ──────────────────────────────"

# cooldown_ms=5000. Passes (relative to started_at):
#   +10000  first pass — starts the clock, no lap
#   +70000  lap (delta 60000)
#   +71000  within cooldown of the previous pass → must be ignored
#  +140000  lap (delta 70000 from the +70000 pass)
# Expected: lap_count = 2 (the +71000 pass is filtered out).
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((START + 10000)),\"tag\":\"$ALICE_TAG\"}" > /dev/null
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((START + 70000)),\"tag\":\"$ALICE_TAG\"}" > /dev/null
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((START + 71000)),\"tag\":\"$ALICE_TAG\"}" > /dev/null
last_ev=$(post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((START + 140000)),\"tag\":\"$ALICE_TAG\"}")
last_ev_id=$(echo "$last_ev" | jq '.event_id')

cfg=$(get /api/training)
alice=$(echo "$cfg" | jq -c '.drivers[] | select(.driver_name == "Alice Andersson")')

check "Alice appears on the training leaderboard" "Alice Andersson" "$(echo "$alice" | jq -r '.driver_name')"
check "passes joined to driver class (glue)"      "Group A"         "$(echo "$alice" | jq -r '.class_name')"
check "lap_count = 2 (cooldown pass filtered out)" "2"             "$(echo "$alice" | jq '.lap_count')"
check "best_lap_ms is numeric"                     "number"        "$(echo "$alice" | jq -r '.best_lap_ms | type')"

# ---------------------------------------------------------------------------
echo ""
echo "── Deleting a single gate event removes its lap ───────────────────────"

# The last lap is attributed to the pass that ended it; deleting that event
# drops exactly that lap.
del "/api/training/event/$last_ev_id" > /dev/null
alice=$(get /api/training | jq -c '.drivers[] | select(.driver_name == "Alice Andersson")')
check "lap_count drops to 1 after deleting last pass" "1" "$(echo "$alice" | jq '.lap_count')"

missing=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/training/event/$last_ev_id")
check "deleting an unknown event returns 404" "404" "$missing"

# ---------------------------------------------------------------------------
echo ""
echo "── Ending a session ───────────────────────────────────────────────────"

# DELETE "clears" the session by advancing started_at to now; subsequent passes
# start a fresh window. (Whether a given past pass falls inside the new window
# is pure started_at-vs-timestamp arithmetic and is domain-tested; here we
# assert the endpoint contract.)
prev_started=$(get /api/training | jq '.started_at')
clear=$(del /api/training)
check "clear returns cleared:true"          "true" "$(echo "$clear" | jq '.cleared')"
new_started=$(echo "$clear" | jq '.started_at')
check "clear advances the session start"    "true" "$( [[ "$new_started" -ge "$prev_started" ]] && echo true || echo false )"
check "gate stays assigned after clear"     "$GATE_UUID" "$(get /api/training | jq -r '.gate_id')"

# Unassigning the gate ends the session entirely: no gate → no window → the
# leaderboard is empty regardless of stored passes.
patch /api/training '{"gate_id":null}' > /dev/null
cfg=$(get /api/training)
check "unassigning gate clears started_at"  "null" "$(echo "$cfg" | jq '.started_at')"
check "no gate → empty leaderboard"         "[]"   "$(echo "$cfg" | jq -c '.drivers')"

# Cleanup
curl -s -X DELETE "$BASE/api/gate/$GATE_UUID" > /dev/null 2>&1 || true

# ---------------------------------------------------------------------------
echo ""
echo "────────────────────────────────────────────────────────────────────────"
echo "  $pass passed / $((pass + fail)) total"
if [[ $fail -gt 0 ]]; then
  echo "  $fail FAILED"
  exit 1
else
  echo "  All assertions passed."
fi
echo ""
