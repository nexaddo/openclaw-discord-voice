# Discord Voice Integration - Implementation Plan

**Created:** 2026-02-06 18:16 EST  
**Status:** Planning  
**Estimated Duration:** 60-90 minutes

## Overview

Implement full Discord voice integration for OpenClaw, enabling real-time voice chat with Rue using:

- Discord.js voice library (already available)
- OpenAI Whisper API (STT - already configured)
- ElevenLabs nova voice (TTS - already configured)

## Architecture

### Components

1. **Voice Extension** (`openclaw-voice-extension`)
   - Discord voice connection manager
   - Audio stream handler
   - Voice state tracking

2. **STT Pipeline**
   - Audio buffer capture
   - Whisper API integration
   - Text extraction

3. **TTS Pipeline**
   - ElevenLabs API integration
   - Audio stream generation
   - Discord opus encoding

4. **Command Interface**
   - `/voice join` - Join user's current voice channel
   - `/voice leave` - Leave voice channel
   - Auto-transcription of voice input
   - Voice response generation

## Implementation Phases

### Phase 1: Dependencies & Foundation

**Files to modify:**

- `package.json` (add dependencies)
- Create: `plugins/voice-extension/package.json`

**Dependencies to install:**

- `@discordjs/opus` or `opusscript` (audio codec)
- `sodium-native` or `libsodium-wrappers` (encryption)
- `@discordjs/voice` (already available, verify version)

**Tests:**

- Verify dependencies install correctly
- Test opus encoding/decoding
- Test sodium encryption

**Success Criteria:**

- All dependencies installed without errors
- Opus can encode PCM audio
- Sodium can encrypt voice packets

---

### Phase 2: Voice Connection Manager

**Files to create:**

- `plugins/voice-extension/src/VoiceConnectionManager.ts`
- `plugins/voice-extension/src/types.ts`
- `plugins/voice-extension/test/VoiceConnectionManager.test.ts`

**Implementation:**

- VoiceConnectionManager class
  - `connect(guildId: string, channelId: string): Promise<VoiceConnection>`
  - `disconnect(guildId: string): Promise<void>`
  - `getConnection(guildId: string): VoiceConnection | null`
  - Event handlers for connection state changes

**Tests:**

- Test successful voice channel connection
- Test graceful disconnection
- Test connection state transitions
- Test error handling (invalid channel, permissions)

**Success Criteria:**

- Can join voice channels programmatically
- Can leave voice channels cleanly
- Handles connection errors gracefully
- Maintains connection state correctly

---

### Phase 3: Audio Stream Handler

**Files to create:**

- `plugins/voice-extension/src/AudioStreamHandler.ts`
- `plugins/voice-extension/test/AudioStreamHandler.test.ts`

**Implementation:**

- AudioStreamHandler class
  - `captureUserAudio(userId: string): AudioBuffer[]`
  - `playAudioStream(audioData: Buffer): Promise<void>`
  - Buffer management for voice packets
  - Opus encoding/decoding

**Tests:**

- Test audio capture from Discord streams
- Test audio playback to Discord
- Test opus encoding/decoding
- Test buffer overflow handling

**Success Criteria:**

- Can capture user voice data
- Can play audio back to voice channel
- Opus encoding works correctly
- No audio buffer overflows

---

### Phase 4: STT Integration (Whisper)

**Files to create:**

- `plugins/voice-extension/src/SpeechToText.ts`
- `plugins/voice-extension/test/SpeechToText.test.ts`

**Implementation:**

- SpeechToText class
  - `transcribe(audioBuffer: Buffer[]): Promise<string>`
  - Integration with OpenAI Whisper API (use existing skill)
  - Audio format conversion (opus → wav/mp3)
  - Voice Activity Detection (VAD) for detecting speech end

**Tests:**

- Test successful transcription
- Test handling of silence/noise
- Test VAD accuracy
- Test API error handling

**Success Criteria:**

- Accurately transcribes user speech
- Detects when user stops speaking
- Handles background noise
- Graceful API error handling

---

### Phase 5: TTS Integration (ElevenLabs)

**Files to create:**

- `plugins/voice-extension/src/TextToSpeech.ts`
- `plugins/voice-extension/test/TextToSpeech.test.ts`

**Implementation:**

