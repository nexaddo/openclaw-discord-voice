# Phase 3 Plan: Audio Stream Handler Implementation

**Date:** 2026-02-07 19:54 EST  
**Agent:** Voice Integration Planning Agent (Phase 3)  
**Phase:** 3/8  
**Status:** Planning Complete - Ready for Implementation  
**Duration Estimate:** 2.5-3.5 hours (including comprehensive tests)

---

## Executive Summary

Phase 3 implements the **AudioStreamHandler** class, which is the critical bridge between Discord voice streams and audio processing. This class handles:
- Real-time audio capture from Discord voice channels
- Audio playback to Discord voice channels
- Audio packet buffering and jitter management
- Opus codec encoding/decoding
- Audio frame management

**Key Components:**
- `AudioStreamHandler` class with stream lifecycle management
- Audio buffer management with circular buffer pattern
- Opus encoder/decoder integration
- Type definitions for audio data structures
- Comprehensive test suite (TDD approach)

**Critical Success Criteria:**
- Capture user voice data from Discord streams
- Play audio back to Discord voice channels
- Handle opus encoding/decoding correctly
- Manage buffer overflow without data loss
- Support 48kHz sample rate, stereo audio
- Handle concurrent streams from multiple users

---

## Part 1: Audio Stream Architecture

### Audio Flow Overview

```
INBOUND FLOW:
┌─────────────────────┐
│ Discord Voice       │
│ Connection          │
│                     │
│ (encrypted, opus)   │
└──────────┬──────────┘
           │
           ├─ Decrypt packet
           ├─ Decode Opus → PCM
           │
           ▼
┌──────────────────────┐
│ AudioStreamHandler   │
│                      │
│ - Audio buffer       │
│ - Jitter buffer      │
│ - Sample rate conv   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Application Layer    │
│ (STT, Processing)    │
└──────────────────────┘

OUTBOUND FLOW:
┌─────────────────────┐
│ Audio Source        │
│ (TTS, Audio file)   │
└──────────┬──────────┘
           │
           ├─ Convert to PCM
           ├─ Sample rate conv
           │
           ▼
┌──────────────────────┐
│ AudioStreamHandler   │
│                      │
│ - Playback buffer    │
│ - Frame management   │
│ - Silence insertion  │
└──────────┬───────────┘
           │
           ├─ Encode PCM → Opus
           ├─ Encrypt packet
           │
           ▼
┌─────────────────────┐
│ Discord Voice       │
│ Connection          │
│                     │
│ (send packet)       │
└─────────────────────┘
```

### Audio Specifications

Discord voice uses standardized audio parameters:

| Parameter | Value | Notes |
|-----------|-------|-------|
| Sample Rate | 48,000 Hz | Strictly enforced |
| Channels | 2 (stereo) | Always stereo |
| Sample Format | PCM int16 | Little-endian |
| Frame Size | 20 ms | 960 samples @ 48kHz |
| Frame Duration | 20 ms | Consistent timing |
| Opus Bitrate | 32-128 kbps | Auto-adjusts |
| Packet Rate | 50 packets/sec | One packet per 20ms |

### Buffer Specifications

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| PCM Frame Size | 3,840 bytes | 960 samples × 2 channels × 2 bytes |
| Jitter Buffer | 200ms (10 frames) | Handles network jitter |
| Playback Buffer | 500ms (25 frames) | Smooth playback |
| Opus Frame Size | 20-60 bytes | After compression |
| Max Buffer Age | 1 second | Drop frames older than 1s |

---

## Part 2: AudioStreamHandler Class Design

### Class Structure Overview

```typescript
export class AudioStreamHandler {
  // ========== Properties ==========
  
  // Connection management
  private voiceConnection: VoiceConnection;
  private guildId: string;
  
  // Audio capture (inbound)
  private captureBuffer: CircularBuffer<AudioFrame>;
  private userAudioStreams: Map<string, UserAudioStream>;
  
  // Audio playback (outbound)
  private playbackBuffer: CircularBuffer<AudioFrame>;
  private audioPlayer: AudioPlayer | null;
  
  // Opus codec
  private opusEncoder: OpusEncoder;
  private opusDecoders: Map<number, OpusDecoder>;
  
  // State management
  private isCapturing: boolean;
  private isPlaying: boolean;
  private private listeners: Set<AudioStreamListener>;
  
  // Metrics
  private captureStats: AudioStreamStats;
  private playbackStats: AudioStreamStats;
  
  // ========== Methods ==========
  
  // Initialization
  constructor(connection: VoiceConnection, guildId: string)
  async initialize(): Promise<void>
  async destroy(): Promise<void>
  
  // Audio capture
  async startCapture(): Promise<void>
  async stopCapture(): Promise<void>
  captureUserAudio(userId: string): AudioBuffer[] | null
  getUserAudioStream(userId: string): ReadableStream<AudioFrame> | null
  getAllActiveUsers(): string[]
  
  // Audio playback
  async playAudioStream(audioData: Buffer): Promise<void>
  async playAudioFrames(frames: AudioFrame[]): Promise<void>
  async stopPlayback(): Promise<void>
  getPlaybackStatus(): PlaybackStatus
  
  // Audio encoding/decoding
  encodeToOpus(pcmBuffer: Buffer): Buffer
  decodeFromOpus(opusBuffer: Buffer, ssrc?: number): Buffer
  
  // Buffer management
  getCaptureBuff erSize(): number
  getPlaybackBufferSize(): number
  private handleBufferOverflow(): void
  private trimOldFrames(): void
  
  // Listeners
  addEventListener(listener: AudioStreamListener): void
  removeEventListener(listener: AudioStreamListener): void
  
  // Statistics
  getCaptureStats(): AudioStreamStats
  getPlaybackStats(): AudioStreamStats
  resetStats(): void
}
```

### Type Definitions

