# TICKET-011: Integration Testing and End-to-End Validation

## Blockers
- TICKET-008: Main Orchestrator Process
- TICKET-009: Host Activation Script
- TICKET-010: Build and Installation Scripts

## Priority
Medium

## Description
Implement comprehensive integration testing and end-to-end validation to ensure the complete transcription system works correctly across all components.

## Acceptance Criteria
- [ ] End-to-end audio pipeline testing
- [ ] API integration testing
- [ ] Container health validation
- [ ] Performance benchmarking
- [ ] Error recovery testing
- [ ] Mock testing framework

## Technical Requirements

### Integration Test Suite
```javascript
// tests/integration/transcription-pipeline.test.js
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const AudioFormatConverter = require('../../src/utils/audio-format');

class TranscriptionTestSuite {
  constructor() {
    this.testAssets = path.join(__dirname, '../assets');
    this.tempDir = path.join(__dirname, '../temp');
    this.containerName = 'niri-transcribe-test';
    this.baseUrl = 'http://localhost:3001'; // Test port
  }

  async setup() {
    console.log('Setting up integration tests...');
    
    // Create temp directory
    await fs.mkdir(this.tempDir, { recursive: true });
    
    // Ensure test assets exist
    await this.createTestAssets();
    
    // Start test container
    await this.startTestContainer();
    
    // Wait for container to be ready
    await this.waitForContainer();
  }

  async teardown() {
    console.log('Tearing down integration tests...');
    
    // Stop test container
    await this.execCommand('docker', ['stop', this.containerName]);
    await this.execCommand('docker', ['rm', this.containerName]);
    
    // Clean up temp files
    await fs.rmdir(this.tempDir, { recursive: true });
  }

  async createTestAssets() {
    // Create test audio files
    const testAudios = [
      this.generateSilence(2.0, 'silence-2s.wav'),
      this.generateSpeech(3.0, 'speech-3s.wav'),
      this.generateNoise(1.0, 'noise-1s.wav'),
    ];
    
    await Promise.all(testAudios);
  }

  async generateSilence(duration, filename) {
    const sampleRate = 16000;
    const samples = new Float32Array(sampleRate * duration);
    // Leave as zeros for silence
    
    const wavBuffer = AudioFormatConverter.float32ToWav(samples, sampleRate);
    await fs.writeFile(path.join(this.testAssets, filename), wavBuffer);
  }

  async generateSpeech(duration, filename) {
    const sampleRate = 16000;
    const samples = new Float32Array(sampleRate * duration);
    
    // Generate synthetic speech-like audio (sine waves with noise)
    for (let i = 0; i < samples.length; i++) {
      const t = i / sampleRate;
      const fundamental = 0.1 * Math.sin(2 * Math.PI * 200 * t); // 200Hz base
      const harmonic = 0.05 * Math.sin(2 * Math.PI * 400 * t);   // 400Hz harmonic
      const noise = 0.01 * (Math.random() - 0.5);               // Background noise
      samples[i] = fundamental + harmonic + noise;
    }
    
    const wavBuffer = AudioFormatConverter.float32ToWav(samples, sampleRate);
    await fs.writeFile(path.join(this.testAssets, filename), wavBuffer);
  }

  async generateNoise(duration, filename) {
    const sampleRate = 16000;
    const samples = new Float32Array(sampleRate * duration);
    
    // Generate random noise
    for (let i = 0; i < samples.length; i++) {
      samples[i] = 0.1 * (Math.random() - 0.5);
    }
    
    const wavBuffer = AudioFormatConverter.float32ToWav(samples, sampleRate);
    await fs.writeFile(path.join(this.testAssets, filename), wavBuffer);
  }

  async startTestContainer() {
    // Start container with test configuration
    const args = [
      'run', '-d',
      '--name', this.containerName,
      '-p', '3001:3000',
      '-e', 'NODE_ENV=test',
      '-e', 'AUTO_START=false',
      'niri-transcribe:latest'
    ];
    
    await this.execCommand('docker', args);
  }

  async waitForContainer() {
    const maxRetries = 30;
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        const response = await this.apiCall('/health');
        if (response.healthy) {
          console.log('Container is ready');
          return;
        }
      } catch (error) {
        // Container not ready yet
      }
      
      await this.sleep(1000);
      retries++;
    }
    
    throw new Error('Container failed to become ready');
  }

  // Test Cases

  async testHealthEndpoint() {
    console.log('Testing health endpoint...');
    
    const response = await this.apiCall('/health');
    
    this.assert(response.healthy === true, 'Health endpoint should return healthy');
    this.assert(response.services, 'Health response should include services');
    this.assert(response.uptime >= 0, 'Health response should include uptime');
    
    console.log('✅ Health endpoint test passed');
  }

  async testTranscriptionStartStop() {
    console.log('Testing transcription start/stop...');
    
    // Start transcription
    const startResponse = await this.apiCall('/start', 'POST');
    this.assert(startResponse.status === 'started', 'Should start transcription');
    
    // Verify status
    const metrics = await this.apiCall('/metrics');
    this.assert(metrics.state === 'running', 'State should be running');
    
    // Stop transcription
    const stopResponse = await this.apiCall('/stop', 'POST');
    this.assert(stopResponse.status === 'stopped', 'Should stop transcription');
    
    console.log('✅ Transcription start/stop test passed');
  }

  async testAudioPipeline() {
    console.log('Testing audio pipeline...');
    
    // Start transcription
    await this.apiCall('/start', 'POST');
    
    // Simulate audio input by directly calling the container's audio endpoint
    // This would require exposing a test endpoint in the container
    const testAudio = await fs.readFile(path.join(this.testAssets, 'speech-3s.wav'));
    
    const transcriptionResponse = await this.apiCall('/test/transcribe', 'POST', {
      headers: { 'Content-Type': 'audio/wav' },
      body: testAudio
    });
    
    this.assert(transcriptionResponse.text, 'Should return transcribed text');
    this.assert(transcriptionResponse.confidence >= 0, 'Should include confidence score');
    
    // Stop transcription
    await this.apiCall('/stop', 'POST');
    
    console.log('✅ Audio pipeline test passed');
  }

  async testVADDetection() {
    console.log('Testing VAD detection...');
    
    const testCases = [
      { file: 'silence-2s.wav', expectSpeech: false },
      { file: 'speech-3s.wav', expectSpeech: true },
      { file: 'noise-1s.wav', expectSpeech: false },
    ];
    
    for (const testCase of testCases) {
      const audioData = await fs.readFile(path.join(this.testAssets, testCase.file));
      
      const vadResponse = await this.apiCall('/test/vad', 'POST', {
        headers: { 'Content-Type': 'audio/wav' },
        body: audioData
      });
      
      this.assert(
        vadResponse.speechDetected === testCase.expectSpeech,
        `VAD should ${testCase.expectSpeech ? 'detect' : 'not detect'} speech in ${testCase.file}`
      );
    }
    
    console.log('✅ VAD detection test passed');
  }

  async testErrorRecovery() {
    console.log('Testing error recovery...');
    
    // Test API failures
    await this.apiCall('/start', 'POST');
    
    // Simulate API error by sending invalid data
    try {
      await this.apiCall('/test/transcribe', 'POST', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'data' })
      });
    } catch (error) {
      // Expected to fail
    }
    
    // Verify system is still healthy
    const health = await this.apiCall('/health');
    this.assert(health.healthy, 'System should remain healthy after API error');
    
    await this.apiCall('/stop', 'POST');
    
    console.log('✅ Error recovery test passed');
  }

  async testPerformance() {
    console.log('Testing performance...');
    
    const startTime = Date.now();
    
    // Start transcription
    await this.apiCall('/start', 'POST');
    
    // Process multiple audio chunks
    const audioData = await fs.readFile(path.join(this.testAssets, 'speech-3s.wav'));
    const promises = [];
    
    for (let i = 0; i < 5; i++) {
      promises.push(this.apiCall('/test/transcribe', 'POST', {
        headers: { 'Content-Type': 'audio/wav' },
        body: audioData
      }));
    }
    
    const results = await Promise.all(promises);
    
    // Stop transcription
    await this.apiCall('/stop', 'POST');
    
    const totalTime = Date.now() - startTime;
    const avgProcessingTime = results.reduce((sum, r) => sum + (r.processingTime || 0), 0) / results.length;
    
    console.log(`Performance metrics:`);
    console.log(`  Total time: ${totalTime}ms`);
    console.log(`  Average processing time: ${avgProcessingTime}ms`);
    console.log(`  Throughput: ${(5000 / totalTime).toFixed(2)} chunks/second`);
    
    this.assert(avgProcessingTime < 5000, 'Average processing time should be under 5s');
    
    console.log('✅ Performance test passed');
  }

  // Utility methods

  async apiCall(endpoint, method = 'GET', options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      method,
      ...options
    });
    
    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
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

  assert(condition, message) {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Main test runner

  async runAllTests() {
    const tests = [
      this.testHealthEndpoint,
      this.testTranscriptionStartStop,
      this.testAudioPipeline,
      this.testVADDetection,
      this.testErrorRecovery,
      this.testPerformance,
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      try {
        await test.call(this);
        passed++;
      } catch (error) {
        console.error(`❌ Test failed: ${error.message}`);
        failed++;
      }
    }

    console.log(`\n=== Test Results ===`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total: ${passed + failed}`);

    return failed === 0;
  }
}

