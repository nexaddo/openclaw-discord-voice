/**
 * Type definitions for voice extension
 */

// ============================================
// Voice Connection Configuration
// ============================================

/**
 * Configuration for joining a voice channel
 */
export interface JoinVoiceChannelConfig {
  guildId: string;
  channelId: string;
  selfMute?: boolean;     // Default: true
  selfDeaf?: boolean;     // Default: true
  group?: string;         // Optional group identifier
}

/**
 * Connection state types
 */
export enum ConnectionStateType {
  Signalling = 'signalling',      // Sending voice state update to gateway
  Connecting = 'connecting',      // Attempting to establish connection
  Ready = 'ready',                // Connected and ready to use
  Disconnected = 'disconnected',  // Disconnected (can reconnect)
  Destroyed = 'destroyed'         // Destroyed (cannot reuse)
}

/**
 * Detailed connection state information
 */
export interface ConnectionState {
  status: ConnectionStateType;
  timestamp: number;
  reason?: string;                // Why in this state
  lastError?: Error;              // Last error encountered
}

/**
 * Represents a connection to a Discord voice channel
 */
export interface VoiceConnectionInfo {
  guildId: string;
  channelId: string;
  userId: string;                 // Bot user ID
  state: ConnectionState;
  createdAt: number;
  lastStatusChange: number;
  rejoinAttempts: number;         // Number of reconnection attempts
}

// ============================================
// Error Types
// ============================================

/**
 * Type for voice connection errors
 */
export enum VoiceErrorType {
  INVALID_GUILD = 'INVALID_GUILD',
  INVALID_CHANNEL = 'INVALID_CHANNEL',
  NO_PERMISSION = 'NO_PERMISSION',
  ALREADY_CONNECTED = 'ALREADY_CONNECTED',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  DISCORD_API_ERROR = 'DISCORD_API_ERROR',
  INVALID_STATE = 'INVALID_STATE',
  ADAPTER_CREATION_FAILED = 'ADAPTER_CREATION_FAILED'
}

/**
 * Voice connection error with detailed context
 */
export class VoiceConnectionError extends Error {
  type: VoiceErrorType;
  guildId?: string;
  channelId?: string;
  originalError?: Error;
  timestamp: number;

  constructor(
    type: VoiceErrorType,
    message: string,
    options?: {
      guildId?: string;
      channelId?: string;
      originalError?: Error;
    }
  ) {
    super(message);
    this.name = 'VoiceConnectionError';
    this.type = type;
    this.guildId = options?.guildId;
    this.channelId = options?.channelId;
    this.originalError = options?.originalError;
    this.timestamp = Date.now();
  }
}

// ============================================
// Events
// ============================================

/**
 * Events emitted by VoiceConnectionManager
 */
export interface VoiceConnectionManagerEvents {
  /**
   * Emitted when connection state changes
   */
  stateChange(guildId: string, newState: ConnectionState, oldState?: ConnectionState): void;

  /**
   * Emitted when connection is ready
   */
  ready(guildId: string, connection: VoiceConnectionInfo): void;

  /**
   * Emitted when connection is disconnected
   */
  disconnected(guildId: string, reason: string): void;

  /**
   * Emitted when error occurs
   */
  error(guildId: string, error: VoiceConnectionError): void;

  /**
   * Emitted when reconnection attempt is made
   */
  reconnecting(guildId: string, attemptNumber: number): void;

  /**
   * Emitted when connection is destroyed
   */
  destroyed(guildId: string): void;
}

// ============================================
// Options
// ============================================

/**
 * Options for VoiceConnectionManager initialization
 */
export interface VoiceConnectionManagerOptions {
  /**
   * Maximum timeout for connection attempt (ms)
   * Default: 15000 (15 seconds)
   */
  connectionTimeout?: number;

  /**
   * Maximum number of reconnection attempts
   * Default: 3
   */
  maxRejoinAttempts?: number;

  /**
   * Enable debug logging
   * Default: false
   */
  debug?: boolean;

  /**
   * Enable DAVE protocol for end-to-end encryption
   * Default: true
   */
  daveEncryption?: boolean;

  /**
   * Whether to emit state change events
   * Default: true
   */
  emitEvents?: boolean;
}

// ============================================
// Existing Types (Updated)
// ============================================

export interface VoiceConfig {
  guildId: string;
  channelId: string;
  userId: string;
  connectionState?: ConnectionState;  // NEW
  selfMute?: boolean;                // NEW
  selfDeaf?: boolean;                // NEW
}

export interface AudioBuffer {
  data: Buffer;
  timestamp: number;
}
