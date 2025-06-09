# TICKET-006: Local Whisper.cpp Integration

## Blockers
- TICKET-002: Configuration System
- TICKET-004: VAD Implementation

## Priority
High

## Description
Implement local transcription using whisper.cpp as a fallback option when OpenAI API is unavailable or for privacy-sensitive environments.

## Acceptance Criteria
- [ ] Whisper.cpp binary integration
- [ ] Model download and management
- [ ] Audio transcription via CLI
- [ ] Error handling and recovery
- [ ] Performance optimization
- [ ] Model size selection

## Technical Requirements

### Local Transcription Service
```javascript
// src/services/transcription/local-transcription.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const AudioFormatConverter = require('../../utils/audio-format');

class LocalTranscriptionService {
  constructor(config) {
    this.config = config.transcription.local;
    this.modelsDir = path.join('/app/models');
    this.whisperPath = '/usr/local/bin/whisper'; // Will be installed in Docker
    this.tempDir = '/tmp/whisper';
    this.modelUrls = {
      'tiny': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
      'base': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
      'small': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin'
    };
    this.activeTranscriptions = new Map();
  }

  async initialize() {
    // Create directories
    await fs.mkdir(this.modelsDir, { recursive: true });
    await fs.mkdir(this.tempDir, { recursive: true });
    
    // Check/download model
    await this.ensureModel();
    
    // Verify whisper binary
    await this.verifyWhisperBinary();
  }

  async ensureModel() {
    const modelSize = this.config.modelSize || 'base';
    const modelFilename = `ggml-${modelSize}.en.bin`;
    const modelPath = path.join(this.modelsDir, modelFilename);
    
    try {
      await fs.access(modelPath);
      console.log(`Model ${modelSize} already exists`);
    } catch (error) {
      console.log(`Downloading model ${modelSize}...`);
      await this.downloadModel(modelSize);
    }
    
    this.modelPath = modelPath;
  }

  async downloadModel(modelSize) {
    const url = this.modelUrls[modelSize];
    if (!url) {
      throw new Error(`Unknown model size: ${modelSize}`);
    }

    const modelFilename = `ggml-${modelSize}.en.bin`;
    const modelPath = path.join(this.modelsDir, modelFilename);
    const tempPath = `${modelPath}.tmp`;

    try {
      // Download using wget (available in Docker)
      await this.execCommand('wget', [
        '-O', tempPath,
        '--progress=dot:giga',
        url
      ]);

      // Move to final location
      await fs.rename(tempPath, modelPath);
      console.log(`Model ${modelSize} downloaded successfully`);
    } catch (error) {
      // Clean up temp file
      try {
        await fs.unlink(tempPath);
      } catch (e) {
        // Ignore
      }
      throw new Error(`Failed to download model: ${error.message}`);
    }
  }

  async verifyWhisperBinary() {
    try {
      await this.execCommand(this.whisperPath, ['--help']);
    } catch (error) {
      throw new Error('whisper.cpp binary not found or not executable');
    }
  }

  async transcribe(audioData, options = {}) {
    const transcriptionId = crypto.randomBytes(16).toString('hex');
    const startTime = Date.now();
    
    try {
      // Convert audio to WAV file
      const wavBuffer = AudioFormatConverter.float32ToWav(
        audioData,
        this.config.sampleRate || 16000
      );
      
      const inputPath = path.join(this.tempDir, `${transcriptionId}.wav`);
      await fs.writeFile(inputPath, wavBuffer);
      
      // Run whisper.cpp
      const result = await this.runWhisper(inputPath, transcriptionId, options);
      
      // Clean up
      await this.cleanup(transcriptionId);
      
      const duration = Date.now() - startTime;
      console.log(`Local transcription completed in ${duration}ms`);
      
      return result;
    } catch (error) {
      await this.cleanup(transcriptionId);
      throw error;
    }
  }

  async runWhisper(inputPath, transcriptionId, options) {
    const outputPath = path.join(this.tempDir, `${transcriptionId}.txt`);
    
    const args = [
      '-m', this.modelPath,
      '-f', inputPath,
      '-of', outputPath,
      '--output-txt',
      '--no-timestamps',
      '-t', (this.config.threads || 4).toString(),
      '-l', 'en'
    ];

    // Add optional parameters
    if (options.prompt) {
      args.push('--prompt', options.prompt);
    }

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const whisperProcess = spawn(this.whisperPath, args);
      
      // Store active process
      this.activeTranscriptions.set(transcriptionId, whisperProcess);
      
      let stderr = '';
      
      whisperProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      whisperProcess.on('error', (error) => {
        this.activeTranscriptions.delete(transcriptionId);
        reject(new Error(`Whisper process error: ${error.message}`));
      });

      whisperProcess.on('exit', async (code) => {
        this.activeTranscriptions.delete(transcriptionId);
        
        if (code !== 0) {
          reject(new Error(`Whisper exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          // Read output
          const text = await fs.readFile(`${outputPath}.txt`, 'utf8');
          const processingTime = Date.now() - startTime;
          
          // Parse any additional info from stderr if needed
          const confidence = this.parseConfidence(stderr);
          
          resolve({
            text: text.trim(),
            confidence: confidence,
            language: 'en',
            processingTime: processingTime,
            modelSize: this.config.modelSize
          });
        } catch (error) {
          reject(new Error(`Failed to read output: ${error.message}`));
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.activeTranscriptions.has(transcriptionId)) {
          whisperProcess.kill('SIGTERM');
          reject(new Error('Whisper process timeout'));
        }
      }, 30000);
    });
  }

  parseConfidence(stderr) {
    // whisper.cpp doesn't provide confidence scores directly
    // We can estimate based on processing time or other metrics
    // For now, return a fixed high confidence
    return 0.95;
  }

  async cleanup(transcriptionId) {
    const files = [
      `${transcriptionId}.wav`,
      `${transcriptionId}.txt`,
      `${transcriptionId}.txt.txt` // whisper.cpp might add .txt
    ];

    for (const file of files) {
      try {
        await fs.unlink(path.join(this.tempDir, file));
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }

  async checkHealth() {
    try {
      // Verify whisper binary
      await this.verifyWhisperBinary();
      
      // Verify model exists
      await fs.access(this.modelPath);
      
      // Test with tiny audio
      const testAudio = new Float32Array(1600); // 0.1 second of silence
      await this.transcribe(testAudio);
      
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        reason: error.message,
        error: error
      };
    }
  }

  async execCommand(command, args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('exit', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed: ${stderr}`));
        }
      });
    });
  }

  getMetrics() {
    return {
      activeTranscriptions: this.activeTranscriptions.size,
      modelSize: this.config.modelSize,
      threads: this.config.threads
    };
  }

  async stop() {
    // Kill any active transcriptions
    for (const [id, process] of this.activeTranscriptions) {
      process.kill('SIGTERM');
      await this.cleanup(id);
    }
    this.activeTranscriptions.clear();
  }
}

module.exports = LocalTranscriptionService;
```

### Whisper Installation Script
```bash
#!/bin/bash
# scripts/install-whisper.sh

set -e

WHISPER_VERSION="v1.5.0"
INSTALL_DIR="/usr/local/bin"

echo "Installing whisper.cpp ${WHISPER_VERSION}..."

# Install build dependencies
apt-get update && apt-get install -y \
    build-essential \
    git \
    cmake

# Clone and build whisper.cpp
cd /tmp
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
git checkout ${WHISPER_VERSION}

# Build
make -j$(nproc)

# Install binary
cp main ${INSTALL_DIR}/whisper
chmod +x ${INSTALL_DIR}/whisper

# Clean up
cd /
rm -rf /tmp/whisper.cpp

echo "whisper.cpp installed successfully"
```

### Dockerfile Addition
```dockerfile
# Add to Dockerfile
COPY scripts/install-whisper.sh /tmp/
RUN bash /tmp/install-whisper.sh && rm /tmp/install-whisper.sh
```

## Implementation Steps
1. Create whisper.cpp installation script
2. Implement model download manager
3. Create temporary file handling
4. Implement whisper CLI execution
5. Add timeout and process management
6. Parse whisper output

## Testing Requirements
- Test model downloading
- Verify transcription accuracy
- Test error handling
- Performance benchmarking
- Concurrent transcription tests

## Estimated Time
5 hours

## Dependencies
- whisper.cpp binary
- wget for model downloads
- Temporary file management