#!/usr/bin/env bash
# Seed the rally-timer API with test data.
#
# Requires: curl, jq
#
# Usage:
#   TOKEN=<bearer_token> ./seed.sh [BASE_URL]
#
# To get a token: log in via the app UI and copy the token from
# localStorage (key: "kc_token"), or use the Keycloak admin console.
# Without TOKEN, assumes the app is running with SKIP_AUTH=true (npm run dev:noauth).
#
# Creates:
#   - 2 championships
#   - 3 drivers (one per class), 1 stage, 1 finish gate
#   - Rally Finland 2024  → Nordic Rally Championship + Regional Cup
#   - Rally Sweden 2025   → Nordic Rally Championship only
#   - Ongoing (no submit) → live timing in progress
#
# BASE_URL defaults to http://localhost:5173

set -euo pipefail

BASE="${1:-http://localhost:5173}"

if [[ -z "${TOKEN:-}" ]]; then
  echo "NOTE: TOKEN not set — assuming SKIP_AUTH=true (npm run dev:noauth)"
fi

auth=(-H "Content-Type: application/json")
if [[ -n "${TOKEN:-}" ]]; then
  auth=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")
fi
anon=(-H "Content-Type: application/json")

post() {
  local url="$1" data="$2"; shift 2
  curl -sf -X POST "$BASE$url" -d "$data" "$@"
}

patch() {
  local url="$1" data="$2"; shift 2
  curl -sf -X PATCH "$BASE$url" -d "$data" "$@"
}

# Record a start for a driver at the given timestamp.
# Prints the new start_event id.
start_at() {
  local stage_id="$1" driver_id="$2" ts="$3"
  local row
  row=$(post /api/start "{\"stage_id\":$stage_id,\"driver_id\":$driver_id,\"ts_ms\":$ts}" "${auth[@]}")
  echo "$row" | jq -r '.id'
}

# Send a finish gate event.
finish_at() {
  local gate_id="$1" tag="$2" ts="$3" rssi="$4"
  post /api/gate-event \
    "{\"gate_id\":\"$gate_id\",\"timestamp_ms\":$ts,\"tag\":\"$tag\",\"rssi\":$rssi}" \
    "${anon[@]}" > /dev/null
}

# Submit a rally and print its id.
# Usage: submit_rally "name" champ_id1 [champ_id2 ...]
submit_rally() {
  local name="$1"; shift
  local ids_json
  ids_json=$(printf '"%s",' "$@" | sed 's/,$//')
  local row
  row=$(post /api/submit-rally \
    "{\"name\":\"$name\",\"championship_ids\":[$ids_json]}" \
    "${auth[@]}")
  echo "$row" | jq -r '.id'
}

# Clear all stages and events, then recreate the stage and reassign the gate.
# Prints the new stage_id.
clear_and_setup_stage() {
  local stage_name="$1"
  curl -sf -X DELETE "$BASE/api/clear-rally" "${auth[@]}" > /dev/null
  local sid
  sid=$(post /api/stage "{\"name\":\"$stage_name\"}" "${auth[@]}" | jq -r '.id')
  patch /api/gate/"$gate_id" "{\"stage_id\":$sid}" "${anon[@]}" > /dev/null
  echo "$sid"
}

now=$(date +%s%3N)
week=$((7 * 24 * 3600 * 1000))
day=$((24 * 3600 * 1000))

# ---------------------------------------------------------------------------
echo "==> Fetching classes..."
classes=$(curl -sf "$BASE/api/class")
class_a=$(echo "$classes" | jq -r '.[] | select(.name == "Group A") | .id')
class_b=$(echo "$classes" | jq -r '.[] | select(.name == "Group B") | .id')
class_s=$(echo "$classes" | jq -r '.[] | select(.name == "Group S") | .id')
echo "    Group A=$class_a  Group B=$class_b  Group S=$class_s"

echo "==> Creating championships..."
champ1_id=$(post /api/championship '{"name":"Nordic Rally Championship"}' "${auth[@]}" | jq -r '.id')
champ2_id=$(post /api/championship '{"name":"Regional Cup"}' "${auth[@]}" | jq -r '.id')
echo "    Nordic Rally Championship id=$champ1_id"
echo "    Regional Cup              id=$champ2_id"

echo "==> Creating stage..."
stage_id=$(post /api/stage '{"name":"SS1 - Forest Road"}' "${auth[@]}" | jq -r '.id')
echo "    Stage id=$stage_id"

echo "==> Creating drivers..."
driver_a=$(post /api/driver \
  "{\"name\":\"Alice Andersson\",\"class_id\":$class_a,\"tag\":\"AABBCC001122\"}" "${auth[@]}")
