#!/usr/bin/env bash
# E2E tests for the rallycross heat system.
# Run against a dev server started with SKIP_AUTH=true and seeded with seed.sh.
#
# Usage:  ./verify-rallycross.sh [BASE_URL]

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
#   Alice: lap1=60000ms, lap2=60000ms → total=120000ms (finishes required_laps=2)
#   Bob:   lap1=65000ms, lap2=70000ms → total=135000ms (finishes required_laps=2)
# Alice finishes first; heat auto-closes only once Bob also finishes.
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

# Check leaderboard: Alice 1st (120000ms, 2pts), Bob 2nd (135000ms, 1pt)
board=$(get /api/rallycross/leaderboard)
alice_best=$(echo "$board" | jq -r '.[] | select(.driver_name == "Alice Andersson") | .best_total_ms')
bob_best=$(echo "$board"   | jq -r '.[] | select(.driver_name == "Bob Bergström")   | .best_total_ms')
alice_heat=$(echo "$board" | jq -r '.[] | select(.driver_name == "Alice Andersson") | .best_heat_number')
alice_pts=$(echo "$board"  | jq -r '.[] | select(.driver_name == "Alice Andersson") | .total_points')
bob_pts=$(echo "$board"    | jq -r '.[] | select(.driver_name == "Bob Bergström")   | .total_points')

check "Alice best_total_ms = 120000"      "120000" "$alice_best"
check "Bob best_total_ms = 135000"        "135000" "$bob_best"   # lap1=65000 + lap2=70000
check "Alice best from heat 1"            "1"      "$alice_heat"
check "Alice total_points = 2 (1st of 2)" "2"     "$alice_pts"
check "Bob total_points = 1 (2nd of 2)"   "1"     "$bob_pts"

# ---------------------------------------------------------------------------
echo ""
echo "── Heat 2: Timed close with DNF ──────────────────────────────────────"

# Create heat with Charlie and Diana
heat2=$(post /api/rallycross/heat "{\"driver_ids\":[$charlie_id,$diana_id]}")
h2_id=$(echo "$heat2" | jq '.id')
check "heat 2 has number 2" "2" "$(echo "$heat2" | jq '.number')"

h2_started=$(post "/api/rallycross/heat/$h2_id/start" '{}')
H2_BASE=$(echo "$h2_started" | jq '.started_at')

# Charlie completes 2 laps (total=130000ms), Diana only 1 (won't auto-close)
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((H2_BASE + 60000)),\"tag\":\"$CHARLIE_TAG\"}" > /dev/null
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((H2_BASE + 70000)),\"tag\":\"$DIANA_TAG\"}"   > /dev/null
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((H2_BASE + 130000)),\"tag\":\"$CHARLIE_TAG\"}" > /dev/null

# Admin closes heat — Diana gets DNF time = Charlie's 130000ms + 30000ms = 160000ms
close_result=$(post "/api/rallycross/heat/$h2_id/close" '{}')
check "close returns closed_at" "true" "$( [[ "$(echo "$close_result" | jq '.closed_at')" -gt 0 ]] && echo true || echo false )"

cfg=$(get /api/rallycross)
check "no active heat after close" "null" "$(echo "$cfg" | jq '.active_heat')"

# Check heat detail: Charlie finished, Diana DNF with penalty time
h2_detail=$(get "/api/rallycross/heat/$h2_id")
diana_dnf=$(echo "$h2_detail"      | jq -r '.entries[] | select(.driver_name == "Diana Dahl")       | .dnf')
diana_dnf_time=$(echo "$h2_detail" | jq -r '.entries[] | select(.driver_name == "Diana Dahl")       | .dnf_time_ms')
charlie_dnf=$(echo "$h2_detail"    | jq -r '.entries[] | select(.driver_name == "Charlie Svensson") | .dnf')

check "Diana is DNF"                    "true"   "$diana_dnf"
check "Diana dnf_time_ms = 160000"      "160000" "$diana_dnf_time"
check "Charlie is not DNF"              "false"  "$charlie_dnf"

# Check points: Charlie 1st (2pts), Diana DNF is 2nd (1pt)
board=$(get /api/rallycross/leaderboard)
charlie_pts=$(echo "$board" | jq -r '.[] | select(.driver_name == "Charlie Svensson") | .total_points')
diana_pts=$(echo "$board"   | jq -r '.[] | select(.driver_name == "Diana Dahl")       | .total_points')

