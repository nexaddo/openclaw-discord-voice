/**
 * Phase 6: Voice Command Pipeline - Unified Error Handling
 * Provides error types, user-facing messages, and retry logic for all pipeline phases
 */

/**
 * Error codes for Voice Command Pipeline
 */
export enum PipelineErrorCode {
  // Phase 3: Audio Stream Handler errors
  AUDIO_CAPTURE_FAILED = 3001,
  AUDIO_ENCODING_FAILED = 3002,
  AUDIO_DECODING_FAILED = 3003,
  AUDIO_BUFFER_OVERFLOW = 3004,
  AUDIO_BUFFER_UNDERRUN = 3005,
  AUDIO_JITTER_BUFFER_FULL = 3006,
  AUDIO_DEVICE_ERROR = 3007,
  AUDIO_INITIALIZATION_FAILED = 3008,

  // Phase 4: Speech-to-Text errors
  STT_TRANSCRIPTION_FAILED = 4001,
  STT_API_ERROR = 4002,
  STT_INVALID_AUDIO = 4003,
  STT_TIMEOUT = 4004,
  STT_RATE_LIMITED = 4005,
  STT_LANGUAGE_NOT_SUPPORTED = 4006,
  STT_NO_SPEECH_DETECTED = 4007,
  STT_INITIALIZATION_FAILED = 4008,

  // Phase 5: Text-to-Speech errors
  TTS_SYNTHESIS_FAILED = 5001,
  TTS_API_ERROR = 5002,
  TTS_INVALID_TEXT = 5003,
  TTS_TIMEOUT = 5004,
  TTS_VOICE_NOT_FOUND = 5005,
  TTS_RATE_LIMITED = 5006,
  TTS_AUDIO_ENCODING_FAILED = 5007,
  TTS_INITIALIZATION_FAILED = 5008,

  // Phase 6: Pipeline orchestration errors
  PIPELINE_TIMEOUT = 6001,
  PIPELINE_CONCURRENT_LIMIT = 6002,
  PIPELINE_INVALID_STATE = 6003,
  PIPELINE_CANCELLED = 6004,
  PIPELINE_INITIALIZATION_FAILED = 6005,
  PIPELINE_CONNECTION_LOST = 6006,
  PIPELINE_USER_DISCONNECTED = 6007,
  PIPELINE_FALLBACK_FAILED = 6008,

  // Agent integration errors
  AGENT_REQUEST_FAILED = 7001,
  AGENT_TIMEOUT = 7002,
  AGENT_INVALID_RESPONSE = 7003,
  AGENT_RATE_LIMITED = 7004,

  // General errors
  UNKNOWN_ERROR = 9999,
}

/**
 * Error context for detailed debugging
 */
export interface PipelineErrorContext {
  phase?: 'audio' | 'stt' | 'tts' | 'agent' | 'pipeline';
  userId?: string;
  guildId?: string;
  channelId?: string;
  sessionId?: string;
  audioDuration?: number;
  textLength?: number;
  timestamp?: number;
  retryCount?: number;
  originalError?: Error;
  metadata?: Record<string, any>;
  status?: string;
  requestId?: string;
}

/**
 * Pipeline error with user-facing message and recovery suggestions
 */
export class PipelineError extends Error {
  public readonly code: PipelineErrorCode;

  public readonly context: PipelineErrorContext;

  public readonly recoverable: boolean;

  public readonly userMessage: string;

  public readonly recoverySuggestions: string[];

  public readonly retryDelayMs?: number;

  public readonly timestamp: number;

  constructor(
    code: PipelineErrorCode,
    message: string,
    context: PipelineErrorContext = {},
    recoverable: boolean = true,
    userMessage?: string,
    recoverySuggestions: string[] = [],
  ) {
    super(message);
    this.name = 'PipelineError';
    this.code = code;
    this.context = {
      timestamp: Date.now(),
      ...context,
    };
    this.recoverable = recoverable;
    this.userMessage = userMessage || this.getDefaultUserMessage(code);
    this.recoverySuggestions =
      recoverySuggestions.length > 0 ? recoverySuggestions : this.getDefaultRecoverySuggestions(code);
    this.retryDelayMs = this.calculateRetryDelay(code);
    this.timestamp = this.context.timestamp!;
  }