driver_b=$(post /api/driver \
  "{\"name\":\"Bob Bergström\",\"class_id\":$class_b,\"tag\":\"DDEEFF334455\"}" "${auth[@]}")
driver_s=$(post /api/driver \
  "{\"name\":\"Charlie Svensson\",\"class_id\":$class_s,\"tag\":\"112233AABBCC\"}" "${auth[@]}")
driver_d=$(post /api/driver \
  "{\"name\":\"Diana Dahl\",\"class_id\":$class_a,\"tag\":\"FFEE00112233\"}" "${auth[@]}")
id_a=$(echo "$driver_a" | jq -r '.id')
id_b=$(echo "$driver_b" | jq -r '.id')
id_s=$(echo "$driver_s" | jq -r '.id')
id_d=$(echo "$driver_d" | jq -r '.id')
tag_a=$(echo "$driver_a" | jq -r '.tag')
tag_b=$(echo "$driver_b" | jq -r '.tag')
tag_s=$(echo "$driver_s" | jq -r '.tag')
tag_d=$(echo "$driver_d" | jq -r '.tag')
echo "    Alice id=$id_a  Bob id=$id_b  Charlie id=$id_s  Diana id=$id_d"

echo "==> Registering and assigning finish gate..."
gate_id="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
_SEED_KEY=$(mktemp)
openssl genpkey -algorithm ed25519 -out "$_SEED_KEY" 2>/dev/null
gate_pubkey=$(openssl pkey -in "$_SEED_KEY" -pubout 2>/dev/null | jq -Rs .)
rm -f "$_SEED_KEY"
post /api/gate/"$gate_id" \
  "{\"id\":\"$gate_id\",\"name\":\"SS1 Finish Gate\",\"public_key\":$gate_pubkey}" "${anon[@]}" > /dev/null
patch /api/gate/"$gate_id" \
  "{\"status\":\"accepted\",\"stage_id\":$stage_id}" "${anon[@]}" > /dev/null
echo "    Gate $gate_id assigned to stage $stage_id"

# ---------------------------------------------------------------------------
# Rally Finland 2024 — 2 weeks ago
# Charlie wins: 3:42 | Alice: 3:58 | Bob: 4:11
# → both championships
# ---------------------------------------------------------------------------
echo ""
echo "==> Rally Finland 2024 (2 weeks ago)..."
t1=$((now - 2 * week))

start_at "$stage_id" "$id_s" "$t1"                  > /dev/null
start_at "$stage_id" "$id_a" "$((t1 + 30000))"      > /dev/null
start_at "$stage_id" "$id_b" "$((t1 + 60000))"      > /dev/null
finish_at "$gate_id" "$tag_s" "$((t1 + 222000))"  -65
finish_at "$gate_id" "$tag_a" "$((t1 + 268000))"  -68  # 3:58 from Alice's start
finish_at "$gate_id" "$tag_b" "$((t1 + 311000))"  -72  # 4:11 from Bob's start

rally1_id=$(submit_rally "Rally Finland 2024" "$champ1_id" "$champ2_id")
echo "    Submitted id=$rally1_id  (1. Charlie 3:42  2. Alice 3:58  3. Bob 4:11)"

echo "    Clearing..."
stage_id=$(clear_and_setup_stage "SS1 - Forest Road")
echo "    Stage reset id=$stage_id"

# ---------------------------------------------------------------------------
# Rally Sweden 2025 — 1 week ago
# Alice wins: 3:35 | Charlie: 3:48 | Bob: 4:20
# → Nordic Rally Championship only
# ---------------------------------------------------------------------------
echo ""
echo "==> Rally Sweden 2025 (1 week ago)..."
t2=$((now - week))

start_at "$stage_id" "$id_s" "$t2"                  > /dev/null
start_at "$stage_id" "$id_a" "$((t2 + 30000))"      > /dev/null
start_at "$stage_id" "$id_b" "$((t2 + 60000))"      > /dev/null
finish_at "$gate_id" "$tag_s" "$((t2 + 228000))"  -63  # 3:48 from Charlie's start
finish_at "$gate_id" "$tag_a" "$((t2 + 245000))"  -70  # 3:35 from Alice's start
finish_at "$gate_id" "$tag_b" "$((t2 + 320000))"  -75  # 4:20 from Bob's start

rally2_id=$(submit_rally "Rally Sweden 2025" "$champ1_id")
echo "    Submitted id=$rally2_id  (1. Alice 3:35  2. Charlie 3:48  3. Bob 4:20)"

echo "    Clearing..."
stage_id=$(clear_and_setup_stage "SS1 - Forest Road")
echo "    Stage reset id=$stage_id"

