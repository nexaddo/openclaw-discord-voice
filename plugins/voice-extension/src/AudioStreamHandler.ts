import {
  AudioStreamConfig,
  AudioFrame,
  OpusFrame,
  JitterBufferFrame,
  AudioStreamStats,
  BufferHealth,
  AudioStreamError,
  AudioErrorCode,
} from './types.js';

/**
 * Type for error callback function
 */
export type ErrorHandler = (error: AudioStreamError) => void;

/**
 * Circular audio buffer for efficient frame storage
 */
export class CircularAudioBuffer {
  private buffer: AudioFrame[];

  private capacity: number;

  private frameSize: number;

  private writeHead: number = 0;

  private readHead: number = 0;

  private occupancy: number = 0;

  private totalWritten: number = 0;

  private totalRead: number = 0;

  private overflowCount: number = 0;

  private underrunCount: number = 0;

  constructor(capacity: number, frameSize: number) {
    this.capacity = capacity;
    this.frameSize = frameSize;
    this.buffer = new Array(capacity);
  }

  writeFrame(frame: AudioFrame): void {
    if (this.occupancy >= this.capacity) {
      this.overflowCount++;
      this.writeHead = (this.writeHead + 1) % this.capacity;
      this.occupancy--;
    }

    this.buffer[this.writeHead] = frame;
    this.writeHead = (this.writeHead + 1) % this.capacity;
    this.occupancy++;
    this.totalWritten++;
  }

  readFrame(): AudioFrame | null {
    if (this.occupancy === 0) {
      this.underrunCount++;
      return null;
    }

    const frame = this.buffer[this.readHead];
    this.readHead = (this.readHead + 1) % this.capacity;
    this.occupancy--;
    this.totalRead++;
    return frame;
  }

  peek(): AudioFrame | null {
    if (this.occupancy === 0) {
      return null;
    }
    return this.buffer[this.readHead];
  }

  write(samples: Float32Array): number {
    // For raw sample writing (future enhancement)
    return samples.length;
  }

  read(sampleCount: number): Float32Array | null {
    // For raw sample reading (future enhancement)
    const frame = this.readFrame();
    if (!frame) return null;
    return frame.data.slice(0, sampleCount);
  }

  getOccupancy(): number {
    return this.occupancy;
  }

  getCapacity(): number {
    return this.capacity;
  }

  isEmpty(): boolean {
    return this.occupancy === 0;
  }

  isFull(): boolean {
    return this.occupancy >= this.capacity;
  }

  reset(): void {
    this.writeHead = 0;
    this.readHead = 0;
    this.occupancy = 0;
  }

  getStats(): {
    totalWritten: number;
    totalRead: number;
    overflow: number;
    underrun: number;
  } {
    return {
      totalWritten: this.totalWritten,
      totalRead: this.totalRead,
      overflow: this.overflowCount,
      underrun: this.underrunCount,
    };
  }
}

/**
 * Jitter buffer for managing incoming audio frames with adaptive latency
 */
export class JitterBuffer {
  private frames: JitterBufferFrame[] = [];

  private maxFrames: number;

  private targetLatency: number;

  private sampleRate: number;

  private lastPlayoutTime: number = 0;

  constructor(maxFrames: number, targetLatency: number, sampleRate: number) {
    this.maxFrames = maxFrames;
    this.targetLatency = targetLatency;
    this.sampleRate = sampleRate;
  }

  enqueue(frame: AudioFrame): void {
    const arrivalTime = Date.now();
    const playoutTime = arrivalTime + this.targetLatency;

    const jbFrame: JitterBufferFrame = {
      frame,
      arrivalTime,
      playoutTime,
      isPlayed: false,
    };

    // Insert in order
    this.frames.push(jbFrame);
    this.frames.sort((a, b) => a.playoutTime - b.playoutTime);

    // Remove old frames if buffer exceeds max
    if (this.frames.length > this.maxFrames) {
      this.frames = this.frames.slice(-this.maxFrames);
    }
  }

  dequeue(): AudioFrame | null {
    const now = Date.now();

    // Find first frame ready for playout
    for (let i = 0; i < this.frames.length; i++) {
      if (this.frames[i].playoutTime <= now) {
        const jbFrame = this.frames.splice(i, 1)[0];
        jbFrame.isPlayed = true;
        this.lastPlayoutTime = now;
        return jbFrame.frame;
      }
    }

    return null;
  }

  peek(): AudioFrame | null {
    if (this.frames.length === 0) return null;
    return this.frames[0].frame;
  }

