/**
 * TextToSpeech (Phase 5) - Comprehensive Test Suite
 * 38+ test cases covering all TTS functionality
 * Using vitest framework
 */

import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import {
  TextToSpeech,
  type TTSConfig,
  type TTSVoiceProfile,
  TTSErrorCode,
  TTSError,
  type IElevenLabsAPI,
} from '../src/TextToSpeech';

// ============================================
// Test Fixtures & Mocks
// ============================================

class MockElevenLabsAPI implements IElevenLabsAPI {
  shouldFail = false;

  callCount = 0;

  async synthesize(text: string, voiceId: string, config: TTSConfig): Promise<Buffer> {
    this.callCount++;
    if (this.shouldFail) {
      throw new Error('API Error');
    }
    // Mock response: simple WAV data
    return this.generateMockAudio(text, 1.0);
  }

  private generateMockAudio(text: string, duration: number): Buffer {
    const sampleRate = 48000;
    const samples = Math.floor(sampleRate * duration);
    const buffer = Buffer.alloc(44 + samples * 2);

    // Simple WAV header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + samples * 2, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // Mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(samples * 2, 40);

    return buffer;
  }

  reset() {
    this.callCount = 0;
    this.shouldFail = false;
  }
}

// ============================================
// Tests
// ============================================

describe('TextToSpeech (Phase 5) - TTS Pipeline', () => {
  let tts: TextToSpeech;
  let mockAPI: MockElevenLabsAPI;
  const defaultConfig: TTSConfig = {
    apiKey: 'test-key-12345',
    voiceId: 'voice-nova',
    modelId: 'tts-1',
    sampleRate: 48000,
    format: 'pcm',
    stability: 0.5,
    similarity: 0.75,
    enableCaching: true,
    cacheSize: 100,
    maxRetries: 3,
    timeoutMs: 5000,
  };

  beforeEach(() => {
    mockAPI = new MockElevenLabsAPI();
    tts = new TextToSpeech(defaultConfig, mockAPI);
  });

  afterEach(async () => {
    await tts.shutdown();
    mockAPI.reset();
  });

  // ============================================
  // Section A: Initialization & Lifecycle (6 tests)
  // ============================================

  describe('Section A: Initialization & Lifecycle', () => {
    it('TC-A01: Constructor accepts valid config', () => {
      expect(tts).toBeDefined();
      expect(tts.getConfig()).toEqual(defaultConfig);
    });

    it('TC-A02: Constructor rejects invalid API key', () => {
      expect(() => {
        new TextToSpeech({ ...defaultConfig, apiKey: '' });
      }).toThrow();
    });

    it('TC-A03: Constructor rejects invalid voice ID', () => {
      expect(() => {
        new TextToSpeech({ ...defaultConfig, voiceId: '' });
      }).toThrow();
    });

    it('TC-A04: Constructor rejects invalid sample rate (not 48kHz)', () => {
      expect(() => {
        new TextToSpeech({ ...defaultConfig, sampleRate: 44100 });
      }).toThrow();
    });

    it('TC-A05: shutdown() stops processing and clears cache', async () => {
      await tts.shutdown();
      expect(tts.getCacheSize()).toBe(0);
    });

    it('TC-A06: reset() clears cache but keeps handler alive', () => {
      // Pre-populate cache with a dummy entry via synthesize
      tts.reset();
      expect(tts.getCacheSize()).toBe(0);
    });
  });

  // ============================================
  // Section B: Text Synthesis (8 tests)
  // ============================================

  describe('Section B: Text Synthesis', () => {
    it('TC-B01: synthesize() accepts valid text and returns TTSResponse', async () => {
      const response = await tts.synthesize('Hello world');
      expect(response).toBeDefined();
      expect(response.text).toBe('Hello world');
      expect(response.audio).toBeInstanceOf(Buffer);
      expect(response.duration).toBeGreaterThan(0);
    });

    it('TC-B02: synthesize() rejects empty text', async () => {
      try {
        await tts.synthesize('');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.code).toBe(TTSErrorCode.INVALID_INPUT);
      }
    });

    it('TC-B03: synthesize() rejects excessively long text (>5000 chars)', async () => {
      const longText = 'A'.repeat(5001);
      try {
        await tts.synthesize(longText);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.code).toBe(TTSErrorCode.TEXT_TOO_LONG);
      }
    });

    it('TC-B04: synthesize() handles special characters correctly', async () => {
      const response = await tts.synthesize('Hello, World! How are you? @#$%');
      expect(response.text).toContain('Hello');
      expect(response.audio).toBeInstanceOf(Buffer);
    });

    it('TC-B05: synthesize() creates buffer with correct format', async () => {
      const response = await tts.synthesize('Test audio');
      expect(response.audio).toBeInstanceOf(Buffer);
      expect(response.audio.length).toBeGreaterThan(0);
      expect(response.format).toBe('pcm');
    });

    it('TC-B06: synthesize() calculates duration based on audio length', async () => {
      const response = await tts.synthesize('Test');
      expect(response.duration).toBeGreaterThan(0);
      expect(typeof response.duration).toBe('number');
    });

    it('TC-B07: synthesize() with custom voice profile', async () => {
      const voiceProfile: TTSVoiceProfile = {
        voiceId: 'voice-custom',
        stability: 0.8,
        similarity: 0.9,
      };
      const response = await tts.synthesize('Hello', voiceProfile);
      expect(response.voiceId).toBe('voice-custom');
    });

    it('TC-B08: synthesize() returns metadata with text and timestamps', async () => {
      const response = await tts.synthesize('Test text');
      expect(response.text).toBe('Test text');
      expect(typeof response.timestamp).toBe('number');
      expect(response.timestamp).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Section C: Audio Encoding & Conversion (6 tests)
  // ============================================

  describe('Section C: Audio Encoding & Conversion', () => {
    it('TC-C01: encodeToOpus() converts PCM to Opus format', async () => {
      const pcmData = new Float32Array(960 * 2); // 960 samples, stereo
      for (let i = 0; i < pcmData.length; i++) {
        pcmData[i] = Math.sin(i / 100) * 0.5;
      }
      const opusBuffer = await tts.encodeToOpus(pcmData);
      expect(opusBuffer).toBeInstanceOf(Uint8Array);
      expect(opusBuffer.length).toBeGreaterThan(0);
      expect(opusBuffer.length).toBeLessThan(200); // Typical Opus frame
    });

    it('TC-C02: encodeToOpus() rejects invalid PCM data', async () => {
      const invalidData = new Float32Array(100); // Wrong size
      try {
        await tts.encodeToOpus(invalidData);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.code).toBe(TTSErrorCode.INVALID_AUDIO_FORMAT);
      }
    });

    it('TC-C03: encodeToOpus() maintains audio quality', async () => {
      const pcmData = new Float32Array(960 * 2);
      for (let i = 0; i < pcmData.length; i++) {
        pcmData[i] = Math.sin(i / 100) * 0.3; // -10dB
      }
      const opusBuffer = await tts.encodeToOpus(pcmData);
      expect(opusBuffer.length).toBeGreaterThan(10); // Non-empty Opus
    });

    it('TC-C04: encodeToOpus() produces 20-60 byte Opus frames', async () => {
      const pcmData = new Float32Array(960 * 2);
      const opusBuffer = await tts.encodeToOpus(pcmData);
      expect(opusBuffer.length).toBeGreaterThanOrEqual(20);
      expect(opusBuffer.length).toBeLessThanOrEqual(60);
    });

    it('TC-C05: convertWAVtoPCM() extracts audio data from WAV', async () => {
      const response = await tts.synthesize('Test');
      const pcmData = await tts.convertWAVtoPCM(Buffer.from(response.audio));
      expect(pcmData).toBeInstanceOf(Float32Array);
      expect(pcmData.length).toBeGreaterThan(0);
    });

    it('TC-C06: convertWAVtoPCM() rejects invalid WAV data', async () => {
      const invalidWAV = Buffer.from('invalid data');
      try {
        await tts.convertWAVtoPCM(invalidWAV);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.code).toBe(TTSErrorCode.INVALID_AUDIO_FORMAT);
      }
    });
  });

  // ============================================
  // Section D: Caching & Performance (5 tests)
  // ============================================

  describe('Section D: Caching & Performance', () => {
    it('TC-D01: Caching enabled - repeated text returns cached result', async () => {
      mockAPI.reset();
      const text = 'Hello cached world';

      // First call - should hit API
      await tts.synthesize(text);
      expect(mockAPI.callCount).toBe(1);

      // Second call - should use cache
      const cached = await tts.synthesize(text);
      expect(mockAPI.callCount).toBe(1); // No new API call
      expect(cached.text).toBe(text);
    });

    it('TC-D02: Cache hit improves response time significantly', async () => {
      const text = 'Test cache performance';

      // First call - not cached
      const start1 = Date.now();
      await tts.synthesize(text);
      const time1 = Date.now() - start1;

      // Second call - cached (should be instant or very fast)
      const start2 = Date.now();
      const cached = await tts.synthesize(text);
      const time2 = Date.now() - start2;

      // Verify cache was used
      expect(cached.text).toBe(text);
      // Cached should be faster or equal (not slower)
      expect(time2).toBeLessThanOrEqual(time1 + 1); // Allow 1ms margin for timing variance
    });

    it('TC-D03: Cache respects size limit (maxCacheSize)', async () => {
      const smallTTS = new TextToSpeech({ ...defaultConfig, cacheSize: 2 }, mockAPI);

      await smallTTS.synthesize('Text 1');
      await smallTTS.synthesize('Text 2');
      expect(smallTTS.getCacheSize()).toBe(2);

      await smallTTS.synthesize('Text 3'); // Should evict oldest
      expect(smallTTS.getCacheSize()).toBe(2);

      await smallTTS.shutdown();
    });

    it('TC-D04: Caching disabled - API called each time', async () => {
      const noCacheTTS = new TextToSpeech({ ...defaultConfig, enableCaching: false }, mockAPI);
      mockAPI.reset();

      const text = 'No cache test';
      await noCacheTTS.synthesize(text);
      expect(mockAPI.callCount).toBe(1);

      await noCacheTTS.synthesize(text);
      expect(mockAPI.callCount).toBe(2); // API called again

      await noCacheTTS.shutdown();
    });

    it('TC-D05: getCacheSize() returns correct count', async () => {
      expect(tts.getCacheSize()).toBe(0);

      await tts.synthesize('Text 1');
      expect(tts.getCacheSize()).toBe(1);

      await tts.synthesize('Text 2');
      expect(tts.getCacheSize()).toBe(2);
    });
  });

  // ============================================
  // Section E: Error Handling & Retry (5 tests)
  // ============================================

  describe('Section E: Error Handling & Retry', () => {
    it('TC-E01: synthesize() retries on transient failure (< maxRetries)', async () => {
      mockAPI.reset();
      mockAPI.shouldFail = true;

      try {
        await tts.synthesize('Test');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.retryCount).toBeGreaterThan(0);
        expect(error.retryCount).toBe(defaultConfig.maxRetries);
      }

      mockAPI.shouldFail = false;
    });

    it('TC-E02: onError() callback fires on synthesis failure', async () => {
      let errorCaught = false;
      tts.onError((error: TTSError) => {
        errorCaught = true;
        expect(error).toBeDefined();
        expect(error.code).toBeDefined();
      });

      mockAPI.shouldFail = true;
      try {
        await tts.synthesize('Test');
      } catch {}

      expect(errorCaught).toBe(true);
      mockAPI.shouldFail = false;
    });

    it('TC-E03: getLastError() returns most recent error', async () => {
      mockAPI.shouldFail = true;

      try {
        await tts.synthesize('Test 1');
      } catch {}

      const lastError = tts.getLastError();
      expect(lastError).toBeDefined();
      expect(typeof lastError?.timestamp).toBe('number');

      mockAPI.shouldFail = false;
    });

    it('TC-E04: Error includes context and recoverable flag', async () => {
      mockAPI.shouldFail = true;

      try {
        await tts.synthesize('Test');
      } catch (error: any) {
        expect(typeof error.recoverable).toBe('boolean');
        expect(error.context).toBeDefined();
      }

      mockAPI.shouldFail = false;
    });

    it('TC-E05: clearErrorCallbacks() removes all error handlers', async () => {
      let callCount = 0;
      tts.onError(() => callCount++);
      tts.clearErrorCallbacks();

      // Trigger error (won't call callback)
      mockAPI.shouldFail = true;
      try {
        await tts.synthesize('Test');
      } catch {}

      expect(callCount).toBe(0);
      mockAPI.shouldFail = false;
    });
  });

  // ============================================
  // Section F: Voice Profiles & Settings (4 tests)
  // ============================================

  describe('Section F: Voice Profiles & Settings', () => {
    it('TC-F01: setVoiceProfile() updates TTS voice settings', async () => {
      const profile: TTSVoiceProfile = {
        voiceId: 'voice-new',
        stability: 0.9,
        similarity: 0.95,
      };

      tts.setVoiceProfile(profile);
      const response = await tts.synthesize('Test');
      expect(response.voiceId).toBe('voice-new');
    });

    it('TC-F02: Multiple voice profiles can be set and switched', async () => {
      const profile1: TTSVoiceProfile = {
        voiceId: 'voice-1',
        stability: 0.5,
        similarity: 0.7,
      };

      const profile2: TTSVoiceProfile = {
        voiceId: 'voice-2',
        stability: 0.9,
        similarity: 0.95,
      };

      tts.setVoiceProfile(profile1);
      const resp1 = await tts.synthesize('Test 1');

      tts.setVoiceProfile(profile2);
      const resp2 = await tts.synthesize('Test 2');

      expect(resp1.voiceId).toBe('voice-1');
      expect(resp2.voiceId).toBe('voice-2');
    });

    it('TC-F03: Voice profile stability/similarity affect output', async () => {
      const profile: TTSVoiceProfile = {
        voiceId: 'voice-stable',
        stability: 0.95,
        similarity: 0.95,
      };

      tts.setVoiceProfile(profile);
      const response = await tts.synthesize('Test');
      expect(response.stability).toBe(0.95);
      expect(response.similarity).toBe(0.95);
    });

    it('TC-F04: Default voice profile used if not set', async () => {
      const response = await tts.synthesize('Default voice');
      expect(response.voiceId).toBe(defaultConfig.voiceId);
    });
  });

  // ============================================
  // Section G: Statistics & Monitoring (3 tests)
  // ============================================

  describe('Section G: Statistics & Monitoring', () => {
    it('TC-G01: getStats() returns synthesis statistics', async () => {
      await tts.synthesize('Test 1');
      await tts.synthesize('Test 2');

      const stats = tts.getStats();
      expect(stats).toBeDefined();
      expect(stats.totalSynthesized).toBe(2);
      expect(stats.totalErrors).toBe(0);
      expect(typeof stats.cacheHits).toBe('number');
    });

    it('TC-G02: Statistics track cache hits and misses', async () => {
      const statsBefore = tts.getStats();

      // First call - cache miss
      await tts.synthesize('Stat test');
      const statsAfter1 = tts.getStats();
      expect(statsAfter1.totalSynthesized).toBe(statsBefore.totalSynthesized + 1);

      // Second call - cache hit
      await tts.synthesize('Stat test');
      const statsAfter2 = tts.getStats();
      expect(statsAfter2.cacheHits).toBeGreaterThan(statsAfter1.cacheHits);
    });

    it('TC-G03: resetStats() clears all counters', async () => {
      await tts.synthesize('Test');
      tts.resetStats();

      const stats = tts.getStats();
      expect(stats.totalSynthesized).toBe(0);
      expect(stats.totalErrors).toBe(0);
    });
  });

  // ============================================
  // Section H: Integration with Phase 3 (3 tests)
  // ============================================

  describe('Section H: Integration with Phase 3 (AudioStreamHandler)', () => {
    it('TC-H01: encodeToOpus() produces compatible format for Phase 3', async () => {
      const pcmData = new Float32Array(960 * 2);
      const opusBuffer = await tts.encodeToOpus(pcmData);

      // Should match Phase 3 expectations
      expect(opusBuffer).toBeInstanceOf(Uint8Array);
      expect(opusBuffer.length).toBeGreaterThanOrEqual(20);
      expect(opusBuffer.length).toBeLessThanOrEqual(60);
    });

    it('TC-H02: Audio output is 48kHz stereo (Discord standard)', async () => {
      const response = await tts.synthesize('Test');
      expect(response.sampleRate).toBe(48000);
      expect(response.channels).toBe(2);
    });

    it('TC-H03: Full pipeline: synthesize → convert → encode produces valid Opus', async () => {
      // Simulate full TTS to Opus pipeline
      const response = await tts.synthesize('Hello Discord');
      const pcmData = await tts.convertWAVtoPCM(Buffer.from(response.audio));

      // Extract first frame (960 samples × 2 channels = 1920)
      const firstFrame = new Float32Array(1920);
      for (let i = 0; i < Math.min(1920, pcmData.length); i++) {
        firstFrame[i] = pcmData[i];
      }

      const opusBuffer = await tts.encodeToOpus(firstFrame);

      expect(opusBuffer).toBeInstanceOf(Uint8Array);
      expect(opusBuffer.length).toBeGreaterThan(0);
    });
  });
});