check "Charlie total_points = 2 (1st of 2)" "2" "$charlie_pts"
check "Diana total_points = 1 (DNF, 2nd)"   "1" "$diana_pts"
# Diana DNF'd so no best_total_ms
check "Diana best_total_ms = null (DNF)" "null" "$(echo "$board" | jq -r '.[] | select(.driver_name == "Diana Dahl") | .best_total_ms')"

# ---------------------------------------------------------------------------
echo ""
echo "── Suggest Next Heat Groups ───────────────────────────────────────────"

# After 1 heat each (all 4 drivers), sorted by class → heat_count → best_total_ms (null last):
#   Class A: Alice (120000ms), Diana (null — DNF, no best_total_ms)
#   Class B: Bob (135000ms)
#   Class S: Charlie (130000ms)
# With max_per_heat=2 → group1=[Alice,Diana], group2=[Bob,Charlie]
suggest=$(get /api/rallycross/suggest-heat)
g1=$(echo "$suggest" | jq -c '.groups[0]')
g2=$(echo "$suggest" | jq -c '.groups[1]')

check "group 1 has Alice and Diana" "[$alice_id,$diana_id]" "$g1"
check "group 2 has Bob and Charlie" "[$bob_id,$charlie_id]" "$g2"

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

# manual_position must be set correctly; no DNFs
charlie_pos=$(echo "$h3_detail" | jq -r '.entries[] | select(.driver_name == "Charlie Svensson") | .manual_position')
alice_pos=$(echo "$h3_detail"   | jq -r '.entries[] | select(.driver_name == "Alice Andersson")  | .manual_position')
charlie_dnf3=$(echo "$h3_detail" | jq -r '.entries[] | select(.driver_name == "Charlie Svensson") | .dnf')
alice_dnf3=$(echo "$h3_detail"   | jq -r '.entries[] | select(.driver_name == "Alice Andersson")  | .dnf')

check "Charlie manual_position = 1" "1"     "$charlie_pos"
check "Alice manual_position = 2"   "2"     "$alice_pos"
check "Charlie not DNF"             "false" "$charlie_dnf3"
check "Alice not DNF"               "false" "$alice_dnf3"

# Overall leaderboard now includes heat 3 manual results
# Points accumulation (positionToPoints = n - pos + 1, n=2 → 1st=2pts, 2nd=1pt):
#   Charlie: 2pts (heat2 timed, 1st) + 2pts (heat3 manual, 1st) = 4pts
#   Alice:   2pts (heat1 timed, 1st) + 1pt  (heat3 manual, 2nd) = 3pts
#   Bob:     1pt  (heat1 timed, 2nd)                             = 1pt
#   Diana:   1pt  (heat2 timed DNF, 2nd)                        = 1pt
board=$(get /api/rallycross/leaderboard)
charlie_pts_final=$(echo "$board" | jq -r '.[] | select(.driver_name == "Charlie Svensson") | .total_points')
alice_pts_final=$(echo "$board"   | jq -r '.[] | select(.driver_name == "Alice Andersson")  | .total_points')
bob_pts_final=$(echo "$board"     | jq -r '.[] | select(.driver_name == "Bob Bergström")    | .total_points')
board_first=$(echo "$board"       | jq -r '.[0].driver_name')
board_second=$(echo "$board"      | jq -r '.[1].driver_name')

check "Charlie leads with 4 pts"           "4"                "$(echo "$board" | jq -r '.[] | select(.driver_name == "Charlie Svensson") | .total_points')"
check "Alice 2nd with 3 pts"               "3"                "$(echo "$board" | jq -r '.[] | select(.driver_name == "Alice Andersson")  | .total_points')"
check "Bob 1pt"                            "1"                "$bob_pts_final"
check "Diana 1pt"                          "1"                "$(echo "$board" | jq -r '.[] | select(.driver_name == "Diana Dahl") | .total_points')"
check "1st place is Charlie"               "Charlie Svensson" "$board_first"
check "2nd place is Alice"                 "Alice Andersson"  "$board_second"
# Alice's timed best_total_ms is preserved from heat 1 even though heat 3 was manual
check "Alice best_total_ms still 120000"   "120000"           "$(echo "$board" | jq -r '.[] | select(.driver_name == "Alice Andersson") | .best_total_ms')"
# Charlie's best_total_ms is from heat 2 (timed); heat 3 was manual so no time
check "Charlie best_total_ms = 130000"     "130000"           "$(echo "$board" | jq -r '.[] | select(.driver_name == "Charlie Svensson") | .best_total_ms')"

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
