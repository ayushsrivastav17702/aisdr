#!/bin/bash
#
# Run All Load Tests
#
# Usage:
#   ./run-all.sh                     # Run all with baseline config
#   ./run-all.sh medium              # Run all with medium config
#   ./run-all.sh stress              # Run all with stress config
#   ./run-all.sh breakpoint          # Run all with breakpoint config
#
# Prerequisites:
#   1. Set AUTH_COOKIE env var with valid session cookie
#   2. Set BASE_URL if not localhost:5000
#   3. For enrollment test, set TEST_SEQUENCE_ID
#

CONFIG=${1:-baseline}
BASE_URL=${BASE_URL:-http://localhost:5000}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           LOAD TEST SUITE - USER ROLE CAPACITY               ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Config:   $CONFIG"
echo "║  Base URL: $BASE_URL"
echo "║  Time:     $(date)"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if AUTH_COOKIE is set
if [ -z "$AUTH_COOKIE" ]; then
  echo "⚠️  Warning: AUTH_COOKIE not set. Tests may fail with 401."
  echo "   Set it with: export AUTH_COOKIE='connect.sid=...'"
  echo ""
fi

# Results array
declare -A RESULTS

run_test() {
  local num=$1
  local name=$2
  local script=$3
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  TEST $num: $name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  node "$script" "$CONFIG"
  
  if [ $? -eq 0 ]; then
    RESULTS[$name]="✅ PASS"
  else
    RESULTS[$name]="❌ FAIL"
  fi
}

# Run each test
run_test 1 "Prospect Upload" "01-prospect-upload.js"
run_test 2 "AI Enrichment" "02-ai-enrichment.js"
run_test 3 "Sequence Creation" "03-sequence-creation.js"
run_test 4 "Prospect Enrollment" "04-prospect-enrollment.js"
run_test 5 "Email Send Queue" "05-email-send.js"
run_test 6 "AI Personalization" "06-ai-personalization.js"
run_test 7 "Reply Capture" "07-reply-capture.js"
run_test 8 "Analytics Dashboard" "08-analytics.js"

# Summary
echo ""
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    LOAD TEST SUMMARY                         ║"
echo "╠══════════════════════════════════════════════════════════════╣"
for test in "${!RESULTS[@]}"; do
  printf "║  %-30s %s\n" "$test" "${RESULTS[$test]}"
done
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Completed at: $(date)"
