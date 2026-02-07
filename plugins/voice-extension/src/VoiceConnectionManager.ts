/**
 * Voice Connection Manager
 * Manages voice connections for Discord guilds
 */

import { EventEmitter } from 'node:events';
import {
  JoinVoiceChannelConfig,
  ConnectionStateType,
  ConnectionState,
  VoiceConnectionInfo,
  VoiceErrorType,
  VoiceConnectionError,
  VoiceConnectionManagerOptions
} from './types.js';

// Type placeholder for VoiceConnection (from @discordjs/voice)
type VoiceConnection = any;

/**
 * Manages voice connections for Discord guilds
 * 
 * This class handles:
 * - Joining voice channels
 * - Leaving voice channels
 * - Tracking connection state
 * - Managing reconnections
 * - Error handling and recovery
 * 
 * Usage:
 * ```typescript
 * const manager = new VoiceConnectionManager(botClient, options);
 * const connection = await manager.connect(guildId, channelId);
 * await manager.disconnect(guildId);
 * ```
 */
export class VoiceConnectionManager extends EventEmitter {
  // ========================================
  // Properties
  // ========================================

  /**
   * Map of active voice connections: guildId -> VoiceConnection
   * @private
   */
  private readonly connections: Map<string, VoiceConnection> = new Map();

  /**
   * Map of connection metadata: guildId -> VoiceConnectionInfo
   * @private
   */
  private readonly connectionInfo: Map<string, VoiceConnectionInfo> = new Map();

  /**
   * Discord.js bot client
   * @private
   */
  private readonly botClient: any;

  /**
   * Configuration options
   * @private
   */
  private readonly options: Required<VoiceConnectionManagerOptions>;

  /**
   * Debug logger function
   * @private
   */
  private readonly logger: (message: string, data?: any) => void;

  /**
   * Map of ongoing connection timeouts: guildId -> timeoutId
   * @private
   */
  private readonly connectionTimeouts: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Map of state listeners: guildId -> listener functions
   * @private
   */
  private readonly stateListeners: Map<string, Set<(state: ConnectionState) => void>> = new Map();

  /**
   * Whether manager is destroyed
   * @private
   */
  private destroyed: boolean = false;

  // ========================================
  // Constructor
  // ========================================

  /**
   * Creates a new VoiceConnectionManager
   * 
   * @param botClient - Discord.js bot client
   * @param options - Configuration options
   * @throws {VoiceConnectionError} If botClient is invalid
   */
  constructor(botClient: any, options?: VoiceConnectionManagerOptions) {
    super();

    if (!botClient || typeof botClient !== 'object') {
      throw new Error('Invalid bot client provided to VoiceConnectionManager');
    }

    this.botClient = botClient;
    this.options = this.normalizeOptions(options);
    this.logger = this.options.debug 
      ? (msg: string, data?: any) => console.log(`[VoiceConnectionManager] ${msg}`, data || '')
      : () => {};

    this.logger('VoiceConnectionManager initialized', { options: this.options });
  }

  // ========================================
  // Core Methods
  // ========================================

