# Discord Voice Integration - System Architecture

## High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          DISCORD SERVER                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────┐         ┌──────────────────────┐              │
│  │   Voice Channel      │         │   Text Channel       │              │
│  │   (Audio Stream)     │         │   (Commands)         │              │
│  └──────────┬───────────┘         └──────────┬───────────┘              │
│             │                                 │                          │
│             │ Audio In/Out                    │ Text Commands            │
│             │ (RTP, Opus)                     │                          │
└─────────────┼─────────────────────────────────┼──────────────────────────┘
              │                                 │
              │                                 │
┌─────────────┼─────────────────────────────────┼──────────────────────────┐
│             │          OPENCLAW DISCORD PLUGIN              │             │
│             ▼                                 ▼             │             │
│  ┌────────────────────────────────────────────────────┐    │             │
│  │        Discord.js Voice Connection                 │    │             │
│  │  (Phase 2: VoiceConnectionManager)                 │    │             │
│  └────────────┬─────────────────────────────────────┬─┘    │             │
│               │                                     │       │             │
│               │ Raw Opus packets                    │       │             │
│               │ (48kHz, stereo, RTP)                │       │             │
│               │                                     │       │             │
│  ┌────────────▼─────────────────────────────────────▼─┐    │             │
│  │       Phase 3: AudioStreamHandler                   │    │             │
│  │  ┌──────────────────────────────────────────────┐  │    │             │
│  │  │  • Jitter Buffer (RTP reordering)            │  │    │             │
│  │  │  • Opus Decoder (opus → PCM)                 │  │    │             │
│  │  │  • Circular Buffer (frame storage)           │  │    │             │
│  │  │  • Audio Capture (per-user streams)          │  │    │             │
│  │  └─────────────┬────────────────────────────────┘  │    │             │
│  │                │                                    │    │             │
│  │                │ PCM Audio (48kHz, stereo)         │    │             │
│  └────────────────┼────────────────────────────────────┘    │             │
│                   │                                         │             │
│  ┌────────────────▼───────────────────────────────────┐    │             │
│  │  Phase 4: STT Pipeline (Speech-to-Text)            │    │             │
│  │  ┌──────────────────────────────────────────────┐  │    │             │
│  │  │  • Audio buffering (1-2 sec chunks)          │  │    │             │
│  │  │  • Whisper API integration                   │  │    │             │
│  │  │  • Transcription formatting                  │  │    │             │
│  │  └─────────────┬────────────────────────────────┘  │    │             │
│  │                │                                    │    │             │
│  │                │ Text (transcription)               │    │             │
│  └────────────────┼────────────────────────────────────┘    │             │
│                   │                                         │             │
│  ┌────────────────▼───────────────────────────────────┐    │             │
│  │  Phase 6: Voice Command Pipeline                   │    │             │
│  │  ┌──────────────────────────────────────────────┐  │    │             │
│  │  │  • Command parsing & routing                 │  │    │             │
│  │  │  • Agent invocation (ask Rue)                │  │    │             │
│  │  │  • Response aggregation                      │  │    │             │
│  │  └─────────────┬────────────────────────────────┘  │    │             │
│  │                │                                    │    │             │
│  │                │ Response text                      │    │             │
│  └────────────────┼────────────────────────────────────┘    │             │
│                   │                                         │             │
│  ┌────────────────▼───────────────────────────────────┐    │             │
│  │  Phase 5: TTS Pipeline (Text-to-Speech)            │    │             │
│  │  ┌──────────────────────────────────────────────┐  │    │             │
│  │  │  • Text formatting for speech                │  │    │             │
│  │  │  • ElevenLabs API integration                │  │    │             │
│  │  │  • Audio streaming (nova voice)              │  │    │             │
│  │  └─────────────┬────────────────────────────────┘  │    │             │
│  │                │                                    │    │             │
│  │                │ PCM Audio (48kHz, stereo)         │    │             │
│  └────────────────┼────────────────────────────────────┘    │             │
│                   │                                         │             │
│  ┌────────────────▼───────────────────────────────────┐    │             │
│  │  Phase 3: AudioStreamHandler (Playback)            │    │             │
│  │  ┌──────────────────────────────────────────────┐  │    │             │
│  │  │  • Playback buffer                           │  │    │             │
│  │  │  • Opus Encoder (PCM → opus)                 │  │    │             │
│  │  │  • RTP packet assembly                       │  │    │             │
│  │  └─────────────┬────────────────────────────────┘  │    │             │
│  │                │                                    │    │             │
│  └────────────────┼────────────────────────────────────┘    │             │
│                   │                                         │             │
└───────────────────┼─────────────────────────────────────────┘             │
                    │                                                        │
                    │ Opus packets (48kHz, stereo, RTP)                     │
                    │                                                        │
              ┌─────▼─────┐                                                 │
              │   Discord  │                                                │
              │    API     │                                                │
              └─────┬──────┘                                                │
                    │ Audio sent to channel                                 │
                    │                                                        │
