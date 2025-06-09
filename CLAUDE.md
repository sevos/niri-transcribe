# Real-Time Transcription System for Niri

## Current Status: Audio Pipeline Ready (TICKETS 001-003)

**✅ COMPLETED:**
- **TICKET-001**: Docker infrastructure with Node.js 20-slim
- **TICKET-001**: Full audio stack (PipeWire/PulseAudio/ALSA) access
- **TICKET-001**: Wayland socket mounting for text injection
- **TICKET-001**: Health check endpoint and monitoring
- **TICKET-001**: Express server foundation
- **TICKET-002**: JSON schema-based configuration system with Ajv validation
- **TICKET-002**: Environment variable overrides (OPENAI_API_KEY, AUDIO_DEVICE, VAD_THRESHOLD, TRANSCRIPTION_PROVIDER, DEBUG)
- **TICKET-002**: Secure API key handling with log masking
- **TICKET-002**: Flexible Docker port mapping (internal: 3000, external: configurable)
- **TICKET-003**: Real-time audio capture service (AudioCaptureService)
- **TICKET-003**: PipeWire/PulseAudio automatic detection and fallback
- **TICKET-003**: 16kHz mono PCM audio streaming with 30-second circular buffer
- **TICKET-003**: Audio format conversion utilities (Float32/WAV/Int16 PCM)
- **TICKET-003**: Device discovery and selection API endpoints
- **TICKET-003**: Error recovery with exponential backoff restart logic
- **TICKET-003**: Enhanced status reporting with actual device resolution
- **TICKET-003**: Comprehensive test suite (18 tests) and QA documentation

**📋 NEXT:** TICKET-004 VAD (Voice Activity Detection) Implementation

**🔧 VERIFIED WORKING:**
- Container builds and runs successfully
- Audio device access confirmed (/dev/snd/*, user:audio group)
- Wayland socket accessible (wayland-1)
- Health endpoint responds (http://localhost:3000/health)
- wtype tool available for text injection
- Configuration system loads and validates correctly
- Environment variable overrides function properly
- API key masking in logs operational
- Debug logging toggles via DEBUG environment variable
- Flexible port mapping works (external port configurable, internal fixed at 3000)
- **Real-time audio capture streaming (2048 samples @ 128ms intervals)**
- **PipeWire detection and device enumeration working**
- **Audio format conversion and circular buffer management**
- **Device resolution showing actual hardware (e.g., "Yeti" microphone)**
- **REST API endpoints: /audio/devices, /audio/start, /audio/stop**

**🏗️ DEVELOPMENT PRACTICES:**
- Always test within docker & docker compose

## Project Overview

A MacOS-like dictation system for Linux Wayland environments, providing real-time speech-to-text transcription with immediate text input to focused windows. The system uses Docker containerization for easy deployment while maintaining deep Wayland integration.

[... rest of the existing content remains unchanged ...]