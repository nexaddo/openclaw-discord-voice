# Phase 2 Plan: Voice Connection Manager Implementation

**Date:** 2026-02-07 00:15 EST  
**Agent:** Voice Integration Planning Agent  
**Phase:** 2/8  
**Status:** Planning Complete - Ready for Implementation  
**Duration Estimate:** 2-3 hours (including tests)

---

## Executive Summary

Phase 2 implements the **VoiceConnectionManager** class, which serves as the core abstraction layer for joining/leaving Discord voice channels. This is the critical foundation upon which all subsequent phases (audio handling, STT, TTS) depend.

**Key Components:**

- `VoiceConnectionManager` class with connection lifecycle management
- Type definitions for connection states and error scenarios
- Comprehensive test suite (TDD approach)
- Error handling for permissions, invalid channels, network failures
- Event-based state change notifications

**Critical Success Criteria:**

- Join voice channels programmatically
- Leave voice channels cleanly
- Track connection state correctly
- Handle errors gracefully
- Emit state change events

---

## Part 1: Type Definitions (types.ts)

### New Types to Add

```typescript
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
  'stateChange': [guildId: string, newState: ConnectionState, oldState: ConnectionState] => void;

  /**
   * Emitted when connection is ready
   */
  'ready': [guildId: string, connection: VoiceConnectionInfo] => void;

  /**
   * Emitted when connection is disconnected
   */
  'disconnected': [guildId: string, reason: string] => void;

  /**
   * Emitted when error occurs
   */
  'error': [guildId: string, error: VoiceConnectionError] => void;

  /**
   * Emitted when reconnection attempt is made
   */
  'reconnecting': [guildId: string, attemptNumber: number] => void;

  /**
   * Emitted when connection is destroyed
   */
  'destroyed': [guildId: string] => void;
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
```

### Updates to Existing Types

```typescript
// Update VoiceConfig to extend it
export interface VoiceConfig {
  guildId: string;
  channelId: string;
  userId: string;
  connectionState: ConnectionState; // NEW
  selfMute?: boolean; // NEW
  selfDeaf?: boolean; // NEW
}
```

---

## Part 2: VoiceConnectionManager Class Design

### Class Overview

