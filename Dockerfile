# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /build

# Install build dependencies
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --only=production && npm run build

# Fix 2d: Validate dist/ directory was created successfully
RUN if [ ! -d dist ]; then \
      echo "ERROR: dist/ directory not found after build" && \
      exit 1; \
    fi && \
    echo "✓ dist/ directory found" && \
    FILE_COUNT=$(find dist -type f | wc -l) && \
    echo "✓ dist/ contains $FILE_COUNT files" && \
    if [ "$FILE_COUNT" -lt 5 ]; then \
      echo "ERROR: dist/ directory appears to be empty or incomplete" && \
      exit 1; \
    fi && \
    JS_COUNT=$(find dist -name "*.js" | wc -l) && \
    echo "✓ dist/ contains $JS_COUNT JavaScript files"

# Stage 2: Runtime
FROM node:18-alpine
WORKDIR /app

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy build artifacts
COPY --from=builder --chown=nodejs:nodejs /build/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /build/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /build/package*.json ./

USER nodejs

EXPOSE 3000 9090

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "dist/index.js"]
