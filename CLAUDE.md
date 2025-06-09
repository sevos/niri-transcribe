# Real-Time Transcription System for Niri

## Project Overview

A MacOS-like dictation system for Linux Wayland environments, providing real-time speech-to-text transcription with immediate text input to focused windows. The system uses Docker containerization for easy deployment while maintaining deep Wayland integration.

## Key Features

- **Voice Activity Detection (VAD)**: Automatic speech detection with 1-3 second chunking
- **Dual Transcription Backend**: OpenAI Whisper API with local whisper.cpp fallback
- **Immediate Text Input**: Seamless text injection into focused Wayland windows
- **Smart Key Bindings**: Double Super tap activation, single Super stop
- **10-Second Silence Timeout**: Automatic session termination after silence
- **Docker Containerization**: Isolated execution with audio and Wayland socket access

## Architecture Overview

### Simplified Design Philosophy

After extensive research into real-time speech transcription systems, we've adopted a simplified approach that achieves 90% of desired functionality with 50% implementation complexity:

**Removed Complexity:**
- Complex WebSocket streaming architecture
- Multiple microservices coordination
- Shared memory systems
- Real-time partial result processing

**Retained Core Features:**
- VAD-based audio chunking (1-3 second segments)
- Immediate transcription after speech pauses
- Text appears as soon as transcription completes
- Dual backend support with automatic fallback
- Complete Docker containerization

### Technical Implementation

**Audio Pipeline:**
```
PulseAudio → VAD Detection → 1-3 Second Chunks → Transcription Service
```

**Transcription Pipeline:**
```
Audio Chunks → OpenAI API Call → Text Result → Immediate wtype Injection
                ↓ (fallback)
            Local whisper.cpp → Text Result → Immediate wtype Injection
```

**User Experience:**
```
Double Super Tap → Start Recording → Speech Detection → Immediate Text → 10s Silence → Auto Stop
```

## Directory Structure

```
niri/transcribe/
├── CLAUDE.md                  # This roadmap document
├── docker-compose.yml         # Container orchestration
├── Dockerfile                 # Single container build
├── transcribe.sh              # Host-side activation script
├── src/
│   ├── main.js               # Single orchestrator process
│   ├── audio-vad.js          # VAD-based chunking (Silero VAD)
│   ├── transcription.js     # OpenAI API with whisper.cpp fallback
│   └── text-output.js       # Direct wtype text injection
├── config/
│   └── config.json          # Service configuration
└── scripts/
    ├── build.sh              # Container build script
    ├── install-deps.sh       # Host dependency installer
    └── health-check.sh       # Container health monitoring
```

## Research Findings

### OpenAI Whisper API Limitations
- **No True Streaming**: Requires complete audio files (m4a, mp3, mp4, mpeg, mpga, wav, webm)
- **Workaround Strategy**: VAD-based chunking with 1-30 second segments
- **Chunked Processing**: Incremental transcription every 1-3 seconds provides near real-time experience

### Voice Activity Detection (VAD)
- **Silero VAD**: Proven solution for real-time voice detection
- **Integration**: Works well with whisper.cpp for local processing
- **Performance**: Reduces transcription load by filtering silence

### Linux Audio Stack
- **PulseAudio**: Sufficient for real-time audio capture and streaming
- **ALSA Integration**: Lower-level access when needed
- **Socket Mounting**: Direct audio device access in containers

### Wayland Text Input
- **wtype Tool**: Reliable text injection for Wayland compositors
- **Socket Access**: Direct Wayland socket mounting in containers
- **Focus Management**: Automatic text input to currently focused window

## Implementation Roadmap

### Phase 1: Core Infrastructure ✅
- [x] Project directory structure
- [x] Research analysis and architecture design
- [x] Simplified implementation strategy
- [ ] Docker container with audio/Wayland access
- [ ] Basic configuration system

### Phase 2: Audio Processing
- [ ] VAD-based audio chunking service
- [ ] PulseAudio integration
- [ ] Silence detection and timeout handling
- [ ] Audio quality preprocessing

### Phase 3: Transcription Services
- [ ] OpenAI Whisper API integration
- [ ] Local whisper.cpp fallback implementation
- [ ] Error handling and service switching
- [ ] Confidence scoring and retry logic

### Phase 4: Text Output
- [ ] Wayland text injection service
- [ ] Smart typing simulation
- [ ] Unicode and special character handling
- [ ] Cursor position management

