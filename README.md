# OpenClaw Discord Voice Integration

Real-time voice chat integration for OpenClaw, enabling voice conversations with AI agents in Discord.

## Features

- 🎤 **Speech-to-Text**: OpenAI Whisper API for accurate transcription
- 🔊 **Text-to-Speech**: ElevenLabs nova voice for natural responses
- 🎵 **Discord Voice**: Full Discord.js voice integration
- ⚡ **Low Latency**: <3 second response times
- 🤖 **Agent Integration**: Seamless connection to OpenClaw agent system

## Status

🚧 **In Development** - Following 8-phase implementation plan

## Architecture

- **Voice Extension Plugin**: Core voice connection and audio handling
- **STT Pipeline**: Whisper API integration with Voice Activity Detection
- **TTS Pipeline**: ElevenLabs streaming synthesis
- **Command Interface**: `/voice join`, `/voice leave`, `/voice status`

## Development

This project uses a multi-agent development approach:
- **Planning Agent** (Phi-3 Mini): Research and architecture
- **Implementation Agent** (Haiku 4.5): TDD-based development
- **Code Review Agent** (Gemma3): Quality assurance

See `PLAN.md` for detailed implementation phases.

## Requirements

- OpenClaw 2026.2.2+
- Node.js 22+
- Discord.js with voice support
- OpenAI API key (Whisper)
- ElevenLabs API key

## License

MIT
