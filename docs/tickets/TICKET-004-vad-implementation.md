# TICKET-004: Voice Activity Detection (VAD) Implementation

## Blockers
- TICKET-003: Audio Capture Service (need audio stream)

## Priority
High

## Description
Implement a custom energy-based Voice Activity Detection system to identify speech segments and create 1-3 second audio chunks for transcription.

## Acceptance Criteria
- [ ] Energy-based VAD algorithm implemented
- [ ] Adaptive noise floor detection
- [ ] Speech onset/offset detection
- [ ] 1-3 second chunk generation
- [ ] Configurable sensitivity thresholds
- [ ] 10-second silence timeout

## Technical Requirements

### VAD Implementation
```javascript
// src/services/voice-activity-detector.js
const EventEmitter = require('events');

class VoiceActivityDetector extends EventEmitter {
  constructor(config) {
    super();
    
    // Configuration
    this.sampleRate = config.audio.sampleRate;
    this.frameSize = Math.floor(this.sampleRate * 0.03); // 30ms frames
    this.energyThreshold = config.audio.vadThreshold;
    this.speechStartDelay = 300; // ms
    this.speechEndDelay = 1000; // ms
    this.maxChunkDuration = 3000; // ms
    this.minChunkDuration = 1000; // ms
    this.silenceTimeout = config.audio.silenceTimeout;
    
    // State
    this.isSpeaking = false;
    this.speechStartTime = null;
    this.speechEndTime = null;
    this.lastSpeechTime = null;
    this.audioBuffer = [];
    this.frameBuffer = [];
    this.noiseFloor = 0.001;
    this.adaptiveThreshold = this.energyThreshold;
    
    // Timers
    this.speechStartTimer = null;
    this.speechEndTimer = null;
    this.silenceTimer = null;
  }

  processAudio(audioData) {
    // Add to frame buffer
    this.frameBuffer.push(...audioData);
    
    // Process complete frames
    while (this.frameBuffer.length >= this.frameSize) {
      const frame = new Float32Array(this.frameBuffer.splice(0, this.frameSize));
      this.processFrame(frame);
    }
  }

  processFrame(frame) {
    const energy = this.calculateEnergy(frame);
    const isSpeech = this.detectSpeech(energy);
    
    // Update adaptive threshold
    this.updateNoiseFloor(energy, isSpeech);
    
    // Add frame to buffer
    this.audioBuffer.push(...frame);
    
    // Handle speech state transitions
    if (isSpeech && !this.isSpeaking) {
      this.handleSpeechStart();
    } else if (!isSpeech && this.isSpeaking) {
      this.handleSpeechEnd();
    }
    
    // Check for maximum chunk duration
    if (this.isSpeaking && this.speechStartTime) {
      const duration = Date.now() - this.speechStartTime;
      if (duration >= this.maxChunkDuration) {
        this.forceEndSpeech();
      }
    }
    
    // Handle silence timeout
    this.handleSilenceTimeout(isSpeech);
  }

  calculateEnergy(frame) {
    // Root Mean Square (RMS) energy
    let sum = 0;
    for (let i = 0; i < frame.length; i++) {
      sum += frame[i] * frame[i];
    }
    return Math.sqrt(sum / frame.length);
  }

  detectSpeech(energy) {
    // Dynamic threshold based on noise floor
    const threshold = Math.max(
      this.adaptiveThreshold,
      this.noiseFloor * 3 // 3x noise floor
    );
    
    return energy > threshold;
  }

  updateNoiseFloor(energy, isSpeech) {
    if (!isSpeech) {
      // Exponential moving average for noise floor
      const alpha = 0.01; // Adaptation rate
      this.noiseFloor = alpha * energy + (1 - alpha) * this.noiseFloor;
      
      // Update adaptive threshold
      this.adaptiveThreshold = this.noiseFloor * 5;
    }
  }

  handleSpeechStart() {
    // Clear any pending end timer
    if (this.speechEndTimer) {
      clearTimeout(this.speechEndTimer);
      this.speechEndTimer = null;
    }
    
    // Start speech detection timer
    if (!this.speechStartTimer) {
      this.speechStartTimer = setTimeout(() => {
        this.isSpeaking = true;
        this.speechStartTime = Date.now();
        this.lastSpeechTime = Date.now();
        
        // Include pre-speech buffer (300ms)
        const preSpeechSamples = Math.floor(this.sampleRate * 0.3);
        const startIndex = Math.max(0, this.audioBuffer.length - preSpeechSamples);
        this.audioBuffer = this.audioBuffer.slice(startIndex);
        
        this.emit('speechStart');
        console.log('Speech started');
      }, this.speechStartDelay);
    }
  }

  handleSpeechEnd() {
    // Clear start timer if still pending
    if (this.speechStartTimer) {
      clearTimeout(this.speechStartTimer);
      this.speechStartTimer = null;
    }
    
    // Start end detection timer
    if (this.isSpeaking && !this.speechEndTimer) {
      this.speechEndTimer = setTimeout(() => {
        this.endSpeech();
      }, this.speechEndDelay);
    }
  }

  endSpeech() {
    if (!this.isSpeaking) return;
    
    this.isSpeaking = false;
    this.speechEndTime = Date.now();
    
    const duration = this.speechEndTime - this.speechStartTime;
    
    // Only emit chunks of minimum duration
    if (duration >= this.minChunkDuration) {
      // Include post-speech buffer (200ms)
      const postSpeechSamples = Math.floor(this.sampleRate * 0.2);
      const audioChunk = new Float32Array(this.audioBuffer.slice(0, this.audioBuffer.length + postSpeechSamples));
      
      this.emit('speechEnd', {
        audio: audioChunk,
        duration: duration,
        timestamp: this.speechStartTime
      });
      
      console.log(`Speech ended, duration: ${duration}ms`);
    }
    
    // Reset buffer
    this.audioBuffer = [];
    this.speechStartTime = null;
  }

  forceEndSpeech() {
    console.log('Forcing speech end due to maximum duration');
    this.endSpeech();
    
    // Immediately start new speech segment
    this.isSpeaking = true;
    this.speechStartTime = Date.now();
    this.emit('speechStart');
  }

  handleSilenceTimeout(isSpeech) {
    if (isSpeech) {
      this.lastSpeechTime = Date.now();
      
      // Clear silence timer
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
    } else if (this.lastSpeechTime) {
      // Start silence timer if not already running
      if (!this.silenceTimer) {
        this.silenceTimer = setTimeout(() => {
          this.emit('silenceTimeout');
          console.log('Silence timeout reached');
        }, this.silenceTimeout);
      }
    }
  }

  reset() {
    // Clear all timers
    if (this.speechStartTimer) {
      clearTimeout(this.speechStartTimer);
      this.speechStartTimer = null;
    }
    if (this.speechEndTimer) {
      clearTimeout(this.speechEndTimer);
      this.speechEndTimer = null;
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    
    // Reset state
    this.isSpeaking = false;
    this.speechStartTime = null;
    this.speechEndTime = null;
    this.lastSpeechTime = null;
    this.audioBuffer = [];
    this.frameBuffer = [];
    
    console.log('VAD reset');
  }

  updateConfig(config) {
    this.energyThreshold = config.vadThreshold || this.energyThreshold;
    this.silenceTimeout = config.silenceTimeout || this.silenceTimeout;
    this.adaptiveThreshold = this.energyThreshold;
  }
}

module.exports = VoiceActivityDetector;
```

