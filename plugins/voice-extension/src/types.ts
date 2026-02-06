/**
 * Type definitions for voice extension
 */

export interface VoiceConfig {
  guildId: string;
  channelId: string;
  userId: string;
}

export interface AudioBuffer {
  data: Buffer;
  timestamp: number;
}
