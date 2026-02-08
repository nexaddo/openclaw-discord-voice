/**
 * Phase 6: Voice Command Pipeline
 * Orchestrates end-to-end voice conversation loop:
 * Audio Capture → STT → Agent → TTS → Audio Playback
 */

import { AudioStreamHandler, AudioStreamConfig, AudioFrame } from './AudioStreamHandler.js';
import { SpeechToText, STTConfig, TranscriptionResult } from './SpeechToText.js';
import { TextToSpeech, TTSConfig, TTSResponse } from './TextToSpeech.js';
import {
  PipelineError,
  PipelineErrorCode,
  PipelineErrorContext,
  RetryManager,
  ErrorRecoveryHandler,
  RecoveryStrategy,
  ErrorRecoveryConfig,
} from './PipelineErrors.js';

// ============================================
// Types and Interfaces
// ============================================

/**
 * Pipeline configuration
 */
export interface VoiceCommandPipelineConfig {
  // Component configurations
  audioConfig: AudioStreamConfig;
  sttConfig: STTConfig;
  ttsConfig: TTSConfig;

  // Pipeline settings
  maxConcurrentConnections: number;    // Default: 10
  sessionTimeoutMs: number;            // Default: 300000 (5 min)
  enableFallbackResponses: boolean;    // Default: true
  enableMetrics: boolean;              // Default: true

  // Agent integration
  agentEndpoint?: string;              // Optional agent API endpoint
  agentTimeoutMs?: number;              // Default: 30000
  agentApiKey?: string;                 // Optional agent API key

  // Error recovery
  enableErrorRecovery: boolean;         // Default: true
  maxRecoveryAttempts: number;          // Default: 3
}

/**
 * Voice session state
 */
export interface VoiceSession {
  sessionId: string;
  userId: string;
  guildId: string;
  channelId: string;
  startTime: number;
  lastActivity: number;
  status: 'active' | 'processing' | 'idle' | 'error' | 'ended';
  audioHandler?: AudioStreamHandler;
  currentRequest?: VoiceRequest;
  metrics: SessionMetrics;
}

/**
 * Voice request context
 */
export interface VoiceRequest {
  requestId: string;
  sessionId: string;
  userId: string;
  audioFrames: AudioFrame[];
  transcription?: TranscriptionResult;
  agentResponse?: string;
  ttsResponse?: TTSResponse;
  startTime: number;
  status: 'receiving' | 'transcribing' | 'processing' | 'synthesizing' | 'playing' | 'completed' | 'error';
  error?: PipelineError;
}

/**
 * Session performance metrics
 */
export interface SessionMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgTranscriptionLatency: number;
  avgAgentLatency: number;
  avgTtsLatency: number;
  avgTotalLatency: number;
  audioFramesProcessed: number;
  bytesProcessed: number;
}

/**
 * Pipeline performance metrics
 */
export interface PipelineMetrics {
  activeSessions: number;
  totalSessions: number;
  concurrentLimitHits: number;
  averageSessionDuration: number;
  errorRate: number;
  recoverySuccessRate: number;
  memoryUsage: number;
  cpuUsage: number;
}

/**
 * Agent response interface
 */
export interface AgentResponse {
  text: string;
  confidence?: number;
  metadata?: Record<string, any>;
}

/**
 * Pipeline events
 */
export interface PipelineEvents {
  sessionStarted(session: VoiceSession): void;
  sessionEnded(session: VoiceSession): void;
  requestStarted(request: VoiceRequest): void;
  requestCompleted(request: VoiceRequest): void;
  requestError(request: VoiceRequest, error: PipelineError): void;
  metricsUpdated(metrics: PipelineMetrics): void;
}

// ============================================
// VoiceCommandPipeline Main Class
// ============================================

