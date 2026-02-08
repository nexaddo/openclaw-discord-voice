# Phase 4: Speech-to-Text (STT) Pipeline - Updated Plan

**Date:** 2026-02-07 22:44 EST  
**Status:** Implementation Complete - Plan Updated for Offline Fallback  
**Duration:** 6-8 hours implementation + 2-3 hours testing

---

## Executive Summary

Phase 4 implements the **Speech-to-Text Pipeline** with **dual-mode operation**:
- **Primary:** OpenAI Whisper API (cloud-based, high accuracy)
- **Fallback:** Offline STT library (zero-cost, works without API keys)

This ensures the system works whether users have API keys or not.

---

## Implementation Strategy

### Dual-Mode Architecture

```
Audio Input (PCM, 48kHz, stereo)
    │
    ├─ Check: OPENAI_API_KEY configured?
    │
    ├─ YES → Use Whisper API
    │  ├─ Convert PCM to WAV
    │  ├─ POST to OpenAI Whisper
    │  ├─ Return transcription
    │  └─ Cache result (60 min TTL)
    │
    └─ NO → Use Offline Library
       ├─ Convert PCM to WAV
       ├─ Load local STT model
       ├─ Run inference (Vosk)
       ├─ Return transcription
       └─ No API cost, works offline
```

### Primary: OpenAI Whisper API

**When to use:** `OPENAI_API_KEY` is set and valid

**Implementation:**
- Audio format: WAV (PCM int16, 48kHz, mono recommended for Whisper)
- Batch size: 1-2 second chunks (~96 KB max)
- Language detection: Auto (or user-specified)
- Temperature: 0 (deterministic)
- Format: Text output only
- Error handling: Retry on 429 (rate limit), fail graceful on 401 (invalid key)
- Cost: $0.002 per minute of audio
- Latency: 1-5 seconds depending on audio length

**Configuration:**
```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=whisper-1
STT_MODE=cloud  # auto-detected if API key present
```

---

### Fallback: Offline STT Library (Vosk)

**When to use:** `OPENAI_API_KEY` is NOT set

**Why Vosk:**
- ✅ Open-source (MIT license)
- ✅ Works offline (no internet required)
- ✅ ~60 MB model size
- ✅ Real-time capable (~50ms latency)
- ✅ Supports multiple languages
- ✅ No API calls = zero cost

**Installation:**
```bash
npm install vosk
# Plus language model (one-time download):
# English: ~60 MB
# Other languages: 50-100 MB each
```

**Configuration:**
```env
# No OPENAI_API_KEY = auto-fall back to Vosk
STT_MODE=offline  # auto-detected if API key missing
VOSK_MODEL_PATH=/path/to/vosk-model-en-us-0.42  # optional override
```

**Accuracy Trade-off:**
| Mode | Accuracy | Latency | Cost | Offline |
|------|----------|---------|------|---------|
| Whisper API | 98%+ | 1-5s | $0.002/min | ❌ |
| Vosk (offline) | 85-90% | ~50ms | $0 | ✅ |

**User Experience:**
- Whisper: Higher accuracy, slight network delay
- Vosk: Lower accuracy, instant feedback, no internet needed

---

## Class Design

### SpeechToText Class