  /**
   * Get default user-friendly message for error code
   */
  private getDefaultUserMessage(code: PipelineErrorCode): string {
    switch (code) {
      // Audio errors
      case PipelineErrorCode.AUDIO_CAPTURE_FAILED:
        return "I couldn't hear you clearly. Please try speaking again.";
      case PipelineErrorCode.AUDIO_ENCODING_FAILED:
      case PipelineErrorCode.AUDIO_DECODING_FAILED:
        return 'There was an audio processing issue. Please try again.';
      case PipelineErrorCode.AUDIO_BUFFER_OVERFLOW:
      case PipelineErrorCode.AUDIO_BUFFER_UNDERRUN:
        return 'Audio buffer issue detected. Please wait a moment and try again.';
      case PipelineErrorCode.AUDIO_DEVICE_ERROR:
        return 'Audio device error. Please check your connection.';

      // STT errors
      case PipelineErrorCode.STT_TRANSCRIPTION_FAILED:
        return "I couldn't understand what you said. Please try speaking more clearly.";
      case PipelineErrorCode.STT_API_ERROR:
        return 'Speech recognition service is temporarily unavailable. Please try again.';
      case PipelineErrorCode.STT_INVALID_AUDIO:
        return "The audio format wasn't recognized. Please try speaking again.";
      case PipelineErrorCode.STT_TIMEOUT:
        return 'Speech recognition timed out. Please try speaking again.';
      case PipelineErrorCode.STT_RATE_LIMITED:
        return 'Too many requests. Please wait a moment and try again.';
      case PipelineErrorCode.STT_NO_SPEECH_DETECTED:
        return "I didn't detect any speech. Please speak louder or closer to your microphone.";

      // TTS errors
      case PipelineErrorCode.TTS_SYNTHESIS_FAILED:
        return "I couldn't generate a response. Please try again.";
      case PipelineErrorCode.TTS_API_ERROR:
        return 'Voice synthesis service is temporarily unavailable. Please try again.';
      case PipelineErrorCode.TTS_INVALID_TEXT:
        return 'The response text was invalid. This is a system issue.';
      case PipelineErrorCode.TTS_TIMEOUT:
        return 'Voice synthesis timed out. Please try again.';
      case PipelineErrorCode.TTS_VOICE_NOT_FOUND:
        return 'Voice configuration error. This is a system issue.';
      case PipelineErrorCode.TTS_RATE_LIMITED:
        return 'Voice synthesis is rate limited. Please wait and try again.';

      // Pipeline errors
      case PipelineErrorCode.PIPELINE_TIMEOUT:
        return 'The request timed out. Please try again.';
      case PipelineErrorCode.PIPELINE_CONCURRENT_LIMIT:
        return 'Too many people are using voice commands right now. Please wait.';
      case PipelineErrorCode.PIPELINE_INVALID_STATE:
        return 'Voice system is in an invalid state. Please try reconnecting.';
      case PipelineErrorCode.PIPELINE_CANCELLED:
        return 'The request was cancelled. Please try again.';
      case PipelineErrorCode.PIPELINE_CONNECTION_LOST:
        return 'Voice connection was lost. Please reconnect and try again.';
      case PipelineErrorCode.PIPELINE_USER_DISCONNECTED:
        return 'You disconnected from voice. Please rejoin and try again.';

      // Agent errors
      case PipelineErrorCode.AGENT_REQUEST_FAILED:
        return "I couldn't process your request right now. Please try again.";
      case PipelineErrorCode.AGENT_TIMEOUT:
        return 'The AI response timed out. Please try again.';
      case PipelineErrorCode.AGENT_INVALID_RESPONSE:
        return 'The AI gave an invalid response. Please try again.';
      case PipelineErrorCode.AGENT_RATE_LIMITED:
        return 'AI service is busy. Please wait and try again.';

      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }

  /**
   * Get default recovery suggestions for error code
   */
  private getDefaultRecoverySuggestions(code: PipelineErrorCode): string[] {
    switch (code) {
      case PipelineErrorCode.AUDIO_CAPTURE_FAILED:
        return [
          'Check your microphone is working',
          "Make sure you're not muted",
          'Try speaking louder',
          'Move closer to your microphone',
        ];

      case PipelineErrorCode.STT_TRANSCRIPTION_FAILED:
      case PipelineErrorCode.STT_NO_SPEECH_DETECTED:
        return [
          'Speak clearly and at normal volume',
          'Reduce background noise',
          'Use a better microphone if possible',
          "Make sure you're not too far from the mic",
        ];

      case PipelineErrorCode.PIPELINE_TIMEOUT:
        return ['Wait a few seconds and try again', 'Check your internet connection', 'Try a shorter message'];

      case PipelineErrorCode.PIPELINE_CONCURRENT_LIMIT:
        return ['Wait for others to finish their requests', 'Try again in a few moments'];

      case PipelineErrorCode.PIPELINE_CONNECTION_LOST:
        return ['Rejoin the voice channel', 'Check your internet connection', 'Try disconnecting and reconnecting'];

      default:
        return ['Try again', 'If the problem persists, contact support'];
    }
  }

  /**
   * Calculate retry delay based on error code
   */
  private calculateRetryDelay(code: PipelineErrorCode): number | undefined {
    switch (code) {
      case PipelineErrorCode.STT_RATE_LIMITED:
      case PipelineErrorCode.TTS_RATE_LIMITED:
      case PipelineErrorCode.AGENT_RATE_LIMITED:
        return 5000; // 5 seconds

      case PipelineErrorCode.STT_API_ERROR:
      case PipelineErrorCode.TTS_API_ERROR:
        return 2000; // 2 seconds

      case PipelineErrorCode.PIPELINE_TIMEOUT:
        return 1000; // 1 second

      default:
        return undefined; // No retry
    }
  }

  /**
   * Check if error should trigger fallback mode
   */
  public shouldUseFallback(): boolean {
    return [
      PipelineErrorCode.STT_API_ERROR,
      PipelineErrorCode.STT_RATE_LIMITED,
      PipelineErrorCode.STT_TIMEOUT,
      PipelineErrorCode.TTS_API_ERROR,
      PipelineErrorCode.TTS_RATE_LIMITED,
      PipelineErrorCode.TTS_TIMEOUT,
      PipelineErrorCode.AGENT_REQUEST_FAILED,
      PipelineErrorCode.AGENT_TIMEOUT,
    ].includes(this.code);
  }

  /**
   * Check if error is related to a specific phase
   */
  public getPhase(): 'audio' | 'stt' | 'tts' | 'agent' | 'pipeline' {
    if (this.code >= 3000 && this.code < 4000) return 'audio';
    if (this.code >= 4000 && this.code < 5000) return 'stt';
    if (this.code >= 5000 && this.code < 6000) return 'tts';
    if (this.code >= 7000 && this.code < 8000) return 'agent';
    return 'pipeline';
  }

  /**
   * Convert to JSON for logging/serialization
   */
  public toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      recoverySuggestions: this.recoverySuggestions,
      recoverable: this.recoverable,
      retryDelayMs: this.retryDelayMs,
      phase: this.getPhase(),
      context: this.context,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Retry configuration with exponential backoff
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Default retry configurations for different error types
 */
export const DEFAULT_RETRY_CONFIGS: Record<string, RetryConfig> = {
  api: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  },
  network: {
    maxRetries: 5,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    backoffMultiplier: 1.5,
  },
  timeout: {
    maxRetries: 2,
    baseDelayMs: 2000,
    maxDelayMs: 8000,
    backoffMultiplier: 2,
  },
};

/**
 * Retry manager with exponential backoff
 */
export class RetryManager {
  private config: RetryConfig;

