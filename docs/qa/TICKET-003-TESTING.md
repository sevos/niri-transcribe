# TICKET-003 Audio Capture Service - Manual Testing Guide

## Quick Verification

The DEBUG environment variable warnings are **EXPECTED BEHAVIOR** - Docker Compose shows warnings for undefined variables, but DEBUG=true is correctly passed through as shown in the config output.

## Manual Testing Procedures

### 1. Basic Service Health Check

**Start the service:**
```bash
cd /home/sevos/dotfiles/raw_configs/niri/transcribe
DEBUG=true docker compose up
```

**Expected artifacts:**
```json
# Configuration loaded with debug enabled
{
  "output": {
    "debug": true,
    "punctuationDelay": 100,
    "typeDelay": 10
  }
}

# Service startup messages
{"level":"info","message":"Detected PipeWire audio system"}
{"level":"info","message":"Audio capture service started successfully"}
{"level":"info","message":"Audio capture auto-started successfully"}

# Real-time audio data streaming (every ~128ms)
{"level":"debug","message":"Audio data received: 2048 samples, RMS: 0.0012"}
```

### 2. Health Endpoint Verification

**Test command:**
```bash
curl -s http://localhost:3000/health | jq
```

**Expected artifacts:**
```json
{
  "status": "healthy",
  "timestamp": "2025-06-09T22:37:38.438Z",
  "uptime": 123.515,
  "memoryUsage": {
    "rss": 76042240,
    "heapTotal": 31621120,
    "heapUsed": 15853704
  },
  "config": {
    "audioDevice": "default",
    "transcriptionProvider": "auto",
    "serverPort": 3000,
    "debugEnabled": true
  },
  "environment": {
    "nodeVersion": "v20.19.2",
    "platform": "linux",
    "waylandDisplay": "wayland-1",
    "pulseServer": "/tmp/pulse/native"
  },
  "services": {
    "audioCapture": {
      "isCapturing": true,
      "audioSystem": "pipewire",
      "bufferLength": 480000,
      "bufferDuration": 30,
      "restartCount": 0,
      "processId": 15
    }
  }
}
```

**Key indicators:**
- ✅ `services.audioCapture.isCapturing: true`
- ✅ `services.audioCapture.audioSystem: "pipewire"`
- ✅ `services.audioCapture.bufferLength: 480000` (30 seconds @ 16kHz)
- ✅ `services.audioCapture.restartCount: 0` (no failures)

### 3. Audio Device Discovery

**Test command:**
```bash
curl -s http://localhost:3000/audio/devices | jq
```

**Expected artifacts:**
```json
[
  {
    "id": "alsa_input.pci-0000_00_1f.3.analog-stereo",
    "name": "Built-in Audio Analog Stereo",
    "state": "available"
  }
]
```

*Note: Empty array `[]` is normal in containerized environment without direct hardware access*

### 4. Audio Control API Testing

**Manual stop/start cycle:**
```bash
# Stop audio capture
curl -X POST http://localhost:3000/audio/stop
# Expected: {"status":"stopped"}

# Verify stopped state
curl -s http://localhost:3000/health | jq '.services.audioCapture.isCapturing'
# Expected: false

# Restart audio capture
curl -X POST http://localhost:3000/audio/start
# Expected: {"status":"started"}

# Verify running state
curl -s http://localhost:3000/health | jq '.services.audioCapture.isCapturing'
# Expected: true
```

### 5. Real-time Audio Activity Testing

**Method 1: RMS Energy Monitoring**
```bash
# Start service with debug logging
DEBUG=true docker compose up

# Generate audio input (speak into microphone or play audio)
# Watch for RMS energy changes in logs:
# Silence: RMS: 0.0001-0.0010
# Speech:  RMS: 0.0100-0.1000+
# Loud:    RMS: 0.1000+
```

**Method 2: Buffer Growth Verification**
```bash
# Check buffer accumulation over time
watch -n 1 'curl -s http://localhost:3000/health | jq ".services.audioCapture.bufferLength"'

# Expected behavior:
# - Buffer grows from 0 to ~480,000 samples over 30 seconds
# - Then stabilizes at 480,000 (circular buffer limit)
```

### 6. Error Recovery Testing

**Test restart functionality:**
```bash
# Kill the audio capture process inside container
docker exec niri-transcribe pkill pw-record

# Watch logs for automatic restart:
{"level":"warn","message":"Audio capture process exited unexpectedly"}
{"level":"info","message":"Restarting audio capture in 1000ms (attempt 1/5)"}
{"level":"info","message":"Audio capture restarted successfully"}
```

### 7. Performance Metrics

**Memory usage validation:**
```bash
# Monitor memory over 5 minutes
watch -n 10 'curl -s http://localhost:3000/health | jq ".memoryUsage.rss"'

# Expected: Stable ~70-80MB RSS, no significant growth
```

**CPU usage check:**
```bash
docker stats niri-transcribe

# Expected: <20% CPU during active audio capture
```

## Expected File Artifacts

After implementation, these files should exist:

```
src/
├── services/
│   └── audio-capture.js        # 250+ lines, AudioCaptureService class
├── utils/
│   └── audio-format.js         # 200+ lines, conversion utilities
├── config/
│   ├── index.js               # Updated with audio config support
│   └── schema.js              # Updated with audio schema
└── main.js                    # Updated with audio integration

config/
└── config.json                # Audio configuration parameters
```

## Performance Expectations

### Real-time Metrics
- **Audio latency**: <50ms from microphone to buffer
- **Memory usage**: 70-80MB RSS stable
- **CPU usage**: <20% during capture
- **Buffer update rate**: ~128ms intervals (2048 samples @ 16kHz)

### Audio Quality
- **Sample rate**: 16kHz (verified in config)
- **Channels**: Mono (1 channel)
- **Format**: 16-bit PCM → Float32 normalized
- **Dynamic range**: -1.0 to +1.0 floating point

### Error Handling
- **Restart attempts**: Max 5 with exponential backoff
- **Recovery time**: 1s, 2s, 4s, 8s, 10s intervals
- **Graceful degradation**: Service continues even if audio fails

## Troubleshooting Common Issues

### No Audio Data (RMS always 0.0000)
```bash
# Check PipeWire/PulseAudio is running
docker exec niri-transcribe pw-cli info
docker exec niri-transcribe pactl info

# Verify audio device access
docker exec niri-transcribe ls -la /dev/snd/
```

### Service Won't Start
```bash
# Check container logs
docker compose logs transcribe

# Common issues:
# - Audio socket mounting problems
# - Missing PipeWire/PulseAudio tools
# - Permission issues with /dev/snd
```

### High Memory Usage
```bash
# Normal behavior: Buffer grows to 30s of audio then stabilizes
# Problem: Continuous growth indicates memory leak
# Solution: Check buffer management in circular buffer logic
```

This comprehensive testing guide allows you to verify all aspects of the audio capture implementation manually.