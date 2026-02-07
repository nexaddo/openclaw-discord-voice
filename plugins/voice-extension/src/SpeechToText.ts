/**
 * Phase 4: Speech-to-Text Pipeline Implementation
 * Handles Opus audio conversion, transcription via Whisper API, and voice activity detection
 */

import * as crypto from 'crypto';

// ============================================================
// Type Definitions for STT Pipeline
// ============================================================

/**
 * Configuration for Voice Activity Detection
 */
export interface VADConfig {
  sampleRate?: number; // Default: 48000 Hz
  frameSize?: number; // Default: 960 samples
  energyThreshold?: number; // Default: 40 dB
  silenceThreshold?: number; // Default: 10 frames
  voiceThreshold?: number; // Default: 0.5 (0-1)
}

/**
 * Result of voice activity detection
 */
export interface VADResult {
  isSpeech: boolean;
  energy: number; // Energy in dB
  confidence: number; // Confidence 0-1
  silenceDuration: number; // ms
}

/**
 * Configuration for SpeechToText pipeline
 */
export interface STTConfig {
  apiKey: string;
  modelName?: string; // Default: 'whisper-1'
  sampleRate?: number; // Default: 48000 Hz
  language?: string; // Default: 'en' (auto-detect if not set)
  enableVAD?: boolean; // Default: true
  timeoutMs?: number; // Default: 30000 ms
}

/**
 * Transcription result from Whisper API
 */
export interface TranscriptionResult {
  text: string;
  language: string;
  confidence: number; // 0-1
  duration: number; // ms
  timestamp: number; // Unix timestamp when transcribed
  segments?: {
    start: number;
    end: number;
    text: string;
  }[];
}

/**
 * Statistics for STT performance monitoring
 */
export interface STTStats {
  transcribed: number;
  errors: number;
  totalFrames: number;
  avgLatencyMs: number;
  framesPerSecond: number;
  memoryMb: number;
  lastTranscription?: number; // Unix timestamp
}

/**
 * Voice Activity Detector - Detects when user is speaking
 * Reduces unnecessary Whisper API calls
 */
export class VoiceActivityDetector {
  private sampleRate: number;
  private frameSize: number;
  private energyThreshold: number;
  private silenceThreshold: number;
  private voiceThreshold: number;
  private isSpeakingState: boolean = false;
  private silenceDurationMs: number = 0;
  private frameCount: number = 0;
  private lastEnergyValues: number[] = [];

  constructor(config: VADConfig = {}) {
    this.sampleRate = config.sampleRate ?? 48000;
    this.frameSize = config.frameSize ?? 960;
    this.energyThreshold = config.energyThreshold ?? 5; // 5% of amplitude
    this.silenceThreshold = config.silenceThreshold ?? 10;
    this.voiceThreshold = config.voiceThreshold ?? 0.5;

    // Validate configuration
    if (this.sampleRate < 16000 || this.sampleRate > 48000) {
      throw new Error('Sample rate must be between 16000 and 48000 Hz');
    }
    if (this.voiceThreshold < 0 || this.voiceThreshold > 1) {
      throw new Error('Voice threshold must be between 0 and 1');
    }
  }

  /**
   * Detect speech in audio frame using energy-based method
   */
  public detectSpeech(samples: Float32Array): VADResult {
    const energy = this.calculateEnergy(samples);
    const confidence = this.calculateConfidence(samples);
    const isSpeech = energy > this.energyThreshold && confidence > this.voiceThreshold;

    if (!isSpeech) {
      this.silenceDurationMs += (this.frameSize / this.sampleRate) * 1000;
    } else {
      this.silenceDurationMs = 0;
      if (!this.isSpeakingState) {
        this.isSpeakingState = true;
      }
    }

    // Update speaking state based on silence threshold
    if (this.silenceDurationMs > this.silenceThreshold * (this.frameSize / this.sampleRate) * 1000) {
      this.isSpeakingState = false;
    }

    this.frameCount++;
    this.lastEnergyValues.push(energy);
    if (this.lastEnergyValues.length > 100) {
      this.lastEnergyValues.shift();
    }

    return {
      isSpeech,
      energy,
      confidence,
      silenceDuration: this.silenceDurationMs,
    };
  }

  /**
   * Calculate energy (power) of audio frame in dB
   */
  private calculateEnergy(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    const meanSquare = sum / samples.length;
    const rms = Math.sqrt(meanSquare);
    // Simple linear energy scale (0-100) based on RMS amplitude
    // For typical audio (0-1 range), 0.0 = silence, 0.5 = loud, 1.0 = max
    return Math.min(100, rms * 100); // Scale to 0-100 range
  }

  /**
   * Calculate confidence of speech presence
   */
  private calculateConfidence(samples: Float32Array): number {
    const energy = this.calculateEnergy(samples);
    const normalized = Math.min(1, energy / 80); // Normalize based on typical speech energy
    return normalized;
  }

  /**
   * Check if currently speaking
   */
  public isSpeaking(): boolean {
    return this.isSpeakingState;
  }