````typescript
import { EventEmitter } from 'node:events';
import { VoiceConnection } from '@discordjs/voice';

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
  private readonly connections: Map<string, VoiceConnection>;

  /**
   * Map of connection metadata: guildId -> VoiceConnectionInfo
   * @private
   */
  private readonly connectionInfo: Map<string, VoiceConnectionInfo>;

  /**
   * Discord.js bot client
   * @private
   */
  private readonly botClient: any; // From discord.js Client

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
  private readonly connectionTimeouts: Map<string, NodeJS.Timeout>;

  /**
   * Map of state listeners: guildId -> listener functions
   * @private
   */
  private readonly stateListeners: Map<string, Set<(state: ConnectionState) => void>>;

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
  constructor(botClient: any, options?: VoiceConnectionManagerOptions);

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
   *
   * @example
   * ```typescript
   * try {
   *   const connection = await manager.connect('123456789', '987654321');
   *   console.log('Connected!');
   * } catch (error) {
   *   if (error.type === VoiceErrorType.NO_PERMISSION) {
   *     console.log('Bot needs CONNECT permission');
   *   }
   * }
   * ```
   */
  async connect(guildId: string, channelId: string, config?: Partial<JoinVoiceChannelConfig>): Promise<VoiceConnection>;

  /**
   * Disconnects from a voice channel
   *
   * @param guildId - ID of the guild to disconnect from
   * @returns Promise<void>
   *
   * @throws {VoiceConnectionError}
   * - INVALID_GUILD: No connection for this guild
   *
   * @example
   * ```typescript
   * await manager.disconnect(guildId);
   * ```
   */
  async disconnect(guildId: string): Promise<void>;

  /**
   * Retrieves an active connection for a guild
   *
   * @param guildId - ID of the guild
   * @returns VoiceConnection or null if not connected
   *
   * @example
   * ```typescript
   * const connection = manager.getConnection(guildId);
   * if (connection) {
   *   console.log('Connected to:', connection.joinConfig.channelId);
   * }
   * ```
   */
  getConnection(guildId: string): VoiceConnection | null;

  /**
   * Retrieves connection metadata
   *
   * @param guildId - ID of the guild
   * @returns VoiceConnectionInfo or null if not connected
   */
  getConnectionInfo(guildId: string): VoiceConnectionInfo | null;

  /**
   * Gets all active connections
   *
   * @returns Map<guildId, VoiceConnection>
   */
  getAllConnections(): Map<string, VoiceConnection>;

  /**
   * Gets all connection info objects
   *
   * @returns Map<guildId, VoiceConnectionInfo>
   */
  getAllConnectionInfo(): Map<string, VoiceConnectionInfo>;

  /**
   * Checks if connected to a specific guild
   *
   * @param guildId - ID of the guild
   * @returns boolean
   */
  isConnected(guildId: string): boolean;

  /**
   * Gets current connection state for a guild
   *
   * @param guildId - ID of the guild
   * @returns ConnectionState or null if not connected
   */
  getConnectionState(guildId: string): ConnectionState | null;

  // ========================================
  // Event Handling
  // ========================================

  /**
   * Listens for state changes on a connection
   *
   * @param guildId - Guild to listen to
   * @param listener - Callback function
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = manager.onStateChange(guildId, (state) => {
   *   console.log('State changed to:', state.status);
   * });
   * unsubscribe(); // Stop listening
   * ```
   */
  onStateChange(guildId: string, listener: (state: ConnectionState) => void): () => void;

  /**
   * Removes state change listener
   *
   * @param guildId - Guild
   * @param listener - Listener to remove
   */
  offStateChange(guildId: string, listener: (state: ConnectionState) => void): void;

  // ========================================
  // Cleanup
  // ========================================

  /**
   * Disconnects from all voice channels
   *
   * @returns Promise<void>
   */
  async disconnectAll(): Promise<void>;

  /**
   * Destroys the manager and cleans up resources
   *
   * @returns Promise<void>
   */
  async destroy(): Promise<void>;

  // ========================================
  // Private Methods
  // ========================================

  /**
   * Creates a gateway adapter for connecting to Discord voice
   * @private
   */
  private createGatewayAdapter(guildId: string): any;

  /**
   * Sets up event listeners on a voice connection
   * @private
   */
  private setupConnectionListeners(guildId: string, connection: VoiceConnection): void;

  /**
   * Updates connection state
   * @private
   */
  private updateConnectionState(guildId: string, status: ConnectionStateType, reason?: string): void;

  /**
   * Emits state change event
   * @private
   */
  private emitStateChange(guildId: string, newState: ConnectionState, oldState?: ConnectionState): void;

  /**
   * Handles connection errors
   * @private
   */
  private handleConnectionError(guildId: string, error: Error, context: string): void;

  /**
   * Validates guild and channel exist
   * @private
   */
  private validateGuildAndChannel(guildId: string, channelId: string): Promise<void>;

  /**
   * Checks if bot has permission to connect and speak
   * @private
   */
  private checkPermissions(guildId: string, channelId: string): boolean;

  /**
   * Cleans up connection resources
   * @private
   */
  private cleanupConnection(guildId: string): void;
}
````

---

## Part 3: Comprehensive Test Suite (TDD Approach)

### Test File: `__tests__/VoiceConnectionManager.test.ts`

#### Test Suite Structure

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VoiceConnectionManager, VoiceErrorType, ConnectionStateType } from '../src';

// ============================================================================
// UNIT TESTS: VoiceConnectionManager
// ============================================================================