└────────────────────┼──────────────────────────────────────────────────────┘
                     │
              Back to Discord Voice Channel
```

---

## Data Flow Details

### 1. **INBOUND: User Voice → OpenClaw → Agent → Response**

```
Discord User speaks in voice channel
        ↓
  Discord.js VoiceConnection receives Opus packets (encrypted, RTP)
        ↓
  Phase 2: VoiceConnectionManager
    • Manages connection lifecycle
    • Provides VoiceConnection object
        ↓
  Phase 3: AudioStreamHandler
    • Decrypts packets (Discord handles this)
    • Decodes Opus → PCM (48kHz, stereo, 960-sample frames)
    • Handles jitter buffer (RTP reordering)
    • Circular buffer (user audio streams)
    • Output: PCM audio frames (3,840 bytes per 20ms frame)
        ↓
  Phase 4: STT Pipeline
    • Buffers PCM audio (1-2 sec chunks)
    • Streams to OpenAI Whisper API
    • Receives: text transcription
    • Formats: "User said: {transcription}"
        ↓
  Phase 6: Voice Command Pipeline
    • Parses command intent
    • Routes to appropriate OpenClaw agent/command
    • Agent (Rue or other) processes request
    • Generates text response
        ↓
  Response text returned to plugin
```

### 2. **OUTBOUND: Response → TTS → Discord Voice Channel**

```
Response text from agent
        ↓
  Phase 5: TTS Pipeline
    • Sends text to ElevenLabs API (nova voice)
    • Receives: PCM audio stream (48kHz, stereo)
    • Buffers complete audio
        ↓
  Phase 3: AudioStreamHandler (Playback)
    • Accepts PCM audio
    • Encodes PCM → Opus (20-60 byte frames)
    • Assembles RTP packets
    • Maintains sync with Discord timing
        ↓
  Phase 2: VoiceConnectionManager
    • Sends RTP packets to Discord.js connection
    • Encryption handled by Discord.js/libsodium
        ↓
  Discord API
    • Transmits encrypted audio to voice channel
        ↓
  Discord Users hear response in voice channel
```

---

## External API Integration Points

### **OpenAI Whisper (STT)**

```
OpenClaw Plugin                    OpenAI Whisper API
        │                                 │
        │ POST /v1/audio/transcriptions   │
        │ headers: Authorization, ...     │
        │ body: {                         │
        │   file: PCM audio buffer        │
        │   model: "whisper-1"            │
        │   language: "en"                │
        │ }                               │
        ├────────────────────────────────>│
        │                                 │
        │                                 │ Process audio
        │                                 │ Extract text
        │                                 │
        │  200 OK {                       │
        │    text: "hello world"          │
        │    language: "english"          │
        │  }                              │
        │<────────────────────────────────┤
        │                                 │
        ▼                                 ▼
   Use transcript            Done
```

**Configuration:**

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=whisper-1
```

---

### **ElevenLabs TTS**

```
OpenClaw Plugin                 ElevenLabs TTS API
        │                              │
        │ POST /v1/text-to-speech      │
        │ headers: Authorization, ...  │
        │ body: {                      │
        │   text: "Response text"      │
        │   voice_id: "nova"           │
        │   model_id: "eleven_turbo"   │
        │ }                            │
        ├─────────────────────────────>│
        │                              │
        │                              │ Synthesize audio
        │                              │ (nova voice)
        │                              │
        │  200 OK                      │
        │  Content-Type: audio/mpeg    │
        │  [binary audio stream]       │
        │<─────────────────────────────┤
        │                              │
        ▼                              ▼
  Convert to PCM             Done
  Feed to Phase 3
```