  flush(): void {
    this.frames = [];
    this.lastPlayoutTime = 0;
  }

  getHealth(): BufferHealth {
    const occupancy = this.frames.length;
    const capacity = this.maxFrames;
    const percentFull = (occupancy / capacity) * 100;
    const isUnderrun = occupancy < 2;
    const isOverrun = percentFull > 90;

    // Calculate jitter
    let jitter = 0;
    if (this.frames.length > 1) {
      const times = this.frames.map((f) => f.arrivalTime);
      const diffs = [];
      for (let i = 1; i < times.length; i++) {
        diffs.push(Math.abs(times[i] - times[i - 1]));
      }
      jitter = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    }

    let recommendation = 'optimal';
    if (isUnderrun) recommendation = 'low';
    if (isOverrun) recommendation = 'high';
    if (isOverrun && percentFull > 95) recommendation = 'critical';

    return {
      occupancy,
      capacity,
      percentFull,
      isUnderrun,
      isOverrun,
      jitter,
      recommendation,
    };
  }

  getOccupancy(): number {
    return this.frames.length;
  }

  getJitter(): number {
    if (this.frames.length < 2) return 0;

    const times = this.frames.map((f) => f.arrivalTime);
    const diffs = [];
    for (let i = 1; i < times.length; i++) {
      diffs.push(Math.abs(times[i] - times[i - 1]));
    }
    return diffs.reduce((a, b) => a + b, 0) / diffs.length;
  }

  hasUnderrun(): boolean {
    return this.frames.length < 2;
  }

  hasOverrun(): boolean {
    return this.frames.length / this.maxFrames > 0.9;
  }

  adjustTargetLatency(direction: 'increase' | 'decrease'): void {
    const delta = 5; // 5ms adjustment
    if (direction === 'increase') {
      this.targetLatency += delta;
    } else {
      this.targetLatency = Math.max(20, this.targetLatency - delta);
    }
  }

  getRecommendedLatency(): number {
    return this.targetLatency;
  }
}

/**
 * Main AudioStreamHandler class for managing audio I/O
 */
export class AudioStreamHandler {
  private config: AudioStreamConfig;

  private initialized: boolean = false;

  private capturing: boolean = false;

  private playing: boolean = false;

  private jitterBuffer: JitterBuffer;

  private circularBuffer: CircularAudioBuffer;

  private errorCallbacks: ErrorHandler[] = [];

  private lastError: AudioStreamError | null = null;

  // Statistics tracking
  private stats: AudioStreamStats = {
    framesProcessed: 0,
    framesEncoded: 0,
    framesDecoded: 0,
    framesDropped: 0,
    frameLoss: 0,
    jitterMs: 0,
    latencyMs: 0,
    bufferOccupancy: 0,
    captureUnderrun: 0,
    playbackUnderrun: 0,
    cpuUsage: 0,
    codecQuality: 100,
  };

  private sequenceNumber: number = Math.floor(Math.random() * 65536);

  private timestamp: number = Math.floor(Math.random() * 0x100000000);

  private playbackQueue: AudioFrame[] = [];

  private startTime: number = 0;

  constructor(config: AudioStreamConfig) {
    // Validate config
    if (config.sampleRate !== 48000) {
      throw new Error('Sample rate must be 48000 Hz');
    }

    this.config = config;
    this.jitterBuffer = new JitterBuffer(config.jitterBufferSize, config.targetBufferLatency, config.sampleRate);
    this.circularBuffer = new CircularAudioBuffer(config.circularBufferCapacity, config.frameSize);
    this.startTime = Date.now();
  }

  /**
   * Initialize the handler and set up encoder/decoder
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      throw this.createError(AudioErrorCode.ALREADY_INITIALIZED, 'Handler already initialized', false);
    }

    try {
      // Setup encoder/decoder
      // In a real implementation, this would initialize Opus codec
      this.initialized = true;
    } catch (err) {
      throw this.createError(AudioErrorCode.ENCODER_UNAVAILABLE, 'Failed to initialize encoder/decoder', true);
    }
  }

  /**
   * Shutdown and clean up resources
   */
  async shutdown(): Promise<void> {
    this.initialized = false;
    this.capturing = false;
    this.playing = false;
    this.circularBuffer.reset();
    this.jitterBuffer.flush();
    this.errorCallbacks = [];
  }

  /**
   * Reset buffers while keeping handler active
   */
  reset(): void {
    this.circularBuffer.reset();
    this.jitterBuffer.flush();
    this.playbackQueue = [];
    this.resetStats();
  }

