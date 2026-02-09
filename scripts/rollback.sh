#!/bin/bash
set -euo pipefail

# Rollback script for Discord Voice Integration
# Usage: ./scripts/rollback.sh [dev|staging|production]

ENVIRONMENT="${1:-staging}"

echo "⏮️  Rolling back ${ENVIRONMENT}..."

# Find previous version
PREVIOUS_VERSION=$(git log --oneline -2 | tail -1 | awk '{print $1}')

if [ -z "$PREVIOUS_VERSION" ]; then
  echo "❌ No previous version found"
  exit 1
fi

echo "📍 Rolling back to: ${PREVIOUS_VERSION}"

# Checkout previous version
git checkout "${PREVIOUS_VERSION}" -- . || exit 1

# Rebuild and restart
echo "🔨 Rebuilding..."
npm ci
npm run build

# Health check
echo "🏥 Verifying health..."
for i in {1..5}; do
  if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Health check passed"
    break
  fi
  echo "⏳ Waiting for service to be ready... ($i/5)"
  sleep 2
done

echo "✅ Rollback complete!"
