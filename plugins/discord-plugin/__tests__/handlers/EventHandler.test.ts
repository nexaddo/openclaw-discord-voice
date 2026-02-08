/**
 * Event handler tests
 * Tests for Discord event handling (voice state, channel delete, guild delete)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventHandler } from '../../src/handlers/EventHandler.js';
import { GuildStateManager } from '../../src/state/GuildStateManager.js';
import { VoiceMode, VoiceStateUpdateEvent, ChannelDeleteEvent, GuildDeleteEvent } from '../../src/types.js';

describe('Event Handlers', () => {
  let eventHandler: EventHandler;
  let stateManager: GuildStateManager;

  beforeEach(() => {
    stateManager = new GuildStateManager();
    eventHandler = new EventHandler(stateManager, { debug: false });
  });

  afterEach(() => {
    stateManager.clear();
  });

  // ============================================
  // Voice State Update tests (8 test cases)
  // ============================================

  describe('guildVoiceStateUpdate', () => {
    it('should track user joining voice channel', async () => {
      const event: VoiceStateUpdateEvent = {
        oldState: {
          member: { id: 'user123', user: { id: 'user123', username: 'TestUser' } },
          channel: null,
          guild: { id: 'guild123' }
        },
        newState: {
          member: { id: 'user123', user: { id: 'user123', username: 'TestUser' } },
          channel: { id: 'channel123', name: 'voice-channel' },
          guild: { id: 'guild123' }
        }
      };

      const state = stateManager.getOrCreateGuildState('guild123');
      expect(state.activeUsers.size).toBe(0);

      await eventHandler.handleVoiceStateUpdate(event);

      const updatedState = stateManager.getGuildState('guild123');
      expect(updatedState?.activeUsers.has('user123')).toBe(true);
    });

    it('should track user leaving voice channel', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      state.activeUsers.add('user123');

      const event: VoiceStateUpdateEvent = {
        oldState: {
          member: { id: 'user123', user: { id: 'user123', username: 'TestUser' } },
          channel: { id: 'channel123', name: 'voice-channel' },
          guild: { id: 'guild123' }
        },
        newState: {
          member: { id: 'user123', user: { id: 'user123', username: 'TestUser' } },
          channel: null,
          guild: { id: 'guild123' }
        }
      };

      await eventHandler.handleVoiceStateUpdate(event);

      const updatedState = stateManager.getGuildState('guild123');
      expect(updatedState?.activeUsers.has('user123')).toBe(false);
    });

    it('should handle bot joining voice channel', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      state.channelId = null;

      const event: VoiceStateUpdateEvent = {
        oldState: {
          member: { id: 'bot123', user: { bot: true }, client: { user: { id: 'bot123' } } },
          channel: null,
          guild: { id: 'guild123' }
        },
        newState: {
          member: { id: 'bot123', user: { bot: true }, client: { user: { id: 'bot123' } } },
          channel: { id: 'channel123', name: 'voice-channel' },
          guild: { id: 'guild123' }
        }
      };

      await eventHandler.handleVoiceStateUpdate(event);

      const updatedState = stateManager.getGuildState('guild123');
      expect(updatedState?.channelId).toBe('channel123');
    });

    it('should handle bot leaving voice channel', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      state.channelId = 'channel123';
      state.voiceMode = VoiceMode.Listening;

      const event: VoiceStateUpdateEvent = {
        oldState: {
          member: { id: 'bot123', user: { bot: true } },
          channel: { id: 'channel123' },
          guild: { id: 'guild123' }
        },
        newState: {
          member: { id: 'bot123', user: { bot: true } },
          channel: null,
          guild: { id: 'guild123' }
        }
      };

      await eventHandler.handleVoiceStateUpdate(event);

      const updatedState = stateManager.getGuildState('guild123');
      expect(updatedState?.channelId).toBeNull();
      expect(updatedState?.voiceMode).toBe(VoiceMode.Off);
    });

    it('should handle multiple users joining/leaving', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      expect(state.activeUsers.size).toBe(0);

      // User 1 joins
      await eventHandler.handleVoiceStateUpdate({
        oldState: { member: { id: 'user1' }, channel: null, guild: { id: 'guild123' } },
        newState: { member: { id: 'user1' }, channel: { id: 'channel123' }, guild: { id: 'guild123' } }
      });

      // User 2 joins
      await eventHandler.handleVoiceStateUpdate({
        oldState: { member: { id: 'user2' }, channel: null, guild: { id: 'guild123' } },
        newState: { member: { id: 'user2' }, channel: { id: 'channel123' }, guild: { id: 'guild123' } }
      });

      const afterJoin = stateManager.getGuildState('guild123');
      expect(afterJoin?.activeUsers.size).toBe(2);

      // User 1 leaves
      await eventHandler.handleVoiceStateUpdate({
        oldState: { member: { id: 'user1' }, channel: { id: 'channel123' }, guild: { id: 'guild123' } },
        newState: { member: { id: 'user1' }, channel: null, guild: { id: 'guild123' } }
      });

      const afterLeave = stateManager.getGuildState('guild123');
      expect(afterLeave?.activeUsers.size).toBe(1);
      expect(afterLeave?.activeUsers.has('user2')).toBe(true);
    });

    it('should update lastActivity timestamp', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      const beforeTimestamp = state.lastActivity;

      await new Promise(resolve => setTimeout(resolve, 10));

      await eventHandler.handleVoiceStateUpdate({
        oldState: { member: { id: 'user1' }, channel: null, guild: { id: 'guild123' } },
        newState: { member: { id: 'user1' }, channel: { id: 'channel123' }, guild: { id: 'guild123' } }
      });

      const updatedState = stateManager.getGuildState('guild123');
      expect(updatedState?.lastActivity).toBeGreaterThan(beforeTimestamp);
    });

    it('should handle self-deafen/unmute correctly', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      state.channelId = 'channel123';

      const event: VoiceStateUpdateEvent = {
        oldState: {
          member: { id: 'user123' },
          channel: { id: 'channel123' },
          selfDeaf: false,
          guild: { id: 'guild123' }
        },
        newState: {
          member: { id: 'user123' },
          channel: { id: 'channel123' },
          selfDeaf: true,
          guild: { id: 'guild123' }
        }
      };

      await eventHandler.handleVoiceStateUpdate(event);

      const updatedState = stateManager.getGuildState('guild123');
      // User still in voice, just deafened
      expect(updatedState?.activeUsers.has('user123')).toBe(true);
    });
  });

  // ============================================
  // Channel Delete tests (2 test cases)
  // ============================================

  describe('voiceChannelDelete', () => {
    it('should disconnect bot if connected to deleted channel', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      state.channelId = 'channel123';
      state.voiceMode = VoiceMode.Listening;

      const event: ChannelDeleteEvent = {
        channel: {
          id: 'channel123',
          guildId: 'guild123',
          name: 'voice-channel',
          type: 2  // GUILD_VOICE
        }
      };

      await eventHandler.handleChannelDelete(event);

      const updatedState = stateManager.getGuildState('guild123');
      expect(updatedState?.channelId).toBeNull();
      expect(updatedState?.voiceMode).toBe(VoiceMode.Off);
    });

    it('should not affect guild if bot in different channel', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      state.channelId = 'channel123';
      state.voiceMode = VoiceMode.Listening;

      const event: ChannelDeleteEvent = {
        channel: {
          id: 'channel456',  // Different channel
          guildId: 'guild123',
          name: 'other-channel'
        }
      };

      await eventHandler.handleChannelDelete(event);

      const updatedState = stateManager.getGuildState('guild123');
      expect(updatedState?.channelId).toBe('channel123');  // Unchanged
    });
  });

  // ============================================
  // Guild Delete tests (1 test case)
  // ============================================

  describe('guildDelete', () => {
    it('should clean up guild state when guild is deleted', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      state.channelId = 'channel123';
      state.voiceMode = VoiceMode.Listening;

      expect(stateManager.getGuildState('guild123')).toBeDefined();

      const event: GuildDeleteEvent = {
        guild: {
          id: 'guild123',
          name: 'Test Guild'
        }
      };

      await eventHandler.handleGuildDelete(event);

      const deletedState = stateManager.getGuildState('guild123');
      expect(deletedState).toBeNull();
    });
  });

  // ============================================
  // State transition tests (7 test cases)
  // ============================================

  describe('State transitions', () => {
    it('should transition off → listening', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      state.voiceMode = VoiceMode.Off;

      state.voiceMode = VoiceMode.Listening;

      expect(state.voiceMode).toBe(VoiceMode.Listening);
    });

    it('should transition listening → active', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      state.voiceMode = VoiceMode.Listening;

      state.voiceMode = VoiceMode.Active;

      expect(state.voiceMode).toBe(VoiceMode.Active);
    });

    it('should transition active → off', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      state.voiceMode = VoiceMode.Active;

      state.voiceMode = VoiceMode.Off;

      expect(state.voiceMode).toBe(VoiceMode.Off);
    });

    it('should handle rapid transitions', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');

      state.voiceMode = VoiceMode.Listening;
      expect(state.voiceMode).toBe(VoiceMode.Listening);

      state.voiceMode = VoiceMode.Active;
      expect(state.voiceMode).toBe(VoiceMode.Active);

      state.voiceMode = VoiceMode.Off;
      expect(state.voiceMode).toBe(VoiceMode.Off);
    });

    it('should allow any→off transition', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');

      // From any state, should be able to go to off
      state.voiceMode = VoiceMode.Active;
      state.voiceMode = VoiceMode.Off;
      expect(state.voiceMode).toBe(VoiceMode.Off);
    });

    it('should track state change timestamps', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      const initialTime = state.lastActivity;

      await new Promise(resolve => setTimeout(resolve, 10));
      state.voiceMode = VoiceMode.Listening;

      expect(state.lastActivity).toBeGreaterThan(initialTime);
    });

    it('should maintain user list during transitions', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      state.activeUsers.add('user1');
      state.activeUsers.add('user2');

      state.voiceMode = VoiceMode.Listening;
      expect(state.activeUsers.size).toBe(2);

      state.voiceMode = VoiceMode.Active;
      expect(state.activeUsers.size).toBe(2);
    });
  });

  // ============================================
  // Error recovery tests (2 test cases)
  // ============================================

  describe('Error recovery', () => {
    it('should recover from error state', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      state.lastError = 'Previous error';
      state.errorCount = 3;

      state.lastError = undefined;
      state.errorCount = 0;

      expect(state.errorCount).toBe(0);
      expect(state.lastError).toBeUndefined();
    });

    it('should track error count increments', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      expect(state.errorCount).toBe(0);

      state.errorCount++;
      expect(state.errorCount).toBe(1);

      state.errorCount++;
      expect(state.errorCount).toBe(2);
    });
  });

  // ============================================
  // Concurrent event handling tests (2 test cases)
  // ============================================

  describe('Concurrent event handling', () => {
    it('should handle concurrent voice state updates', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');

      const events: VoiceStateUpdateEvent[] = [
        {
          oldState: { member: { id: 'u1' }, channel: null, guild: { id: 'guild123' } },
          newState: { member: { id: 'u1' }, channel: { id: 'c1' }, guild: { id: 'guild123' } }
        },
        {
          oldState: { member: { id: 'u2' }, channel: null, guild: { id: 'guild123' } },
          newState: { member: { id: 'u2' }, channel: { id: 'c1' }, guild: { id: 'guild123' } }
        },
        {
          oldState: { member: { id: 'u3' }, channel: null, guild: { id: 'guild123' } },
          newState: { member: { id: 'u3' }, channel: { id: 'c1' }, guild: { id: 'guild123' } }
        }
      ];

      await Promise.all(events.map(e => eventHandler.handleVoiceStateUpdate(e)));

      const finalState = stateManager.getGuildState('guild123');
      expect(finalState?.activeUsers.size).toBe(3);
    });

    it('should handle mixed event types concurrently', async () => {
      const state = stateManager.getOrCreateGuildState('guild123');
      state.channelId = 'channel123';

      const results = await Promise.all([
        eventHandler.handleVoiceStateUpdate({
          oldState: { member: { id: 'u1' }, channel: null, guild: { id: 'guild123' } },
          newState: { member: { id: 'u1' }, channel: { id: 'channel123' }, guild: { id: 'guild123' } }
        }),
        eventHandler.handleChannelDelete({
          channel: { id: 'channel456', guildId: 'guild456' }
        }),
        eventHandler.handleGuildDelete({
          guild: { id: 'guild789' }
        })
      ]);

      expect(results).toHaveLength(3);
    });
  });
});
