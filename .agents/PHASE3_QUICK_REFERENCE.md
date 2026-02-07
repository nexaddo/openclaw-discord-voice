# Phase 3 Quick Reference

**Document:** `PHASE3_PLAN.md` (44 KB, 1500+ lines)  
**For:** Implementation Agent  
**Time to Read:** 10-15 minutes  
**Full Read Time:** 45-60 minutes

---

## What's in PHASE3_PLAN.md

### Section 1: Architecture (Pages 1-3)
**Audio flow and specifications**
- Inbound/outbound audio flow diagrams
- Discord audio specs (48kHz stereo, 20ms frames)
- Buffer specifications
- Three-buffer strategy explanation

**👉 Start here** for understanding audio flow

### Section 2: Class Design (Pages 4-6)
**AudioStreamHandler class structure**
- 12+ public methods with signatures
- Properties (buffers, codecs, listeners)
- All type definitions (8+ interfaces)
- CircularBuffer implementation

**👉 Use this** when implementing the class

### Section 3: Types & Interfaces (Pages 6-10)
**Complete TypeScript definitions**
- AudioFrame, OpusFrame, UserAudioStream
- PlaybackStatus, AudioStreamStats
- AudioStreamListener interface
- AudioStreamError and error codes
- CircularBuffer<T> generic class
- AudioStreamHandlerOptions

**👉 Copy these** into `src/types.ts`

### Section 4: Buffer Management (Pages 10-12)
**Three-buffer strategy and overflow handling**
- Jitter buffer (200ms, internal)
- Capture buffer (200-500ms, public API)
- Playback buffer (500-1000ms, internal)
- Overflow handling flow
- Frame age trimming logic
- Buffer underflow recovery

**👉 Reference this** for buffer implementation

### Section 5: Opus Codec (Pages 12-15)
**Encoding/decoding implementation**
- OpusEncoder setup (48kHz, 2ch, 60ms frames)
- OpusDecoder setup and per-user tracking
- Encoding: PCM 3,840 bytes → Opus 20-60 bytes
- Decoding: Opus → PCM 3,840 bytes
- Error handling for both directions
- Key Opus parameters table

**👉 Follow this** for audio codec implementation

### Section 6: Test Cases (Pages 15-24)
**48 detailed test cases in 8 sections**
- A: Constructor & Initialization (6 tests)
- B: Audio Capture (10 tests)
- C: Audio Playback (10 tests)
- D: Opus Encoding (8 tests)
- E: Opus Decoding (8 tests)
- F: Buffer Management (6 tests)
- G: User Audio Streams (4 tests)
- H: Error Handling (4 tests)
- Test utilities and mocks

**👉 Copy these** into `__tests__/AudioStreamHandler.test.ts`

### Section 7: Integration (Pages 24-25)
**How Phase 3 integrates with Phase 2**
- VoiceConnectionManager provides VoiceConnection
- AudioStreamHandler wraps VoiceConnection
- Event flow between phases
- VoiceConnection interface reference

**👉 Study this** for integration patterns

### Section 8: Success Criteria (Pages 25-26)
**Definition of "Phase 3 complete"**
- Functional requirements (9 items)
- Audio quality requirements (6 items)
- Code quality requirements (8 items)
- Resource management (6 items)
- Integration requirements (5 items)

**👉 Check this** before submitting work

### Section 9: Implementation Checklist (Pages 26-35)
**Step-by-step guide with detailed sub-tasks**
- Phase 3.1: Setup & Types (30 min)
- Phase 3.2: Test Suite (1 hour) - TDD approach
- Phase 3.3: Implementation (1.5 hours) - 8 sub-steps
- Phase 3.4: Integration Testing (30 min)
- Phase 3.5: Build & Verification (30 min)
- Phase 3.6: Code Review & Docs (30 min)
- Phase 3.7: Final Verification (20 min)
- Phase 3.8: Commit (10 min)

**👉 Follow this** for actual implementation work

### Section 10: Resources (Pages 35-39)
- Timing summary table
- Known limitations
- Future enhancements
- References & links
- Class API quick reference
- Configuration examples
- Common usage patterns
- Q&A