  /**
   * Joins a voice channel and establishes connection
   * 
   * @param guildId - ID of the guild
   * @param channelId - ID of the voice channel
   * @param config - Optional connection configuration
   * @returns Promise<VoiceConnection> - Active connection
   * 
   * @throws {VoiceConnectionError}
   * - INVALID_GUILD: Guild not found
   * - INVALID_CHANNEL: Channel not found
   * - NO_PERMISSION: Bot lacks permissions
   * - ALREADY_CONNECTED: Bot already in a voice channel in this guild
   * - CONNECTION_TIMEOUT: Connection took too long
   * - ADAPTER_CREATION_FAILED: Failed to create gateway adapter
   * - DISCORD_API_ERROR: Unexpected API error
   */
  async connect(
    guildId: string,
    channelId: string,
    config?: Partial<JoinVoiceChannelConfig>
  ): Promise<VoiceConnection> {
    this.logger('connect() called', { guildId, channelId, config });

    try {
      // Check if already connected to this guild
      if (this.connections.has(guildId)) {
        const error = new VoiceConnectionError(
          VoiceErrorType.ALREADY_CONNECTED,
          `Already connected to a voice channel in guild ${guildId}`,
          { guildId, channelId }
        );
        this.tryEmitError(guildId, error);
        throw error;
      }

      // Validate guild and channel first (before any state updates)
      this.validateGuildAndChannel(guildId, channelId);

      // Check permissions
      if (!await this.checkPermissions(guildId, channelId)) {
        const error = new VoiceConnectionError(
          VoiceErrorType.NO_PERMISSION,
          `Bot lacks permission to connect to voice channel ${channelId} in guild ${guildId}`,
          { guildId, channelId }
        );
        this.tryEmitError(guildId, error);
        throw error;
      }

      // Check if manager was destroyed during async permission check
      if (this.destroyed) {
        const error = new VoiceConnectionError(
          VoiceErrorType.INVALID_STATE,
          'Manager was destroyed during connection setup',
          { guildId, channelId }
        );
        this.tryEmitError(guildId, error);
        throw error;
      }

      // Create connection info BEFORE state updates (so updateConnectionState has data to work with)
      const now = Date.now();
      const info: VoiceConnectionInfo = {
        guildId,
        channelId,
        userId: this.botClient.user?.id || 'bot-user-id',
        state: {
          status: ConnectionStateType.Signalling,
          timestamp: now,
          reason: 'Starting connection'
        },
        createdAt: now,
        lastStatusChange: now,
        rejoinAttempts: 0
      };
      this.connectionInfo.set(guildId, info);

      // Update state to Signalling
      this.updateConnectionState(guildId, ConnectionStateType.Signalling, 'Starting connection');

      // Update state to Connecting
      this.updateConnectionState(guildId, ConnectionStateType.Connecting, 'Creating voice connection');

      // Create a mock connection for testing (in real implementation would use @discordjs/voice)
      const connection = this.createMockConnection(guildId, channelId, config);

      // Store connection
      this.connections.set(guildId, connection);

      // Setup event listeners
      this.setupConnectionListeners(guildId, connection);

      // Wait for connection with timeout
      return await this.waitForConnection(guildId, connection);
    } catch (error: any) {
      this.logger('connect() error', { guildId, error: error.message });
      
      // Clean up on error
      this.cleanupConnection(guildId);

      if (error instanceof VoiceConnectionError) {
        throw error;
      }

      // Wrap unexpected errors
      const wrappedError = new VoiceConnectionError(
        VoiceErrorType.DISCORD_API_ERROR,
        `Failed to connect to voice channel: ${error.message}`,
        { guildId, channelId, originalError: error }
      );
      this.emit('error', guildId, wrappedError);
      throw wrappedError;
    }
  }

  /**
   * Disconnects from a voice channel
   * 
   * @param guildId - ID of the guild to disconnect from
   * @returns Promise<void>
   * 
   * @throws {VoiceConnectionError}
   * - INVALID_GUILD: No connection for this guild
   */
  async disconnect(guildId: string): Promise<void> {
    this.logger('disconnect() called', { guildId });

    if (!this.connections.has(guildId)) {
      const error = new VoiceConnectionError(
        VoiceErrorType.INVALID_GUILD,
        `No connection found for guild ${guildId}`,
        { guildId }
      );
      throw error;
    }

    try {
      const connection = this.connections.get(guildId);

      if (connection) {
        // Disconnect the voice connection
        connection.destroy();
      }

      // Update state
      this.updateConnectionState(guildId, ConnectionStateType.Disconnected, 'Disconnected');

      // Emit event
      this.tryEmitDisconnected(guildId, 'User initiated disconnect');

      // Clean up
      this.cleanupConnection(guildId);

      this.logger('disconnect() completed', { guildId });
    } catch (error: any) {
      this.logger('disconnect() error', { guildId, error: error.message });
      this.cleanupConnection(guildId);
      throw error;
    }
  }

  /**
   * Retrieves an active connection for a guild
   * 
   * @param guildId - ID of the guild
   * @returns VoiceConnection or null if not connected
   */
  getConnection(guildId: string): VoiceConnection | null {
    return this.connections.get(guildId) ?? null;
  }

