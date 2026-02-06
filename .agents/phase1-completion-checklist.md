# Phase 1 Completion Checklist

**Status:** Research Complete - Ready for Implementation  
**Date:** 2026-02-06  
**Assigned to:** Implementation Agent  

---

## Pre-Implementation Review

- [ ] Read `PHASE1_SUMMARY.md` (quick overview)
- [ ] Read `PHASE1_RESEARCH_REPORT.md` (detailed analysis)
- [ ] Review `DEPENDENCIES.md` (reference)
- [ ] Confirm OpenClaw version: 2026.2.2-3 ✅
- [ ] Confirm Node.js version: 22.22.0 ✅
- [ ] Get approval to proceed from main agent

---

## Installation Phase

### Step 1: Backup Current State
```bash
# Backup OpenClaw before modifications
cp /usr/local/lib/node_modules/openclaw/package.json \
   /usr/local/lib/node_modules/openclaw/package.json.bak.$(date +%s)
```

- [ ] Package.json backed up
- [ ] Commit current state to git

### Step 2: Update OpenClaw package.json

**File:** `/usr/local/lib/node_modules/openclaw/package.json`

Add to `dependencies` section (find it, don't create new):
```json
"@discordjs/opus": "^0.10.0"
```

Add or create `optionalDependencies` section:
```json
"optionalDependencies": {
  "sodium-native": "^5.0.10",
  "libsodium-wrappers": "^0.8.2",
  "ffmpeg-static": "^5.2.0"
}
```

- [ ] @discordjs/opus added to dependencies
- [ ] optionalDependencies section created
- [ ] No typos in JSON
- [ ] JSON is valid (use `npm install --dry-run` to verify)

### Step 3: Install Dependencies

```bash
cd /usr/local/lib/node_modules/openclaw/

# Dry run first to see what will be installed
npm install --dry-run

# Actual install
npm install

# This will:
# - Install @discordjs/opus (REQUIRED)
# - Attempt to install optional dependencies
# - Verify no conflicts
```

- [ ] npm install completed successfully
- [ ] No "ERR!" messages in output
- [ ] Optional deps that failed are acceptable

### Step 4: Verify Installation

```bash
# Check package is installed
npm list @discordjs/opus

# Expected output:
# └── @discordjs/opus@0.10.0
```

- [ ] `npm list @discordjs/opus` shows 0.10.0
- [ ] Node modules directory has @discordjs directory
- [ ] No error messages

### Step 5: Test Loading

Run each test command:

```bash
node -e "import('@discordjs/opus').then(() => console.log('✅ @discordjs/opus loaded')).catch(e => console.error('❌', e.message))"
```

Expected: `✅ @discordjs/opus loaded`

- [ ] @discordjs/opus loads
- [ ] @discordjs/voice loads
- [ ] prism-media loads
- [ ] All three pass

---

## Plugin Structure Phase

### Step 1: Create Directory Structure

```bash
mkdir -p /Users/saustin/.openclaw/workspace/repos/openclaw-discord-voice/plugins/voice-extension/src
mkdir -p /Users/saustin/.openclaw/workspace/repos/openclaw-discord-voice/plugins/voice-extension/__tests__
```

- [ ] Directory structure created
- [ ] Permissions are correct (755)

### Step 2: Create Package.json

**File:** `plugins/voice-extension/package.json`

```json
{
  "name": "@openclaw/voice-extension",
  "version": "0.1.0",
  "description": "Discord voice extension for OpenClaw",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch",
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:ui": "vitest --ui"
  },
  "devDependencies": {
    "openclaw": "workspace:*",
    "typescript": "^5.9.3",
    "@types/node": "^25.2.0",
    "vitest": "^4.0.18",
    "@types/ws": "^8.18.1"
  },
  "openclaw": {
    "extensions": ["./index.ts"]
  }
}
```

- [ ] package.json created
- [ ] All fields correct
- [ ] Valid JSON

### Step 3: Create TypeScript Config

**File:** `plugins/voice-extension/tsconfig.json`

```json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules", "**/*.test.ts"]
}
```

- [ ] tsconfig.json created
- [ ] Extends main tsconfig
- [ ] Paths are correct

### Step 4: Create Entry Point

**File:** `plugins/voice-extension/index.ts`

```typescript
/**
 * OpenClaw Discord Voice Extension
 * Entry point for voice integration
 */

export { VoiceExtension } from './src/VoiceExtension';
export * from './src/types';
```

- [ ] index.ts created
- [ ] Imports are valid
- [ ] Ready for compilation

### Step 5: Create Type Definitions

**File:** `plugins/voice-extension/src/types.ts`

```typescript
/**
 * Type definitions for voice extension
 */

export interface VoiceConfig {
  guildId: string;
  channelId: string;
  userId: string;
}

export interface AudioBuffer {
  data: Buffer;
  timestamp: number;
}
```

- [ ] types.ts created
- [ ] Basic types defined
- [ ] Valid TypeScript

---

## Build Pipeline Phase

### Step 1: Verify TypeScript Installation

```bash
cd /Users/saustin/.openclaw/workspace/repos/openclaw-discord-voice/plugins/voice-extension/
npm install
```

- [ ] Dependencies installed
- [ ] node_modules created

### Step 2: Test Build

```bash
npm run build

# Expected: No errors, dist/ folder created
```

- [ ] Build succeeds
- [ ] dist/ directory created
- [ ] dist/index.js exists
- [ ] dist/index.d.ts exists (type definitions)

### Step 3: Test Watch Mode

```bash
npm run build:watch

# Leave running for a few seconds, then Ctrl+C
# Try editing src/types.ts to verify rebuild
```

- [ ] Watch mode starts
- [ ] Auto-compiles on file change
- [ ] No errors on reload

---

## Integration Phase

### Step 1: Test Loading from OpenClaw

```bash
node -e "import('/Users/saustin/.openclaw/workspace/repos/openclaw-discord-voice/plugins/voice-extension/dist/index.js').then(() => console.log('✅ Plugin loaded')).catch(e => console.error('❌', e.message))"
```

- [ ] Plugin loads without errors
- [ ] All exports available

### Step 2: Verify Dependency Chain

```bash
cd /Users/saustin/.openclaw/workspace/repos/openclaw-discord-voice/plugins/voice-extension/
node -e "import('@discordjs/voice').then(m => console.log('✅ voice API available')).catch(e => console.error('❌', e.message))"
node -e "import('@discordjs/opus').then(m => console.log('✅ opus codec available')).catch(e => console.error('❌', e.message))"
```

- [ ] @discordjs/voice is accessible
- [ ] @discordjs/opus is accessible
- [ ] No import errors

---

## Opus Encoding Test

### Create Test File

**File:** `test-opus-encode.mjs`

```javascript
import OpusEncoder from '@discordjs/opus';

// Create encoder: 48kHz stereo, 20ms frames
const encoder = new OpusEncoder.Encoder(48000, 2, 2880);

// Create test PCM audio (5760 bytes = 20ms stereo)
const pcm = Buffer.alloc(5760);
pcm.fill(0x00); // Silence test

// Encode to Opus
const opus = encoder.encode(pcm);

console.log(`✅ Encoded ${pcm.length} bytes PCM → ${opus.length} bytes Opus`);
console.log(`   Frame size: ${opus.length} bytes`);
console.log(`   Bitrate: ~${(opus.length * 8 * 50).toFixed(0)} kbps (at 50 fps)`);
```

### Run Test

```bash
cd /usr/local/lib/node_modules/openclaw/
node test-opus-encode.mjs
```

Expected output:
```
✅ Encoded 5760 bytes PCM → [size] bytes Opus
```

- [ ] Opus encoding works
- [ ] No exceptions thrown
- [ ] Output size is reasonable (< 5760 bytes)

---

## Documentation Phase

### Step 1: Update README

**File:** `README.md`

Add Phase 1 status:
```markdown
## Phase 1: Dependencies & Foundation ✅ COMPLETE

- Voice codec: @discordjs/opus 0.10.0 ✅
- Voice API: @discordjs/voice 0.19.0 ✅
- Audio processing: prism-media 1.3.5 ✅
- Build: TypeScript 5.9.3 ✅
- Testing: Vitest 4.0.18 ✅
```

- [ ] README updated with Phase 1 status
- [ ] Version numbers documented
- [ ] Installation instructions added

### Step 2: Document Installation Steps

**Create:** `INSTALLATION.md`

Include:
1. System requirements (Node.js 22+)
2. Install instructions
3. Verification steps
4. Troubleshooting

- [ ] INSTALLATION.md created
- [ ] All steps documented
- [ ] Links to detailed docs

### Step 3: Update PLAN.md

Mark Phase 1 as complete:

```markdown
## Implementation Phases

### Phase 1: Dependencies & Foundation ✅ COMPLETE
**Completed:** 2026-02-06  
**Dependencies:** @discordjs/opus ^0.10.0 installed  
**Status:** Ready for Phase 2

### Phase 2: Voice Connection Manager (NEXT)
```

- [ ] PLAN.md Phase 1 marked complete
- [ ] Phase 2 details updated
- [ ] Timeline adjusted if needed

---

## Final Verification

### Smoke Tests

Run all tests together:

```bash
#!/bin/bash
set -e

echo "🔍 Phase 1 Verification Tests"
echo "========================================="

# Test 1: Load opus
echo "Test 1: Load @discordjs/opus..."
node -e "import('@discordjs/opus').then(() => console.log('  ✅ Passed')).catch(e => (console.log('  ❌ Failed: ' + e.message), process.exit(1)))"

# Test 2: Load voice API
echo "Test 2: Load @discordjs/voice..."
node -e "import('@discordjs/voice').then(() => console.log('  ✅ Passed')).catch(e => (console.log('  ❌ Failed: ' + e.message), process.exit(1)))"

# Test 3: Encode audio
echo "Test 3: Opus encoding..."
cd /usr/local/lib/node_modules/openclaw/
node test-opus-encode.mjs 2>&1 | sed 's/^/  /'

# Test 4: Load plugin
echo "Test 4: Load voice extension plugin..."
node -e "import('/Users/saustin/.openclaw/workspace/repos/openclaw-discord-voice/plugins/voice-extension/dist/index.js').then(() => console.log('  ✅ Passed')).catch(e => (console.log('  ❌ Failed: ' + e.message), process.exit(1)))"

# Test 5: Crypto check
echo "Test 5: Native AES-256-GCM support..."
node -e "const has = require('crypto').getCiphers().includes('aes-256-gcm'); console.log(has ? '  ✅ Passed' : '  ❌ Missing native crypto'); process.exit(has ? 0 : 1)"

echo "========================================="
echo "✅ All smoke tests passed!"
```

- [ ] Test 1: @discordjs/opus loads ✅
- [ ] Test 2: @discordjs/voice loads ✅
- [ ] Test 3: Opus encoding works ✅
- [ ] Test 4: Plugin loads ✅
- [ ] Test 5: AES-256-GCM available ✅

### Dependency Verification

```bash
npm list --depth=0 | grep -E "opus|voice|prism|discord"
```

Expected to see:
- `@discordjs/opus@0.10.0`
- `@discordjs/voice@0.19.0`
- `prism-media@1.3.5`
- `discord-api-types@0.38.38`

- [ ] All expected packages listed
- [ ] Versions match documented versions
- [ ] No duplicate entries

---

## Commit & Document

### Git Commit

```bash
cd /Users/saustin/.openclaw/workspace/repos/openclaw-discord-voice/

git add .
git commit -m "feat: Phase 1 complete - Dependencies & Foundation

- Install @discordjs/opus 0.10.0 for Opus codec
- Create voice-extension plugin structure
- Set up TypeScript build pipeline
- Document dependencies and versions
- All smoke tests passing

Phase 1 research: PHASE1_RESEARCH_REPORT.md
Quick reference: PHASE1_SUMMARY.md
Dependencies: DEPENDENCIES.md"
```

- [ ] Changes committed to git
- [ ] Commit message is clear
- [ ] All files tracked

### Final Report

- [ ] Summary created and shared with main agent
- [ ] All research documents complete
- [ ] Implementation notes documented
- [ ] Next steps clear

---

## Success Criteria

✅ **Phase 1 Complete When:**

1. **Installation:**
   - [ ] @discordjs/opus installed in OpenClaw
   - [ ] npm install succeeds with no errors
   - [ ] All optional deps attempted (ok if some fail)

2. **Structure:**
   - [ ] Plugin directory created
   - [ ] package.json and tsconfig.json in place
   - [ ] src/ directory with types.ts

3. **Build:**
   - [ ] TypeScript compiles without errors
   - [ ] dist/ folder created with .js and .d.ts files
   - [ ] Watch mode works

4. **Testing:**
   - [ ] All 5 smoke tests pass
   - [ ] Opus encoding round-trip works
   - [ ] No import errors

5. **Documentation:**
   - [ ] README.md updated
   - [ ] INSTALLATION.md created
   - [ ] PLAN.md Phase 1 marked complete

---

## Blockers & Mitigation

### If Native Compilation Fails

**Problem:** `@discordjs/opus` won't compile  
**Solution:**
1. Install build tools (see DEPENDENCIES.md troubleshooting)
2. Retry npm install
3. If still fails, use opusscript as temporary workaround

- [ ] Build tools installed (if needed)
- [ ] Compilation succeeds

### If Package Conflicts

**Problem:** Version conflicts with existing packages  
**Solution:**
1. Run `npm list` to see conflicts
2. Check PHASE1_RESEARCH_REPORT.md compatibility matrix
3. Adjust version ranges if needed

- [ ] No conflicts in npm list
- [ ] All versions in compatible range

### If Tests Fail

**Problem:** Smoke tests fail  
**Solution:**
1. Check error message
2. Consult DEPENDENCIES.md troubleshooting section
3. Verify file paths and permissions
4. Check OpenClaw is latest version (2026.2.2-3)

- [ ] All smoke tests pass
- [ ] No error messages

---

## Sign-Off

- [ ] Implementation agent reviewed this checklist
- [ ] All items completed
- [ ] Tests verified
- [ ] Main agent notified of completion
- [ ] Ready for Phase 2: Voice Connection Manager

---

**Prepared by:** Voice Integration Planning Agent  
**For:** Implementation Agent  
**Timeline:** 2-3 hours for full Phase 1  
**Status:** Ready for implementation ✅
