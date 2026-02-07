# Voice Integration Dependencies Reference

**Last Updated:** 2026-02-06 18:31 EST  
**OpenClaw Version:** 2026.2.2-3  
**Node.js:** v22.22.0  

---

## Dependency Matrix

### Audio Codec (Required)

#### Option 1: @discordjs/opus (RECOMMENDED) ⭐

```json
{
  "name": "@discordjs/opus",
  "version": "^0.10.0",
  "type": "native binding",
  "size": "~50MB",
  "platforms": {
    "macOS x64": "✅ prebuilt",
    "macOS ARM64 (M1/M2/M3)": "✅ prebuilt",
    "Linux x64": "⚠️ requires build",
    "Windows": "⚠️ requires build"
  }
}
```

**Pros:**
- Official Discord.js codec
- Prebuilt binaries for common platforms
- Excellent performance
- Well-maintained

**Cons:**
- Requires native compilation on some platforms
- ~50MB footprint

**Installation:**
```bash
npm install @discordjs/opus@^0.10.0 --save
```

**Verification:**
```javascript
import OpusEncoder from '@discordjs/opus';
const encoder = new OpusEncoder.Encoder(48000, 2, 2880);
console.log('✅ Opus encoder ready');
```

---

#### Option 2: opusscript (FALLBACK)

```json
{
  "name": "opusscript",
  "version": "^0.0.8",
  "type": "pure JavaScript",
  "size": "~600KB",
  "performance": "~10x slower than native"
}
```

**When to use:**
- Development/testing without build tools
- Platforms where native compilation fails
- Temporary workaround

**Installation:**
```bash
npm install opusscript@^0.0.8
```

**Performance Impact:** 10x slower, only suitable for non-real-time use

---

### Encryption & Crypto

#### Option 1: Node.js Native Crypto (CURRENT) ✅

**Status:** Available in Node.js 22  
**Support:** AES-256-GCM

```javascript
// Verify native support
const ciphers = require('crypto').getCiphers();
console.log(ciphers.includes('aes-256-gcm')); // true ✅
```

**Pros:**
- No additional dependencies
- Fast
- Well-tested

**Cons:**
- Limited to what Node.js provides
- No fallback on older Node.js versions

---

#### Option 2: sodium-native (OPTIONAL)

```json
{
  "name": "sodium-native",
  "version": "^5.0.10",
  "type": "native binding",
  "size": "~15MB",
  "requires": "libsodium system library"
}
```

**When to use:**
- Hardware acceleration desired
- Fallback for Node.js versions < 18
- Extra crypto primitives needed

**Installation:**
```bash
npm install sodium-native@^5.0.10 --save-optional
```

**macOS Requirements:**
```bash
# If compilation fails
brew install libsodium
# Then retry npm install
```

---

#### Option 3: libsodium-wrappers (OPTIONAL)

```json
{
  "name": "libsodium-wrappers",
  "version": "^0.8.2",
  "type": "JavaScript wrapper",
  "size": "~200KB",
  "requires": "libsodium.js (bundled)"
}
```

**When to use:**
- Pure JavaScript fallback
- Cross-platform guarantee
- No native compilation needed

**Installation:**
```bash
npm install libsodium-wrappers@^0.8.2 --save-optional
```

---

### Audio Processing (Already Installed)

#### prism-media 1.3.5 ✅

```json
{
  "name": "prism-media",
  "version": "1.3.5",
  "status": "installed",
  "purpose": "Audio transcoding and format conversion"
}
```

**Used for:**
- PCM ↔ Opus conversion
- Format detection
- Streaming support

**No installation needed** - already in OpenClaw

---

#### FFmpeg (Optional)

```json
{
  "name": "ffmpeg-static",
  "version": "^5.2.0",
  "type": "bundled binary",
  "size": "~100MB",
  "use_case": "Arbitrary audio format support"
}
```

**When to use:**
- Need to support MP3, WAV, FLAC input
- Phase 5+ (TTS integration)

**Installation (deferred to Phase 5):**
```bash
npm install ffmpeg-static@^5.2.0 --save-optional
```

---

## Complete Installation Manifest

### Required Dependencies
```json
{
  "@discordjs/opus": "^0.10.0",
  "@discordjs/voice": "0.19.0"
}
```

### Optional Dependencies (Recommended)
```json
{
  "sodium-native": "^5.0.10",
  "libsodium-wrappers": "^0.8.2"
}
```

### Already Provided by OpenClaw
```json
{
  "discord-api-types": "^0.38.38",
  "prism-media": "^1.3.5",
  "ws": "^8.19.0",
  "@types/ws": "^8.18.1"
}
```

---

## Version Compatibility Matrix

### OpenClaw Compatibility
| OpenClaw | Node.js | @discordjs/voice | @discordjs/opus |
|----------|---------|------------------|-----------------|
| 2026.2.2 | 22.22.0 | 0.19.0 ✅ | ^0.10.0 ✅ |
| 2025.x.x | 22.x.x | 0.19.0 ✅ | ^0.10.0 ✅ |
| 2024.x.x | 20.x.x | 0.19.0 ✅ | ^0.10.0 ✅ |

### Dependency Chain
```
@discordjs/voice@0.19.0
├── discord-api-types@^0.38.16 ✅ (0.38.38 available)
├── prism-media@^1.3.5 ✅ (1.3.5 installed)
│   └── [Optional peer deps]
│       ├── @discordjs/opus@>=0.8.0 <1.0.0 ⭐ To install: 0.10.0
│       └── opusscript@^0.0.8 (alternative)
├── ws@^8.18.3 ✅ (8.19.0 installed)
└── @types/ws@^8.18.1 ✅ (installed)

@discordjs/opus@^0.10.0
└── [No dependencies - binary only]

sodium-native@^5.0.10
└── libsodium (system library, not npm package)

libsodium-wrappers@^0.8.2
└── [No dependencies]
```

