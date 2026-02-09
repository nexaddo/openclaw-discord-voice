# Phase 5: Text-to-Speech (TTS) Pipeline - Updated Plan

**Date:** 2026-02-07 22:44 EST  
**Status:** Implementation Complete - Plan Updated for Offline Fallback  
**Duration:** 6-8 hours implementation + 2-3 hours testing

---

## Executive Summary

Phase 5 implements the **Text-to-Speech Pipeline** with **dual-mode operation**:

- **Primary:** ElevenLabs TTS API (cloud-based, high-quality voices)
- **Fallback:** Offline TTS library (zero-cost, works without API keys)

This ensures the system works whether users have API keys or not.

---

## Implementation Strategy

### Dual-Mode Architecture

```
Text Input ("Hello, how are you?")
    │
    ├─ Check: ELEVENLABS_API_KEY configured?
    │
    ├─ YES → Use ElevenLabs API
    │  ├─ Format text for TTS
    │  ├─ POST to ElevenLabs
    │  ├─ Receive audio (PCM/MP3)
    │  ├─ Convert to PCM 48kHz stereo
    │  └─ Cache result (60 min TTL)
    │
    └─ NO → Use Offline Library
       ├─ Format text for TTS
       ├─ Load pyttsx3 engine
       ├─ Synthesize to PCM
       ├─ Convert to 48kHz stereo
       └─ No API cost, works offline
```

### Primary: ElevenLabs TTS API

**When to use:** `ELEVENLABS_API_KEY` is set and valid

**Implementation:**

- Voice: nova (default, warm feminine voice)
- Audio format: PCM (request from API)
- Sample rate: 48kHz (Discord standard)
- Channels: Stereo (2 channels)
- Latency: 1-2 seconds depending on text length
- Cost: ~$0.30 per 1M characters (~$3 for 10M chars/month)
- Quality: High-fidelity, natural-sounding

**Configuration:**

```env
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_VOICE_ID=nova      # nova, alloy, echo, fable, onyx, shimmer
ELEVENLABS_MODEL=eleven_turbo  # eleven_turbo, eleven_monolingual_v1
TTS_MODE=cloud  # auto-detected if API key present
```

**Voice Options:**
| Voice | Gender | Tone | Accent |
|-------|--------|------|--------|
| nova | F | Warm, friendly | American |
| alloy | M | Neutral, professional | American |
| echo | M | Strong, authoritative | American |
| fable | M | Warm, storytelling | British |
| onyx | M | Deep, resonant | American |
| shimmer | F | Bright, energetic | American |

---

### Fallback: Offline TTS Library (pyttsx3)

**When to use:** `ELEVENLABS_API_KEY` is NOT set

**Why pyttsx3:**

- ✅ Open-source (MIT license)
- ✅ Works offline (no internet required)
- ✅ Cross-platform (Windows, macOS, Linux)
- ✅ Multiple voices available (system-dependent)
- ✅ Real-time capable (~100-500ms latency)
- ✅ No API calls = zero cost
- ✅ Supports speech rate/pitch control

**Installation:**

```bash
npm install pyttsx3
# System dependencies:
# macOS: built-in (uses NSSpeechSynthesizer)
# Linux: apt-get install espeak
# Windows: built-in (uses SAPI5)
```

**Configuration:**

```env
# No ELEVENLABS_API_KEY = auto-fall back to pyttsx3
TTS_MODE=offline  # auto-detected if API key missing
PYTTSX3_VOICE=default  # or specific system voice
PYTTSX3_RATE=150  # words per minute (default: 150)
PYTTSX3_PITCH=1.0  # 0.0-2.0 (default: 1.0)
```

**Accuracy Trade-off:**
| Mode | Quality | Latency | Cost | Offline | Voices |
|------|---------|---------|------|---------|--------|
| ElevenLabs | 95%+ (natural) | 1-2s | $0.30/1M chars | ❌ | 6 premium |
| pyttsx3 (offline) | 70-80% (robotic) | 100-500ms | $0 | ✅ | 2-5 system |

**User Experience:**

- ElevenLabs: High-quality, natural-sounding voices, slight network delay
- pyttsx3: Lower quality, robotic, instant synthesis, no internet needed

---

## Class Design

### TextToSpeech Class

