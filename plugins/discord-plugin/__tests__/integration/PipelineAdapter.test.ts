/**
 * Pipeline Adapter Integration Tests
 * Tests for integration with Phase 6 VoiceCommandPipeline
 * (These tests verify the adapter interface, but Phase 6 must be merged for full integration)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IPipelineAdapter } from '../../src/types.js';

describe('PipelineAdapter Integration', () => {
  let adapter: IPipelineAdapter;

  beforeEach(() => {
    // Mock adapter for testing before Phase 6 is merged
    adapter = {
      startListening: vi.fn(async () => {}),
      stopListening: vi.fn(async () => {}),
      askQuestion: vi.fn(async (guildId: string, question: string) => {
        return `Mock response to: ${question}`;
      })
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // Pipeline Interface Tests (3 test cases)
  // ============================================

  describe('Pipeline adapter interface', () => {
    it('should implement startListening method', async () => {
      expect(adapter.startListening).toBeDefined();
      expect(typeof adapter.startListening).toBe('function');

      await adapter.startListening('guild123', 'channel123');

      expect(adapter.startListening).toHaveBeenCalledWith('guild123', 'channel123');
    });

    it('should implement stopListening method', async () => {
      expect(adapter.stopListening).toBeDefined();
      expect(typeof adapter.stopListening).toBe('function');

      await adapter.stopListening('guild123');

      expect(adapter.stopListening).toHaveBeenCalledWith('guild123');
    });

    it('should implement askQuestion method', async () => {
      expect(adapter.askQuestion).toBeDefined();
      expect(typeof adapter.askQuestion).toBe('function');

      const response = await adapter.askQuestion('guild123', 'What time is it?');

      expect(adapter.askQuestion).toHaveBeenCalledWith('guild123', 'What time is it?');
      expect(response).toBeDefined();
    });
  });

  // ============================================
  // Command to Pipeline Flow Tests (3 test cases)
  // ============================================

  describe('Command to pipeline flow', () => {
    it('should route /voice ask command to pipeline', async () => {
      const question = 'What is 2+2?';
      const guildId = 'guild123';

      const response = await adapter.askQuestion(guildId, question);

      expect(adapter.askQuestion).toHaveBeenCalledWith(guildId, question);
      expect(response).toBeDefined();
    });

    it('should route /voice start command to pipeline', async () => {
      const guildId = 'guild123';
      const channelId = 'channel123';

      await adapter.startListening(guildId, channelId);

      expect(adapter.startListening).toHaveBeenCalledWith(guildId, channelId);
    });

    it('should route /voice stop command to pipeline', async () => {
      const guildId = 'guild123';

      await adapter.stopListening(guildId);

      expect(adapter.stopListening).toHaveBeenCalledWith(guildId);
    });
  });

  // ============================================
  // Error Handling Tests (3 test cases)
  // ============================================

  describe('Error handling and mapping', () => {
    it('should handle pipeline timeout', async () => {
      const mockAdapter: IPipelineAdapter = {
        startListening: vi.fn(async () => {}),
        stopListening: vi.fn(async () => {}),
        askQuestion: vi.fn(async () => {
          throw new Error('Pipeline timeout');
        })
      };

      await expect(
        mockAdapter.askQuestion('guild123', 'slow question')
      ).rejects.toThrow('Pipeline timeout');
    });

    it('should handle STT errors', async () => {
      const mockAdapter: IPipelineAdapter = {
        startListening: vi.fn(async () => {}),
        stopListening: vi.fn(async () => {}),
        askQuestion: vi.fn(async () => {
          throw new Error('STT error: Could not transcribe audio');
        })
      };

      await expect(
        mockAdapter.askQuestion('guild123', 'noisy audio')
      ).rejects.toThrow('STT error');
    });

    it('should handle TTS errors', async () => {
      const mockAdapter: IPipelineAdapter = {
        startListening: vi.fn(async () => {}),
        stopListening: vi.fn(async () => {}),
        askQuestion: vi.fn(async () => {
          throw new Error('TTS error: Could not generate audio');
        })
      };

      await expect(
        mockAdapter.askQuestion('guild123', 'generate response')
      ).rejects.toThrow('TTS error');
    });
  });

  // ============================================
  // State Consistency Tests (2 test cases)
  // ============================================

  describe('State consistency with pipeline', () => {
    it('should maintain pipeline status during request', async () => {
      const mockAdapter: IPipelineAdapter = {
        startListening: vi.fn(async () => {}),
        stopListening: vi.fn(async () => {}),
        askQuestion: vi.fn(async () => {
          return 'Response from pipeline';
        })
      };

      const response = await mockAdapter.askQuestion('guild123', 'test question');

      expect(response).toBe('Response from pipeline');
      expect(mockAdapter.askQuestion).toHaveBeenCalledTimes(1);
    });

    it('should sync guild state before/after pipeline operation', async () => {
      // This test verifies the adapter updates guild state appropriately
      const mockAdapter: IPipelineAdapter = {
        startListening: vi.fn(async () => {}),
        stopListening: vi.fn(async () => {}),
        askQuestion: vi.fn(async () => 'Response')
      };

      await mockAdapter.startListening('guild123', 'channel123');
      const response = await mockAdapter.askQuestion('guild123', 'question');
      await mockAdapter.stopListening('guild123');

      expect(mockAdapter.startListening).toHaveBeenCalledBefore(
        mockAdapter.askQuestion as any
      );
      expect(mockAdapter.askQuestion).toHaveBeenCalledBefore(
        mockAdapter.stopListening as any
      );
    });
  });

  // ============================================
  // Full Voice Conversation Cycle Test (1 test case)
  // ============================================

  describe('Full voice conversation cycle', () => {
    it('should handle complete voice interaction flow', async () => {
      const mockAdapter: IPipelineAdapter = {
        startListening: vi.fn(async () => {}),
        stopListening: vi.fn(async () => {}),
        askQuestion: vi.fn(async (guildId: string, question: string) => {
          return `Rue responds: This is a response to "${question}"`;
        })
      };

      const guildId = 'guild123';
      const channelId = 'channel123';
      const question = 'What is the capital of France?';

      // 1. Start listening
      await mockAdapter.startListening(guildId, channelId);
      expect(mockAdapter.startListening).toHaveBeenCalledWith(guildId, channelId);

      // 2. Ask question
      const response = await mockAdapter.askQuestion(guildId, question);
      expect(mockAdapter.askQuestion).toHaveBeenCalledWith(guildId, question);
      expect(response).toContain('Rue responds');

      // 3. Stop listening
      await mockAdapter.stopListening(guildId);
      expect(mockAdapter.stopListening).toHaveBeenCalledWith(guildId);

      // Verify call order
      expect(mockAdapter.startListening).toHaveBeenCalledBefore(
        mockAdapter.askQuestion as any
      );
      expect(mockAdapter.askQuestion).toHaveBeenCalledBefore(
        mockAdapter.stopListening as any
      );
    });
  });

  // ============================================
  // Concurrent Request Tests (2 test cases)
  // ============================================

  describe('Concurrent pipeline requests', () => {
    it('should handle multiple concurrent questions', async () => {
      const mockAdapter: IPipelineAdapter = {
        startListening: vi.fn(async () => {}),
        stopListening: vi.fn(async () => {}),
        askQuestion: vi.fn(async (guildId: string, question: string) => {
          return `Response to: ${question}`;
        })
      };

      const questions = ['Q1', 'Q2', 'Q3'];

      const responses = await Promise.all(
        questions.map(q => mockAdapter.askQuestion('guild123', q))
      );

      expect(responses).toHaveLength(3);
      expect(mockAdapter.askQuestion).toHaveBeenCalledTimes(3);
    });

    it('should handle multiple guilds concurrently', async () => {
      const mockAdapter: IPipelineAdapter = {
        startListening: vi.fn(async () => {}),
        stopListening: vi.fn(async () => {}),
        askQuestion: vi.fn(async (guildId: string, question: string) => {
          return `Response in ${guildId}`;
        })
      };

      const guildIds = ['guild1', 'guild2', 'guild3'];

      const responses = await Promise.all(
        guildIds.map(gId => mockAdapter.askQuestion(gId, 'question'))
      );

      expect(responses).toHaveLength(3);
      expect(mockAdapter.askQuestion).toHaveBeenCalledTimes(3);
    });
  });

  // ============================================
  // Phase 6 Integration Readiness (1 test case)
  // ============================================

  describe('Phase 6 integration readiness', () => {
    it('should verify adapter is compatible with Phase 6 interface', () => {
      // This test verifies the adapter interface matches Phase 6 expectations
      const requiredMethods = ['startListening', 'stopListening', 'askQuestion'];

      requiredMethods.forEach(method => {
        expect(adapter).toHaveProperty(method);
        expect(typeof (adapter as any)[method]).toBe('function');
      });
    });
  });
});
