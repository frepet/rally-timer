#!/usr/bin/env bash
# E2E "glue" tests for rally-timer: verifies that seeded data flows through the
# API and the domain layer into correctly-shaped responses.
#
# This suite intentionally does NOT re-assert exact elapsed times, championship
# points, or penalty arithmetic. That logic lives in the domain layer and is
# covered exhaustively by the vitest suites in src/lib/domain/*.test.ts
# (rallySubmission, stage, timing, scoring, championshipRanking, standings,
# dnfPenalties, ...). Pinning the same numbers here only duplicated those tests
# and made the e2e suite brittle to legitimate domain/TDD changes. Instead we
# assert the wiring: endpoints resolve, relations join, the domain is invoked,
# DNF/penalty/close paths run, and results serialize with the right shape and
# the expected drivers present.
#
# Run after seed.sh against the same BASE_URL.
#
# Usage:   ./verify.sh [BASE_URL]   (default http://localhost:5173)
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

# Championship → rally relations resolve through the API (glue, not math).
check "Nordic has 3 rallies"       "3" "$(echo "$nordic_detail"   | jq '.rallies | length')"
check "Regional Cup has 2 rallies" "2" "$(echo "$regional_detail" | jq '.rallies | length')"

# A rally may belong to more than one championship.
finland_in_regional=$(echo "$regional_detail" | jq -r '.rallies[] | select(.name == "Rally Finland 2024") | .name')
check "Rally Finland 2024 is in Regional Cup" "Rally Finland 2024" "$finland_in_regional"

# ---------------------------------------------------------------------------
echo ""
echo "── Submitted Rally Results — shape and wiring ──────────────────────────"

finland_id=$(echo "$nordic_detail" | jq -r '.rallies[] | select(.name == "Rally Finland 2024") | .id')
norway_id=$(echo "$nordic_detail"  | jq -r '.rallies[] | select(.name == "Rally Norway 2025")  | .id')

if [[ -z "$finland_id" || -z "$norway_id" ]]; then
  echo "ERROR: Submitted rallies not found. Did you run seed.sh first?"
  exit 1
fi

finland=$(get /api/submitted-rally/"$finland_id")
norway=$(get /api/submitted-rally/"$norway_id")

# The domain produced results, they serialize, and elapsed_ms is a number.
check "Finland returns results"              "true" "$( [[ "$(echo "$finland" | jq '.results | length')" -gt 0 ]] && echo true || echo false )"
check "Finland result has numeric elapsed_ms" "number" "$(echo "$finland" | jq -r '.results[0].elapsed_ms | type')"
check "Finland includes seeded driver Charlie" "true" \
  "$(echo "$finland" | jq '[.results[].driver_name] | any(. == "Charlie Svensson")')"

# Multi-stage rally: results span both seeded stages (aggregation wiring).
check "Norway has results across 2 stages" "2" \
  "$(echo "$norway" | jq '[.results[].stage_name] | unique | length')"

# ---------------------------------------------------------------------------
echo ""
echo "── Championship Standings — shape and wiring ───────────────────────────"

nordic_standings=$(get /api/championship/"$nordic_id"/standings)

# Inverse-points correctness is unit-tested; here we only confirm standings are
# computed for every seeded driver and carry a per-rally breakdown.
check "Nordic standings lists all 4 drivers" "4" "$(echo "$nordic_standings" | jq 'length')"
check "standings total_points is numeric"    "number" "$(echo "$nordic_standings" | jq -r '.[0].total_points | type')"
check "standings carry a rally_points breakdown" "true" \
  "$(echo "$nordic_standings" | jq 'any(.[]; (.rally_points | length) > 0)')"

# ---------------------------------------------------------------------------
echo ""
echo "── DNF handling — flags wired end-to-end ───────────────────────────────"

# Exact penalty arithmetic (slowest + 30s) is covered by dnfPenalties.test.ts.
# Here we only confirm the DNF path runs: flags are set and a numeric penalty
# time is produced for the DNF'd driver.
dnf_rally_id=$(echo "$regional_detail" | jq -r '.rallies[] | select(.name == "Rally DNF Test") | .id')

if [[ -z "$dnf_rally_id" ]]; then
  echo "  ERROR: Rally DNF Test not found. Did you run seed.sh?"
  ((fail++)) || true
else
  dnf_rally=$(get /api/submitted-rally/"$dnf_rally_id")

  diana=$(echo "$dnf_rally" | jq -c '.results[] | select(.driver_name == "Diana Dahl"      and .stage_name == "SS1 - DNF Test")')
  alice=$(echo "$dnf_rally" | jq -c '.results[] | select(.driver_name == "Alice Andersson" and .stage_name == "SS1 - DNF Test")')

  check "Diana — DNF flag is true"            "true"   "$(echo "$diana" | jq '.dnf')"
  check "Diana — has a numeric penalty time"  "number" "$(echo "$diana" | jq -r '.elapsed_ms | type')"
  check "Alice — finished, DNF flag is false" "false"  "$(echo "$alice" | jq '.dnf')"
fi

# ---------------------------------------------------------------------------
echo ""
echo "── Manual Penalty — applied and serialized ─────────────────────────────"

penalty_champ_id=$(get /api/championship | jq -r '.[] | select(.name == "Penalty Cup") | .id')

if [[ -z "$penalty_champ_id" ]]; then
  echo "  ERROR: Penalty Cup not found. Did you run seed.sh first?"
  ((fail++)) || true
else
  penalty_champ_detail=$(get /api/championship/"$penalty_champ_id")
  penalty_rally_id=$(echo "$penalty_champ_detail" | jq -r '.rallies[] | select(.name == "Rally Penalty Test") | .id')
  penalty_rally=$(get /api/submitted-rally/"$penalty_rally_id")

  # A manually-entered penalty flows into the computed result (exact ms is
  # domain-tested). Assert both drivers are present with numeric times.
  check "Penalty rally returns both drivers" "2" \
    "$(echo "$penalty_rally" | jq '[.results[] | select(.stage_name == "SS1 - Penalty Test")] | length')"
  check "Penalized driver has numeric elapsed_ms" "number" \
    "$(echo "$penalty_rally" | jq -r '.results[] | select(.driver_name == "Alice Andersson" and .stage_name == "SS1 - Penalty Test") | .elapsed_ms | type')"
fi

# ---------------------------------------------------------------------------
echo ""
echo "── Stage Status (is_closed) ────────────────────────────────────────────"

bundle=$(get /api/bundle)

dnf_stage_closed=$(echo "$bundle" | jq -r '.stages[] | select(.name == "SS1 - DNF Test") | .is_closed')
check "SS1 - DNF Test is_closed=true after close API call" "true" "$dnf_stage_closed"

open_stage_closed=$(echo "$bundle" | jq -r '.stages[] | select(.name == "SS1 - Status Check (open)") | .is_closed')
check "SS1 - Status Check (open) is_closed=false (never closed)" "false" "$open_stage_closed"

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
