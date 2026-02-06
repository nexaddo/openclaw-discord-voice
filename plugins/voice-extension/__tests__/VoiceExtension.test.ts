import { describe, it, expect } from 'vitest';
import { VoiceExtension } from '../src/VoiceExtension';

describe('VoiceExtension', () => {
  it('should be importable', () => {
    expect(VoiceExtension).toBeDefined();
  });

  it('should have name property', () => {
    expect(VoiceExtension.name).toBe('VoiceExtension');
  });

  it('should instantiate without errors', () => {
    const instance = new VoiceExtension();
    expect(instance).toBeDefined();
  });

  it('should expose version property', () => {
    const instance = new VoiceExtension();
    expect(instance.version).toBe('0.1.0');
  });
});