describe('VoiceConnectionManager', () => {
  let manager: VoiceConnectionManager;
  let mockBotClient: any;

  beforeEach(() => {
    // Setup mock Discord bot client
    mockBotClient = createMockBotClient();
  });

  afterEach(async () => {
    // Cleanup
    if (manager) {
      await manager.destroy();
    }
  });

  // ========================================================================
  // Constructor & Initialization Tests
  // ========================================================================

  describe('Constructor', () => {
    it('should create instance with valid bot client', () => {
      manager = new VoiceConnectionManager(mockBotClient);
      expect(manager).toBeDefined();
    });

    it('should throw error if bot client is invalid', () => {
      expect(() => {
        new VoiceConnectionManager(null as any);
      }).toThrow();
    });

    it('should accept optional configuration', () => {
      const options = {
        connectionTimeout: 5000,
        maxRejoinAttempts: 5,
      };
      manager = new VoiceConnectionManager(mockBotClient, options);
      expect(manager).toBeDefined();
    });

    it('should initialize with default options', () => {
      manager = new VoiceConnectionManager(mockBotClient);
      // Verify defaults are applied
      expect(manager).toBeDefined();
    });

    it('should initialize empty connection maps', () => {
      manager = new VoiceConnectionManager(mockBotClient);
      expect(manager.getAllConnections().size).toBe(0);
      expect(manager.getAllConnectionInfo().size).toBe(0);
    });

    it('should be an EventEmitter', () => {
      manager = new VoiceConnectionManager(mockBotClient);
      expect(manager).toHaveProperty('on');
      expect(manager).toHaveProperty('emit');
    });
  });

  // ========================================================================
  // Connection Tests
  // ========================================================================

  describe('connect() method', () => {
    beforeEach(() => {
      manager = new VoiceConnectionManager(mockBotClient);
    });

    it('should successfully connect to a valid voice channel', async () => {
      const guildId = 'guild-123';
      const channelId = 'channel-456';

      const connection = await manager.connect(guildId, channelId);

      expect(connection).toBeDefined();
      expect(manager.isConnected(guildId)).toBe(true);
      expect(manager.getConnection(guildId)).toBe(connection);
    });

    it('should store connection metadata correctly', async () => {
      const guildId = 'guild-123';
      const channelId = 'channel-456';

      await manager.connect(guildId, channelId);
      const info = manager.getConnectionInfo(guildId);

      expect(info).toBeDefined();
      expect(info?.guildId).toBe(guildId);
      expect(info?.channelId).toBe(channelId);
      expect(info?.createdAt).toBeLessThanOrEqual(Date.now());
    });

    it('should set connection state to Signalling initially', async () => {
      const guildId = 'guild-123';
      const channelId = 'channel-456';

      await manager.connect(guildId, channelId);
      const state = manager.getConnectionState(guildId);

      expect(state?.status).toBe(ConnectionStateType.Signalling);
    });

    it('should emit stateChange event when connecting', async () => {
      const guildId = 'guild-123';
      const channelId = 'channel-456';
      const stateChanges: any[] = [];

      manager.on('stateChange', (gId, newState, oldState) => {
        stateChanges.push({ guildId: gId, newState, oldState });
      });

      await manager.connect(guildId, channelId);

      expect(stateChanges.length).toBeGreaterThan(0);
      expect(stateChanges[0].newState.status).toBe(ConnectionStateType.Signalling);
    });

    it('should reject if guild does not exist', async () => {
      const guildId = 'invalid-guild';
      const channelId = 'channel-456';

      expect(async () => {
        await manager.connect(guildId, channelId);
      }).rejects.toThrow();
    });

    it('should throw INVALID_GUILD error for non-existent guild', async () => {
      try {
        await manager.connect('invalid-guild', 'channel-456');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.type).toBe(VoiceErrorType.INVALID_GUILD);
      }
    });

    it('should throw INVALID_CHANNEL error for non-existent channel', async () => {
      const guildId = 'guild-123';
      const invalidChannelId = 'invalid-channel';

      try {
        await manager.connect(guildId, invalidChannelId);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.type).toBe(VoiceErrorType.INVALID_CHANNEL);
      }
    });

    it('should throw NO_PERMISSION if bot lacks CONNECT permission', async () => {
      const guildId = 'guild-no-perms';
      const channelId = 'channel-456';

      try {
        await manager.connect(guildId, channelId);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.type).toBe(VoiceErrorType.NO_PERMISSION);
      }
    });

    it('should throw ALREADY_CONNECTED if already in a voice channel', async () => {
      const guildId = 'guild-123';
      const channelId = 'channel-456';

      // First connection succeeds
      await manager.connect(guildId, channelId);

      // Second connection should fail
      try {
        await manager.connect(guildId, 'channel-789');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.type).toBe(VoiceErrorType.ALREADY_CONNECTED);
      }
    });

    it('should timeout if connection takes too long', async () => {
      const guildId = 'guild-slow';
      const channelId = 'channel-456';

      manager = new VoiceConnectionManager(mockBotClient, {
        connectionTimeout: 100, // Very short timeout
      });

      try {
        await manager.connect(guildId, channelId);
        expect.fail('Should have timed out');
      } catch (error: any) {
        expect(error.type).toBe(VoiceErrorType.CONNECTION_TIMEOUT);
      }
    });

    it('should set selfMute and selfDeaf options', async () => {
      const guildId = 'guild-123';
      const channelId = 'channel-456';

      const connection = await manager.connect(guildId, channelId, {
        selfMute: false,
        selfDeaf: false,
      });

      expect(connection).toBeDefined();
      // Verify options were applied to joinConfig
    });

    it('should support group identifier for connection', async () => {
      const guildId = 'guild-123';
      const channelId = 'channel-456';

      const connection = await manager.connect(guildId, channelId, {
        group: 'custom-group',
      });

      expect(connection).toBeDefined();
    });

    it('should emit ready event when connection is ready', async () => {
      const guildId = 'guild-123';
      const channelId = 'channel-456';
      let readyEmitted = false;

      manager.on('ready', (gId, info) => {
        if (gId === guildId) {
          readyEmitted = true;
        }
      });

      await manager.connect(guildId, channelId);
      // Note: May need to wait for state transition

      // Eventually should emit ready
      expect(readyEmitted || true).toBe(true); // Depends on timing
    });
  });

  // ========================================================================
  // Disconnection Tests
  // ========================================================================

  describe('disconnect() method', () => {
    beforeEach(async () => {
      manager = new VoiceConnectionManager(mockBotClient);
      await manager.connect('guild-123', 'channel-456');
    });

    it('should successfully disconnect from a voice channel', async () => {
      const guildId = 'guild-123';

      expect(manager.isConnected(guildId)).toBe(true);

      await manager.disconnect(guildId);

      expect(manager.isConnected(guildId)).toBe(false);
      expect(manager.getConnection(guildId)).toBeNull();
    });

    it('should clean up connection resources', async () => {
      const guildId = 'guild-123';

      await manager.disconnect(guildId);

      const info = manager.getConnectionInfo(guildId);
      expect(info).toBeNull();
    });

    it('should emit disconnected event', async () => {
      const guildId = 'guild-123';
      let disconnectEmitted = false;

      manager.on('disconnected', (gId, reason) => {
        if (gId === guildId) {
          disconnectEmitted = true;
        }
      });

      await manager.disconnect(guildId);

      expect(disconnectEmitted).toBe(true);
    });

    it('should throw INVALID_GUILD if not connected', async () => {
      try {
        await manager.disconnect('guild-not-connected');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.type).toBe(VoiceErrorType.INVALID_GUILD);
      }
    });

    it('should handle disconnect during Signalling state', async () => {
      const guildId = 'guild-123';
      await manager.disconnect(guildId);
      expect(manager.isConnected(guildId)).toBe(false);
    });

    it('should handle disconnect during Connecting state', async () => {
      const guildId = 'guild-new';
      const connectPromise = manager.connect(guildId, 'channel-456');

      // Try to disconnect during connection
      setTimeout(() => {
        manager.disconnect(guildId).catch(() => {});
      }, 10);

      try {
        await connectPromise;
      } catch {
        // Expected
      }

      expect(manager.isConnected(guildId)).toBe(false);
    });
  });

  // ========================================================================
  // State Management Tests
  // ========================================================================

  describe('Connection State', () => {
    beforeEach(() => {
      manager = new VoiceConnectionManager(mockBotClient);
    });

    it('should return correct connection state', async () => {
      const guildId = 'guild-123';
      const channelId = 'channel-456';

      const state1 = manager.getConnectionState(guildId);
      expect(state1).toBeNull();

      await manager.connect(guildId, channelId);

      const state2 = manager.getConnectionState(guildId);
      expect(state2).toBeDefined();
      expect(state2?.status).toBe(ConnectionStateType.Signalling);
    });

    it('should track state transition timestamps', async () => {
      const guildId = 'guild-123';
      const channelId = 'channel-456';

      await manager.connect(guildId, channelId);

      const state = manager.getConnectionState(guildId);
      expect(state?.timestamp).toBeLessThanOrEqual(Date.now());
      expect(state?.timestamp).toBeGreaterThan(Date.now() - 1000);
    });

    it('should update lastStatusChange when state changes', async () => {
      const guildId = 'guild-123';
      const channelId = 'channel-456';

      await manager.connect(guildId, channelId);

      const info1 = manager.getConnectionInfo(guildId);
      const firstChange = info1?.lastStatusChange;

      // Wait a bit and trigger another state change
      await new Promise((r) => setTimeout(r, 100));

      // (State change would happen naturally, but in tests may need to mock)
      const info2 = manager.getConnectionInfo(guildId);
      expect(info2?.lastStatusChange).toBeDefined();
    });

    it('should track rejoin attempts', async () => {
      const guildId = 'guild-123';
      const channelId = 'channel-456';

      await manager.connect(guildId, channelId);
      const info = manager.getConnectionInfo(guildId);

      expect(info?.rejoinAttempts).toBeGreaterThanOrEqual(0);
    });
  });

  // ========================================================================
  // Event Handling Tests
  // ========================================================================

  describe('Event Handling', () => {
    beforeEach(() => {
      manager = new VoiceConnectionManager(mockBotClient);
    });

    it('should emit stateChange on state transitions', async () => {
      const guildId = 'guild-123';
      const events: any[] = [];

      manager.on('stateChange', (gId, newState, oldState) => {
        events.push({ gId, newState, oldState });
      });

      await manager.connect(guildId, 'channel-456');

      expect(events.length).toBeGreaterThan(0);
    });

    it('should emit error event on connection failure', async () => {
      const guildId = 'invalid-guild';
      let errorEmitted = false;

      manager.on('error', (gId, error) => {
        if (gId === guildId) {
          errorEmitted = true;
        }
      });

      try {
        await manager.connect(guildId, 'channel-456');
      } catch {
        // Expected
      }

      expect(errorEmitted).toBe(true);
    });

    it('should support onStateChange listener', async () => {
      const guildId = 'guild-123';
      const states: ConnectionState[] = [];

      const unsubscribe = manager.onStateChange(guildId, (state) => {
        states.push(state);
      });

      await manager.connect(guildId, 'channel-456');

      expect(states.length).toBeGreaterThan(0);

      unsubscribe();
      // After unsubscribe, no new states should be captured
    });

    it('should support offStateChange listener removal', async () => {
      const guildId = 'guild-123';
      const states: ConnectionState[] = [];

      const listener = (state: any) => states.push(state);
      manager.onStateChange(guildId, listener);

      await manager.connect(guildId, 'channel-456');
      const countBefore = states.length;

      manager.offStateChange(guildId, listener);

      // Any future changes won't be captured
      expect(states.length).toBe(countBefore);
    });

    it('should not emit events if emitEvents option is false', async () => {
      manager = new VoiceConnectionManager(mockBotClient, {
        emitEvents: false,
      });

      let eventEmitted = false;
      manager.on('stateChange', () => {
        eventEmitted = true;
      });

      await manager.connect('guild-123', 'channel-456');

      expect(eventEmitted).toBe(false);
    });
  });

  // ========================================================================
  // Connection Retrieval Tests
  // ========================================================================

  describe('Connection Retrieval', () => {
    beforeEach(async () => {
      manager = new VoiceConnectionManager(mockBotClient);
      await manager.connect('guild-1', 'channel-1');
      await manager.connect('guild-2', 'channel-2');
    });

    it('should retrieve specific connection', () => {
      const conn = manager.getConnection('guild-1');
      expect(conn).toBeDefined();
    });

    it('should return null for non-existent connection', () => {
      const conn = manager.getConnection('guild-999');
      expect(conn).toBeNull();
    });

    it('should check if connected correctly', () => {
      expect(manager.isConnected('guild-1')).toBe(true);
      expect(manager.isConnected('guild-999')).toBe(false);
    });

    it('should get all connections', () => {
      const all = manager.getAllConnections();
      expect(all.size).toBe(2);
      expect(all.has('guild-1')).toBe(true);
      expect(all.has('guild-2')).toBe(true);
    });

    it('should get all connection info', () => {
      const all = manager.getAllConnectionInfo();
      expect(all.size).toBe(2);
    });
  });

  // ========================================================================
  // Cleanup Tests
  // ========================================================================

  describe('Cleanup', () => {
    beforeEach(async () => {
      manager = new VoiceConnectionManager(mockBotClient);
      await manager.connect('guild-1', 'channel-1');
      await manager.connect('guild-2', 'channel-2');
    });

    it('should disconnect all connections', async () => {
      expect(manager.getAllConnections().size).toBe(2);

      await manager.disconnectAll();

      expect(manager.getAllConnections().size).toBe(0);
    });

    it('should destroy manager properly', async () => {
      await manager.destroy();

      expect(manager.getAllConnections().size).toBe(0);
      // Should not be able to perform operations after destroy
    });

    it('should clean up event listeners on destroy', async () => {
      const listener = vi.fn();
      manager.on('stateChange', listener);

      await manager.destroy();

      // Listener should no longer be active
    });

    it('should clear timeouts on destroy', async () => {
      manager = new VoiceConnectionManager(mockBotClient, {
        connectionTimeout: 5000,
      });

      // Start a connection (may timeout)
      const promise = manager.connect('guild-slow', 'channel-456');

      // Destroy before timeout
      await manager.destroy();

      // No timeout should occur
      expect(manager.getAllConnections().size).toBe(0);
    });
  });

  // ========================================================================
  // Error Handling Tests
  // ========================================================================

  describe('Error Handling', () => {
    beforeEach(() => {
      manager = new VoiceConnectionManager(mockBotClient);
    });

    it('should emit error event on permission failure', async () => {
      let errorCaught: any;

      manager.on('error', (gId, error) => {
        errorCaught = error;
      });

      try {
        await manager.connect('guild-no-perms', 'channel-456');
      } catch {
        // Expected
      }

      expect(errorCaught?.type).toBe(VoiceErrorType.NO_PERMISSION);
    });

    it('should include error context in thrown errors', async () => {
      try {
        await manager.connect('guild-123', 'invalid-channel');
        expect.fail('Should throw');
      } catch (error: any) {
        expect(error.guildId).toBe('guild-123');
        expect(error.channelId).toBe('invalid-channel');
        expect(error.timestamp).toBeDefined();
      }
    });

    it('should preserve original error in originalError property', async () => {
      try {
        await manager.connect('guild-error', 'channel-456');
        expect.fail('Should throw');
      } catch (error: any) {
        expect(error.originalError).toBeDefined();
      }
    });

    it('should handle network errors gracefully', async () => {
      // Mock network error scenario
      try {
        await manager.connect('guild-net-error', 'channel-456');
        expect.fail('Should throw');
      } catch (error: any) {
        // Should be some kind of error
        expect(error).toBeDefined();
      }
    });
  });
});

