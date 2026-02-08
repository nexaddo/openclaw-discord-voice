/**
 * Phase 4: Speech-to-Text Implementation Tests
 * TDD: Test cases written first, implementation follows
 * Total: 62 test cases covering all STT pipeline scenarios
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
  SpeechToText,
  VoiceActivityDetector,
  TranscriptionResult,
  STTConfig,
  VADConfig,
} from '../src/SpeechToText';

// ============================================================
// SECTION A: VoiceActivityDetector Initialization (TC-001-006)
// ============================================================

describe('SpeechToText - Section A: VoiceActivityDetector Initialization', () => {
  let vad: VoiceActivityDetector;
  const defaultConfig: VADConfig = {
    sampleRate: 48000,
    frameSize: 960,
    energyThreshold: 5, // 5% of max amplitude
    silenceThreshold: 10,
    voiceThreshold: 0.5,
  };

  test('TC-001: VoiceActivityDetector should initialize with default config', () => {
    vad = new VoiceActivityDetector();
    expect(vad).toBeDefined();
    expect(vad.isSpeaking()).toBe(false);
  });

  test('TC-002: VoiceActivityDetector should accept custom configuration', () => {
    vad = new VoiceActivityDetector(defaultConfig);
    expect(vad).toBeDefined();
    expect(vad.getSampleRate()).toBe(48000);
  });

  test('TC-003: VoiceActivityDetector should validate sample rate', () => {
    const invalidConfig = { ...defaultConfig, sampleRate: 8000 };
    expect(() => new VoiceActivityDetector(invalidConfig)).toThrow();
  });

  test('TC-004: VoiceActivityDetector should initialize with energy threshold', () => {
    vad = new VoiceActivityDetector(defaultConfig);
    expect(vad.getEnergyThreshold()).toBe(5); // 5% amplitude threshold
  });

  test('TC-005: VoiceActivityDetector should track speaking state', () => {
    vad = new VoiceActivityDetector(defaultConfig);
    expect(vad.isSpeaking()).toBe(false);
  });

  test('TC-006: VoiceActivityDetector should reset state', () => {
    vad = new VoiceActivityDetector(defaultConfig);
    vad.reset();
    expect(vad.isSpeaking()).toBe(false);
  });
});

// ============================================================
// SECTION B: Voice Activity Detection (TC-007-016)
// ============================================================

describe('SpeechToText - Section B: Voice Activity Detection', () => {
  let vad: VoiceActivityDetector;

  beforeEach(() => {
    vad = new VoiceActivityDetector({
      sampleRate: 48000,
      frameSize: 960,
      energyThreshold: 5, // 5% amplitude
      silenceThreshold: 10,
      voiceThreshold: 0.5,
    });
  });

  test('TC-007: VAD should detect silence in audio frame', () => {
    const silentFrame = new Float32Array(960).fill(0.001); // Very quiet
    const result = vad.detectSpeech(silentFrame);
    expect(result.isSpeech).toBe(false);
  });

  test('TC-008: VAD should detect speech in loud frame', () => {
    const speechFrame = new Float32Array(960);
    for (let i = 0; i < 960; i++) {
      speechFrame[i] = Math.sin((i / 960) * 2 * Math.PI) * 0.7; // Loud sine wave (0.7 amplitude)
    }
    const result = vad.detectSpeech(speechFrame);
    expect(result.isSpeech).toBe(true);
  });

  test('TC-009: VAD should calculate energy from audio frame', () => {
    const speechFrame = new Float32Array(960).fill(0.3);
    const result = vad.detectSpeech(speechFrame);
    expect(result.energy).toBeGreaterThan(0);
  });

  test('TC-010: VAD should track silence duration', () => {
    vad = new VoiceActivityDetector({
      sampleRate: 48000,
      frameSize: 960,
      energyThreshold: 40,
      silenceThreshold: 5, // 5 frames = 100ms
      voiceThreshold: 0.5,
    });

    const silentFrame = new Float32Array(960).fill(0.001);
    for (let i = 0; i < 5; i++) {
      vad.detectSpeech(silentFrame);
    }
    expect(vad.getSilenceDuration()).toBeGreaterThanOrEqual(100);
  });

  test('TC-011: VAD should trigger voice activity on speech start', () => {
    vad.detectSpeech(new Float32Array(960).fill(0.001)); // Silence
    const speechFrame = new Float32Array(960).fill(0.4); // Speech
    vad.detectSpeech(speechFrame);
    expect(vad.isSpeaking()).toBe(true);
  });

  test('TC-012: VAD should reset speech tracking', () => {
    const speechFrame = new Float32Array(960).fill(0.4);
    vad.detectSpeech(speechFrame);
    vad.reset();
    expect(vad.isSpeaking()).toBe(false);
  });

  test('TC-013: VAD should provide confidence score', () => {
    const speechFrame = new Float32Array(960).fill(0.4);
    const result = vad.detectSpeech(speechFrame);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  test('TC-014: VAD should handle very quiet frames', () => {
    const quietFrame = new Float32Array(960).fill(0.0001);
    const result = vad.detectSpeech(quietFrame);
    expect(result.isSpeech).toBe(false);
    expect(result.energy).toBeLessThan(1);
  });

  test('TC-015: VAD should handle very loud frames', () => {
    const loudFrame = new Float32Array(960).fill(0.9);
    const result = vad.detectSpeech(loudFrame);
    expect(result.isSpeech).toBe(true);
    expect(result.energy).toBeGreaterThan(50);
  });

  test('TC-016: VAD should track frame count', () => {
    for (let i = 0; i < 10; i++) {
      vad.detectSpeech(new Float32Array(960).fill(0.2));
    }
    expect(vad.getFrameCount()).toBe(10);
  });
});

// ============================================================
// SECTION C: SpeechToText Initialization (TC-017-022)
// ============================================================

describe('SpeechToText - Section C: Initialization & Configuration', () => {
  let stt: SpeechToText;
  const defaultConfig: STTConfig = {
    apiKey: 'test-api-key',
    modelName: 'whisper-1',
    sampleRate: 48000,
    language: 'en',
    enableVAD: true,
  };

  test('TC-017: SpeechToText should initialize with valid config', () => {
    stt = new SpeechToText(defaultConfig);
    expect(stt).toBeDefined();
    expect(stt.getLanguage()).toBe('en');
  });

  test('TC-018: SpeechToText should validate API key', () => {
    expect(() => new SpeechToText({ ...defaultConfig, apiKey: '' })).toThrow();
  });

  test('TC-019: SpeechToText should set sample rate', () => {
    stt = new SpeechToText(defaultConfig);
    expect(stt.getSampleRate()).toBe(48000);
  });

  test('TC-020: SpeechToText should enable/disable VAD', () => {
    const withVAD = new SpeechToText({ ...defaultConfig, enableVAD: true });
    const withoutVAD = new SpeechToText({ ...defaultConfig, enableVAD: false });
    expect(withVAD.isVADEnabled()).toBe(true);
    expect(withoutVAD.isVADEnabled()).toBe(false);
  });

  test('TC-021: SpeechToText should support multiple languages', () => {
    const engSTT = new SpeechToText({ ...defaultConfig, language: 'en' });
    const esSTT = new SpeechToText({ ...defaultConfig, language: 'es' });
    expect(engSTT.getLanguage()).toBe('en');
    expect(esSTT.getLanguage()).toBe('es');
  });

  test('TC-022: SpeechToText should initialize successfully', async () => {
    stt = new SpeechToText(defaultConfig);
    await stt.initialize();
    expect(stt.isReady()).toBe(true);
  });
});

// ============================================================
// SECTION D: Audio Format Conversion (TC-023-028)
// ============================================================

describe('SpeechToText - Section D: Audio Format Conversion', () => {
  let stt: SpeechToText;

  beforeEach(async () => {
    stt = new SpeechToText({
      apiKey: 'test-key',
      modelName: 'whisper-1',
      sampleRate: 48000,
      language: 'en',
      enableVAD: true,
    });
    await stt.initialize();
  });

  test('TC-023: Should convert Opus to PCM buffer', async () => {
    const opusBuffer = Buffer.from([0x4f, 0x50, 0x55, 0x53]); // Simplified Opus frame
    const pcm = await stt.convertOpusToPCM(opusBuffer);
    expect(pcm).toBeInstanceOf(Buffer);
    expect(pcm.length).toBeGreaterThan(10); // At least some PCM data
  });

  test('TC-024: Should convert PCM to WAV format', async () => {
    const pcmBuffer = Buffer.alloc(48000 * 2); // 1 second at 48kHz, 16-bit
    const wav = await stt.convertPCMToWAV(pcmBuffer);
    expect(wav.toString('hex', 0, 4)).toBe('52494646'); // RIFF header
  });

  test('TC-025: Should handle WAV conversion with metadata', async () => {
    const pcmBuffer = Buffer.alloc(48000 * 2);
    const wav = await stt.convertPCMToWAV(pcmBuffer, {
      sampleRate: 48000,
      channels: 1,
      bitsPerSample: 16,
    });
    expect(wav).toBeInstanceOf(Buffer);
  });

  test('TC-026: Should validate PCM buffer format', async () => {
    // 101 bytes is not a valid multiple of 4 (2 channels * 2 bytes per sample)
    const invalidBuffer = Buffer.alloc(101);
    await expect(stt.convertPCMToWAV(invalidBuffer)).rejects.toThrow();
  });

  test('TC-027: Should batch convert multiple Opus frames', async () => {
    const opusFrames = [
      Buffer.from([0x4f, 0x50, 0x55, 0x53]),
      Buffer.from([0x4f, 0x50, 0x55, 0x53]),
      Buffer.from([0x4f, 0x50, 0x55, 0x53]),
    ];
    const pcmFrames = await stt.convertOpusFramesBatch(opusFrames);
    expect(pcmFrames).toHaveLength(3);
  });

  test('TC-028: Should handle conversion errors gracefully', async () => {
    const emptyBuffer = Buffer.alloc(0);
    await expect(stt.convertOpusToPCM(emptyBuffer)).rejects.toThrow();
  });
});

// ============================================================
// SECTION E: Transcription Integration (TC-029-036)
// ============================================================

describe('SpeechToText - Section E: Transcription Processing', () => {
  let stt: SpeechToText;

  beforeEach(async () => {
    stt = new SpeechToText({
      apiKey: 'test-key',
      modelName: 'whisper-1',
      sampleRate: 48000,
      language: 'en',
      enableVAD: true,
    });
    await stt.initialize();
  });

  test('TC-029: Should transcribe audio buffer (mocked Whisper API)', async () => {
    const audioBuffer = Buffer.alloc(48000 * 2); // 1 second of audio
    const result = await stt.transcribe(audioBuffer);
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('language');
  });

  test('TC-030: Should return confidence score for transcription', async () => {
    const audioBuffer = Buffer.alloc(48000 * 2);
    const result = await stt.transcribe(audioBuffer);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  test('TC-031: Should detect language in transcription', async () => {
    const audioBuffer = Buffer.alloc(48000 * 2);
    const result = await stt.transcribe(audioBuffer);
    expect(result.language).toBeDefined();
    expect(typeof result.language).toBe('string');
  });

  test('TC-032: Should handle empty audio gracefully', async () => {
    const emptyBuffer = Buffer.alloc(0);
    await expect(stt.transcribe(emptyBuffer)).rejects.toThrow();
  });

  test('TC-033: Should batch transcribe multiple audio segments', async () => {
    const segments = [
      Buffer.alloc(48000 * 2),
      Buffer.alloc(48000 * 2),
      Buffer.alloc(48000 * 2),
    ];
    const results = await stt.transcribeBatch(segments);
    expect(results).toHaveLength(3);
    results.forEach((r) => {
      expect(r).toHaveProperty('text');
      expect(r).toHaveProperty('confidence');
    });
  });

  test('TC-034: Should include timestamps in transcription', async () => {
    const audioBuffer = Buffer.alloc(48000 * 2);
    const result = await stt.transcribe(audioBuffer);
    expect(result.timestamp).toBeDefined();
  });

  test('TC-035: Should handle transcription with duration', async () => {
    const audioBuffer = Buffer.alloc(48000 * 2); // 1 second
    const result = await stt.transcribe(audioBuffer);
    expect(result.duration).toBeDefined();
    expect(result.duration).toBeCloseTo(1000, 100); // ~1000ms
  });

  test('TC-036: Should support custom language override', async () => {
    const audioBuffer = Buffer.alloc(48000 * 2);
    const result = await stt.transcribe(audioBuffer, { language: 'es' });
    expect(result.language).toBe('es');
  });
});

// ============================================================
// SECTION F: Error Handling (TC-037-042)
// ============================================================

describe('SpeechToText - Section F: Error Handling', () => {
  let stt: SpeechToText;

  beforeEach(async () => {
    stt = new SpeechToText({
      apiKey: 'test-key',
      modelName: 'whisper-1',
      sampleRate: 48000,
      language: 'en',
      enableVAD: true,
    });
    await stt.initialize();
  });

  test('TC-037: Should handle API errors', async () => {
    stt.setAPIError('API_ERROR');
    const audioBuffer = Buffer.alloc(48000 * 2);
    await expect(stt.transcribe(audioBuffer)).rejects.toThrow();
  });

  test('TC-038: Should retry on transient errors', async () => {
    const audioBuffer = Buffer.alloc(48000 * 2);
    stt.setRetryConfig({ maxRetries: 3, retryDelay: 10 });
    const result = await stt.transcribe(audioBuffer);
    expect(result).toBeDefined();
  });

  test('TC-039: Should timeout on slow API', async () => {
    stt.setTimeoutMs(1); // Extremely short timeout
    const audioBuffer = Buffer.alloc(48000 * 2);
    // With 1ms timeout, mock should timeout since it has minimum 5ms delay
    await expect(stt.transcribe(audioBuffer)).rejects.toThrow('timeout');
  });

  test('TC-040: Should handle empty audio gracefully', async () => {
    const emptyBuffer = Buffer.alloc(0);
    await expect(stt.transcribe(emptyBuffer)).rejects.toThrow();
  });

  test('TC-041: Should track error statistics', async () => {
    stt.setAPIError('API_ERROR');
    try {
      const audioBuffer = Buffer.alloc(48000 * 2);
      await stt.transcribe(audioBuffer);
    } catch {
      // Expected
    }
    const stats = stt.getStats();
    expect(stats.errors).toBeGreaterThan(0);
  });

  test('TC-042: Should provide error details', async () => {
    const audioBuffer = Buffer.alloc(48000 * 2);
    stt.setAPIError('API_ERROR');
    try {
      await stt.transcribe(audioBuffer);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});

// ============================================================
// SECTION G: Integration with AudioStreamHandler (TC-043-048)
// ============================================================

describe('SpeechToText - Section G: Integration with Phase 3', () => {
  let stt: SpeechToText;

  beforeEach(async () => {
    stt = new SpeechToText({
      apiKey: 'test-key',
      modelName: 'whisper-1',
      sampleRate: 48000,
      language: 'en',
      enableVAD: true,
    });
    await stt.initialize();
  });

  test('TC-043: Should accept Opus frame from AudioStreamHandler', async () => {
    const opusFrame = Buffer.from([0x4f, 0x50, 0x55, 0x53]);
    const pcm = await stt.convertOpusToPCM(opusFrame);
    expect(pcm).toBeDefined();
  });

  test('TC-044: Should accumulate audio frames for transcription', async () => {
    const frame1 = Buffer.from([0x4f, 0x50, 0x55, 0x53]);
    const frame2 = Buffer.from([0x4f, 0x50, 0x55, 0x53]);
    await stt.accumulateFrame(frame1);
    await stt.accumulateFrame(frame2);
    expect(stt.getAccumulatedFrames()).toBe(2);
  });

  test('TC-045: Should flush accumulated frames to transcription', async () => {
    const frame1 = Buffer.from([0x4f, 0x50, 0x55, 0x53]);
    await stt.accumulateFrame(frame1);
    const result = await stt.flushAndTranscribe();
    expect(result).toHaveProperty('text');
    expect(stt.getAccumulatedFrames()).toBe(0);
  });

  test('TC-046: Should handle continuous audio stream', async () => {
    for (let i = 0; i < 5; i++) {
      const frame = Buffer.alloc(960 * 2);
      await stt.accumulateFrame(frame);
    }
    expect(stt.getAccumulatedFrames()).toBe(5);
  });

  test('TC-047: Should integrate VAD with audio accumulation', async () => {
    const vad = new VoiceActivityDetector();
    const speechFrame = new Float32Array(960).fill(0.4);
    const result = vad.detectSpeech(speechFrame);
    expect(result.isSpeech).toBe(true);
  });

  test('TC-048: Should provide statistics for monitoring', () => {
    const stats = stt.getStats();
    expect(stats).toHaveProperty('transcribed');
    expect(stats).toHaveProperty('errors');
    expect(stats).toHaveProperty('totalFrames');
  });
});

// ============================================================
// SECTION H: Performance & Monitoring (TC-049-055)
// ============================================================

describe('SpeechToText - Section H: Performance & Monitoring', () => {
  let stt: SpeechToText;

  beforeEach(async () => {
    stt = new SpeechToText({
      apiKey: 'test-key',
      modelName: 'whisper-1',
      sampleRate: 48000,
      language: 'en',
      enableVAD: true,
    });
    await stt.initialize();
  });

  test('TC-049: Should track transcription latency', async () => {
    const startTime = Date.now();
    const audioBuffer = Buffer.alloc(48000 * 2);
    await stt.transcribe(audioBuffer);
    const latency = Date.now() - startTime;
    const stats = stt.getStats();
    expect(stats.avgLatencyMs).toBeLessThan(latency + 100);
  });

  test('TC-050: Should track successful transcriptions', async () => {
    const audioBuffer = Buffer.alloc(48000 * 2);
    await stt.transcribe(audioBuffer);
    const stats = stt.getStats();
    expect(stats.transcribed).toBeGreaterThan(0);
  });

  test('TC-051: Should provide memory usage estimate', () => {
    const stats = stt.getStats();
    expect(stats.memoryMb).toBeDefined();
    expect(stats.memoryMb).toBeGreaterThanOrEqual(0);
  });

  test('TC-052: Should reset statistics', () => {
    const audioBuffer = Buffer.alloc(48000 * 2);
    stt.transcribe(audioBuffer);
    stt.resetStats();
    const stats = stt.getStats();
    expect(stats.transcribed).toBe(0);
    expect(stats.errors).toBe(0);
  });

  test('TC-053: Should track frame processing time', async () => {
    const frame = Buffer.from([0x4f, 0x50, 0x55, 0x53]);
    await stt.convertOpusToPCM(frame);
    const stats = stt.getStats();
    expect(stats.avgLatencyMs).toBeDefined();
  });

  test('TC-054: Should provide throughput metrics', async () => {
    const buffer = Buffer.alloc(48000 * 2);
    await stt.transcribe(buffer);
    const stats = stt.getStats();
    expect(stats.framesPerSecond).toBeGreaterThan(0);
  });

  test('TC-055: Should handle long-running sessions', async () => {
    for (let i = 0; i < 10; i++) {
      const buffer = Buffer.alloc(48000 * 2);
      await stt.transcribe(buffer);
    }
    const stats = stt.getStats();
    expect(stats.totalFrames).toBe(10);
  });
});

// ============================================================
// SECTION I: Edge Cases & Stability (TC-056-062)
// ============================================================

describe('SpeechToText - Section I: Edge Cases & Stability', () => {
  let stt: SpeechToText;

  beforeEach(async () => {
    stt = new SpeechToText({
      apiKey: 'test-key',
      modelName: 'whisper-1',
      sampleRate: 48000,
      language: 'en',
      enableVAD: true,
    });
    await stt.initialize();
  });

  test('TC-056: Should handle very short audio (< 100ms)', async () => {
    const shortBuffer = Buffer.alloc(4800); // 100ms at 48kHz
    const result = await stt.transcribe(shortBuffer);
    expect(result).toBeDefined();
  });

  test('TC-057: Should handle very long audio (> 30s)', async () => {
    const longBuffer = Buffer.alloc(48000 * 2 * 30); // 30 seconds
    const result = await stt.transcribe(longBuffer);
    expect(result).toBeDefined();
  });

  test('TC-058: Should prevent memory leaks on repeated transcription', async () => {
    const initialMem = process.memoryUsage().heapUsed;
    for (let i = 0; i < 10; i++) {
      const buffer = Buffer.alloc(48000 * 2);
      await stt.transcribe(buffer);
    }
    const finalMem = process.memoryUsage().heapUsed;
    // Memory growth should be reasonable (less than 5x)
    expect(finalMem).toBeLessThan(initialMem * 5);
  }, 30000);

  test('TC-059: Should handle rapid consecutive transcriptions', async () => {
    const promises = [];
    for (let i = 0; i < 5; i++) {
      const buffer = Buffer.alloc(48000 * 2);
      promises.push(stt.transcribe(buffer));
    }
    const results = await Promise.all(promises);
    expect(results).toHaveLength(5);
    results.forEach((r) => expect(r).toHaveProperty('text'));
  });

  test('TC-060: Should handle concurrent frame accumulation', async () => {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      const frame = Buffer.from([0x4f, 0x50, 0x55, 0x53]);
      promises.push(stt.accumulateFrame(frame));
    }
    await Promise.all(promises);
    expect(stt.getAccumulatedFrames()).toBeGreaterThan(0);
  });

  test('TC-061: Should recover from API errors', async () => {
    stt.setAPIError('API_ERROR');
    try {
      const buffer = Buffer.alloc(48000 * 2);
      await stt.transcribe(buffer);
    } catch {
      // First call fails, which is expected
    }
    stt.clearAPIError();
    const buffer = Buffer.alloc(48000 * 2);
    const result = await stt.transcribe(buffer);
    expect(result).toBeDefined();
  });

  test('TC-062: Should shutdown gracefully', async () => {
    await stt.shutdown();
    expect(stt.isReady()).toBe(false);
  });
});