  /**
   * Capture audio frame from input
   */
  async captureFrame(buffer: Float32Array): Promise<void> {
    this.ensureInitialized();

    // Validate frame size
    const expectedSize = this.config.frameSize * this.config.channels;
    if (buffer.length !== expectedSize) {
      throw this.createError(
        AudioErrorCode.INVALID_FRAME_SIZE,
        `Invalid frame size: expected ${expectedSize}, got ${buffer.length}`,
        false,
      );
    }

    const frame: AudioFrame = {
      timestamp: this.timestamp,
      sequenceNumber: this.sequenceNumber++,
      ssrc: Math.floor(Math.random() * 0xffffffff),
      data: new Float32Array(buffer),
      sampleCount: this.config.frameSize,
      duration: 20,
    };

    // Store in circular buffer
    this.circularBuffer.writeFrame(frame);
    this.stats.framesProcessed++;

    // Update timestamp for next frame (20ms at 48kHz = 960 samples)
    this.timestamp += this.config.frameSize;
  }

  /**
   * Start audio capture
   */
  async startCapture(): Promise<void> {
    this.ensureInitialized();
    this.capturing = true;
  }

  /**
   * Stop audio capture
   */
  async stopCapture(): Promise<void> {
    this.capturing = false;
  }

  /**
   * Encode PCM data to Opus format
   */
  async encodeFrame(pcmData: Float32Array): Promise<Uint8Array> {
    this.ensureInitialized();

    // Validate frame size
    const expectedSize = this.config.frameSize * this.config.channels;
    if (pcmData.length !== expectedSize) {
      throw this.createError(
        AudioErrorCode.INVALID_FRAME_SIZE,
        `Invalid PCM frame size: expected ${expectedSize}, got ${pcmData.length}`,
        false,
      );
    }

    try {
      // Mock Opus encoding
      // In real implementation, use actual Opus encoder
      const encoded = this.mockOpusEncode(pcmData);
      this.stats.framesEncoded++;
      return encoded;
    } catch (err) {
      throw this.createError(AudioErrorCode.OPUS_ENCODE_FAILED, `Failed to encode frame: ${err}`, true);
    }
  }

  /**
   * Encode multiple PCM frames to Opus format
   */
  async encodeFrameBatch(frames: Float32Array[]): Promise<Uint8Array[]> {
    this.ensureInitialized();

    const encoded: Uint8Array[] = [];
    for (const frame of frames) {
      encoded.push(await this.encodeFrame(frame));
    }
    return encoded;
  }

  /**
   * Decode Opus data to PCM format
   */
  async decodeFrame(opusData: Uint8Array): Promise<Float32Array> {
    this.ensureInitialized();

    try {
      // Mock Opus decoding
      // In real implementation, use actual Opus decoder
      const decoded = this.mockOpusDecode(opusData);
      this.stats.framesDecoded++;
      return decoded;
    } catch (err) {
      // Return PLC (Packet Loss Concealment) data on error
      return this.decodeLoss(20);
    }
  }

  /**
   * Decode multiple Opus frames to PCM format
   */
  async decodeFrameBatch(frames: Uint8Array[]): Promise<Float32Array[]> {
    this.ensureInitialized();

    const decoded: Float32Array[] = [];
    for (const frame of frames) {
      decoded.push(await this.decodeFrame(frame));
    }
    return decoded;
  }

  /**
   * Decode frame loss with PLC (Packet Loss Concealment)
   */
  async decodeLoss(frameSizeMs: number): Promise<Float32Array> {
    // Generate synthetic audio for missing frame
    // 20ms @ 48kHz = 960 samples per channel
    const sampleCount = (frameSizeMs * this.config.sampleRate) / 1000;
    const pcmData = new Float32Array(sampleCount * this.config.channels);

    // Fill with comfort noise (very quiet noise) or silence
    for (let i = 0; i < pcmData.length; i++) {
      pcmData[i] = (Math.random() - 0.5) * 0.001; // Very quiet noise
    }

    return pcmData;
  }

  /**
   * Enqueue frame to jitter buffer
   */
  enqueueFrame(frame: AudioFrame): void {
    this.jitterBuffer.enqueue(frame);
  }

  /**
   * Dequeue frame from jitter buffer
   */
  dequeueFrame(): AudioFrame | null {
    return this.jitterBuffer.dequeue();
  }

  /**
   * Get jitter buffer health status
   */
  getBufferHealth(): BufferHealth {
    return this.jitterBuffer.getHealth();
  }

  /**
   * Flush all frames from buffers
   */
  flushBuffer(): void {
    this.jitterBuffer.flush();
    this.circularBuffer.reset();
  }