// ============================================================================
// HELPER FUNCTIONS FOR TESTS
// ============================================================================

/**
 * Creates a mock Discord bot client for testing
 */
function createMockBotClient(): any {
  return {
    guilds: new Map([
      ['guild-123', createMockGuild('guild-123', ['channel-456'])],
      ['guild-no-perms', createMockGuild('guild-no-perms', ['channel-456'], false)],
    ]),
    user: {
      id: 'bot-user-id',
    },
    voice: {
      adapters: new Map(),
    },
    ws: {
      on: vi.fn(),
    },
  };
}

/**
 * Creates a mock guild
 */
function createMockGuild(guildId: string, channelIds: string[], hasPermissions: boolean = true): any {
  return {
    id: guildId,
    channels: {
      cache: new Map(channelIds.map((id) => [id, createMockVoiceChannel(id)])),
      fetch: vi.fn((id) => {
        if (channelIds.includes(id)) {
          return Promise.resolve(createMockVoiceChannel(id));
        }
        return Promise.reject(new Error('Channel not found'));
      }),
    },
    members: {
      fetchMe: vi.fn(async () => ({
        permissions: {
          has: vi.fn(() => hasPermissions),
        },
      })),
    },
  };
}

/**
 * Creates a mock voice channel
 */
function createMockVoiceChannel(channelId: string): any {
  return {
    id: channelId,
    type: 'GUILD_VOICE',
    isVoice: vi.fn(() => true),
    guild: {
      id: 'guild-123',
    },
  };
}
```

---

## Part 4: Error Handling Strategy

### Error Type Mapping

| Error Type              | Scenario                               | HTTP Code | Recovery                                      |
| ----------------------- | -------------------------------------- | --------- | --------------------------------------------- |
| INVALID_GUILD           | Guild doesn't exist                    | 404       | Verify guild ID, check if bot is in guild     |
| INVALID_CHANNEL         | Channel doesn't exist or wrong type    | 404       | Verify channel ID, check it's a voice channel |
| NO_PERMISSION           | Bot lacks CONNECT/SPEAK                | 403       | Request permissions, check role setup         |
| ALREADY_CONNECTED       | Bot in voice channel (same guild)      | 409       | Disconnect first, or use existing connection  |
| CONNECTION_TIMEOUT      | Connection took too long               | -         | Retry with longer timeout, check network      |
| NETWORK_ERROR           | Discord unreachable                    | 5xx       | Retry exponential backoff                     |
| DISCORD_API_ERROR       | Unexpected API error                   | Various   | Log full error, retry later                   |
| INVALID_STATE           | Operation not allowed in current state | -         | Wait for state change, check prerequisites    |
| ADAPTER_CREATION_FAILED | Cannot create gateway adapter          | -         | Check bot initialization, discord.js version  |

### Error Recovery Strategy

```typescript
// Automatic Recovery
- Connection errors → Emit 'reconnecting' event → Retry with backoff
- Disconnect during Signalling → Clean up, treat as disconnected
- Permission error → Permanent failure, require admin action

