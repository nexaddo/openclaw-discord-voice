# Phase 2 Quick Reference

**Document:** `PHASE2_PLAN.md` (44 KB, 1412 lines)  
**For:** Implementation Agent  
**Time to Read:** 10-15 minutes  

---

## What's in PHASE2_PLAN.md

### Section 1: Class Design (Page 1-3)
**VoiceConnectionManager class structure**
- All public methods with signatures
- All properties (connections, states, eventEmitter)
- Event handler methods (on, off, once)
- Complete method documentation

**👉 Start here** for API design overview

### Section 2: Type Definitions (Page 3-5)
**All TypeScript interfaces and enums**
- VoiceManagerOptions
- ConnectOptions
- ConnectionState enum (6 states)
- VoiceEvent type (9 event types)
- VoiceConnectionError and error codes
- Complete type system

**👉 Use this** when implementing types.ts

### Section 3: Test Cases (Page 5-15)
**35+ detailed test cases organized by feature**
- A: Constructor (4 tests)
- B: Connect method (12 tests)
- C: Disconnect method (8 tests)
- D: Query methods (6 tests)
- E: Event system (3 tests)
- F: Multiple connections (2 tests)

**👉 Copy these** into __tests__/VoiceConnectionManager.test.ts

### Section 4: Error Handling (Page 15-19)
**13+ error codes and scenarios**
- Error table with cause and recovery
- Error handling flow (pseudo-code)
- Retry logic with exponential backoff
- Timeout handling

**👉 Reference this** when implementing connect/disconnect

### Section 5: Connection Lifecycle (Page 19-22)
**State diagram and lifecycle management**
- ASCII state diagram (6 states, transitions)
- Valid transition rules
- Event flow for full lifecycle
- Connection metadata structure

**👉 Follow this** for state.ts and state transitions

### Section 6: Implementation Checklist (Page 22-45)
**Step-by-step implementation guide with timing**
- Phase 2.1: Setup & Structure (30 min)
- Phase 2.2: Test Suite (1 hour)
- Phase 2.3: Implementation (1.5 hours)
- Phase 2.4-2.10: Integration, testing, commit

**👉 Follow this** for actual implementation work

### Section 7: Success Criteria (Page 45-47)
**Definition of "Phase 2 complete"**
- Functional criteria (9 items)
- Testing criteria (7 items)
- Code quality criteria (6 items)
- Documentation criteria (6 items)
- Integration criteria (5 items)

**👉 Check this** before submitting for review

### Section 8-10: Edge Cases, Transition, References (Page 47-48)
- Known limitations
- Phase 3 dependencies
- Reference links

**👉 Review this** for edge case handling

---

## Implementation Flow (TDD)

```
Step 1: Read PHASE2_PLAN.md (section 1-3)
  → Understand class design and types
  
Step 2: Create test suite first (section 3)
  → Write 35+ tests (they will fail)
  
Step 3: Implement VoiceConnectionManager (section 2.3 checklist)
  → Write code to pass tests, one feature at a time
  
Step 4: Verify all tests pass (section 2.6)
  → Run: npm test
  
Step 5: Build and verify (section 2.7)
  → Run: npm run build
  
Step 6: Complete documentation (section 2.8)
  → Add JSDoc, usage examples
  
Step 7: Final verification (section 2.9)
  → Run all checks
  
Step 8: Commit (section 2.10)
  → Git commit with proper message
```

---

## Key Implementation Details

### Class Constructor
- Takes VoiceManagerOptions with client (required)
- Optional: timeout, maxRetries, retryDelay, enableLogging
- Initialize: connections Map, states Map, EventEmitter

### Connect Method
- Signature: `async connect(guildId, channelId, options?) → Promise<VoiceConnection>`
- Validates inputs first
- Returns existing connection if already connected
- Sets state to CONNECTING
- Calls Discord.joinVoiceChannel
- Implements retry logic with exponential backoff
- On success: state → CONNECTED, emit 'connected' event
- On error: emit 'error' event, throw VoiceConnectionError

