#!/usr/bin/env bash
# Verify rally-timer API results against seed.sh expectations.
# Run after seed.sh against the same BASE_URL.
#
# Usage:
#   ./verify.sh [BASE_URL]
#   BASE_URL defaults to http://localhost:5173
#
# Exit code: 0 = all assertions passed, 1 = one or more failed

set -euo pipefail

BASE="${1:-http://localhost:5173}"

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

get() { curl -sf "$BASE$1"; }

# ---------------------------------------------------------------------------
echo ""
echo "── Championships ──────────────────────────────────────────────────────"

championships=$(get /api/championship)

nordic_id=$(echo "$championships" | jq -r '.[] | select(.name == "Nordic Rally Championship") | .id')
regional_id=$(echo "$championships" | jq -r '.[] | select(.name == "Regional Cup") | .id')

if [[ -z "$nordic_id" || -z "$regional_id" ]]; then
  echo "ERROR: Championships not found. Did you run seed.sh first?"
  exit 1
fi

echo "  Nordic Rally Championship : $nordic_id"
echo "  Regional Cup              : $regional_id"

nordic_detail=$(get /api/championship/"$nordic_id")
regional_detail=$(get /api/championship/"$regional_id")

nordic_rally_count=$(echo "$nordic_detail" | jq '.rallies | length')
regional_rally_count=$(echo "$regional_detail" | jq '.rallies | length')

check "Nordic has 2 rallies"   "2" "$nordic_rally_count"
check "Regional Cup has 1 rally" "1" "$regional_rally_count"

# ---------------------------------------------------------------------------
echo ""
echo "── Submitted Rally Results ─────────────────────────────────────────────"

# Find submitted rallies by name from the Nordic championship (which has both)
finland_id=$(echo "$nordic_detail" | jq -r '.rallies[] | select(.name == "Rally Finland 2024") | .id')
sweden_id=$(echo "$nordic_detail"  | jq -r '.rallies[] | select(.name == "Rally Sweden 2025")  | .id')

if [[ -z "$finland_id" || -z "$sweden_id" ]]; then
  echo "ERROR: Submitted rallies not found. Did you run seed.sh first?"
  exit 1
fi

finland=$(get /api/submitted-rally/"$finland_id")
sweden=$(get  /api/submitted-rally/"$sweden_id")

# Verify Rally Finland 2024 also belongs to Regional Cup
finland_in_regional=$(echo "$regional_detail" | jq -r '.rallies[] | select(.name == "Rally Finland 2024") | .name')
check "Rally Finland 2024 is in Regional Cup" "Rally Finland 2024" "$finland_in_regional"

echo ""
echo "  Rally Finland 2024 — elapsed times (ms):"
get_elapsed() {
  local data="$1" driver="$2" stage="$3"
  echo "$data" | jq -r \
    --arg d "$driver" --arg s "$stage" \
    '.results[] | select(.driver_name == $d and .stage_name == $s) | .elapsed_ms'
}

check "Charlie — SS1 — 3:42 (222000ms)" "222000" "$(get_elapsed "$finland" "Charlie Svensson"  "SS1 - Forest Road")"
check "Alice   — SS1 — 3:58 (238000ms)" "238000" "$(get_elapsed "$finland" "Alice Andersson"   "SS1 - Forest Road")"
check "Bob     — SS1 — 4:11 (251000ms)" "251000" "$(get_elapsed "$finland" "Bob Bergström"     "SS1 - Forest Road")"

echo ""
echo "  Rally Sweden 2025 — elapsed times (ms):"
check "Alice   — SS1 — 3:35 (215000ms)" "215000" "$(get_elapsed "$sweden"  "Alice Andersson"   "SS1 - Forest Road")"
check "Charlie — SS1 — 3:48 (228000ms)" "228000" "$(get_elapsed "$sweden"  "Charlie Svensson"  "SS1 - Forest Road")"
check "Bob     — SS1 — 4:20 (260000ms)" "260000" "$(get_elapsed "$sweden"  "Bob Bergström"     "SS1 - Forest Road")"

# ---------------------------------------------------------------------------
echo ""
echo "── Championship Standings ──────────────────────────────────────────────"

nordic_standings=$(get /api/championship/"$nordic_id"/standings)
regional_standings=$(get /api/championship/"$regional_id"/standings)

get_points() {
  echo "$1" | jq -r --arg d "$2" '.[] | select(.driver_name == $d) | .total_points'
}
get_rally_points() {
  echo "$1" | jq -r --arg d "$2" --arg r "$3" \
    '.[] | select(.driver_name == $d) | .rally_points[] | select(.rally_name == $r) | .points'
}

echo ""
echo "  Nordic Rally Championship (2 rallies, 1 driver/class → P1 each → 25+25=50):"
check "Alice   total 50 pts" "50" "$(get_points "$nordic_standings" "Alice Andersson")"
check "Charlie total 50 pts" "50" "$(get_points "$nordic_standings" "Charlie Svensson")"
check "Bob     total 50 pts" "50" "$(get_points "$nordic_standings" "Bob Bergström")"

echo ""
echo "  Nordic — points breakdown per rally:"
check "Alice   — Finland — 25 pts (P1 Group A)" "25" "$(get_rally_points "$nordic_standings" "Alice Andersson"  "Rally Finland 2024")"
check "Alice   — Sweden  — 25 pts (P1 Group A)" "25" "$(get_rally_points "$nordic_standings" "Alice Andersson"  "Rally Sweden 2025")"
check "Charlie — Finland — 25 pts (P1 Group S)" "25" "$(get_rally_points "$nordic_standings" "Charlie Svensson" "Rally Finland 2024")"
check "Charlie — Sweden  — 25 pts (P1 Group S)" "25" "$(get_rally_points "$nordic_standings" "Charlie Svensson" "Rally Sweden 2025")"
check "Bob     — Finland — 25 pts (P1 Group B)" "25" "$(get_rally_points "$nordic_standings" "Bob Bergström"    "Rally Finland 2024")"
check "Bob     — Sweden  — 25 pts (P1 Group B)" "25" "$(get_rally_points "$nordic_standings" "Bob Bergström"    "Rally Sweden 2025")"

echo ""
echo "  Regional Cup (1 rally → 25 pts each):"
check "Alice   total 25 pts" "25" "$(get_points "$regional_standings" "Alice Andersson")"
check "Charlie total 25 pts" "25" "$(get_points "$regional_standings" "Charlie Svensson")"
check "Bob     total 25 pts" "25" "$(get_points "$regional_standings" "Bob Bergström")"

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
