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

# ---------------------------------------------------------------------------
echo ""
echo "── Rallycross Config ──────────────────────────────────────────────────"

# Reset any prior state (delete gate cascades to gate_events, cleaning synthetic test data)
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

# Register and assign gate
post "/api/gate/$GATE_UUID" "{\"id\":\"$GATE_UUID\",\"name\":\"Test Gate\"}" > /dev/null
patch /api/rallycross "{\"gate_id\":\"$GATE_UUID\"}" > /dev/null
cfg=$(get /api/rallycross)
check "gate assigned to rallycross" "$GATE_UUID" "$(echo "$cfg" | jq -r '.gate_id')"

# ---------------------------------------------------------------------------
echo ""
echo "── Heat 1: Create, Start, Auto-close ─────────────────────────────────"

# Create heat with Alice (id=1) and Bob (id=2)
heat1=$(post /api/rallycross/heat '{"driver_ids":[1,2]}')
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

# Send gate events — 2 laps for Alice (finishes), 1 lap for Bob (won't finish in time)
# Use timestamps relative to started_at
H1_BASE=$h1_ts
ALICE_TAG="AABBCC001122"
BOB_TAG="DDEEFF334455"

post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((H1_BASE + 60000)),\"tag\":\"$ALICE_TAG\"}" > /dev/null
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((H1_BASE + 65000)),\"tag\":\"$BOB_TAG\"}"   > /dev/null
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((H1_BASE + 120000)),\"tag\":\"$ALICE_TAG\"}" > /dev/null

# After Alice's 2nd pass (required_laps=2) NOT all entries finished yet — auto-close must NOT happen yet
cfg=$(get /api/rallycross)
check "heat not auto-closed yet (Bob unfinished)" "$h1_id" "$(echo "$cfg" | jq '.active_heat.id')"

# Bob finishes his 2nd lap — heat should auto-close
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((H1_BASE + 135000)),\"tag\":\"$BOB_TAG\"}" > /dev/null

cfg=$(get /api/rallycross)
check "heat auto-closed after all finish" "null" "$(echo "$cfg" | jq '.active_heat')"

# Check leaderboard
board=$(get /api/rallycross/leaderboard)
alice_best=$(echo "$board" | jq -r '.[] | select(.driver_name == "Alice Andersson") | .best_total_ms')
bob_best=$(echo "$board"   | jq -r '.[] | select(.driver_name == "Bob Bergström")   | .best_total_ms')
alice_heat=$(echo "$board" | jq -r '.[] | select(.driver_name == "Alice Andersson") | .best_heat_number')

check "Alice best_total_ms = 120000" "120000" "$alice_best"
check "Bob best_total_ms = 135000"   "135000" "$bob_best"  # 65000+70000=135000
check "Alice best from heat 1"       "1"      "$alice_heat"

# ---------------------------------------------------------------------------
echo ""
echo "── Heat 2: Manual close with DNF ─────────────────────────────────────"

# Create heat with Charlie (id=3) and Diana (id=4)
heat2=$(post /api/rallycross/heat '{"driver_ids":[3,4]}')
h2_id=$(echo "$heat2" | jq '.id')
check "heat 2 has number 2" "2" "$(echo "$heat2" | jq '.number')"

h2_started=$(post "/api/rallycross/heat/$h2_id/start" '{}')
H2_BASE=$(echo "$h2_started" | jq '.started_at')

CHARLIE_TAG="112233AABBCC"
DIANA_TAG="FFEE00112233"

# Charlie completes 2 laps (total=130000ms), Diana only 1
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((H2_BASE + 60000)),\"tag\":\"$CHARLIE_TAG\"}" > /dev/null
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((H2_BASE + 70000)),\"tag\":\"$DIANA_TAG\"}"   > /dev/null
post /api/gate-event "{\"gate_id\":\"$GATE_UUID\",\"timestamp_ms\":$((H2_BASE + 130000)),\"tag\":\"$CHARLIE_TAG\"}" > /dev/null

# Manually close — Diana should get DNF with Charlie's 130000ms + 30000ms = 160000ms
close_result=$(post "/api/rallycross/heat/$h2_id/close" '{}')
check "close returns closed_at"  "true" "$( [[ "$(echo "$close_result" | jq '.closed_at')" -gt 0 ]] && echo true || echo false )"

cfg=$(get /api/rallycross)
check "no active heat after manual close" "null" "$(echo "$cfg" | jq '.active_heat')"

# Check DNF on the heat detail
h2_detail=$(get "/api/rallycross/heat/$h2_id")
diana_dnf=$(echo "$h2_detail"      | jq -r '.entries[] | select(.driver_name == "Diana Dahl")    | .dnf')
diana_dnf_time=$(echo "$h2_detail" | jq -r '.entries[] | select(.driver_name == "Diana Dahl")    | .dnf_time_ms')
charlie_dnf=$(echo "$h2_detail"    | jq -r '.entries[] | select(.driver_name == "Charlie Svensson") | .dnf')

check "Diana is DNF"                    "true"   "$diana_dnf"
check "Diana dnf_time_ms = 160000"      "160000" "$diana_dnf_time"
check "Charlie is not DNF"              "false"  "$charlie_dnf"

# ---------------------------------------------------------------------------
echo ""
echo "── Suggest Next Heat Groups ───────────────────────────────────────────"

# Overall standings: Alice 120000, Bob 135000, Charlie 130000 → then Diana DNF
# With max_per_heat=2: group1=[Alice, Charlie], group2=[Bob, Diana]
# (sorted: Alice 120000, Charlie 130000, Bob 135000, Diana DNF)
suggest=$(get /api/rallycross/suggest-heat)
g1=$(echo "$suggest" | jq -c '.groups[0]')
g2=$(echo "$suggest" | jq -c '.groups[1]')

alice_id=1; charlie_id=3; bob_id=2; diana_id=4
check "group 1 has Alice and Charlie" "[$alice_id,$charlie_id]" "$g1"
check "group 2 has Bob and Diana"     "[$bob_id,$diana_id]"     "$g2"

# ---------------------------------------------------------------------------
echo ""
echo "── Reset ─────────────────────────────────────────────────────────────"

del /api/rallycross > /dev/null
cfg=$(get /api/rallycross)
check "after DELETE heats is empty"     "[]"   "$(echo "$cfg" | jq -c '.heats')"
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
