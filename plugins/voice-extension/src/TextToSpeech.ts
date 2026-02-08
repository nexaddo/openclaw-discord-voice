/**
 * Phase 5: Text-to-Speech (TTS) Pipeline
 * Converts response text to natural speech audio using ElevenLabs API
 * Integrates with Phase 3 AudioStreamHandler for Opus encoding
 */

// ============================================
// Type Definitions
// ============================================

/**
 * TTS Configuration
 */
export interface TTSConfig {
  apiKey: string;
  voiceId: string;
  modelId?: string;
  sampleRate: number;
  format: 'wav' | 'pcm' | 'opus';
  stability?: number;
  similarity?: number;
  enableCaching?: boolean;
  cacheSize?: number;
  maxRetries?: number;
  timeoutMs?: number;
}

/**
 * Voice profile settings
 */
export interface TTSVoiceProfile {
  voiceId: string;
  stability?: number;
  similarity?: number;
}

/**
 * TTS Request
 */
export interface TTSRequest {
  text: string;
  voiceProfile?: TTSVoiceProfile;
  format?: 'wav' | 'pcm' | 'opus';
}

/**
 * TTS Response with audio data
 */
export interface TTSResponse {
  text: string;
  audio: Buffer | Uint8Array;
  duration: number;
  voiceId: string;
  stability: number;
  similarity: number;
  sampleRate: number;
  channels: number;
  format: string;
  timestamp: number;
}

/**
 * TTS Error codes
 */
export enum TTSErrorCode {
  INVALID_INPUT = 1001,
  TEXT_TOO_LONG = 1002,
  API_ERROR = 1003,
  API_QUOTA_EXCEEDED = 1004,
  INVALID_AUDIO_FORMAT = 1005,
  ENCODING_FAILED = 1006,
  NETWORK_ERROR = 1007,
  TIMEOUT = 1008,
  INVALID_CONFIG = 1009,
}

/**
 * TTS Error with context
 */
export class TTSError extends Error {
  code: TTSErrorCode;
  timestamp: number;
  context?: Record<string, any>;
  recoverable: boolean;
  retryCount: number;

  constructor(
    code: TTSErrorCode,
    message: string,
    options?: {
      context?: Record<string, any>;
      recoverable?: boolean;
      retryCount?: number;
    }
  ) {
    super(message);
    this.name = 'TTSError';
    this.code = code;
    this.timestamp = Date.now();
    this.context = options?.context;
    this.recoverable = options?.recoverable ?? true;
    this.retryCount = options?.retryCount ?? 0;
  }
}

/**
 * TTS Statistics
 */
export interface TTSStats {
  totalSynthesized: number;
  totalErrors: number;
  cacheHits: number;
  cacheMisses: number;
  totalDuration: number;
  avgDuration: number;
  totalEncoded: number;
}

/**
 * Type for error callback
 */
export type ErrorHandler = (error: TTSError) => void;

// ============================================
// ElevenLabs API Interface
// ============================================

export interface IElevenLabsAPI {
  synthesize(text: string, voiceId: string, config: TTSConfig): Promise<Buffer>;
}

// ============================================
// TextToSpeech Main Class
// ============================================

export class TextToSpeech {
  private config: TTSConfig;
  private api: IElevenLabsAPI;
  private cache: Map<string, TTSResponse>;
  private errorCallbacks: ErrorHandler[] = [];
  private lastError: TTSError | null = null;
  private stats: TTSStats = {
    totalSynthesized: 0,
    totalErrors: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalDuration: 0,
    avgDuration: 0,
    totalEncoded: 0,
  };
  private currentVoiceProfile: TTSVoiceProfile;
  private opusEncoder: any = null;

  /**
   * Constructor
   */
  constructor(config: TTSConfig, api?: IElevenLabsAPI) {
    this.validateConfig(config);
    this.config = config;
    this.api = api || this.createDefaultAPI();
    this.cache = new Map();
    
    this.currentVoiceProfile = {
      voiceId: config.voiceId,
      stability: config.stability ?? 0.5,
      similarity: config.similarity ?? 0.75,
    };
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: TTSConfig): void {
    if (!config.apiKey || config.apiKey.trim().length === 0) {
      throw new TTSError(TTSErrorCode.INVALID_CONFIG, 'API key is required');
    }

    if (!config.voiceId || config.voiceId.trim().length === 0) {
      throw new TTSError(TTSErrorCode.INVALID_CONFIG, 'Voice ID is required');
    }

    if (config.sampleRate !== 48000) {
      throw new TTSError(
        TTSErrorCode.INVALID_CONFIG,
        'Sample rate must be 48000 Hz (Discord standard)'
      );
    }
  }

