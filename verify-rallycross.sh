#!/usr/bin/env bash
# E2E "glue" tests for the rallycross heat system.
# Run against a dev server started with SKIP_AUTH=true and seeded with seed.sh.
#
# This suite asserts the wiring, not the scoring math: config CRUD, heat
# lifecycle (create → start → active_heat), gate events driving auto-close,
# timed close with synthetic DNF, manual close, suggest-heat coverage, and
# reset. Exact points (n-pos+1), best_total_ms lap sums, DNF penalty times, and
# leaderboard/suggest ordering are covered exhaustively by
# src/lib/domain/rallycross.test.ts (56 unit tests) and are deliberately NOT
# re-pinned here — that only duplicated the unit suite and broke on legitimate
# domain/TDD changes (e.g. ordering-priority tweaks).
#
# Usage:  ./verify-rallycross.sh [BASE_URL]   (default http://localhost:5173)

set -euo pipefail

BASE="${1:-http://localhost:5173}"
GATE_UUID="0d8abfec-b31c-4601-8d5d-857e19a126a9"

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

# Driver IDs as created by seed.sh on a clean database (Alice=1, Bob=2, Charlie=3, Diana=4)
alice_id=1; bob_id=2; charlie_id=3; diana_id=4
ALICE_TAG="AABBCC001122"
BOB_TAG="DDEEFF334455"
CHARLIE_TAG="112233AABBCC"
DIANA_TAG="FFEE00112233"

# ---------------------------------------------------------------------------
echo ""
echo "── Rallycross Config ──────────────────────────────────────────────────"

# Reset any prior state
del /api/rallycross > /dev/null 2>&1 || true
curl -sf -X DELETE "$BASE/api/gate/$GATE_UUID" > /dev/null 2>&1 || true

cfg=$(get /api/rallycross)

check "GET /api/rallycross has max_per_heat" "4"    "$(echo "$cfg" | jq '.max_per_heat')"
check "GET /api/rallycross has required_laps" "3"   "$(echo "$cfg" | jq '.required_laps')"
check "GET /api/rallycross has heats array"   "[]"  "$(echo "$cfg" | jq -c '.heats')"
check "GET /api/rallycross active_heat is null" "null" "$(echo "$cfg" | jq '.active_heat')"

# Update config
patch /api/rallycross '{"max_per_heat":2,"required_laps":2,"cooldown_ms":5000}' > /dev/null
cfg=$(get /api/rallycross)
check "PATCH max_per_heat = 2"   "2"    "$(echo "$cfg" | jq '.max_per_heat')"
check "PATCH required_laps = 2"  "2"    "$(echo "$cfg" | jq '.required_laps')"
check "PATCH cooldown_ms = 5000" "5000" "$(echo "$cfg" | jq '.cooldown_ms')"

# Register and assign gate (generate a temp Ed25519 key; SKIP_AUTH=true bypasses signing)
_GATE_KEY=$(mktemp)
openssl genpkey -algorithm ed25519 -out "$_GATE_KEY" 2>/dev/null
_GATE_PUBKEY_JSON=$(openssl pkey -in "$_GATE_KEY" -pubout 2>/dev/null | jq -Rs .)
rm -f "$_GATE_KEY"
post "/api/gate/$GATE_UUID" "{\"id\":\"$GATE_UUID\",\"name\":\"Test Gate\",\"public_key\":$_GATE_PUBKEY_JSON}" > /dev/null
curl -sf -X PATCH "$BASE/api/gate/$GATE_UUID" -H "content-type: application/json" -d '{"status":"accepted"}' > /dev/null
patch /api/rallycross "{\"gate_id\":\"$GATE_UUID\"}" > /dev/null
cfg=$(get /api/rallycross)
check "gate assigned to rallycross" "$GATE_UUID" "$(echo "$cfg" | jq -r '.gate_id')"

# ---------------------------------------------------------------------------
echo ""
echo "── Heat 1: Create, Start, Auto-close ─────────────────────────────────"

# Create heat with Alice and Bob
heat1=$(post /api/rallycross/heat "{\"driver_ids\":[$alice_id,$bob_id]}")
h1_id=$(echo "$heat1" | jq '.id')
h1_num=$(echo "$heat1" | jq '.number')

check "heat 1 created with id"         "true"  "$( [[ -n "$h1_id" ]] && echo true || echo false )"
check "heat 1 has number 1"            "1"     "$h1_num"
check "heat 1 started_at is null"      "null"  "$(echo "$heat1" | jq '.started_at')"
check "heat 1 has 2 entries"           "2"     "$(echo "$heat1" | jq '.entries | length')"

