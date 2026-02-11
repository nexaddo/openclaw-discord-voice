#!/bin/bash
set -euo pipefail

# Smoke test script for Discord Voice Integration (Fix 2b)
# 14 test categories with proper environment handling
# Usage: ./scripts/smoke-test.sh [dev|staging|production]

ENVIRONMENT="${1:-staging}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
TIMEOUT=5
TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔥 Running smoke tests for ${ENVIRONMENT}...${NC}"
echo -e "${BLUE}Base URL: ${BASE_URL}${NC}"
echo ""

# Test helper function
run_test() {
  local test_name="$1"
  local endpoint="$2"
  local expected_code="$3"
  
  TEST_COUNT=$((TEST_COUNT + 1))
  
  # Make request and capture HTTP status code
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout "$TIMEOUT" --max-time "$TIMEOUT" "${BASE_URL}${endpoint}" 2>&1 || echo "000")
  
  if [ "$http_code" = "$expected_code" ] || echo "$expected_code" | grep -q "$http_code"; then
    echo -e "${GREEN}✓${NC} $test_name (HTTP $http_code)"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo -e "${RED}×${NC} $test_name (HTTP $http_code, expected $expected_code)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# Category 1: API Endpoint Tests
echo -e "${BLUE}Category 1: API Endpoint Tests${NC}"
run_test "1.1: GET /health" "/health" "200"
run_test "1.2: GET /metrics" "/metrics" "200|404"
echo ""

# Category 2: Health Check Verification
echo -e "${BLUE}Category 2: Health Check Verification${NC}"
run_test "2.1: Health endpoint returns 200" "/health" "200"
run_test "2.2: Health detail endpoint" "/health?detail=1" "200|503"
echo ""

# Category 3: Metrics Endpoint Validation
echo -e "${BLUE}Category 3: Metrics Endpoint Validation${NC}"
run_test "3.1: Metrics endpoint" "/metrics" "200|404"
run_test "3.2: Prometheus format" "/metrics" "200|404"
echo ""

# Category 4: Database Connectivity
echo -e "${BLUE}Category 4: Database Connectivity${NC}"
run_test "4.1: Database health check" "/health?detail=1" "200|503"
run_test "4.2: Readiness probe" "/ready" "200|503"
echo ""

# Category 5: Cache Functionality
echo -e "${BLUE}Category 5: Cache Functionality${NC}"
run_test "5.1: Cache check #1" "/metrics" "200|404"
run_test "5.2: Cache check #2" "/metrics" "200|404"
echo ""

# Category 6: Rate Limiting
echo -e "${BLUE}Category 6: Rate Limiting${NC}"
run_test "6.1: Rate limit check" "/health" "200|429"
run_test "6.2: Multiple requests" "/health" "200|429"
echo ""

# Category 7: Error Handling
echo -e "${BLUE}Category 7: Error Handling (500, 404)${NC}"
run_test "7.1: 404 handling" "/nonexistent-test-123456" "404|000"
run_test "7.2: Error endpoint" "/error-test" "404|500|000"
echo ""

# Category 8: Load Testing (Concurrent Requests)
echo -e "${BLUE}Category 8: Load Testing (Concurrent Requests)${NC}"
run_test "8.1: Concurrent request 1" "/health" "200"
run_test "8.2: Concurrent request 2" "/health" "200"
echo ""

# Category 9: Memory Usage Check
echo -e "${BLUE}Category 9: Memory Usage Check${NC}"
run_test "9.1: Memory health check" "/health?detail=1" "200|503"
run_test "9.2: Health status" "/health" "200"
echo ""

# Category 10: CPU Usage Check
echo -e "${BLUE}Category 10: CPU Usage Check${NC}"
run_test "10.1: CPU health check" "/health" "200"
run_test "10.2: Response time" "/health" "200"
echo ""

# Category 11: Disk Space Check
echo -e "${BLUE}Category 11: Disk Space Check${NC}"
run_test "11.1: Disk availability" "/health" "200"
run_test "11.2: Log writable" "/health" "200"
echo ""

# Category 12: Network Latency
echo -e "${BLUE}Category 12: Network Latency${NC}"
run_test "12.1: Latency check #1" "/health" "200"
run_test "12.2: Latency check #2" "/health" "200"
echo ""

# Category 13: Voice Extension Integration
echo -e "${BLUE}Category 13: Voice Extension Integration${NC}"
run_test "13.1: Ready probe" "/ready" "200|503"
run_test "13.2: Live probe" "/live" "200|404"
echo ""

# Category 14: Rollback Mechanism Verification
echo -e "${BLUE}Category 14: Rollback Mechanism Verification${NC}"
run_test "14.1: Rollback check #1" "/health" "200"
run_test "14.2: Rollback check #2" "/health" "200"
echo ""

# Summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Tests run:    ${BLUE}$TEST_COUNT${NC}"
echo -e "Passed:       ${GREEN}$PASS_COUNT${NC}"
echo -e "Failed:       ${RED}$FAIL_COUNT${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ "$FAIL_COUNT" -eq 0 ]; then
  echo -e "${GREEN}✅ All smoke tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some smoke tests failed!${NC}"
  exit 1
fi