```typescript
// ============================================
// Audio Frame & Buffer Types
// ============================================

/**
 * Represents a single audio frame (20ms of audio at 48kHz)
 */
export interface AudioFrame {
  // PCM audio data
  data: Buffer;                    // 3,840 bytes (960 samples × 2 channels × 2 bytes)
  
  // Metadata
  sampleRate: number;              // 48000
  channels: number;                // 2
  sampleCount: number;             // 960
  
  // Timing
  timestamp: number;               // ms since epoch
  sequenceNumber?: number;          // RTP sequence for out-of-order detection
  ssrc?: number;                   // Synchronization source (user ID)
  
  // Flags
  isSilence: boolean;              // True if frame is silence
  isJitter: boolean;               // True if frame from jitter buffer
  playoutDelay?: number;           // Milliseconds to delay playback
}

/**
 * Represents audio data with Opus encoding
 */
export interface OpusFrame {
  // Encoded data
  data: Buffer;                    // 20-60 bytes (compressed)
  
  // Metadata
  frameSize: number;               // Bytes
  timestamp: number;               // ms since epoch
  sequenceNumber: number;          // RTP sequence
  ssrc: number;                    // User/source ID
  
  // Flags
  isSilence: boolean;
  markerBit?: boolean;             // RTP marker for speech start
}

/**
 * User-specific audio stream
 */
export interface UserAudioStream {
  userId: string;
  ssrc: number;
  audioBuffer: AudioFrame[];
  lastFrameTime: number;
  isActive: boolean;
  decoderState: any;               // Decoder instance for this user
}

/**
 * Playback status information
 */
export interface PlaybackStatus {
  isPlaying: boolean;
  bufferSize: number;
  bufferedDuration: number;        // milliseconds
  framesQueued: number;
  framesPlayed: number;
  estimatedPlaybackTime: number;   // ms until queue empty
}

/**
 * Audio stream statistics
 */
export interface AudioStreamStats {
  framesProcessed: number;
  framesDropped: number;
  bufferOverflows: number;
  averageLatency: number;          // milliseconds
  minLatency: number;
  maxLatency: number;
  cpuUsage: number;                // percentage
  lastUpdated: number;
}

/**
 * Audio stream event listener
 */
export interface AudioStreamListener {
  onFrameCaptured?(frame: AudioFrame): void;
  onFrameDropped?(frame: AudioFrame, reason: string): void;
  onUserStartedSpeaking?(userId: string): void;
  onUserStoppedSpeaking?(userId: string): void;
  onPlaybackBufferLow?(): void;
  onPlaybackBufferFull?(): void;
  onError?(error: AudioStreamError): void;
}

/**
 * Audio stream error types
 */
export enum AudioStreamErrorType {
  BUFFER_OVERFLOW = 'BUFFER_OVERFLOW',
  BUFFER_UNDERFLOW = 'BUFFER_UNDERFLOW',
  OPUS_ENCODING_ERROR = 'OPUS_ENCODING_ERROR',
  OPUS_DECODING_ERROR = 'OPUS_DECODING_ERROR',
  STREAM_DISCONNECTED = 'STREAM_DISCONNECTED',
  INVALID_AUDIO_DATA = 'INVALID_AUDIO_DATA',
  PLAYBACK_ERROR = 'PLAYBACK_ERROR',
  CAPTURE_ERROR = 'CAPTURE_ERROR'
}

/**
 * Audio stream error class
 */
export class AudioStreamError extends Error {
  type: AudioStreamErrorType;
  guildId?: string;
  userId?: string;
  originalError?: Error;
  timestamp: number;

  constructor(
    type: AudioStreamErrorType,
    message: string,
    options?: {
      guildId?: string;
      userId?: string;
      originalError?: Error;
    }
  ) {
    super(message);
    this.name = 'AudioStreamError';
    this.type = type;
    this.guildId = options?.guildId;
    this.userId = options?.userId;
    this.originalError = options?.originalError;
    this.timestamp = Date.now();
  }
}

/**
 * Circular buffer for audio frames
 * Automatically overwrites oldest frames when full
 */
export class CircularBuffer<T> {
  private buffer: T[] = [];
  private maxSize: number;
  private writeIndex: number = 0;
  private readIndex: number = 0;
  private frameCount: number = 0;

  constructor(maxSizeFrames: number) {
    this.maxSize = maxSizeFrames;
    this.buffer = new Array(maxSizeFrames);
  }

  push(frame: T): void {
    this.buffer[this.writeIndex] = frame;
    this.writeIndex = (this.writeIndex + 1) % this.maxSize;
    
    if (this.frameCount < this.maxSize) {
      this.frameCount++;
    } else {
      this.readIndex = (this.readIndex + 1) % this.maxSize;
    }
  }

  pop(): T | null {
    if (this.frameCount === 0) return null;
    
    const frame = this.buffer[this.readIndex];
    this.readIndex = (this.readIndex + 1) % this.maxSize;
    this.frameCount--;
    
    return frame;
  }

  peek(offset: number = 0): T | null {
    if (offset >= this.frameCount) return null;
    
    const index = (this.readIndex + offset) % this.maxSize;
    return this.buffer[index];
  }

  clear(): void {
    this.frameCount = 0;
    this.writeIndex = 0;
    this.readIndex = 0;
  }

  getSize(): number {
    return this.frameCount;
  }

  isFull(): boolean {
    return this.frameCount === this.maxSize;
  }

  isEmpty(): boolean {
    return this.frameCount === 0;
  }

  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.frameCount; i++) {
      const index = (this.readIndex + i) % this.maxSize;
      result.push(this.buffer[index]);
    }
    return result;
  }
}

/**
 * Options for AudioStreamHandler initialization
 */
export interface AudioStreamHandlerOptions {
  // Buffer sizes (in frames)
  captureBufferSize?: number;      // Default: 10 (200ms)
  playbackBufferSize?: number;     // Default: 25 (500ms)
  jitterBufferSize?: number;       // Default: 10 (200ms)
  
  // Audio parameters
  sampleRate?: number;             // Default: 48000
  channels?: number;               // Default: 2
  
  // Opus parameters
  opusBitrate?: number;            // Default: 64000 (64 kbps)
  opusComplexity?: number;         // Default: 9 (0-10, higher = better quality)
  
  // Timing
  maxFrameAge?: number;            // Default: 1000 (drop frames older than 1s)
  playoutDelay?: number;           // Default: 20 (ms)
  
  // Features
  enableSilenceDetection?: boolean; // Default: true
  enableVAD?: boolean;             // Default: true (Voice Activity Detection)
  
  // Logging
  debug?: boolean;                 // Default: false
}

export interface AudioStreamHandlerEvents {
  frameCaptured(frame: AudioFrame): void;
  frameDropped(reason: string): void;
  userStartedSpeaking(userId: string): void;
  userStoppedSpeaking(userId: string): void;
  playbackBufferLow(): void;
  playbackBufferFull(): void;
  error(error: AudioStreamError): void;
}
```

