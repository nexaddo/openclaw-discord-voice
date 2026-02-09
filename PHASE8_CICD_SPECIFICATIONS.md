# Phase 8: CI/CD & Deployment Specifications

## Executive Summary

Phase 8 implements comprehensive CI/CD pipelines, automated testing, containerization, and production deployment infrastructure for the Discord Voice Integration project. This final phase ensures all 199+ tests pass in automated CI, code is properly built and containerized, and deployments are safe with monitoring, observability, and rollback capabilities.

**Timeline:** 4-7 days across 4 sub-phases
**Success Criteria:** All tests passing, >85% code coverage, <200MB Docker image, automated deployments to staging/production

---

## 1. Current State Analysis

### Repository Structure
```
openclaw-discord-voice/
├── plugins/
│   ├── discord-plugin/          (2,298 LOC TypeScript)
│   │   ├── src/
│   │   │   ├── voice/
│   │   │   ├── state/
│   │   │   └── types/
│   │   ├── __tests__/           (comprehensive test suite)
│   │   └── package.json
│   └── voice-extension/         (3,922 LOC TypeScript)
│       ├── src/
│       ├── __tests__/
│       └── package.json
├── package.json                 (root, placeholder scripts)
├── tsconfig.json               (base config)
└── .github/                    (NO workflows currently)
```

### Build System
- **TypeScript:** 5.9.3 (strict mode: partial)
- **Test Framework:** Vitest 4.0.18
- **Build Tool:** Node.js + TypeScript compiler
- **Module Format:** ESNext/CommonJS

### Current Test Status
- **Total Tests:** 199+ across 6 test files
- **Passing:** 173/183 in Vitest
- **Failing:** 10 tests (timing-related, VoiceCommandPipeline)
- **Test Files:**
  - discord-plugin: 42 tests
  - voice-extension: 157 tests (all phases)

### Gaps Identified
- ❌ No CI/CD pipeline (GitHub Actions)
- ❌ No Docker containerization
- ❌ No monitoring/observability
- ❌ No deployment automation
- ❌ ESLint not configured (mentioned but unused)
- ❌ No health check endpoints
- ❌ No metrics collection
- ❌ No error tracking (Sentry)

---

## 2. Testing Strategy

### Test Coverage Summary
| Phase | Component | Tests | Status |
|-------|-----------|-------|--------|
| 3 | AudioStreamHandler | 56 | ✅ Passing |
| 4 | SpeechToText | 62 | ✅ Passing |
| 5 | TextToSpeech | 40 | ✅ Passing |
| 6 | VoiceCommandPipeline | 36 | ⚠️ 26/36 passing |
| 7 | Discord Plugin | 42 | ✅ Passing |
| **Total** | | **199+** | **173/183** |

### Test Pyramid
- **Unit Tests:** ~120 tests (60%) - Direct function testing
- **Integration Tests:** ~60 tests (30%) - Component interaction
- **E2E Tests:** ~19 tests (10%) - Full pipeline flow

### Coverage Targets
- **Minimum:** 80% code coverage
- **Target:** 85% code coverage
- **Critical paths:** 95% coverage required

### Known Failing Tests (Priority Fix)
1. VoiceCommandPipeline latency check (timeout)
2. Session cleanup timing (race condition)
3. Recovery metrics calculation (assertion timing)
4. Error retry backoff (timing precision)
5-10. Other timing-related failures in concurrent scenarios

---

## 3. CI/CD Pipeline Design

### Pipeline Stages (10 Total)

```
PR Created
    ↓
[1] Lint & Format Check
    ├─ ESLint (code quality)
    ├─ Prettier (formatting)
    └─ TypeScript Check (strict mode)
    ↓
[2] Build
    ├─ Compile TypeScript (discord-plugin)
    ├─ Compile TypeScript (voice-extension)
    └─ Generate type declarations
    ↓
[3] Unit Tests
    ├─ Run Vitest suite
    ├─ Generate coverage report
    └─ Upload to Codecov
    ↓
[4] Coverage Check
    ├─ Validate >80% threshold
    └─ Enforce coverage on changed files
    ↓
[5] Security Scan
    ├─ npm audit (dependencies)
    ├─ Snyk scan (vulnerabilities)
    └─ OWASP dependency check
    ↓
[6] Build Artifacts
    ├─ Create Docker image
    ├─ Publish to registry (ghcr.io)
    └─ Store build metadata
    ↓
[7] Deploy to Staging
    ├─ Deploy Docker container
    ├─ Run smoke tests
    └─ Verify endpoints
    ↓
[8] Integration Tests
    ├─ Test with staging bot
    ├─ Voice channel operations
    └─ Error scenarios
    ↓
[9] Manual Review Gate
    ├─ Code review approval
    └─ Release notes verification
    ↓
[10] Deploy to Production
    ├─ Blue-green deployment
    ├─ Health checks
    └─ Automatic rollback on failure
```