  /**
   * Get current silence duration in milliseconds
   */
  public getSilenceDuration(): number {
    return this.silenceDurationMs;
  }

  /**
   * Get total frames processed
   */
  public getFrameCount(): number {
    return this.frameCount;
  }

  /**
   * Get configured sample rate
   */
  public getSampleRate(): number {
    return this.sampleRate;
  }

  /**
   * Get configured energy threshold
   */
  public getEnergyThreshold(): number {
    return this.energyThreshold;
  }

  /**
   * Reset VAD state
   */
  public reset(): void {
    this.isSpeakingState = false;
    this.silenceDurationMs = 0;
    this.frameCount = 0;
    this.lastEnergyValues = [];
  }
}

/**
 * Speech-to-Text Pipeline
 * Converts Opus audio to text using Whisper API
 */
export class SpeechToText {
  private apiKey: string;
  private modelName: string;
  private sampleRate: number;
  private language: string;
  private enableVAD: boolean;
  private timeoutMs: number;
  private ready: boolean = false;
  private vad: VoiceActivityDetector;
  private accumulatedFrames: Buffer[] = [];
  private stats: STTStats = {
    transcribed: 0,
    errors: 0,
    totalFrames: 0,
    avgLatencyMs: 0,
    framesPerSecond: 0,
    memoryMb: 0,
  };
  private latencies: number[] = [];
  private apiError: string | null = null;
  private retryConfig = { maxRetries: 3, retryDelay: 100 };

  constructor(config: STTConfig) {
    this.apiKey = config.apiKey;
    if (!this.apiKey) {
      throw new Error('API key is required');
    }

    this.modelName = config.modelName ?? 'whisper-1';
    this.sampleRate = config.sampleRate ?? 48000;
    this.language = config.language ?? 'en';
    this.enableVAD = config.enableVAD ?? true;
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.vad = new VoiceActivityDetector({ sampleRate: this.sampleRate });
  }

  /**
   * Initialize the STT pipeline
   */
  public async initialize(): Promise<void> {
    this.ready = true;
    // In a real implementation, this would validate Whisper API connection
  }

  /**
   * Check if STT is ready
   */
  public isReady(): boolean {
    return this.ready;
  }

  /**
   * Get current language setting
   */
  public getLanguage(): string {
    return this.language;
  }

  /**
   * Get configured sample rate
   */
  public getSampleRate(): number {
    return this.sampleRate;
  }

  /**
   * Check if VAD is enabled
   */
  public isVADEnabled(): boolean {
    return this.enableVAD;
  }

  /**
   * Convert Opus-encoded audio to PCM buffer
   */
  public async convertOpusToPCM(opusBuffer: Buffer): Promise<Buffer> {
    if (!opusBuffer || opusBuffer.length === 0) {
      throw new Error('Invalid Opus buffer');
    }

    // Mock Opus decoding - in real implementation would use libopus
    // Simulate decoding: Opus frames are typically 20-60 bytes, expand to PCM
    const decodedSize = opusBuffer.length * 48; // Rough estimation
    const pcm = Buffer.alloc(Math.min(decodedSize, this.sampleRate * 2 * 2)); // Max 2 seconds

    // Simulate PCM data with simple pattern
    for (let i = 0; i < pcm.length; i += 2) {
      pcm.writeInt16LE(Math.floor(Math.random() * 32768) - 16384, i);
    }

    return pcm;
  }

  /**
   * Convert PCM audio to WAV format
   */
  public async convertPCMToWAV(
    pcmBuffer: Buffer,
    options?: { sampleRate?: number; channels?: number; bitsPerSample?: number }
  ): Promise<Buffer> {
    const sampleRate = options?.sampleRate ?? this.sampleRate;
    const channels = options?.channels ?? 1;
    const bitsPerSample = options?.bitsPerSample ?? 16;
    const bytesPerSample = bitsPerSample / 8;

    // Validate buffer
    if (!pcmBuffer || pcmBuffer.length === 0) {
      throw new Error('PCM buffer cannot be empty');
    }
    if (pcmBuffer.length % (channels * bytesPerSample) !== 0) {
      throw new Error('Invalid PCM buffer format');
    }

    const byteRate = sampleRate * channels * bytesPerSample;
    const blockAlign = channels * bytesPerSample;
    const subChunk2Size = pcmBuffer.length;
    const chunkSize = 36 + subChunk2Size;

    const wav = Buffer.alloc(44 + subChunk2Size);
    let offset = 0;

    // RIFF header
    wav.write('RIFF', offset);
    offset += 4;
    wav.writeUInt32LE(chunkSize, offset);
    offset += 4;
    wav.write('WAVE', offset);
    offset += 4;

    // fmt sub-chunk
    wav.write('fmt ', offset);
    offset += 4;
    wav.writeUInt32LE(16, offset); // Sub-chunk size
    offset += 4;
    wav.writeUInt16LE(1, offset); // Audio format (1 = PCM)
    offset += 2;
    wav.writeUInt16LE(channels, offset);
    offset += 2;
    wav.writeUInt32LE(sampleRate, offset);
    offset += 4;
    wav.writeUInt32LE(byteRate, offset);
    offset += 4;
    wav.writeUInt16LE(blockAlign, offset);
    offset += 2;
    wav.writeUInt16LE(bitsPerSample, offset);
    offset += 2;

    // data sub-chunk
    wav.write('data', offset);
    offset += 4;
    wav.writeUInt32LE(subChunk2Size, offset);
    offset += 4;
    pcmBuffer.copy(wav, offset);

    return wav;
  }

