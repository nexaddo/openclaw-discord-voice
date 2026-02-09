#!/bin/bash
set -euo pipefail

# Deployment script for Discord Voice Integration
# Usage: ./scripts/deploy.sh [dev|staging|production]

ENVIRONMENT="${1:-staging}"
REGISTRY="ghcr.io/nexaddo"
IMAGE_NAME="openclaw-discord-voice"
GIT_SHA=$(git rev-parse --short HEAD)
IMAGE_TAG="${REGISTRY}/${IMAGE_NAME}:${GIT_SHA}"
LATEST_TAG="${REGISTRY}/${IMAGE_NAME}:latest-${ENVIRONMENT}"

echo "🚀 Deploying to ${ENVIRONMENT}..."

# Pre-checks
echo "✓ Checking Node.js version..."
node --version

echo "✓ Checking Docker..."
docker --version

echo "✓ Checking git status..."
git status

# Run linting
echo "🔍 Running ESLint..."
npm run lint || exit 1

# Run tests
echo "🧪 Running tests..."
npm test || exit 1

# Generate coverage
echo "📊 Generating coverage report..."
npm run test:coverage || true

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build || exit 1

# Build Docker image
echo "🐳 Building Docker image: ${IMAGE_TAG}"
docker build -t "${IMAGE_TAG}" -t "${LATEST_TAG}" . || exit 1

# Verify image size
IMAGE_SIZE=$(docker inspect --format='{{.Size}}' "${IMAGE_TAG}" | awk '{printf "%.1f", $1/1024/1024}')
echo "📦 Image size: ${IMAGE_SIZE} MB"

if (( $(echo "${IMAGE_SIZE} > 200" | bc -l) )); then
  echo "⚠️ WARNING: Image size exceeds 200MB target (${IMAGE_SIZE} MB)"
fi

# Run smoke tests
echo "🔥 Running smoke tests..."
./scripts/smoke-test.sh "${ENVIRONMENT}" || exit 1

# Push to registry (commented out for safety)
# echo "📤 Pushing to registry..."
# docker push "${IMAGE_TAG}"
# docker push "${LATEST_TAG}"

echo "✅ Deployment preparation complete!"
echo "Image: ${IMAGE_TAG}"
echo "Environment: ${ENVIRONMENT}"
