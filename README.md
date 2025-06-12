# Niri Transcribe

A ChatGPT-style dictation system for Linux Wayland environments, providing session-based speech-to-text transcription with immediate text input to focused windows.

## 🎯 Project Goals

- **Session-based speech recognition** with immediate text injection into active applications
- **Wayland-native integration** for seamless Linux desktop experience  
- **Docker-containerized deployment** for easy setup and consistent environments
- **Multiple transcription backends** (OpenAI Whisper API, local models)
- **User-controlled recording** with start/stop session management
- **Audio pipeline optimization** with session buffering and format conversion

## 🚧 Work in Progress

This project is currently under active development. Core audio capture functionality is implemented, with transcription services and UI components in progress.

**Current Status:** Session-Based Dictation Ready (Tickets 001-005, 012 complete)

### 📖 Documentation
- **[Implementation Roadmap](docs/roadmap.md)** - Detailed project timeline, ticket dependencies, and progress tracking with actual vs estimated completion times
- **[Technology Stack](docs/technology-stack.md)** - Complete technical architecture overview including Node.js audio pipeline, Docker containerization, and integration strategies  
- **[Development Tickets](docs/tickets/)** - Individual implementation tickets with detailed specifications, requirements, and acceptance criteria
- **[QA Testing Plans](docs/qa/)** - Manual testing procedures, performance benchmarks, and verification protocols for implemented features

### ✅ Completed Features
- Docker infrastructure with full audio stack access
- Session-based audio capture service with PipeWire/PulseAudio support
- JSON schema-based configuration system
- Audio format conversion and session buffering
- REST API endpoints for device management and recording control
- OpenAI Whisper API integration with transcription manager
- Complete session transcription workflow
- Comprehensive test suite (78 tests) and QA documentation

### 🔄 In Development
- Text output and injection service
- Host activation script for Niri integration
- Build and installation scripts

## ⚠️ Important Disclaimer

**This entire solution has been "vibecoded" using Claude Code AI assistant.** 

While the codebase follows established patterns and includes comprehensive testing, **use at your own risk**. The project is experimental and may contain bugs or unexpected behavior. Always review the code before deployment in production environments.

## 🚀 Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd niri-transcribe

# Start the service
docker compose up --build

# Check health
curl http://localhost:3000/health
```

## 📋 Requirements

- Docker and Docker Compose
- Linux with Wayland compositor
- Audio system (PipeWire/PulseAudio/ALSA)
- Optional: OpenAI API key for cloud transcription

## 📜 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

This project is in early development. Feel free to open issues or submit pull requests.