  constructor(config: RetryConfig = DEFAULT_RETRY_CONFIGS.api) {
    this.config = config;
  }

  /**
   * Execute function with retry logic
   */
  async executeWithRetry<T>(fn: () => Promise<T>, context: string = 'operation'): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        if (attempt < this.config.maxRetries) {
          const delay = this.calculateDelay(attempt);
          console.warn(`${context}: Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);
          await this.delay(delay);
        }
      }
    }

    throw lastError!;
  }

  /**
   * Calculate delay with exponential backoff
   */
  private calculateDelay(attempt: number): number {
    const delay = this.config.baseDelayMs * this.config.backoffMultiplier ** attempt;
    return Math.min(delay, this.config.maxDelayMs);
  }

  /**
   * Simple delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Error recovery strategies
 */
export enum RecoveryStrategy {
  RETRY = 'retry',
  FALLBACK = 'fallback',
  SKIP = 'skip',
  ABORT = 'abort',
}

/**
 * Error recovery configuration
 */
export interface ErrorRecoveryConfig {
  strategy: RecoveryStrategy;
  retryConfig?: RetryConfig;
  fallbackAction?: () => Promise<void>;
  maxRecoveryAttempts?: number;
}

/**
 * Error recovery handler
 */
export class ErrorRecoveryHandler {
  private config: ErrorRecoveryConfig;

  private attempts: number = 0;

  constructor(config: ErrorRecoveryConfig) {
    this.config = config;
  }

  /**
   * Handle error with configured recovery strategy
   */
  async handleError(error: PipelineError): Promise<boolean> {
    this.attempts++;

    if (this.attempts > (this.config.maxRecoveryAttempts || 3)) {
      return false; // Max attempts exceeded
    }

    switch (this.config.strategy) {
      case RecoveryStrategy.RETRY:
        if (error.recoverable && this.config.retryConfig) {
          const retryManager = new RetryManager(this.config.retryConfig);
          try {
            await retryManager.executeWithRetry(
              this.config.fallbackAction || (() => Promise.resolve()),
              `Recovery attempt ${this.attempts}`,
            );
            return true;
          } catch {
            return false;
          }
        }
        return false;

      case RecoveryStrategy.FALLBACK:
        if (error.shouldUseFallback() && this.config.fallbackAction) {
          try {
            await this.config.fallbackAction();
            return true;
          } catch {
            return false;
          }
        }
        return false;

      case RecoveryStrategy.SKIP:
        return true; // Skip this error

      case RecoveryStrategy.ABORT:
      default:
        return false; // Don't recover
    }
  }

  /**
   * Reset recovery attempts
   */
  reset(): void {
    this.attempts = 0;
  }
}
