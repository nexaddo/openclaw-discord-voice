# Phase 3: Audio Stream Handler — Technical Specification

**Status:** Planning Complete  
**Created:** 2026-02-06  
**Phase:** 3 of 4  
**Focus:** Audio capture, buffering, Opus codec handling, playback

---

## 1. Overview

The **AudioStreamHandler** manages audio I/O for Discord voice connections. It handles:

- Audio frame capture from local sources
- Jitter buffer management (incoming frames)
- Circular buffer for frame storage
- Opus encoding/decoding (48kHz, stereo, 960-sample frames)
- Playback queue management
- Error tracking and recovery

---

## 2. AudioStreamHandler Class Design

### 2.1 Class Definition

```typescript
class AudioStreamHandler {
  // Constructor
  constructor(config: AudioStreamConfig);

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  reset(): void;

  // Audio Input (Capture)
  captureFrame(buffer: Float32Array): Promise<void>;
  startCapture(): Promise<void>;
  stopCapture(): Promise<void>;

  // Audio Output (Playback)
  playFrame(audioBuffer: AudioBuffer): Promise<void>;
  startPlayback(): Promise<void>;
  stopPlayback(): Promise<void>;
  getPlaybackQueue(): AudioFrame[];

  // Opus Encoding
  encodeFrame(pcmData: Float32Array): Promise<Uint8Array>;
  encodeFrameBatch(frames: Float32Array[]): Promise<Uint8Array[]>;

  // Opus Decoding
  decodeFrame(opusData: Uint8Array): Promise<Float32Array>;
  decodeFrameBatch(frames: Uint8Array[]): Promise<Float32Array[]>;

  // Jitter Buffer Management
  enqueuFrame(frame: AudioFrame): void;
  dequeueFrame(): AudioFrame | null;
  getBufferHealth(): BufferHealth;
  flushBuffer(): void;

  // Statistics & Monitoring
  getStats(): AudioStreamStats;
  resetStats(): void;
  getLatency(): number;
  getBufferOccupancy(): number;

  // Error Handling
  onError(callback: ErrorHandler): void;
  clearErrorCallbacks(): void;
  getLastError(): AudioStreamError | null;
}
```

### 2.2 Configuration Interface

```typescript
interface AudioStreamConfig {
  // Audio parameters
  sampleRate: number; // 48000 Hz (required)
  channels: number; // 2 (stereo) or 1 (mono)
  frameSize: number; // 960 samples per frame (20ms @ 48kHz)
  bitRate: number; // 128000 (128 kbps, default)

  // Buffer configuration
  jitterBufferSize: number; // 5-20 frames
  circularBufferCapacity: number; // 100 frames (max storage)
  targetBufferLatency: number; // ms, default 40

  // Codec settings
  opusComplexity: number; // 0-10, default 5
  useFEC: boolean; // Forward Error Correction
  useDTX: boolean; // Discontinuous Transmission
  maxPlaybackRate: number; // 48000 (Hz)

  // Device configuration
  inputDeviceId?: string; // Audio input device
  outputDeviceId?: string; // Audio output device
  echoCancel?: boolean; // Echo cancellation
  noiseSuppression?: boolean; // Noise suppression

  // Error handling
  maxRetries: number; // Default 3
  timeoutMs: number; // Default 5000
  enableMetrics: boolean; // Track latency, quality
}
```

### 2.3 Core Data Structures