  /**
   * Retrieves connection metadata
   * 
   * @param guildId - ID of the guild
   * @returns VoiceConnectionInfo or null if not connected
   */
  getConnectionInfo(guildId: string): VoiceConnectionInfo | null {
    return this.connectionInfo.get(guildId) ?? null;
  }

  /**
   * Gets all active connections
   * 
   * @returns Map<guildId, VoiceConnection>
   */
  getAllConnections(): Map<string, VoiceConnection> {
    return new Map(this.connections);
  }

  /**
   * Gets all connection info objects
   * 
   * @returns Map<guildId, VoiceConnectionInfo>
   */
  getAllConnectionInfo(): Map<string, VoiceConnectionInfo> {
    return new Map(this.connectionInfo);
  }

  /**
   * Checks if connected to a specific guild
   * 
   * @param guildId - ID of the guild
   * @returns boolean
   */
  isConnected(guildId: string): boolean {
    return this.connections.has(guildId);
  }

  /**
   * Gets current connection state for a guild
   * 
   * @param guildId - ID of the guild
   * @returns ConnectionState or null if not connected
   */
  getConnectionState(guildId: string): ConnectionState | null {
    const info = this.connectionInfo.get(guildId);
    return info?.state ?? null;
  }

  // ========================================
  // Event Handling
  // ========================================