# ---------------------------------------------------------------------------
# Rally Norway 2025 — 2 stages, submitted to Nordic only, NOT cleared
# Group A has 2 drivers so we can test class deltas and that SS1 leader ≠ winner.
#
# SS1 - Forest Road  (stage_id from clear after Sweden)
#   Alice:   3:30 (210 000 ms)  — P1 Group A on SS1
#   Diana:   3:38 (218 000 ms)  — P2 Group A on SS1
#   Charlie: 3:45 (225 000 ms)  — P1 Group S
#   Bob:     4:05 (245 000 ms)  — P1 Group B
#
# SS2 - Mountain Pass
#   Diana:   3:25 (205 000 ms)  — P1 Group A on SS2
#   Alice:   3:50 (230 000 ms)  — P2 Group A on SS2
#   Charlie: 3:40 (220 000 ms)  — P1 Group S
#   Bob:     3:55 (235 000 ms)  — P1 Group B
#
# Overall Group A: 1. Diana 423 000 ms  2. Alice 440 000 ms
#   (SS1 leader Alice is beaten overall — good test for delta/ranking logic)
# ---------------------------------------------------------------------------
echo ""
echo "==> Rally Norway 2025 (2 stages, submitted to Nordic)..."
t3=$((now - day))
t3_2=$((t3 + 2 * 3600 * 1000))

# SS1 - Forest Road
start_at "$stage_id" "$id_a" "$t3"                    > /dev/null
start_at "$stage_id" "$id_d" "$((t3 + 30000))"       > /dev/null
start_at "$stage_id" "$id_s" "$((t3 + 60000))"       > /dev/null
start_at "$stage_id" "$id_b" "$((t3 + 90000))"       > /dev/null
finish_at "$gate_id" "$tag_a" "$((t3 + 210000))"    -70  # 3:30
finish_at "$gate_id" "$tag_d" "$((t3 + 248000))"    -68  # 3:38
finish_at "$gate_id" "$tag_s" "$((t3 + 285000))"    -64  # 3:45
finish_at "$gate_id" "$tag_b" "$((t3 + 335000))"    -71  # 4:05

# Reassign gate to SS2 - Mountain Pass
stage2_id=$(post /api/stage '{"name":"SS2 - Mountain Pass"}' "${auth[@]}" | jq -r '.id')
patch /api/gate/"$gate_id" "{\"stage_id\":$stage2_id}" "${anon[@]}" > /dev/null
echo "    SS1 done. Gate reassigned to stage2 id=$stage2_id"

# SS2 - Mountain Pass
start_at "$stage2_id" "$id_a" "$t3_2"                    > /dev/null
start_at "$stage2_id" "$id_d" "$((t3_2 + 30000))"       > /dev/null
start_at "$stage2_id" "$id_s" "$((t3_2 + 60000))"       > /dev/null
start_at "$stage2_id" "$id_b" "$((t3_2 + 90000))"       > /dev/null
finish_at "$gate_id" "$tag_a" "$((t3_2 + 230000))"    -69  # 3:50
finish_at "$gate_id" "$tag_d" "$((t3_2 + 235000))"    -67  # 3:25
finish_at "$gate_id" "$tag_s" "$((t3_2 + 280000))"    -63  # 3:40
finish_at "$gate_id" "$tag_b" "$((t3_2 + 325000))"    -72  # 3:55

rally3_id=$(submit_rally "Rally Norway 2025" "$champ1_id")
echo "    Submitted id=$rally3_id"
echo "    NOT cleared — events remain visible in manage view"

# ---------------------------------------------------------------------------
# Rally DNF Test — Group A: Alice finishes 4:00, Diana DNFs (no finish)
# Penalty for Diana = Alice's time + 30 s = 240 000 + 30 000 = 270 000 ms
# Charlie (Group S) finishes 3:50 = 230 000 ms (unaffected)
# Bob (Group B) finishes 4:15 = 255 000 ms (unaffected)
# ---------------------------------------------------------------------------
echo ""
echo "==> Rally DNF Test (now, not in any championship)..."
echo "    Clearing..."
stage_id=$(clear_and_setup_stage "SS1 - DNF Test")
echo "    Stage id=$stage_id"
t4=$((now - 3600000))  # 1 hour ago

start_at "$stage_id" "$id_a" "$t4"               > /dev/null
start_at "$stage_id" "$id_d" "$((t4 + 30000))"   > /dev/null  # Diana starts but will DNF
start_at "$stage_id" "$id_s" "$((t4 + 60000))"   > /dev/null
start_at "$stage_id" "$id_b" "$((t4 + 90000))"   > /dev/null

