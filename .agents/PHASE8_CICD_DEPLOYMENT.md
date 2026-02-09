# Phase 8: CI/CD & Deployment Pipeline - Detailed Design

**Date:** 2026-02-06 21:25 EST  
**Phase:** 8 (Final)  
**Duration:** 1-2 working days  
**Status:** Design Complete - Ready for Implementation

---

## Table of Contents

1. [Overview](#overview)
2. [GitHub Actions Workflows](#github-actions-workflows)
3. [Discord Bot Setup](#discord-bot-setup)
4. [Deployment Architecture](#deployment-architecture)
5. [Environment & Secrets Management](#environment--secrets-management)
6. [Automated Versioning & Releases](#automated-versioning--releases)
7. [Production Deployment Checklist](#production-deployment-checklist)
8. [Monitoring & Observability](#monitoring--observability)
9. [Rollback & Recovery](#rollback--recovery)
10. [Implementation Roadmap](#implementation-roadmap)

---

## Overview

Phase 8 transforms the Discord Voice Integration from a working project into a **production-grade system** with:

- Automated testing on every commit
- Continuous building and packaging
- Automated deployment pipelines
- Comprehensive monitoring
- Safe rollback procedures
- Complete documentation

### Key Principle

> **Automation first.** Every manual step is a liability. Automate or don't deploy.

### Goals

1. ✅ Zero-touch deployment pipeline
2. ✅ All 180+ tests automated
3. ✅ Semantic versioning (auto-bumped)
4. ✅ GitHub releases with changelog
5. ✅ Docker containerization
6. ✅ Multi-environment support (dev/staging/prod)
7. ✅ Comprehensive monitoring
8. ✅ Incident response procedures

---

## GitHub Actions Workflows

### Workflow 1: Test Suite (`.github/workflows/test.yml`)

Runs on every PR and commit to main/dev branches.

```yaml
name: Test Suite

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Run Linter
        run: npm run lint

      - name: Run Type Check
        run: npm run type-check

      - name: Run Tests
        run: npm test
        env:
          NODE_ENV: test

      - name: Upload Coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: true
          flags: unittests
          verbose: true

      - name: Comment PR with Coverage
        if: github.event_name == 'pull_request'
        uses: romeovs/lcov-reporter-action@v0.3.1
        with:
          lcov-file: ./coverage/lcov.info
          delete-old-comments: true
```

**Triggers:**

- Every push to `main` or `dev`
- Every PR targeting `main` or `dev`

**What it does:**

- Tests on Node 18.x and 20.x
- Runs linter (ESLint)
- Type checking (TypeScript)
- Unit + integration tests
- Code coverage upload (Codecov)
- PR comments with coverage delta

**Success Criteria:**

- All tests pass
- Code coverage >85%
- No linting errors
- No TypeScript errors

---

### Workflow 2: Build & Publish (`.github/workflows/build.yml`)

Runs on successful merge to main branch.

```yaml
name: Build & Publish

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.version.outputs.version }}
      tag: ${{ steps.version.outputs.tag }}

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Full history for versioning

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Run Tests (Pre-Build)
        run: npm test

      - name: Build
        run: npm run build

      - name: Generate Changelog
        id: changelog
        uses: scottbrenner/generate-changelog-action@master
        with:
          file: CHANGELOG.md
          exclude-merge-commits: true

      - name: Bump Version
        id: version
        uses: phips28/gh-action-bump-version@master
        with:
          version-type: minor # Or use 'patch' for hotfixes
          github-token: ${{ secrets.GITHUB_TOKEN }}
          commit-message: 'ci: bump version to {{version}}'

      - name: Build Docker Image
        run: |
          docker build -t openclaw-discord-voice:${{ steps.version.outputs.version }} .
          docker build -t openclaw-discord-voice:latest .

      - name: Upload Artifacts
        uses: actions/upload-artifact@v3
        with:
          name: build-artifacts
          path: dist/
          retention-days: 30

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          tag_name: v${{ steps.version.outputs.version }}
          body: ${{ steps.changelog.outputs.changelog }}
          files: |
            dist/**
            CHANGELOG.md
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Publish to npm (if applicable)
        if: startsWith(github.ref, 'refs/tags/')
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

  notify:
    needs: build
    runs-on: ubuntu-latest
    if: success()

    steps:
      - name: Notify Slack
        uses: slackapi/slack-github-action@v1.24
        with:
          payload: |
            {
              "text": "✅ Discord Voice Integration v${{ needs.build.outputs.version }} built successfully",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Build Successful*\nVersion: `v${{ needs.build.outputs.version }}`\n<https://github.com/${{ github.repository }}/releases/tag/v${{ needs.build.outputs.version }}|View Release>"
                  }
                }
              ]
            }
```

**Triggers:**

- Successful push to `main` branch only

**What it does:**

- Runs full test suite
- Compiles TypeScript → JavaScript
- Generates changelog from commits
- Auto-bumps version (semantic versioning)
- Builds Docker image
- Uploads build artifacts
- Creates GitHub release with changelog
- Publishes to npm (optional)
- Notifies Slack/Discord

**Outputs:**

- Docker image: `openclaw-discord-voice:v1.2.3`
- GitHub release with artifacts
- Version bump in package.json

---

### Workflow 3: Deploy to Staging (`.github/workflows/deploy-staging.yml`)

Runs after successful build, or manually triggered.

```yaml
name: Deploy to Staging

on:
  workflow_run:
    workflows: [Build & Publish]
    types: [completed]
  workflow_dispatch: # Manual trigger

jobs:
  deploy:
    if: ${{ github.event.workflow_run.conclusion == 'success' || github.event_name == 'workflow_dispatch' }}
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci --production

      - name: Load Environment (Staging)
        run: |
          cat > .env.staging << EOF
          NODE_ENV=staging
          DISCORD_BOT_TOKEN=${{ secrets.DISCORD_BOT_TOKEN_STAGING }}
          OPENAI_API_KEY=${{ secrets.OPENAI_API_KEY }}
          ELEVENLABS_API_KEY=${{ secrets.ELEVENLABS_API_KEY }}
          LOG_LEVEL=info
          ENVIRONMENT=staging
          EOF

      - name: Deploy to Staging Server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            cd /opt/openclaw-discord-voice
            git pull origin main
            npm ci --production
            npm run build
            systemctl restart discord-voice-staging
            sleep 5
            curl http://localhost:3001/health || exit 1

      - name: Verify Deployment
        run: |
          # Check staging bot is responding
          curl -f http://${{ secrets.STAGING_HOST }}:3001/health || exit 1

      - name: Notify Success
        uses: slackapi/slack-github-action@v1.24
        with:
          payload: |
            {
              "text": "✅ Staging deployment successful",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Staging Deployment Successful*\nEnvironment: Staging\nBot Status: <http://${{ secrets.STAGING_HOST }}:3001/health|Healthy>"
                  }
                }
              ]
            }

      - name: Notify Failure
        if: failure()
        uses: slackapi/slack-github-action@v1.24
        with:
          payload: |
            {
              "text": "❌ Staging deployment FAILED",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Staging Deployment FAILED*\n<https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Logs>"
                  }
                }
              ]
            }
```

---

### Workflow 4: Deploy to Production (`.github/workflows/deploy-prod.yml`)

Manual trigger only (safety first).

```yaml
name: Deploy to Production

on:
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production

    steps:
      - uses: actions/checkout@v4

      - name: Confirm Deployment
        run: |
          echo "⚠️  PRODUCTION DEPLOYMENT"
          echo "Deploying commit: ${{ github.sha }}"
          echo "Approver: ${{ github.actor }}"

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci --production

      - name: Load Environment (Production)
        run: |
          cat > .env.prod << EOF
          NODE_ENV=production
          DISCORD_BOT_TOKEN=${{ secrets.DISCORD_BOT_TOKEN_PROD }}
          OPENAI_API_KEY=${{ secrets.OPENAI_API_KEY }}
          ELEVENLABS_API_KEY=${{ secrets.ELEVENLABS_API_KEY }}
          LOG_LEVEL=warn
          ENVIRONMENT=production
          SENTRY_DSN=${{ secrets.SENTRY_DSN }}
          EOF

      - name: Deploy with Rollback Support
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            cd /opt/openclaw-discord-voice

            # Backup current version
            cp -r dist/ dist.backup-$(date +%s)/

            # Deploy new version
            git pull origin main
            npm ci --production
            npm run build

            # Graceful restart with health check
            systemctl stop discord-voice-prod
            sleep 2
            systemctl start discord-voice-prod
            sleep 5

            # Health check - if fails, rollback
            if ! curl -f http://localhost:3001/health; then
              echo "Health check FAILED - rolling back"
              systemctl stop discord-voice-prod
              git revert --no-edit HEAD
              npm ci --production
              npm run build
              systemctl start discord-voice-prod
              exit 1
            fi

      - name: Verify Production
        run: |
          curl -f http://${{ secrets.PROD_HOST }}:3001/health || exit 1
          curl -f http://${{ secrets.PROD_HOST }}:3001/metrics || exit 1

      - name: Post Deployment
        uses: slackapi/slack-github-action@v1.24
        with:
          payload: |
            {
              "text": "✅ PRODUCTION deployment successful",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*🚀 Production Deployment Complete*\nVersion: ${{ github.sha }}\nDeployed by: ${{ github.actor }}\nTime: $(date)"
                  }
                },
                {
                  "type": "section",
                  "fields": [
                    {
                      "type": "mrkdwn",
                      "text": "*Status*\n✅ Healthy"
                    },
                    {
                      "type": "mrkdwn",
                      "text": "*Rollback*\n<https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}|Manual>"
                    }
                  ]
                }
              ]
            }
```

**Key Features:**

- Manual trigger (button push in GitHub)
- Automatic health check
- Automatic rollback on failure
- Version backup
- Slack notifications
- Production environment secrets

---

## Discord Bot Setup

### Step 1: Create Bot Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Name: "OpenClaw Voice" (or "OpenClaw Voice Test" for staging)
4. Accept TOS, create

### Step 2: Create Bot User

1. In application settings, go to "Bot"
2. Click "Add Bot"
3. Copy **Bot Token** → save as `DISCORD_BOT_TOKEN` secret in GitHub

### Step 3: Configure OAuth2 Scopes

Under OAuth2 → Scopes, select:

- `bot` — Required for bot functionality
- `applications.commands` — For slash commands

### Step 4: Configure Permissions

Under OAuth2 → Bot Permissions, select:

- `Connect` (voice channel access)
- `Speak` (voice channel output)
- `Use Voice Activity` (voice activity detection)
- `View Channels` (channel access)
- `Send Messages` (command responses)
- `Use Slash Commands` (command interaction)

**Calculated Permission Integer:** `370,688`

### Step 5: Generate Invite URL

Under OAuth2 → Generated URL (with above scopes and permissions):

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=370688&scope=bot%20applications.commands
```

### Step 6: Register Slash Commands

Before deployment, register commands:

```typescript
// scripts/register-commands.ts
import { REST, Routes } from 'discord.js';
import { commands } from '../src/commands/index';

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN!);

async function registerCommands() {
  try {
    console.log('Registering slash commands...');

    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!), {
      body: commands.map((cmd) => cmd.data.toJSON()),
    });

    console.log('✅ Commands registered successfully');
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
    process.exit(1);
  }
}

registerCommands();
```

**Add to GitHub Actions (pre-deployment):**

```yaml
- name: Register Discord Commands
  run: npm run register-commands
  env:
    DISCORD_BOT_TOKEN: ${{ secrets.DISCORD_BOT_TOKEN }}
    DISCORD_CLIENT_ID: ${{ secrets.DISCORD_CLIENT_ID }}
```

### Step 7: Discord App Manifest (Optional but Recommended)

Create `discord-app-manifest.json`:

```json
{
  "id": "YOUR_CLIENT_ID",
  "name": "OpenClaw Voice",
  "description": "Real-time voice interaction with OpenClaw AI",
  "version": "1.0.0",
  "interactions_endpoint_url": "https://api.example.com/interactions",
  "commands": [
    {
      "id": "voice_join",
      "name": "voice join",
      "description": "Join the voice channel you're in",
      "type": 1,
      "options": []
    },
    {
      "id": "voice_leave",
      "name": "voice leave",
      "description": "Leave the current voice channel",
      "type": 1,
      "options": []
    },
    {
      "id": "voice_status",
      "name": "voice status",
      "description": "Show voice connection status",
      "type": 1,
      "options": []
    }
  ]
}
```

---

## Deployment Architecture

### Development Environment

```
Local Dev Machine
├── Node.js runtime
├── .env.development (local keys)
├── OpenAI Whisper API (dev)
└── ElevenLabs API (dev)
```

### Staging Environment

```
Staging Server (AWS EC2 / DigitalOcean)
├── Node.js 20.x
├── Docker container
├── .env.staging
├── OpenAI Whisper API (dev/testing)
├── ElevenLabs API (dev)
├── Discord Test Bot
├── Health check endpoint
└── CloudWatch logs
```

### Production Environment

```
Production Server (AWS EC2 / DigitalOcean)
├── Node.js 20.x
├── Docker container
├── .env.production
├── OpenAI Whisper API (prod)
├── ElevenLabs API (prod)
├── Discord Production Bot
├── Health check endpoint
├── Sentry error tracking
├── CloudWatch logs + alarms
├── Prometheus metrics
└── Auto-restart on crash (systemd)
```

### Docker Setup

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    curl \
    git \
    python3 \
    make \
    g++

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --production

# Copy source code
COPY . .

# Build
RUN npm run build

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Expose port
EXPOSE 3001

# Start
CMD ["npm", "start"]
```

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  discord-voice:
    build: .
    container_name: openclaw-discord-voice
    restart: unless-stopped
    ports:
      - '3001:3001'
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      DISCORD_BOT_TOKEN: ${DISCORD_BOT_TOKEN}
      DISCORD_CLIENT_ID: ${DISCORD_CLIENT_ID}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      ELEVENLABS_API_KEY: ${ELEVENLABS_API_KEY}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      SENTRY_DSN: ${SENTRY_DSN}
    volumes:
      - ./logs:/app/logs
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3001/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

---

## Environment & Secrets Management

### GitHub Secrets Configuration

Set these in `Settings → Secrets and variables → Actions`:

**Development Secrets:**

```
DISCORD_BOT_TOKEN_DEV=<test-bot-token>
```

**Staging Secrets:**

```
DISCORD_BOT_TOKEN_STAGING=<staging-bot-token>
STAGING_HOST=<staging-server-ip>
STAGING_USER=deploy
STAGING_SSH_KEY=<private-key>
```

**Production Secrets:**

```
DISCORD_BOT_TOKEN_PROD=<production-bot-token>
PROD_HOST=<production-server-ip>
PROD_USER=deploy
PROD_SSH_KEY=<private-key>
SENTRY_DSN=<sentry-url>
```

**Shared Secrets:**

```
OPENAI_API_KEY=<actual-key>
ELEVENLABS_API_KEY=<actual-key>
NPM_TOKEN=<npm-publish-token>
```

### Environment Files

`.env.example` (commit to repo):

```
# Discord
DISCORD_BOT_TOKEN=your-bot-token-here
DISCORD_CLIENT_ID=your-client-id-here

# APIs
OPENAI_API_KEY=your-openai-key-here
ELEVENLABS_API_KEY=your-elevenlabs-key-here

# Environment
NODE_ENV=development
LOG_LEVEL=debug
ENVIRONMENT=development

# Optional
SENTRY_DSN=https://...@sentry.io/...
```

`.env.production` (never commit):

```
NODE_ENV=production
LOG_LEVEL=warn
ENVIRONMENT=production
# ... filled in by GitHub Actions
```

### Secrets Rotation

- **Monthly rotation:** Discord bot token
- **Quarterly rotation:** API keys (OpenAI, ElevenLabs)
- **On every deployment:** Verify secrets haven't changed
- **On compromise:** Rotate immediately

---

## Automated Versioning & Releases

### Semantic Versioning Strategy

```
MAJOR.MINOR.PATCH
  ↓     ↓      ↓
  1     2      3
```

**Rules:**

- **MAJOR** (1.0.0 → 2.0.0): Breaking changes
- **MINOR** (1.0.0 → 1.1.0): New features (default)
- **PATCH** (1.0.0 → 1.0.1): Bug fixes, hotfixes

### Commit Messages

Use conventional commits:

```
feat: add voice activity detection
fix: correct audio buffer overflow
docs: update deployment guide
refactor: simplify pipeline error handling
test: add edge case tests
ci: update GitHub Actions workflows
```

### Auto-Generated Changelog

Commits are parsed and grouped:

```markdown
## [1.2.0] - 2026-02-20

### Features

- Add voice activity detection
- Implement graceful shutdown

### Bug Fixes

- Fix audio buffer overflow in Phase 3
- Correct connection state tracking

### Documentation

- Update deployment guide
- Add troubleshooting section

### Internal

- Refactor pipeline error handling
- Update test infrastructure
```

---

## Production Deployment Checklist

### Pre-Deployment (24 hours before)

- [ ] All tests passing (GitHub Actions: green)
- [ ] Code coverage verified (>85%)
- [ ] No critical security issues (npm audit)
- [ ] Staging deployment successful (manual test)
- [ ] Changelog generated and reviewed
- [ ] Release notes drafted
- [ ] Team notified of deployment window
- [ ] Rollback procedure reviewed

### Pre-Deployment (1 hour before)

- [ ] Staging tests still passing
- [ ] No new PR merges in last 5 min
- [ ] PagerDuty oncall acknowledged
- [ ] Slack channel muted (to avoid distraction)
- [ ] Health check endpoints responding
- [ ] Database backups taken (if applicable)

### Deployment Steps

1. **Trigger Deployment**

   ```bash
   # GitHub Actions UI → Deploy to Production → Run Workflow
   # Or via CLI:
   gh workflow run deploy-prod.yml
   ```

2. **Monitor Deployment (5-10 minutes)**
   - Watch GitHub Actions workflow
   - Monitor error tracking (Sentry)
   - Monitor metrics (CloudWatch)
   - Monitor logs (CloudWatch Logs)

3. **Smoke Tests (Automated + Manual)**

   ```bash
   # Automated (in workflow):
   curl -f https://bot.example.com/health
   curl -f https://bot.example.com/metrics

   # Manual (in Discord):
   /voice status  # Should show connected
   # Send message in voice channel
   # Bot should transcribe and respond
   ```

4. **Verify Metrics**
   - CPU usage normal (<10%)
   - Memory stable (<300MB)
   - No errors in logs
   - Voice connections working
   - Response latency <3s

### Post-Deployment

- [ ] Send notification to team
- [ ] Monitor for 30 minutes continuously
- [ ] Monitor for 4 hours (periodic checks)
- [ ] Check logs for any warnings
- [ ] Verify metrics are normal
- [ ] Update status page
- [ ] Archive deployment logs

### Rollback (if needed)

**Automatic (on health check failure):**

- GitHub Actions automatically reverts
- Previous version restored
- Team notified
- Incident created

**Manual Rollback:**

```bash
# SSH to production server
ssh deploy@prod.example.com

cd /opt/openclaw-discord-voice

# Find previous version
ls -lah dist.backup-*/

# Restore
rm -rf dist
cp -r dist.backup-1708000000/ dist

# Restart
systemctl restart discord-voice-prod

# Verify
curl http://localhost:3001/health
```

---

## Monitoring & Observability

### Health Check Endpoint

```typescript
// src/health.ts
import express from 'express';
import os from 'os';

const router = express.Router();

router.get('/health', (req, res) => {
  try {
    // Check critical systems
    if (!voiceManager.isHealthy()) {
      return res.status(503).json({
        status: 'degraded',
        timestamp: new Date(),
        services: {
          voice: 'unhealthy',
          stts: 'ok',
          tts: 'ok',
        },
      });
    }

    res.json({
      status: 'healthy',
      timestamp: new Date(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      services: {
        voice: 'ok',
        stts: 'ok',
        tts: 'ok',
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

export default router;
```

### Metrics Endpoint (Prometheus)

```typescript
// src/metrics.ts
import prometheus from 'prom-client';

const register = new prometheus.Registry();

// Counters
export const voiceConnectionsTotal = new prometheus.Counter({
  name: 'voice_connections_total',
  help: 'Total voice connections attempted',
  registers: [register],
});

export const voiceConnectionsActive = new prometheus.Gauge({
  name: 'voice_connections_active',
  help: 'Currently active voice connections',
  registers: [register],
});

export const transcriptionsTotal = new prometheus.Counter({
  name: 'transcriptions_total',
  help: 'Total transcriptions processed',
  registers: [register],
});

export const responseLatency = new prometheus.Histogram({
  name: 'response_latency_seconds',
  help: 'Response latency in seconds',
  buckets: [0.1, 0.5, 1, 2, 3, 5],
  registers: [register],
});

export const voiceErrors = new prometheus.Counter({
  name: 'voice_errors_total',
  help: 'Total voice errors',
  labelNames: ['error_type'],
  registers: [register],
});

router.get('/metrics', (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
});
```

### Error Tracking (Sentry)

```typescript
// src/sentry.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.ENVIRONMENT || 'development',
  tracesSampleRate: process.env.ENVIRONMENT === 'production' ? 0.1 : 1.0,
  beforeSend(event) {
    // Filter out development errors if needed
    return event;
  },
});

// Catch all unhandled exceptions
process.on('uncaughtException', (error) => {
  Sentry.captureException(error);
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  Sentry.captureException(reason);
  console.error('Unhandled rejection:', reason);
});
```

### CloudWatch Logs

```typescript
// src/logging.ts
import winston from 'winston';
import WinstonCloudWatch from 'winston-cloudwatch';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    ...(process.env.ENVIRONMENT === 'production'
      ? [
          new WinstonCloudWatch({
            logGroupName: '/aws/discord-voice/production',
            logStreamName: `${process.env.HOSTNAME || 'unknown'}-${Date.now()}`,
            awsRegion: 'us-east-1',
            messageFormatter: ({ level, message, meta }) => {
              return `[${level}] ${message} ${JSON.stringify(meta)}`;
            },
          }),
        ]
      : []),
  ],
});

export default logger;
```

### CloudWatch Alarms

Create alarms in AWS Console:

1. **CPU > 50% for 5 minutes**
   - Action: Notify ops team
   - Action: Trigger incident

2. **Memory > 250MB for 5 minutes**
   - Action: Notify ops team
   - May indicate memory leak

3. **Health check failing (2 consecutive)**
   - Action: Auto-rollback
   - Action: Notify team

4. **Error rate > 1% in 5 minutes**
   - Action: Page on-call
   - Action: Create incident

---

## Rollback & Recovery

### Automatic Rollback Flow

```
Deployment Triggered
  ↓
Code built & tested
  ↓
Service deployed
  ↓
Health check runs
  ↓
Health check FAILS?
  ├→ YES: Revert commit → Rebuild → Restart → Verify
  └→ NO: Continue to manual verification

Manual verification in Discord
  ├→ FAILED: Manually trigger rollback
  └→ SUCCESS: Mark deployment complete
```

### Manual Rollback Procedure

**Quick Rollback (< 2 minutes):**

```bash
# SSH to production
ssh deploy@prod.example.com

# Go to backup directory (most recent)
cd /opt/openclaw-discord-voice
BACKUP=$(ls -t dist.backup-* | head -1)

# Restore and restart
rm -rf dist && cp -r $BACKUP dist
systemctl restart discord-voice-prod

# Verify
sleep 5
curl http://localhost:3001/health
```

**Full Rollback (if above fails):**

```bash
# Revert to previous git tag
git fetch origin
git checkout v1.2.0  # Previous version
npm ci --production
npm run build
systemctl restart discord-voice-prod

# Verify
curl http://localhost:3001/health
```

### Incident Response

**Level 1 (Minor - Response <30min):**

- Error rate elevated but <2%
- Latency slightly increased but <5s
- No data loss
- **Action:** Monitor, collect logs, plan fix

**Level 2 (Major - Response <5min):**

- Error rate >2%
- Service degraded but functional
- **Action:** Trigger rollback, investigate
- **Comms:** Notify users, provide ETA

**Level 3 (Critical - Response <1min):**

- Service down or responding with errors
- Data loss possible
- **Action:** Immediate rollback, page on-call
- **Comms:** Status page + major notification

---

## Implementation Roadmap

### Phase 8.1: Infrastructure Setup (4 hours)

- [ ] Create GitHub Actions workflow files
- [ ] Set up GitHub Secrets
- [ ] Create Discord bot applications (dev/staging/prod)
- [ ] Create Dockerfile + docker-compose.yml
- [ ] Test local Docker build

### Phase 8.2: CI/CD Workflows (6 hours)

- [ ] Implement test.yml workflow
- [ ] Implement build.yml workflow
- [ ] Set up Codecov integration
- [ ] Configure auto-versioning
- [ ] Test workflow with PR/merge

### Phase 8.3: Staging Deployment (3 hours)

- [ ] Set up staging server (AWS/DO)
- [ ] Create deploy-staging.yml workflow
- [ ] Deploy to staging successfully
- [ ] Manual smoke tests in staging
- [ ] Document staging deployment procedure

### Phase 8.4: Production Setup (4 hours)

- [ ] Set up production server
- [ ] Create deploy-prod.yml workflow
- [ ] Configure health check endpoints
- [ ] Set up error tracking (Sentry)
- [ ] Configure CloudWatch logs + alarms

### Phase 8.5: Monitoring & Observability (3 hours)

- [ ] Implement health check endpoint
- [ ] Implement metrics endpoint
- [ ] Set up Sentry integration
- [ ] Configure CloudWatch logs
- [ ] Create monitoring dashboards

### Phase 8.6: Incident Response (2 hours)

- [ ] Document rollback procedures
- [ ] Test automatic rollback
- [ ] Create incident response plan
- [ ] Test manual rollback procedure
- [ ] Document SLAs and escalation

### Phase 8.7: Documentation (2 hours)

- [ ] Write DEPLOYMENT.md (ops guide)
- [ ] Write SECRETS.md (configuration)
- [ ] Write TROUBLESHOOTING.md (ops)
- [ ] Write MONITORING.md (ops)
- [ ] Write RELEASE_NOTES.md

### Phase 8.8: Final Testing (4 hours)

- [ ] Test complete CI pipeline
- [ ] Test complete CD pipeline
- [ ] Test rollback procedure
- [ ] Performance load testing
- [ ] Security review

### Phase 8.9: Launch (2 hours)

- [ ] Final production checklist
- [ ] Deploy to production
- [ ] Monitor first 30 minutes
- [ ] Announce release
- [ ] Archive runbooks

**Total Phase 8 Time:** ~30 hours (4-5 working days)

---

## Success Criteria

- [ ] All GitHub Actions workflows pass
- [ ] Test coverage reports in PRs
- [ ] Build artifacts versioned correctly
- [ ] Docker image builds successfully
- [ ] Staging deployment successful
- [ ] Production deployment successful
- [ ] Health checks responding
- [ ] Metrics endpoint functional
- [ ] Error tracking working
- [ ] Logs available in CloudWatch
- [ ] Automatic rollback tested
- [ ] Manual rollback procedure documented
- [ ] Team trained on deployment
- [ ] SLAs documented and agreed
- [ ] Incident response tested

---

## Next Steps

1. **Now:** Review this design
2. **Day 1:** Set up GitHub Actions + Discord bots
3. **Day 2:** Set up servers + Docker
4. **Day 3:** Deploy staging + verify
5. **Day 4:** Deploy production + monitor
6. **Complete:** Launch + monitor metrics

---

**Document Version:** 1.0  
**Status:** Ready for Implementation  
**Approver:** TBD
