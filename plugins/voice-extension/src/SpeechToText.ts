/**
 * Phase 4: Speech-to-Text Pipeline Implementation
 * Handles Opus audio conversion, transcription via Whisper API, and voice activity detection
 */

import * as crypto from 'crypto';

// ============================================================
// Type Definitions for STT Pipeline
// ============================================================

/**
 * Configuration for Voice Activity Detection
 */
export interface VADConfig {
  sampleRate?: number; // Default: 48000 Hz
  frameSize?: number; // Default: 960 samples
  energyThreshold?: number; // Default: 40 dB
  silenceThreshold?: number; // Default: 10 frames
  voiceThreshold?: number; // Default: 0.5 (0-1)
}

/**
 * Result of voice activity detection
 */
export interface VADResult {
  isSpeech: boolean;
  energy: number; // Energy in dB
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