// Export for use in test runner
module.exports = TranscriptionTestSuite;
```

### Test Runner Script
```bash
#!/bin/bash
# scripts/run-tests.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Test types
run_unit_tests() {
    log "Running unit tests..."
    
    cd "$PROJECT_DIR"
    
    if [ ! -d "node_modules" ]; then
        log "Installing test dependencies..."
        npm install --only=dev
    fi
    
    npm test
    success "Unit tests completed"
}

run_integration_tests() {
    log "Running integration tests..."
    
    # Ensure container is built
    if ! docker image inspect "niri-transcribe:latest" &> /dev/null; then
        log "Building container for tests..."
        "$SCRIPT_DIR/build.sh"
    fi
    
    # Run integration test suite
    cd "$PROJECT_DIR"
    node tests/integration/run-tests.js
    
    success "Integration tests completed"
}

run_end_to_end_tests() {
    log "Running end-to-end tests..."
    
    # Start the full system
    cd "$PROJECT_DIR"
    ./transcribe.sh start
    
    # Wait for system to be ready
    sleep 5
    
    # Run E2E tests
    node tests/e2e/run-tests.js
    
    # Stop the system
    ./transcribe.sh stop
    
    success "End-to-end tests completed"
}

run_performance_tests() {
    log "Running performance tests..."
    
    cd "$PROJECT_DIR"
    node tests/performance/benchmark.js
    
    success "Performance tests completed"
}

