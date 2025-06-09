# Technology Stack Documentation

## Overview
This document outlines the technology choices for the real-time transcription system, focusing on Node.js-based solutions to minimize language diversity while maintaining production quality.

## Core Technologies

### Language: Node.js (v20.x)
- **Rationale**: Single language for entire application, excellent async support for real-time processing
- **Runtime**: Docker containerized for consistent deployment

### Audio Pipeline

#### Audio Capture: PipeWire
- **Library**: Direct PipeWire access via child_process
- **Alternative**: PulseAudio compatibility layer for broader support
- **Format**: 16kHz, mono, PCM WAV format for Whisper compatibility

#### Voice Activity Detection (VAD)
- **Primary**: Custom energy-based VAD implementation
- **Rationale**: Silero VAD has limited Node.js support
- **Features**: 
  - Energy threshold detection
  - Adaptive noise floor
  - Speech onset/offset detection with configurable delays

#### Audio Processing: node-wav
- **Version**: Latest stable
- **Features**: Fast WAV encoding/decoding, Float32Array support
- **Performance**: 750x faster than alternatives

### Transcription Services

#### Primary: OpenAI Whisper API
- **Library**: openai (official SDK)
- **Model**: whisper-1
- **Format**: WAV files (1-3 second chunks)
- **Error Handling**: Automatic retry with exponential backoff

#### Fallback: whisper.cpp
- **Integration**: Direct CLI execution via child_process
- **Models**: base.en (fast) and small.en (accurate)
- **Benefits**: No complex bindings, proven stability

### Text Output

#### Wayland Integration: wtype
- **Method**: Child process execution
- **Features**: Unicode support, proper timing simulation
- **Security**: Runs with minimal privileges

### Container Stack

#### Base Image: node:20-slim
- **Size**: Minimal footprint (~150MB)
- **Dependencies**: Only essential audio/Wayland tools

#### Audio Access
```dockerfile
# Mount points
/run/user/1000/pipewire-0:/tmp/pipewire-0
/dev/snd:/dev/snd  # Fallback ALSA access
```

#### Wayland Access
```dockerfile
# Environment and sockets
$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY
```

## Architecture Decisions

### Monolithic Container
- **Rationale**: Simplified deployment, reduced inter-service communication
- **Structure**: Single Node.js process with worker threads for audio processing

### VAD Implementation
Due to limited Node.js support for Silero VAD, we implement a custom solution:
```javascript
class EnergyBasedVAD {
  constructor(options = {}) {
    this.energyThreshold = options.threshold || 0.01;
    this.speechStartDelay = options.startDelay || 300; // ms
    this.speechEndDelay = options.endDelay || 1000; // ms
  }
  
  processAudioFrame(frame) {
    const energy = this.calculateRMS(frame);
    return this.detectSpeechState(energy);
  }
}
```

### Error Handling Strategy
1. **Network Failures**: Immediate fallback to local whisper.cpp
2. **Audio Errors**: Graceful restart with user notification
3. **Permission Issues**: Clear error messages with fix instructions

### Performance Optimizations
- **Audio Buffering**: Ring buffer for zero-copy audio processing
- **Parallel Processing**: Transcription runs concurrent to audio capture
- **Chunk Overlap**: 100ms overlap prevents word cutoff

## Security Considerations

### Container Isolation
- Non-root user (node:1000)
- Read-only root filesystem
- No network access except OpenAI API

### API Key Management
- Environment variable injection
- Never logged or stored in container
- Fallback to local processing if missing

### Audio Privacy
- No persistent storage
- Memory-only processing
- Optional local-only mode

## Development Guidelines

### Code Style
- ES6+ modules
- Async/await for all I/O operations
- Comprehensive error handling
- JSDoc type annotations

### Testing Strategy
- Unit tests for VAD logic
- Integration tests with mock audio
- End-to-end tests in container

### Monitoring
- Health checks via HTTP endpoint
- Prometheus metrics for performance
- Structured JSON logging

## Library Versions

```json
{
  "dependencies": {
    "openai": "^4.0.0",
    "node-wav": "^0.0.2",
    "winston": "^3.11.0",
    "express": "^4.18.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "jest": "^29.0.0",
    "eslint": "^8.0.0"
  }
}
```

## Future Considerations

### Potential Upgrades
1. **WebRTC VAD**: If Node.js bindings improve
2. **Streaming Transcription**: When OpenAI adds support
3. **GPU Acceleration**: For local whisper.cpp

### Scalability Path
1. **Horizontal Scaling**: Multiple container instances
2. **Queue System**: Redis for audio chunk queuing
3. **Distributed Processing**: Kubernetes deployment