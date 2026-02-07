# Phase 3: Quick Reference — Implementation Cheat Sheet

**For:** Builder agent implementing AudioStreamHandler  
**Updated:** 2026-02-06  
**Read Time:** 5 minutes

---

## 🎯 The Job

Build `AudioStreamHandler` class that:
1. **Encodes** PCM audio → Opus packets
2. **Decodes** Opus packets → PCM audio
3. **Buffers** incoming frames (jitter buffer)
4. **Stores** frames (circular buffer)
5. **Monitors** audio health (stats, latency, drop rate)

---

## 📦 Core Classes

### AudioStreamHandler (Main)
```typescript
constructor(config: AudioStreamConfig)
initialize(): Promise<void>        // Start codec
shutdown(): Promise<void>          // Stop codec
reset(): void                      // Clear buffers

// Encoding
encodeFrame(pcm: Float32Array): Promise<Uint8Array>
encodeFrameBatch(frames: Float32Array[]): Promise<Uint8Array[]>

// Decoding
decodeFrame(opusData: Uint8Array): Promise<Float32Array>
decodeFrameBatch(frames: Uint8Array[]): Promise<Float32Array[]>

// Buffers
enqueuFrame(frame: AudioFrame): void       // Jitter buffer
dequeueFrame(): AudioFrame | null
flushBuffer(): void

// Stats
getStats(): AudioStreamStats
getBufferHealth(): BufferHealth
getLatency(): number
```

### JitterBuffer (Dependency)
```typescript
constructor(maxFrames, targetLatency, sampleRate)
enqueue(frame): void
dequeue(): AudioFrame | null
getHealth(): BufferHealth
```

### CircularAudioBuffer (Dependency)
```typescript
constructor(capacity, frameSize)
writeFrame(frame): void
readFrame(): AudioFrame | null
getOccupancy(): number
```

---

## 🔧 Audio Specs

| Setting | Value | Why |
|---------|-------|-----|
| Sample Rate | 48,000 Hz | Discord standard |
| Channels | 2 (stereo) | Discord default |
| Frame Size | 960 samples | 20ms @ 48kHz |
| Frame Duration | 20 ms | Fixed |
| Bitrate | 128 kbps | Opus default (VBR) |
| Opus Complexity | 5/10 | Balance quality/CPU |
| FEC | true | Recover lost packets |
| DTX | false | Keep audio flowing |

---

## 💾 Data Structures (Copy-Paste)

### AudioFrame
```typescript
interface AudioFrame {
  timestamp: number              // ms (monotonic)
  sequenceNumber: number         // Frame counter
  ssrc: number                   // RTP sync source
  data: Float32Array             // 1920 samples (stereo)
  sampleCount: number            // 960 typical
  duration: number               // 20 ms
}
```

### OpusFrame
```typescript
interface OpusFrame {
  timestamp: number
  sequenceNumber: number
  ssrc: number
  data: Uint8Array               // Variable size (20-60 bytes)
  size: number
}
```

### BufferHealth
```typescript
interface BufferHealth {
  occupancy: number              // Frames in buffer
  capacity: number               // Max capacity
  percentFull: number            // 0-100
  isUnderrun: boolean            // < 2 frames
  isOverrun: boolean             // > 90% full
  jitter: number                 // ms variance
  recommendation: string         // "optimal"|"low"|"high"|"critical"
}
```

### AudioStreamStats
```typescript
interface AudioStreamStats {
  framesProcessed: number
  framesEncoded: number
  framesDecoded: number
  framesDropped: number
  frameLoss: number              // %
  jitterMs: number
  latencyMs: number              // E2E
  bufferOccupancy: number
  captureUnderrun: number
  playbackUnderrun: number
  cpuUsage: number               // Est. %
  codecQuality: number           // 0-100
}
```

---

## ⚠️ Error Codes (Important!)

```typescript
enum AudioErrorCode {
  // Codec (1000s)
  OPUS_ENCODE_FAILED = 1001,
  OPUS_DECODE_FAILED = 1002,
  INVALID_FRAME_SIZE = 1003,
  SAMPLE_RATE_MISMATCH = 1004,

  // Buffer (2000s)
  BUFFER_OVERFLOW = 2001,
  BUFFER_UNDERRUN = 2002,
  JITTER_BUFFER_FULL = 2003,
  INVALID_FRAME_TIMESTAMP = 2004,

  // Device (3000s)
  CAPTURE_DEVICE_FAILED = 3001,
  PLAYBACK_DEVICE_FAILED = 3002,
  DEVICE_NOT_FOUND = 3003,

  // Resource (4000s)
  MEMORY_ALLOCATION_FAILED = 4001,
  ENCODER_UNAVAILABLE = 4002,
  DECODER_UNAVAILABLE = 4003,

  // State (5000s)
  INVALID_STATE = 5001,
  NOT_INITIALIZED = 5002,
  ALREADY_INITIALIZED = 5003,
}
```

---

## 🧵 Key Algorithms