---

## Part 3: Audio Buffer Management Strategy

### Circular Buffer Pattern

The `CircularBuffer<T>` class implements a fixed-size, automatically-wrapping buffer:

```typescript
// Example: 10-frame jitter buffer (200ms at 50 fps)
const jitterBuffer = new CircularBuffer<AudioFrame>(10);

// When buffer has 10 frames and new frame arrives:
// Old frame automatically overwritten (FIFO)
jitterBuffer.push(newFrame);  // Oldest frame is lost
```

**Advantages:**
- Predictable memory usage (no dynamic allocation)
- O(1) push/pop operations
- Automatic overflow handling
- No garbage collection overhead

**Disadvantages:**
- Fixed size (must estimate max delay)
- Oldest data lost on overflow
- Can't grow dynamically

### Three-Buffer Strategy

1. **Jitter Buffer (Capture Side)**
   - Size: 200ms (10 frames)
   - Purpose: Smooth out network jitter
   - Behavior: Drop oldest frames if new ones arrive
   - Use: Internal only, feeds to main capture buffer

2. **Capture Buffer**
   - Size: 200-500ms configurable
   - Purpose: Hold captured audio until consumed
   - Behavior: Notify listeners when frames available
   - Use: Public API for accessing captured audio

3. **Playback Buffer**
   - Size: 500-1000ms configurable
   - Purpose: Queue audio frames for playback
   - Behavior: Feed frames to audio player
   - Use: Internal player feeding

### Buffer Overflow Handling

When capture buffer reaches 90% full:

```
1. Emit 'bufferOverflow' event
2. Call onFrameDropped listeners
3. Drop oldest 50ms (2-3 frames)
4. Log warning if debug enabled
5. Update statistics
```

When playback buffer runs empty:

```
1. Emit 'bufferUnderflow' event
2. Call onPlaybackBufferLow listener
3. Insert silence frame (20ms)
4. Pause player until buffer refilled
5. Resume when buffer > 100ms
```

### Frame Age Trimming

Every 100ms, check and discard old frames:

```typescript
private trimOldFrames(): void {
  const now = Date.now();
  const maxAge = this.options.maxFrameAge || 1000;
  
  const frames = this.captureBuffer.toArray();
  let trimmedCount = 0;
  
  for (const frame of frames) {
    if (now - frame.timestamp > maxAge) {
      this.captureBuffer.pop();
      trimmedCount++;
    }
  }
  
  if (trimmedCount > 0) {
    this.captureStats.framesDropped += trimmedCount;
    this.emit('frameDropped', `Aged out: ${trimmedCount} frames`);
  }
}
```

---

## Part 4: Opus Codec Implementation

### Opus Encoder

```typescript
import OpusEncoder from '@discordjs/opus';

/**
 * Encodes PCM audio to Opus format
 * 
 * @param pcmBuffer - PCM int16 audio (3,840 bytes for 20ms frame)
 * @returns Opus encoded data (typically 20-60 bytes)
 * 
 * @throws AudioStreamError if encoding fails
 */
private createOpusEncoder(): OpusEncoder {
  try {
    // Discord requires exactly these parameters:
    // - Sample rate: 48,000 Hz
    // - Channels: 2 (stereo)
    // - Frame size: 960 samples (20ms @ 48kHz)
    const encoder = new OpusEncoder.Encoder(
      48000,           // sample rate
      2,               // channels
      2880             // frame size in samples (60ms is also common: 2880)
    );
    
    // Optional: Set bitrate
    if (this.options.opusBitrate) {
      encoder.setBitrate(this.options.opusBitrate);
    }
    
    return encoder;
  } catch (error: any) {
    throw new AudioStreamError(
      AudioStreamErrorType.OPUS_ENCODING_ERROR,
      `Failed to create Opus encoder: ${error.message}`,
      { originalError: error }
    );
  }
}

encodeToOpus(pcmBuffer: Buffer): Buffer {
  if (!pcmBuffer || pcmBuffer.length !== 3840) {
    throw new AudioStreamError(
      AudioStreamErrorType.INVALID_AUDIO_DATA,
      `Invalid PCM buffer size: expected 3840, got ${pcmBuffer.length}`
    );
  }
  
  try {
    const opusData = this.opusEncoder.encode(pcmBuffer);
    
    if (!opusData || opusData.length === 0) {
      throw new Error('Encoder returned empty buffer');
    }
    
    this.captureStats.framesProcessed++;
    return opusData;
  } catch (error: any) {
    this.captureStats.framesDropped++;
    
    throw new AudioStreamError(
      AudioStreamErrorType.OPUS_ENCODING_ERROR,
      `Failed to encode Opus frame: ${error.message}`,
      { originalError: error }
    );
  }
}
```

### Opus Decoder

