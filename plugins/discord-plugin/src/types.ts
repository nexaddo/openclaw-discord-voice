/**
 * Type definitions for Discord Plugin (Phase 7)
 */

// ============================================
// Guild Voice State
// ============================================

/**
 * Voice mode states
 */
export enum VoiceMode {
  Off = 'off', // Not connected
  Listening = 'listening', // Continuous listening mode
  Active = 'active', // Processing voice commands
}

/**
 * Pipeline status
 */
export enum PipelineStatus {
  Ready = 'ready',
  Processing = 'processing',
  Error = 'error',
}

/**
 * Guild voice state
 */
export interface GuildVoiceState {
  guildId: string;
  channelId: string | null; // Current voice channel (null = not connected)
  voiceMode: VoiceMode;
  connectedAt: number | null; // When bot joined voice
  activeUsers: Set<string>; // User IDs in voice channel
  lastActivity: number; // Last user activity timestamp
  pipelineStatus: PipelineStatus;
  errorCount: number; // For monitoring
  lastError?: string;
}

/**
 * Persistent guild state for storage
 */
export interface StoredGuildVoiceState {
  guildId: string;
  channelId: string | null;
  voiceMode: VoiceMode;
  connectedAt: number | null;
  activeUsers: string[]; // Serializable version of Set
  lastActivity: number;
  pipelineStatus: PipelineStatus;
  errorCount: number;
  lastError?: string;
}

// ============================================
// Commands
// ============================================

/**
 * Voice ask command payload
 */
export interface VoiceAskPayload {
  question: string;
  userId: string;
  guildId: string;
  channelId: string;
}

/**
 * Voice start command payload
 */
export interface VoiceStartPayload {
  userId: string;
  guildId: string;
  channelId: string;
}

/**
 * Voice stop command payload
 */
export interface VoiceStopPayload {
  userId: string;
  guildId: string;
}

// ============================================
// Events
// ============================================

/**
 * Voice state update from Discord
 */
export interface VoiceStateUpdateEvent {
  oldState: any; // VoiceState from discord.js
  newState: any; // VoiceState from discord.js
}

/**
 * Channel delete event
 */
export interface ChannelDeleteEvent {
  channel: any; // Channel from discord.js
}

/**
 * Guild delete event
 */
export interface GuildDeleteEvent {
  guild: any; // Guild from discord.js
}

// ============================================
// Handler Responses
// ============================================

/**
 * Command result
 */
export interface CommandResult {
  success: boolean;
  message: string;
  data?: any;
  error?: Error;
}

/**
 * Interaction response
 */
export interface InteractionResponse {
  content?: string;
  embeds?: any[];
  ephemeral?: boolean;
  components?: any[];
}

// ============================================
// Configuration
// ============================================

/**
 * Discord plugin configuration
 */
export interface DiscordPluginConfig {
  stateFile?: string; // Where to persist state
  debug?: boolean; // Enable debug logging
  enableStateCleanup?: boolean; // Auto-cleanup old state
  stateTTL?: number; // How long to keep state (ms)
  maxErrorCount?: number; // Before blocking guild
}

// ============================================
// Error Types
// ============================================

/**
 * Discord plugin error types
 */
export enum DiscordPluginErrorType {
  CommandNotFound = 'COMMAND_NOT_FOUND',
  UserNotInVoice = 'USER_NOT_IN_VOICE',
  BotNotInVoice = 'BOT_NOT_IN_VOICE',
  NoPermission = 'NO_PERMISSION',
  InvalidGuild = 'INVALID_GUILD',
  InvalidChannel = 'INVALID_CHANNEL',
  PipelineError = 'PIPELINE_ERROR',
  StateError = 'STATE_ERROR',
  DiscordError = 'DISCORD_ERROR',
  Timeout = 'TIMEOUT',
}

/**
 * Discord plugin error
 */
export class DiscordPluginError extends Error {
  type: DiscordPluginErrorType;

  guildId?: string;

  userId?: string;

  originalError?: Error;

  timestamp: number;

  constructor(
    type: DiscordPluginErrorType,
    message: string,
    options?: {
      guildId?: string;
      userId?: string;
      originalError?: Error;
    },
  ) {
    super(message);
    this.name = 'DiscordPluginError';
    this.type = type;
    this.guildId = options?.guildId;
    this.userId = options?.userId;
    this.originalError = options?.originalError;
    this.timestamp = Date.now();
  }
}

// ============================================
// Handler Interfaces
// ============================================

/**
 * Command handler interface
 */
export interface ICommandHandler {
  handle(command: string, payload: any): Promise<CommandResult>;
}

/**
 * Event handler interface
 */
export interface IEventHandler {
  handleVoiceStateUpdate(event: VoiceStateUpdateEvent): Promise<void>;
  handleChannelDelete(event: ChannelDeleteEvent): Promise<void>;
  handleGuildDelete(event: GuildDeleteEvent): Promise<void>;
}

/**
 * State manager interface
 */
export interface IStateManager {
  getGuildState(guildId: string): GuildVoiceState | null;
  setGuildState(guildId: string, state: GuildVoiceState): void;
  deleteGuildState(guildId: string): void;
  saveState(): Promise<void>;
  loadState(): Promise<void>;
  getAllGuilds(): string[];
}

/**
 * Pipeline adapter interface
 */
export interface IPipelineAdapter {
  startListening(guildId: string, channelId: string): Promise<void>;
  stopListening(guildId: string): Promise<void>;
  askQuestion(guildId: string, question: string): Promise<string>;
}

// ============================================
// Logging
// ============================================

/**
 * Log levels
 */
export enum LogLevel {
  Debug = 'DEBUG',
  Info = 'INFO',
  Warn = 'WARN',
  Error = 'ERROR',
}

/**
 * Logger interface
 */
export interface ILogger {
  log(level: LogLevel, message: string, data?: any): void;
  debug(message: string, data?: any): void;
  info(message: string, data?: any): void;
  warn(message: string, data?: any): void;
  error(message: string, data?: any): void;
}
