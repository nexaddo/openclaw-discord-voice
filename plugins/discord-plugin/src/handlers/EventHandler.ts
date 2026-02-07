/**
 * Event Handler
 * Handles Discord events for voice integration
 */

import {
  VoiceStateUpdateEvent,
  ChannelDeleteEvent,
  GuildDeleteEvent,
  VoiceMode,
  IEventHandler,
  DiscordPluginConfig
} from '../types.js';
import { GuildStateManager } from '../state/GuildStateManager.js';

/**
 * Handles Discord voice-related events
 */
export class EventHandler implements IEventHandler {
  private stateManager: GuildStateManager;
  private config: DiscordPluginConfig;

  constructor(stateManager: GuildStateManager, config: DiscordPluginConfig = {}) {
    this.stateManager = stateManager;
    this.config = {
      debug: false,
      ...config
    };
  }

  /**
   * Handle guild voice state update
   * Fires when a user joins/leaves a voice channel
   */
  async handleVoiceStateUpdate(event: VoiceStateUpdateEvent): Promise<void> {
    try {
      const oldChannel = event.oldState?.channel?.id;
      const newChannel = event.newState?.channel?.id;
      const userId = event.newState?.member?.id || event.oldState?.member?.id;
      const guildId = event.newState?.guild?.id || event.oldState?.guild?.id;

      if (!guildId) return;

      const state = this.stateManager.getOrCreateGuildState(guildId);

      // Check if this is the bot
      const botId = event.newState?.member?.user?.bot ? event.newState?.member?.id : null;
      const isBot = botId === userId;

      if (isBot && event.newState?.member?.user?.bot) {
        // Bot joined a voice channel
        if (newChannel && !oldChannel) {
          state.channelId = newChannel;
          state.connectedAt = Date.now();

          if (this.config.debug) {
            console.log(`[DEBUG] Bot joined voice channel ${newChannel} in guild ${guildId}`);
          }
        }
        // Bot left a voice channel
        else if (oldChannel && !newChannel) {
          state.channelId = null;
          state.voiceMode = VoiceMode.Off;
          state.activeUsers.clear();
          state.connectedAt = null;

          if (this.config.debug) {
            console.log(`[DEBUG] Bot left voice channel in guild ${guildId}`);
          }
        }
      } else {
        // Regular user joined voice channel
        if (newChannel && !oldChannel) {
          state.activeUsers.add(userId);
          state.lastActivity = Date.now();

          if (this.config.debug) {
            console.log(`[DEBUG] User ${userId} joined voice in guild ${guildId}`);
          }
        }
        // User left voice channel
        else if (oldChannel && !newChannel) {
          state.activeUsers.delete(userId);
          state.lastActivity = Date.now();

          if (this.config.debug) {
            console.log(`[DEBUG] User ${userId} left voice in guild ${guildId}`);
          }
        }
      }

      // Save state after update
      await this.stateManager.saveState();
    } catch (error) {
      console.error('Error handling voice state update:', error);
    }
  }

  /**
   * Handle channel delete event
   * Fires when a voice channel is deleted
   */
  async handleChannelDelete(event: ChannelDeleteEvent): Promise<void> {
    try {
      const channelId = event.channel?.id;
      const guildId = event.channel?.guildId;

      if (!guildId || !channelId) return;

      const state = this.stateManager.getGuildState(guildId);

      if (state && state.channelId === channelId) {
        // Bot was connected to the deleted channel
        state.channelId = null;
        state.voiceMode = VoiceMode.Off;
        state.activeUsers.clear();
        state.connectedAt = null;

        if (this.config.debug) {
          console.log(`[DEBUG] Voice channel ${channelId} deleted in guild ${guildId}`);
        }

        await this.stateManager.saveState();
      }
    } catch (error) {
      console.error('Error handling channel delete:', error);
    }
  }

  /**
   * Handle guild delete event
   * Fires when the bot is removed from a guild
   */
  async handleGuildDelete(event: GuildDeleteEvent): Promise<void> {
    try {
      const guildId = event.guild?.id;

      if (!guildId) return;

      // Clean up all state for this guild
      this.stateManager.deleteGuildState(guildId);

      if (this.config.debug) {
        console.log(`[DEBUG] Guild ${guildId} deleted, cleaned up state`);
      }

      await this.stateManager.saveState();
    } catch (error) {
      console.error('Error handling guild delete:', error);
    }
  }
}