```typescript
// Audio Frame (input/output)
interface AudioFrame {
  timestamp: number; // milliseconds (monotonic)
  sequenceNumber: number; // Frame counter
  ssrc: number; // Synchronization source (RTP)
  data: Float32Array; // PCM audio data (48kHz, stereo)
  sampleCount: number; // 960 samples typical
  duration: number; // 20 ms typical
}

// Opus-encoded frame
interface OpusFrame {
  timestamp: number;
  sequenceNumber: number;
  ssrc: number;
  data: Uint8Array; // Opus-encoded bytes
  size: number; // Byte length
}

// Jitter buffer metadata
interface JitterBufferFrame {
  frame: AudioFrame;
  arrivalTime: number; // When frame arrived
  playoutTime: number; // When to play
  isPlayed: boolean;
}

// Statistics
interface AudioStreamStats {
  framesProcessed: number;
  framesEncoded: number;
  framesDecoded: number;
  framesDropped: number;
  frameLoss: number; // Percentage
  jitterMs: number; // Buffer jitter
  latencyMs: number; // End-to-end
  bufferOccupancy: number; // Frames in buffer
  captureUnderrun: number; // Underrun events
  playbackUnderrun: number; // Underrun events
  cpuUsage: number; // Estimated %
  codecQuality: number; // 0-100
}

// Buffer health status
interface BufferHealth {
  occupancy: number; // Current frame count
  capacity: number; // Max capacity
  percentFull: number; // 0-100
  isUnderrun: boolean; // < 2 frames
  isOverrun: boolean; // > 90% full
  jitter: number; // ms
  recommendation: string; // "optimal" | "low" | "high" | "critical"
}

// Error handling
interface AudioStreamError {
  code: AudioErrorCode;
  message: string;
  timestamp: number;
  context?: Record<string, any>;
  recoverable: boolean;
  retryCount: number;
}

enum AudioErrorCode {
  // Codec errors
  OPUS_ENCODE_FAILED = 1001,
  OPUS_DECODE_FAILED = 1002,
  INVALID_FRAME_SIZE = 1003,
  SAMPLE_RATE_MISMATCH = 1004,

  // Buffer errors
  BUFFER_OVERFLOW = 2001,
  BUFFER_UNDERRUN = 2002,
  JITTER_BUFFER_FULL = 2003,
  INVALID_FRAME_TIMESTAMP = 2004,

  // Device errors
  CAPTURE_DEVICE_FAILED = 3001,
  PLAYBACK_DEVICE_FAILED = 3002,
  DEVICE_NOT_FOUND = 3003,

  // Resource errors
  MEMORY_ALLOCATION_FAILED = 4001,
  ENCODER_UNAVAILABLE = 4002,
  DECODER_UNAVAILABLE = 4003,

  // State errors
  INVALID_STATE = 5001,
  NOT_INITIALIZED = 5002,
  ALREADY_INITIALIZED = 5003,
}
```

---

## 3. Audio Buffer Management

### 3.1 Jitter Buffer (JitterBuffer Class)

**Purpose:** Absorb timing variations in incoming frames, smooth playback.

```typescript
class JitterBuffer {
  constructor(maxFrames: number, targetLatency: number, sampleRate: number);

  // Operations
  enqueue(frame: AudioFrame): void;
  dequeue(): AudioFrame | null;
  peek(): AudioFrame | null;
  flush(): void;

  // Diagnostics
  getHealth(): BufferHealth;
  getOccupancy(): number;
  getJitter(): number;
  hasUnderrun(): boolean;
  hasOverrun(): boolean;

  // Adaptive management
  adjustTargetLatency(direction: 'increase' | 'decrease'): void;
  getRecommendedLatency(): number;
}
```

**Algorithm:**

1. Frames arrive with RTP timestamp (not wall-clock time)
2. Map RTP timestamp to playout time using target latency
3. Store frames in priority queue (sorted by playout time)
4. Dequeue when playout time ≤ current time
5. Drop late frames (timestamp < current playout)
6. Adapt latency if jitter increases

### 3.2 Circular Buffer (CircularAudioBuffer Class)

**Purpose:** Efficient storage for PCM audio frames (20ms chunks).

```typescript
class CircularAudioBuffer {
  constructor(capacity: number, frameSize: number);

  // Write operations
  writeFrame(frame: AudioFrame): void;
  write(samples: Float32Array): number; // Returns bytes written

  // Read operations
  readFrame(): AudioFrame | null;
  read(sampleCount: number): Float32Array | null;
  peek(): AudioFrame | null;

  // State
  getOccupancy(): number;
  getCapacity(): number;
  isEmpty(): boolean;
  isFull(): boolean;
  reset(): void;

  // Diagnostics
  getStats(): {
    totalWritten: number;
    totalRead: number;
    overflow: number;
    underrun: number;
  };
}
```

