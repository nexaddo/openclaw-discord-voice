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

// ============================================
// Audio Stream Handler Types (Phase 3)
// ============================================

/**
 * Configuration for AudioStreamHandler
 */
export interface AudioStreamConfig {
  // Audio parameters
  sampleRate: number;              // 48000 Hz (required)
  channels: number;                // 2 (stereo) or 1 (mono)
  frameSize: number;               // 960 samples per frame (20ms @ 48kHz)
  bitRate: number;                 // 128000 (128 kbps, default)

  // Buffer configuration
  jitterBufferSize: number;         // 5-20 frames
  circularBufferCapacity: number;   // 100 frames (max storage)
  targetBufferLatency: number;      // ms, default 40

  // Codec settings
  opusComplexity: number;           // 0-10, default 5
  useFEC: boolean;                  // Forward Error Correction
  useDTX: boolean;                  // Discontinuous Transmission
  maxPlaybackRate: number;          // 48000 (Hz)

  // Device configuration
  inputDeviceId?: string;           // Audio input device
  outputDeviceId?: string;          // Audio output device
  echoCancel?: boolean;             // Echo cancellation
  noiseSuppression?: boolean;       // Noise suppression

  // Error handling
  maxRetries: number;               // Default 3
  timeoutMs: number;                // Default 5000
  enableMetrics: boolean;           // Track latency, quality
}

/**
 * Audio Frame (input/output)
 */
export interface AudioFrame {
  timestamp: number;                // RTP sample timestamp (not milliseconds)
  sequenceNumber: number;           // Frame counter
  ssrc: number;                     // Synchronization source (RTP)
  data: Float32Array;               // PCM audio data (48kHz, stereo)
  sampleCount: number;              // 960 samples typical
  duration: number;                 // 20 ms typical
}

/**
 * Opus-encoded frame
 */
export interface OpusFrame {
  timestamp: number;
  sequenceNumber: number;
  ssrc: number;
  data: Uint8Array;                 // Opus-encoded bytes
  size: number;                     // Byte length
}

/**
 * Jitter buffer metadata
 */
export interface JitterBufferFrame {
  frame: AudioFrame;
  arrivalTime: number;              // When frame arrived
  playoutTime: number;              // When to play
  isPlayed: boolean;
}

/**
 * Statistics for audio stream
 */
export interface AudioStreamStats {
  framesProcessed: number;
  framesEncoded: number;
  framesDecoded: number;
  framesDropped: number;
  frameLoss: number;                // Percentage
  jitterMs: number;                 // Buffer jitter
  latencyMs: number;                // End-to-end
  bufferOccupancy: number;          // Frames in buffer
  captureUnderrun: number;          // Underrun events
  playbackUnderrun: number;         // Underrun events
  cpuUsage: number;                 // Estimated %
  codecQuality: number;             // 0-100
}

/**
 * Buffer health status
 */
export interface BufferHealth {
  occupancy: number;                // Current frame count
  capacity: number;                 // Max capacity
  percentFull: number;              // 0-100
  isUnderrun: boolean;              // < 2 frames
  isOverrun: boolean;               // > 90% full
  jitter: number;                   // ms
  recommendation: string;           // "optimal" | "low" | "high" | "critical"
}

/**
 * Audio error codes
 */
export enum AudioErrorCode {
  // Codec errors
  OPUS_ENCODE_FAILED = 1001,
  OPUS_DECODE_FAILED = 1002,
  INVALID_FRAME_SIZE = 1003,
  SAMPLE_RATE_MISMATCH = 1004,

  // Buffer errors
  BUFFER_OVERFLOW = 2001,
  BUFFER_UNDERRUN = 2002,
  JITTER_BUFFER_FULL = 2003,
  INVALID_FRAME_TIMESTAMP = 2004,

  // Device errors
  CAPTURE_DEVICE_FAILED = 3001,
  PLAYBACK_DEVICE_FAILED = 3002,
  DEVICE_NOT_FOUND = 3003,

  // Resource errors
  MEMORY_ALLOCATION_FAILED = 4001,
  ENCODER_UNAVAILABLE = 4002,
  DECODER_UNAVAILABLE = 4003,

  // State errors
  INVALID_STATE = 5001,
  NOT_INITIALIZED = 5002,
  ALREADY_INITIALIZED = 5003,
}

/**
 * Audio stream error
 */
export interface AudioStreamError {
  code: AudioErrorCode;
  message: string;
  timestamp: number;
  context?: Record<string, any>;
  recoverable: boolean;
  retryCount: number;
}

// ============================================
// Phase 4: Speech-to-Text (STT) Types
// ============================================

/**
 * Configuration for Voice Activity Detection
 */
export interface VADConfig {
  sampleRate?: number; // Default: 48000 Hz
  frameSize?: number; // Default: 960 samples
  energyThreshold?: number; // Default: 5 (0-100 amplitude scale)
  silenceThreshold?: number; // Default: 10 frames
  voiceThreshold?: number; // Default: 0.5 (0-1 confidence)
}

/**
 * Result of voice activity detection
 */
export interface VADResult {
  isSpeech: boolean;
  energy: number; // 0-100 scale (RMS amplitude)
  confidence: number; // Confidence 0-1
  silenceDuration: number; // ms
}

/**
 * Configuration for SpeechToText pipeline
 */
export interface STTConfig {
  apiKey: string;
  modelName?: string; // Default: 'whisper-1'
  sampleRate?: number; // Default: 48000 Hz
  language?: string; // Default: 'en' (auto-detect if not set)
  enableVAD?: boolean; // Default: true
  timeoutMs?: number; // Default: 30000 ms
}

/**
 * Transcription result from Whisper API
 */
export interface TranscriptionResult {
  text: string;
  language: string;
  confidence: number; // 0-1
  duration: number; // ms
  timestamp: number; // Unix timestamp when transcribed
  segments?: {
    start: number;
    end: number;
    text: string;
  }[];
}

/**
 * Statistics for STT performance monitoring
 */
export interface STTStats {
  transcribed: number;
  errors: number;
  totalFrames: number;
  avgLatencyMs: number;
  framesPerSecond: number;
  memoryMb: number;
  lastTranscription?: number; // Unix timestamp
}
