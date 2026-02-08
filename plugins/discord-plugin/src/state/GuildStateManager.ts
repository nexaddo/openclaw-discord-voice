/**
 * Guild State Manager
 * Manages persistent guild voice state
 */

import { GuildVoiceState, StoredGuildVoiceState, VoiceMode, PipelineStatus, IStateManager } from '../types.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Manages voice state for Discord guilds
 */
export class GuildStateManager implements IStateManager {
  private states: Map<string, GuildVoiceState> = new Map();
  private stateFile: string;
  private saveInterval?: NodeJS.Timeout;

  constructor(stateFile?: string) {
    this.stateFile = stateFile || join(homedir(), '.openclaw', 'data', 'guild-voice-states.json');
  }

  /**
   * Get or create guild state
   */
  getOrCreateGuildState(guildId: string): GuildVoiceState {
    if (this.states.has(guildId)) {
      return this.states.get(guildId)!;
    }

    const state: GuildVoiceState = {
      guildId,
      channelId: null,
      voiceMode: VoiceMode.Off,
      connectedAt: null,
      activeUsers: new Set(),
      lastActivity: Date.now(),
      pipelineStatus: PipelineStatus.Ready,
      errorCount: 0
    };

    this.states.set(guildId, state);
    return state;
  }

  /**
   * Get guild state without creating
   */
  getGuildState(guildId: string): GuildVoiceState | null {
    return this.states.get(guildId) ?? null;
  }

  /**
   * Set/update guild state
   */
  setGuildState(guildId: string, state: GuildVoiceState): void {
    this.states.set(guildId, state);
  }

  /**
   * Delete guild state
   */
  deleteGuildState(guildId: string): void {
    this.states.delete(guildId);
  }

  /**
   * Get all guild IDs
   */
  getAllGuilds(): string[] {
    return Array.from(this.states.keys());
  }

  /**
   * Save state to file
   */
  async saveState(): Promise<void> {
    try {
      const toSave: Record<string, StoredGuildVoiceState> = {};

      for (const [guildId, state] of this.states.entries()) {
        toSave[guildId] = {
          guildId: state.guildId,
          channelId: state.channelId,
          voiceMode: state.voiceMode,
          connectedAt: state.connectedAt,
          activeUsers: Array.from(state.activeUsers),
          lastActivity: state.lastActivity,
          pipelineStatus: state.pipelineStatus,
          errorCount: state.errorCount,
          lastError: state.lastError
        };
      }

      const dir = this.stateFile.substring(0, this.stateFile.lastIndexOf('/'));
      if (!existsSync(dir)) {
        // In real implementation, use fs.mkdirSync with recursive option
        try {
          require('node:fs').mkdirSync(dir, { recursive: true });
        } catch (e) {
          // Directory may already exist
        }
      }

      writeFileSync(this.stateFile, JSON.stringify(toSave, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save guild state:', error);
      // Don't throw, allow application to continue
    }
  }

  /**
   * Load state from file
   */
  async loadState(): Promise<void> {
    try {
      if (!existsSync(this.stateFile)) {
        return;
      }

      const data = readFileSync(this.stateFile, 'utf-8');
      const parsed = JSON.parse(data) as Record<string, StoredGuildVoiceState>;

      for (const [guildId, stored] of Object.entries(parsed)) {
        const state: GuildVoiceState = {
          guildId: stored.guildId,
          channelId: stored.channelId,
          voiceMode: stored.voiceMode,
          connectedAt: stored.connectedAt,
          activeUsers: new Set(stored.activeUsers),
          lastActivity: stored.lastActivity,
          pipelineStatus: stored.pipelineStatus,
          errorCount: stored.errorCount,
          lastError: stored.lastError
        };

        this.states.set(guildId, state);
      }
    } catch (error) {
      console.error('Failed to load guild state:', error);
      // Don't throw, allow application to continue
    }
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.states.clear();
  }

  /**
   * Start auto-save interval
   */
  startAutoSave(intervalMs: number = 30000): void {
    this.saveInterval = setInterval(() => {
      this.saveState().catch(err => console.error('Auto-save failed:', err));
    }, intervalMs);
  }

  /**
   * Stop auto-save interval
   */
  stopAutoSave(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = undefined;
    }
  }
}