# Alice: 4:00 = 240 000 ms from her start
finish_at "$gate_id" "$tag_a" "$((t4 + 240000))"  -70
# Diana: NO finish — DNF
# Charlie: 3:50 = 230 000 ms from his start
finish_at "$gate_id" "$tag_s" "$((t4 + 290000))"  -66  # 60000 offset + 230000
# Bob: 4:15 = 255 000 ms from his start
finish_at "$gate_id" "$tag_b" "$((t4 + 345000))"  -73  # 90000 offset + 255000

# Close the stage: inserts synthetic finish event for Diana (DNF penalty = 240000+30000=270000ms)
echo "    Closing stage (applying DNF penalties)..."
close_result=$(post /api/stage/"$stage_id"/close "" "${auth[@]}")
echo "    Close result: $close_result"

rally_dnf_id=$(submit_rally "Rally DNF Test" "$champ2_id")
echo "    Submitted id=$rally_dnf_id (Regional Cup)"
echo "    Group A: Alice 4:00 (240000ms), Diana DNF → penalty 4:30 (270000ms)"
echo "    Group S: Charlie 3:50 (230000ms)"
echo "    Group B: Bob 4:15 (255000ms)"

# ---------------------------------------------------------------------------
# Create one more open stage so verify.sh can assert is_closed=false on it.
echo ""
echo "==> Creating open stage for status verification..."
open_stage_id=$(post /api/stage '{"name":"SS1 - Status Check (open)"}' "${auth[@]}" | jq -r '.id')
echo "    Open stage id=$open_stage_id (not closed, no starts)"

# ---------------------------------------------------------------------------
# Penalty Test — apply a manual penalty to Alice and verify it shifts elapsed_ms
# Alice raw: 5:00 = 300000ms, Bob raw: 5:10 = 310000ms
# Penalty: Alice +15s → effective 5:15 = 315000ms → Bob wins
# ---------------------------------------------------------------------------
echo ""
echo "==> Penalty Test..."
penalty_champ_id=$(post /api/championship '{"name":"Penalty Cup"}' "${auth[@]}" | jq -r '.id')
echo "    Penalty Cup id=$penalty_champ_id"

penalty_stage_id=$(post /api/stage '{"name":"SS1 - Penalty Test"}' "${auth[@]}" | jq -r '.id')
patch /api/gate/"$gate_id" "{\"stage_id\":$penalty_stage_id}" "${anon[@]}" > /dev/null
echo "    Penalty stage id=$penalty_stage_id, gate reassigned"

t5=$((now - 1800000))  # 30 min ago
start_at "$penalty_stage_id" "$id_a" "$t5"               > /dev/null  # Alice
start_at "$penalty_stage_id" "$id_b" "$((t5 + 30000))"  > /dev/null  # Bob

finish_at "$gate_id" "$tag_a" "$((t5 + 300000))"  -70   # Alice raw 5:00
finish_at "$gate_id" "$tag_b" "$((t5 + 340000))"  -72   # Bob raw 5:10 (30s offset + 310000)

alice_penalty_finish_id=$(curl -sf "$BASE/api/stage/$penalty_stage_id/finishers" \
  | jq -r '.[] | select(.driver_name == "Alice Andersson") | .finish_event_id')
patch /api/finish/"$alice_penalty_finish_id" '{"penalty_ms":15000}' "${auth[@]}" > /dev/null
echo "    Applied 15s penalty to Alice (finish_event_id=$alice_penalty_finish_id)"
echo "    Alice effective: 315000ms  Bob: 310000ms → Bob P1"

penalty_rally_id=$(submit_rally "Rally Penalty Test" "$penalty_champ_id")
echo "    Submitted id=$penalty_rally_id"

# ---------------------------------------------------------------------------
echo ""
echo "Done."
echo ""
echo "Championships:"
echo "  Nordic Rally Championship ($champ1_id)"
echo "    Rally Finland 2024  → Charlie 1st (S), Alice 2nd (A), Bob 3rd (B)  [by class P1 each]"
echo "    Rally Sweden 2025   → Alice 1st (A), Charlie 2nd (S), Bob 3rd (B)  [by class P1 each]"
echo "    Rally Norway 2025   → Diana 1st A (423s), Alice 2nd A (440s) | Charlie P1 S | Bob P1 B"
echo "  Regional Cup ($champ2_id)"
echo "    Rally Finland 2024  → Charlie 1st (S), Alice 2nd (A), Bob 3rd (B)"
echo ""
echo "Nordic standings (inverse points: N-pos+1 per class):"
echo "  Group A:  Alice 3 pts (1+1+1)   Diana 2 pts (P1 of 2 in Norway)"
echo "  Group S:  Charlie 3 pts (1+1+1)"
echo "  Group B:  Bob 3 pts (1+1+1)"
echo ""
echo "Rally DNF Test id=$rally_dnf_id"
echo "  Diana DNF penalty = 240000 + 30000 = 270000 ms"
