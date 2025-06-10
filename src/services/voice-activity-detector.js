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
    } else if (isSpeech && this.isSpeaking) {
      // Speech continuing - clear any pending end timer
      if (this.speechEndTimer) {
        clearTimeout(this.speechEndTimer);
        this.speechEndTimer = null;
      }
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
    
    // If already speaking, just continue (speech resumed during end delay)
    if (this.isSpeaking) {
      return;
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

  endSpeech(reason = 'silence') {
    if (!this.isSpeaking) return;
    
    this.isSpeaking = false;
    this.speechEndTime = Date.now();
    
    const duration = this.speechEndTime - this.speechStartTime;
    
    // Only emit chunks of minimum duration
    if (duration >= this.minChunkDuration) {
      // The audio buffer already contains all the speech
      // Just convert to Float32Array
      const audioChunk = new Float32Array(this.audioBuffer);
      
      this.emit('speechEnd', {
        audio: audioChunk,
        duration: duration,
        timestamp: this.speechStartTime,
        reason: reason
      });
      
    }
    
    // Reset buffer
    this.audioBuffer = [];
    this.speechStartTime = null;
  }

  forceEndSpeech() {
    this.endSpeech('max_duration');
    
    // Immediately start new speech segment
    this.isSpeaking = true;
    this.speechStartTime = Date.now();
    this.emit('speechStart', { reason: 'continued' });
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
          this.silenceTimer = null;
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
  }

  updateConfig(config) {
    this.energyThreshold = config.vadThreshold || this.energyThreshold;
    this.silenceTimeout = config.silenceTimeout || this.silenceTimeout;
    this.adaptiveThreshold = this.energyThreshold;
  }

  getStatus() {
    return {
      isSpeaking: this.isSpeaking,
      bufferLength: this.audioBuffer.length,
      bufferDuration: this.audioBuffer.length / this.sampleRate,
      noiseFloor: this.noiseFloor,
      adaptiveThreshold: this.adaptiveThreshold,
      frameBufferLength: this.frameBuffer.length
    };
  }
}

module.exports = VoiceActivityDetector;