**Implementation Notes:**

- Use typed array for efficiency (Float32Array for stereo interleaved)
- Write head and read head with wrap-around
- Pre-allocate memory to prevent GC pauses
- Track high-water mark for diagnostics

### 3.3 Buffer Layout

```
Circular Buffer Layout (100 frames × 960 samples):

[Frame0][Frame1][Frame2]...[Frame99][Frame0 next][...]
 ↑                                      ↑
 Read Head                              Write Head
 (playback)                             (capture)

Each frame = 960 samples × 2 channels × 4 bytes (float32)
         = 7,680 bytes per frame
Circular capacity = 100 frames × 7,680 = 768 KB
```

---

## 4. Opus Codec Handling

### 4.1 Opus Encoder

```typescript
class OpusEncoder {
  constructor(
    sampleRate: number, // 48000
    channels: number, // 1 or 2
    complexity: number, // 0-10
    useFEC: boolean,
    useDTX: boolean,
  );

  encode(pcmData: Float32Array): Uint8Array;
  encodeFrame(frame: AudioFrame): OpusFrame;
  encodeBatch(frames: Float32Array[]): Uint8Array[];

  // Configuration
  setBitRate(bitRate: number): void;
  setComplexity(level: number): void;
  getFrameSize(): number;
  getMaxFrameSize(): number;

  // Cleanup
  destroy(): void;
}
```

**Frame Format:**

- Input: 960 samples (20ms @ 48kHz) × 2 channels = Float32Array(1920)
- Output: Variable-length Opus packet, typically 20-60 bytes
- Opus defaults to 128 kbps for stereo

### 4.2 Opus Decoder

```typescript
class OpusDecoder {
  constructor(
    sampleRate: number, // 48000
    channels: number, // 1 or 2
  );

  decode(opusData: Uint8Array): Float32Array;
  decodeFrame(frame: OpusFrame): AudioFrame;
  decodeBatch(frames: Uint8Array[]): Float32Array[];
  decodeLoss(frameSizeMs: number): Float32Array; // PLC

  // State
  getLastDecodedFrame(): AudioFrame | null;
  getFrameSize(): number;

  // Cleanup
  destroy(): void;
}
```

**Packet Loss Concealment (PLC):**

- When packet missing, generate synthetic audio (silence + comfort noise)
- Request frame size (20ms): 960 samples
- Decoder fills with algorithm-generated audio to maintain continuity

### 4.3 Audio Frame Specifications

| Property          | Value        | Notes                   |
| ----------------- | ------------ | ----------------------- |
| Sample Rate       | 48,000 Hz    | Discord standard        |
| Channels          | 2 (stereo)   | Can downmix to mono     |
| Frame Size        | 960 samples  | 20ms duration           |
| Bit Depth         | 32-bit float | PCM range: -1.0 to +1.0 |
| Bitrate           | 128 kbps     | Opus VBR, adjustable    |
| Frame Duration    | 20 ms        | Fixed @ 48kHz           |
| Frames per second | 50           | (1000 / 20)             |

---

## 5. Integration with Phase 2 VoiceConnectionManager

### 5.1 Architecture Flow

```
VoiceConnectionManager (Phase 2)
        ↓
        ├─ VoiceSocket (RTP/UDP)
        │   ├─ recv RTP packets → AudioStreamHandler.decodeFrame()
        │   └─ send RTP packets ← AudioStreamHandler.encodeFrame()
        │
        ├─ AudioStreamHandler (Phase 3)
        │   ├─ Capture local audio → encode → send to VoiceSocket
        │   ├─ Receive Opus → decode → playback
        │   └─ Manage jitter buffer + circular buffer
        │
        └─ VoiceState (RTP metadata)
            └─ SSRC, sequence, timestamp
```

### 5.2 Method Integration

**Sending Audio (Capture → Encode → Send):**