```typescript
import OpusDecoder from '@discordjs/opus';

/**
 * Decodes Opus audio back to PCM format
 * 
 * @param opusBuffer - Opus encoded data
 * @param ssrc - Synchronization source (user ID) for decoder selection
 * @returns PCM audio (3,840 bytes)
 * 
 * @throws AudioStreamError if decoding fails
 */
private getOrCreateDecoder(ssrc: number): OpusDecoder {
  if (!this.opusDecoders.has(ssrc)) {
    try {
      const decoder = new OpusDecoder.Decoder(
        48000,           // sample rate
        2,               // channels
        2880             // frame size (same as encoder)
      );
      
      this.opusDecoders.set(ssrc, decoder);
    } catch (error: any) {
      throw new AudioStreamError(
        AudioStreamErrorType.OPUS_DECODING_ERROR,
        `Failed to create Opus decoder for SSRC ${ssrc}: ${error.message}`,
        { originalError: error }
      );
    }
  }
  
  return this.opusDecoders.get(ssrc)!;
}

decodeFromOpus(opusBuffer: Buffer, ssrc?: number): Buffer {
  if (!opusBuffer || opusBuffer.length === 0) {
    throw new AudioStreamError(
      AudioStreamErrorType.INVALID_AUDIO_DATA,
      'Empty opus buffer provided'
    );
  }
  
  const decoderSsrc = ssrc || 0;
  
  try {
    const decoder = this.getOrCreateDecoder(decoderSsrc);
    const pcmData = decoder.decode(opusBuffer);
    
    if (!pcmData || pcmData.length === 0) {
      throw new Error('Decoder returned empty buffer');
    }
    
    if (pcmData.length !== 3840) {
      console.warn(
        `Opus decoder returned unexpected size: ${pcmData.length} (expected 3840)`
      );
    }
    
    this.captureStats.framesProcessed++;
    return pcmData;
  } catch (error: any) {
    this.captureStats.framesDropped++;
    
    throw new AudioStreamError(
      AudioStreamErrorType.OPUS_DECODING_ERROR,
      `Failed to decode Opus frame: ${error.message}`,
      { originalError: error }
    );
  }
}
```

### Key Opus Parameters

| Parameter | Value | Reason |
|-----------|-------|--------|
| Sample Rate | 48,000 Hz | Discord standard (strictly enforced) |
| Channels | 2 | Stereo (always) |
| Frame Size | 2880 | 60ms (Discord audio frames are 20ms) |
| Bitrate | 64,000 bps | High quality, moderate compression |
| Complexity | 9 | Slow encoder, best quality |
| DTX | Enabled | Discontinuous Transmission (send silence as 1 byte) |
| FEC | Enabled | Forward Error Correction |

---

## Part 5: Test Cases

### Test Suite Overview

Total: **48 test cases** organized into 8 sections

### A. Constructor & Initialization (6 tests)

```typescript
describe('AudioStreamHandler - Constructor & Initialization', () => {
  it('should create instance with valid VoiceConnection', () => {
    // Test: new AudioStreamHandler(connection, guildId)
  });

  it('should throw on invalid VoiceConnection', () => {
    // Test: throws AudioStreamError
  });

  it('should initialize buffers with default options', () => {
    // Test: default sizes, sample rate, channels
  });

  it('should initialize buffers with custom options', () => {
    // Test: custom capture/playback buffer sizes
  });

  it('should initialize Opus encoder', () => {
    // Test: encoder is ready for encoding
  });

  it('should initialize empty decoder map', () => {
    // Test: opusDecoders map is empty
  });
});
```

### B. Audio Capture (10 tests)

```typescript
describe('AudioStreamHandler - Audio Capture', () => {
  it('should start capture without errors', async () => {
    // Test: startCapture() succeeds
  });

  it('should emit frameCaptured event on new frame', () => {
    // Test: listener receives frame event
  });

  it('should store frames in capture buffer', () => {
    // Test: captureUserAudio() returns frames
  });

  it('should handle multiple users simultaneously', () => {
    // Test: capture from 3+ users without conflict
  });

  it('should drop old frames after max age', () => {
    // Test: frames older than 1s are removed
  });

  it('should detect silence frames', () => {
    // Test: isSilence flag set correctly
  });

  it('should handle capture buffer overflow', () => {
    // Test: drop oldest frames, emit event
  });

  it('should track capture statistics', () => {
    // Test: framesProcessed, framesDropped updated
  });

  it('should stop capture gracefully', async () => {
    // Test: stopCapture() succeeds
  });

  it('should return null for inactive user', () => {
    // Test: getUserAudioStream(unknownUserId) returns null
  });
});
```

### C. Audio Playback (10 tests)

```typescript
describe('AudioStreamHandler - Audio Playback', () => {
  it('should queue audio buffer for playback', async () => {
    // Test: playAudioStream(buffer) succeeds
  });

  it('should accept PCM audio data', async () => {
    // Test: playback of PCM frames
  });

  it('should queue multiple frames correctly', async () => {
    // Test: playAudioFrames([...frames])
  });

  it('should maintain playback buffer size limits', () => {
    // Test: buffer doesn't exceed maxSize
  });

  it('should emit playbackBufferLow when < 100ms', () => {
    // Test: listener receives low buffer warning
  });

  it('should emit playbackBufferFull when > 90% full', () => {
    // Test: listener receives full buffer warning
  });

  it('should handle playback buffer underflow', async () => {
    // Test: insert silence, pause playback
  });

  it('should stop playback gracefully', async () => {
    // Test: stopPlayback() succeeds
  });

  it('should track playback statistics', () => {
    // Test: framesQueued, framesPlayed updated
  });

  it('should return accurate playback status', () => {
    // Test: getPlaybackStatus() returns correct values
  });
});
```

### D. Opus Encoding (8 tests)

