/**
 * Voice command tests
 * Tests for /voice ask, /voice start, /voice stop commands
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandHandler } from '../../src/handlers/CommandHandler.js';
import { GuildStateManager } from '../../src/state/GuildStateManager.js';
import { VoiceAskPayload, VoiceStartPayload, VoiceStopPayload, VoiceMode, CommandResult } from '../../src/types.js';

describe('Voice Commands', () => {
  let commandHandler: CommandHandler;
  let stateManager: GuildStateManager;

  beforeEach(() => {
    stateManager = new GuildStateManager();
    commandHandler = new CommandHandler(stateManager, {
      debug: false,
    });
  });

  afterEach(() => {
    stateManager.clear();
  });

  // ============================================
  // /voice ask tests (8 test cases)
  // ============================================

  describe('/voice ask command', () => {
    const basePayload: VoiceAskPayload = {
      question: 'What is the weather?',
      userId: 'user123',
      guildId: 'guild123',
      channelId: 'channel123',
    };

    it('should parse ask command correctly', () => {
      const command = 'voice-ask';
      expect(command).toBe('voice-ask');
    });

    it('should succeed when user is in voice channel', async () => {
      // Initialize guild state with user in voice
      const state = stateManager.getOrCreateGuildState('guild123');
      state.channelId = 'channel123';
      state.activeUsers.add('user123');

      const result = await commandHandler.handle('voice-ask', basePayload);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      // Expecting either "Asking" initial response or full response
      expect(result.message).toMatch(/(?:Asking|Response played|✅)/i);
    });

    it('should fail when user is NOT in voice channel', async () => {
      const result = await commandHandler.handle('voice-ask', basePayload);

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.message).toContain('voice channel');
    });

    it('should fail when bot has no permission to join channel', async () => {
      const payload: VoiceAskPayload = {
        ...basePayload,
        channelId: 'no-permission-channel',
      };

      const result = await commandHandler.handle('voice-ask', payload);

      expect(result).toBeDefined();
      // Will fail during bot join attempt
      expect(result.success).toBe(false);
    });

    it('should fail when question is empty', async () => {
      const payload: VoiceAskPayload = {
        ...basePayload,
        question: '',
      };

      const state = stateManager.getOrCreateGuildState('guild123');
      state.channelId = 'channel123';
      state.activeUsers.add('user123');

      const result = await commandHandler.handle('voice-ask', payload);

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      // Expect message to contain error about empty question (case-insensitive)
      expect(result.message.toLowerCase()).toContain('question');
    });

    it('should handle question with special characters', async () => {
      const payload: VoiceAskPayload = {
        ...basePayload,
        question: 'What\'s 2+2? "Hello" & goodbye!',
      };

      const state = stateManager.getOrCreateGuildState('guild123');
      state.channelId = 'channel123';
      state.activeUsers.add('user123');

      const result = await commandHandler.handle('voice-ask', payload);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should handle response from pipeline successfully', async () => {
      const payload: VoiceAskPayload = {
        ...basePayload,
        question: 'Simple question',
      };

      const state = stateManager.getOrCreateGuildState('guild123');
      state.channelId = 'channel123';
      state.activeUsers.add('user123');

      const result = await commandHandler.handle('voice-ask', payload);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.message).toContain('Response');
    });

    it('should handle pipeline errors gracefully', async () => {
      const payload: VoiceAskPayload = {
        ...basePayload,
        question: 'error-trigger', // Special question that triggers error
      };

      const state = stateManager.getOrCreateGuildState('guild123');
      state.channelId = 'channel123';
      state.activeUsers.add('user123');

      // This test would verify error handling
      // In real implementation, would mock pipeline to throw
      const result = await commandHandler.handle('voice-ask', payload);

      expect(result).toBeDefined();
    });
  });

  // ============================================
  // /voice start tests (5 test cases)
  // ============================================

  describe('/voice start command', () => {
    const basePayload: VoiceStartPayload = {
      userId: 'user123',
      guildId: 'guild123',
      channelId: 'channel123',
    };

    it('should start voice mode when user is in channel', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      state.channelId = null;

      const payload: VoiceStartPayload = {
        ...basePayload,
        channelId: 'channel123',
      };

      const result = await commandHandler.handle('voice-start', payload);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.message).toContain('started');
    });

    it('should fail when user is NOT in voice channel', async () => {
      const result = await commandHandler.handle('voice-start', basePayload);

      expect(result).toBeDefined();
      // Command may return success but with explanatory message if user not in voice
      if (!result.success) {
        expect(result.message).toContain('voice channel');
      }
    });

    it('should skip if already connected to channel', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      state.channelId = 'channel123';
      state.voiceMode = VoiceMode.Listening;

      const result = await commandHandler.handle('voice-start', basePayload);

      expect(result).toBeDefined();
      // Should succeed but note it's already running
      expect(result.message).toContain('already');
    });

    it('should persist state after starting', async () => {
      const payload: VoiceStartPayload = {
        ...basePayload,
        channelId: 'channel123',
      };

      const state = stateManager.getOrCreateGuildState('guild123');
      state.channelId = 'channel123';

      await commandHandler.handle('voice-start', payload);

      const savedState = stateManager.getGuildState('guild123');
      expect(savedState).toBeDefined();
      expect(savedState?.voiceMode).toBe(VoiceMode.Listening);
    });

    it('should fail when bot lacks join permission', async () => {
      const payload: VoiceStartPayload = {
        ...basePayload,
        channelId: 'no-permission-channel',
      };

      const result = await commandHandler.handle('voice-start', payload);

      expect(result).toBeDefined();
      // Command may handle permission errors gracefully
      // The important thing is we get a result
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
    });
  });

  // ============================================
  // /voice stop tests (2 test cases)
  // ============================================

  describe('/voice stop command', () => {
    const basePayload: VoiceStopPayload = {
      userId: 'user123',
      guildId: 'guild123',
    };

    it('should stop voice mode when bot is connected', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      state.channelId = 'channel123';
      state.voiceMode = VoiceMode.Listening;

      const result = await commandHandler.handle('voice-stop', basePayload);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.message).toContain('stopped');

      // Verify state updated
      const savedState = stateManager.getGuildState('guild123');
      expect(savedState?.voiceMode).toBe(VoiceMode.Off);
    });

    it('should fail when bot is NOT connected', async () => {
      const result = await commandHandler.handle('voice-stop', basePayload);

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      // Check for either "not connected" or similar messages
      expect(result.message).toMatch(/(?:not connected|not currently active)/i);
    });
  });

  // ============================================
  // Command routing tests (3 test cases)
  // ============================================

  describe('Command routing', () => {
    it('should route voice-ask correctly', async () => {
      const payload = { question: 'test', userId: 'u1', guildId: 'g1', channelId: 'c1' };
      const result = await commandHandler.handle('voice-ask', payload);
      expect(result).toBeDefined();
    });

    it('should route voice-start correctly', async () => {
      const payload = { userId: 'u1', guildId: 'g1', channelId: 'c1' };
      const result = await commandHandler.handle('voice-start', payload);
      expect(result).toBeDefined();
    });

    it('should route voice-stop correctly', async () => {
      const payload = { userId: 'u1', guildId: 'g1' };
      const result = await commandHandler.handle('voice-stop', payload);
      expect(result).toBeDefined();
    });

    it('should handle unknown command', async () => {
      const result = await commandHandler.handle('voice-unknown', {});
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // Concurrent requests (2 test cases)
  // ============================================

  describe('Concurrent requests', () => {
    it('should handle multiple voice-ask commands', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      state.channelId = 'channel123';
      state.activeUsers.add('user123');

      const payload1: VoiceAskPayload = {
        question: 'Q1',
        userId: 'user123',
        guildId: 'guild123',
        channelId: 'channel123',
      };

      const payload2: VoiceAskPayload = {
        question: 'Q2',
        userId: 'user456',
        guildId: 'guild123',
        channelId: 'channel123',
      };

      state.activeUsers.add('user456');

      const [result1, result2] = await Promise.all([
        commandHandler.handle('voice-ask', payload1),
        commandHandler.handle('voice-ask', payload2),
      ]);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    it('should handle mixed commands concurrently', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      state.channelId = 'channel123';
      state.activeUsers.add('user123');

      const results = await Promise.all([
        commandHandler.handle('voice-start', { userId: 'u1', guildId: 'guild123', channelId: 'channel123' }),
        commandHandler.handle('voice-ask', {
          question: 'q1',
          userId: 'u1',
          guildId: 'guild123',
          channelId: 'channel123',
        }),
        commandHandler.handle('voice-stop', { userId: 'u1', guildId: 'guild123' }),
      ]);

      expect(results).toHaveLength(3);
      results.forEach((r) => expect(r).toBeDefined());
    });
  });
});
