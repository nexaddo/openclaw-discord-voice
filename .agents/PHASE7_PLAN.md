# Phase 7: Discord Plugin Integration - Implementation Plan

**Last Updated:** 2026-02-06 22:40 EST  
**Status:** Ready for Implementation  
**Duration:** 1-2 days (5-6 working hours)  
**Dependencies:** Phases 1-6 (Phase 6 must be merged before integration testing)

---

## 📋 Overview

Phase 7 integrates the voice system into the Discord plugin with slash commands and event handlers. This phase:

1. **Exposes voice capabilities** via Discord slash commands
2. **Manages guild state** for persistent voice sessions
3. **Handles Discord events** (user joined, user left, channel disconnected, etc.)
4. **Provides user feedback** through Discord messages and embeds
5. **Implements permission checks** for admin operations
6. **Integrates with Phase 6** Voice Command Pipeline (after Phase 6 is merged)

---

## 🎯 Success Criteria

### Functional Requirements
- [ ] `/voice ask "question"` command works - asks Rue in voice channel
- [ ] `/voice start` command works - starts voice mode  
- [ ] `/voice stop` command works - stops voice mode
- [ ] Voice events handled: user joined, user left, channel disconnected
- [ ] Guild state persists across bot restarts
- [ ] Permission validation working
- [ ] Error messages clear to users

### Testing Requirements
- [ ] 40+ test cases covering all scenarios
- [ ] Command handler tests (15+ cases)
- [ ] Event handler tests (15+ cases)
- [ ] Guild state management tests (10+ cases)
- [ ] All tests passing
- [ ] Code coverage >80%

### Code Quality
- [ ] TypeScript strict mode
- [ ] ESLint passes (0 errors)
- [ ] No console.log (use proper logging)
- [ ] Proper error handling
- [ ] Documentation complete

### Integration with Phase 6
- [ ] Slash commands correctly route to VoiceCommandPipeline
- [ ] Error handling maps pipeline errors to Discord messages
- [ ] Voice responses played through Discord audio
- [ ] Guild state updated after voice interactions

---

## 📁 Target Project Structure (to be created in implementation PR)

**Note:** The following file structure is planned for the Phase 7 implementation PR. These files will be created from this specification.

```
plugins/
├── voice-extension/          # Phase 1-3 (existing)
│   ├── src/
│   │   ├── VoiceConnectionManager.ts
│   │   ├── AudioStreamHandler.ts
│   │   ├── types.ts
│   │   └── index.ts
│   └── __tests__/
│       ├── VoiceConnectionManager.test.ts
│       └── AudioStreamHandler.test.ts
│
└── discord-plugin/          # Phase 7 (NEW)
    ├── src/
    │   ├── commands/         # Slash command definitions
    │   │   ├── voice.ts      # /voice command group
    │   │   └── types.ts      # Command types
    │   │
    │   ├── handlers/         # Command/event handlers
    │   │   ├── CommandHandler.ts    # Routes commands
    │   │   ├── EventHandler.ts      # Handles Discord events
    │   │   ├── VoiceHandler.ts      # Voice-specific logic
    │   │   └── errors.ts            # Error handling utilities
    │   │
    │   ├── state/            # Guild state management
    │   │   ├── GuildStateManager.ts
    │   │   ├── StateStore.ts
    │   │   └── types.ts
    │   │
    │   ├── integration/      # Phase 6 integration
    │   │   └── PipelineAdapter.ts   # Adapts VoiceCommandPipeline
    │   │
    │   ├── utils/
    │   │   ├── embeds.ts     # Discord embed builders
    │   │   ├── logger.ts     # Logging utilities
    │   │   └── validation.ts # Input validation
    │   │
    │   ├── types.ts          # Plugin-wide types
    │   └── index.ts          # Main plugin export
    │
    └── __tests__/            # 40+ tests
        ├── commands/
        │   └── voice.test.ts        # 15+ test cases
        ├── handlers/
        │   ├── CommandHandler.test.ts  # 8+ test cases
        │   ├── EventHandler.test.ts    # 12+ test cases
        │   └── VoiceHandler.test.ts    # 8+ test cases
        ├── state/
        │   └── GuildStateManager.test.ts # 10+ test cases
        └── integration/
            └── PipelineAdapter.test.ts   # 6+ test cases
```

---

## 🔧 Slash Commands

### `/voice ask "question"`
**Purpose:** Ask Rue a question in voice channel  
**Usage:** `/voice ask "What's the weather?"`  
**Behavior:**
1. Check if user is in voice channel
2. Check bot has permission to join that channel
3. Get question text
4. Send to VoiceCommandPipeline
5. Play voice response
6. Return status to user

**Response Options:**
- "🎤 Asking Rue..." (while processing)
- "✅ Response played" (success)
- "❌ Error: [message]" (failure)

### `/voice start`
**Purpose:** Start voice listening mode  
**Usage:** `/voice start`  
**Behavior:**
1. Check if user is in voice channel
2. Join voice channel (bot)
3. Enable continuous listening (Phase 6 feature)
4. Store guild state
5. Confirm to user