```typescript
describe('AudioStreamHandler - Opus Encoding', () => {
  it('should encode PCM to Opus', () => {
    // Test: encodeToOpus(buffer) returns Opus data
  });

  it('should require exactly 3840 bytes input', () => {
    // Test: throws on wrong size
  });

  it('should return variable-size Opus frames', () => {
    // Test: output 20-60 bytes typically
  });

  it('should detect silence and encode efficiently', () => {
    // Test: silent frames encode to ~1 byte
  });

  it('should handle consecutive encoding calls', () => {
    // Test: encode 10 frames in sequence
  });

  it('should increment framesProcessed on success', () => {
    // Test: captureStats.framesProcessed ++
  });

  it('should increment framesDropped on error', () => {
    // Test: invalid input → framesDropped ++
  });

  it('should throw AudioStreamError on encoding failure', () => {
    // Test: specific error type
  });
});
```

### E. Opus Decoding (8 tests)

```typescript
describe('AudioStreamHandler - Opus Decoding', () => {
  it('should decode Opus to PCM', () => {
    // Test: decodeFromOpus(buffer) returns PCM
  });

  it('should return exactly 3840 bytes PCM', () => {
    // Test: buffer.length === 3840
  });

  it('should create per-user decoders', () => {
    // Test: decodeFromOpus(buf1, ssrc1) and (buf2, ssrc2) use different decoders
  });

  it('should reuse decoder for same SSRC', () => {
    // Test: getOrCreateDecoder(ssrc) called once per ssrc
  });

  it('should handle silence frames', () => {
    // Test: decode 1-byte DTX silence packet
  });

  it('should handle frame loss gracefully', () => {
    // Test: decoder interpolates missing frames
  });

  it('should track decode statistics', () => {
    // Test: framesProcessed updated
  });

  it('should throw AudioStreamError on decode failure', () => {
    // Test: invalid data → throws
  });
});
```

### F. Buffer Management (6 tests)

```typescript
describe('AudioStreamHandler - Buffer Management', () => {
  it('should create circular buffer with correct size', () => {
    // Test: buffer.maxSize === configured size
  });

  it('should wrap around when full', () => {
    // Test: push 11 items to 10-size buffer
    // Verify oldest item overwritten
  });

  it('should trim old frames periodically', () => {
    // Test: frames older than maxFrameAge removed
  });

  it('should maintain proper read/write indices', () => {
    // Test: buffer.getSize() accurate after operations
  });

  it('should handle concurrent push/pop', () => {
    // Test: add and remove frames simultaneously
  });

  it('should clear buffer completely', () => {
    // Test: buffer.clear() → buffer.isEmpty()
  });
});
```

### G. User Audio Streams (4 tests)

```typescript
describe('AudioStreamHandler - User Audio Streams', () => {
  it('should track audio from multiple users', () => {
    // Test: addUserAudio(userId1), addUserAudio(userId2)
  });

  it('should return correct audio for each user', () => {
    // Test: captureUserAudio(userId1) vs captureUserAudio(userId2)
  });

  it('should detect user speaking/silence', () => {
    // Test: userStartedSpeaking, userStoppedSpeaking events
  });

  it('should clean up inactive user streams', () => {
    // Test: getAllActiveUsers() size reduces after timeout
  });
});
```

### H. Error Handling (4 tests)

```typescript
describe('AudioStreamHandler - Error Handling', () => {
  it('should throw AudioStreamError on buffer overflow', async () => {
    // Test: fill buffer, verify error
  });

  it('should emit error events for codec failures', () => {
    // Test: listener receives error event
  });

  it('should handle disconnected voice connection', () => {
    // Test: voiceConnection becomes null
  });

  it('should recover from transient errors', async () => {
    // Test: error → retry → success
  });
});
```

### Test Utilities

```typescript
// Mock VoiceConnection with audio stream
class MockVoiceConnection {
  receiver: MockAudioReceiver;
  
  on(event: string, listener: Function) {
    if (event === 'ready') {
      setTimeout(() => listener(), 10);
    }
  }
}

// Mock Opus encoder
class MockOpusEncoder {
  encode(buffer: Buffer): Buffer {
    // Return compressed data (simulate 20-60 byte frames)
    return Buffer.alloc(Math.random() * 40 + 20);
  }
}

// Helper to create test audio frames
function createTestAudioFrame(
  sampleCount: number = 960,
  timestamp: number = Date.now()
): AudioFrame {
  return {
    data: Buffer.alloc(sampleCount * 4), // 2 channels × 2 bytes
    sampleRate: 48000,
    channels: 2,
    sampleCount,
    timestamp,
    isSilence: false,
    isJitter: false
  };
}
```

---

## Part 6: Integration with VoiceConnectionManager

### How Phase 3 Uses Phase 2

**VoiceConnectionManager provides:**
1. `VoiceConnection` object (from Discord.js voice)
2. Connection state tracking
3. Event emission system
4. Guild/channel management

**AudioStreamHandler uses:**

```typescript
// Phase 3 constructor
constructor(
  voiceConnection: VoiceConnection,  // Provided by Phase 2
  guildId: string,
  options?: AudioStreamHandlerOptions
) {
  this.voiceConnection = voiceConnection;
  this.guildId = guildId;
  
  // Set up listeners for connection events
  voiceConnection.on('ready', () => this.handleConnectionReady());
  voiceConnection.on('error', (error) => this.handleConnectionError(error));
  voiceConnection.on('disconnect', () => this.handleDisconnect());
}
```

### Integration Pattern

```typescript
// Phase 2: VoiceConnectionManager
class VoiceConnectionManager {
  async connect(guildId: string, channelId: string): Promise<VoiceConnection> {
    // Returns VoiceConnection object
    return connection;
  }
}

// Phase 3: Audio handling using Phase 2's connection
async function setupAudioForGuild(guildId: string) {
  const connectionManager = new VoiceConnectionManager(client);
  const voiceConnection = await connectionManager.connect(guildId, channelId);
  
  // Pass connection to Phase 3
  const audioHandler = new AudioStreamHandler(voiceConnection, guildId);
  await audioHandler.initialize();
  
  // Now can capture/play audio
  await audioHandler.startCapture();
}
```

### VoiceConnection Interface (from @discordjs/voice)