**Configuration:**

```
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_VOICE_ID=nova
ELEVENLABS_MODEL=eleven_turbo
```

---

### **Discord Bot API (for text commands)**

```
User types: /voice ask "what time is it?"
        │
        ├─ Discord processes slash command
        │
        └─> OpenClaw Discord Plugin
              │
              ├─ If text channel: respond with text
              │
              └─ If voice channel:
                  ├─ Route to voice pipeline (STT)
                  ├─ Process command
                  ├─ Generate response
                  ├─ Convert to speech (TTS)
                  └─ Play audio to channel
```

---

## Architecture Layers

```
┌────────────────────────────────────────────────────────┐
│                   USER INTERFACE                        │
│   (Discord Voice Channel / Text Channel)                │
└────────────────────────────────────────────────────────┘
                          ▲
                          │
┌────────────────────────────────────────────────────────┐
│         DISCORD.JS LAYER (Phase 2)                      │
│   VoiceConnectionManager, Connection State             │
└────────────────────────────────────────────────────────┘
                          ▲
                          │
┌────────────────────────────────────────────────────────┐
│         AUDIO CODEC LAYER (Phase 3)                     │
│   AudioStreamHandler, Opus Encode/Decode,             │
│   Jitter Buffer, Circular Buffer                       │
└────────────────────────────────────────────────────────┘
                          ▲
                          │
┌────────────────────────────────────────────────────────┐
│         SPEECH PROCESSING LAYER                         │
│   Phase 4: STT (Whisper)                               │
│   Phase 5: TTS (ElevenLabs)                            │
│   Phase 6: Command Pipeline                           │
└────────────────────────────────────────────────────────┘
                          ▲
                          │
┌────────────────────────────────────────────────────────┐
│         AGENT LAYER (OpenClaw Core)                     │
│   Rue (voice assistant)                                │
│   Command routing & execution                          │
└────────────────────────────────────────────────────────┘
                          ▲
                          │
┌────────────────────────────────────────────────────────┐
│      EXTERNAL API LAYER                                 │
│   OpenAI Whisper, ElevenLabs, Discord API             │
└────────────────────────────────────────────────────────┘
```

---

## Error Handling & Recovery

```
User speaks in voice channel
        │
        ├─ Whisper API unavailable?
        │  └─> Fall back to: "Sorry, I can't hear you right now"
        │      Play TTS response
        │
        ├─ TTS API unavailable?
        │  └─> Fall back to: Send text response in Discord chat
        │
        ├─ Voice disconnection?
        │  └─> Cleanup phase 3-4 handlers
        │      Emit error event
        │      Reconnect on user request
        │
        └─ Agent timeout?
           └─> Return: "I'm thinking..."
               Send partial response when available
```

---

## Network Paths

### **Critical Path (User Speaks → Rue Responds)**

```
Discord Server (eu-central-1)
        │
        ├─ Audio: Discord RTP servers → Discord.js library → OpenClaw
        │  (encrypted, 50 packets/sec, ~2 KB/sec)
        │
        ├─ STT: OpenClaw → OpenAI (Whisper API, US-east-1)
        │  (HTTP POST, ~1-5 sec latency, 100KB per request)
        │
        ├─ Agent: OpenClaw → Rue agent (localhost or remote)
        │  (sub-100ms for simple commands)
        │
        ├─ TTS: OpenClaw → ElevenLabs (US, EU)
        │  (HTTP POST, ~1-2 sec latency, 50-500KB per response)
        │
        └─ Audio: OpenClaw → Discord RTP servers → Voice Channel
           (encrypted, RTP streaming, real-time)

Total E2E latency: ~3-8 seconds (dominant: STT + TTS network calls)
```

---

## Key Design Decisions

