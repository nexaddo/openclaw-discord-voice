#!/bin/bash
set -euo pipefail

# Rollback script for Discord Voice Integration - Production-Ready Version
# Uses Docker image tags for true container image rollback with health checks
# Usage: ./scripts/rollback.sh [dev|staging|production]

ENVIRONMENT="${1:-staging}"
ROLLBACK_IMAGE_FILE=".rollback-image"
HEALTH_CHECK_TIMEOUT=30
HEALTH_CHECK_RETRIES=5
HEALTH_CHECK_DELAY=2

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

##############################################################################
# Logging functions
##############################################################################

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

##############################################################################
# Image tag management functions
##############################################################################

# Store current image SHA before any operation
store_image_sha() {
  local current_sha=$1
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  if [[ -f "$ROLLBACK_IMAGE_FILE" ]]; then
    # Rotate: current becomes previous
    local previous_sha=$(jq -r '.current' "$ROLLBACK_IMAGE_FILE" 2>/dev/null || echo "null")
    cat > "$ROLLBACK_IMAGE_FILE" <<EOF
{
  "current": "$current_sha",
  "previous": "$previous_sha",
  "timestamp": "$timestamp"
}
EOF
  else
    # First time initialization
    cat > "$ROLLBACK_IMAGE_FILE" <<EOF
{
  "current": "$current_sha",
  "previous": null,
  "timestamp": "$timestamp"
}
EOF
  fi

  log_info "Stored image SHA: current=$current_sha"
}

# Get stored previous image SHA
get_previous_image_sha() {
  if [[ ! -f "$ROLLBACK_IMAGE_FILE" ]]; then
    return 1
  fi

  jq -r '.previous // empty' "$ROLLBACK_IMAGE_FILE" 2>/dev/null || return 1
}

# Get current image SHA
get_current_image_sha() {
  if [[ ! -f "$ROLLBACK_IMAGE_FILE" ]]; then
    return 1
  fi

  jq -r '.current // empty' "$ROLLBACK_IMAGE_FILE" 2>/dev/null || return 1
}

##############################################################################
# Git SHA validation (Fix 1b: Command Injection Prevention)
##############################################################################

# Validate git SHA format - prevents command injection
# Valid formats:
#  - Full SHA: 40 hex characters (sha1)
#  - Short SHA: 7-12 hex characters
#  - HEAD reference
validate_git_sha() {
  local sha=$1

  # Full SHA (40 hex chars)
  if [[ $sha =~ ^[a-f0-9]{40}$ ]]; then
    return 0
  fi

  # Short SHA (7-12 hex chars)
  if [[ $sha =~ ^[a-f0-9]{7,12}$ ]]; then
    return 0
  fi

  # HEAD reference
  if [[ "$sha" == "HEAD" ]]; then
    return 0
  fi

  # Invalid format - reject to prevent injection
  return 1
}

##############################################################################
# Health check functions
##############################################################################

# Perform health check on the service
health_check() {
  local service_url="http://localhost:3000/health"
  local attempt=1

  while [[ $attempt -le $HEALTH_CHECK_RETRIES ]]; do
    log_info "Health check attempt $attempt/$HEALTH_CHECK_RETRIES..."

    if curl -sf "$service_url" > /dev/null 2>&1; then
      local response=$(curl -s "$service_url")
      local status=$(echo "$response" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")

      if [[ "$status" == "healthy" ]]; then
        log_info "Health check PASSED - service is healthy"
        return 0
      else
        log_warn "Service status is $status (not healthy)"
      fi
    else
      log_warn "Health check endpoint unreachable (attempt $attempt/$HEALTH_CHECK_RETRIES)"
    fi

    if [[ $attempt -lt $HEALTH_CHECK_RETRIES ]]; then
      sleep "$HEALTH_CHECK_DELAY"
    fi

    ((attempt++))
  done

  log_error "Health check FAILED after $HEALTH_CHECK_RETRIES attempts"
  return 1
}

##############################################################################
# Timeout handling
##############################################################################

# Execute command with timeout
run_with_timeout() {
  local timeout_sec=$1
  shift
  local cmd=("$@")

  # Use timeout command with grace period
  timeout "$timeout_sec" "${cmd[@]}" &
  local pid=$!

  # Wait for process
  if wait $pid 2>/dev/null; then
    return 0
  else
    local exit_code=$?
    if [[ $exit_code -eq 124 ]]; then
      log_error "Command timed out after ${timeout_sec}s: ${cmd[*]}"
      return 124
    fi
    return $exit_code
  fi
}

##############################################################################
# Rollback execution
##############################################################################

# Perform the actual rollback
perform_rollback() {
  log_info "Starting rollback for environment: $ENVIRONMENT"

  # Get previous image
  local previous_sha
  if ! previous_sha=$(get_previous_image_sha); then
    log_error "No previous image available for rollback"
    return 1
  fi

  log_info "Rolling back to image: $previous_sha"

  # Validate SHA format (security check for Fix 1b)
  if ! validate_git_sha "$previous_sha"; then
    log_error "Invalid SHA format detected: $previous_sha (possible corruption or attack)"
    return 1
  fi

  local current_sha
  if ! current_sha=$(get_current_image_sha); then
    log_error "Could not retrieve current image SHA"
    return 1
  fi

  log_info "Current image: $current_sha"
  log_info "Previous image: $previous_sha"

  # Stop the running container
  log_info "Stopping container..."
  if ! docker stop discord-voice-app 2>/dev/null; then
    log_warn "Container was not running or already stopped"
  fi

  # Remove current image tag
  log_info "Removing current image tag..."
  if ! docker rmi discord-voice:current 2>/dev/null; then
    log_warn "Current image tag not found or couldn't be removed"
  fi

  # Restore previous image tag
  log_info "Restoring previous image tag..."
  if ! docker tag "${previous_sha}" discord-voice:current 2>/dev/null; then
    log_error "Failed to restore previous image tag"
    return 1
  fi

  # Start container with restored image
  log_info "Starting container with restored image..."
  if ! docker run -d --name discord-voice-app --restart unless-stopped "discord-voice:current" 2>/dev/null; then
    log_error "Failed to start container with restored image"
    return 1
  fi

  # Wait a moment for container to start
  sleep 2

  # Update rollback state: swap current and previous
  cat > "$ROLLBACK_IMAGE_FILE" <<EOF
{
  "current": "$previous_sha",
  "previous": "$current_sha",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

  return 0
}

##############################################################################
# Main rollback flow
##############################################################################

main() {
  log_info "⏮️  Rolling back ${ENVIRONMENT}..."

  # Start timer for timeout
  local start_time=$(date +%s)
  local rollback_start=$start_time

  # Perform rollback with timeout handling
  if ! run_with_timeout $HEALTH_CHECK_TIMEOUT perform_rollback; then
    log_error "Rollback failed or timed out"
    return 1
  fi

  local rollback_duration=$(($(date +%s) - rollback_start))
  log_info "Rollback execution completed in ${rollback_duration}s"

  # Verify rollback succeeded with health checks
  log_info "🏥 Verifying rollback with health checks..."
  if ! run_with_timeout $HEALTH_CHECK_TIMEOUT health_check; then
    log_error "Health check verification failed - rollback may have failed"
    return 1
  fi

  local total_duration=$(($(date +%s) - start_time))
  log_info "✅ Rollback complete! Total time: ${total_duration}s"
  return 0
}

# Run main function
if main; then
  exit 0
else
  exit 1
fi
