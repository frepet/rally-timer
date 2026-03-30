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

# Record a start for a driver, then backdate it to the given timestamp.
# Prints the new start_event id.
start_at() {
  local stage_id="$1" driver_id="$2" ts="$3"
  local row
  row=$(post /api/stage/"$stage_id"/start "{\"driver_id\":$driver_id}" "${auth[@]}")
  local id
  id=$(echo "$row" | jq -r '.id')
  patch /api/start/"$id" "{\"timestamp\":$ts}" "${auth[@]}" > /dev/null
  echo "$id"
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
id_a=$(echo "$driver_a" | jq -r '.id')
id_b=$(echo "$driver_b" | jq -r '.id')
id_s=$(echo "$driver_s" | jq -r '.id')
tag_a=$(echo "$driver_a" | jq -r '.tag')
tag_b=$(echo "$driver_b" | jq -r '.tag')
tag_s=$(echo "$driver_s" | jq -r '.tag')
echo "    Alice id=$id_a  Bob id=$id_b  Charlie id=$id_s"

echo "==> Registering and assigning finish gate..."
gate_id="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
post /api/gate/"$gate_id" \
  "{\"id\":\"$gate_id\",\"name\":\"SS1 Finish Gate\"}" "${anon[@]}" > /dev/null
patch /api/gate/"$gate_id" \
  "{\"stage_id\":$stage_id}" "${anon[@]}" > /dev/null
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
# Rally Norway 2025 — ongoing, not submitted
# Starts recorded now, finishes in ~4 minutes
# ---------------------------------------------------------------------------
echo ""
echo "==> Rally Norway 2025 (ongoing, not submitted)..."

start_at "$stage_id" "$id_s" "$now"                 > /dev/null
start_at "$stage_id" "$id_a" "$((now + 30000))"     > /dev/null
start_at "$stage_id" "$id_b" "$((now + 60000))"     > /dev/null
finish_at "$gate_id" "$tag_s" "$((now + 225000))"  -64  # 3:45
finish_at "$gate_id" "$tag_a" "$((now + 262000))"  -69  # 3:52
finish_at "$gate_id" "$tag_b" "$((now + 308000))"  -71  # 4:08
echo "    Live timing seeded — not submitted yet"

# ---------------------------------------------------------------------------
echo ""
echo "Done."
echo ""
echo "Championships:"
echo "  Nordic Rally Championship ($champ1_id)"
echo "    Rally Finland 2024  → Charlie 1st, Alice 2nd, Bob 3rd"
echo "    Rally Sweden 2025   → Alice 1st, Charlie 2nd, Bob 3rd"
echo "  Regional Cup ($champ2_id)"
echo "    Rally Finland 2024  → Charlie 1st, Alice 2nd, Bob 3rd"
echo ""
echo "Ongoing (Rally Norway 2025, not submitted):"
echo "  Expected: 1. Charlie (3:45)  2. Alice (3:52)  3. Bob (4:08)"
