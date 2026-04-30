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

check "Nordic has 3 rallies"     "3" "$nordic_rally_count"
check "Regional Cup has 2 rallies" "2" "$regional_rally_count"

# ---------------------------------------------------------------------------
echo ""
echo "── Submitted Rally Results ─────────────────────────────────────────────"

# Find submitted rallies by name from the Nordic championship (which has all three)
finland_id=$(echo "$nordic_detail" | jq -r '.rallies[] | select(.name == "Rally Finland 2024") | .id')
sweden_id=$(echo "$nordic_detail"  | jq -r '.rallies[] | select(.name == "Rally Sweden 2025")  | .id')
norway_id=$(echo "$nordic_detail"  | jq -r '.rallies[] | select(.name == "Rally Norway 2025")  | .id')

if [[ -z "$finland_id" || -z "$sweden_id" || -z "$norway_id" ]]; then
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

norway=$(get /api/submitted-rally/"$norway_id")

echo ""
echo "  Rally Norway 2025 — SS1 elapsed times (ms):"
check "Alice   — SS1 — 3:30 (210000ms)" "210000" "$(get_elapsed "$norway" "Alice Andersson"  "SS1 - Forest Road")"
check "Diana   — SS1 — 3:38 (218000ms)" "218000" "$(get_elapsed "$norway" "Diana Dahl"        "SS1 - Forest Road")"
check "Charlie — SS1 — 3:45 (225000ms)" "225000" "$(get_elapsed "$norway" "Charlie Svensson"  "SS1 - Forest Road")"
check "Bob     — SS1 — 4:05 (245000ms)" "245000" "$(get_elapsed "$norway" "Bob Bergström"     "SS1 - Forest Road")"

echo ""
echo "  Rally Norway 2025 — SS2 elapsed times (ms):"
check "Diana   — SS2 — 3:25 (205000ms)" "205000" "$(get_elapsed "$norway" "Diana Dahl"        "SS2 - Mountain Pass")"
check "Alice   — SS2 — 3:50 (230000ms)" "230000" "$(get_elapsed "$norway" "Alice Andersson"  "SS2 - Mountain Pass")"
check "Charlie — SS2 — 3:40 (220000ms)" "220000" "$(get_elapsed "$norway" "Charlie Svensson"  "SS2 - Mountain Pass")"
check "Bob     — SS2 — 3:55 (235000ms)" "235000" "$(get_elapsed "$norway" "Bob Bergström"     "SS2 - Mountain Pass")"

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
echo "  Nordic Rally Championship (3 rallies, inverse points N-pos+1 per class):"
echo "    Finland/Sweden: each class has 1 starter → 1 pt each"
echo "    Norway Group A: Diana P1 of 2 → 2 pts, Alice P2 of 2 → 1 pt; others solo → 1 pt"
echo "    Alice 1+1+1=3  Diana 2  Charlie 1+1+1=3  Bob 1+1+1=3"
check "Alice   total 3 pts"  "3" "$(get_points "$nordic_standings" "Alice Andersson")"
check "Charlie total 3 pts"  "3" "$(get_points "$nordic_standings" "Charlie Svensson")"
check "Bob     total 3 pts"  "3" "$(get_points "$nordic_standings" "Bob Bergström")"
check "Diana   total 2 pts"  "2" "$(get_points "$nordic_standings" "Diana Dahl")"

echo ""
echo "  Nordic — points breakdown per rally:"
check "Alice   — Finland — 1 pt  (P1 of 1 Group A)" "1" "$(get_rally_points "$nordic_standings" "Alice Andersson"  "Rally Finland 2024")"
check "Alice   — Sweden  — 1 pt  (P1 of 1 Group A)" "1" "$(get_rally_points "$nordic_standings" "Alice Andersson"  "Rally Sweden 2025")"
check "Alice   — Norway  — 1 pt  (P2 of 2 Group A)" "1" "$(get_rally_points "$nordic_standings" "Alice Andersson"  "Rally Norway 2025")"
check "Diana   — Norway  — 2 pts (P1 of 2 Group A)" "2" "$(get_rally_points "$nordic_standings" "Diana Dahl"       "Rally Norway 2025")"
check "Charlie — Finland — 1 pt  (P1 of 1 Group S)" "1" "$(get_rally_points "$nordic_standings" "Charlie Svensson" "Rally Finland 2024")"
check "Charlie — Sweden  — 1 pt  (P1 of 1 Group S)" "1" "$(get_rally_points "$nordic_standings" "Charlie Svensson" "Rally Sweden 2025")"
check "Charlie — Norway  — 1 pt  (P1 of 1 Group S)" "1" "$(get_rally_points "$nordic_standings" "Charlie Svensson" "Rally Norway 2025")"
check "Bob     — Finland — 1 pt  (P1 of 1 Group B)" "1" "$(get_rally_points "$nordic_standings" "Bob Bergström"    "Rally Finland 2024")"
check "Bob     — Sweden  — 1 pt  (P1 of 1 Group B)" "1" "$(get_rally_points "$nordic_standings" "Bob Bergström"    "Rally Sweden 2025")"
check "Bob     — Norway  — 1 pt  (P1 of 1 Group B)" "1" "$(get_rally_points "$nordic_standings" "Bob Bergström"    "Rally Norway 2025")"

