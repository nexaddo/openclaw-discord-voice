#!/bin/bash
set -euo pipefail

# Deployment script for Discord Voice Integration
# Usage: ./scripts/deploy.sh [dev|staging|production]
# Fix 2c: Port validation added
# Fix 2f: Cross-platform date fixes

ENVIRONMENT="${1:-staging}"
REGISTRY="ghcr.io/nexaddo"
IMAGE_NAME="openclaw-discord-voice"
DEPLOY_PORT="${DEPLOY_PORT:-3000}"
GIT_SHA=$(git rev-parse --short HEAD)
IMAGE_TAG="${REGISTRY}/${IMAGE_NAME}:${GIT_SHA}"
LATEST_TAG="${REGISTRY}/${IMAGE_NAME}:latest-${ENVIRONMENT}"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Cross-platform date function (Fix 2f)
get_timestamp() {
  # Use date +%s for portable seconds-only timestamp
  date +%s
}

# Portable date formatting
get_date_iso() {
  if command -v gdate &> /dev/null; then
    gdate -Iseconds
  else
    date -u +'%Y-%m-%dT%H:%M:%SZ'
  fi
}

echo -e "${BLUE}🚀 Deploying to ${ENVIRONMENT}...${NC}"
echo "Deployment started at: $(get_date_iso)"

# Pre-checks
echo -e "${BLUE}✓ Checking Node.js version...${NC}"
node --version

echo -e "${BLUE}✓ Checking Docker...${NC}"
docker --version

echo -e "${BLUE}✓ Checking git status...${NC}"
git status

# Fix 2c: Port Validation
echo -e "${BLUE}✓ Validating port ${DEPLOY_PORT}...${NC}"
validate_port() {
  local port="$1"
  
  # Check if port is numeric
  if ! [[ "$port" =~ ^[0-9]+$ ]]; then
    echo -e "${RED}✗ Invalid port: not numeric${NC}"
    return 1
  fi
  
  # Check if port is in valid range (1024-65535)
  if [ "$port" -lt 1024 ] || [ "$port" -gt 65535 ]; then
    echo -e "${RED}✗ Invalid port: must be between 1024 and 65535${NC}"
    return 1
  fi
  
  return 0
}

if ! validate_port "$DEPLOY_PORT"; then
  exit 1
fi

# Check if port is in use
check_port_in_use() {
  local port="$1"
  
  # Try to open connection to port (works on macOS and Linux)
  if timeout 1 bash -c "echo > /dev/tcp/127.0.0.1/$port" 2>/dev/null; then
    return 0  # Port in use
  else
    return 1  # Port available
  fi
}

if check_port_in_use "$DEPLOY_PORT"; then
  echo -e "${YELLOW}⚠ Port ${DEPLOY_PORT} is already in use${NC}"
  
  # Try to identify the process (macOS and Linux compatible)
  if command -v lsof &> /dev/null; then
    echo -e "${YELLOW}Process using port ${DEPLOY_PORT}:${NC}"
    lsof -i ":${DEPLOY_PORT}" || true
  elif command -v netstat &> /dev/null; then
    echo -e "${YELLOW}Port ${DEPLOY_PORT} is in use:${NC}"
    netstat -tlnp 2>/dev/null | grep ":${DEPLOY_PORT}" || true
  fi
  
  # Offer to use alternate port
  ALTERNATE_PORT=$((DEPLOY_PORT + 1))
  echo -e "${YELLOW}Would you like to use port ${ALTERNATE_PORT} instead? (y/n)${NC}"
  read -r response
  if [[ "$response" == "y" ]]; then
    DEPLOY_PORT=$ALTERNATE_PORT
    echo -e "${GREEN}Using alternate port: ${DEPLOY_PORT}${NC}"
  else
    echo -e "${RED}Deployment aborted: port ${DEPLOY_PORT} in use${NC}"
    exit 1
  fi
fi

echo -e "${GREEN}✓ Port ${DEPLOY_PORT} is available${NC}"

# Run linting
echo -e "${BLUE}🔍 Running ESLint...${NC}"
npm run lint || exit 1

# Run tests
echo -e "${BLUE}🧪 Running tests...${NC}"
npm test || exit 1

# Generate coverage
echo -e "${BLUE}📊 Generating coverage report...${NC}"
npm run test:coverage || true

# Build TypeScript
echo -e "${BLUE}🔨 Building TypeScript...${NC}"
npm run build || exit 1

# Build Docker image
echo -e "${BLUE}🐳 Building Docker image: ${IMAGE_TAG}${NC}"
docker build -t "${IMAGE_TAG}" -t "${LATEST_TAG}" . || exit 1

# Verify image size
IMAGE_SIZE=$(docker inspect --format='{{.Size}}' "${IMAGE_TAG}" | awk '{printf "%.1f", $1/1024/1024}')
echo -e "${BLUE}📦 Image size: ${IMAGE_SIZE} MB${NC}"

if (( $(echo "${IMAGE_SIZE} > 200" | bc -l) )); then
  echo -e "${YELLOW}⚠ WARNING: Image size exceeds 200MB target (${IMAGE_SIZE} MB)${NC}"
fi

# Run smoke tests
echo -e "${BLUE}🔥 Running smoke tests...${NC}"
./scripts/smoke-test.sh "${ENVIRONMENT}" || exit 1

# Push to registry (commented out for safety)
# echo -e "${BLUE}📤 Pushing to registry...${NC}"
# docker push "${IMAGE_TAG}"
# docker push "${LATEST_TAG}"

echo -e "${GREEN}✅ Deployment preparation complete!${NC}"
echo "Image: ${IMAGE_TAG}"
echo "Environment: ${ENVIRONMENT}"
echo "Deployment completed at: $(get_date_iso)"