```typescript
interface VoiceConnection {
  // Connection state
  state: VoiceConnectionState;
  joinConfig: JoinVoiceChannelData;
  
  // Audio streams
  receiver: VoiceReceiver;
  state: AudioPlayer | null;
  
  // Connection lifecycle
  connect(): Promise<void>;
  destroy(adapterAvailable: boolean): void;
  
  // Events
  on(event: 'ready', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'disconnect', listener: () => void): this;
  on(event: 'authenticated', listener: () => void): this;
  // ... other events
}
```

---

## Part 7: Success Criteria for Phase 3

### Functional Requirements ✓

- [ ] Capture user voice data from Discord streams
- [ ] Return captured audio as AudioBuffer array
- [ ] Play audio back to Discord voice channel
- [ ] Support concurrent capture from multiple users
- [ ] Handle Opus encoding without data loss
- [ ] Handle Opus decoding without artifacts
- [ ] Manage buffer overflow gracefully
- [ ] Detect and skip aged frames (>1s old)
- [ ] Track audio statistics accurately

### Audio Quality Requirements ✓

- [ ] Maintain 48kHz sample rate exactly
- [ ] Preserve stereo (2 channel) format
- [ ] Support 20ms audio frames
- [ ] Minimize latency (<100ms end-to-end)
- [ ] Handle jitter in packet arrival
- [ ] Recover from frame loss without dropout

### Code Quality Requirements ✓

- [ ] 48+ test cases (all passing)
- [ ] Full TypeScript type safety
- [ ] JSDoc on all public methods
- [ ] No `any` types (except framework)
- [ ] Proper error class implementation
- [ ] Clean code structure
- [ ] <5% CPU per concurrent stream
- [ ] No memory leaks on destroy

### Resource Management Requirements ✓

- [ ] Predictable memory usage (circular buffers)
- [ ] Proper cleanup on destroy
- [ ] No event listener accumulation
- [ ] Timeout cleanup
- [ ] Decoder cleanup per user
- [ ] Stream closure handling

### Integration Requirements ✓

- [ ] Works with Phase 2 VoiceConnectionManager
- [ ] Uses VoiceConnection interface correctly
- [ ] Integrates with Phase 4 (STT)
- [ ] Integrates with Phase 5 (TTS)
- [ ] Compatible with existing types

---

## Part 8: Implementation Checklist

### Phase 3.1: Setup & Types (30 minutes)

- [ ] Create `src/AudioStreamHandler.ts` file
- [ ] Create `__tests__/AudioStreamHandler.test.ts` file
- [ ] Update `src/types.ts` with all audio types
- [ ] Update `src/index.ts` to export new classes
- [ ] Verify TypeScript compiles
- [ ] Commit: "feat(voice): Phase 3 structure and types"

### Phase 3.2: Test Suite (1 hour)

Following TDD approach - write tests FIRST:

- [ ] Section A: Constructor tests (6 tests)
- [ ] Section B: Capture tests (10 tests)
- [ ] Section C: Playback tests (10 tests)
- [ ] Section D: Encoding tests (8 tests)
- [ ] Section E: Decoding tests (8 tests)
- [ ] Section F: Buffer tests (6 tests)
- [ ] Section G: User stream tests (4 tests)
- [ ] Section H: Error handling tests (4 tests)
- [ ] Run `npm test` - expect ~48 failures
- [ ] Commit: "test(voice): Phase 3 comprehensive test suite"

### Phase 3.3: Core Implementation (1.5 hours)

Implement one section at a time:

#### Step 1: Constructor & Initialization (15 min)
- [ ] Create AudioStreamHandler class
- [ ] Implement constructor
- [ ] Implement initialize()
- [ ] Implement destroy()
- [ ] Run tests A - expect 6/6 pass
- [ ] Commit: "feat(voice): Phase 3.3.1 constructor"

#### Step 2: Circular Buffer (15 min)
- [ ] Implement CircularBuffer<T> class
- [ ] Implement push/pop/peek methods
- [ ] Implement clear/getSize methods
- [ ] Run tests F - expect 6/6 pass
- [ ] Commit: "feat(voice): Phase 3.3.2 circular buffer"

#### Step 3: Opus Encoder (20 min)
- [ ] Import @discordjs/opus
- [ ] Implement createOpusEncoder()
- [ ] Implement encodeToOpus()
- [ ] Add error handling
- [ ] Run tests D - expect 8/8 pass
- [ ] Commit: "feat(voice): Phase 3.3.3 opus encoding"

#### Step 4: Opus Decoder (20 min)
- [ ] Implement getOrCreateDecoder()
- [ ] Implement decodeFromOpus()
- [ ] Add per-user decoder tracking
- [ ] Add error handling
- [ ] Run tests E - expect 8/8 pass
- [ ] Commit: "feat(voice): Phase 3.3.4 opus decoding"

#### Step 5: Audio Capture (20 min)
- [ ] Implement startCapture()
- [ ] Implement stopCapture()
- [ ] Implement captureUserAudio()
- [ ] Implement frame trimming
- [ ] Implement silence detection
- [ ] Implement overflow handling
- [ ] Run tests B - expect 10/10 pass
- [ ] Commit: "feat(voice): Phase 3.3.5 audio capture"

#### Step 6: Audio Playback (20 min)
- [ ] Implement playAudioStream()
- [ ] Implement playAudioFrames()
- [ ] Implement stopPlayback()
- [ ] Implement getPlaybackStatus()
- [ ] Implement buffer monitoring
- [ ] Add underflow handling
- [ ] Run tests C - expect 10/10 pass
- [ ] Commit: "feat(voice): Phase 3.3.6 audio playback"

#### Step 7: User Audio Streams & Stats (15 min)
- [ ] Implement user stream tracking
- [ ] Implement getAllActiveUsers()
- [ ] Implement statistics tracking
- [ ] Implement getCaptureStats()
- [ ] Implement getPlaybackStats()
- [ ] Run tests G - expect 4/4 pass
- [ ] Commit: "feat(voice): Phase 3.3.7 user streams"