# Test categories
case "${1:-all}" in
    unit)
        run_unit_tests
        ;;
    integration)
        run_integration_tests
        ;;
    e2e)
        run_end_to_end_tests
        ;;
    performance)
        run_performance_tests
        ;;
    all)
        log "Running all test suites..."
        run_unit_tests
        run_integration_tests
        run_end_to_end_tests
        run_performance_tests
        success "All tests completed successfully!"
        ;;
    *)
        echo "Usage: $0 [unit|integration|e2e|performance|all]"
        exit 1
        ;;
esac
```

### Mock Testing Framework
```javascript
// tests/mocks/audio-mock.js
class AudioMock {
  constructor() {
    this.recordings = [];
    this.isRecording = false;
  }

  generateTestAudio(duration, frequency = 440) {
    const sampleRate = 16000;
    const samples = new Float32Array(sampleRate * duration);
    
    for (let i = 0; i < samples.length; i++) {
      const t = i / sampleRate;
      samples[i] = 0.5 * Math.sin(2 * Math.PI * frequency * t);
    }
    
    return samples;
  }

  generateSilence(duration) {
    const sampleRate = 16000;
    return new Float32Array(sampleRate * duration);
  }

  generateNoise(duration, amplitude = 0.1) {
    const sampleRate = 16000;
    const samples = new Float32Array(sampleRate * duration);
    
    for (let i = 0; i < samples.length; i++) {
      samples[i] = amplitude * (Math.random() - 0.5);
    }
    
    return samples;
  }
}

module.exports = AudioMock;
```

## Implementation Steps
1. Create integration test framework
2. Implement audio pipeline testing
3. Add API endpoint validation
4. Create performance benchmarking
5. Add error recovery testing
6. Create mock testing utilities

## Testing Requirements
- Container build verification
- API response validation
- Audio processing accuracy
- Performance threshold validation
- Error handling verification

## Estimated Time
5 hours

## Dependencies
- Jest or similar testing framework
- Docker for container testing
- Audio processing utilities
- HTTP testing libraries