### Phase 5: User Interface
- [ ] Host activation script (transcribe.sh)
- [ ] Double Super tap detection
- [ ] Visual feedback system
- [ ] Niri key binding integration

### Phase 6: Integration & Testing
- [ ] End-to-end workflow testing
- [ ] Performance optimization
- [ ] Error recovery mechanisms
- [ ] Documentation and setup guides

## Technical Specifications

### Audio Processing
- **Sampling Rate**: 16kHz (Whisper standard)
- **Format**: WAV/PCM for compatibility
- **Chunk Size**: 1-3 seconds based on VAD
- **Buffer Management**: Circular buffer with overlap
- **Silence Threshold**: Configurable VAD sensitivity

### Transcription
- **Primary**: OpenAI Whisper API v1
- **Fallback**: whisper.cpp with local models
- **Models**: base/small for speed, large for accuracy
- **Languages**: Auto-detection with fallback to English
- **Timeout**: 30 seconds per chunk maximum

### Container Configuration
- **Base Image**: Ubuntu 22.04 with Node.js 20
- **Audio Access**: `/dev/snd/*` and PulseAudio socket
- **Wayland Access**: `$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY`
- **Environment**: Proper audio/display variable forwarding
- **Security**: Non-root user, minimal privileges

### Key Bindings (Niri Integration)
- **Activation**: Double Super tap (timing-based detection)
- **Interruption**: Single Super during active transcription
- **Emergency Stop**: Escape key binding
- **Visual Feedback**: Desktop notifications for state changes

## Performance Targets

- **Activation Latency**: < 500ms from double tap to recording
- **Transcription Latency**: < 2 seconds from speech end to text appearance
- **Audio Processing**: Real-time with < 100ms buffer delay
- **Memory Usage**: < 200MB container footprint
- **CPU Usage**: < 20% during active transcription

## Error Handling Strategy

- **API Failures**: Automatic fallback to local whisper.cpp
- **Audio Errors**: Graceful degradation with user notification
- **Container Issues**: Health checks and automatic restart
- **Network Problems**: Offline-capable local processing
- **Permission Errors**: Clear user guidance for setup

## Security Considerations

- **Audio Privacy**: Local processing option for sensitive environments
- **API Keys**: Secure environment variable management
- **Container Isolation**: Minimal host system access
- **Socket Permissions**: Restricted Wayland and audio access
- **Data Retention**: No persistent audio storage

## Future Enhancements

### Advanced Features
- **Multi-language Support**: Automatic language detection and switching
- **Custom Vocabulary**: Domain-specific terminology injection
- **Voice Commands**: System integration beyond text input
- **Noise Reduction**: Advanced audio preprocessing
- **Speaker Identification**: Multi-user environment support

### Integration Possibilities
- **IDE Integration**: Code dictation with syntax awareness
- **Browser Extension**: Web form auto-completion
- **System Commands**: Voice-controlled system operations
- **Accessibility**: Enhanced support for mobility-impaired users
- **Mobile Sync**: Cross-device transcription history

## Dependencies

### Host Requirements
- **OS**: Linux with Wayland compositor (Niri)
- **Audio**: PulseAudio or PipeWire
- **Container**: Docker and Docker Compose
- **Tools**: wtype for text input

### Container Dependencies
- **Runtime**: Node.js 20.x
- **Audio**: sox, alsa-utils, pulseaudio-utils
- **ML**: whisper.cpp, Silero VAD
- **Network**: OpenAI API client libraries
- **System**: wtype, basic Unix utilities

## Getting Started

1. **Install Host Dependencies**
   ```bash
   ./scripts/install-deps.sh
   ```

2. **Build Container**
   ```bash
   ./scripts/build.sh
   ```

3. **Configure Environment**
   ```bash
   export OPENAI_API_KEY="your-api-key"
   cp config/config.json.example config/config.json
   ```

4. **Start Services**
   ```bash
   docker-compose up -d
   ```

5. **Test Integration**
   ```bash
   ./transcribe.sh --test
   ```

6. **Add Niri Bindings**
   ```kdl
   # Add to niri/config.kdl binds section
   ```

This roadmap provides a comprehensive guide for implementing a production-ready real-time transcription system that integrates seamlessly with the Niri Wayland compositor while maintaining the simplicity and reliability of a well-architected solution.