```typescript
export class SpeechToText {
  private mode: 'cloud' | 'offline';  // Auto-detected
  private openaiClient?: OpenAI;
  private voskRecognizer?: VoskRecognizer;
  private cache: Map<string, string>;  // Hash → transcription
  
  constructor(options?: STTOptions) {
    // Auto-detect mode based on API key presence
    if (process.env.OPENAI_API_KEY) {
      this.mode = 'cloud';
      this.openaiClient = new OpenAI(...);
    } else {
      this.mode = 'offline';
      this.voskRecognizer = new VoskRecognizer(...);
    }
  }
  
  // Transcribe PCM audio to text
  async transcribeAudio(pcmBuffer: Buffer): Promise<string> {
    if (this.mode === 'cloud') {
      return this.transcribeWithWhisper(pcmBuffer);
    } else {
      return this.transcribeWithVosk(pcmBuffer);
    }
  }
  
  private async transcribeWithWhisper(pcmBuffer: Buffer): Promise<string> {
    // Convert PCM → WAV
    const wavBuffer = pcmToWav(pcmBuffer, 48000, 1);
    
    // Check cache
    const hash = hashBuffer(wavBuffer);
    if (this.cache.has(hash)) {
      return this.cache.get(hash)!;
    }
    
    // Call Whisper API
    const transcription = await this.openaiClient!.audio.transcriptions.create({
      file: wavBuffer,
      model: 'whisper-1',
      language: 'en'
    });
    
    // Cache result (60 min TTL)
    this.cache.set(hash, transcription.text);
    setTimeout(() => this.cache.delete(hash), 60 * 60 * 1000);
    
    return transcription.text;
  }
  
  private transcribeWithVosk(pcmBuffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        // Feed audio to Vosk recognizer
        this.voskRecognizer!.acceptWaveform(pcmBuffer);
        
        // Get result
        const result = this.voskRecognizer!.result();
        const parsed = JSON.parse(result);
        
        if (parsed.result && parsed.result.length > 0) {
          resolve(parsed.result.map((r: any) => r.conf).join(' '));
        } else if (parsed.partial) {
          resolve(parsed.partial);
        } else {
          resolve('');
        }
      } catch (err) {
        reject(err);
      }
    });
  }
}
```

---

## Test Strategy

### Test Cases (70 total)

**Section A: Mode Detection (8 tests)**
- ✅ Detect cloud mode when API key present
- ✅ Detect offline mode when API key missing
- ✅ Fallback from cloud to offline on API error
- ✅ Respect explicit mode override
- ✅ Validate API key format
- ✅ Load Vosk model on startup
- ✅ Handle missing Vosk model gracefully
- ✅ Cache mode selection across sessions

**Section B: Whisper API (20 tests)**
- ✅ Transcribe short audio (1-2 sec)
- ✅ Transcribe long audio (30+ sec with batching)
- ✅ Handle API rate limiting (429)
- ✅ Fallback to offline on 401 (invalid key)
- ✅ Retry on 500 (temporary error)
- ✅ Return empty string on silence
- ✅ Preserve punctuation
- ✅ Handle multiple languages
- ✅ Cache transcriptions (hash-based)
- ✅ Expire cache after 60 min
- ✅ Convert PCM to WAV correctly
- ✅ Handle mono vs stereo
- ✅ Support different sample rates
- ✅ Track API latency
- ✅ Count API calls for billing
- ✅ Sanitize output (no PII)
- ✅ Log API errors
- ✅ Handle network timeouts
- ✅ Validate response format
- ✅ Handle concurrent requests

**Section C: Vosk Offline (20 tests)**
- ✅ Transcribe audio without API key
- ✅ Return results in <100ms
- ✅ Handle multiple languages
- ✅ Load model from disk
- ✅ Handle missing model gracefully
- ✅ Support partial results (streaming)
- ✅ Return final results
- ✅ Handle silence (no-op)
- ✅ Handle noise (degrades gracefully)
- ✅ Process batches of audio
- ✅ Track recognition latency
- ✅ Count processed frames
- ✅ Memory usage stable
- ✅ No resource leaks
- ✅ CPU usage <10% per stream
- ✅ Support concurrent streams
- ✅ Validate Vosk output format
- ✅ Handle corrupted audio
- ✅ Recover from Vosk errors
- ✅ Log all offline processing

**Section D: VoiceActivityDetector (14 tests)**
- ✅ Detect speech onset
- ✅ Detect speech offset
- ✅ Ignore background noise
- ✅ Handle varying volumes
- ✅ Configurable thresholds
- ✅ Return confidence scores
- ✅ Track silence duration
- ✅ Buffer audio for analysis
- ✅ Handle edge case (very quiet speech)
- ✅ Handle edge case (loud noise)
- ✅ Performance: <5ms per frame
- ✅ Memory: <1 MB for VAD state
- ✅ Accuracy: 95%+ on test set
- ✅ Latency: real-time capable

**Section E: Error Handling & Fallback (8 tests)**
- ✅ Graceful fallback from cloud to offline
- ✅ User-friendly error messages
- ✅ Log all errors
- ✅ Don't leak API keys in logs
- ✅ Handle null/undefined input
- ✅ Handle corrupted audio
- ✅ Handle mode switching at runtime
- ✅ Recover from transient errors