- TextToSpeech class
  - `synthesize(text: string, voice: string): Promise<Buffer>`
  - Integration with ElevenLabs (use existing `sag` skill)
  - Audio format conversion for Discord
  - Streaming support for long responses

**Tests:**

- Test successful speech synthesis
- Test nova voice selection
- Test format conversion
- Test streaming for long text

**Success Criteria:**

- Generates natural-sounding speech
- Uses nova voice consistently
- Audio compatible with Discord
- Handles long responses gracefully

---

### Phase 6: Voice Command Pipeline

**Files to create:**

- `plugins/voice-extension/src/VoiceCommandPipeline.ts`
- `plugins/voice-extension/test/VoiceCommandPipeline.test.ts`

**Implementation:**

- VoiceCommandPipeline class
  - `processSpeech(audioBuffer: Buffer[]): Promise<void>`
  - Full pipeline: Capture → STT → Process → TTS → Play
  - Integration with OpenClaw agent system
  - Error handling and user feedback

**Tests:**

- Test end-to-end voice interaction
- Test pipeline error handling
- Test concurrent request handling
- Test timeout scenarios

**Success Criteria:**

- Complete voice conversation cycle works
- User speech triggers agent response
- Response plays back via voice
- Handles multiple users gracefully

---

### Phase 7: Discord Plugin Integration

**Files to modify:**

- `plugins/discord/src/index.ts` (add voice commands)
- `plugins/discord/src/commands/voice.ts` (new file)

**Implementation:**

- Voice commands:
  - `/voice join` - Join user's voice channel
  - `/voice leave` - Leave voice channel
  - `/voice status` - Show voice connection status
- Integration with existing Discord plugin
- Permission checks
- Guild-specific state management

**Tests:**

- Test slash command registration
- Test `/voice join` command
- Test `/voice leave` command
- Test permission validation

**Success Criteria:**

- Slash commands work in Discord
- Bot joins/leaves on command
- Proper error messages shown
- Works across multiple guilds

---

### Phase 8: Configuration & Documentation

**Files to create/modify:**

- `plugins/voice-extension/README.md`
- `plugins/voice-extension/CONFIG.md`
- Update main OpenClaw docs with voice setup

**Implementation:**

- Configuration schema
- Setup instructions
- API key management
- Troubleshooting guide

**Success Criteria:**

- Clear setup instructions
- Configuration documented
- Common issues documented
- Examples provided

---

## Testing Strategy

### Unit Tests

- Each component tested in isolation
- Mock external dependencies (Discord, APIs)
- Target: >80% code coverage

### Integration Tests

- Full pipeline testing
- Real Discord connection (test bot)
- API integration tests (with test keys)

### Manual Testing

- Join voice channel and speak
- Verify transcription accuracy
- Verify response quality
- Test error scenarios (disconnect, timeout)

## Quality Gates

### Phase Approval Criteria

- All tests pass
- Code review approved
- No critical bugs
- Performance acceptable

### Code Review Checklist

- Follows TypeScript best practices
- Proper error handling
- No memory leaks
- Documentation complete
- Tests comprehensive

## Risk Mitigation

### Technical Risks

1. **Audio Quality Issues**
   - Mitigation: Test with various network conditions
   - Fallback: Adjustable bitrate settings

2. **API Rate Limits**
   - Mitigation: Implement request queuing
   - Fallback: Graceful degradation messages

3. **Memory Leaks**
   - Mitigation: Proper cleanup in disconnect
   - Monitoring: Track connection lifecycle

### Dependencies

- Discord.js voice may have breaking changes
- OpenAI/ElevenLabs API changes
- Mitigation: Pin dependency versions, comprehensive testing

## Success Metrics

- Voice join/leave success rate: >99%
- Transcription accuracy: >90%
- Average response latency: <3 seconds
- Zero memory leaks over 24hr test
- Works in 3+ different Discord servers

## Next Steps After Implementation

1. Beta testing with small group
2. Gather user feedback
3. Performance optimization
4. Extended language support (if needed)
5. Multi-user conversation handling

## Open Questions

1. Should voice responses be optional (text + voice)?
2. Do we need voice command activation phrase (e.g., "Hey Rue")?
3. Should voice work in DMs or only guild channels?
4. Maximum concurrent voice connections per bot instance?

---

**Plan Status:** Ready for Implementation  
**Approved By:** Awaiting approval  
**Implementation Start:** TBD