**Response:**
- "✅ Voice mode started in #channel"
- "❌ Error: [message]"

### `/voice stop`
**Purpose:** Stop voice listening mode  
**Usage:** `/voice stop`  
**Behavior:**
1. Check if bot is connected in this guild
2. Leave voice channel
3. Update guild state
4. Confirm to user

**Response:**
- "✅ Voice mode stopped"
- "❌ Error: [message]"

---

## 📡 Event Handlers

### `guildVoiceStateUpdate` 
**Trigger:** User joins/leaves voice channel  
**Behavior:**
- If user joins: Announce in text channel (optional feature)
- If user leaves: Continue listening or notify
- Track active speakers for Phase 6 integration

### `voiceChannelDelete`
**Trigger:** Voice channel is deleted  
**Behavior:**
- Check if bot was connected to deleted channel
- Disconnect gracefully
- Update guild state
- Notify users if applicable

### `voiceStateUpdate` (bot)
**Trigger:** Bot's voice state changes  
**Behavior:**
- Update guild state
- Emit "bot disconnected" if unexpected
- Handle reconnection logic

### `guildDelete`
**Trigger:** Bot removed from guild  
**Behavior:**
- Clean up guild state
- Close connections
- Log event

---

## 💾 Guild State Management

### State Schema
```typescript
interface GuildVoiceState {
  guildId: string;
  channelId: string | null;        // Current voice channel (null = not connected)
  voiceMode: 'off' | 'listening' | 'active';
  connectedAt: number | null;
  activeUsers: Set<string>;        // Users in voice channel
  lastActivity: number;            // Last user activity
  pipelineStatus: 'ready' | 'processing' | 'error';
  errorCount: number;              // For monitoring
}
```

### State Persistence
- **Storage:** JSON file + in-memory Map
- **Location:** `./data/guild-states.json` (or configurable)
- **Sync:** On every state change + periodic save
- **Recovery:** Load on bot startup

---

## 🧪 Test Cases

### Command Tests (15+ cases)

**Voice Ask Command**
1. ✅ Command parses correctly
2. ✅ User in voice channel - success path
3. ❌ User NOT in voice channel - error
4. ❌ Bot NO PERMISSION - error
5. ❌ Empty question - error
6. ✅ Question with special characters
7. ✅ Response played successfully
8. ❌ Pipeline error handling

**Voice Start Command**
9. ✅ Start in voice channel
10. ❌ Start when not in channel
11. ❌ Already connected - skip
12. ✅ State persisted
13. ❌ Permission denied

**Voice Stop Command**
14. ✅ Stop when connected
15. ❌ Stop when not connected

### Event Handler Tests (15+ cases)

**Voice State Updates**
1. ✅ User joins - tracked
2. ✅ User leaves - tracked
3. ✅ Bot joins - state updated
4. ✅ Bot leaves - state updated

**Channel Delete**
5. ✅ Bot connected to deleted channel
6. ✅ Bot disconnected before delete

**Guild Delete**
7. ✅ Guild state cleaned up
8. ✅ Connections closed

**State Changes**
9. ✅ Transition off → listening
10. ✅ Transition listening → active
11. ✅ Transition active → off
12. ✅ Invalid transitions rejected
13. ✅ Error state recovery
14. ✅ Concurrent state updates handled
15. ✅ State persistence verified

### State Management Tests (10+ cases)

1. ✅ Guild state created
2. ✅ Guild state updated
3. ✅ Guild state deleted
4. ✅ State persistence to file
5. ✅ State loaded on startup
6. ✅ State recovery on crash
7. ✅ Concurrent updates handled
8. ✅ Memory cleanup on guild delete
9. ✅ State file corruption recovery
10. ✅ State validation

### Integration Tests (6+ cases)

1. ✅ Command → Pipeline → Response flow
2. ✅ Error propagation
3. ✅ Pipeline timeout handling
4. ✅ Concurrent requests
5. ✅ State consistency with pipeline
6. ✅ Full voice conversation cycle (Phase 6 ready)

---

## 🔌 Integration with Phase 6

### How They Work Together

```
User Command
    ↓
CommandHandler (/voice ask)
    ↓
PipelineAdapter (maps Phase 7 → Phase 6)
    ↓
VoiceCommandPipeline (Phase 6)
    ├─ AudioStreamHandler (capture)
    ├─ SpeechToText (transcribe)
    ├─ Agent (process)
    └─ TextToSpeech (respond)
    ↓
Response Handler
    ├─ Play audio in Discord voice
    └─ Send status to text channel
```

### PipelineAdapter Interface
```typescript
interface PipelineAdapter {
  // Request audio from Phase 6
  requestAudio(guildId: string): Promise<AudioData>;
  
  // Send response to Phase 6
  sendResponse(guildId: string, text: string): Promise<AudioData>;
  
  // Start continuous listening
  startListening(guildId: string): Promise<void>;
  
  // Stop listening
  stopListening(guildId: string): Promise<void>;
}
```