export class VoiceCommandPipeline {
  private config: VoiceCommandPipelineConfig;
  private sessions: Map<string, VoiceSession> = new Map();
  private activeRequests: Map<string, VoiceRequest> = new Map();
  private eventListeners: Map<keyof PipelineEvents, Function[]> = new Map();
  private metrics: PipelineMetrics = {
    activeSessions: 0,
    totalSessions: 0,
    concurrentLimitHits: 0,
    averageSessionDuration: 0,
    errorRate: 0,
    recoverySuccessRate: 0,
    memoryUsage: 0,
    cpuUsage: 0,
  };
  private errorRecoveryHandler: ErrorRecoveryHandler;
  private isInitialized: boolean = false;

  // Component instances
  private sttInstance?: SpeechToText;
  private ttsInstance?: TextToSpeech;

  constructor(config: VoiceCommandPipelineConfig) {
    this.config = {
      ...config,
      maxConcurrentConnections: config.maxConcurrentConnections ?? 10,
      sessionTimeoutMs: config.sessionTimeoutMs ?? 300000,
      enableFallbackResponses: config.enableFallbackResponses ?? true,
      enableMetrics: config.enableMetrics ?? true,
      agentTimeoutMs: config.agentTimeoutMs ?? 30000,
      enableErrorRecovery: config.enableErrorRecovery ?? true,
      maxRecoveryAttempts: config.maxRecoveryAttempts ?? 3,
    };

    this.errorRecoveryHandler = new ErrorRecoveryHandler({
      strategy: RecoveryStrategy.FALLBACK,
      maxRecoveryAttempts: this.config.maxRecoveryAttempts,
    });
  }

  /**
   * Initialize the pipeline
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new PipelineError(
        PipelineErrorCode.PIPELINE_INVALID_STATE,
        'Pipeline already initialized'
      );
    }

    try {
      // Initialize STT
      this.sttInstance = new SpeechToText(this.config.sttConfig);
      await this.sttInstance.initialize();

      // Initialize TTS
      this.ttsInstance = new TextToSpeech(this.config.ttsConfig);

      this.isInitialized = true;
    } catch (error: any) {
      throw new PipelineError(
        PipelineErrorCode.PIPELINE_INITIALIZATION_FAILED,
        `Failed to initialize pipeline: ${error.message}`,
        { originalError: error }
      );
    }
  }

  /**
   * Shutdown the pipeline
   */
  async shutdown(): Promise<void> {
    // End all active sessions
    for (const session of this.sessions.values()) {
      await this.endSession(session.sessionId, 'shutdown');
    }

    // Cleanup components
    if (this.sttInstance) {
      await this.sttInstance.shutdown();
    }

    this.isInitialized = false;
  }

  /**
   * Start a new voice session
   */
  async startSession(
    userId: string,
    guildId: string,
    channelId: string,
    audioHandler?: AudioStreamHandler
  ): Promise<string> {
    this.ensureInitialized();

    // Check concurrent connection limit
    if (this.sessions.size >= this.config.maxConcurrentConnections) {
      this.metrics.concurrentLimitHits++;
      throw new PipelineError(
        PipelineErrorCode.PIPELINE_CONCURRENT_LIMIT,
        `Maximum concurrent connections (${this.config.maxConcurrentConnections}) exceeded`,
        { userId, guildId, channelId }
      );
    }

    const sessionId = this.generateSessionId();
    const session: VoiceSession = {
      sessionId,
      userId,
      guildId,
      channelId,
      startTime: Date.now(),
      lastActivity: Date.now(),
      status: 'active',
      audioHandler,
      metrics: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        avgTranscriptionLatency: 0,
        avgAgentLatency: 0,
        avgTtsLatency: 0,
        avgTotalLatency: 0,
        audioFramesProcessed: 0,
        bytesProcessed: 0,
      },
    };

    this.sessions.set(sessionId, session);
    this.metrics.activeSessions++;
    this.metrics.totalSessions++;