```typescript
// In VoiceConnectionManager
async sendAudio(pcmData: Float32Array) {
  // 1. AudioStreamHandler encodes
  const opusData = await handler.encodeFrame(pcmData);

  // 2. Wrap in RTP packet
  const rtpPacket = voiceSocket.createRTPPacket(
    opusData,
    sequenceNumber++,
    timestamp,
    ssrc
  );

  // 3. Send over UDP
  await voiceSocket.send(rtpPacket);
}
```

**Receiving Audio (Receive → Decode → Playback):**

```typescript
// In VoiceSocket listener
voiceSocket.on('rtp', async (rtpPacket) => {
  // 1. Extract Opus payload
  const opusData = rtpPacket.payload;

  // 2. AudioStreamHandler decodes
  const pcmData = await handler.decodeFrame({
    data: opusData,
    timestamp: rtpPacket.timestamp,
    sequenceNumber: rtpPacket.sequence,
    ssrc: rtpPacket.ssrc,
  });

  // 3. Enqueue for playback
  await handler.playFrame(pcmData);
});
```

### 5.3 Dependencies

**Imports from Phase 2:**

```typescript
import { VoiceConnectionManager } from './VoiceConnectionManager';
import { VoiceSocket } from './VoiceSocket';
import { RTPPacket, VoiceState } from './types';
```

**Exports to Phase 2:**

```typescript
export { AudioStreamHandler, AudioStreamConfig, AudioStreamError };
export { AudioFrame, OpusFrame, BufferHealth, AudioStreamStats };
```

---

## 6. Test Cases (TDD: 48 Cases)

### 6.1 Initialization & Lifecycle (6 tests)

- [ ] TC-001: Constructor accepts valid config
- [ ] TC-002: Constructor rejects invalid sample rate (not 48kHz)
- [ ] TC-003: initialize() creates encoder/decoder successfully
- [ ] TC-004: initialize() fails gracefully if Opus unavailable
- [ ] TC-005: shutdown() cleans up resources and stops processing
- [ ] TC-006: reset() clears buffers but keeps handler alive

### 6.2 Audio Capture (6 tests)

- [ ] TC-007: captureFrame() accepts Float32Array PCM data
- [ ] TC-008: captureFrame() rejects invalid buffer size
- [ ] TC-009: captureFrame() increments sequence number
- [ ] TC-010: captureFrame() updates timestamp correctly
- [ ] TC-011: startCapture() begins frame acquisition
- [ ] TC-012: stopCapture() halts frame acquisition

### 6.3 Opus Encoding (8 tests)

- [ ] TC-013: encodeFrame() returns Uint8Array
- [ ] TC-014: encodeFrame() produces valid Opus packet (20-60 bytes)
- [ ] TC-015: encodeFrame() rejects non-960-sample frames
- [ ] TC-016: encodeFrame() preserves audio quality (SNR > 40dB)
- [ ] TC-017: encodeFrameBatch() encodes multiple frames
- [ ] TC-018: encodeFrameBatch() maintains frame order
- [ ] TC-019: encodeFrame() with FEC enabled produces larger packets
- [ ] TC-020: encodeFrame() with DTX enabled skips silence

### 6.4 Opus Decoding (8 tests)

- [ ] TC-021: decodeFrame() accepts Uint8Array Opus data
- [ ] TC-022: decodeFrame() returns Float32Array PCM (960 × 2 samples)
- [ ] TC-023: decodeFrame() handles frame loss with PLC
- [ ] TC-024: decodeBatch() decodes multiple frames
- [ ] TC-025: decodeBatch() maintains timestamp order
- [ ] TC-026: decodeFrame() rejects invalid Opus packet
- [ ] TC-027: decodeFrame() after silence produces noise gate output
- [ ] TC-028: decodeLoss() generates synthetic audio for missing frames

### 6.5 Jitter Buffer Management (8 tests)