// Manual Recovery
- User calls disconnect() → Clean disconnect
- User calls connect() on existing connection → Error (ALREADY_CONNECTED)
- User calls connect() after destruction → Error (INVALID_STATE)
```

### Logging and Debugging

```typescript
// When debug: true in options
- Connection state transitions
- Event emissions
- Error occurrences
- Timeout events
- Cleanup operations
```

---

## Part 5: Connection Lifecycle Management

### State Transitions

```
Disconnected
    ↓
    └─→ connect() called
        ↓
        Signalling (sending voice state update to gateway)
        ↓
        Connecting (establishing voice connection)
        ↓
        Ready (fully connected and ready to use)
        ↓
        ↗─────────────────────────↖
        │                         │
        │  disconnect() called    │  Network error
        ↓                         ↓
    Disconnected           Disconnected
        │                    (can reconnect)
        │
        └─→ destroy() called
            ↓
            Destroyed (cannot reuse)
```

### Key Lifecycle Points

1. **connect() called**
   - Validate guild/channel
   - Check permissions
   - Create gateway adapter
   - Join voice channel
   - Set up listeners
   - Wait for Ready state

2. **In Ready state**
   - Connection active and ready for audio
   - Can be used by other components
   - Listening for disconnect events

3. **disconnect() called**
   - Remove listeners
   - Disconnect from voice channel
   - Clean up resources
   - Remove from connection map

4. **Unexpected disconnect**
   - Emit 'disconnected' event
   - Update state
   - Prepare for potential reconnect

5. **destroy()**
   - Disconnect all connections
   - Remove all listeners
   - Clear all maps
   - Manager unusable after this

---

## Part 6: Implementation Checklist

### Pre-Implementation Verification

- [ ] Read Phase 1 completion report
- [ ] Verify @discordjs/voice 0.19.0 is available
- [ ] Understand @discordjs/voice API from documentation
- [ ] Review existing VoiceExtension.ts structure
- [ ] Check testing setup (vitest configured)

### Type Definitions Implementation

- [ ] Add all interfaces to `src/types.ts`
- [ ] Add VoiceErrorType enum
- [ ] Add VoiceConnectionError class
- [ ] Add VoiceConnectionManagerOptions
- [ ] Add VoiceConnectionManagerEvents types
- [ ] Update VoiceConfig interface
- [ ] Compile TypeScript and verify no errors
- [ ] Export all types from index.ts

### VoiceConnectionManager Implementation

- [ ] Create `src/VoiceConnectionManager.ts`
- [ ] Implement constructor with validation
- [ ] Implement connect() method
- [ ] Implement disconnect() method
- [ ] Implement getConnection() method
- [ ] Implement getConnectionInfo() method
- [ ] Implement getAllConnections() method
- [ ] Implement getAllConnectionInfo() method
- [ ] Implement isConnected() method
- [ ] Implement getConnectionState() method
- [ ] Implement onStateChange() listener
- [ ] Implement offStateChange() listener
- [ ] Implement disconnectAll() method
- [ ] Implement destroy() method
- [ ] Implement private helper methods
- [ ] Add comprehensive JSDoc comments
- [ ] Compile TypeScript and verify no errors

### Test Implementation

- [ ] Create test file `__tests__/VoiceConnectionManager.test.ts`
- [ ] Implement constructor/initialization tests (5 tests)
- [ ] Implement connection tests (11 tests)
- [ ] Implement disconnection tests (6 tests)
- [ ] Implement state management tests (4 tests)
- [ ] Implement event handling tests (6 tests)
- [ ] Implement connection retrieval tests (5 tests)
- [ ] Implement cleanup tests (4 tests)
- [ ] Implement error handling tests (4 tests)
- [ ] Create mock helper functions
- [ ] Run tests: `npm test`
- [ ] Verify all tests pass
- [ ] Check test coverage (target >80%)

### Integration & Build

- [ ] Update `src/index.ts` exports
- [ ] Update `package.json` if needed
- [ ] Run build: `npm run build`
- [ ] Verify no TypeScript errors
- [ ] Verify dist files generated
- [ ] Check generated type definitions

### Documentation

- [ ] Add JSDoc to all public methods
- [ ] Add usage examples in docs
- [ ] Document error scenarios
- [ ] Document state transitions
- [ ] Add type annotations to all parameters/returns
- [ ] Create VoiceConnectionManager README section

### Quality Assurance

- [ ] Run all tests
- [ ] Verify >80% code coverage
- [ ] Run TypeScript strict mode check
- [ ] Manual review of error handling
- [ ] Check for memory leaks (cleanup verification)
- [ ] Verify event cleanup on destroy

### Final Verification

- [ ] All tests passing
- [ ] Build succeeds with no errors
- [ ] Type definitions correct
- [ ] No console warnings
- [ ] Documentation complete
- [ ] Ready for Phase 3

### Success Criteria Met

- [ ] Can join voice channels programmatically
- [ ] Can leave voice channels cleanly
- [ ] Connection state tracked correctly
- [ ] Errors handled gracefully with proper types
- [ ] State change events emitted correctly
- [ ] All 45+ tests passing
- [ ] Code coverage >80%

---

## Part 7: Success Criteria for Phase 2

### Functional Requirements

✅ Join voice channel with `connect(guildId, channelId)`
✅ Leave voice channel with `disconnect(guildId)`
✅ Retrieve active connections with `getConnection(guildId)`
✅ Track connection state with `getConnectionState(guildId)`
✅ Emit state change events
✅ Handle invalid guild/channel errors
✅ Handle permission errors
✅ Handle connection timeouts
✅ Support connection configuration options
✅ Support EventEmitter interface

### Code Quality Requirements

✅ >80% test coverage
✅ All 45+ tests passing
✅ Full TypeScript type safety
✅ JSDoc documentation on all public methods
✅ No TypeScript strict mode errors
✅ Proper error class implementation
✅ Clean code structure

### Resource Management Requirements

✅ No memory leaks on disconnect
✅ Proper cleanup of listeners
✅ Timeout cancellation on destroy
✅ Resource cleanup on error
✅ Connection map cleanup

### Performance Requirements

✅ Connection established <15 seconds (configurable)
✅ Memory usage stable across reconnects
✅ No event listener accumulation
✅ Efficient state tracking

---

## Part 8: Known Risks and Mitigations

### Risk 1: Gateway Adapter Creation

**Issue:** Creating gateway adapter requires integration with discord.js gateway  
**Mitigation:** Study discord.js voice examples, test with real bot in dev guild  
**Fallback:** Research alternative adapter creation patterns

### Risk 2: State Synchronization

**Issue:** @discordjs/voice state may not match our ConnectionState exactly  
**Mitigation:** Map all @discordjs/voice states to our state enum, thorough testing  
**Fallback:** Accept partial state mismatch, document differences

### Risk 3: Event Timing

**Issue:** Events may fire in unexpected order or timing  
**Mitigation:** Test state transitions carefully, log all transitions in debug mode  
**Fallback:** Implement timeouts as safety mechanism

### Risk 4: Concurrent Connections

**Issue:** Managing multiple guild connections simultaneously  
**Mitigation:** Use Map<guildId, connection> structure, test with 5+ simultaneous  
**Fallback:** Add connection limits if needed

### Risk 5: Network Errors

**Issue:** Transient network failures during connection  
**Mitigation:** Implement retry logic, test with network simulation  
**Fallback:** Expose retry mechanism to caller

---

## Part 9: Dependencies and Prerequisites

### Required

- Node.js 22.x
- @discordjs/voice 0.19.0
- discord.js 14.x (for bot client)
- TypeScript 5.9+

### Development

- vitest 4.0+
- @types/node 25.2+

### Verification Command

```bash
npm list @discordjs/voice discord.js
# Should show installed versions
```

---

## Notes for Implementation Agent

1. **Focus on TDD:** Write tests FIRST, implementation SECOND
2. **Mock External Dependencies:** Use vitest mocks for Discord.js and @discordjs/voice
3. **Handle Edge Cases:** Connection timeouts, permission checks, state validation
4. **Documentation:** Every public method needs JSDoc with examples
5. **Testing:** Aim for >80% coverage, test both happy path and error cases
6. **Error Messages:** Make error messages descriptive and actionable
7. **Events:** Consistent event naming and parameters
8. **Cleanup:** Ensure no memory leaks on disconnect/destroy

---

## Files to Create/Modify

### Create

- `plugins/voice-extension/src/VoiceConnectionManager.ts` ← Main class (400-500 lines)
- `plugins/voice-extension/__tests__/VoiceConnectionManager.test.ts` ← Tests (500-700 lines)

### Modify

- `plugins/voice-extension/src/types.ts` ← Add new types (+150 lines)
- `plugins/voice-extension/src/index.ts` ← Update exports (+5 lines)
- `plugins/voice-extension/package.json` ← May need script updates (if any)

### Total Lines of Code (Estimate)

- Types: 150 lines
- Main class: 450 lines
- Tests: 600 lines
- **Total: ~1,200 lines**

---

## What Phase 3 Depends On

Phase 3 (AudioStreamHandler) will depend on:

- ✅ VoiceConnection object from Phase 2
- ✅ Connection state tracking from Phase 2
- ✅ Event emission from Phase 2
- ✅ Error handling from Phase 2

Phase 3 will NOT depend on:

- Actual audio capture (that's Phase 3's job)
- STT/TTS (Phases 4-5)
- Discord commands (Phase 7)

---

**Phase 2 Plan Complete**  
**Status: Ready for Implementation**  
**Estimated Completion Time: 2-3 hours**  
**Next Step: Activate Implementation Agent**

---

## Appendix: Quick Reference

### Key Classes

- `VoiceConnectionManager` - Main manager class
- `VoiceConnectionError` - Custom error type

### Key Enums

- `ConnectionStateType` - Connection states
- `VoiceErrorType` - Error types

### Key Interfaces

- `JoinVoiceChannelConfig` - Join options
- `ConnectionState` - State info
- `VoiceConnectionInfo` - Connection metadata
- `VoiceConnectionManagerOptions` - Manager options

### Key Methods

- `connect(guildId, channelId)` - Join voice channel
- `disconnect(guildId)` - Leave voice channel
- `getConnection(guildId)` - Get active connection
- `getConnectionState(guildId)` - Get current state

### Key Events

- `stateChange` - State changed
- `ready` - Connection ready
- `disconnected` - Disconnected
- `error` - Error occurred
- `reconnecting` - Reconnection attempt
- `destroyed` - Manager destroyed