**👉 Reference this** while coding and for questions

---

## Implementation Flow (TDD)

```
Step 1: Read PHASE3_PLAN.md (section 1-3)
  → Understand architecture, class design, types
  
Step 2: Create test suite first (section 3.2)
  → Write 48 tests (they will fail)
  → Test every feature
  
Step 3: Implement AudioStreamHandler (section 3.3)
  → Write code to pass tests
  → One section at a time (8 sub-steps)
  → Commit after each sub-step
  
Step 4: Verify all tests pass (section 3.7)
  → Run: npm test
  → Expected: 48/48 passing
  
Step 5: Build and verify (section 3.5)
  → Run: npm run build
  
Step 6: Complete documentation (section 3.6)
  → Add JSDoc, usage examples
  
Step 7: Final verification (section 3.7)
  → All success criteria met
  
Step 8: Commit (section 3.8)
  → Git commit with proper message
```

---

## Key Implementation Details

### Class Constructor
- Takes VoiceConnection + guildId (required)
- Optional: AudioStreamHandlerOptions
- Initialize: circular buffers, encoders, listeners
- Setup: event listeners on VoiceConnection

### Audio Capture
- Signature: `captureUserAudio(userId: string): AudioBuffer[] | null`
- Returns: array of AudioFrame objects
- Or null if user not speaking
- Each frame: 960 samples, 48kHz, 2 channels

### Audio Playback
- Signature: `async playAudioStream(audioData: Buffer): Promise<void>`
- Input: PCM audio buffer
- Adds to playback buffer queue
- Automatic feeding to Discord stream

### Opus Encoding
- Input: 3,840 bytes PCM (20ms)
- Output: 20-60 bytes Opus (variable)
- Speed: <5ms per frame
- Error: throws AudioStreamError

### Opus Decoding
- Input: Opus frame (20-60 bytes)
- Output: 3,840 bytes PCM
- Per-user decoders (Map<ssrc, decoder>)
- Handle silence frames (DTX, 1 byte)

### Buffer Management
- CircularBuffer<T> for fixed-size FIFO
- Automatic wraparound on overflow
- Jitter buffer: 200ms (10 frames)
- Capture buffer: 200-500ms configurable
- Playback buffer: 500-1000ms configurable
- Trim old frames every 100ms

### State Management
- `isCapturing` boolean
- `isPlaying` boolean
- userAudioStreams Map<userId, UserAudioStream>
- opusDecoders Map<ssrc, OpusDecoder>
- Statistics tracking

### Event System
- addEventListener(listener: AudioStreamListener)
- Events: frameCaptured, frameDropped, userStartedSpeaking, userStoppedSpeaking, playbackBufferLow, playbackBufferFull, error
- Emit on specific conditions
- Multiple listeners supported

---

## Files to Create/Modify

### Create
- `plugins/voice-extension/src/AudioStreamHandler.ts` (main class, ~800 lines)
- `plugins/voice-extension/__tests__/AudioStreamHandler.test.ts` (48 tests, ~1200 lines)
- `plugins/voice-extension/test-utils/audio-frames.ts` (test helpers)

### Modify
- `plugins/voice-extension/src/types.ts` (add audio types)
- `plugins/voice-extension/src/index.ts` (export new classes)

### Documentation
- Update main README.md
- Create PHASE3_IMPLEMENTATION.md (usage guide)

---

## Timing Summary

| Phase | Task | Time |
|-------|------|------|
| 3.1 | Setup & types | 30 min |
| 3.2 | Write 48 tests | 60 min |
| 3.3 | Implementation (8 sub-steps) | 90 min |
| 3.4 | Integration testing | 30 min |
| 3.5 | Build & verify | 30 min |
| 3.6 | Documentation | 30 min |
| 3.7 | Final verification | 20 min |
| 3.8 | Commit | 10 min |
| **TOTAL** | | **5 hours** |

**Realistic Duration:** 2.5-3.5 hours (with breaks)

---

## Audio Specifications (Must Know)

