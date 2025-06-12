# Dictation System for Niri

## Current Status: Session-Based Transcription Ready (TICKETS 001-005, 012)

**✅ COMPLETED:**
- **TICKET-001**: Docker infrastructure with Node.js 20-slim
- **TICKET-001**: Full audio stack (PipeWire/PulseAudio/ALSA) access
- **TICKET-001**: Wayland socket mounting for text injection
- **TICKET-001**: Health check endpoint and monitoring
- **TICKET-001**: Express server foundation
- **TICKET-002**: JSON schema-based configuration system with Ajv validation
- **TICKET-002**: Environment variable overrides (OPENAI_API_KEY, AUDIO_DEVICE, TRANSCRIPTION_PROVIDER, DEBUG)
- **TICKET-002**: Secure API key handling with log masking
- **TICKET-002**: Flexible Docker port mapping (internal: 3000, external: configurable)
- **TICKET-003**: Session-based audio capture service (AudioCaptureService)
- **TICKET-003**: PipeWire/PulseAudio automatic detection and fallback
- **TICKET-003**: 16kHz mono PCM audio streaming with session recording
- **TICKET-003**: Audio format conversion utilities (Float32/WAV/Int16 PCM)
- **TICKET-003**: Device discovery and selection API endpoints
- **TICKET-003**: Error recovery with exponential backoff restart logic
- **TICKET-003**: Enhanced status reporting with actual device resolution
- **TICKET-003**: Comprehensive test suite and QA documentation
- **TICKET-005**: OpenAI Whisper API transcription service
- **TICKET-005**: Request queuing and rate limiting with exponential backoff
- **TICKET-005**: Multi-language support with automatic language detection
- **TICKET-005**: Transcription manager with service orchestration and fallback
- **TICKET-005**: Health monitoring and metrics collection
- **TICKET-012**: Session-based recording workflow implementation
- **TICKET-012**: Recording session control endpoints (/recording/start, /recording/stop, /recording/status)
- **TICKET-012**: Complete session transcription (record-then-transcribe approach)
- **TICKET-012**: Maximum recording duration limits (5 minutes)
- **TICKET-012**: Comprehensive QA test plan and validation

**📋 NEXT:** TICKET-007 Text Output Service Implementation

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
- **Session-based audio capture streaming (2048 samples @ 128ms intervals)**
- **PipeWire detection and device enumeration working**
- **Audio format conversion and session buffer management**
- **Device resolution showing actual hardware (e.g., "Yeti" microphone)**
- **REST API endpoints: /audio/devices, /audio/start, /audio/stop**
- **Recording session endpoints: /recording/start, /recording/stop, /recording/status**
- **OpenAI Whisper API transcription with automatic language detection**
- **Transcription manager orchestration with health monitoring**
- **Request queuing, rate limiting, and exponential backoff retry logic**
- **Complete session transcription workflow (record-then-transcribe)**

**🏗️ DEVELOPMENT PRACTICES:**
- Always test within docker & docker compose

## Project Overview

A ChatGPT-style dictation system for Linux Wayland environments, providing session-based speech-to-text transcription with immediate text input to focused windows. Users record their complete dictation, then the system transcribes the entire session and outputs the text. The system uses Docker containerization for easy deployment while maintaining deep Wayland integration.

## System Architecture

### Workflow
1. **Start Recording**: User initiates recording session
2. **Continuous Capture**: System captures audio throughout session
3. **Stop Recording**: User ends recording session
4. **Full Transcription**: Complete audio session sent to OpenAI Whisper
5. **Text Output**: Transcribed text injected into focused window

### Core Components
- **Audio Capture Service**: Session-based recording with PipeWire/PulseAudio
- **Transcription Manager**: OpenAI Whisper API integration with fallback
- **Configuration System**: JSON schema validation with environment overrides
- **Text Output Service**: Wayland text injection via wtype (TICKET-007)
- **Host Integration**: Niri window manager key bindings (TICKET-009)

### HTTP API Endpoints
- `GET /health` - System health and status
- `GET /audio/devices` - Available audio input devices
- `POST /audio/start` - Start audio capture service
- `POST /audio/stop` - Stop audio capture service
- `POST /recording/start` - Begin recording session
- `POST /recording/stop` - End recording and trigger transcription
- `GET /recording/status` - Current recording session status
- `GET /transcription/health` - Transcription service health
- `GET /transcription/metrics` - Service metrics and statistics

### Configuration Options
```json
{
  "audio": {
    "sampleRate": 16000,
    "channels": 1,
    "device": "default",
    "maxRecordingDuration": 300000
  },
  "transcription": {
    "provider": "auto",
    "openai": {
      "apiKey": "env:OPENAI_API_KEY",
      "model": "whisper-1",
      "temperature": 0,
      "language": "en"
    }
  },
  "output": {
    "typeDelay": 10,
    "punctuationDelay": 100,
    "debug": false
  },
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  }
}
```

### Environment Variables
- `OPENAI_API_KEY` - OpenAI API key for Whisper access
- `AUDIO_DEVICE` - Specific audio device override
- `TRANSCRIPTION_PROVIDER` - Provider selection (openai/auto)
- `DEBUG` - Enable debug logging

### Docker Integration
- **Audio Access**: Full PipeWire/PulseAudio/ALSA support
- **Wayland Access**: Socket mounting for text injection
- **Health Monitoring**: Built-in health check endpoint
- **Port Mapping**: Configurable external port (default: 3000)

### Development Status
**Completed Features:**
- ✅ Docker infrastructure and audio access
- ✅ Configuration system with validation
- ✅ Session-based audio capture
- ✅ OpenAI Whisper integration
- ✅ HTTP API and health monitoring
- ✅ Comprehensive test suite (78 tests)
- ✅ QA documentation and test plans

**Remaining Work:**
- 📋 Text output service (TICKET-007)
- 📋 Host activation script (TICKET-009)
- 📋 Build and installation scripts (TICKET-010)

### Performance Characteristics
- **Memory Usage**: <150MB container footprint
- **CPU Usage**: <15% during recording
- **Recording Limits**: 5 minutes maximum session length
- **Transcription Latency**: <10 seconds for typical sessions
- **Startup Time**: <3 seconds to ready state