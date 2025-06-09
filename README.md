# Niri Transcribe

A MacOS-like dictation system for Linux Wayland environments, providing real-time speech-to-text transcription with immediate text input to focused windows.

## 🎯 Project Goals

- **Real-time speech recognition** with immediate text injection into active applications
- **Wayland-native integration** for seamless Linux desktop experience  
- **Docker-containerized deployment** for easy setup and consistent environments
- **Multiple transcription backends** (OpenAI Whisper API, local models)
- **Voice Activity Detection** to automatically start/stop transcription
- **Audio pipeline optimization** with circular buffering and format conversion

## 🚧 Work in Progress

This project is currently under active development. Core audio capture functionality is implemented, with transcription services and UI components in progress.

**Current Status:** Audio Pipeline Ready (Tickets 001-003 complete)

### ✅ Completed Features
- Docker infrastructure with full audio stack access
- Real-time audio capture service with PipeWire/PulseAudio support
- JSON schema-based configuration system
- Audio format conversion and circular buffering
- REST API endpoints for device management

### 🔄 In Development
- Voice Activity Detection (VAD)
- OpenAI Whisper integration
- Local transcription models
- Text output and injection service

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