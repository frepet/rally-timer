#!/usr/bin/env bash
# E2E tests for training mode.
# Run against a dev server started with SKIP_AUTH=true and seeded with seed.sh.
#
# Lap intervals are intentionally millisecond-scale so wall-clock time
# naturally outpaces the synthetic event timeline during the test run —
# this lets us exercise the "clear bumps started_at" behaviour without
# sleeping for minutes.
#
# Usage:  ./verify-training.sh [BASE_URL]

set -euo pipefail

BASE="${1:-http://localhost:5173}"
GATE_UUID="b7c9e1d4-0815-4a2c-8e3f-742b91d56fa1"

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

# Driver IDs as created by seed.sh on a clean database
alice_id=1; bob_id=2; charlie_id=3
ALICE_TAG="AABBCC001122"
BOB_TAG="DDEEFF334455"
CHARLIE_TAG="112233AABBCC"

# ---------------------------------------------------------------------------
echo ""
echo "── Training Config ────────────────────────────────────────────────────"

# Reset any prior state — unassign training gate then delete the gate row
patch /api/training '{"gate_id":null}' > /dev/null 2>&1 || true
curl -sf -X DELETE "$BASE/api/gate/$GATE_UUID" > /dev/null 2>&1 || true

cfg=$(get /api/training)
check "no gate assigned initially"             "null"  "$(echo "$cfg" | jq '.gate_id')"
check "no started_at initially"                "null"  "$(echo "$cfg" | jq '.started_at')"
check "drivers empty initially"                "[]"    "$(echo "$cfg" | jq -c '.drivers')"

# Register a fresh gate
post "/api/gate/$GATE_UUID" "{\"id\":\"$GATE_UUID\",\"name\":\"Training Loop\"}" > /dev/null

# Assign it to training. Use a small cooldown (100ms) — events in this test
# use millisecond-scale intervals (see header note).
patch /api/training "{\"gate_id\":\"$GATE_UUID\",\"cooldown_ms\":100}" > /dev/null

cfg=$(get /api/training)
check "gate assigned to training"            "$GATE_UUID"     "$(echo "$cfg" | jq -r '.gate_id')"
check "gate_name resolved"                   "Training Loop"  "$(echo "$cfg" | jq -r '.gate_name')"
check "cooldown_ms updated to 100"           "100"            "$(echo "$cfg" | jq '.cooldown_ms')"
check "started_at is non-null after assign"  "true"           "$( [[ "$(echo "$cfg" | jq '.started_at')" -gt 0 ]] && echo true || echo false )"

# Capture started_at so we can post events relative to it
T0=$(echo "$cfg" | jq '.started_at')

# ---------------------------------------------------------------------------
echo ""
echo "── Lap capture ────────────────────────────────────────────────────────"

# Alice: 4 passes -> 3 laps of 600ms, 750ms, 600ms  (best=600, median=600, last=600)
# Bob:   3 passes -> 2 laps of 900ms, 800ms         (best=800, median=850, last=800)
# Charlie: 1 pass -> 0 laps (only started the clock)
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((T0 + 50)),\"tag\":\"$ALICE_TAG\"}"   > /dev/null
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((T0 + 650)),\"tag\":\"$ALICE_TAG\"}"  > /dev/null
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((T0 + 1400)),\"tag\":\"$ALICE_TAG\"}" > /dev/null
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((T0 + 2000)),\"tag\":\"$ALICE_TAG\"}" > /dev/null

post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((T0 + 100)),\"tag\":\"$BOB_TAG\"}"  > /dev/null
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((T0 + 1000)),\"tag\":\"$BOB_TAG\"}" > /dev/null
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((T0 + 1800)),\"tag\":\"$BOB_TAG\"}" > /dev/null

post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((T0 + 200)),\"tag\":\"$CHARLIE_TAG\"}" > /dev/null

board=$(get /api/training)

alice_laps=$(echo "$board" | jq -r '.drivers[] | select(.driver_id == '"$alice_id"') | .lap_count')
alice_best=$(echo "$board" | jq -r '.drivers[] | select(.driver_id == '"$alice_id"') | .best_lap_ms')
alice_med=$(echo "$board"  | jq -r '.drivers[] | select(.driver_id == '"$alice_id"') | .median_lap_ms')
alice_last=$(echo "$board" | jq -r '.drivers[] | select(.driver_id == '"$alice_id"') | .last_lap_ms')
alice_lap_times=$(echo "$board" | jq -c '.drivers[] | select(.driver_id == '"$alice_id"') | [.laps[].lap_ms]')

check "Alice lap count = 3"            "3"             "$alice_laps"
check "Alice best lap = 600"           "600"           "$alice_best"
check "Alice median lap = 600"         "600"           "$alice_med"
check "Alice last lap = 600"           "600"           "$alice_last"
check "Alice laps = [600,750,600]"     "[600,750,600]" "$alice_lap_times"

bob_laps=$(echo "$board" | jq -r '.drivers[] | select(.driver_id == '"$bob_id"') | .lap_count')
bob_best=$(echo "$board" | jq -r '.drivers[] | select(.driver_id == '"$bob_id"') | .best_lap_ms')
bob_med=$(echo "$board"  | jq -r '.drivers[] | select(.driver_id == '"$bob_id"') | .median_lap_ms')
bob_last=$(echo "$board" | jq -r '.drivers[] | select(.driver_id == '"$bob_id"') | .last_lap_ms')