#### Step 8: Event System (10 min)
- [ ] Implement addEventListener()
- [ ] Implement removeEventListener()
- [ ] Implement event emission
- [ ] Test event firing
- [ ] Run all tests H - expect 4/4 pass
- [ ] Commit: "feat(voice): Phase 3.3.8 events"

### Phase 3.4: Integration Testing (30 minutes)

- [ ] Test with real VoiceConnection
- [ ] Test capture + playback cycle
- [ ] Test with multiple users
- [ ] Test buffer management under load
- [ ] Test memory usage stability
- [ ] Create integration test file
- [ ] Verify all 48 tests pass: `npm test`
- [ ] Commit: "test(voice): Phase 3 integration tests"

### Phase 3.5: Build & Verification (30 minutes)

- [ ] Run TypeScript build: `npm run build`
- [ ] Verify no build errors
- [ ] Check generated type definitions
- [ ] Review dist/ directory structure
- [ ] Verify all exports available
- [ ] Test importing from package
- [ ] Commit: "build(voice): Phase 3 TypeScript build"

### Phase 3.6: Code Review & Documentation (30 minutes)

- [ ] Review code for quality
- [ ] Add/verify JSDoc comments
- [ ] Create PHASE3_IMPLEMENTATION.md usage guide
- [ ] Create PHASE3_QUICK_REFERENCE.md
- [ ] Update README.md with Phase 3 info
- [ ] Add code examples
- [ ] Verify all exported APIs documented
- [ ] Commit: "docs(voice): Phase 3 documentation"

### Phase 3.7: Final Verification (20 minutes)

Verify all success criteria met:

- [ ] Run full test suite: `npm test`
  - Expected: 48/48 tests passing
  - Duration: <5 seconds
  
- [ ] Verify TypeScript:
  - Command: `npx tsc --noEmit`
  - Expected: 0 errors, 0 warnings
  
- [ ] Check code coverage:
  - Command: `npm test -- --coverage`
  - Expected: >85% coverage
  
- [ ] Verify no memory leaks:
  - Create test with 100+ capture frames
  - Monitor memory usage
  - Expected: stable within 10%
  
- [ ] Test with Phase 2 integration:
  - Create connection using VoiceConnectionManager
  - Wrap with AudioStreamHandler
  - Capture and playback successfully

### Phase 3.8: Final Commit (10 minutes)

```bash
# Stage all changes
git add -A

# Review changes
git diff --cached

# Create comprehensive commit
git commit -m "feat(voice): Phase 3 AudioStreamHandler complete

- Implemented AudioStreamHandler class for audio stream management
- Added circular buffer for efficient audio frame handling
- Integrated Opus encoder/decoder for audio compression
- Implemented audio capture from Discord streams
- Implemented audio playback to Discord voice channels
- Added comprehensive statistics tracking
- Created 48 test cases (all passing)
- Full TypeScript type safety
- Proper error handling and recovery
- Ready for Phase 4 STT integration

Closes: Phase 3 implementation"

# Verify commit
git log --oneline -1
```

---

## Part 9: Timing Summary

| Phase | Task | Time | Total |
|-------|------|------|-------|
| 3.1 | Setup & Types | 30 min | 30 min |
| 3.2 | Test Suite | 60 min | 90 min |
| 3.3 | Implementation | 90 min | 180 min |
| 3.4 | Integration Testing | 30 min | 210 min |
| 3.5 | Build & Verification | 30 min | 240 min |
| 3.6 | Code Review & Docs | 30 min | 270 min |
| 3.7 | Final Verification | 20 min | 290 min |
| 3.8 | Commit | 10 min | 300 min |
| **TOTAL** | | **5 hours** | **300 min** |

**Realistic Duration:** 2.5-3.5 hours (with breaks and iteration)

---

## Part 10: Known Limitations & Future Work

### Limitations (By Design)

1. **Fixed Buffer Sizes** - Cannot dynamically grow buffers
   - Mitigation: Configure sizes for expected latency
   - Future: Implement dynamic buffer sizing (Phase 6+)

2. **Per-Decoder Overhead** - One decoder per unique user
   - Mitigation: Clean up inactive users
   - Future: Implement decoder pooling (Phase 6+)

3. **Synchronous Encoding/Decoding** - Blocks event loop
   - Mitigation: Opus operations are very fast (<5ms)
   - Future: Use worker threads for heavy processing (Phase 6+)

4. **No RTP Packet Assembly** - Assumes complete frames
   - Mitigation: Discord packets are complete
   - Future: Add packet reassembly (Phase 6+)

5. **Basic Silence Detection** - Energy-based only
   - Mitigation: Good enough for VAD
   - Future: Machine learning silence detection (Phase 6+)

### Future Enhancements (Post-Phase 3)

1. **Acoustic Echo Cancellation (AEC)**
   - Detect and remove speaker audio from mic input
   - Improve call quality

2. **Noise Suppression**
   - Background noise reduction
   - Better transcription accuracy

3. **Automatic Gain Control (AGC)**
   - Normalize audio levels
   - Prevent distortion

4. **Multi-Stream Recording**
   - Record each user separately
   - Mix streams at different levels

5. **Real-time Metrics**
   - Network jitter detection
   - Packet loss rate
   - MOS (Mean Opinion Score) estimation

6. **Audio Format Conversion**
   - WAV export
   - MP3 export
   - Different sample rates

---

## Part 11: References & Resources