### GitHub Actions Workflows

#### `ci.yml` - On PR & Push
```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check

  build:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build

  test:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
          fail_ci_if_error: true
          min_coverage_overall: 80

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm audit --audit-level=high
      - uses: snyk/snyk-setup-action@master
      - run: snyk test
```

#### `release.yml` - On Manual Trigger
```yaml
name: Deploy to Production
on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment }}
    steps:
      - uses: actions/checkout@v3
      - uses: docker/setup-buildx-action@v2
      - uses: docker/build-push-action@v4
        with:
          file: Dockerfile
          push: true
          tags: ghcr.io/nexaddo/openclaw-discord-voice:${{ github.sha }}
      - name: Deploy to ${{ github.event.inputs.environment }}
        run: ./scripts/deploy.sh ${{ github.event.inputs.environment }}
      - name: Run Smoke Tests
        run: ./scripts/smoke-test.sh ${{ github.event.inputs.environment }}
      - name: Rollback on Failure
        if: failure()
        run: ./scripts/rollback.sh ${{ github.event.inputs.environment }}
```

---

## 4. Build Configuration

### Docker Image Strategy

**Multi-stage Dockerfile:**
```dockerfile
# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /build
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:18-alpine
WORKDIR /app
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
COPY --from=builder --chown=nodejs:nodejs /build/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /build/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /build/package*.json ./

USER nodejs
EXPOSE 3000 9090
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "dist/index.js"]
```

**Image Optimization:**
- Base: Alpine (small, secure)
- Multi-stage: Reduce final image size
- Non-root user: Security hardening
- Health check: Automatic restart on failure
- **Target size:** <200MB

### TypeScript Compilation
- **Targets:** ES2020, CommonJS
- **Strict Mode:** Enabled in both plugins
- **Declaration Files:** Generated (.d.ts)
- **Source Maps:** Included for debugging

### Build Artifacts
- **discord-plugin/dist:** ~500KB
- **voice-extension/dist:** ~800KB
- **Total package:** ~1.3MB (uncompressed)

---

## 5. Deployment Strategy

### Environments

#### Development
- **Trigger:** Local development only
- **Deploy:** `npm run dev` locally
- **Logging:** Debug level (verbose)
- **Features:** Full debug output, no rate limiting
- **Database:** Local SQLite (if needed)

#### Staging
- **Trigger:** Automatic on merge to `main`
- **Deploy:** Manual GitHub Action or webhook
- **Logging:** Info level
- **Features:** Rate limiting enabled, monitoring enabled
- **Database:** Test/staging database
- **Bot:** Test Discord bot instance
- **Health:** Smoke tests run post-deploy
- **Duration:** Permanent (always available)

#### Production
- **Trigger:** Manual workflow dispatch (approval gate)
- **Deploy:** Blue-green deployment
- **Logging:** Error/warning level
- **Features:** All features enabled, strict rate limiting
- **Database:** Production database with backups
- **Bot:** Production Discord bot instance
- **Health:** Continuous monitoring, auto-rollback on failure
- **SLA:** 99.5% uptime target

### Blue-Green Deployment

```
Current State (Green):
  Pod-A [Version 1.0] → Active
  Pod-B [Version 1.0] → Standby
         ↓
Deploy (Blue):
  Pod-C [Version 1.1] → Starting
  Traffic Router → Still pointing to Green
         ↓
Health Check:
  Pod-C health check → Success
         ↓
Switch Traffic (Blue Active):
  Pod-C [Version 1.1] → Active
  Traffic Router → Now pointing to Blue
         ↓
Monitor (5 minutes):
  Error rate: <1% ✓
  Latency: <500ms ✓
  Success rate: >99% ✓
         ↓
Cleanup (Green):
  Pod-A, Pod-B → Shutdown
         ↓
Ready for Next Deploy
```

### Rollback Procedures

**Automatic Triggers:**
- Health check failure for 30 seconds
- Error rate >10% sustained for 1 minute
- Latency >2000ms sustained for 1 minute
- Discord API connection failures

**Rollback Steps:**
1. Detect failure condition
2. Switch traffic back to Green (old version)
3. Alert team (PagerDuty)
4. Log failure details (Sentry)
5. Keep failed Blue pod for investigation
6. Report rollback completion

**Manual Rollback:**
```bash
./scripts/rollback.sh production
```

**Rollback Time Target:** <2 minutes total (detection + switch + verification)

---

## 6. Monitoring & Observability

### Structured Logging