    this.emit('sessionStarted', session);
    return sessionId;
  }

  /**
   * End a voice session
   */
  async endSession(sessionId: string, reason: string = 'user'): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'ended';

    // Cancel any active requests for this session
    for (const [requestId, request] of this.activeRequests) {
      if (request.sessionId === sessionId) {
        await this.cancelRequest(requestId, reason);
      }
    }

    // Cleanup audio handler
    if (session.audioHandler) {
      await session.audioHandler.shutdown();
    }

    this.sessions.delete(sessionId);
    this.metrics.activeSessions--;

    this.emit('sessionEnded', session);
  }

  /**
   * Process voice command from audio frames
   */
  async processVoiceCommand(
    sessionId: string,
    audioFrames: AudioFrame[]
  ): Promise<string> {
    this.ensureInitialized();

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new PipelineError(
        PipelineErrorCode.PIPELINE_INVALID_STATE,
        `Session ${sessionId} not found`,
        { sessionId }
      );
    }

    if (session.status !== 'active') {
      throw new PipelineError(
        PipelineErrorCode.PIPELINE_INVALID_STATE,
        `Session ${sessionId} is not active (status: ${session.status})`,
        { sessionId, status: session.status }
      );
    }

    session.lastActivity = Date.now();
    const requestId = this.generateRequestId();

    const request: VoiceRequest = {
      requestId,
      sessionId,
      userId: session.userId,
      audioFrames,
      startTime: Date.now(),
      status: 'receiving',
    };

    session.currentRequest = request;
    this.activeRequests.set(requestId, request);

    this.emit('requestStarted', request);

    try {
      // Step 1: Transcribe audio
      request.status = 'transcribing';
      const transcription = await this.transcribeAudio(audioFrames, session);
      request.transcription = transcription;

      // Step 2: Send to agent
      request.status = 'processing';
      const agentResponse = await this.callAgent(transcription.text, session);
      request.agentResponse = agentResponse.text;

      // Step 3: Synthesize response
      request.status = 'synthesizing';
      const ttsResponse = await this.synthesizeSpeech(agentResponse.text, session);
      request.ttsResponse = ttsResponse;

      // Step 4: Play audio response
      request.status = 'playing';
      await this.playAudioResponse(ttsResponse.audio, session);

      // Success
      request.status = 'completed';
      session.metrics.totalRequests++;
      session.metrics.successfulRequests++;

      this.emit('requestCompleted', request);
      return requestId;

    } catch (error: any) {
      request.status = 'error';
      const pipelineError = error instanceof PipelineError
        ? error
        : new PipelineError(
            PipelineErrorCode.UNKNOWN_ERROR,
            error.message,
            {
              sessionId,
              userId: session.userId,
              phase: 'pipeline',
              originalError: error,
            }
          );

      request.error = pipelineError;
      session.metrics.totalRequests++;
      session.metrics.failedRequests++;

      this.emit('requestError', request, pipelineError);

      // Try error recovery
      if (this.config.enableErrorRecovery) {
        const recovered = await this.attemptRecovery(pipelineError, request, session);
        if (recovered) {
          return requestId;
        }
      }

      throw pipelineError;
    }
  }

  /**
   * Cancel a voice request
   */
  async cancelRequest(requestId: string, reason: string = 'cancelled'): Promise<void> {
    const request = this.activeRequests.get(requestId);
    if (!request) return;

    request.status = 'error';
    request.error = new PipelineError(
      PipelineErrorCode.PIPELINE_CANCELLED,
      `Request cancelled: ${reason}`,
      { sessionId: request.sessionId, requestId }
    );

    this.activeRequests.delete(requestId);
  }

  /**
   * Get session information
   */
  getSession(sessionId: string): VoiceSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): VoiceSession[] {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active');
  }

  /**
   * Get pipeline metrics
   */
  getMetrics(): PipelineMetrics {
    // Update memory and CPU usage
    if (this.config.enableMetrics) {
      const memUsage = process.memoryUsage();
      this.metrics.memoryUsage = memUsage.heapUsed / (1024 * 1024); // MB
      // CPU usage would need additional tracking in a real implementation
    }

    return { ...this.metrics };
  }

  /**
   * Register event listener
   */
  on<K extends keyof PipelineEvents>(event: K, listener: PipelineEvents[K]): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof PipelineEvents>(event: K, listener: PipelineEvents[K]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Ensure pipeline is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new PipelineError(
        PipelineErrorCode.PIPELINE_INVALID_STATE,
        'Pipeline not initialized. Call initialize() first.'
      );
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Transcribe audio frames to text
   */
  private async transcribeAudio(
    audioFrames: AudioFrame[],
    session: VoiceSession
  ): Promise<TranscriptionResult> {
    if (!this.sttInstance) {
      throw new PipelineError(
        PipelineErrorCode.STT_INITIALIZATION_FAILED,
        'STT instance not available'
      );
    }

    const startTime = Date.now();

    try {
      // Convert audio frames to PCM
      const pcmBuffer = await this.convertFramesToPCM(audioFrames);

      // Transcribe
      const result = await this.sttInstance.transcribe(pcmBuffer);

      // Update metrics
      const latency = Date.now() - startTime;
      session.metrics.avgTranscriptionLatency =
        (session.metrics.avgTranscriptionLatency + latency) / 2;

      return result;
    } catch (error: any) {
      throw new PipelineError(
        PipelineErrorCode.STT_TRANSCRIPTION_FAILED,
        `Transcription failed: ${error.message}`,
        {
          sessionId: session.sessionId,
          userId: session.userId,
          phase: 'stt',
          originalError: error,
        }
      );
    }
  }

  /**
   * Call agent with transcribed text
   */
  private async callAgent(text: string, session: VoiceSession): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Mock agent call - in real implementation, call actual agent API
      const response = await this.mockAgentCall(text, session);

      // Update metrics
      const latency = Date.now() - startTime;
      session.metrics.avgAgentLatency =
        (session.metrics.avgAgentLatency + latency) / 2;

      return response;
    } catch (error: any) {
      throw new PipelineError(
        PipelineErrorCode.AGENT_REQUEST_FAILED,
        `Agent request failed: ${error.message}`,
        {
          sessionId: session.sessionId,
          userId: session.userId,
          phase: 'agent',
          textLength: text.length,
          originalError: error,
        }
      );
    }
  }

  /**
   * Synthesize speech from text
   */
  private async synthesizeSpeech(text: string, session: VoiceSession): Promise<TTSResponse> {
    if (!this.ttsInstance) {
      throw new PipelineError(
        PipelineErrorCode.TTS_INITIALIZATION_FAILED,
        'TTS instance not available'
      );
    }

    const startTime = Date.now();

    try {
      // Synthesize
      const response = await this.ttsInstance.synthesize(text);

      // Update metrics
      const latency = Date.now() - startTime;
      session.metrics.avgTtsLatency =
        (session.metrics.avgTtsLatency + latency) / 2;

      return response;
    } catch (error: any) {
      throw new PipelineError(
        PipelineErrorCode.TTS_SYNTHESIS_FAILED,
        `Speech synthesis failed: ${error.message}`,
        {
          sessionId: session.sessionId,
          userId: session.userId,
          phase: 'tts',
          textLength: text.length,
          originalError: error,
        }
      );
    }
  }

  /**
   * Play synthesized audio response
   */
  private async playAudioResponse(audioBuffer: Buffer | Uint8Array, session: VoiceSession): Promise<void> {
    if (!session.audioHandler) {
      // If no audio handler, just log (for testing)
      console.log('No audio handler available for playback');
      return;
    }

    try {
      // Convert buffer to Float32Array PCM
      const pcmData = await this.convertBufferToPCM(audioBuffer);

      // Create audio frame
      const frame: AudioFrame = {
        timestamp: Date.now(),
        sequenceNumber: 0,
        ssrc: Math.floor(Math.random() * 0xffffffff),
        data: pcmData,
        sampleCount: pcmData.length / 2, // Stereo
        duration: 20,
      };

      // Play frame
      await session.audioHandler.playFrame(frame);
    } catch (error: any) {
      throw new PipelineError(
        PipelineErrorCode.AUDIO_DECODING_FAILED,
        `Audio playback failed: ${error.message}`,
        {
          sessionId: session.sessionId,
          userId: session.userId,
          phase: 'audio',
          originalError: error,
        }
      );
    }
  }

  /**
   * Attempt error recovery
   */
  private async attemptRecovery(
    error: PipelineError,
    request: VoiceRequest,
    session: VoiceSession
  ): Promise<boolean> {
    if (!error.shouldUseFallback()) {
      return false;
    }

    try {
      // Try fallback response
      if (this.config.enableFallbackResponses) {
        const fallbackResponse = this.getFallbackResponse(error);
        const ttsResponse = await this.synthesizeSpeech(fallbackResponse, session);
        await this.playAudioResponse(ttsResponse.audio, session);

        this.metrics.recoverySuccessRate =
          (this.metrics.recoverySuccessRate + 1) / (this.metrics.errorRate + 1);

        return true;
      }
    } catch (recoveryError) {
      console.error('Recovery failed:', recoveryError);
    }

    return false;
  }

  /**
   * Get fallback response for error
   */
  private getFallbackResponse(error: PipelineError): string {
    switch (error.code) {
      case PipelineErrorCode.STT_TRANSCRIPTION_FAILED:
        return "I didn't catch that. Could you please repeat?";
      case PipelineErrorCode.AGENT_REQUEST_FAILED:
        return "I'm having trouble processing your request right now. Please try again.";
      case PipelineErrorCode.TTS_SYNTHESIS_FAILED:
        return "I can't respond right now, but I'm here.";
      default:
        return "Sorry, there was an issue. Please try again.";
    }
  }

  /**
   * Convert audio frames to PCM buffer
   */
  private async convertFramesToPCM(frames: AudioFrame[]): Promise<Buffer> {
    // Simple concatenation for mock implementation
    const totalSamples = frames.reduce((sum, f) => sum + f.data.length, 0);
    const buffer = Buffer.alloc(totalSamples * 2); // 16-bit samples

    let offset = 0;
    for (const frame of frames) {
      for (let i = 0; i < frame.data.length; i++) {
        const sample = Math.max(-1, Math.min(1, frame.data[i]));
        const int16 = Math.floor(sample * 32767);
        buffer.writeInt16LE(int16, offset);
        offset += 2;
      }
    }

    return buffer;
  }

  /**
   * Convert audio buffer to PCM Float32Array
   */
  private async convertBufferToPCM(buffer: Buffer | Uint8Array): Promise<Float32Array> {
    const buf = Buffer.from(buffer);
    const samples = buf.length / 2; // 16-bit samples
    const pcm = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      const int16 = buf.readInt16LE(i * 2);
      pcm[i] = int16 / 32767.0;
    }

    return pcm;
  }

  /**
   * Mock agent call (replace with real agent integration)
   */
  private async mockAgentCall(text: string, session: VoiceSession): Promise<AgentResponse> {
    // Simulate agent processing time
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    // Mock responses based on input
    let response = "I understand you said: " + text;

    if (text.toLowerCase().includes('hello')) {
      response = "Hello! How can I help you today?";
    } else if (text.toLowerCase().includes('time')) {
      response = "The current time is " + new Date().toLocaleTimeString();
    } else if (text.toLowerCase().includes('weather')) {
      response = "I'm sorry, I don't have access to weather information right now.";
    }

    return {
      text: response,
      confidence: 0.95,
      metadata: {
        sessionId: session.sessionId,
        processingTime: Date.now() - session.lastActivity,
      },
    };
  }

  /**
   * Emit event to listeners
   */
  private emit<K extends keyof PipelineEvents>(event: K, ...args: Parameters<PipelineEvents[K]>): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          (listener as any)(...args);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      }
    }
  }

  /**
   * Periodic cleanup of timed-out sessions
   */
  private startSessionCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [sessionId, session] of this.sessions) {
        if (now - session.lastActivity > this.config.sessionTimeoutMs) {
          this.endSession(sessionId, 'timeout');
        }
      }
    }, 60000); // Check every minute
  }
}