- [ ] TC-029: enqueueFrame() adds frame to jitter buffer
- [ ] TC-030: enqueueFrame() rejects out-of-order frames
- [ ] TC-031: dequeueFrame() returns frame when playout time reached
- [ ] TC-032: dequeueFrame() returns null if buffer empty
- [ ] TC-033: getBufferHealth() reports occupancy
- [ ] TC-034: getBufferHealth() detects underrun (< 2 frames)
- [ ] TC-035: getBufferHealth() detects overrun (> 90% full)
- [ ] TC-036: flushBuffer() clears all frames

### 6.6 Circular Buffer Management (6 tests)

- [ ] TC-037: writeFrame() stores frame in circular buffer
- [ ] TC-038: readFrame() retrieves oldest frame
- [ ] TC-039: getOccupancy() reports frame count
- [ ] TC-040: Circular buffer wraps correctly (write_head > capacity)
- [ ] TC-041: Buffer overflow detected and reported
- [ ] TC-042: Buffer underrun detected and reported

### 6.7 Error Handling (6 tests)

- [ ] TC-043: onError() callback fires on encoding failure
- [ ] TC-044: onError() callback fires on decoding failure
- [ ] TC-045: encodeFrame() retries on transient failure (< max retries)
- [ ] TC-046: getLastError() returns most recent error
- [ ] TC-047: clearErrorCallbacks() removes error handlers
- [ ] TC-048: Invalid state operation raises NOT_INITIALIZED error

---

## 7. Error Recovery Strategy

### 7.1 Encoder Failures

| Error                | Recovery                | Retry    |
| -------------------- | ----------------------- | -------- |
| Invalid frame size   | Log warning, skip frame | No       |
| Sample rate mismatch | Resample input          | Yes (1×) |
| Memory allocation    | Clear buffer cache      | Yes (2×) |
| Encoder timeout      | Reinitialize encoder    | Yes (3×) |

### 7.2 Decoder Failures

| Error                 | Recovery               | Retry    |
| --------------------- | ---------------------- | -------- |
| Corrupted Opus packet | PLC (generate silence) | No       |
| Invalid packet header | Skip, wait for next    | No       |
| Sample rate mismatch  | Resample output        | Yes (1×) |
| Memory allocation     | Clear cache            | Yes (2×) |

### 7.3 Buffer Failures

| Error                | Recovery             | Retry |
| -------------------- | -------------------- | ----- |
| Jitter buffer full   | Drop oldest frame    | No    |
| Circular buffer full | Drop capture frame   | No    |
| Timestamp inversion  | Detect discontinuity | No    |

---

## 8. Performance Targets

| Metric              | Target   | Tolerance           |
| ------------------- | -------- | ------------------- |
| Encoding latency    | < 5 ms   | ± 2 ms              |
| Decoding latency    | < 5 ms   | ± 2 ms              |
| Buffer latency      | 40 ms    | ± 10 ms             |
| Total E2E latency   | < 100 ms | ± 20 ms             |
| CPU usage           | < 10%    | per encoder/decoder |
| Memory footprint    | < 50 MB  | including buffers   |
| Jitter              | < 20 ms  | RMS                 |
| Frame loss handling | < 0.1%   | recovery rate       |

---

## 9. Implementation Checklist

- [ ] Create `AudioStreamHandler` base class
- [ ] Implement `OpusEncoder` wrapper
- [ ] Implement `OpusDecoder` wrapper
- [ ] Implement `JitterBuffer` with adaptive latency
- [ ] Implement `CircularAudioBuffer` with wrap-around
- [ ] Add comprehensive error handling (8 error codes minimum)
- [ ] Add metrics collection (stats aggregation)
- [ ] Integrate with VoiceConnectionManager
- [ ] Write 48 test cases (TDD)
- [ ] Performance benchmarking
- [ ] Memory profiling
- [ ] Integration testing with real Discord voice

---

## 10. Next Steps (Phase 4)

Phase 4 will add:

- Voice Activity Detection (VAD)
- Noise suppression / echo cancellation
- Advanced resampling
- Recording to file
- Multi-speaker mixing

---

**End of PHASE3_PLAN.md**