  /**
   * Play audio frame (enqueue to playback)
   */
  async playFrame(audioBuffer: AudioFrame): Promise<void> {
    this.ensureInitialized();
    this.playbackQueue.push(audioBuffer);
  }

  /**
   * Start audio playback
   */
  async startPlayback(): Promise<void> {
    this.ensureInitialized();
    this.playing = true;
  }

  /**
   * Stop audio playback
   */
  async stopPlayback(): Promise<void> {
    this.playing = false;
  }

  /**
   * Get playback queue
   */
  getPlaybackQueue(): AudioFrame[] {
    return [...this.playbackQueue];
  }

  /**
   * Get current statistics
   */
  getStats(): AudioStreamStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      framesProcessed: 0,
      framesEncoded: 0,
      framesDecoded: 0,
      framesDropped: 0,
      frameLoss: 0,
      jitterMs: 0,
      latencyMs: 0,
      bufferOccupancy: 0,
      captureUnderrun: 0,
      playbackUnderrun: 0,
      cpuUsage: 0,
      codecQuality: 100,
    };
  }

  /**
   * Get estimated latency in milliseconds
   */
  getLatency(): number {
    const health = this.jitterBuffer.getHealth();
    // Estimate latency based on buffer occupancy and jitter
    return this.config.targetBufferLatency + health.jitter;
  }

  /**
   * Get current buffer occupancy (frame count)
   */
  getBufferOccupancy(): number {
    return this.jitterBuffer.getOccupancy();
  }

  /**
   * Register error callback
   */
  onError(callback: ErrorHandler): void {
    this.errorCallbacks.push(callback);
  }

  /**
   * Clear all error callbacks
   */
  clearErrorCallbacks(): void {
    this.errorCallbacks = [];
  }

  /**
   * Get last error that occurred
   */
  getLastError(): AudioStreamError | null {
    return this.lastError;
  }

  /**
   * Private helper: Mock Opus encoding
   */
  private mockOpusEncode(pcmData: Float32Array): Uint8Array {
    // Simple mock: encode size is roughly 1/48 of PCM size (128 kbps @ 48kHz)
    const targetSize = Math.max(20, pcmData.length / 48);
    const encoded = new Uint8Array(Math.ceil(targetSize));

    // Add simple data transformation
    let sum = 0;
    for (let i = 0; i < pcmData.length; i += 4) {
      sum += Math.abs(pcmData[i]);
    }

    // First byte is magic
    encoded[0] = 0xff;

    // Remaining bytes contain simple encoded data
    for (let i = 1; i < encoded.length; i++) {
      encoded[i] = Math.floor((sum / i) * 256) % 256;
    }

    return encoded;
  }

  /**
   * Private helper: Mock Opus decoding
   */
  private mockOpusDecode(opusData: Uint8Array): Float32Array {
    // Always return 960 * 2 samples (20ms @ 48kHz stereo)
    const decoded = new Float32Array(960 * 2);

    if (opusData.length === 0) {
      // Frame loss: fill with silence/noise
      return decoded;
    }

    // Simple mock decoding: use opus bytes as seed for pseudo-random
    let seed = 0;
    for (let i = 0; i < opusData.length; i++) {
      seed = (seed * 31 + opusData[i]) % 0xffffffff;
    }

    // Generate pseudo-random samples from seed
    for (let i = 0; i < decoded.length; i++) {
      seed = (seed * 1103515245 + 12345) % 0x80000000;
      decoded[i] = (seed / 0x80000000) * 0.1 - 0.05; // Small amplitude
    }

    return decoded;
  }

  /**
   * Private helper: Check initialization state
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw this.createError(
        AudioErrorCode.NOT_INITIALIZED,
        'Handler not initialized. Call initialize() first.',
        false,
      );
    }
  }

  /**
   * Private helper: Create and emit error
   */
  private createError(code: AudioErrorCode, message: string, recoverable: boolean): Error {
    const error: AudioStreamError = {
      code,
      message,
      timestamp: Date.now(),
      recoverable,
      retryCount: 0,
    };

    this.lastError = error;

    // Call error callbacks
    for (const callback of this.errorCallbacks) {
      try {
        callback(error);
      } catch (err) {
        console.error('Error in error callback:', err);
      }
    }

    return new Error(message);
  }
}

// Export all types and classes
export {
  AudioStreamConfig,
  AudioFrame,
  OpusFrame,
  JitterBufferFrame,
  AudioStreamStats,
  BufferHealth,
  AudioStreamError,
  AudioErrorCode,
};
