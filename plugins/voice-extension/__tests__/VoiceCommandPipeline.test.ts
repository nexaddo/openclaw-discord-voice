/**
 * Phase 6: Voice Command Pipeline - Comprehensive Test Suite
 * 36 end-to-end test cases covering all scenarios
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { VoiceCommandPipeline, VoiceCommandPipelineConfig } from '../src/VoiceCommandPipeline.js';
import { AudioFrame } from '../src/AudioStreamHandler.js';
import { PipelineError, PipelineErrorCode } from '../src/PipelineErrors.js';

// Mock the component dependencies
jest.mock('../src/SpeechToText.js');
jest.mock('../src/TextToSpeech.js');
jest.mock('../src/AudioStreamHandler.js');

describe('VoiceCommandPipeline - 36 Comprehensive Test Cases', () => {
  let pipeline: VoiceCommandPipeline;
  let mockConfig: VoiceCommandPipelineConfig;
  let mockStt: any;
  let mockTts: any;
  let mockAudioHandler: any;

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
  // Section 1: Happy Path Tests (6 tests)
  // ============================================

  describe('Happy Path Scenarios', () => {
    it('TC-001: Complete voice command pipeline - audio to response', async () => {
      // Setup: Create session and audio frames
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');
      const audioFrames: AudioFrame[] = [
        createMockAudioFrame(960, 0),
        createMockAudioFrame(960, 1),
      ];

      // Mock successful responses
      mockStt.transcribe.mockResolvedValue({
        text: 'Hello world',
        language: 'en',
        confidence: 0.95,
        duration: 2000,
        timestamp: Date.now(),
      });

      mockTts.synthesize.mockResolvedValue({
        text: 'Hello! How can I help?',
        audio: Buffer.alloc(48000), // Mock 1 second of audio
        duration: 1000,
        voiceId: 'nova',
        stability: 0.5,
        similarity: 0.75,
        sampleRate: 48000,
        channels: 2,
        format: 'wav',
        timestamp: Date.now(),
      });

      // Execute
      const requestId = await pipeline.processVoiceCommand(sessionId, audioFrames);

      // Verify
      expect(requestId).toBeDefined();
      const session = pipeline.getSession(sessionId);
      expect(session?.metrics.totalRequests).toBe(1);
      expect(session?.metrics.successfulRequests).toBe(1);
    });

    it('TC-002: Simple greeting command', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');
      const audioFrames = [createMockAudioFrame(960, 0)];

      mockStt.transcribe.mockResolvedValue({
        text: 'Hello',
        language: 'en',
        confidence: 0.95,
        duration: 500,
        timestamp: Date.now(),
      });

      mockTts.synthesize.mockResolvedValue({
        text: 'Hello! How can I help you today?',
        audio: Buffer.alloc(24000),
        duration: 2000,
        voiceId: 'nova',
        stability: 0.5,
        similarity: 0.75,
        sampleRate: 48000,
        channels: 2,
        format: 'wav',
        timestamp: Date.now(),
      });

      const requestId = await pipeline.processVoiceCommand(sessionId, audioFrames);
      expect(requestId).toBeDefined();
    });

    it('TC-003: Complex multi-sentence command', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');
      const audioFrames = [
        createMockAudioFrame(960, 0),
        createMockAudioFrame(960, 1),
        createMockAudioFrame(960, 2),
      ];

      mockStt.transcribe.mockResolvedValue({
        text: 'Can you tell me the weather and also what time it is?',
        language: 'en',
        confidence: 0.92,
        duration: 3000,
        timestamp: Date.now(),
      });

      mockTts.synthesize.mockResolvedValue({
        text: 'I\'m sorry, I don\'t have access to weather information, but the current time is 3:45 PM.',
        audio: Buffer.alloc(96000),
        duration: 4000,
        voiceId: 'nova',
        stability: 0.5,
        similarity: 0.75,
        sampleRate: 48000,
        channels: 2,
        format: 'wav',
        timestamp: Date.now(),
      });

      const requestId = await pipeline.processVoiceCommand(sessionId, audioFrames);
      expect(requestId).toBeDefined();
    });

    it('TC-004: Short command with fast response', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');
      const audioFrames = [createMockAudioFrame(960, 0)];

      mockStt.transcribe.mockResolvedValue({
        text: 'Time',
        language: 'en',
        confidence: 0.98,
        duration: 300,
        timestamp: Date.now(),
      });

      mockTts.synthesize.mockResolvedValue({
        text: 'The current time is 2:30 PM.',
        audio: Buffer.alloc(12000),
        duration: 1000,
        voiceId: 'nova',
        stability: 0.5,
        similarity: 0.75,
        sampleRate: 48000,
        channels: 2,
        format: 'wav',
        timestamp: Date.now(),
      });

      const startTime = Date.now();
      const requestId = await pipeline.processVoiceCommand(sessionId, audioFrames);
      const duration = Date.now() - startTime;

      expect(requestId).toBeDefined();
      expect(duration).toBeLessThan(5000); // Should complete quickly
    });

    it('TC-005: Session maintains state across multiple commands', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');

      // First command
      const frames1 = [createMockAudioFrame(960, 0)];
      mockStt.transcribe.mockResolvedValueOnce({
        text: 'Hello',
        language: 'en',
        confidence: 0.95,
        duration: 500,
        timestamp: Date.now(),
      });
      mockTts.synthesize.mockResolvedValueOnce({
        text: 'Hi there!',
        audio: Buffer.alloc(12000),
        duration: 1000,
        voiceId: 'nova',
        stability: 0.5,
        similarity: 0.75,
        sampleRate: 48000,
        channels: 2,
        format: 'wav',
        timestamp: Date.now(),
      });

      await pipeline.processVoiceCommand(sessionId, frames1);

      // Second command
      const frames2 = [createMockAudioFrame(960, 1)];
      mockStt.transcribe.mockResolvedValueOnce({
        text: 'How are you?',
        language: 'en',
        confidence: 0.93,
        duration: 800,
        timestamp: Date.now(),
      });
      mockTts.synthesize.mockResolvedValueOnce({
        text: 'I\'m doing well, thank you!',
        audio: Buffer.alloc(18000),
        duration: 1500,
        voiceId: 'nova',
        stability: 0.5,
        similarity: 0.75,
        sampleRate: 48000,
        channels: 2,
        format: 'wav',
        timestamp: Date.now(),
      });

      await pipeline.processVoiceCommand(sessionId, frames2);

      const session = pipeline.getSession(sessionId);
      expect(session?.metrics.totalRequests).toBe(2);
      expect(session?.metrics.successfulRequests).toBe(2);
    });

    it('TC-006: Pipeline metrics tracking', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');
      const audioFrames = [createMockAudioFrame(960, 0)];

      mockStt.transcribe.mockResolvedValue({
        text: 'Test command',
        language: 'en',
        confidence: 0.95,
        duration: 500,
        timestamp: Date.now(),
      });

      mockTts.synthesize.mockResolvedValue({
        text: 'Test response',
        audio: Buffer.alloc(12000),
        duration: 1000,
        voiceId: 'nova',
        stability: 0.5,
        similarity: 0.75,
        sampleRate: 48000,
        channels: 2,
        format: 'wav',
        timestamp: Date.now(),
      });

      await pipeline.processVoiceCommand(sessionId, audioFrames);

      const metrics = pipeline.getMetrics();
      expect(metrics.totalSessions).toBe(1);
      expect(metrics.activeSessions).toBe(1);
      expect(metrics.memoryUsage).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Section 2: Error Conditions (12 tests)
  // ============================================

  describe('Error Condition Scenarios', () => {
    it('TC-007: STT transcription failure', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');
      const audioFrames = [createMockAudioFrame(960, 0)];

      mockStt.transcribe.mockRejectedValue(new Error('API rate limited'));

      await expect(pipeline.processVoiceCommand(sessionId, audioFrames))
        .rejects.toThrow(PipelineError);

      const session = pipeline.getSession(sessionId);
      expect(session?.metrics.failedRequests).toBe(1);
    });

    it('TC-008: TTS synthesis failure', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');
      const audioFrames = [createMockAudioFrame(960, 0)];

      mockStt.transcribe.mockResolvedValue({
        text: 'Hello',
        language: 'en',
        confidence: 0.95,
        duration: 500,
        timestamp: Date.now(),
      });

      mockTts.synthesize.mockRejectedValue(new Error('Voice synthesis failed'));

      await expect(pipeline.processVoiceCommand(sessionId, audioFrames))
        .rejects.toThrow(PipelineError);

      const session = pipeline.getSession(sessionId);
      expect(session?.metrics.failedRequests).toBe(1);
    });

    it('TC-009: Invalid audio frames', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');
      const invalidFrames: AudioFrame[] = [
        {
          timestamp: Date.now(),
          sequenceNumber: 0,
          ssrc: 12345,
          data: new Float32Array(0), // Empty data
          sampleCount: 0,
          duration: 0,
        },
      ];

      mockStt.transcribe.mockRejectedValue(new Error('Invalid audio data'));

      await expect(pipeline.processVoiceCommand(sessionId, invalidFrames))
        .rejects.toThrow(PipelineError);
    });

    it('TC-010: Agent timeout', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');
      const audioFrames = [createMockAudioFrame(960, 0)];

      mockStt.transcribe.mockResolvedValue({
        text: 'Test command',
        language: 'en',
        confidence: 0.95,
        duration: 500,
        timestamp: Date.now(),
      });

      // Mock agent timeout
      const originalAgentCall = (pipeline as any).mockAgentCall;
      (pipeline as any).mockAgentCall = jest.fn().mockImplementation(
        () => new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Agent timeout')), 35000)
        )
      );

      await expect(pipeline.processVoiceCommand(sessionId, audioFrames))
        .rejects.toThrow(PipelineError);

      // Restore
      (pipeline as any).mockAgentCall = originalAgentCall;
    });

    it('TC-011: Audio playback failure', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');
      const audioFrames = [createMockAudioFrame(960, 0)];

      mockStt.transcribe.mockResolvedValue({
        text: 'Hello',
        language: 'en',
        confidence: 0.95,
        duration: 500,
        timestamp: Date.now(),
      });

      mockTts.synthesize.mockResolvedValue({
        text: 'Hello!',
        audio: Buffer.alloc(12000),
        duration: 1000,
        voiceId: 'nova',
        stability: 0.5,
        similarity: 0.75,
        sampleRate: 48000,
        channels: 2,
        format: 'wav',
        timestamp: Date.now(),
      });

      // Mock audio handler failure
      const mockHandler = {
        playFrame: jest.fn().mockRejectedValue(new Error('Playback failed')),
        shutdown: jest.fn().mockResolvedValue(undefined),
      };

      await pipeline.startSession('user123', 'guild456', 'channel789');
      const session = pipeline.getSession(sessionId);
      if (session) {
        session.audioHandler = mockHandler;
      }

      await expect(pipeline.processVoiceCommand(sessionId, audioFrames))
        .rejects.toThrow(PipelineError);
    });

    it('TC-012: Pipeline initialization failure', async () => {
      const badConfig = { ...mockConfig, sttConfig: { ...mockConfig.sttConfig, apiKey: '' } };
      const badPipeline = new VoiceCommandPipeline(badConfig);

      await expect(badPipeline.initialize())
        .rejects.toThrow(PipelineError);
    });

    it('TC-013: Session not found', async () => {
      const audioFrames = [createMockAudioFrame(960, 0)];

      await expect(pipeline.processVoiceCommand('nonexistent-session', audioFrames))
        .rejects.toThrow(PipelineError);
    });

    it('TC-014: Concurrent connection limit exceeded', async () => {
      const limitedConfig = { ...mockConfig, maxConcurrentConnections: 1 };
      const limitedPipeline = new VoiceCommandPipeline(limitedConfig);
      await limitedPipeline.initialize();

      await limitedPipeline.startSession('user1', 'guild1', 'channel1');

      await expect(limitedPipeline.startSession('user2', 'guild2', 'channel2'))
        .rejects.toThrow(PipelineError);

      await limitedPipeline.shutdown();
    });

    it('TC-015: Session timeout handling', async () => {
      const timeoutConfig = { ...mockConfig, sessionTimeoutMs: 100 };
      const timeoutPipeline = new VoiceCommandPipeline(timeoutConfig);
      await timeoutPipeline.initialize();

      const sessionId = await timeoutPipeline.startSession('user123', 'guild456', 'channel789');

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      const session = timeoutPipeline.getSession(sessionId);
      expect(session?.status).toBe('ended');

      await timeoutPipeline.shutdown();
    });

    it('TC-016: Memory pressure handling', async () => {
      // Create many sessions to test memory handling
      const sessions = [];
      for (let i = 0; i < 50; i++) {
        const sessionId = await pipeline.startSession(`user${i}`, `guild${i}`, `channel${i}`);
        sessions.push(sessionId);
      }

      expect(pipeline.getActiveSessions()).toHaveLength(50);

      // End sessions
      for (const sessionId of sessions) {
        await pipeline.endSession(sessionId);
      }

      expect(pipeline.getActiveSessions()).toHaveLength(0);
    });

    it('TC-017: Invalid configuration', async () => {
      const invalidConfig = {
        ...mockConfig,
        audioConfig: { ...mockConfig.audioConfig, sampleRate: 44100 }, // Invalid sample rate
      };

      expect(() => new VoiceCommandPipeline(invalidConfig))
        .toThrow();
    });

    it('TC-018: Component unavailability', async () => {
      // Simulate STT becoming unavailable
      mockStt.transcribe.mockRejectedValue(new Error('Service unavailable'));

      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');
      const audioFrames = [createMockAudioFrame(960, 0)];

      await expect(pipeline.processVoiceCommand(sessionId, audioFrames))
        .rejects.toThrow(PipelineError);
    });
  });

  // ============================================
  // Section 3: Concurrent Connections (9 tests)
  // ============================================

  describe('Concurrent Connection Scenarios', () => {
    it('TC-019: Multiple users in same channel', async () => {
      const session1 = await pipeline.startSession('user1', 'guild1', 'channel1');
      const session2 = await pipeline.startSession('user2', 'guild1', 'channel1');

      expect(pipeline.getActiveSessions()).toHaveLength(2);

      const frames1 = [createMockAudioFrame(960, 0)];
      const frames2 = [createMockAudioFrame(960, 1)];

      mockStt.transcribe.mockResolvedValue({
        text: 'Hello from user 1',
        language: 'en',
        confidence: 0.95,
        duration: 500,
        timestamp: Date.now(),
      });

      mockTts.synthesize.mockResolvedValue({
        text: 'Response to user 1',
        audio: Buffer.alloc(12000),
        duration: 1000,
        voiceId: 'nova',
        stability: 0.5,
        similarity: 0.75,
        sampleRate: 48000,
        channels: 2,
        format: 'wav',
        timestamp: Date.now(),
      });

      // Process both requests concurrently
      const [result1, result2] = await Promise.all([
        pipeline.processVoiceCommand(session1, frames1),
        pipeline.processVoiceCommand(session2, frames2),
      ]);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    it('TC-020: Multiple users in different channels', async () => {
      const session1 = await pipeline.startSession('user1', 'guild1', 'channel1');
      const session2 = await pipeline.startSession('user2', 'guild1', 'channel2');

      expect(pipeline.getActiveSessions()).toHaveLength(2);

      // Process commands in different channels
      const frames1 = [createMockAudioFrame(960, 0)];
      const frames2 = [createMockAudioFrame(960, 1)];

      mockStt.transcribe.mockResolvedValue({
        text: 'Hello',
        language: 'en',
        confidence: 0.95,
        duration: 500,
        timestamp: Date.now(),
      });

      mockTts.synthesize.mockResolvedValue({
        text: 'Hello!',
        audio: Buffer.alloc(12000),
        duration: 1000,
        voiceId: 'nova',
        stability: 0.5,
        similarity: 0.75,
        sampleRate: 48000,
        channels: 2,
        format: 'wav',
        timestamp: Date.now(),
      });

      await Promise.all([
        pipeline.processVoiceCommand(session1, frames1),
        pipeline.processVoiceCommand(session2, frames2),
      ]);

      const sessions = pipeline.getActiveSessions();
      expect(sessions.every(s => s.metrics.successfulRequests === 1)).toBe(true);
    });

    it('TC-021: Sequential processing in same session', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');

      // First command
      const frames1 = [createMockAudioFrame(960, 0)];
      mockStt.transcribe.mockResolvedValueOnce({
        text: 'First command',
        language: 'en',
        confidence: 0.95,
        duration: 500,
        timestamp: Date.now(),
      });
      mockTts.synthesize.mockResolvedValueOnce({
        text: 'First response',
        audio: Buffer.alloc(12000),
        duration: 1000,
        voiceId: 'nova',
        stability: 0.5,
        similarity: 0.75,
        sampleRate: 48000,
        channels: 2,
        format: 'wav',
        timestamp: Date.now(),
      });

      await pipeline.processVoiceCommand(sessionId, frames1);

      // Second command
      const frames2 = [createMockAudioFrame(960, 1)];
      mockStt.transcribe.mockResolvedValueOnce({
        text: 'Second command',
        language: 'en',
        confidence: 0.95,
        duration: 500,
        timestamp: Date.now(),
      });
      mockTts.synthesize.mockResolvedValueOnce({
        text: 'Second response',
        audio: Buffer.alloc(12000),
        duration: 1000,
        voiceId: 'nova',
        stability: 0.5,
        similarity: 0.75,
        sampleRate: 48000,
        channels: 2,
        format: 'wav',
        timestamp: Date.now(),
      });

      await pipeline.processVoiceCommand(sessionId, frames2);

      const session = pipeline.getSession(sessionId);
      expect(session?.metrics.totalRequests).toBe(2);
      expect(session?.metrics.successfulRequests).toBe(2);
    });

    it('TC-022: Concurrent sessions with mixed success/failure', async () => {
      const session1 = await pipeline.startSession('user1', 'guild1', 'channel1');
      const session2 = await pipeline.startSession('user2', 'guild1', 'channel2');

      const frames = [createMockAudioFrame(960, 0)];

      // First session succeeds
      mockStt.transcribe.mockResolvedValueOnce({
        text: 'Success command',
        language: 'en',
        confidence: 0.95,
        duration: 500,
        timestamp: Date.now(),
      });
      mockTts.synthesize.mockResolvedValueOnce({
        text: 'Success response',
        audio: Buffer.alloc(12000),
        duration: 1000,
        voiceId: 'nova',
        stability: 0.5,
        similarity: 0.75,
        sampleRate: 48000,
        channels: 2,
        format: 'wav',
        timestamp: Date.now(),
      });

      // Second session fails
      mockStt.transcribe.mockRejectedValueOnce(new Error('STT failed'));

      const results = await Promise.allSettled([
        pipeline.processVoiceCommand(session1, frames),
        pipeline.processVoiceCommand(session2, frames),
      ]);

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');

      const session1Data = pipeline.getSession(session1);
      const session2Data = pipeline.getSession(session2);

      expect(session1Data?.metrics.successfulRequests).toBe(1);
      expect(session2Data?.metrics.failedRequests).toBe(1);
    });

    it('TC-023: Session cleanup after concurrent operations', async () => {
      const sessions = [];
      for (let i = 0; i < 5; i++) {
        const sessionId = await pipeline.startSession(`user${i}`, 'guild1', `channel${i}`);
        sessions.push(sessionId);
      }

      expect(pipeline.getActiveSessions()).toHaveLength(5);

      // End all sessions
      await Promise.all(sessions.map(id => pipeline.endSession(id)));

      expect(pipeline.getActiveSessions()).toHaveLength(0);
    });

    it('TC-024: Load balancing across sessions', async () => {
      const sessions = [];
      for (let i = 0; i < 10; i++) {
        const sessionId = await pipeline.startSession(`user${i}`, 'guild1', `channel${i}`);
        sessions.push(sessionId);
      }

      // Process commands concurrently
      const promises = sessions.map(async (sessionId, index) => {
        const frames = [createMockAudioFrame(960, index)];

        mockStt.transcribe.mockResolvedValue({
          text: `Command ${index}`,
          language: 'en',
          confidence: 0.95,
          duration: 500,
          timestamp: Date.now(),
        });

        mockTts.synthesize.mockResolvedValue({
          text: `Response ${index}`,
          audio: Buffer.alloc(12000),
          duration: 1000,
          voiceId: 'nova',
          stability: 0.5,
          similarity: 0.75,
          sampleRate: 48000,
          channels: 2,
          format: 'wav',
          timestamp: Date.now(),
        });

        return pipeline.processVoiceCommand(sessionId, frames);
      });

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
      expect(results.every(r => r !== undefined)).toBe(true);
    });

    it('TC-025: Memory usage with concurrent sessions', async () => {
      const initialMemory = pipeline.getMetrics().memoryUsage;

      const sessions = [];
      for (let i = 0; i < 20; i++) {
        const sessionId = await pipeline.startSession(`user${i}`, 'guild1', `channel${i}`);
        sessions.push(sessionId);
      }

      const duringMemory = pipeline.getMetrics().memoryUsage;

      // Memory should increase but not excessively
      expect(duringMemory).toBeGreaterThanOrEqual(initialMemory);
      expect(duringMemory - initialMemory).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase

      // Cleanup
      await Promise.all(sessions.map(id => pipeline.endSession(id)));
    });

    it('TC-026: Request queuing under high load', async () => {
      // This test would require implementing request queuing
      // For now, just verify concurrent limit enforcement
      const maxSessions = mockConfig.maxConcurrentConnections;

      const sessions = [];
      for (let i = 0; i < maxSessions; i++) {
        const sessionId = await pipeline.startSession(`user${i}`, 'guild1', `channel${i}`);
        sessions.push(sessionId);
      }

      // Next session should fail
      await expect(pipeline.startSession('user-extra', 'guild1', 'channel-extra'))
        .rejects.toThrow(PipelineError);

      expect(pipeline.getActiveSessions()).toHaveLength(maxSessions);
    });

    it('TC-027: Session isolation', async () => {
      const session1 = await pipeline.startSession('user1', 'guild1', 'channel1');
      const session2 = await pipeline.startSession('user2', 'guild1', 'channel2');

      // Each session should maintain separate metrics
      const frames = [createMockAudioFrame(960, 0)];

      mockStt.transcribe.mockResolvedValue({
        text: 'Test',
        language: 'en',
        confidence: 0.95,
        duration: 500,
        timestamp: Date.now(),
      });

      mockTts.synthesize.mockResolvedValue({
        text: 'Response',
        audio: Buffer.alloc(12000),
        duration: 1000,
        voiceId: 'nova',
        stability: 0.5,
        similarity: 0.75,
        sampleRate: 48000,
        channels: 2,
        format: 'wav',
        timestamp: Date.now(),
      });

      await pipeline.processVoiceCommand(session1, frames);
      await pipeline.processVoiceCommand(session2, frames);

      const s1 = pipeline.getSession(session1);
      const s2 = pipeline.getSession(session2);

      expect(s1?.metrics.totalRequests).toBe(1);
      expect(s2?.metrics.totalRequests).toBe(1);
      expect(s1?.userId).not.toBe(s2?.userId);
    });
  });

  // ============================================
  // Section 4: Recovery Scenarios (9 tests)
  // ============================================

  describe('Recovery and Fallback Scenarios', () => {
    it('TC-028: STT failure with fallback response', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');
      const audioFrames = [createMockAudioFrame(960, 0)];

      // STT fails
      mockStt.transcribe.mockRejectedValue(new Error('STT service down'));

      // TTS fallback should work
      mockTts.synthesize.mockResolvedValue({
        text: "I didn't catch that. Could you please repeat?",
        audio: Buffer.alloc(24000),
        duration: 2000,
        voiceId: 'nova',
        stability: 0.5,
        similarity: 0.75,
        sampleRate: 48000,
        channels: 2,
        format: 'wav',
        timestamp: Date.now(),
      });

      // Should not throw, should use fallback
      await expect(pipeline.processVoiceCommand(sessionId, audioFrames))
        .resolves.toBeDefined();

      const session = pipeline.getSession(sessionId);
      expect(session?.metrics.failedRequests).toBe(0); // Recovered
    });

    it('TC-029: TTS failure with fallback response', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');
      const audioFrames = [createMockAudioFrame(960, 0)];

      mockStt.transcribe.mockResolvedValue({
        text: 'Hello',
        language: 'en',
        confidence: 0.95,
        duration: 500,
        timestamp: Date.now(),
      });

      // TTS fails
      mockTts.synthesize.mockRejectedValue(new Error('TTS service down'));

      // Should use fallback response
      await expect(pipeline.processVoiceCommand(sessionId, audioFrames))
        .resolves.toBeDefined();

      const session = pipeline.getSession(sessionId);
      expect(session?.metrics.successfulRequests).toBe(1);
    });

    it('TC-030: Agent failure with fallback response', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');
      const audioFrames = [createMockAudioFrame(960, 0)];

      mockStt.transcribe.mockResolvedValue({
        text: 'Test command',
        language: 'en',
        confidence: 0.95,
        duration: 500,
        timestamp: Date.now(),
      });

      // Mock agent failure
      const originalAgentCall = (pipeline as any).mockAgentCall;
      (pipeline as any).mockAgentCall = jest.fn().mockRejectedValue(new Error('Agent down'));

      mockTts.synthesize.mockResolvedValue({
        text: "I'm having trouble processing your request right now. Please try again.",
        audio: Buffer.alloc(36000),
        duration: 3000,
        voiceId: 'nova',
        stability: 0.5,
        similarity: 0.75,
        sampleRate: 48000,
        channels: 2,
        format: 'wav',
        timestamp: Date.now(),
      });

      await expect(pipeline.processVoiceCommand(sessionId, audioFrames))
        .resolves.toBeDefined();

      // Restore
      (pipeline as any).mockAgentCall = originalAgentCall;
    });

    it('TC-031: Multiple failures with recovery', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');
      const audioFrames = [createMockAudioFrame(960, 0)];

      // Both STT and TTS fail initially
      mockStt.transcribe.mockRejectedValueOnce(new Error('STT down'));
      mockTts.synthesize.mockRejectedValueOnce(new Error('TTS down'));

      // But fallback TTS works
      mockTts.synthesize.mockResolvedValueOnce({
        text: "I didn't catch that. Could you please repeat?",
        audio: Buffer.alloc(24000),
        duration: 2000,
        voiceId: 'nova',
        stability: 0.5,
        similarity: 0.75,
        sampleRate: 48000,
        channels: 2,
        format: 'wav',
        timestamp: Date.now(),
      });

      await expect(pipeline.processVoiceCommand(sessionId, audioFrames))
        .resolves.toBeDefined();
    });

    it('TC-032: Recovery success rate tracking', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');

      // First request: STT fails, recovery succeeds
      const frames1 = [createMockAudioFrame(960, 0)];
      mockStt.transcribe.mockRejectedValueOnce(new Error('STT error'));
      mockTts.synthesize.mockResolvedValueOnce({
        text: "I didn't catch that.",
        audio: Buffer.alloc(12000),
        duration: 1000,
        voiceId: 'nova',
        stability: 0.5,
        similarity: 0.75,
        sampleRate: 48000,
        channels: 2,
        format: 'wav',
        timestamp: Date.now(),
      });

      await pipeline.processVoiceCommand(sessionId, frames1);

      // Check metrics
      const metrics = pipeline.getMetrics();
      expect(metrics.recoverySuccessRate).toBeGreaterThan(0);
    });

    it('TC-033: Recovery exhaustion (too many attempts)', async () => {
      const recoveryConfig = { ...mockConfig, maxRecoveryAttempts: 1 };
      const recoveryPipeline = new VoiceCommandPipeline(recoveryConfig);
      await recoveryPipeline.initialize();

      const sessionId = await recoveryPipeline.startSession('user123', 'guild456', 'channel789');
      const audioFrames = [createMockAudioFrame(960, 0)];

      // STT fails and TTS fallback also fails
      mockStt.transcribe.mockRejectedValue(new Error('STT down'));
      mockTts.synthesize.mockRejectedValue(new Error('TTS down'));

      await expect(recoveryPipeline.processVoiceCommand(sessionId, audioFrames))
        .rejects.toThrow(PipelineError);

      await recoveryPipeline.shutdown();
    });

    it('TC-034: Fallback disabled', async () => {
      const noFallbackConfig = { ...mockConfig, enableFallbackResponses: false };
      const noFallbackPipeline = new VoiceCommandPipeline(noFallbackConfig);
      await noFallbackPipeline.initialize();

      const sessionId = await noFallbackPipeline.startSession('user123', 'guild456', 'channel789');
      const audioFrames = [createMockAudioFrame(960, 0)];

      mockStt.transcribe.mockRejectedValue(new Error('STT failed'));

      // Should throw without fallback
      await expect(noFallbackPipeline.processVoiceCommand(sessionId, audioFrames))
        .rejects.toThrow(PipelineError);

      await noFallbackPipeline.shutdown();
    });

    it('TC-035: Graceful degradation', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');

      // Simulate service degradation
      mockStt.transcribe.mockImplementation(() => {
        if (Math.random() < 0.5) {
          throw new Error('Intermittent failure');
        }
        return {
          text: 'Hello',
          language: 'en',
          confidence: 0.95,
          duration: 500,
          timestamp: Date.now(),
        };
      });

      mockTts.synthesize.mockResolvedValue({
        text: 'Hello!',
        audio: Buffer.alloc(12000),
        duration: 1000,
        voiceId: 'nova',
        stability: 0.5,
        similarity: 0.75,
        sampleRate: 48000,
        channels: 2,
        format: 'wav',
        timestamp: Date.now(),
      });

      // Process multiple requests - some should succeed, some recover
      const results = [];
      for (let i = 0; i < 10; i++) {
        const frames = [createMockAudioFrame(960, i)];
        try {
          await pipeline.processVoiceCommand(sessionId, frames);
          results.push('success');
        } catch {
          results.push('failed');
        }
      }

      // Should have mix of successes and recoveries
      expect(results.filter(r => r === 'success').length).toBeGreaterThan(0);
    });

    it('TC-036: Recovery with user feedback', async () => {
      const sessionId = await pipeline.startSession('user123', 'guild456', 'channel789');
      const audioFrames = [createMockAudioFrame(960, 0)];

      // Agent fails
      const originalAgentCall = (pipeline as any).mockAgentCall;
      (pipeline as any).mockAgentCall = jest.fn().mockRejectedValue(new Error('Agent timeout'));

      mockTts.synthesize.mockResolvedValue({
        text: "I'm having trouble processing your request right now. Please try again.",
        audio: Buffer.alloc(36000),
        duration: 3000,
        voiceId: 'nova',
        stability: 0.5,
        similarity: 0.75,
        sampleRate: 48000,
        channels: 2,
        format: 'wav',
        timestamp: Date.now(),
      });

      // Should succeed with user-friendly fallback message
      const requestId = await pipeline.processVoiceCommand(sessionId, audioFrames);
      expect(requestId).toBeDefined();

      // Restore
      (pipeline as any).mockAgentCall = originalAgentCall;
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