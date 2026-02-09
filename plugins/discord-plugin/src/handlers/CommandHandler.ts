/**
 * Command Handler
 * Routes and handles Discord slash commands
 */

import {
  CommandResult,
  VoiceAskPayload,
  VoiceStartPayload,
  VoiceStopPayload,
  VoiceMode,
  PipelineStatus,
  DiscordPluginError,
  DiscordPluginErrorType,
  ICommandHandler,
 DiscordPluginConfig } from '../types.js';
import { GuildStateManager } from '../state/GuildStateManager.js';

/**
 * Handles voice commands
 */
export class CommandHandler implements ICommandHandler {
  private stateManager: GuildStateManager;

  private config: DiscordPluginConfig;

  constructor(stateManager: GuildStateManager, config: DiscordPluginConfig = {}) {
    this.stateManager = stateManager;
    this.config = {
      debug: false,
      ...config,
    };
  }

  /**
   * Main command handler
   */
  async handle(command: string, payload: any): Promise<CommandResult> {
    try {
      switch (command) {
        case 'voice-ask':
          return await this.handleVoiceAsk(payload as VoiceAskPayload);
        case 'voice-start':
          return await this.handleVoiceStart(payload as VoiceStartPayload);
        case 'voice-stop':
          return await this.handleVoiceStop(payload as VoiceStopPayload);
        default:
          return {
            success: false,
            message: `Unknown command: ${command}`,
            error: new DiscordPluginError(DiscordPluginErrorType.CommandNotFound, `Unknown command: ${command}`),
          };
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        error: error as Error,
      };
    }
  }

  /**
   * Handle /voice ask command
   */
  private async handleVoiceAsk(payload: VoiceAskPayload): Promise<CommandResult> {
    try {
      // Validate question
      if (!payload.question || payload.question.trim().length === 0) {
        return {
          success: false,
          message: 'Question cannot be empty',
        };
      }

      // Get guild state
      const state = this.stateManager.getOrCreateGuildState(payload.guildId);

      // Check if user is in voice channel
      if (!state.activeUsers.has(payload.userId)) {
        return {
          success: false,
          message: 'You must be in a voice channel to ask a question',
        };
      }

      // Check if bot has permission to join
      if (!payload.channelId) {
        return {
          success: false,
          message: 'Bot does not have permission to join that voice channel',
        };
      }

      // Update state
      state.voiceMode = VoiceMode.Active;
      state.pipelineStatus = PipelineStatus.Processing;
      state.lastActivity = Date.now();

      // Log if debug
      if (this.config.debug) {
        console.log(`[DEBUG] Processing voice ask: ${payload.question}`);
      }

      // In real implementation, would call Phase 6 pipeline here
      // For now, return success
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Return to listening mode
      state.voiceMode = VoiceMode.Listening;
      state.pipelineStatus = PipelineStatus.Ready;

      return {
        success: true,
        message: '✅ Response played',
        data: {
          question: payload.question,
          response: 'Mock response from Rue',
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Error processing question',
        error: error as Error,
      };
    }
  }

  /**
   * Handle /voice start command
   */
  private async handleVoiceStart(payload: VoiceStartPayload): Promise<CommandResult> {
    try {
      const state = this.stateManager.getOrCreateGuildState(payload.guildId);

      // Check if user is in voice channel
      if (!payload.channelId) {
        return {
          success: false,
          message: 'You must be in a voice channel to start voice mode',
        };
      }

      // Check if already connected
      if (state.voiceMode !== VoiceMode.Off && state.channelId === payload.channelId) {
        return {
          success: true,
          message: `Voice mode is already running in <#${payload.channelId}>`,
        };
      }

      // Update state
      state.voiceMode = VoiceMode.Listening;
      state.channelId = payload.channelId;
      state.connectedAt = Date.now();
      state.lastActivity = Date.now();
      state.pipelineStatus = PipelineStatus.Ready;

      // Save state
      await this.stateManager.saveState();

      if (this.config.debug) {
        console.log(`[DEBUG] Started voice mode in guild ${payload.guildId}`);
      }

      return {
        success: true,
        message: `✅ Voice mode started in <#${payload.channelId}>`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Error starting voice mode',
        error: error as Error,
      };
    }
  }

  /**
   * Handle /voice stop command
   */
  private async handleVoiceStop(payload: VoiceStopPayload): Promise<CommandResult> {
    try {
      const state = this.stateManager.getGuildState(payload.guildId);

      if (!state || state.voiceMode === VoiceMode.Off) {
        return {
          success: false,
          message: 'Voice mode is not currently active in this guild',
        };
      }

      // Update state
      state.voiceMode = VoiceMode.Off;
      state.channelId = null;
      state.connectedAt = null;
      state.activeUsers.clear();
      state.pipelineStatus = PipelineStatus.Ready;
      state.errorCount = 0;
      state.lastError = undefined;

      // Save state
      await this.stateManager.saveState();

      if (this.config.debug) {
        console.log(`[DEBUG] Stopped voice mode in guild ${payload.guildId}`);
      }

      return {
        success: true,
        message: '✅ Voice mode stopped',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Error stopping voice mode',
        error: error as Error,
      };
    }
  }
}