**Log Format:** JSON
```json
{
  "timestamp": "2026-02-08T19:00:00Z",
  "level": "error",
  "service": "discord-plugin",
  "userId": "320696906248486912",
  "guildId": "1127395891410653226",
  "sessionId": "sess_abc123",
  "message": "STT failed with timeout",
  "error": "TimeoutError: Speech recognition timeout after 30s",
  "context": {
    "phase": "stt",
    "audioFrames": 1500,
    "duration_ms": 30000
  },
  "traceId": "trace_xyz789"
}
```

**Log Levels:**
- **DEBUG:** Detailed diagnostic info (dev only)
- **INFO:** General informational messages
- **WARN:** Warning conditions (recoverable)
- **ERROR:** Error conditions (requires attention)
- **FATAL:** System is unusable (immediate action needed)

### Metrics Collection

**Prometheus Metrics:**
```
# Discord Events
discord_voice_connect_total{guild_id="X",status="success"}
discord_voice_disconnect_total{guild_id="X"}
discord_command_total{command="start|stop|ask",status="success|error"}

# Pipeline Metrics
pipeline_request_duration_seconds{phase="audio|stt|agent|tts"}
pipeline_active_sessions{guild_id="X"}
pipeline_error_total{error_code="XXXX",phase="audio|stt|agent|tts"}
pipeline_recovery_success_total
pipeline_recovery_failure_total

# Audio Metrics
audio_frames_processed_total{format="opus|pcm"}
audio_bytes_processed_total

# STT Metrics
stt_request_duration_seconds
stt_confidence_score
stt_error_total{error_type="timeout|invalid_format|network"}

# TTS Metrics
tts_request_duration_seconds
tts_bytes_generated_total

# System Metrics
system_memory_usage_bytes
system_cpu_usage_percent
node_process_memory_bytes{type="heapUsed|heapTotal|external"}
```

### Error Tracking (Sentry)

**Configuration:**
```typescript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
  ],
});
```

**Events Tracked:**
- Exceptions and errors
- Performance issues (slow transactions)
- Release tracking
- User context (userId, guildId)
- Custom breadcrumbs

### Alerting Rules

**Critical Alerts (PagerDuty):**
- Error rate >5% in 5 minutes
- Response latency >2000ms (p95) in 5 minutes
- Health check failure
- Discord API connection loss
- Database connection loss