# Heat is created but not yet started — active_heat should still be null
cfg=$(get /api/rallycross)
check "active_heat null before start"  "null" "$(echo "$cfg" | jq '.active_heat')"

# Start the heat
h1_started=$(post "/api/rallycross/heat/$h1_id/start" '{}')
h1_ts=$(echo "$h1_started" | jq '.started_at')
check "heat started_at is a number"    "true"  "$( [[ "$h1_ts" -gt 0 ]] && echo true || echo false )"

# Active heat should now be started
cfg=$(get /api/rallycross)
check "active_heat.started_at set"    "$h1_ts" "$(echo "$cfg" | jq '.active_heat.started_at')"

# Send gate events:
#   Alice: lap1 then lap2 → finishes required_laps=2
#   Bob:   lap1 then lap2 → finishes required_laps=2
# Alice finishes first; heat must auto-close only once Bob also finishes.
H1_BASE=$h1_ts

post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((H1_BASE + 60000)),\"tag\":\"$ALICE_TAG\"}" > /dev/null
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((H1_BASE + 65000)),\"tag\":\"$BOB_TAG\"}"   > /dev/null
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((H1_BASE + 120000)),\"tag\":\"$ALICE_TAG\"}" > /dev/null

# After Alice finishes, Bob still has only 1 lap — heat must not auto-close yet
cfg=$(get /api/rallycross)
check "heat not auto-closed yet (Bob 1 lap)" "$h1_id" "$(echo "$cfg" | jq '.active_heat.id')"

# Bob's 2nd lap — now all drivers have finished, heat auto-closes
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((H1_BASE + 135000)),\"tag\":\"$BOB_TAG\"}" > /dev/null

cfg=$(get /api/rallycross)
check "heat auto-closed after all finish" "null" "$(echo "$cfg" | jq '.active_heat')"

# Leaderboard is populated from the timed heat (exact times/points are
# domain-tested; here we confirm both drivers land on it with numeric times).
board=$(get /api/rallycross/leaderboard)
check "leaderboard includes Alice with numeric best_total_ms" "number" \
  "$(echo "$board" | jq -r '.[] | select(.driver_name == "Alice Andersson") | .best_total_ms | type')"
check "leaderboard includes Bob with numeric best_total_ms" "number" \
  "$(echo "$board" | jq -r '.[] | select(.driver_name == "Bob Bergström") | .best_total_ms | type')"
check "Alice best time came from heat 1" "1" \
  "$(echo "$board" | jq -r '.[] | select(.driver_name == "Alice Andersson") | .best_heat_number')"

# ---------------------------------------------------------------------------
echo ""
echo "── Heat 2: Timed close with DNF ──────────────────────────────────────"

# Create heat with Charlie and Diana
heat2=$(post /api/rallycross/heat "{\"driver_ids\":[$charlie_id,$diana_id]}")
h2_id=$(echo "$heat2" | jq '.id')
check "heat 2 has number 2" "2" "$(echo "$heat2" | jq '.number')"

h2_started=$(post "/api/rallycross/heat/$h2_id/start" '{}')
H2_BASE=$(echo "$h2_started" | jq '.started_at')

# Charlie completes 2 laps, Diana only 1 (won't auto-close → admin closes).
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((H2_BASE + 60000)),\"tag\":\"$CHARLIE_TAG\"}" > /dev/null
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((H2_BASE + 70000)),\"tag\":\"$DIANA_TAG\"}"   > /dev/null
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((H2_BASE + 130000)),\"tag\":\"$CHARLIE_TAG\"}" > /dev/null

# Admin closes heat — Diana (1 lap) gets a synthetic DNF.
close_result=$(post "/api/rallycross/heat/$h2_id/close" '{}')
check "close returns closed_at" "true" "$( [[ "$(echo "$close_result" | jq '.closed_at')" -gt 0 ]] && echo true || echo false )"

cfg=$(get /api/rallycross)
check "no active heat after close" "null" "$(echo "$cfg" | jq '.active_heat')"

# DNF detection on close is wired: Diana DNF with a numeric penalty time,
# Charlie finished. The exact penalty ms is domain-tested (computeDnfTime).
h2_detail=$(get "/api/rallycross/heat/$h2_id")
diana=$(echo "$h2_detail"   | jq -c '.entries[] | select(.driver_name == "Diana Dahl")')
charlie=$(echo "$h2_detail" | jq -c '.entries[] | select(.driver_name == "Charlie Svensson")')