  /**
   * Listens for state changes on a connection
   * 
   * @param guildId - Guild to listen to
   * @param listener - Callback function
   * @returns Unsubscribe function
   */
  onStateChange(
    guildId: string,
    listener: (state: ConnectionState) => void
  ): () => void {
    if (!this.stateListeners.has(guildId)) {
      this.stateListeners.set(guildId, new Set());
    }

    this.stateListeners.get(guildId)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.offStateChange(guildId, listener);
    };
  }

  /**
   * Removes state change listener
   * 
   * @param guildId - Guild
   * @param listener - Listener to remove
   */
  offStateChange(
    guildId: string,
    listener: (state: ConnectionState) => void
  ): void {
    const listeners = this.stateListeners.get(guildId);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.stateListeners.delete(guildId);
      }
    }
  }

  // ========================================
  // Cleanup
  // ========================================

  /**
   * Disconnects from all voice channels
   * 
   * @returns Promise<void>
   */
  async disconnectAll(): Promise<void> {
    this.logger('disconnectAll() called');

    const guildIds = Array.from(this.connections.keys());
    
    for (const guildId of guildIds) {
      try {
        await this.disconnect(guildId);
      } catch {
        // Ignore errors during bulk disconnect
      }
    }

    this.logger('disconnectAll() completed');
  }

  /**
   * Destroys the manager and cleans up resources
   * 
   * @returns Promise<void>
   */
  async destroy(): Promise<void> {
    this.logger('destroy() called');

    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    // Disconnect all connections
    await this.disconnectAll();

    // Clear all timeouts
    for (const timeout of this.connectionTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.connectionTimeouts.clear();

    // Remove all listeners
    this.stateListeners.clear();
    this.removeAllListeners();

    // Clear maps
    this.connections.clear();
    this.connectionInfo.clear();

    this.logger('destroy() completed');
  }

  // ========================================
  // Private Methods
  // ========================================

  /**
   * Normalizes options with defaults
   * @private
   */
  private normalizeOptions(options?: VoiceConnectionManagerOptions): Required<VoiceConnectionManagerOptions> {
    return {
      connectionTimeout: options?.connectionTimeout ?? 15000,
      maxRejoinAttempts: options?.maxRejoinAttempts ?? 3,
      debug: options?.debug ?? false,
      daveEncryption: options?.daveEncryption ?? true,
      emitEvents: options?.emitEvents ?? true
    };
  }

  /**
   * Creates a mock connection for testing
   * NOTE: This is a simplified mock for Phase 2 testing. Phase 3 will use real
   * @discordjs/voice VoiceConnection instances. The mock includes:
   * - joinConfig: Configuration for joining the voice channel
   * - state: Connection state with status code
   * - destroy: Cleanup method
   * - subscribe/unsubscribe: Audio stream handling
   * - Event emitter methods for compatibility
   * Real @discordjs/voice features not yet implemented:
   * - Actual audio streaming
   * - Real Discord voice protocol
   * - State machine with proper event flow
   * @private
   */
  private createMockConnection(
    guildId: string,
    channelId: string,
    config?: Partial<JoinVoiceChannelConfig>
  ): VoiceConnection {
    // Return a mock VoiceConnection object that partially matches @discordjs/voice API
    return {
      // Configuration for the connection
      joinConfig: {
        guildId,
        channelId,
        selfMute: config?.selfMute ?? true,
        selfDeaf: config?.selfDeaf ?? true
      },
      // Voice state (status: 0 = idle/disconnected, 1 = connecting, 2 = connected)
      state: { status: 0 },
      status: 0,
      // Core connection methods
      destroy: () => {
        // In real implementation, would clean up resources
      },
      // Audio streaming interface
      subscribe: (transform: any) => ({
        unsubscribe: () => {}
      }),
      // Event emitter interface
      on: (event: string, listener: any) => ({} as any),
      once: (event: string, listener: any) => ({} as any),
      emit: (event: string, ...args: any[]) => true,
      removeListener: (event: string, listener: any) => ({} as any),
      removeAllListeners: (event?: string) => ({} as any),
      // Playback control (not implemented in Phase 2)
      play: () => ({}),
      pause: () => true,
      resume: () => true
    } as any as VoiceConnection;
  }

  /**
   * Sets up event listeners on a voice connection
   * @private
   */
  private setupConnectionListeners(
    guildId: string,
    connection: VoiceConnection
  ): void {
    this.logger('setupConnectionListeners()', { guildId });

    // In a real implementation, would subscribe to connection state changes
    // For now, we simulate it in waitForConnection
  }

  /**
   * Updates connection state
   * @private
   */
  private updateConnectionState(
    guildId: string,
    status: ConnectionStateType,
    reason?: string
  ): void {
    const info = this.connectionInfo.get(guildId);
    if (!info) {
      if (this.options.debug) {
        this.logger('updateConnectionState() called on non-existent connection', { guildId, status });
      }
      return;
    }

    const oldState = info.state;
    const now = Date.now();

    const newState: ConnectionState = {
      status,
      timestamp: now,
      reason
    };

    info.state = newState;
    info.lastStatusChange = now;

    this.logger('updateConnectionState()', { guildId, oldStatus: oldState.status, newStatus: status });

    // Emit state change event
    if (this.options.emitEvents) {
      this.emitStateChange(guildId, newState, oldState);
    }
  }

  /**
   * Emits state change event
   * @private
   */
  private emitStateChange(
    guildId: string,
    newState: ConnectionState,
    oldState?: ConnectionState
  ): void {
    this.logger('emitStateChange()', { guildId, status: newState.status });

    // Emit to EventEmitter listeners
    this.emit('stateChange', guildId, newState, oldState);

    // Emit to onStateChange listeners
    const listeners = this.stateListeners.get(guildId);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(newState);
        } catch (error) {
          this.logger('Error in state change listener', { guildId, error });
        }
      }
    }
  }

  /**
   * Validates guild and channel exist
   * @private
   */
  private validateGuildAndChannel(
    guildId: string,
    channelId: string
  ): void {
    const guild = this.botClient.guilds?.get?.(guildId);
    
    if (!guild) {
      const error = new VoiceConnectionError(
        VoiceErrorType.INVALID_GUILD,
        `Guild ${guildId} not found`,
        { guildId, channelId }
      );
      this.tryEmitError(guildId, error);
      throw error;
    }

    const channel = guild.channels?.cache?.get?.(channelId);
    
    if (!channel) {
      const error = new VoiceConnectionError(
        VoiceErrorType.INVALID_CHANNEL,
        `Channel ${channelId} not found in guild ${guildId}`,
        { guildId, channelId }
      );
      this.tryEmitError(guildId, error);
      throw error;
    }
  }

  /**
   * Safely emits error event if there are listeners
   * @private
   */
  private tryEmitError(guildId: string, error: VoiceConnectionError): void {
    if (this.listenerCount('error') > 0) {
      this.emit('error', guildId, error);
    }
  }

  /**
   * Safely emits disconnected event if there are listeners
   * @private
   */
  private tryEmitDisconnected(guildId: string, reason: string): void {
    if (this.listenerCount('disconnected') > 0) {
      this.emit('disconnected', guildId, reason);
    }
  }

  /**
   * Checks if bot has permission to connect and speak in a specific channel
   * Uses channel.permissionsFor(botMember) to get effective permissions
   * considering channel-level permission overwrites
   * @private
   */
  private async checkPermissions(guildId: string, channelId: string): Promise<boolean> {
    try {
      const guild = this.botClient.guilds?.get?.(guildId);
      if (!guild) {
        this.logger('checkPermissions() - guild not found', { guildId, channelId });
        return false;
      }

      // Get the target channel
      const channel = guild.channels?.cache?.get?.(channelId);
      if (!channel) {
        this.logger('checkPermissions() - channel not found', { guildId, channelId });
        return false;
      }

      // Try to fetch the bot member's permissions
      if (typeof guild.members?.fetchMe === 'function') {
        const botMember = await guild.members.fetchMe();
        if (!botMember) {
          this.logger('checkPermissions() - failed to fetch bot member', { guildId, channelId });
          return false;
        }

        // Use channel.permissionsFor() to get effective permissions (including overwrites)
        if (typeof channel.permissionsFor === 'function') {
          const permissions = channel.permissionsFor(botMember);
          if (!permissions) {
            this.logger('checkPermissions() - failed to get channel permissions', { guildId, channelId });
            return false;
          }

          // Check for both CONNECT and SPEAK permissions
          const hasConnect = permissions.has('CONNECT');
          const hasSpeak = permissions.has('SPEAK');

          if (!hasConnect) {
            this.logger('checkPermissions() - missing CONNECT permission', { guildId, channelId });
            return false;
          }

          if (!hasSpeak) {
            this.logger('checkPermissions() - missing SPEAK permission', { guildId, channelId });
            return false;
          }

          this.logger('checkPermissions() - all permissions granted', { guildId, channelId });
          return true;
        }
      }

      // Fail closed: can't determine permissions, deny access
      this.logger('checkPermissions() - could not determine permissions', { guildId, channelId });
      return false;
    } catch (error) {
      // Log error for debugging
      this.logger('Error checking permissions', { guildId, channelId, error: error instanceof Error ? error.message : String(error) });
      // Fail closed: deny if we can't check
      return false;
    }
  }

  /**
   * Cleans up connection resources
   * @private
   */
  private cleanupConnection(guildId: string): void {
    this.logger('cleanupConnection()', { guildId });

    // Remove timeout
    const timeout = this.connectionTimeouts.get(guildId);
    if (timeout) {
      clearTimeout(timeout);
      this.connectionTimeouts.delete(guildId);
    }

    // Remove from maps
    this.connections.delete(guildId);
    this.connectionInfo.delete(guildId);
    this.stateListeners.delete(guildId);
  }

  /**
   * Waits for connection to be ready with timeout
   * @private
   */
  private waitForConnection(guildId: string, connection: VoiceConnection): Promise<VoiceConnection> {
    return new Promise((resolve, reject) => {
      // Set timeout
      const timeoutId = setTimeout(() => {
        const error = new VoiceConnectionError(
          VoiceErrorType.CONNECTION_TIMEOUT,
          `Connection to voice channel in guild ${guildId} timed out after ${this.options.connectionTimeout}ms`,
          { guildId }
        );
        this.emit('error', guildId, error);
        this.cleanupConnection(guildId);
        reject(error);
      }, this.options.connectionTimeout);

      this.connectionTimeouts.set(guildId, timeoutId);

      // In a real implementation would wait for connection ready event
      // For testing, we simulate delayed connection to allow initial state check
      setTimeout(() => {
        const info = this.connectionInfo.get(guildId);
        if (info && !this.connectionTimeouts.has(guildId)) {
          return; // Already cleaned up
        }

        // Update to Ready state
        this.updateConnectionState(guildId, ConnectionStateType.Ready, 'Voice connection ready');

        // Emit ready event
        if (info) {
          this.emit('ready', guildId, info);
        }

        // Clear timeout
        clearTimeout(timeoutId);
        this.connectionTimeouts.delete(guildId);

        resolve(connection);
      }, 5); // Small delay to allow state checks
    });
  }
}