| Parameter | Value |
|-----------|-------|
| Sample Rate | 48,000 Hz (strictly) |
| Channels | 2 (stereo, always) |
| Sample Format | PCM int16 little-endian |
| Frame Size | 960 samples (20ms @ 48kHz) |
| Frame Duration | 20 ms |
| PCM Frame Bytes | 3,840 (960 × 2 channels × 2 bytes) |
| Opus Frame Bytes | 20-60 (compressed) |
| Packet Rate | 50 packets/sec |

---

## Implementation Sub-Steps (3.3 breakdown)

```
3.3.1: Constructor & Initialization (15 min)
  └─ Tests: Section A (6 tests)
  
3.3.2: Circular Buffer (15 min)
  └─ Tests: Section F (6 tests)
  
3.3.3: Opus Encoder (20 min)
  └─ Tests: Section D (8 tests)
  
3.3.4: Opus Decoder (20 min)
  └─ Tests: Section E (8 tests)
  
3.3.5: Audio Capture (20 min)
  └─ Tests: Section B (10 tests)
  
3.3.6: Audio Playback (20 min)
  └─ Tests: Section C (10 tests)
  
3.3.7: User Streams & Stats (15 min)
  └─ Tests: Section G (4 tests)
  
3.3.8: Event System (10 min)
  └─ Tests: Section H (4 tests)
```

---

## Success Checklist

Before submitting, verify:

```
FUNCTIONALITY
☐ captureUserAudio() returns frames
☐ playAudioStream() queues audio
☐ encodeToOpus() produces Opus data
☐ decodeFromOpus() produces PCM
☐ Multiple users captured independently
☐ Buffer overflow handled
☐ Statistics tracking works

TESTS
☐ All 48 tests passing
☐ Section A: 6/6 (constructor)
☐ Section B: 10/10 (capture)
☐ Section C: 10/10 (playback)
☐ Section D: 8/8 (encoding)
☐ Section E: 8/8 (decoding)
☐ Section F: 6/6 (buffer)
☐ Section G: 4/4 (user streams)
☐ Section H: 4/4 (errors)

CODE QUALITY
☐ TypeScript strict mode passes
☐ No `any` types (except framework)
☐ JSDoc on all public methods
☐ No console.log() statements
☐ Clear variable names
☐ Proper error handling

AUDIO SPECS
☐ 48kHz sample rate strictly enforced
☐ 2 channel (stereo) enforced
☐ 3,840 byte frame size correct
☐ Opus frames 20-60 bytes
☐ <100ms latency maintained

INTEGRATION
☐ Works with Phase 2 VoiceConnection
☐ Events fire correctly
☐ Cleanup on destroy
☐ No memory leaks
☐ No unhandled errors

BUILD
☐ npm run build succeeds
☐ dist/ created
☐ types generated
☐ Exports correct

GIT
☐ Staged all changes
☐ Descriptive commit message
☐ No unintended files
```

---

## Key Classes & Methods

### AudioStreamHandler
```typescript
constructor(connection: VoiceConnection, guildId: string, options?: AudioStreamHandlerOptions)
async initialize(): Promise<void>
async destroy(): Promise<void>
async startCapture(): Promise<void>
async stopCapture(): Promise<void>
captureUserAudio(userId: string): AudioBuffer[] | null
async playAudioStream(audioData: Buffer): Promise<void>
encodeToOpus(pcmBuffer: Buffer): Buffer
decodeFromOpus(opusBuffer: Buffer, ssrc?: number): Buffer
getCaptureBufferSize(): number
getPlaybackBufferSize(): number
getPlaybackStatus(): PlaybackStatus
getCaptureStats(): AudioStreamStats
getPlaybackStats(): AudioStreamStats
addEventListener(listener: AudioStreamListener): void
removeEventListener(listener: AudioStreamListener): void
```

### CircularBuffer<T>
```typescript
constructor(maxSizeFrames: number)
push(frame: T): void
pop(): T | null
peek(offset?: number): T | null
clear(): void
getSize(): number
isFull(): boolean
isEmpty(): boolean
toArray(): T[]
```

---

## Troubleshooting

**Q: Tests failing on startup?**
A: Expected! TDD means tests fail first. Write code to pass them.