| Decision                            | Rationale                                            |
| ----------------------------------- | ---------------------------------------------------- |
| **Opus 960-sample frames (20ms)**   | Discord standard, low latency                        |
| **Jitter buffer + Circular buffer** | Handle network variance, smooth playback             |
| **Per-user decoder map**            | Support concurrent users without conflict            |
| **Fail-open for TTS**               | Fallback to text if speech unavailable               |
| **Streaming STT**                   | Not implemented (future Phase 4b)                    |
| **Sequential request/response**     | Simpler than concurrent; matches Discord turn-taking |
| **User API keys in config**         | Each user brings their own cloud API keys            |

---

## Deployment Model (Phase 8)

```
GitHub Repo (openclaw-discord-voice)
        │
        ├─ npm package (@openclaw/voice-extension)
        │  └─ Installed via: npm install
        │
        ├─ Docker image (ghcr.io/nexaddo/openclaw-discord-voice)
        │  └─ Deployed via: docker run ... (future)
        │
        └─ OpenClaw Plugin System
           └─ Loaded by: OpenClaw core on startup
```

**User Setup:**

```
1. Install npm package / download plugin
2. Configure .env with API keys:
   - DISCORD_BOT_TOKEN
   - OPENAI_API_KEY
   - ELEVENLABS_API_KEY
3. Run OpenClaw with plugin enabled
4. Join voice channel, start using voice commands
```

---

## Testing Strategy (All 8 Phases)

```
Unit Tests (Phase 1-7)
├─ Phase 2: VoiceConnectionManager → 55/55 tests ✓
├─ Phase 3: AudioStreamHandler → 111/111 tests ✓
├─ Phase 4: STT Pipeline → [tests pending]
├─ Phase 5: TTS Pipeline → [tests pending]
├─ Phase 6: Command Pipeline → [tests pending]
└─ Phase 7: Plugin Integration → [tests pending]

Integration Tests (All Phases)
└─ End-to-end: User voice → transcript → agent → speech

E2E Tests (With Real APIs)
├─ OpenAI Whisper (costs $)
├─ ElevenLabs TTS (costs $)
└─ Discord test guild (free)
```

---

## Security Model

```
User's API Keys
├─ DISCORD_BOT_TOKEN
│  └─ Scopes: Read messages, Send messages, Join voice
│     Risk: If leaked, attacker can impersonate bot in that guild
│
├─ OPENAI_API_KEY
│  └─ Costs: ~$0.001 per minute of audio transcribed
│     Risk: If leaked, attacker can run up transcription bills
│
└─ ELEVENLABS_API_KEY
   └─ Costs: ~$0.30 per 1M characters
      Risk: If leaked, attacker can generate unlimited speech

Mitigation:
- Keys stored in .env (gitignored, never committed)
- GitHub Actions: Secrets masked in logs
- OpenClaw: No logging of API responses
- User education: "Treat keys like passwords"
```

---

## Performance Targets

| Component                              | Target  | Notes                   |
| -------------------------------------- | ------- | ----------------------- |
| **Audio latency (capture → playback)** | <100ms  | End-to-end              |
| **Whisper API response**               | 1-5 sec | Depends on audio length |
| **TTS API response**                   | 1-2 sec | Text length dependent   |
| **Command processing**                 | <1 sec  | Agent logic             |
| **Total E2E**                          | 3-8 sec | User perspective        |
| **CPU per concurrent user**            | <5%     | Single threaded         |
| **Memory per connection**              | ~10 MB  | Buffers + codecs        |

---

## Configuration Guide

### Overview

The Discord Voice Extension requires three API keys from external services. **Each user/deployment brings their own keys** — the plugin does not include any default credentials and will not function without proper configuration.

```
Plugin Usage: Each Installation
├─ User A's Discord Server
│  ├─ DISCORD_BOT_TOKEN: token-user-a
│  ├─ OPENAI_API_KEY: key-user-a
│  └─ ELEVENLABS_API_KEY: key-user-a
│
├─ User B's Discord Server
│  ├─ DISCORD_BOT_TOKEN: token-user-b
│  ├─ OPENAI_API_KEY: key-user-b
│  └─ ELEVENLABS_API_KEY: key-user-b
│
└─ User C's Docker/VPS
   ├─ DISCORD_BOT_TOKEN: token-user-c
   ├─ OPENAI_API_KEY: key-user-c
   └─ ELEVENLABS_API_KEY: key-user-c
```