echo ""
echo "  Regional Cup (2 rallies: Finland 2024 + DNF Test):"
echo "    Finland: each class 1 starter → 1 pt; DNF Test Group A: Alice P1 of 2 → 2 pts, Diana P2 → 1 pt"
echo "    Alice 1+2=3  Charlie 1+1=2  Bob 1+1=2  Diana 0+1=1"
check "Alice   total 3 pts" "3" "$(get_points "$regional_standings" "Alice Andersson")"
check "Charlie total 2 pts" "2" "$(get_points "$regional_standings" "Charlie Svensson")"
check "Bob     total 2 pts" "2" "$(get_points "$regional_standings" "Bob Bergström")"
check "Diana   total 1 pt (P2 of 2 Group A in DNF Test)" "1" "$(get_points "$regional_standings" "Diana Dahl")"

# ---------------------------------------------------------------------------
echo ""
echo "── DNF Penalty ─────────────────────────────────────────────────────────"

# Rally DNF Test is submitted to Regional Cup (its 2nd rally)
dnf_rally_id=$(echo "$regional_detail" | jq -r '.rallies[] | select(.name == "Rally DNF Test") | .id')

if [[ -z "$dnf_rally_id" ]]; then
  echo "  ERROR: Rally DNF Test not found. Did you run seed.sh?"
  ((fail++)) || true
else
  echo "  Rally DNF Test id=$dnf_rally_id"
  dnf_rally=$(get /api/submitted-rally/"$dnf_rally_id")

  # Alice finished 4:00 = 240 000 ms. Diana DNF → penalty = 240 000 + 30 000 = 270 000 ms.
  alice_dnf_time=$(echo "$dnf_rally" | jq -r '.results[] | select(.driver_name == "Alice Andersson"  and .stage_name == "SS1 - DNF Test") | .elapsed_ms')
  diana_dnf_time=$(echo "$dnf_rally" | jq -r '.results[] | select(.driver_name == "Diana Dahl"       and .stage_name == "SS1 - DNF Test") | .elapsed_ms')
  diana_dnf_flag=$(echo "$dnf_rally" | jq -r '.results[] | select(.driver_name == "Diana Dahl"       and .stage_name == "SS1 - DNF Test") | .dnf')
  alice_dnf_flag=$(echo "$dnf_rally" | jq -r '.results[] | select(.driver_name == "Alice Andersson"  and .stage_name == "SS1 - DNF Test") | .dnf')
  charlie_dnf_time=$(echo "$dnf_rally" | jq -r '.results[] | select(.driver_name == "Charlie Svensson" and .stage_name == "SS1 - DNF Test") | .elapsed_ms')
  charlie_dnf_flag=$(echo "$dnf_rally" | jq -r '.results[] | select(.driver_name == "Charlie Svensson" and .stage_name == "SS1 - DNF Test") | .dnf')

  check "Alice   — DNF Test — 4:00 (240000ms)"          "240000" "$alice_dnf_time"
  check "Alice   — DNF Test — dnf flag is false"         "false"  "$alice_dnf_flag"
  check "Diana   — DNF Test — penalty 4:30 (270000ms)"  "270000" "$diana_dnf_time"
  check "Diana   — DNF Test — dnf flag is true"          "true"   "$diana_dnf_flag"
  check "Charlie — DNF Test — 3:50 (230000ms) unaffected" "230000" "$charlie_dnf_time"
  check "Charlie — DNF Test — dnf flag is false"         "false"  "$charlie_dnf_flag"
fi

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
