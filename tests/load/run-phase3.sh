#!/bin/bash
# Phase 3: Load Test Execution
# Run tests sequentially with baseline → medium → stress → breakpoint progression

set -e

AUTH_TOKEN="${AUTH_TOKEN:-}"
BASE_URL="${BASE_URL:-http://localhost:5000}"
TEST_SEQUENCE_ID="${TEST_SEQUENCE_ID:-}"
PROSPECT_IDS="${PROSPECT_IDS:-}"
RESULTS_FILE="tests/load/results.md"

if [ -z "$AUTH_TOKEN" ]; then
  echo "ERROR: AUTH_TOKEN not set"
  exit 1
fi

# Create results file header
cat > "$RESULTS_FILE" << EOF
# Load Test Results - Phase 3

**Date**: $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Environment**: Development
**Database**: PostgreSQL (Neon)

## Test Configuration
- Base URL: $BASE_URL
- Sequence ID: ${TEST_SEQUENCE_ID:-"N/A"}
- Prospect IDs: ${PROSPECT_IDS:-"N/A"}

## Results

| Test | Config | Req/s | p50 (ms) | p95 (ms) | p99 (ms) | Errors | 2xx | Non-2xx | Status |
|------|--------|-------|----------|----------|----------|--------|-----|---------|--------|
EOF

echo "Starting Phase 3 Load Tests..."

run_test() {
  local test_num=$1
  local test_name=$2
  local config=$3
  
  echo ""
  echo "========================================"
  echo "Running: $test_name ($config)"
  echo "========================================"
  
  # Run the test and capture output
  node tests/load/${test_num}*.js $config 2>&1 || true
  echo ""
}

# Tests that work without fixtures
echo ""
echo "=== Testing API endpoints that don't require fixtures ==="

for config in baseline medium stress; do
  run_test "08" "Analytics" $config
done

for config in baseline medium stress; do
  run_test "03" "Sequence Creation" $config
done

for config in baseline medium; do
  run_test "07" "Reply List" $config
done

echo ""
echo "=== Tests requiring fixtures (TEST_SEQUENCE_ID, PROSPECT_IDS) ==="

if [ -n "$TEST_SEQUENCE_ID" ]; then
  for config in baseline medium; do
    run_test "04" "Prospect Enrollment" $config
  done
else
  echo "SKIPPED: Prospect Enrollment (TEST_SEQUENCE_ID not set)"
fi

if [ -n "$PROSPECT_IDS" ]; then
  for config in baseline; do
    run_test "02" "AI Enrichment" $config
  done
else
  echo "SKIPPED: AI Enrichment (PROSPECT_IDS not set)"
fi

echo ""
echo "Phase 3 Load Tests Complete"
echo "Results: $RESULTS_FILE"