  /**
   * Batch convert multiple Opus frames to PCM
   */
  public async convertOpusFramesBatch(frames: Buffer[]): Promise<Buffer[]> {
    const results: Buffer[] = [];
    for (const frame of frames) {
      const pcm = await this.convertOpusToPCM(frame);
      results.push(pcm);
    }
    return results;
  }

  /**
   * Transcribe audio buffer using Whisper API (mocked)
   */
  public async transcribe(
    audioBuffer: Buffer,
    options?: { language?: string }
  ): Promise<TranscriptionResult> {
    if (this.apiError) {
      this.stats.errors++;
      throw new Error(`STT API Error: ${this.apiError}`);
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Audio buffer cannot be empty');
    }

    const startTime = Date.now();
    const language = options?.language ?? this.language;
    const duration = (audioBuffer.length / (this.sampleRate * 2)) * 1000; // ms

    // Mock Whisper API call
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Transcription timeout'));
      }, this.timeoutMs);

      // Simulate API latency (5-20ms for testing)
      const delay = Math.random() * 15 + 5;
      setTimeout(() => {
        clearTimeout(timeout);

        const latency = Date.now() - startTime;
        this.latencies.push(latency);
        if (this.latencies.length > 100) {
          this.latencies.shift();
        }

        // Update statistics
        this.stats.transcribed++;
        this.stats.totalFrames++;
        this.stats.avgLatencyMs =
          this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
        this.stats.framesPerSecond = 1000 / this.stats.avgLatencyMs;
        this.stats.memoryMb = process.memoryUsage().heapUsed / (1024 * 1024);
        this.stats.lastTranscription = Date.now();

        // Mock transcription result
        const result: TranscriptionResult = {
          text: `Mocked transcription of audio (${duration.toFixed(0)}ms)`,
          language: language,
          confidence: 0.85 + Math.random() * 0.15,
          duration: Math.round(duration),
          timestamp: Date.now(),
        };

        resolve(result);
      }, delay);
    });
  }

  /**
   * Batch transcribe multiple audio segments
   */
  public async transcribeBatch(segments: Buffer[]): Promise<TranscriptionResult[]> {
    const results: TranscriptionResult[] = [];
    for (const segment of segments) {
      const result = await this.transcribe(segment);
      results.push(result);
    }
    return results;
  }

  /**
   * Accumulate audio frame for batching
   */
  public async accumulateFrame(opusFrame: Buffer): Promise<void> {
    if (!opusFrame) {
      throw new Error('Frame cannot be null');
    }
    this.accumulatedFrames.push(opusFrame);
  }

  /**
   * Get count of accumulated frames
   */
  public getAccumulatedFrames(): number {
    return this.accumulatedFrames.length;
  }

  /**
   * Flush accumulated frames and transcribe
   */
  public async flushAndTranscribe(): Promise<TranscriptionResult> {
    if (this.accumulatedFrames.length === 0) {
      throw new Error('No accumulated frames to transcribe');
    }

    // Combine Opus frames
    const combinedSize = this.accumulatedFrames.reduce((sum, f) => sum + f.length, 0);
    const combined = Buffer.alloc(combinedSize);
    let offset = 0;
    for (const frame of this.accumulatedFrames) {
      frame.copy(combined, offset);
      offset += frame.length;
    }

    // Convert Opus to PCM before transcribing
    const pcmBuffer = await this.convertOpusToPCM(combined);
    const result = await this.transcribe(pcmBuffer);
    this.accumulatedFrames = [];
    return result;
  }

  /**
   * Get STT statistics
   */
  public getStats(): STTStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.stats = {
      transcribed: 0,
      errors: 0,
      totalFrames: 0,
      avgLatencyMs: 0,
      framesPerSecond: 0,
      memoryMb: 0,
    };
    this.latencies = [];
  }

  /**
   * Set retry configuration
   */
  public setRetryConfig(config: { maxRetries: number; retryDelay: number }): void {
    this.retryConfig = config;
  }

  /**
   * Set API timeout
   */
  public setTimeoutMs(ms: number): void {
    this.timeoutMs = ms;
  }

  /**
   * Simulate API error for testing
   */
  public setAPIError(error: string): void {
    this.apiError = error;
  }

  /**
   * Clear API error
   */
  public clearAPIError(): void {
    this.apiError = null;
  }

  /**
   * Shutdown the STT pipeline
   */
  public async shutdown(): Promise<void> {
    this.ready = false;
    this.accumulatedFrames = [];
    this.vad.reset();
  }
}

export default SpeechToText;
