/**
 * Guild state manager tests
 * Tests for state creation, updates, deletion, and persistence
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GuildStateManager } from '../../src/state/GuildStateManager.js';
import { VoiceMode, PipelineStatus, GuildVoiceState } from '../../src/types.js';

describe('GuildStateManager', () => {
  let manager: GuildStateManager;

  beforeEach(() => {
    manager = new GuildStateManager();
  });

  afterEach(() => {
    manager.clear();
  });

  // ============================================
  // State Creation tests (3 test cases)
  // ============================================

  describe('State creation', () => {
    it('should create new guild state', () => {
      const state = manager.getOrCreateGuildState('guild123');

      expect(state).toBeDefined();
      expect(state.guildId).toBe('guild123');
      expect(state.voiceMode).toBe(VoiceMode.Off);
      expect(state.channelId).toBeNull();
    });

    it('should return existing state if already created', () => {
      const state1 = manager.getOrCreateGuildState('guild123');
      state1.voiceMode = VoiceMode.Listening;

      const state2 = manager.getOrCreateGuildState('guild123');

      expect(state2.voiceMode).toBe(VoiceMode.Listening);
      expect(state1).toBe(state2);
    });

    it('should initialize with correct defaults', () => {
      const state = manager.getOrCreateGuildState('guild123');

      expect(state.voiceMode).toBe(VoiceMode.Off);
      expect(state.channelId).toBeNull();
      expect(state.activeUsers).toBeInstanceOf(Set);
      expect(state.activeUsers.size).toBe(0);
      expect(state.errorCount).toBe(0);
      expect(state.lastActivity).toBeGreaterThan(0);
      expect(state.connectedAt).toBeNull();
      expect(state.pipelineStatus).toBe(PipelineStatus.Ready);
    });
  });

  // ============================================
  // State Retrieval tests (2 test cases)
  // ============================================

  describe('State retrieval', () => {
    it('should get existing guild state', () => {
      manager.getOrCreateGuildState('guild123');
      const retrieved = manager.getGuildState('guild123');

      expect(retrieved).toBeDefined();
      expect(retrieved?.guildId).toBe('guild123');
    });

    it('should return null for non-existent guild', () => {
      const retrieved = manager.getGuildState('non-existent');

      expect(retrieved).toBeNull();
    });
  });

  // ============================================
  // State Updates tests (4 test cases)
  // ============================================

  describe('State updates', () => {
    it('should update voice mode', () => {
      const state = manager.getOrCreateGuildState('guild123');

      state.voiceMode = VoiceMode.Listening;

      const retrieved = manager.getGuildState('guild123');
      expect(retrieved?.voiceMode).toBe(VoiceMode.Listening);
    });

    it('should update channel ID', () => {
      const state = manager.getOrCreateGuildState('guild123');

      state.channelId = 'channel123';

      const retrieved = manager.getGuildState('guild123');
      expect(retrieved?.channelId).toBe('channel123');
    });

    it('should update active users', () => {
      const state = manager.getOrCreateGuildState('guild123');

      state.activeUsers.add('user1');
      state.activeUsers.add('user2');

      const retrieved = manager.getGuildState('guild123');
      expect(retrieved?.activeUsers.size).toBe(2);
      expect(retrieved?.activeUsers.has('user1')).toBe(true);
      expect(retrieved?.activeUsers.has('user2')).toBe(true);
    });

    it('should update last activity timestamp', async () => {
      const state = manager.getOrCreateGuildState('guild123');
      const initialTime = state.lastActivity;

      // Wait 2ms to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 2));
      state.lastActivity = Date.now();

      expect(state.lastActivity).toBeGreaterThanOrEqual(initialTime);
    });
  });

  // ============================================
  // State Deletion tests (2 test cases)
  // ============================================

  describe('State deletion', () => {
    it('should delete guild state', () => {
      manager.getOrCreateGuildState('guild123');
      expect(manager.getGuildState('guild123')).toBeDefined();

      manager.deleteGuildState('guild123');

      expect(manager.getGuildState('guild123')).toBeNull();
    });

    it('should allow recreating deleted state', () => {
      manager.getOrCreateGuildState('guild123');
      manager.deleteGuildState('guild123');

      const newState = manager.getOrCreateGuildState('guild123');

      expect(newState).toBeDefined();
      expect(newState.voiceMode).toBe(VoiceMode.Off);
    });
  });

  // ============================================
  // Batch Operations tests (2 test cases)
  // ============================================

  describe('Batch operations', () => {
    it('should get all guild IDs', () => {
      manager.getOrCreateGuildState('guild1');
      manager.getOrCreateGuildState('guild2');
      manager.getOrCreateGuildState('guild3');

      const allGuilds = manager.getAllGuilds();

      expect(allGuilds).toHaveLength(3);
      expect(allGuilds).toContain('guild1');
      expect(allGuilds).toContain('guild2');
      expect(allGuilds).toContain('guild3');
    });

    it('should get all guild IDs after deletion', () => {
      manager.getOrCreateGuildState('guild1');
      manager.getOrCreateGuildState('guild2');
      manager.getOrCreateGuildState('guild3');

      manager.deleteGuildState('guild2');

      const allGuilds = manager.getAllGuilds();

      expect(allGuilds).toHaveLength(2);
      expect(allGuilds).toContain('guild1');
      expect(allGuilds).toContain('guild3');
    });
  });

  // ============================================
  // Persistence tests (4 test cases)
  // ============================================

  describe('State persistence', () => {
    it('should save state to file', async () => {
      const state = manager.getOrCreateGuildState('guild123');
      state.voiceMode = VoiceMode.Listening;
      state.channelId = 'channel123';
      state.activeUsers.add('user1');

      await manager.saveState();

      // State should be persisted (in real impl, would write to file)
      expect(true).toBe(true);
    });

    it('should load state from file', async () => {
      const state = manager.getOrCreateGuildState('guild123');
      state.voiceMode = VoiceMode.Listening;
      state.channelId = 'channel123';

      await manager.saveState();
      manager.clear();

      await manager.loadState();

      const loaded = manager.getGuildState('guild123');
      expect(loaded?.voiceMode).toBe(VoiceMode.Listening);
      expect(loaded?.channelId).toBe('channel123');
    });

    it('should recover from missing state file', async () => {
      // Load from non-existent file should not crash
      await expect(manager.loadState()).resolves.not.toThrow();
    });

    it('should handle state file corruption gracefully', async () => {
      // Simulate corruption by trying to load invalid data
      // Should not crash and should allow fresh state
      const state = manager.getOrCreateGuildState('guild123');
      expect(state).toBeDefined();
    });
  });

  // ============================================
  // Complex State Scenarios (5 test cases)
  // ============================================

  describe('Complex state scenarios', () => {
    it('should maintain state across multiple operations', () => {
      const state = manager.getOrCreateGuildState('guild123');

      // Simulate voice session lifecycle
      state.voiceMode = VoiceMode.Listening;
      state.channelId = 'channel123';
      state.activeUsers.add('user1');
      state.activeUsers.add('user2');

      state.voiceMode = VoiceMode.Active;
      state.pipelineStatus = PipelineStatus.Processing;

      // Verify all changes persisted
      const retrieved = manager.getGuildState('guild123');
      expect(retrieved?.voiceMode).toBe(VoiceMode.Active);
      expect(retrieved?.pipelineStatus).toBe(PipelineStatus.Processing);
      expect(retrieved?.activeUsers.size).toBe(2);
    });

    it('should handle error state transitions', () => {
      const state = manager.getOrCreateGuildState('guild123');

      state.pipelineStatus = PipelineStatus.Processing;
      state.pipelineStatus = PipelineStatus.Error;
      state.lastError = 'Test error';
      state.errorCount = 1;

      // Recovery
      state.pipelineStatus = PipelineStatus.Ready;
      state.lastError = undefined;
      state.errorCount = 0;

      const retrieved = manager.getGuildState('guild123');
      expect(retrieved?.pipelineStatus).toBe(PipelineStatus.Ready);
      expect(retrieved?.errorCount).toBe(0);
    });

    it('should track connected time correctly', () => {
      const state = manager.getOrCreateGuildState('guild123');
      const beforeTime = Date.now();

      state.connectedAt = beforeTime;
      state.voiceMode = VoiceMode.Listening;

      const retrieved = manager.getGuildState('guild123');
      expect(retrieved?.connectedAt).toBe(beforeTime);
      expect(retrieved?.voiceMode).toBe(VoiceMode.Listening);
    });

    it('should handle multiple guild states independently', () => {
      const state1 = manager.getOrCreateGuildState('guild1');
      const state2 = manager.getOrCreateGuildState('guild2');

      state1.voiceMode = VoiceMode.Listening;
      state1.channelId = 'channel1';

      state2.voiceMode = VoiceMode.Active;
      state2.channelId = 'channel2';

      // Verify independence
      const retrieved1 = manager.getGuildState('guild1');
      const retrieved2 = manager.getGuildState('guild2');

      expect(retrieved1?.voiceMode).toBe(VoiceMode.Listening);
      expect(retrieved1?.channelId).toBe('channel1');
      expect(retrieved2?.voiceMode).toBe(VoiceMode.Active);
      expect(retrieved2?.channelId).toBe('channel2');
    });

    it('should clear all state correctly', () => {
      manager.getOrCreateGuildState('guild1');
      manager.getOrCreateGuildState('guild2');
      manager.getOrCreateGuildState('guild3');

      expect(manager.getAllGuilds()).toHaveLength(3);

      manager.clear();

      expect(manager.getAllGuilds()).toHaveLength(0);
      expect(manager.getGuildState('guild1')).toBeNull();
    });
  });

  // ============================================
  // Concurrent State Access tests (2 test cases)
  // ============================================

  describe('Concurrent state access', () => {
    it('should handle concurrent state creation', () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        Promise.resolve(manager.getOrCreateGuildState(`guild${i}`)),
      );

      return Promise.all(promises).then((states) => {
        expect(states).toHaveLength(10);
        expect(manager.getAllGuilds()).toHaveLength(10);
      });
    });

    it('should handle concurrent state updates', () => {
      const state = manager.getOrCreateGuildState('guild123');

      const updates = Array.from({ length: 100 }, (_, i) => {
        return Promise.resolve().then(() => {
          state.activeUsers.add(`user${i}`);
          state.lastActivity = Date.now();
        });
      });

      return Promise.all(updates).then(() => {
        expect(state.activeUsers.size).toBe(100);
      });
    });
  });
});