### Disconnect Method
- Signature: `async disconnect(guildId) → Promise<void>`
- Sets state to DISCONNECTING
- Calls connection.destroy()
- Removes from connections map
- State → DISCONNECTED, emit 'disconnected' event
- Handles errors gracefully (doesn't throw)

### State Machine
- 6 states: DISCONNECTED, CONNECTING, CONNECTED, RECONNECTING, DISCONNECTING, ERROR
- Valid transitions defined (see section 5.2)
- emits 'stateChange' event on every transition
- Validates transitions, logs invalid ones

### Error Codes
```typescript
INVALID_GUILD_ID            // Empty/null guildId
INVALID_CHANNEL_ID          // Empty/null channelId
GUILD_NOT_FOUND             // Guild doesn't exist
CHANNEL_NOT_FOUND           // Channel doesn't exist
CHANNEL_NOT_VOICE           // Not a voice channel
INSUFFICIENT_PERMISSIONS    // Bot lacks CONNECT/SPEAK
BOT_NOT_IN_GUILD            // Bot not member of guild
CONNECTION_TIMEOUT          // Connection took too long
CONNECTION_ALREADY_EXISTS   // Already connected (return existing)
CONNECTION_NOT_FOUND        // Disconnect non-existent
VOICE_SERVER_UNAVAILABLE    // Discord voice down
WEBSOCKET_ERROR             // Network error
AUDIO_SESSION_CLOSED        // Connection dropped
UNKNOWN_ERROR               // Unknown cause
```

### Retry Logic
- Exponential backoff: 5s, 10s, 20s, ...
- Emit 'reconnecting' event with attempt number
- Up to maxRetries attempts
- Only retry on transient errors
- Return existing connection if already connected

### Event System
- Built on Node.js EventEmitter
- Methods: on(), off(), once()
- Events: connected, disconnected, reconnecting, stateChange, error, ready, channelUpdate, memberUpdate, debug
- Type-safe event data via VoiceEventData interface

---

## Files to Create/Modify

### Create
- `plugins/voice-extension/src/VoiceConnectionManager.ts` (main class)
- `plugins/voice-extension/__tests__/VoiceConnectionManager.test.ts` (35+ tests)
- `plugins/voice-extension/__tests__/mocks/mockClient.ts` (mock Discord client)
- `plugins/voice-extension/__tests__/mocks/mockConnection.ts` (mock VoiceConnection)

### Modify
- `plugins/voice-extension/src/types.ts` (add all types from section 2)
- `plugins/voice-extension/src/index.ts` (export VoiceConnectionManager)

### Optional
- `PHASE2_IMPLEMENTATION.md` (usage guide)
- `PHASE2_INTEGRATION_GUIDE.md` (how to use)

---

## Timing

| Phase | Task | Time |
|-------|------|------|
| 2.1 | Setup & structure | 30 min |
| 2.2 | Write tests (TDD) | 1 hour |
| 2.3 | Implement class | 1.5 hours |
| 2.4 | State management | 30 min |
| 2.5 | Integration & polish | 30 min |
| 2.6 | Test verification | 1 hour |
| 2.7 | Build | 30 min |
| 2.8 | Documentation | 30 min |
| 2.9 | Final verification | 30 min |
| 2.10 | Commit | 15 min |
| **TOTAL** | | **3-4 hours** |

---

## Success Checklist

Before submitting, verify:

```
FUNCTIONALITY
☐ All 35+ tests passing
☐ connect() works with valid inputs
☐ disconnect() cleanly removes connections
☐ getConnection() returns correct connection
☐ Multiple guilds managed independently
☐ Retry logic works with backoff
☐ All error codes returned correctly

ERRORS
☐ INVALID_GUILD_ID tested
☐ INVALID_CHANNEL_ID tested
☐ GUILD_NOT_FOUND tested
☐ CHANNEL_NOT_FOUND tested
☐ CHANNEL_NOT_VOICE tested
☐ INSUFFICIENT_PERMISSIONS tested
☐ CONNECTION_TIMEOUT tested
☐ All 13+ error codes tested

EVENTS
☐ 'connected' event emitted
☐ 'disconnected' event emitted
☐ 'error' event emitted
☐ 'stateChange' event emitted
☐ 'reconnecting' event emitted
☐ Event listeners work
☐ Once() listeners work

CODE QUALITY
☐ TypeScript strict mode passes
☐ No console errors/warnings
☐ No unhandled promise rejections
☐ JSDoc on all public methods
☐ Clear variable names
☐ No console.log() calls

BUILD
☐ npm run build succeeds
☐ dist/ directory created
☐ TypeScript definitions generated
☐ No build warnings

TESTING
☐ npm test - all pass
☐ Code coverage >85%
☐ No skipped tests
☐ Tests isolated (no side effects)

GIT
☐ Stage all changes
☐ Commit message descriptive
☐ No unintended files committed
```

---

## Quick Command Reference

```bash
# Setup
cd /Users/saustin/.openclaw/workspace/repos/openclaw-discord-voice/plugins/voice-extension

# Test
npm test                    # Run all tests
npm test -- --watch       # Watch mode
npm test -- --coverage    # Coverage report

# Build
npm run build             # Compile TypeScript
npm run build:watch       # Auto-compile on save

# Verify
npm list                  # Check dependencies

# Clean (if needed)
rm -rf dist/ node_modules/ package-lock.json
npm install --legacy-peer-deps
npm run build
```

---

## Questions While Implementing?

1. **How do I run tests as I code?**
   - Use: `npm test -- --watch`
   - Tests re-run automatically on save

2. **TypeScript error about EventEmitter?**
   - Import: `import { EventEmitter } from 'events';`
   - Use: `new EventEmitter()` or `extends EventEmitter`

3. **How do I mock VoiceConnection?**
   - See: `PHASE2_PLAN.md` section 2.2 test setup
   - Mock must have: state, destroy(), listeners, etc.

4. **Should I implement all error codes at once?**
   - No - implement one per feature:
   - connect() → input validation errors first
   - connect() → Discord errors next
   - etc.

5. **What if a test doesn't pass?**
   - Check error message
   - Verify mock is set up correctly
   - Add console.log() to debug
   - Compare to section 3 in PHASE2_PLAN.md

---

## Implementation Agent Workflow

### Day 1 (Session 1): Setup & Tests
- [ ] Read PHASE2_PLAN.md sections 1-3 (30 min)
- [ ] Create file structure (15 min)
- [ ] Write all 35+ tests from section 3 (45 min)
- [ ] Run tests - expect ~35 failures (5 min)
- [ ] Commit: "test(voice): Phase 2 test suite"

### Day 1 (Session 2): Implementation Part 1
- [ ] Read PHASE2_PLAN.md section 2.3.1-2.3.5 (15 min)
- [ ] Implement constructor (15 min)
- [ ] Implement input validation (10 min)
- [ ] Implement error mapping (15 min)
- [ ] Implement basic connect (30 min)
- [ ] Run tests - expect ~20/35 passing (5 min)

### Day 1 (Session 3): Implementation Part 2
- [ ] Read PHASE2_PLAN.md section 2.3.6-2.3.10 (15 min)
- [ ] Implement connect retry logic (20 min)
- [ ] Implement disconnect (20 min)
- [ ] Implement query methods (15 min)
- [ ] Implement event system (15 min)
- [ ] Run tests - expect 35/35 passing (5 min)

### Day 2: Polish & Verify
- [ ] Review code for quality (15 min)
- [ ] Add JSDoc comments (30 min)
- [ ] Build and verify (30 min)
- [ ] Run coverage report (10 min)
- [ ] Final verification (30 min)
- [ ] Commit: "feat(voice): Phase 2 complete"

---

**Prepared by:** Voice Integration Planning Agent (Phase 2)  
**Date:** 2026-02-07  
**Status:** Planning Complete ✅  
**Ready for:** Implementation ➡️