check "Diana is DNF"                    "true"   "$(echo "$diana" | jq '.dnf')"
check "Diana has a numeric dnf_time_ms" "number" "$(echo "$diana" | jq -r '.dnf_time_ms | type')"
check "Charlie is not DNF"              "false"  "$(echo "$charlie" | jq '.dnf')"

# A DNF'd driver has no best_total_ms on the overall board.
board=$(get /api/rallycross/leaderboard)
check "Diana best_total_ms = null (DNF)" "null" \
  "$(echo "$board" | jq -r '.[] | select(.driver_name == "Diana Dahl") | .best_total_ms')"

# ---------------------------------------------------------------------------
echo ""
echo "── Suggest Next Heat Groups ───────────────────────────────────────────"

# Grouping/ordering priority (class → heat_count → best_total_ms) is unit-tested
# in suggestNextHeatGroups; here we only confirm the endpoint groups every
# driver and respects max_per_heat=2.
suggest=$(get /api/rallycross/suggest-heat)
check "suggest-heat covers all 4 drivers" "4" \
  "$(echo "$suggest" | jq '[.groups[][]] | length')"
check "every suggested group respects max_per_heat=2" "true" \
  "$(echo "$suggest" | jq 'all(.groups[]; length <= 2)')"

# ---------------------------------------------------------------------------
echo ""
echo "── Heat 3: Manual finish order (close-manual) ─────────────────────────"

# Create heat with Alice and Charlie — do NOT start it (no RFID timing)
heat3=$(post /api/rallycross/heat "{\"driver_ids\":[$alice_id,$charlie_id]}")
h3_id=$(echo "$heat3" | jq '.id')
check "heat 3 created"     "3"    "$(echo "$heat3" | jq '.number')"
check "heat 3 not started" "null" "$(echo "$heat3" | jq '.started_at')"

# Heat is pending but not started — no active_heat
cfg=$(get /api/rallycross)
check "no active_heat for pending heat" "null" "$(echo "$cfg" | jq '.active_heat')"

# Judge enters finish order: Charlie 1st, Alice 2nd
manual_result=$(post "/api/rallycross/heat/$h3_id/close-manual" "{\"finish_order\":[$charlie_id,$alice_id]}")
check "close-manual returns closed_at" "true" "$( [[ "$(echo "$manual_result" | jq '.closed_at')" -gt 0 ]] && echo true || echo false )"

# Heat was never started — started_at must still be null
h3_detail=$(get "/api/rallycross/heat/$h3_id")
check "heat 3 started_at still null" "null" "$(echo "$h3_detail" | jq '.started_at')"
check "heat 3 is now closed"         "true" "$( [[ "$(echo "$h3_detail" | jq '.closed_at')" -gt 0 ]] && echo true || echo false )"

# manual_position is persisted from the submitted order; no DNFs.
charlie_pos=$(echo "$h3_detail" | jq -r '.entries[] | select(.driver_name == "Charlie Svensson") | .manual_position')
alice_pos=$(echo "$h3_detail"   | jq -r '.entries[] | select(.driver_name == "Alice Andersson")  | .manual_position')

check "Charlie manual_position = 1" "1"     "$charlie_pos"
check "Alice manual_position = 2"   "2"     "$alice_pos"
check "Charlie not DNF" "false" "$(echo "$h3_detail" | jq -r '.entries[] | select(.driver_name == "Charlie Svensson") | .dnf')"
check "Alice not DNF"   "false" "$(echo "$h3_detail" | jq -r '.entries[] | select(.driver_name == "Alice Andersson")  | .dnf')"

# All three heats are aggregated into the overall leaderboard (exact points and
# ordering are domain-tested; we confirm every driver is accounted for).
board=$(get /api/rallycross/leaderboard)
check "overall leaderboard includes all 4 drivers" "4" "$(echo "$board" | jq 'length')"

# ---------------------------------------------------------------------------
echo ""
echo "── Reset ─────────────────────────────────────────────────────────────"

del /api/rallycross > /dev/null
cfg=$(get /api/rallycross)
check "after DELETE heats is empty"      "[]"   "$(echo "$cfg" | jq -c '.heats')"
check "after DELETE active_heat is null" "null" "$(echo "$cfg" | jq '.active_heat')"

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