### Error Mapping
- **Pipeline Timeout** → "Rue is taking a while... please try again"
- **STT Error** → "Couldn't understand audio, please try again"
- **Agent Error** → "Rue encountered an error"
- **TTS Error** → "Couldn't generate response audio"

---

## 📝 Implementation Phases

### Phase 7a: Test Suite & Types (30 minutes)
1. Create test files with all 40+ test cases (skeleton)
2. Define all types
3. Verify test framework works

### Phase 7b: Discord Commands (1 hour)
1. Implement `/voice ask` command
2. Implement `/voice start` command
3. Implement `/voice stop` command
4. Command tests pass

### Phase 7c: Event Handlers (45 minutes)
1. Implement VoiceStateUpdate handler
2. Implement ChannelDelete handler
3. Implement GuildDelete handler
4. Event tests pass

### Phase 7d: State Management (45 minutes)
1. Implement GuildStateManager
2. Implement StateStore (persistence)
3. State tests pass

### Phase 7e: Error Handling & Utils (30 minutes)
1. Implement error handling utilities
2. Implement Discord embeds
3. Implement logging

### Phase 7f: Integration with Phase 6 (1 hour - WAIT for Phase 6)
1. Implement PipelineAdapter
2. Connect commands to pipeline
3. Integration tests pass
4. **NOTE:** Start this only after Phase 6 PR is merged

### Phase 7g: Testing & Documentation (45 minutes)
1. Run full test suite
2. Fix any failures
3. Document API
4. Create PR

---

## 🚀 Deployment Readiness

### Before PR
- [ ] All 40+ tests passing
- [ ] No TypeScript errors
- [ ] ESLint passes
- [ ] Code coverage >80%
- [ ] No hardcoded values (use env vars)

### Before Merge
- [ ] Code review approved
- [ ] Phase 6 integration verified (if merged)
- [ ] Manual testing in Discord
- [ ] Error scenarios tested

### Production Checklist
- [ ] Permissions properly scoped
- [ ] Rate limiting considered
- [ ] State persistence working
- [ ] Graceful shutdown implemented
- [ ] Logging/monitoring in place

---

## 🔗 Dependencies & Assumptions

### Phase Boundaries
- **Phase 1-3:** Voice Extension (DONE)
- **Phase 4:** STT Integration (pending)
- **Phase 5:** TTS Integration (pending)
- **Phase 6:** Voice Command Pipeline (pending - WAIT for this before integration)
- **Phase 7:** This phase (Discord Plugin Integration)
- **Phase 8:** CI/CD & Deployment (pending)

### External Dependencies
- Discord.js: For bot interactions
- OpenClaw Framework: For plugin structure
- Vitest: For testing

### Environment Variables
```
DISCORD_TOKEN=your_bot_token
GUILD_ID=your_test_guild_id
VOICE_STATE_FILE=./data/guild-states.json
DEBUG=false
```

---

## 📊 Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Phase 6 not ready | Medium | High | Wait for PR, implement rest in parallel |
| Concurrent state updates | Low | High | Use locks/queues, comprehensive tests |
| Memory leaks | Low | Medium | Cleanup in handlers, periodic audits |
| Discord API rate limits | Low | Medium | Batch operations, cache responses |
| Permission issues | Low | Medium | Test matrix, clear error messages |

---

## ✅ Acceptance Criteria

### Definition of Done
- [ ] All 40+ tests passing
- [ ] Code coverage >80%
- [ ] No TypeScript/ESLint errors
- [ ] All 3 slash commands functional
- [ ] All 4 event handlers working
- [ ] Guild state persists & recovers
- [ ] Integration with Phase 6 ready (after Phase 6 merged)
- [ ] PR created to `phase7-discord-plugin` branch
- [ ] Documentation complete

### Manual Testing Checklist
- [ ] `/voice ask` in test guild works
- [ ] `/voice start` connects bot to voice
- [ ] `/voice stop` disconnects bot
- [ ] User join/leave events handled
- [ ] Guild state file created/updated
- [ ] Bot restarts with state intact
- [ ] Error messages user-friendly
- [ ] No memory leaks after 1hr test

---

## 📞 Status & Next Steps

**Current Status:** Ready for Implementation  
**Next Action:** Start with test suite creation  
**Blockers:** None (Phase 6 integration deferred until merged)  
**Timeline:** 
- Start: 2026-02-06 22:40
- Complete tests/types: 2026-02-07 09:00
- Complete implementation: 2026-02-07 16:00
- PR & documentation: 2026-02-07 17:00

---

## 📚 References

- **PHASES3-8_OVERVIEW.md** - High-level roadmap
- **IMPLEMENTATION_ROADMAP.md** - Week-by-week timeline
- **Phase 6 Spec** - VoiceCommandPipeline interface (pending)
- **Discord.js Documentation** - Command handling & events

---

**Plan Status:** ✅ Ready for Implementation  
**Assigned:** Phase 7 Subagent  
**Created:** 2026-02-06 22:40 EST  
**Last Updated:** 2026-02-06 22:40 EST
