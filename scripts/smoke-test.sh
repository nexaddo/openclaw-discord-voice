#!/bin/bash
set -euo pipefail

# Smoke test script for Discord Voice Integration
# Usage: ./scripts/smoke-test.sh [dev|staging|production]

ENVIRONMENT="${1:-staging}"
BASE_URL="http://localhost:3000"
TIMEOUT=5

echo "🔥 Running smoke tests for ${ENVIRONMENT}..."

# Test 1: Health check endpoint
echo "Test 1: GET /health"
RESPONSE=$(curl -s -w "\n%{http_code}" -m ${TIMEOUT} "${BASE_URL}/health")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Health check passed (HTTP 200)"
else
  echo "❌ Health check failed (HTTP $HTTP_CODE)"
  exit 1
fi

# Test 2: Metrics endpoint
echo "Test 2: GET /metrics"
RESPONSE=$(curl -s -w "\n%{http_code}" -m ${TIMEOUT} "${BASE_URL}/metrics")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Metrics endpoint passed (HTTP 200)"
else
  echo "❌ Metrics endpoint failed (HTTP $HTTP_CODE)"
  exit 1
fi

# Test 3: Ready probe
echo "Test 3: GET /ready"
RESPONSE=$(curl -s -w "\n%{http_code}" -m ${TIMEOUT} "${BASE_URL}/ready")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "503" ]; then
  echo "✅ Ready probe passed (HTTP $HTTP_CODE)"
else
  echo "❌ Ready probe failed (HTTP $HTTP_CODE)"
  exit 1
fi

# Test 4: Live probe
echo "Test 4: GET /live"
RESPONSE=$(curl -s -w "\n%{http_code}" -m ${TIMEOUT} "${BASE_URL}/live")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Live probe passed (HTTP 200)"
else
  echo "❌ Live probe failed (HTTP $HTTP_CODE)"
  exit 1
fi

# Test 5: Prometheus metrics format
echo "Test 5: Metrics format validation"
METRICS=$(curl -s "${BASE_URL}/metrics")
if echo "$METRICS" | grep -q "# HELP\|# TYPE\|discord_voice\|pipeline_active"; then
  echo "✅ Prometheus format valid"
else
  echo "❌ Metrics format invalid"
  exit 1
fi

# Test 6: Response time check
echo "Test 6: Response time validation"
START=$(date +%s%N | cut -b1-13)
curl -s "${BASE_URL}/health" > /dev/null
END=$(date +%s%N | cut -b1-13)
RESPONSE_TIME=$((END - START))
if [ $RESPONSE_TIME -lt 100 ]; then
  echo "✅ Response time acceptable (${RESPONSE_TIME}ms)"
else
  echo "⚠️  Response time high (${RESPONSE_TIME}ms)"
fi

echo ""
echo "✅ All smoke tests passed!"