check "Bob lap count = 2"      "2"   "$bob_laps"
check "Bob best lap = 800"     "800" "$bob_best"
check "Bob median lap = 850"   "850" "$bob_med"
check "Bob last lap = 800"     "800" "$bob_last"

charlie_laps=$(echo "$board" | jq -r '.drivers[] | select(.driver_id == '"$charlie_id"') | .lap_count')
charlie_best=$(echo "$board" | jq -r '.drivers[] | select(.driver_id == '"$charlie_id"') | .best_lap_ms')
check "Charlie lap count = 0"            "0"    "$charlie_laps"
check "Charlie best lap is null"         "null" "$charlie_best"

# Leaderboard ranks by best_lap_ms — Alice (600) ahead of Bob (800), Charlie last
check "1st on leaderboard is Alice"   "$alice_id"   "$(echo "$board" | jq '.drivers[0].driver_id')"
check "2nd on leaderboard is Bob"     "$bob_id"     "$(echo "$board" | jq '.drivers[1].driver_id')"
check "3rd on leaderboard is Charlie" "$charlie_id" "$(echo "$board" | jq '.drivers[2].driver_id')"

# ---------------------------------------------------------------------------
echo ""
echo "── Cooldown filtering ─────────────────────────────────────────────────"

# Post a duplicate-blip pass for Alice 50ms after her last (within 100ms cooldown).
# Should be ignored — lap count stays at 3.
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((T0 + 2050)),\"tag\":\"$ALICE_TAG\"}" > /dev/null

board=$(get /api/training)
alice_laps=$(echo "$board" | jq -r '.drivers[] | select(.driver_id == '"$alice_id"') | .lap_count')
check "blip within cooldown is ignored" "3" "$alice_laps"

# ---------------------------------------------------------------------------
echo ""
echo "── Delete single lap ──────────────────────────────────────────────────"

# Grab the gate_event_id of Alice's middle lap (750ms one — ends at T0+1400)
mid_event=$(echo "$board" | jq '.drivers[] | select(.driver_id == '"$alice_id"') | .laps[1].gate_event_id')
del "/api/training/event/$mid_event" > /dev/null

board=$(get /api/training)
alice_laps=$(echo "$board" | jq -r '.drivers[] | select(.driver_id == '"$alice_id"') | .lap_count')
alice_lap_times=$(echo "$board" | jq -c '.drivers[] | select(.driver_id == '"$alice_id"') | [.laps[].lap_ms]')

# After deleting the pass that ended lap 2, the remaining (cooldown-filtered)
# passes are T0+50, T0+650, T0+2000. Laps: 600, 1350.
check "after delete Alice has 2 laps"      "2"            "$alice_laps"
check "after delete laps = [600,1350]"     "[600,1350]"   "$alice_lap_times"

# Deleting a non-existent event returns 404
status=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/training/event/99999999")
check "delete missing event = 404" "404" "$status"

# ---------------------------------------------------------------------------
echo ""
echo "── Clear session (bump started_at) ────────────────────────────────────"

before_clear_started=$(get /api/training | jq '.started_at')
# Sleep so wall clock advances well past the synthetic event range (T0..T0+2050).
sleep 3
del /api/training > /dev/null

after=$(get /api/training)
after_started=$(echo "$after" | jq '.started_at')
check "clear empties drivers"           "[]"          "$(echo "$after" | jq -c '.drivers')"
check "clear preserves gate assignment" "$GATE_UUID"  "$(echo "$after" | jq -r '.gate_id')"
check "clear bumps started_at forward"  "true"        "$( [[ "$after_started" -gt "$before_clear_started" ]] && echo true || echo false )"

# Two fresh passes for Alice after the bumped started_at — one lap.
NEW_T=$((after_started + 10))
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((NEW_T)),\"tag\":\"$ALICE_TAG\"}"       > /dev/null
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((NEW_T + 600)),\"tag\":\"$ALICE_TAG\"}" > /dev/null
board=$(get /api/training)
alice_laps=$(echo "$board" | jq -r '.drivers[] | select(.driver_id == '"$alice_id"') | .lap_count')
alice_best=$(echo "$board" | jq -r '.drivers[] | select(.driver_id == '"$alice_id"') | .best_lap_ms')
check "new passes after clear produce a fresh lap" "1"   "$alice_laps"
check "new lap time = 600ms"                       "600" "$alice_best"

# ---------------------------------------------------------------------------
echo ""
echo "── Unassign gate ──────────────────────────────────────────────────────"

patch /api/training '{"gate_id":null}' > /dev/null
cfg=$(get /api/training)
check "after unassign gate_id is null"     "null" "$(echo "$cfg" | jq '.gate_id')"
check "after unassign started_at is null"  "null" "$(echo "$cfg" | jq '.started_at')"
check "after unassign drivers empty"       "[]"   "$(echo "$cfg" | jq -c '.drivers')"

# Clean up the test gate
curl -sf -X DELETE "$BASE/api/gate/$GATE_UUID" > /dev/null 2>&1 || true

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