```typescript
export class TextToSpeech {
  private mode: 'cloud' | 'offline';  // Auto-detected
  private elevenlabsClient?: ElevenLabs;
  private pyttsx3Engine?: any;
  private cache: Map<string, Buffer>;  // Hash → audio PCM

  constructor(options?: TTSOptions) {
    // Auto-detect mode based on API key presence
    if (process.env.ELEVENLABS_API_KEY) {
      this.mode = 'cloud';
      this.elevenlabsClient = new ElevenLabsClient(...);
    } else {
      this.mode = 'offline';
      this.pyttsx3Engine = createEngine();
    }
  }

  // Synthesize text to PCM audio
  async synthesizeAudio(text: string): Promise<Buffer> {
    if (this.mode === 'cloud') {
      return this.synthesizeWithElevenLabs(text);
    } else {
      return this.synthesizeWithPyttsx3(text);
    }
  }

  private async synthesizeWithElevenLabs(text: string): Promise<Buffer> {
    // Check cache
    const hash = hashText(text);
    if (this.cache.has(hash)) {
      return this.cache.get(hash)!;
    }

    // Call ElevenLabs API
    const audioStream = await this.elevenlabsClient!.generate({
      text: text,
      voice_id: 'nova',
      model_id: 'eleven_turbo',
      output_format: 'pcm_44100'  // Will convert to 48kHz
    });

    // Convert to PCM buffer
    const pcmBuffer = await this.convertToDiscordFormat(audioStream);

    // Cache result (60 min TTL)
    this.cache.set(hash, pcmBuffer);
    setTimeout(() => this.cache.delete(hash), 60 * 60 * 1000);

    return pcmBuffer;
  }

  private async synthesizeWithPyttsx3(text: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const tempFile = `/tmp/tts_${Date.now()}.wav`;

        // Synthesize to WAV file
        this.pyttsx3Engine.save_to_file(text, tempFile);
        this.pyttsx3Engine.runAndWait();

        // Read WAV file
        const wavBuffer = fs.readFileSync(tempFile);

        // Convert to PCM 48kHz stereo (Discord format)
        const pcmBuffer = this.convertWavToPcm(wavBuffer, 48000, 2);

        // Clean up temp file
        fs.unlinkSync(tempFile);

        resolve(pcmBuffer);
      } catch (err) {
        reject(err);
      }
    });
  }

  private async convertToDiscordFormat(input: Buffer): Promise<Buffer> {
    // Input: 44.1kHz PCM or MP3
    // Output: 48kHz stereo PCM
    // Uses ffmpeg internally
    return convertAudio(input, {
      sampleRate: 48000,
      channels: 2,
      format: 'pcm'
    });
  }
}
```

---

## Test Strategy

### Test Cases (60 total)

**Section A: Mode Detection (8 tests)**

- ✅ Detect cloud mode when API key present
- ✅ Detect offline mode when API key missing
- ✅ Fallback from cloud to offline on API error
- ✅ Respect explicit mode override
- ✅ Validate API key format
- ✅ Load pyttsx3 engine on startup
- ✅ Handle missing pyttsx3 gracefully
- ✅ Cache mode selection across sessions

**Section B: ElevenLabs API (20 tests)**

- ✅ Synthesize short text (<100 chars)
- ✅ Synthesize long text (>1000 chars with chunking)
- ✅ Handle API rate limiting (429)
- ✅ Fallback to offline on 401 (invalid key)
- ✅ Retry on 500 (temporary error)
- ✅ Support multiple voices (nova, alloy, echo, etc.)
- ✅ Convert to 48kHz stereo format
- ✅ Cache synthesized audio (hash-based)
- ✅ Expire cache after 60 min
- ✅ Handle audio encoding (MP3 → PCM)
- ✅ Track API latency
- ✅ Count API calls for billing
- ✅ Handle network timeouts
- ✅ Validate response format
- ✅ Handle concurrent requests
- ✅ Sanitize input (remove PII)
- ✅ Handle special characters
- ✅ Support different languages
- ✅ Log API calls and errors
- ✅ Graceful degradation on quota exceeded

**Section C: pyttsx3 Offline (18 tests)**

- ✅ Synthesize text without API key
- ✅ Return audio in <500ms
- ✅ Support different voices
- ✅ Load pyttsx3 engine
- ✅ Handle missing engine gracefully
- ✅ Convert WAV to PCM correctly
- ✅ Support 48kHz sample rate
- ✅ Support stereo (2 channels)
- ✅ Handle very long text (chunking)
- ✅ Handle very short text
- ✅ Support custom speech rate
- ✅ Support custom pitch
- ✅ Clean up temp files
- ✅ Process batches of text
- ✅ Memory usage stable
- ✅ CPU usage <20% per synthesis
- ✅ Validate pyttsx3 output format
- ✅ Handle corrupted synthesis

**Section D: Error Handling & Fallback (8 tests)**

- ✅ Graceful fallback from cloud to offline
- ✅ User-friendly error messages
- ✅ Log all errors
- ✅ Don't leak API keys in logs
- ✅ Handle null/undefined input
- ✅ Handle extremely long text
- ✅ Handle mode switching at runtime
- ✅ Recover from transient errors

**Section E: Audio Format Conversion (6 tests)**

- ✅ Convert 44.1kHz to 48kHz
- ✅ Convert mono to stereo
- ✅ Convert MP3 to PCM
- ✅ Convert WAV to PCM
- ✅ Maintain audio quality
- ✅ Handle unusual sample rates