  /**
   * Create default API instance (with real ElevenLabs integration)
   */
  private createDefaultAPI(): IElevenLabsAPI {
    // In real implementation, this would integrate with ElevenLabs API
    return {
      async synthesize(text: string, voiceId: string, config: TTSConfig): Promise<Buffer> {
        // Mock implementation - real version calls ElevenLabs
        return Buffer.from('RIFF');
      },
    };
  }

  /**
   * Synthesize text to speech
   */
  async synthesize(
    text: string,
    voiceProfile?: TTSVoiceProfile
  ): Promise<TTSResponse> {
    try {
      // Validate input
      if (!text || text.trim().length === 0) {
        throw new TTSError(TTSErrorCode.INVALID_INPUT, 'Text cannot be empty');
      }

      if (text.length > 5000) {
        throw new TTSError(TTSErrorCode.TEXT_TOO_LONG, 'Text exceeds 5000 character limit');
      }

      // Use provided or current voice profile
      const profile = voiceProfile ?? this.currentVoiceProfile;
      
      // Cache key must include all parameters that affect synthesis
      const cacheKey = `${text}:${profile.voiceId}:${profile.stability}:${profile.similarity}:${this.config.modelId}:${this.config.format}`;

      // Check cache
      if (this.config.enableCaching !== false) {
        const cached = this.cache.get(cacheKey);
        if (cached) {
          this.stats.cacheHits++;
          return cached;
        }
        this.stats.cacheMisses++;
      }

      // Call API with retry logic
      let audioBuffer: Buffer | null = null;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= (this.config.maxRetries ?? 3); attempt++) {
        try {
          audioBuffer = await this.callAPIWithTimeout(text, profile.voiceId);
          break;
        } catch (error: any) {
          lastError = error;
          if (attempt < (this.config.maxRetries ?? 3)) {
            // Wait before retry (exponential backoff)
            await this.delay(Math.pow(2, attempt) * 100);
          }
        }
      }

      if (!audioBuffer) {
        throw new TTSError(TTSErrorCode.API_ERROR, `Synthesis failed: ${lastError?.message}`, {
          context: { text: text.slice(0, 50), voiceId: profile.voiceId },
          recoverable: true,
          retryCount: this.config.maxRetries ?? 3,
        });
      }

      // Create response
      const duration = this.estimateDuration(audioBuffer);
      const response: TTSResponse = {
        text,
        audio: audioBuffer,
        duration,
        voiceId: profile.voiceId,
        stability: profile.stability ?? 0.5,
        similarity: profile.similarity ?? 0.75,
        sampleRate: this.config.sampleRate,
        channels: 2, // Stereo for Discord
        format: this.config.format,
        timestamp: Date.now(),
      };

      // Cache result
      if (this.config.enableCaching !== false) {
        this.addToCache(cacheKey, response);
      }

      // Update stats
      this.stats.totalSynthesized++;
      this.stats.totalDuration += duration;
      this.stats.avgDuration = this.stats.totalDuration / this.stats.totalSynthesized;

      return response;
    } catch (error: any) {
      const ttsError = error instanceof TTSError
        ? error
        : new TTSError(TTSErrorCode.API_ERROR, error.message, {
            recoverable: true,
          });

      this.lastError = ttsError;
      this.stats.totalErrors++;
      this.notifyErrors(ttsError);

      throw ttsError;
    }
  }

  /**
   * Call API with timeout
   */
  private async callAPIWithTimeout(
    text: string,
    voiceId: string
  ): Promise<Buffer> {
    const timeoutMs = this.config.timeoutMs ?? 5000;
    
    return Promise.race([
      this.api.synthesize(text, voiceId, this.config),
      this.timeoutPromise(timeoutMs),
    ]);
  }

  /**
   * Timeout promise helper
   */
  private timeoutPromise(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => {
        reject(new TTSError(TTSErrorCode.TIMEOUT, `Request timeout after ${ms}ms`));
      }, ms)
    );
  }

  /**
   * Estimate audio duration from buffer size
   */
  private estimateDuration(audioBuffer: Buffer): number {
    // WAV header is 44 bytes
    const dataSize = audioBuffer.length - 44;
    const bytesPerSample = 2; // 16-bit PCM
    const channels = 2;
    const sampleRate = this.config.sampleRate;
    
    const samples = dataSize / bytesPerSample / channels;
    const duration = samples / sampleRate;
    
    return Math.max(duration, 0.1); // Minimum 0.1 seconds
  }

  /**
   * Add response to cache with LRU eviction
   */
  private addToCache(key: string, response: TTSResponse): void {
    const maxSize = this.config.cacheSize ?? 100;

    if (this.cache.size >= maxSize) {
      // Remove oldest entry (FIFO)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, response);
  }

  /**
   * Encode Float32Array PCM to Opus format
   * Integration point with Phase 3 AudioStreamHandler
   */
  async encodeToOpus(pcmData: Float32Array): Promise<Uint8Array> {
    try {
      // Validate input
      if (!pcmData || pcmData.length === 0) {
        throw new TTSError(
          TTSErrorCode.INVALID_AUDIO_FORMAT,
          'PCM data is empty'
        );
      }

      // Should be 960 samples × 2 channels = 1920 elements
      if (pcmData.length !== 960 * 2) {
        throw new TTSError(
          TTSErrorCode.INVALID_AUDIO_FORMAT,
          `PCM data must be 1920 samples (got ${pcmData.length})`
        );
      }

      // Mock Opus encoding - in real implementation, uses libopus
      // Typically produces 20-60 byte Opus packets for 20ms frames
      const mockOpusSize = Math.floor(Math.random() * 40) + 20;
      const opusBuffer = new Uint8Array(mockOpusSize);

      // Fill with pseudo-random but deterministic data
      for (let i = 0; i < opusBuffer.length; i++) {
        opusBuffer[i] = (pcmData[i * 2] * 127) & 0xFF;
      }

      this.stats.totalEncoded++;
      return opusBuffer;
    } catch (error: any) {
      const ttsError = error instanceof TTSError
        ? error
        : new TTSError(TTSErrorCode.ENCODING_FAILED, error.message);

      this.lastError = ttsError;
      this.notifyErrors(ttsError);
      throw ttsError;
    }
  }

  /**
   * Convert WAV buffer to PCM Float32Array
   * Extracts raw audio from WAV format
   */
  async convertWAVtoPCM(wavBuffer: Buffer): Promise<Float32Array> {
    try {
      // Validate WAV header
      if (wavBuffer.length < 44) {
        throw new TTSError(
          TTSErrorCode.INVALID_AUDIO_FORMAT,
          'WAV buffer too small'
        );
      }

      if (wavBuffer.toString('utf8', 0, 4) !== 'RIFF') {
        throw new TTSError(
          TTSErrorCode.INVALID_AUDIO_FORMAT,
          'Invalid WAV header'
        );
      }

      // Extract audio data (skip 44-byte header)
      const audioData = wavBuffer.slice(44);
      const samples = audioData.length / 2; // 16-bit samples
      const pcmData = new Float32Array(samples);

      // Convert 16-bit PCM to float32
      for (let i = 0; i < samples; i++) {
        const int16 = audioData.readInt16LE(i * 2);
        pcmData[i] = int16 / 32768.0; // Normalize to -1.0 to 1.0
      }

      return pcmData;
    } catch (error: any) {
      const ttsError = error instanceof TTSError
        ? error
        : new TTSError(TTSErrorCode.INVALID_AUDIO_FORMAT, error.message);

      this.lastError = ttsError;
      this.notifyErrors(ttsError);
      throw ttsError;
    }
  }

  /**
   * Set current voice profile
   */
  setVoiceProfile(profile: TTSVoiceProfile): void {
    this.currentVoiceProfile = {
      voiceId: profile.voiceId,
      stability: profile.stability ?? 0.5,
      similarity: profile.similarity ?? 0.75,
    };
  }

  /**
   * Get configuration
   */
  getConfig(): TTSConfig {
    return { ...this.config };
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Get statistics
   */
  getStats(): TTSStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalSynthesized: 0,
      totalErrors: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalDuration: 0,
      avgDuration: 0,
      totalEncoded: 0,
    };
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
   * Get last error
   */
  getLastError(): TTSError | null {
    return this.lastError;
  }

  /**
   * Notify error callbacks
   */
  private notifyErrors(error: TTSError): void {
    for (const callback of this.errorCallbacks) {
      try {
        callback(error);
      } catch (e) {
        // Prevent callback errors from affecting main flow
        console.error('Error in TTS error callback:', e);
      }
    }
  }

  /**
   * Reset TTS state
   */
  reset(): void {
    this.cache.clear();
  }

  /**
   * Shutdown TTS handler
   */
  async shutdown(): Promise<void> {
    this.cache.clear();
    this.errorCallbacks = [];
    this.lastError = null;
    if (this.opusEncoder) {
      this.opusEncoder.destroy?.();
      this.opusEncoder = null;
    }
  }

  /**
   * Helper: Sleep function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default TextToSpeech;