**Warning Alerts (Slack #alerts):**
- Error rate >1% in 5 minutes
- Response latency >1000ms (p95) in 5 minutes
- Memory usage >80%
- CPU usage >70%
- Coverage dropped >5%

---

## 7. Environment Configuration

### Environment Variables

**Discord:**
```
DISCORD_TOKEN=<bot-token>
DISCORD_CLIENT_ID=<client-id>
DISCORD_GUILD_ID=<test-guild-id>
```

**Voice Processing:**
```
STT_PROVIDER=openai           # or google, azure
STT_API_KEY=<key>
TTS_PROVIDER=elevenlabs       # or google, azure
TTS_API_KEY=<key>
```

**Deployment:**
```
NODE_ENV=production|staging|development
LOG_LEVEL=debug|info|warn|error
SENTRY_DSN=<sentry-dsn>
PROMETHEUS_ENABLED=true
HEALTH_CHECK_INTERVAL=30s
```

### Secrets Management
- Store in GitHub Secrets (dev/staging/prod environments)
- Rotate quarterly
- Log access to secrets
- Use temporary tokens where possible

---

## 8. Implementation Timeline

### Phase 8a: CI/CD Pipeline Setup (1-2 days)
**Deliverables:**
- ✅ ESLint + Prettier configuration
- ✅ GitHub Actions workflows (ci.yml, release.yml)
- ✅ Codecov integration
- ✅ Security scanning (npm audit + Snyk)
- ✅ Fix 10 failing VoiceCommandPipeline tests
- ✅ All 199+ tests passing in CI

**Acceptance Criteria:**
- Green CI on all PRs
- Coverage >85%
- No ESLint warnings
- No high-severity vulnerabilities

### Phase 8b: Build & Deployment (1-2 days)
**Deliverables:**
- ✅ Dockerfile (multi-stage, <200MB)
- ✅ Deployment scripts (deploy.sh, rollback.sh, smoke-test.sh)
- ✅ Health check endpoint (`GET /health`)
- ✅ Metrics endpoint (`GET /metrics`)
- ✅ Environment configurations (dev, staging, prod)
- ✅ Docker registry setup (ghcr.io)

**Acceptance Criteria:**
- Docker image builds and runs locally
- Health check succeeds
- Metrics endpoint returns valid data
- Staging deployment works
- Rollback script executes successfully

### Phase 8c: Monitoring & Observability (1 day)
**Deliverables:**
- ✅ Structured JSON logging
- ✅ Sentry error tracking integration
- ✅ Prometheus metrics endpoints
- ✅ Grafana dashboards (basic)
- ✅ PagerDuty alert configuration
- ✅ Slack alert integration

**Acceptance Criteria:**
- Logs appear in structured format
- Sentry receives test errors
- Prometheus metrics scraped successfully
- Alerts trigger on test conditions

### Phase 8d: Testing & Validation (1-2 days)
**Deliverables:**
- ✅ Load tests (10+ concurrent sessions)
- ✅ Smoke tests (5 minute validation)
- ✅ Rollback procedure tested
- ✅ Failure scenarios tested
- ✅ Production readiness checklist completed
- ✅ Runbooks written

**Acceptance Criteria:**
- Load tests show acceptable performance
- Smoke tests pass 100%
- Rollback completes in <2 minutes
- All checklist items verified
- Team trained on procedures

---

## 9. Production Readiness Checklist

- [ ] All 199+ tests passing
- [ ] Code coverage >85%
- [ ] ESLint clean (0 warnings)
- [ ] No high-severity vulnerabilities
- [ ] TypeScript strict mode enabled
- [ ] Docker image <200MB
- [ ] CI pipeline <5 minutes
- [ ] Staging deployment tested
- [ ] Health checks configured
- [ ] Metrics collection verified
- [ ] Monitoring alerts configured
- [ ] Error tracking (Sentry) working
- [ ] Structured logging operational
- [ ] Rollback procedure tested
- [ ] Load tests passed
- [ ] Smoke tests passed
- [ ] Database migrations tested
- [ ] Disaster recovery plan documented
- [ ] Runbooks written
- [ ] Team trained on procedures
- [ ] Change log updated
- [ ] Release notes prepared
- [ ] Customer communication ready
- [ ] SLA agreements reviewed
- [ ] Post-launch monitoring validated

---

## 10. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|-----------|
| 10 timing tests hard to fix | Delay 1-2 days | High | May need to rewrite test logic, use retries |
| Docker image >200MB | Slow deployment | Medium | Remove dev dependencies, optimize layers |
| Performance regression | Deployment issues | Medium | Load test before production, compare metrics |
| Secrets leak in logs | Security incident | Medium | Redact secrets in logging, audit logs |
| Staging/prod misconfiguration | Data loss/corruption | Low | Infrastructure-as-Code, dry-run before apply |
| Monitoring not capturing data | Blind spot in production | Medium | Test monitoring in staging first |
| Rollback fails | Extended downtime | Low | Test rollback regularly, keep old version running |

---

## 11. Success Criteria

**Functional Criteria:**
- ✅ CI passes on every PR
- ✅ All 199+ tests pass in CI
- ✅ Code coverage >85% maintained
- ✅ Staging auto-deploys on merge to main
- ✅ Production deployable via GitHub Actions
- ✅ Rollback procedure works (tested)
- ✅ Monitoring alerts configured and tested
- ✅ Error tracking captures all errors
- ✅ Structured logging implemented
- ✅ Health checks report accurate status

**Performance Criteria:**
- ✅ CI pipeline completes in <5 minutes
- ✅ Build step completes in <2 minutes
- ✅ Tests run in <2 minutes
- ✅ Docker build completes in <3 minutes
- ✅ Deployment completes in <3 minutes
- ✅ Rollback completes in <2 minutes

**Quality Criteria:**
- ✅ ESLint passes with 0 warnings
- ✅ No TypeScript errors or warnings
- ✅ No critical security vulnerabilities
- ✅ Code follows established patterns
- ✅ Documentation is complete and accurate

**Operational Criteria:**
- ✅ Production deployment tested end-to-end
- ✅ Failure scenarios tested (network, service)
- ✅ Team trained on monitoring/alerting
- ✅ Runbooks written and accessible
- ✅ Disaster recovery tested
- ✅ On-call rotation established

---

## 12. Next Steps

1. **Implement Phase 8a** (CI/CD Pipeline)
   - Add ESLint + Prettier configs
   - Create GitHub Actions workflows
   - Fix 10 failing tests
   - Validate all tests pass

2. **Implement Phase 8b** (Build & Deployment)
   - Create Dockerfile
   - Write deployment scripts
   - Add health/metrics endpoints
   - Test staging deployment

3. **Implement Phase 8c** (Monitoring)
   - Add structured logging
   - Integrate Sentry
   - Configure Prometheus metrics
   - Setup alerting

4. **Implement Phase 8d** (Testing & Validation)
   - Run load tests
   - Test rollback procedure
   - Complete readiness checklist
   - Train team

5. **Deploy to Production**
   - Final approval gate
   - Blue-green deployment
   - Continuous monitoring
   - Success celebration 🎉

---

**Phase 8 is ready for implementation. All specifications complete and detailed.**