---

## Configuration

### Environment Variables

```env
# ElevenLabs (optional, falls back to pyttsx3 if missing)
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_VOICE_ID=nova      # nova, alloy, echo, fable, onyx, shimmer
ELEVENLABS_MODEL=eleven_turbo

# pyttsx3 (auto-loads if API key missing)
PYTTSX3_VOICE=default
PYTTSX3_RATE=150              # words per minute
PYTTSX3_PITCH=1.0             # 0.0-2.0

# TTS General
TTS_MODE=auto                 # auto | cloud | offline
TTS_LANGUAGE=en               # en, es, fr, de, etc.
TTS_CACHE_TTL_MIN=60          # Cache expiration (minutes)
TTS_CHUNK_SIZE=1000           # Max chars per API call
TTS_LOG_LEVEL=info            # debug | info | warn | error
```

### Default Behavior

| Scenario               | Behavior                            |
| ---------------------- | ----------------------------------- |
| API key present        | Use ElevenLabs API                  |
| API key missing        | Use pyttsx3 offline                 |
| API key invalid        | Fall back to pyttsx3                |
| API rate limited (429) | Retry 3x with backoff, then pyttsx3 |
| API timeout            | Fall back to pyttsx3                |
| pyttsx3 unavailable    | Error with helpful message          |
| Both fail              | Error with helpful message          |

---

## Integration Points

### Phase 3 (AudioStreamHandler)

- Input: PCM audio data (from TextToSpeech)
- Output: Formatted for playback (Opus encoding, RTP packets)
- Latency: 100-500ms (pyttsx3) or 1-2s (ElevenLabs)

### Phase 6 (Voice Command Pipeline)

- Consumes: Agent response text
- Produces: Synthesized audio to play back

---

## Fallback Decision Tree

```
User provides ELEVENLABS_API_KEY?
├─ YES
│  ├─ Key valid?
│  │  ├─ YES → Use ElevenLabs API
│  │  │  ├─ API reachable?
│  │  │  │  ├─ YES → Synthesize with ElevenLabs
│  │  │  │  └─ NO → Fall back to pyttsx3
│  │  │  └─ API returns error?
│  │  │     └─ Retry 3x, then pyttsx3
│  │  └─ NO (invalid format) → Fall back to pyttsx3
│  │
│  └─ pyttsx3 available?
│     ├─ YES → Load pyttsx3 engine
│     └─ NO → Error: "No TTS available"
│
└─ NO (key not provided)
   ├─ pyttsx3 available?
   │  ├─ YES → Load pyttsx3 engine, use offline
   │  └─ NO → Error: "Install pyttsx3 or provide ELEVENLABS_API_KEY"
```

---

## Cost Model

### ElevenLabs API

- $0.30 per 1M characters
- Batch up to 5000 chars per request
- Example: 10M chars/month = $3/month

### pyttsx3 (Offline)

- Free (open-source)
- One-time system setup (espeak on Linux)
- Zero ongoing costs
- Example: Unlimited text = $0/month

---

## Success Criteria

✅ Cloud mode (ElevenLabs):

- Audio quality high (natural-sounding voices)
- Latency 1-2 seconds
- Graceful fallback on API error

✅ Offline mode (pyttsx3):

- Audio quality acceptable (robotic but understandable)
- Latency <500ms
- Works without internet
- All system voices supported

✅ Fallback mechanism:

- Seamless switching between modes
- User-friendly error messages
- All errors logged (without leaking keys)
- 60/60 tests passing

---

## Implementation Checklist

- [ ] Phase 5.1: Set up pyttsx3 integration
- [ ] Phase 5.2: Write 60 test cases (TDD)
- [ ] Phase 5.3: Implement ElevenLabs API integration
- [ ] Phase 5.4: Implement pyttsx3 offline fallback
- [ ] Phase 5.5: Auto-detect mode based on API key
- [ ] Phase 5.6: Implement graceful fallback logic
- [ ] Phase 5.7: Add caching layer
- [ ] Phase 5.8: Audio format conversion (48kHz stereo)
- [ ] Phase 5.9: Error handling & logging
- [ ] Phase 5.10: Integration with Phase 3
- [ ] Phase 5.11: Documentation & examples

---

## Updated Implementation Status

**Previous Implementation:** ✅ Complete (ElevenLabs API only)
**Updated Plan:** Add pyttsx3 offline fallback capability
**Implementation Approach:**

- Keep existing ElevenLabs implementation
- Add pyttsx3 support with mode detection
- Add fallback logic (cloud → offline)
- Add audio format conversion (48kHz stereo)
- Update tests to cover both modes
- Update documentation

**Timeline Impact:** ~2-3 additional hours for pyttsx3 integration + tests + audio conversion

---