**No shared infrastructure.** Each user controls their own costs and API quota.

---

### 1. Discord Bot Token

#### Where to Get It

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"** (top right)
3. Enter name: `"OpenClaw Voice"` (or your preference)
4. Go to **"Bot"** tab (left sidebar)
5. Click **"Add Bot"**
6. Under **TOKEN**, click **"Copy"**
   - ⚠️ **Never share this token** — it's equivalent to your Discord password
   - If accidentally leaked, regenerate immediately (click "Reset Token")

#### What Permissions Does It Need?

The bot requires these **OAuth2 scopes**:

- `bot` (enable bot)
- `applications.commands` (slash commands)

And these **permissions**:

- **Text Permissions:**
  - Send Messages
  - Read Messages/View Channels
- **Voice Permissions:**
  - Connect
  - Speak
  - Use Voice Activity

**To add bot to your server:**

1. Copy **Client ID** from Application settings
2. Go to: `https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot%20applications.commands&permissions=3145728`
3. Select your Discord server
4. Click "Authorize"

#### Format

```
DISCORD_BOT_TOKEN=YOUR_TOKEN_HERE
```

**Example (not real):**

```
DISCORD_BOT_TOKEN=MTk4NjIyNDgzNTkxNDc1NjY4.Clwa7A.You28nreJgQIHHhJly26l-8hGc
```

**Length:** ~70 characters  
**Prefix:** Usually starts with numbers

---

### 2. OpenAI Whisper API Key

#### Where to Get It

