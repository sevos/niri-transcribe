# TICKET-003: Audio Capture Service

## Blockers
- TICKET-001: Docker Infrastructure Setup
- TICKET-002: Configuration System

## Priority
High

## Description
Implement the audio capture service that interfaces with PipeWire/PulseAudio to capture microphone input in real-time.

## Acceptance Criteria
- [ ] PipeWire audio capture working
- [ ] PulseAudio fallback implemented
- [ ] 16kHz mono PCM output format
- [ ] Circular buffer for audio data
- [ ] Error handling and recovery
- [ ] Audio device selection support

## Technical Requirements

### Audio Capture Implementation
```javascript
// src/services/audio-capture.js
const { spawn } = require('child_process');
const EventEmitter = require('events');

class AudioCaptureService extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.captureProcess = null;
    this.isCapturing = false;
    this.audioBuffer = [];
    this.bufferSize = config.sampleRate * 30; // 30 seconds of audio
  }

  async start() {
    if (this.isCapturing) {
      throw new Error('Audio capture already in progress');
    }

    try {
      await this.detectAudioSystem();
      this.startCapture();
      this.isCapturing = true;
      this.emit('started');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async detectAudioSystem() {
    // Try PipeWire first
    try {
      await this.execCommand('pw-cli', ['--version']);
      this.audioSystem = 'pipewire';
      console.log('Using PipeWire audio system');
      return;
    } catch (error) {
      // PipeWire not available
    }

    // Try PulseAudio
    try {
      await this.execCommand('pactl', ['--version']);
      this.audioSystem = 'pulseaudio';
      console.log('Using PulseAudio audio system');
      return;
    } catch (error) {
      throw new Error('No compatible audio system found (PipeWire or PulseAudio required)');
    }
  }

  startCapture() {
    const args = this.buildCaptureArgs();
    
    this.captureProcess = spawn(args.command, args.args);
    
    this.captureProcess.stdout.on('data', (data) => {
      this.processAudioData(data);
    });

    this.captureProcess.stderr.on('data', (data) => {
      console.error('Audio capture error:', data.toString());
    });

    this.captureProcess.on('error', (error) => {
      this.emit('error', error);
      this.restart();
    });

    this.captureProcess.on('exit', (code) => {
      if (code !== 0 && this.isCapturing) {
        console.error(`Audio capture process exited with code ${code}`);
        this.restart();
      }
    });
  }

  buildCaptureArgs() {
    const { sampleRate, channels, device } = this.config.audio;

    if (this.audioSystem === 'pipewire') {
      return {
        command: 'pw-record',
        args: [
          '--format', 's16',
          '--rate', sampleRate.toString(),
          '--channels', channels.toString(),
          '--target', device || '0',
          '-'
        ]
      };
    } else {
      // PulseAudio
      return {
        command: 'parecord',
        args: [
          '--format=s16le',
          '--rate', sampleRate.toString(),
          '--channels', channels.toString(),
          '--raw',
          '--device', device || 'default',
          '-'
        ]
      };
    }
  }

  processAudioData(data) {
    // Convert raw PCM data to Float32Array
    const samples = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
    const floatSamples = new Float32Array(samples.length);
    
    for (let i = 0; i < samples.length; i++) {
      floatSamples[i] = samples[i] / 32768.0; // Convert to -1.0 to 1.0 range
    }

    // Add to circular buffer
    this.addToBuffer(floatSamples);
    
    // Emit audio data for processing
    this.emit('audio', floatSamples);
  }

  addToBuffer(samples) {
    this.audioBuffer.push(...samples);
    
    // Maintain circular buffer size
    if (this.audioBuffer.length > this.bufferSize) {
      this.audioBuffer = this.audioBuffer.slice(-this.bufferSize);
    }
  }

  async stop() {
    if (!this.isCapturing) {
      return;
    }

    this.isCapturing = false;
    
    if (this.captureProcess) {
      this.captureProcess.kill('SIGTERM');
      this.captureProcess = null;
    }

    this.emit('stopped');
  }

  async restart() {
    if (!this.isCapturing) {
      return;
    }

    console.log('Restarting audio capture...');
    await this.stop();
    
    setTimeout(() => {
      this.start().catch(error => {
        console.error('Failed to restart audio capture:', error);
        this.emit('error', error);
      });
    }, 1000);
  }

  async listDevices() {
    const devices = [];

    if (this.audioSystem === 'pipewire') {
      const output = await this.execCommand('pw-cli', ['list-objects', 'Node']);
      // Parse PipeWire output for audio sources
      // Implementation details omitted for brevity
    } else {
      const output = await this.execCommand('pactl', ['list', 'sources', 'short']);
      const lines = output.split('\n');
      
      for (const line of lines) {
        const [id, name, driver, format, state] = line.split('\t');
        if (name && !name.includes('.monitor')) {
          devices.push({ id, name, state });
        }
      }
    }

    return devices;
  }

  execCommand(command, args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      let output = '';
      let error = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr.on('data', (data) => {
        error += data.toString();
      });

      proc.on('exit', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(error || `Command failed with code ${code}`));
        }
      });
    });
  }

  getBufferedAudio(duration) {
    const samplesNeeded = this.config.audio.sampleRate * duration;
    const startIndex = Math.max(0, this.audioBuffer.length - samplesNeeded);
    
    return new Float32Array(this.audioBuffer.slice(startIndex));
  }
}

module.exports = AudioCaptureService;
```

### Audio Format Converter
```javascript
// src/utils/audio-format.js
class AudioFormatConverter {
  static float32ToWav(float32Array, sampleRate) {
    const length = float32Array.length;
    const arrayBuffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(arrayBuffer);

    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);

    // Convert float32 to int16
    let offset = 44;
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, sample * 0x7FFF, true);
      offset += 2;
    }

    return Buffer.from(arrayBuffer);
  }
}

module.exports = AudioFormatConverter;
```

## Implementation Steps
1. Implement audio system detection (PipeWire/PulseAudio)
2. Create audio capture process management
3. Implement PCM to Float32Array conversion
4. Add circular buffer for audio history
5. Implement error recovery and restart logic
6. Add device listing functionality

## Testing Requirements
- Mock audio capture for unit tests
- Integration tests with actual audio subsystem
- Error recovery testing
- Buffer overflow handling
- Format conversion accuracy

## Estimated Time
6 hours

## Dependencies
- Native PipeWire/PulseAudio binaries
- Node.js child_process module
- Buffer management utilities