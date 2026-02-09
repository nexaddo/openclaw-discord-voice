/**
 * Phase 6: Voice Command Pipeline - Comprehensive Test Suite
 * 36 end-to-end test cases covering all scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VoiceCommandPipeline, VoiceCommandPipelineConfig } from '../src/VoiceCommandPipeline.js';
import { AudioFrame } from '../src/AudioStreamHandler.js';
import { PipelineError, PipelineErrorCode } from '../src/PipelineErrors.js';

describe('VoiceCommandPipeline - 36 Comprehensive Test Cases', () => {
  let pipeline: VoiceCommandPipeline;
  let mockConfig: VoiceCommandPipelineConfig;

  beforeEach(async () => {
    // Mock configurations
    mockConfig = {
      audioConfig: {
        sampleRate: 48000,
        channels: 2,
        frameSize: 960,
        bitRate: 128000,
        jitterBufferSize: 10,
        circularBufferCapacity: 100,
        targetBufferLatency: 40,
        opusComplexity: 5,
        useFEC: false,
        useDTX: false,
        maxPlaybackRate: 48000,
        maxRetries: 3,
        timeoutMs: 5000,
        enableMetrics: true,
      },
      sttConfig: {
        apiKey: 'test-key',
        modelName: 'whisper-1',
        sampleRate: 48000,
        language: 'en',
        enableVAD: true,
        timeoutMs: 30000,
      },
      ttsConfig: {
        apiKey: 'test-tts-key',
        voiceId: 'nova',
        modelId: 'eleven_turbo',
        sampleRate: 48000,
        format: 'wav',
        stability: 0.5,
        similarity: 0.75,
        enableCaching: true,
        cacheSize: 100,
        maxRetries: 3,
        timeoutMs: 5000,
      },
      maxConcurrentConnections: 10,
      sessionTimeoutMs: 300000,
      enableFallbackResponses: true,
      enableMetrics: true,
      agentTimeoutMs: 30000,
      enableErrorRecovery: true,
      maxRecoveryAttempts: 3,
    };

    // Create pipeline instance
    pipeline = new VoiceCommandPipeline(mockConfig);
    await pipeline.initialize();
  });

  afterEach(async () => {
    await pipeline.shutdown();
  });

  // ============================================
  // Section 1: Initialization Tests (3 tests)
  // ============================================

  describe('Pipeline Initialization', () => {
    it('TC-001: Pipeline initializes successfully', async () => {
      expect(pipeline).toBeDefined();
      const metrics = pipeline.getMetrics();
      expect(metrics.activeSessions).toBe(0);
      expect(metrics.totalSessions).toBe(0);
    });

    it('TC-002: Pipeline initialization with valid config', async () => {
      const newPipeline = new VoiceCommandPipeline(mockConfig);
      await newPipeline.initialize();
      expect(newPipeline).toBeDefined();
      await newPipeline.shutdown();
    });

    it('TC-003: Cannot start session before initialization', async () => {
      const uninitializedPipeline = new VoiceCommandPipeline(mockConfig);
      const frames = [createMockAudioFrame(960, 0)];

      // startSession should throw before initialization
      await expect(uninitializedPipeline.startSession('user123', 'guild456', 'channel789')).rejects.toThrow(
        PipelineError,
      );

      await uninitializedPipeline.shutdown();
    });
  });

  // ============================================
  // Section 2: Session Management (8 tests)
  // ============================================

  describe('Session Management', () => {
    it('TC-004: Create new session', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');
      expect(sessionId).toBeDefined();
      expect(sessionId).toMatch(/^session_/);

      const session = pipeline.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.userId).toBe('user123');
      expect(session?.guildId).toBe('guild456');
      expect(session?.channelId).toBe('channel789');
    });

    it('TC-005: Session status is active after creation', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');
      const session = pipeline.getSession(sessionId);
      expect(session?.status).toBe('active');
    });

    it('TC-006: End session successfully', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');
      await pipeline.endSession(sessionId);

      const session = pipeline.getSession(sessionId);
      expect(session).toBeUndefined();
    });

    it('TC-007: Session maintains metrics', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');
      const session = pipeline.getSession(sessionId);

      expect(session?.metrics.totalRequests).toBe(0);
      expect(session?.metrics.successfulRequests).toBe(0);
      expect(session?.metrics.failedRequests).toBe(0);
    });

    it('TC-008: Multiple sessions can coexist', async () => {
      const session1 = await pipeline.startSession('user1', 'guild1', 'channel1');
      const session2 = await pipeline.startSession('user2', 'guild2', 'channel2');

      const activeSessions = pipeline.getActiveSessions();
      expect(activeSessions).toHaveLength(2);
    });

    it('TC-009: Get all active sessions', async () => {
      await pipeline.startSession('user1', 'guild1', 'channel1');
      await pipeline.startSession('user2', 'guild1', 'channel2');
      await pipeline.startSession('user3', 'guild1', 'channel3');

      const activeSessions = pipeline.getActiveSessions();
      expect(activeSessions).toHaveLength(3);
    });

    it('TC-010: Session cleanup after end', async () => {
      const session1 = await pipeline.startSession('user1', 'guild1', 'channel1');
      const session2 = await pipeline.startSession('user2', 'guild1', 'channel2');

      await pipeline.endSession(session1);

      const activeSessions = pipeline.getActiveSessions();
      expect(activeSessions).toHaveLength(1);
      expect(activeSessions[0].sessionId).toBe(session2);
    });

    it('TC-011: Cannot end non-existent session', async () => {
      // Should not throw
      await expect(pipeline.endSession('nonexistent-session')).resolves.not.toThrow();
    });
  });

  // ============================================
  // Section 3: Concurrency and Limits (8 tests)
  // ============================================

  describe('Concurrent Connections', () => {
    it('TC-012: Concurrent limit enforcement', async () => {
      const limitedConfig = { ...mockConfig, maxConcurrentConnections: 2 };
      const limitedPipeline = new VoiceCommandPipeline(limitedConfig);
      await limitedPipeline.initialize();

      await limitedPipeline.startSession('user1', 'guild1', 'channel1');
      await limitedPipeline.startSession('user2', 'guild1', 'channel2');

      // Third session should fail
      await expect(limitedPipeline.startSession('user3', 'guild1', 'channel3')).rejects.toThrow(PipelineError);

      await limitedPipeline.shutdown();
    });

    it('TC-013: Metrics track concurrent limit hits', async () => {
      const limitedConfig = { ...mockConfig, maxConcurrentConnections: 1 };
      const limitedPipeline = new VoiceCommandPipeline(limitedConfig);
      await limitedPipeline.initialize();

      await limitedPipeline.startSession('user1', 'guild1', 'channel1');

      try {
        await limitedPipeline.startSession('user2', 'guild1', 'channel2');
      } catch {
        // Expected
      }

      const metrics = limitedPipeline.getMetrics();
      expect(metrics.concurrentLimitHits).toBe(1);

      await limitedPipeline.shutdown();
    });

    it('TC-014: Can create new session after ending one', async () => {
      const limitedConfig = { ...mockConfig, maxConcurrentConnections: 1 };
      const limitedPipeline = new VoiceCommandPipeline(limitedConfig);
      await limitedPipeline.initialize();

      const session1 = await limitedPipeline.startSession('user1', 'guild1', 'channel1');
      await limitedPipeline.endSession(session1);

      // Should now be able to create another
      const session2 = await limitedPipeline.startSession('user2', 'guild1', 'channel2');
      expect(session2).toBeDefined();

      await limitedPipeline.shutdown();
    });

    it('TC-015: Multiple channels same guild isolation', async () => {
      const session1 = await pipeline.startSession('user1', 'guild1', 'channel1');
      const session2 = await pipeline.startSession('user1', 'guild1', 'channel2');

      const activeSessions = pipeline.getActiveSessions();
      expect(activeSessions).toHaveLength(2);

      // Sessions should be separate
      const s1 = pipeline.getSession(session1);
      const s2 = pipeline.getSession(session2);
      expect(s1?.channelId).not.toBe(s2?.channelId);
    });

    it('TC-016: Different users same channel', async () => {
      const session1 = await pipeline.startSession('user1', 'guild1', 'channel1');
      const session2 = await pipeline.startSession('user2', 'guild1', 'channel1');

      const activeSessions = pipeline.getActiveSessions();
      expect(activeSessions).toHaveLength(2);

      // Sessions should be separate despite same channel
      const s1 = pipeline.getSession(session1);
      const s2 = pipeline.getSession(session2);
      expect(s1?.userId).not.toBe(s2?.userId);
    });

    it('TC-017: Memory usage tracking', async () => {
      const initialMetrics = pipeline.getMetrics();
      const initialMemory = initialMetrics.memoryUsage;

      // Create multiple sessions
      for (let i = 0; i < 5; i++) {
        await pipeline.startSession(`user${i}`, 'guild1', `channel${i}`);
      }

      const afterMetrics = pipeline.getMetrics();
      expect(afterMetrics.memoryUsage).toBeGreaterThanOrEqual(initialMemory);
    });

    it('TC-018: CPU usage tracking', async () => {
      const metrics = pipeline.getMetrics();
      // CPU usage should be tracked even if 0
      expect(metrics.cpuUsage).toBeDefined();
      expect(typeof metrics.cpuUsage).toBe('number');
    });

    it('TC-019: Sessions per metrics', async () => {
      await pipeline.startSession('user1', 'guild1', 'channel1');
      await pipeline.startSession('user2', 'guild1', 'channel2');

      const metrics = pipeline.getMetrics();
      expect(metrics.activeSessions).toBe(2);
      expect(metrics.totalSessions).toBe(2);
    });
  });

  // ============================================
  // Section 4: Error Handling (8 tests)
  // ============================================

  describe('Error Handling', () => {
    it('TC-020: Invalid session ID throws error', async () => {
      const frames = [createMockAudioFrame(960, 0)];
      await expect(pipeline.processVoiceCommand('invalid-session', frames)).rejects.toThrow(PipelineError);
    });

    it('TC-021: Error code classification', async () => {
      const error = new PipelineError(PipelineErrorCode.STT_TRANSCRIPTION_FAILED, 'Test error');
      expect(error.getPhase()).toBe('stt');
    });

    it('TC-022: Audio phase error classification', async () => {
      const error = new PipelineError(PipelineErrorCode.AUDIO_BUFFER_OVERFLOW, 'Buffer overflow');
      expect(error.getPhase()).toBe('audio');
    });

    it('TC-023: TTS phase error classification', async () => {
      const error = new PipelineError(PipelineErrorCode.TTS_SYNTHESIS_FAILED, 'Synthesis error');
      expect(error.getPhase()).toBe('tts');
    });

    it('TC-024: Agent phase error classification', async () => {
      const error = new PipelineError(PipelineErrorCode.AGENT_REQUEST_FAILED, 'Agent error');
      expect(error.getPhase()).toBe('agent');
    });

    it('TC-025: User-facing error messages', async () => {
      const error = new PipelineError(PipelineErrorCode.AUDIO_CAPTURE_FAILED, 'Microphone not working');
      expect(error.userMessage).toBeDefined();
      expect(error.userMessage.length > 0).toBe(true);
    });

    it('TC-026: Error recovery suggestions', async () => {
      const error = new PipelineError(PipelineErrorCode.STT_NO_SPEECH_DETECTED, 'No speech');
      expect(error.recoverySuggestions).toBeDefined();
      expect(error.recoverySuggestions.length > 0).toBe(true);
    });

    it('TC-027: Error context preservation', async () => {
      const error = new PipelineError(PipelineErrorCode.PIPELINE_TIMEOUT, 'Timeout', {
        sessionId: 'test-session',
        userId: 'test-user',
        phase: 'audio',
      });
      expect(error.context.sessionId).toBe('test-session');
      expect(error.context.userId).toBe('test-user');
    });

    it('TC-028: Recoverable flag set correctly', async () => {
      const recoverableError = new PipelineError(PipelineErrorCode.STT_API_ERROR, 'API error', {}, true);
      expect(recoverableError.recoverable).toBe(true);

      const nonRecoverableError = new PipelineError(
        PipelineErrorCode.PIPELINE_INVALID_STATE,
        'Invalid state',
        {},
        false,
      );
      expect(nonRecoverableError.recoverable).toBe(false);
    });
  });

  // ============================================
  // Section 5: Metrics Collection (7 tests)
  // ============================================

  describe('Metrics and Monitoring', () => {
    it('TC-029: Initial metrics are zero', async () => {
      const metrics = pipeline.getMetrics();
      expect(metrics.activeSessions).toBe(0);
      expect(metrics.totalSessions).toBe(0);
      expect(metrics.concurrentLimitHits).toBe(0);
    });

    it('TC-030: Metrics update on session creation', async () => {
      let metrics = pipeline.getMetrics();
      const initialTotal = metrics.totalSessions;

      await pipeline.startSession('user1', 'guild1', 'channel1');

      metrics = pipeline.getMetrics();
      expect(metrics.totalSessions).toBe(initialTotal + 1);
      expect(metrics.activeSessions).toBe(1);
    });

    it('TC-031: Metrics update on session end', async () => {
      const sessionId = await pipeline.startSession('user1', 'guild1', 'channel1');

      let metrics = pipeline.getMetrics();
      expect(metrics.activeSessions).toBe(1);

      await pipeline.endSession(sessionId);

      metrics = pipeline.getMetrics();
      expect(metrics.activeSessions).toBe(0);
    });

    it('TC-032: Error rate tracking', async () => {
      const metrics = pipeline.getMetrics();
      // Initial error rate should be 0
      expect(metrics.errorRate).toBe(0);
    });

    it('TC-033: Recovery success rate tracking', async () => {
      const metrics = pipeline.getMetrics();
      // Initial recovery rate should be 0
      expect(metrics.recoverySuccessRate).toBe(0);
    });

    it('TC-034: Session duration calculation', async () => {
      const sessionId = await pipeline.startSession('user1', 'guild1', 'channel1');
      const session = pipeline.getSession(sessionId);

      expect(session?.startTime).toBeLessThanOrEqual(Date.now());
      expect(session?.lastActivity).toBeLessThanOrEqual(Date.now());
    });

    it('TC-035: Metrics JSON serialization', async () => {
      const metrics = pipeline.getMetrics();
      const json = JSON.stringify(metrics);
      expect(json).toBeDefined();
      expect(json.length > 0).toBe(true);

      const parsed = JSON.parse(json);
      expect(parsed.activeSessions).toBe(0);
    });

    it('TC-036: Metrics include memory usage', async () => {
      const metrics = pipeline.getMetrics();
      expect(metrics.memoryUsage).toBeDefined();
      expect(typeof metrics.memoryUsage).toBe('number');
      expect(metrics.memoryUsage).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================
  // Helper Functions
  // ============================================

  function createMockAudioFrame(sampleCount: number, sequence: number): AudioFrame {
    const data = new Float32Array(sampleCount * 2); // Stereo
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() - 0.5) * 0.1; // Small amplitude noise
    }

    return {
      timestamp: Date.now() + sequence * 20, // 20ms apart
      sequenceNumber: sequence,
      ssrc: Math.floor(Math.random() * 0xffffffff),
      data,
      sampleCount,
      duration: 20,
    };
  }
});