---

## Configuration

### Environment Variables

```env
# OpenAI Whisper (optional, falls back to Vosk if missing)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=whisper-1

# Vosk (auto-loads if API key missing)
VOSK_MODEL_PATH=/path/to/vosk-model-en-us-0.42
VOSK_TIMEOUT_MS=5000

# STT General
STT_MODE=auto                    # auto | cloud | offline
STT_LANGUAGE=en                  # en, es, fr, de, etc.
STT_SILENCE_THRESHOLD=0.1        # Energy threshold (0-1)
STT_SILENCE_DURATION_MS=500      # Min silence to end utterance
STT_CACHE_TTL_MIN=60             # Cache expiration (minutes)
STT_LOG_LEVEL=info               # debug | info | warn | error
```

### Default Behavior

| Scenario | Behavior |
|----------|----------|
| API key present | Use Whisper API |
| API key missing | Use Vosk offline |
| API key invalid | Fall back to Vosk |
| API rate limited (429) | Retry 3x with backoff, then Vosk |
| API timeout | Fall back to Vosk |
| Vosk model missing | Download on first use |
| Both fail | Error with helpful message |

---

## Integration Points

### Phase 3 (AudioStreamHandler)
- Input: PCM audio frames (48kHz, stereo, 3,840 bytes/frame)
- Output: String transcription
- Latency: <100ms (Vosk) or 1-5s (Whisper)

### Phase 6 (Voice Command Pipeline)
- Consumes: Transcription strings
- Passes to: Intent parser

---

## Fallback Decision Tree

```
User provides OPENAI_API_KEY?
├─ YES
│  ├─ Key valid?
│  │  ├─ YES → Use Whisper API
│  │  │  ├─ API reachable?
│  │  │  │  ├─ YES → Transcribe with Whisper
│  │  │  │  └─ NO → Fall back to Vosk
│  │  │  └─ API returns error?
│  │  │     └─ Retry 3x, then Vosk
│  │  └─ NO (invalid format) → Fall back to Vosk
│  │
│  └─ Vosk available?
│     ├─ YES → Load Vosk model
│     └─ NO → Error: "No STT available"
│
└─ NO (key not provided)
   ├─ Vosk available?
   │  ├─ YES → Load Vosk model, use offline
   │  └─ NO → Error: "Install Vosk or provide OPENAI_API_KEY"
```

---

## Cost Model

### Whisper API
- $0.002 per minute of audio
- Batch up to 25 MB per request
- Example: 10 hours/month = $12/month

### Vosk (Offline)
- Free (open-source)
- One-time model download (~60 MB)
- Zero ongoing costs
- Example: 10 hours/month = $0/month

---

## Success Criteria

✅ Cloud mode (Whisper API):
- Transcription accuracy >95%
- Latency 1-5 seconds
- Graceful fallback on API error

✅ Offline mode (Vosk):
- Transcription accuracy 85-90%
- Latency <100ms
- Works without internet
- Model auto-downloads on first use

✅ Fallback mechanism:
- Seamless switching between modes
- User-friendly error messages
- All errors logged (without leaking keys)
- 70/70 tests passing

---

## Implementation Checklist

- [ ] Phase 4.1: Set up Vosk integration
- [ ] Phase 4.2: Write 70 test cases (TDD)
- [ ] Phase 4.3: Implement Whisper API integration
- [ ] Phase 4.4: Implement Vosk offline fallback
- [ ] Phase 4.5: Auto-detect mode based on API key
- [ ] Phase 4.6: Implement graceful fallback logic
- [ ] Phase 4.7: Add caching layer
- [ ] Phase 4.8: Error handling & logging
- [ ] Phase 4.9: Integration with Phase 3
- [ ] Phase 4.10: Documentation & examples

---

## Updated Implementation Status

**Previous Implementation:** ✅ Complete (Whisper API only)
**Updated Plan:** Add Vosk offline fallback capability
**Implementation Approach:**
- Keep existing Whisper implementation
- Add Vosk support with mode detection
- Add fallback logic (cloud → offline)
- Update tests to cover both modes
- Update documentation

**Timeline Impact:** ~2-3 additional hours for Vosk integration + tests

---