### @discordjs/voice Documentation
- [Discord.js Voice GitHub](https://github.com/discordjs/voice)
- [VoiceConnection API](https://discord.js.org/#/docs/voice/stable/class/VoiceConnection)
- [Audio Receiver API](https://discord.js.org/#/docs/voice/stable/class/VoiceReceiver)

### Opus Codec
- [Opus RFC 6716](https://tools.ietf.org/html/rfc6716) - Full specification
- [IETF Opus Documentation](https://opus-codec.org/) - Official docs
- [@discordjs/opus](https://github.com/discordjs/opus) - Wrapper package

### Audio Processing
- [prism-media GitHub](https://github.com/hydrabolt/prism-media) - Format conversion
- [WebAudio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) - Audio concepts

### Discord Voice Protocol
- [Discord Voice Connections](https://discord.com/developers/docs/topics/voice-connections)
- [Discord Audio Codec](https://discord.com/developers/docs/topics/voice-connections#audio-codec)

### Testing
- [Vitest Documentation](https://vitest.dev/) - Test framework
- [Chai Assertions](https://www.chaijs.com/api/) - Assertion library

---

## Part 12: Phase 3 Quick Reference

### Class API (Public Methods)

```typescript
// Initialization
constructor(connection: VoiceConnection, guildId: string, options?: AudioStreamHandlerOptions)
async initialize(): Promise<void>
async destroy(): Promise<void>

// Capture
async startCapture(): Promise<void>
async stopCapture(): Promise<void>
captureUserAudio(userId: string): AudioBuffer[] | null
getUserAudioStream(userId: string): ReadableStream<AudioFrame> | null
getAllActiveUsers(): string[]

// Playback
async playAudioStream(audioData: Buffer): Promise<void>
async playAudioFrames(frames: AudioFrame[]): Promise<void>
async stopPlayback(): Promise<void>
getPlaybackStatus(): PlaybackStatus

// Codec
encodeToOpus(pcmBuffer: Buffer): Buffer
decodeFromOpus(opusBuffer: Buffer, ssrc?: number): Buffer

// Buffers
getCapturBufferSize(): number
getPlaybackBufferSize(): number

// Listeners & Stats
addEventListener(listener: AudioStreamListener): void
removeEventListener(listener: AudioStreamListener): void
getCaptureStats(): AudioStreamStats
getPlaybackStats(): AudioStreamStats
resetStats(): void
```

### Configuration Examples

```typescript
// Default configuration
const handler = new AudioStreamHandler(connection, guildId);

// Custom configuration
const handler = new AudioStreamHandler(connection, guildId, {
  captureBufferSize: 10,        // 200ms
  playbackBufferSize: 25,       // 500ms
  opusBitrate: 64000,           // 64 kbps
  enableSilenceDetection: true,
  debug: true                   // Enable logging
});
```

### Common Usage Pattern

```typescript
// Setup
const audioHandler = new AudioStreamHandler(voiceConnection, guildId);
await audioHandler.initialize();

// Start capturing
await audioHandler.startCapture();

// Listen for events
audioHandler.addEventListener({
  onFrameCaptured: (frame) => {
    console.log(`Captured ${frame.sampleCount} samples`);
  },
  onUserStartedSpeaking: (userId) => {
    console.log(`User ${userId} started speaking`);
  }
});

// Capture audio from user
const audioFrames = audioHandler.captureUserAudio('user-id');
if (audioFrames) {
  // Process audio...
  console.log(`Got ${audioFrames.length} frames`);
}

// Play audio back
const pcmBuffer = Buffer.alloc(3840); // Create audio
await audioHandler.playAudioStream(pcmBuffer);

// Cleanup
await audioHandler.stopCapture();
await audioHandler.destroy();
```

---

## Part 13: Questions & Answers

**Q: What if my VoiceConnection becomes invalid?**  
A: The handler detects disconnection and emits error event. Gracefully stop capture/playback. Reconnect requires new handler instance.

**Q: Can I capture from multiple users at once?**  
A: Yes! Each user gets their own decoder and audio stream. Capture independently with `captureUserAudio(userId)`.

**Q: How do I integrate with Phase 4 (STT)?**  
A: Get captured frames with `captureUserAudio(userId)`, encode to Opus with `encodeToOpus()`, send to Whisper API.

**Q: What's the latency?**  
A: ~100ms end-to-end (20ms capture + 20ms buffer + 20ms codec + 40ms jitter buffer).

**Q: How much CPU does audio processing use?**  
A: ~2-5% per stream. Opus encoding is highly optimized.

**Q: Can I record to file?**  
A: Not in Phase 3 - that's Phase 6+ feature. For now, collect AudioBuffer arrays.

**Q: What if buffer overflows?**  
A: Oldest frames are automatically discarded. Event emitted for monitoring. Consider increasing buffer size.

**Q: How do I debug audio issues?**  
A: Enable `debug: true` in options. Check `getCaptureStats()` and `getPlaybackStats()` for metrics.

---

## Phase 3 Status

```
Status: ✅ PLANNING COMPLETE

Key Deliverables:
├─ Type Definitions: ✅ DESIGNED
├─ Class Structure: ✅ DESIGNED
├─ Test Suite (48 tests): ✅ DESIGNED
├─ Implementation Checklist: ✅ DESIGNED
├─ Buffer Strategy: ✅ DESIGNED
├─ Opus Integration: ✅ DESIGNED
├─ Integration Points: ✅ DEFINED
└─ Success Criteria: ✅ DEFINED

Ready for Implementation: ✅ YES
```

---

## Next Steps

1. ✅ Read this document (PHASE3_PLAN.md)
2. 🔲 **For Implementation Agent:**
   - Follow Phase 3.1-3.8 checklist
   - Implement TDD style (tests first)
   - Run tests frequently
   - Commit after each section

3. 🔲 **For Code Review Agent:**
   - Verify all 48 tests pass
   - Check TypeScript compilation
   - Review code quality
   - Verify integration with Phase 2

4. 🔲 **For Main Agent:**
   - Approve Phase 3 implementation
   - Proceed to Phase 4 (STT Integration)

---

**Plan Prepared By:** Voice Integration Planning Agent (Phase 3)  
**Date:** 2026-02-07 19:54 EST  
**Status:** READY FOR IMPLEMENTATION ✅  
**Estimated Success Rate:** 95%+  
**Complexity Level:** Moderate 🟨  
**Dependencies:** Phase 2 Complete ✅