1. Go to [OpenAI Platform](https://platform.openai.com)
2. Sign up / Log in (or create organization)
3. Go to **Settings → API keys** (left sidebar)
4. Click **"Create new secret key"**
5. Copy the key (you can only see it once!)
   - Store securely in `.env`
   - If lost, create a new one and delete the old one

#### Cost Model

**Whisper API pricing:**

- `$0.002` per minute of audio (1-min = $0.002)
- **Example:** 10 hours of transcription = $1.20/month
- No minimum. Pay only for what you use.

**How to monitor usage:**

1. Go to [OpenAI Billing Dashboard](https://platform.openai.com/account/billing/overview)
2. Check "Usage" → "Whisper API"
3. Set usage limits if concerned (Settings → Billing → Usage limits)

#### Format

```
OPENAI_API_KEY=sk-YOUR_KEY_HERE
```

**Example (not real):**

```
OPENAI_API_KEY=sk-proj-abcdef123456789xyz
```

**Length:** ~50 characters  
**Prefix:** Always starts with `sk-` (secret key)

---

### 3. ElevenLabs TTS API Key

#### Where to Get It

1. Go to [ElevenLabs](https://elevenlabs.io)
2. Sign up (free tier available)
3. Go to **Profile → API Key** (top right → Settings)
4. Copy **API Key**
5. Store in `.env`

#### Cost Model

**ElevenLabs pricing:**

- Free tier: 10,000 characters/month (~5 min of speech)
- Paid: $5/month for 100,000 chars, $99/month for 2M chars
- Cost per character: ~$0.000003 per character

**Example costs:**

- "Hello world" (11 chars) = ~$0.000033 per request
- 100 commands/day = ~$0.10/month

**Track usage:**

1. Go to [ElevenLabs Billing](https://elevenlabs.io/subscription)
2. Check character usage
3. Upgrade tier if needed

#### Format

```
ELEVENLABS_API_KEY=YOUR_KEY_HERE
```

**Example (not real):**

```
ELEVENLABS_API_KEY=5a123bcdefg456hijklmnop789qrst
```

**Length:** ~32 characters  
**Prefix:** No standard prefix (alphanumeric)

#### Voice Selection

**Available voices:** nova (default), alloy, echo, fable, onyx, shimmer

**Configuration:**

```
# In .env (optional, default=nova):
ELEVENLABS_VOICE_ID=nova
```

---

### Setup Instructions

#### Step 1: Clone / Install Plugin

```bash
# Option A: npm
npm install @openclaw/voice-extension

# Option B: Docker
docker pull ghcr.io/nexaddo/openclaw-discord-voice:latest

# Option C: Git
git clone https://github.com/nexaddo/openclaw-discord-voice
cd openclaw-discord-voice
npm install
```

#### Step 2: Create `.env` File

In your project root (or Docker working directory):

```bash
# Create file:
touch .env

# Or copy template:
cp .env.example .env
```

#### Step 3: Add API Keys

Edit `.env`:

```env
# Discord Configuration
DISCORD_BOT_TOKEN=YOUR_BOT_TOKEN_HERE

# OpenAI Whisper (STT)
OPENAI_API_KEY=sk-YOUR_KEY_HERE

# ElevenLabs (TTS)
ELEVENLABS_API_KEY=YOUR_KEY_HERE

# Optional: Voice Selection (default=nova)
ELEVENLABS_VOICE_ID=nova

# Optional: Debug Logging
DEBUG=openclaw:voice:*
```

#### Step 4: Validate Configuration

```bash
# Test that all keys are valid:
npm run validate-config

# Output should show:
# ✓ Discord bot token: Valid
# ✓ OpenAI API key: Valid
# ✓ ElevenLabs API key: Valid
```

If validation fails:

- Check for typos in `.env`
- Verify keys are not expired/revoked
- Ensure `.env` is in correct location
- Re-read API key from source (copy fresh)

#### Step 5: Start OpenClaw with Plugin

```bash
# Standard:
openclaw gateway start

# Or with plugin explicitly enabled:
OPENCLAW_PLUGINS=discord,voice-extension openclaw gateway start
```

---

### What Happens If Keys Are Missing?

| Scenario                       | Behavior                                                               |
| ------------------------------ | ---------------------------------------------------------------------- |
| **Missing DISCORD_BOT_TOKEN**  | Plugin fails to load. No voice functionality. Error logged.            |
| **Missing OPENAI_API_KEY**     | STT unavailable. User hears: "I can't hear you right now."             |
| **Missing ELEVENLABS_API_KEY** | TTS unavailable. Responses sent as Discord text instead.               |
| **Invalid key (typo)**         | API calls fail with `401 Unauthorized`. Error logged. Retry after 30s. |
| **Expired key**                | API calls fail. User sees: "API error, try again later."               |
| **Rate limited**               | OpenAI: Wait 60s. ElevenLabs: Wait 5min. Shown to user.                |

---

### Key Rotation (Security Best Practice)

#### Rotate Discord Bot Token

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Go to **Bot** tab
4. Click **"Reset Token"**
5. Copy new token
6. Update `.env`:
   ```env
   DISCORD_BOT_TOKEN=NEW_TOKEN_HERE
   ```
7. Restart plugin: `openclaw gateway restart`

#### Rotate OpenAI Key

1. Go to [OpenAI Platform → API Keys](https://platform.openai.com/account/api-keys)
2. Click **🗑️ (delete)** on old key
3. Click **"Create new secret key"**
4. Copy new key
5. Update `.env`:
   ```env
   OPENAI_API_KEY=sk-NEW_KEY_HERE
   ```
6. Restart plugin: `openclaw gateway restart`

#### Rotate ElevenLabs Key

1. Go to [ElevenLabs → Settings → API Key](https://elevenlabs.io/app/settings)
2. Click **"Regenerate API Key"**
3. Copy new key
4. Update `.env`:
   ```env
   ELEVENLABS_API_KEY=NEW_KEY_HERE
   ```
5. Restart plugin: `openclaw gateway restart`

**Recommendation:** Rotate keys every 90 days for security.

---

### Environment Files

#### `.env` (Your Local Copy)

**DO NOT COMMIT THIS FILE.** Add to `.gitignore`:

```gitignore
.env
.env.local
.env.*.local
```

**Example `.env` for production:**

```env
# Discord
DISCORD_BOT_TOKEN=MTk4NjIyNDgzNTkxNDc1NjY4.Clwa7A.You28nreJgQIHHhJly26l
DISCORD_GUILD_ID=YOUR_GUILD_ID_HERE

# OpenAI
OPENAI_API_KEY=sk-proj-abcdef123456789xyz
OPENAI_MODEL=whisper-1

# ElevenLabs
ELEVENLABS_API_KEY=5a123bcdefg456hijklmnop789qrst
ELEVENLABS_VOICE_ID=nova
ELEVENLABS_MODEL=eleven_turbo

# Optional
DEBUG=openclaw:voice:*
LOG_LEVEL=info
NODE_ENV=production
```

#### `.env.example` (Template - Commit to Repo)

```env
# Discord Configuration
# Get from: https://discord.com/developers/applications
DISCORD_BOT_TOKEN=your_bot_token_here

# OpenAI Whisper API
# Get from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your_key_here

# ElevenLabs TTS API
# Get from: https://elevenlabs.io/app/settings
ELEVENLABS_API_KEY=your_key_here

# Optional: Voice selection (default=nova)
# Options: nova, alloy, echo, fable, onyx, shimmer
ELEVENLABS_VOICE_ID=nova

# Optional: Debug mode
# Uncomment to enable verbose logging:
# DEBUG=openclaw:voice:*
```

---

### Testing Configuration

#### Quick Test

```bash
# Validate keys are set and formatted correctly:
npm run validate-config

# Expected output:
# ✓ DISCORD_BOT_TOKEN: Valid format (70 chars, starts with token)
# ✓ OPENAI_API_KEY: Valid format (50+ chars, starts with sk-)
# ✓ ELEVENLABS_API_KEY: Valid format (32 chars)
```

#### Full API Test

```bash
# Test actual API connectivity:
npm run test:apis

# Runs:
# 1. Discord bot connection
# 2. OpenAI Whisper (small test audio)
# 3. ElevenLabs TTS (test phrase)

# Expected output:
# ✓ Discord connected to guild: My Server
# ✓ Whisper API: "hello world"
# ✓ ElevenLabs TTS: Generated 2.3s audio
```

#### End-to-End Test

```bash
# Join test Discord voice channel, say something:
npm run test:e2e

# Bot should:
# 1. Capture your speech
# 2. Transcribe with Whisper
# 3. Echo back with TTS
# 4. Log: "E2E test successful (2.3s latency)"
```

---

### Troubleshooting Configuration

#### "DISCORD_BOT_TOKEN is missing"

**Solution:**

1. Verify `.env` file exists in project root
2. Check file is named exactly `.env` (not `.env.txt` or `.env.example`)
3. Check line has no spaces: `DISCORD_BOT_TOKEN=YOUR_TOKEN`
4. Verify token length (~70 characters)
5. Restart: `npm run start`

#### "OpenAI API returned 401 Unauthorized"

**Causes:**

- Wrong API key
- Key expired
- Key not for this organization
- API key deleted from platform

**Solution:**

1. Go to [OpenAI API Keys](https://platform.openai.com/account/api-keys)
2. Create a **new** key
3. Copy **immediately** (can't see again)
4. Update `.env`
5. Restart plugin

#### "ElevenLabs quota exceeded"

**Cause:** Used all free tier (10K chars) or paid quota

**Solution:**

1. Check usage: [ElevenLabs Billing](https://elevenlabs.io/subscription)
2. Upgrade plan: $5/month = 100K chars
3. Or wait for next billing cycle
4. Or reduce TTS usage (respond with text instead)

#### "Voice not connecting to Discord"

**Check:**

1. Bot token is valid: `npm run validate-config`
2. Bot has joined server: [Discord Developer Portal](https://discord.com/developers/applications) → OAuth2 → Check permissions
3. Bot has permissions in voice channel: Right-click channel → Edit → Permissions → Bot role
4. Required permissions: Connect, Speak, Voice Activity
5. Logs for errors: `DEBUG=openclaw:voice:* npm start`

---

### Production Deployment

#### Via Docker (Recommended)

```dockerfile
# Dockerfile
FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Expects .env to be mounted as volume
ENV NODE_ENV=production

CMD ["npm", "start"]
```

**Run:**

```bash
docker run -d \
  --name openclaw-voice \
  -v /path/to/.env:/app/.env:ro \
  -v /path/to/logs:/app/logs \
  ghcr.io/nexaddo/openclaw-discord-voice:latest
```

**⚠️ SECURITY:**

- Mount `.env` as read-only (`:ro`)
- Never bake `.env` into Docker image
- Use Docker secrets instead (advanced):
  ```bash
  docker secret create discord_token /path/to/token
  docker secret create openai_key /path/to/key
  # Access in app: /run/secrets/discord_token
  ```

#### Via systemd (Linux/Mac)

Create `/etc/systemd/system/openclaw-voice.service`:

```ini
[Unit]
Description=OpenClaw Discord Voice Extension
After=network.target

[Service]
Type=simple
User=openclaw
WorkingDirectory=/opt/openclaw-voice
EnvironmentFile=/opt/openclaw-voice/.env
ExecStart=/usr/bin/npm start

Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Enable and start:**

```bash
systemctl enable openclaw-voice
systemctl start openclaw-voice
systemctl status openclaw-voice
```

---

### Cost Management

#### Monitor Spending

**Daily check:**

```bash
# View logs for API call counts:
grep -c "whisper-1" logs/openclaw.log   # Whisper calls
grep -c "text-to-speech" logs/openclaw.log  # TTS calls
```

**Weekly review:**

- OpenAI: [Usage Dashboard](https://platform.openai.com/account/billing/overview)
- ElevenLabs: [Billing Page](https://elevenlabs.io/subscription)

#### Cost Optimization

| Strategy                     | Savings                    |
| ---------------------------- | -------------------------- |
| **Cache frequent commands**  | 30-50% fewer STT calls     |
| **Batch responses**          | 20-40% fewer TTS calls     |
| **Use text fallback**        | 80% (when TTS unavailable) |
| **Voice activity detection** | 40-60% (skip silence)      |
| **ElevenLabs free tier**     | $0 for 10K chars/month     |

**Estimated monthly costs (medium use):**

- OpenAI Whisper: $5-10 (10-20 hours)
- ElevenLabs TTS: $5-15 (if beyond free tier)
- Discord: $0 (free)
- **Total:** $10-25/month for active use

---

### Checklists

#### Initial Setup Checklist

- [ ] Create Discord application
- [ ] Create Discord bot and get token
- [ ] Add bot to Discord server
- [ ] Create OpenAI account
- [ ] Generate OpenAI API key
- [ ] Create ElevenLabs account
- [ ] Generate ElevenLabs API key
- [ ] Clone/install plugin
- [ ] Create `.env` file
- [ ] Add all three API keys to `.env`
- [ ] Run `npm run validate-config`
- [ ] Run `npm run test:apis`
- [ ] Join Discord voice channel
- [ ] Test voice command
- [ ] Check logs for errors

#### Monthly Maintenance Checklist

- [ ] Review API spending
- [ ] Check API rate limits
- [ ] Rotate API keys (security best practice)
- [ ] Update plugin to latest version
- [ ] Review error logs
- [ ] Test all features (text, voice, commands)
- [ ] Verify bot still in Discord server
- [ ] Check for security advisories

---

### Security Hardening

1. **Never log API keys**

   ```javascript
   // ❌ WRONG
   console.log(`API key: ${apiKey}`);

   // ✅ RIGHT
   console.log(`API key: ${apiKey.slice(0, 5)}...`);
   ```

2. **Use .env, not hardcoded**

   ```javascript
   // ❌ WRONG
   const apiKey = 'sk-proj-abc123';

   // ✅ RIGHT
   const apiKey = process.env.OPENAI_API_KEY;
   ```

3. **Encrypt .env in transit**

   ```bash
   # If syncing to server:
   scp -C .env user@server:~/app/
   # Use SSH, not FTP
   ```

4. **Rotate keys regularly**
   - Every 90 days minimum
   - Immediately if suspected leak
   - After team member departure

5. **Restrict Discord bot permissions**
   - Only: Connect, Speak, Read messages, Send messages
   - NOT: Administrator, Manage server, etc.

---

## Future Enhancements

- Streaming STT (Phase 4b) - Lower latency
- Multi-language support - i18n
- Voice activity detection (VAD) - Reduce Whisper API calls
- Command caching - Repeated commands cheaper
- Custom voice profiles - Per-user TTS settings
- Audio effects - Voice modulation, echo, etc.