**Q: "Cannot find @discordjs/opus"?**
A: Dependency not installed. Must be done in Phase 1.

**Q: Opus encoding returns empty buffer?**
A: Check PCM buffer is exactly 3,840 bytes.

**Q: Memory growing over time?**
A: Check CircularBuffer isn't leaking. Verify destroy() called.

**Q: Audio has gaps/clicks?**
A: Buffer size too small. Increase playbackBufferSize.

**Q: Opus frames vary in size?**
A: Normal! Silence might be 1 byte, speech 30-60 bytes.

**Q: Multiple decoders overhead?**
A: One per unique user. Clean up inactive users periodically.

---

## Common Patterns

### Capture & Process
```typescript
const handler = new AudioStreamHandler(connection, guildId);
await handler.initialize();
await handler.startCapture();

// Get audio from user
const frames = handler.captureUserAudio('userId');
if (frames) {
  for (const frame of frames) {
    const opusData = handler.encodeToOpus(frame.data);
    // Send to Whisper API (Phase 4)
  }
}

await handler.stopCapture();
await handler.destroy();
```

### Play Audio
```typescript
const handler = new AudioStreamHandler(connection, guildId);
await handler.initialize();

// Get PCM audio from somewhere (TTS, file, etc.)
const pcmBuffer = Buffer.alloc(3840); // 20ms of audio

// Play it
await handler.playAudioStream(pcmBuffer);

// Check status
const status = handler.getPlaybackStatus();
console.log(`Playing: ${status.bufferedDuration}ms`);

await handler.destroy();
```

### Monitor Events
```typescript
handler.addEventListener({
  onFrameCaptured: (frame) => {
    console.log('Captured frame:', frame.sampleCount);
  },
  onUserStartedSpeaking: (userId) => {
    console.log('User speaking:', userId);
  },
  onPlaybackBufferLow: () => {
    console.warn('Playback buffer low!');
  },
  onError: (error) => {
    console.error('Audio error:', error.message);
  }
});
```

---

## Questions? See Full Plan

For detailed explanations, see:
- **Architecture:** PHASE3_PLAN.md Part 1
- **Class Design:** PHASE3_PLAN.md Part 2
- **Buffer Strategy:** PHASE3_PLAN.md Part 3
- **Opus Details:** PHASE3_PLAN.md Part 4
- **All Tests:** PHASE3_PLAN.md Part 5
- **Integration:** PHASE3_PLAN.md Part 6
- **Success Criteria:** PHASE3_PLAN.md Part 7
- **Detailed Checklist:** PHASE3_PLAN.md Part 8
- **Timing:** PHASE3_PLAN.md Part 9
- **References:** PHASE3_PLAN.md Part 10-13

---

## Implementation Agent Workflow

### Session 1 (1.5 hours): Setup & Tests
- [ ] Read PHASE3_PLAN.md Part 1-3 (30 min)
- [ ] Create files and structure (15 min)
- [ ] Write 48 tests (45 min)
- [ ] Run tests - expect failures
- [ ] Commit: "test(voice): Phase 3 test suite"

### Session 2 (1.5 hours): Implementation Part 1
- [ ] Read PHASE3_PLAN.md Part 4-5 (20 min)
- [ ] Implement 3.3.1-3.3.4 (sub-steps) (70 min)
- [ ] Run tests - expect ~20/48 passing
- [ ] Commit progress

### Session 3 (1.5 hours): Implementation Part 2
- [ ] Implement 3.3.5-3.3.8 (sub-steps) (70 min)
- [ ] Run tests - expect 48/48 passing
- [ ] Commit: "feat(voice): Phase 3 core implementation"

### Session 4 (1 hour): Polish & Verify
- [ ] Integration testing (15 min)
- [ ] Build and verification (20 min)
- [ ] Documentation (15 min)
- [ ] Final verification (10 min)
- [ ] Commit: "feat(voice): Phase 3 complete"

---

**Prepared by:** Voice Integration Planning Agent (Phase 3)  
**Date:** 2026-02-07 19:54 EST  
**Status:** READY FOR IMPLEMENTATION ✅  
**Complexity:** Moderate 🟨  
**Success Rate:** 95%+