### Encoding (PCM → Opus)
```
Input: Float32Array [960 × 2 samples] = 20ms audio
  ↓
Validate frame size (must be 960 samples)
  ↓
Opus encoder processes stereo input
  ↓
Output: Uint8Array (20-60 bytes typical)
  ↓
Return with metadata (timestamp, seq, SSRC)
```

### Decoding (Opus → PCM)
```
Input: Uint8Array (Opus packet)
  ↓
Validate packet header
  ↓
Opus decoder processes
  ↓
Output: Float32Array [960 × 2 samples]
  ↓
On packet loss: Generate PLC (synthetic audio)
  ↓
Return with metadata
```

### Jitter Buffer
```
Frame arrives with RTP timestamp (not wall-clock)
  ↓
Calculate playout time = RTP_timestamp + target_latency
  ↓
Enqueue in priority queue (sorted by playout time)
  ↓
Dequeue when playout_time ≤ now
  ↓
Drop frames with timestamp < current playout
  ↓
Monitor jitter → adapt target_latency if needed
```

### Circular Buffer
```
Write: [Frame 0] [Frame 1] ... [Frame 99] [Frame 0 next] ...
       ↑write_head                           ↑
       
Read:  [Frame 0] [Frame 1] ... [Frame 99] [Frame 0 next] ...
       ↑read_head

Wrap condition: (head + 1) % capacity
Occupancy: (write_head - read_head) % capacity
Full: occupancy >= capacity
Empty: occupancy == 0
```

---

## 🚀 Integration Points

### Sending (Capture → Encode)
```typescript
// Call this from VoiceConnectionManager
const opusData = await handler.encodeFrame(pcmData);
// → Wrap in RTP, send via UDP
```

### Receiving (Decode → Play)
```typescript
// From VoiceSocket.on('rtp')
const pcmData = await handler.decodeFrame(opusPayload);
// → Queue for playback
```

---

## ✅ Must-Have Features

1. **Initialize with config** → Create encoder/decoder
2. **Encode frames** → 960 sample → Opus bytes
3. **Decode frames** → Opus bytes → 960 sample
4. **Jitter buffer** → Queue frames by playout time
5. **Circular buffer** → Store PCM frames (100 frame capacity)
6. **Error tracking** → Log 8+ error codes
7. **Stats collection** → Track frames, latency, drops
8. **Buffer health** → Report occupancy, underrun, overrun

---

## 📊 Performance Minimums

| Metric | Target |
|--------|--------|
| Encode latency | < 5 ms |
| Decode latency | < 5 ms |
| Buffer latency | 40 ms |
| Total E2E | < 100 ms |
| CPU per instance | < 10% |
| Memory footprint | < 50 MB |
| Jitter handling | < 20 ms RMS |

---

## 🧪 Test Suite

**48 test cases** across:
- ✅ Initialization (6 tests)
- ✅ Capture (6 tests)
- ✅ Encoding (8 tests)
- ✅ Decoding (8 tests)
- ✅ Jitter buffer (8 tests)
- ✅ Circular buffer (6 tests)
- ✅ Error handling (6 tests)

**Critical tests to prioritize:**
- TC-013: encodeFrame() returns valid Opus
- TC-021: decodeFrame() returns valid PCM
- TC-029: enqueueFrame() buffers correctly
- TC-037: writeFrame() stores frame
- TC-043: Error callback fires

---

## 📝 Dependencies

**From Phase 2 (VoiceConnectionManager):**
- RTP packet structure
- SSRC (Sync Source) value
- Sequence number / timestamp management
- UDP socket interface

**External libraries:**
- `libopus` wrapper or `node-opus` package
- Native audio APIs (Web Audio API or PortAudio)
- BufferGeometry / circular queue utility

---

## 🎛️ Default Config Template

```typescript
const defaultConfig: AudioStreamConfig = {
  sampleRate: 48000,
  channels: 2,
  frameSize: 960,
  bitRate: 128000,
  jitterBufferSize: 10,
  circularBufferCapacity: 100,
  targetBufferLatency: 40,
  opusComplexity: 5,
  useFEC: true,
  useDTX: false,
  maxPlaybackRate: 48000,
  echoCancel: true,
  noiseSuppression: false,
  maxRetries: 3,
  timeoutMs: 5000,
  enableMetrics: true,
};
```

---

## 🐛 Common Pitfalls

1. **Frame size mismatch** → Always validate 960 samples
2. **Timestamp wraparound** → Use 32-bit RTP timestamps (will overflow)
3. **Buffer overflow** → Drop oldest frames, not newest
4. **Jitter buffer too large** → Adds latency (> 100 ms is bad)
5. **Sample rate mismatch** → Always resample if input ≠ 48kHz
6. **Memory leaks** → Call encoder/decoder .destroy() in shutdown()
7. **Async timing** → Don't assume encode/decode returns synchronously

---

## 📞 Contact Phase 2

**VoiceConnectionManager** expects:
```typescript
// Outgoing
handler.encodeFrame(pcm) → Promise<Uint8Array>

// Incoming
handler.decodeFrame(opus) → Promise<Float32Array>
handler.playFrame(audioBuffer) → Promise<void>
```

Keep the interface simple and synchronous where possible.

---

**End of PHASE3_QUICK_REFERENCE.md**