### VAD Utilities
```javascript
// src/utils/audio-analysis.js
class AudioAnalysis {
  static calculateSpectralCentroid(frame, sampleRate) {
    // FFT-based spectral centroid for better speech detection
    // Simplified implementation - in production, use FFT library
    let weightedSum = 0;
    let magnitudeSum = 0;
    
    for (let i = 0; i < frame.length; i++) {
      const magnitude = Math.abs(frame[i]);
      weightedSum += magnitude * i;
      magnitudeSum += magnitude;
    }
    
    return magnitudeSum > 0 ? (weightedSum / magnitudeSum) * (sampleRate / 2) / frame.length : 0;
  }

  static calculateZeroCrossingRate(frame) {
    let crossings = 0;
    
    for (let i = 1; i < frame.length; i++) {
      if ((frame[i] >= 0) !== (frame[i - 1] >= 0)) {
        crossings++;
      }
    }
    
    return crossings / frame.length;
  }

  static applyPreEmphasis(frame, coefficient = 0.97) {
    const result = new Float32Array(frame.length);
    result[0] = frame[0];
    
    for (let i = 1; i < frame.length; i++) {
      result[i] = frame[i] - coefficient * frame[i - 1];
    }
    
    return result;
  }
}

module.exports = AudioAnalysis;
```

## Implementation Steps
1. Implement energy-based speech detection
2. Add adaptive noise floor estimation
3. Implement speech onset/offset timers
4. Add audio buffering for chunks
5. Implement silence timeout detection
6. Add configuration update support

## Testing Requirements
- Unit tests with synthetic audio
- Test various noise environments
- Verify chunk duration limits
- Test silence timeout behavior
- Validate adaptive threshold

## Estimated Time
5 hours

## Dependencies
- EventEmitter for state management
- Audio analysis utilities