---

## Installation Steps

### Step 1: Update Main Package
Edit `/usr/local/lib/node_modules/openclaw/package.json`:

```json
{
  "dependencies": {
    "@discordjs/opus": "^0.10.0"
  },
  "optionalDependencies": {
    "sodium-native": "^5.0.10",
    "libsodium-wrappers": "^0.8.2",
    "ffmpeg-static": "^5.2.0"
  }
}
```

### Step 2: Install
```bash
cd /usr/local/lib/node_modules/openclaw/
npm install
```

### Step 3: Verify
```bash
# List all voice-related packages
npm list | grep -E "discord|opus|voice|prism|sodium"

# Should show:
# ├── @discordjs/opus@0.10.0
# ├── @discordjs/voice@0.19.0
# └── prism-media@1.3.5
```

### Step 4: Test Loading
```bash
node -e "import('@discordjs/opus').then(() => console.log('✅ opus')).catch(e => console.error('❌', e.message))"
node -e "import('@discordjs/voice').then(() => console.log('✅ voice')).catch(e => console.error('❌', e.message))"
node -e "import('prism-media').then(() => console.log('✅ prism')).catch(e => console.error('❌', e.message))"
```

### Step 5: Test Opus Encoding
```bash
node --input-type=module << 'EOF'
import OpusEncoder from '@discordjs/opus';
const encoder = new OpusEncoder.Encoder(48000, 2, 2880);
const pcm = Buffer.alloc(5760 * 2); // 5760 samples * 2 bytes
const opus = encoder.encode(pcm);
console.log(`✅ Encoded ${pcm.length} bytes PCM → ${opus.length} bytes Opus`);
EOF
```

---

## Troubleshooting

### Issue: npm install fails with "gyp ERR!"
**Cause:** Native module compilation failed  
**Solution:**
```bash
# macOS
xcode-select --install

# Ubuntu/Debian
sudo apt-get install build-essential python3

# Windows
# Install Visual Studio Build Tools 2022
# https://visualstudio.microsoft.com/downloads/

# Then retry
npm install
```

---

### Issue: "Cannot find module '@discordjs/opus'"
**Cause:** Installation didn't complete  
**Solution:**
```bash
# Clean and reinstall
cd /usr/local/lib/node_modules/openclaw/
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

---

### Issue: "libsodium.so.23 not found" (Linux)
**Cause:** System libsodium library missing  
**Solution:**
```bash
# Ubuntu/Debian
sudo apt-get install libsodium23 libsodium-dev

# CentOS/RHEL
sudo yum install libsodium libsodium-devel

# macOS
brew install libsodium
```

---

### Issue: Opus encoding produces silence
**Cause:** Sample rate/channel mismatch  
**Solution:**
```typescript
// Must be exactly:
const encoder = new OpusEncoder.Encoder(
  48000,  // Sample rate: exactly 48 kHz
  2,      // Channels: exactly 2 (stereo)
  2880    // Frame size: 20ms at 48kHz
);
```

---

## Performance Characteristics

### Opus Encoding Speed
```
@discordjs/opus: ~2500 frames/sec ✅
opusscript: ~250 frames/sec (10x slower)

For 48kHz audio:
- 1 second = 2400 frames (20ms each)
- Native: processes in ~1ms ✅
- JavaScript: processes in ~10ms (acceptable)
```

### Memory Usage
```
@discordjs/opus: ~2-5 MB per encoder instance
libsodium-wrappers: ~1 MB
sodium-native: ~500 KB
```

---

## Security Considerations

### Encryption Library Preference
1. **Node.js native crypto** (18+) - Recommended
2. **sodium-native** - If extra security primitives needed
3. **libsodium-wrappers** - Last resort (slower)

### Key Management
```typescript
// Discord voice uses:
// - 256-bit shared secret (from voice session handshake)
// - XChaCha20-Poly1305 AEAD cipher
// - Rolling nonce (incremented per packet)

// Implementation in Phase 2:
const keyLength = 32; // 256 bits
const nonceLength = 24; // 192 bits for XChaCha20
```

---

## Testing Checklist

- [ ] `@discordjs/opus` loads and initializes
- [ ] Opus encoder/decoder round-trip works
- [ ] 48kHz sample rate strictly enforced
- [ ] Stereo (2 channel) enforced
- [ ] Memory usage stable over 1 hour test
- [ ] No memory leaks in stream cleanup
- [ ] Encryption/decryption works bidirectionally
- [ ] Performance meets <20ms per packet requirement
- [ ] Optional deps fail gracefully if missing

---

## Migration Path

### From opusscript (if currently used)
```bash
# Remove slow codec
npm uninstall opusscript

# Install native codec
npm install @discordjs/opus@^0.10.0 --save

# No code changes needed - API compatible!
```

### From older Discord.js voice
```bash
# Old package
npm uninstall discord.js-voice

# New official package
npm install @discordjs/voice@0.19.0 --save

# Code changes required - see Discord.js migration guide
```

---

## References

- [Discord.js Voice Documentation](https://discord.js.org/#/docs/voice)
- [Discord.js Opus Package](https://www.npmjs.com/package/@discordjs/opus)
- [Prism-Media Docs](https://github.com/hydrabolt/prism-media)
- [Sodium-native Docs](https://github.com/sodium-friends/sodium-native)
- [libsodium Documentation](https://doc.libsodium.org/)

---

**Prepared by:** Voice Integration Planning Agent  
**Status:** Complete ✅  
**Ready for:** Implementation Phase
