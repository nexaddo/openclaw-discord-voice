#!/bin/bash
# Lightweight Health Check Script (Fix 2a)
# Uses curl-based health endpoint checking
# - Minimal HTTP response parsing
# - 5-second timeout
# - Status code only (no JSON parsing)
# - Connection error handling
# - Logging of results

set -euo pipefail

# Configuration
HEALTH_CHECK_URL="${1:-http://localhost:3000/health}"
TIMEOUT=5
RETRY_COUNT=3
RETRY_DELAY=1

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}[HEALTH CHECK]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[HEALTH CHECK]${NC} $1"
}

log_error() {
  echo -e "${RED}[HEALTH CHECK]${NC} $1"
}

# Health check with retry logic
check_health() {
  local url="$1"
  local timeout="$2"
  local retry_count="$3"
  local retry_delay="$4"
  
  for attempt in $(seq 1 "$retry_count"); do
    log_info "Checking health endpoint: $url (attempt $attempt/$retry_count)"
    
    # Use curl to get HTTP status code only
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout "$timeout" --max-time "$timeout" "$url" 2>&1 || echo "000")
    
    # Log the response code
    log_info "HTTP Status Code: $http_code"
    
    # Check if response is 200 (OK)
    if [ "$http_code" = "200" ]; then
      log_info "Health check PASSED (HTTP 200)"
      return 0
    elif [ "$http_code" = "000" ]; then
      log_error "Connection failed (timeout or refused)"
    else
      log_warn "Unexpected status code: $http_code"
    fi
    
    # Retry after delay
    if [ "$attempt" -lt "$retry_count" ]; then
      log_info "Retrying in ${retry_delay}s..."
      sleep "$retry_delay"
    fi
  done
  
  log_error "Health check FAILED after $retry_count attempts"
  return 1
}

# Parse arguments
if [ $# -lt 1 ]; then
  log_info "Usage: $0 <health-check-url> [timeout] [retry-count]"
  exit 0
fi

if [ $# -ge 2 ]; then
  TIMEOUT="$2"
fi

if [ $# -ge 3 ]; then
  RETRY_COUNT="$3"
fi

# Run health check
log_info "Starting health check"
log_info "URL: $HEALTH_CHECK_URL"
log_info "Timeout: ${TIMEOUT}s"
log_info "Retry count: $RETRY_COUNT"

if check_health "$HEALTH_CHECK_URL" "$TIMEOUT" "$RETRY_COUNT" "$RETRY_DELAY"; then
  log_info "Health check completed successfully"
  exit 0
else
  log_error "Health check failed"
  exit 1
fi
