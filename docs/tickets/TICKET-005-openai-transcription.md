# TICKET-005: OpenAI Whisper API Integration

## Blockers
- TICKET-002: Configuration System (need API key management)
- TICKET-004: VAD Implementation (need audio chunks)

## Priority
High

## Description
Implement the OpenAI Whisper API integration for primary transcription service with error handling and retry logic.

## Acceptance Criteria
- [ ] OpenAI client configuration
- [ ] Audio chunk transcription
- [ ] Error handling with retry logic
- [ ] API rate limiting
- [ ] Response parsing and validation
- [ ] Fallback triggering logic

## Technical Requirements

### OpenAI Transcription Service
```javascript
// src/services/transcription/openai-transcription.js
const OpenAI = require('openai');
const FormData = require('form-data');
const AudioFormatConverter = require('../../utils/audio-format');

class OpenAITranscriptionService {
  constructor(config) {
    this.config = config.transcription.openai;
    this.enabled = !!this.config.apiKey;
    
    if (this.enabled) {
      this.client = new OpenAI({
        apiKey: this.config.apiKey,
      });
    }
    
    // Rate limiting
    this.requestQueue = [];
    this.processing = false;
    this.lastRequestTime = 0;
    this.minRequestInterval = 100; // ms between requests
    
    // Retry configuration
    this.maxRetries = 3;
    this.retryDelay = 1000; // Initial retry delay
    this.retryBackoff = 2; // Exponential backoff multiplier
  }

  async transcribe(audioData, options = {}) {
    if (!this.enabled) {
      throw new Error('OpenAI transcription service is not configured');
    }

    return new Promise((resolve, reject) => {
      this.requestQueue.push({ audioData, options, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.requestQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      
      try {
        // Rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
          await this.sleep(this.minRequestInterval - timeSinceLastRequest);
        }
        
        const result = await this.processRequest(request);
        request.resolve(result);
        this.lastRequestTime = Date.now();
      } catch (error) {
        request.reject(error);
      }
    }

    this.processing = false;
  }

  async processRequest({ audioData, options }) {
    // Convert Float32Array to WAV buffer
    const wavBuffer = AudioFormatConverter.float32ToWav(
      audioData,
      this.config.sampleRate || 16000
    );

    let lastError;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const transcription = await this.callWhisperAPI(wavBuffer, options);
        return this.parseResponse(transcription);
      } catch (error) {
        lastError = error;
        console.error(`OpenAI API error (attempt ${attempt + 1}):`, error.message);
        
        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        // Wait before retry with exponential backoff
        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelay * Math.pow(this.retryBackoff, attempt);
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError;
  }

  async callWhisperAPI(wavBuffer, options) {
    const formData = new FormData();
    
    // Create a Blob from the buffer
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    formData.append('file', blob, 'audio.wav');
    formData.append('model', this.config.model || 'whisper-1');
    
    if (this.config.language) {
      formData.append('language', this.config.language);
    }
    
    if (this.config.temperature !== undefined) {
      formData.append('temperature', this.config.temperature.toString());
    }
    
    // Optional parameters from options
    if (options.prompt) {
      formData.append('prompt', options.prompt);
    }
    
    if (options.responseFormat) {
      formData.append('response_format', options.responseFormat);
    }

    const response = await this.client.audio.transcriptions.create({
      file: blob,
      model: this.config.model || 'whisper-1',
      language: this.config.language,
      temperature: this.config.temperature,
      prompt: options.prompt,
      response_format: options.responseFormat || 'json'
    });

    return response;
  }

  parseResponse(response) {
    if (typeof response === 'string') {
      return {
        text: response,
        confidence: 1.0,
        language: this.config.language || 'en'
      };
    }

    return {
      text: response.text || '',
      confidence: response.confidence || 1.0,
      language: response.language || this.config.language || 'en',
      segments: response.segments || [],
      duration: response.duration
    };
  }

  isRetryableError(error) {
    // Network errors
    if (error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT' || 
        error.code === 'ENOTFOUND') {
      return true;
    }

    // HTTP status codes
    const status = error.response?.status || error.status;
    if (status === 429 || // Rate limit
        status === 500 || // Server error
        status === 502 || // Bad gateway
        status === 503 || // Service unavailable
        status === 504) { // Gateway timeout
      return true;
    }

    return false;
  }

  async checkHealth() {
    if (!this.enabled) {
      return { healthy: false, reason: 'API key not configured' };
    }

    try {
      // Create a very short silent audio for health check
      const silentAudio = new Float32Array(16000 * 0.1); // 0.1 second of silence
      await this.transcribe(silentAudio, { responseFormat: 'text' });
      
      return { healthy: true };
    } catch (error) {
      return { 
        healthy: false, 
        reason: error.message,
        error: error
      };
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getMetrics() {
    return {
      queueLength: this.requestQueue.length,
      processing: this.processing,
      enabled: this.enabled
    };
  }
}

module.exports = OpenAITranscriptionService;
```

### Transcription Manager
```javascript
// src/services/transcription/transcription-manager.js
const EventEmitter = require('events');
const OpenAITranscriptionService = require('./openai-transcription');
const LocalTranscriptionService = require('./local-transcription');

class TranscriptionManager extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    
    // Initialize services
    this.openaiService = new OpenAITranscriptionService(config);
    this.localService = new LocalTranscriptionService(config);
    
    // Service selection
    this.primaryService = this.selectPrimaryService();
    this.lastHealthCheck = null;
    this.healthCheckInterval = 60000; // 1 minute
    
    // Start health monitoring
    this.startHealthMonitoring();
  }

  selectPrimaryService() {
    const provider = this.config.transcription.provider;
    
    if (provider === 'openai' && this.openaiService.enabled) {
      return this.openaiService;
    } else if (provider === 'local') {
      return this.localService;
    } else if (provider === 'auto') {
      // Auto mode: prefer OpenAI if available
      return this.openaiService.enabled ? this.openaiService : this.localService;
    }
    
    return this.localService;
  }

  async transcribe(audioData, options = {}) {
    const startTime = Date.now();
    
    try {
      // Try primary service
      const result = await this.primaryService.transcribe(audioData, options);
      
      const duration = Date.now() - startTime;
      this.emit('transcription', {
        ...result,
        service: this.primaryService.constructor.name,
        duration: duration
      });
      
      return result;
    } catch (error) {
      console.error('Primary transcription service failed:', error);
      
      // Try fallback if available
      if (this.primaryService === this.openaiService && this.localService) {
        console.log('Falling back to local transcription service');
        
        try {
          const result = await this.localService.transcribe(audioData, options);
          
          const duration = Date.now() - startTime;
          this.emit('transcription', {
            ...result,
            service: 'LocalTranscriptionService',
            duration: duration,
            fallback: true
          });
          
          return result;
        } catch (fallbackError) {
          console.error('Fallback transcription service also failed:', fallbackError);
          throw fallbackError;
        }
      }
      
      throw error;
    }
  }

  startHealthMonitoring() {
    // Initial health check
    this.checkHealth();
    
    // Periodic health checks
    setInterval(() => {
      this.checkHealth();
    }, this.healthCheckInterval);
  }

  async checkHealth() {
    const health = {
      openai: await this.openaiService.checkHealth(),
      local: await this.localService.checkHealth(),
      timestamp: Date.now()
    };
    
    this.lastHealthCheck = health;
    
    // Switch to local if OpenAI is unhealthy in auto mode
    if (this.config.transcription.provider === 'auto') {
      if (!health.openai.healthy && health.local.healthy) {
        console.log('OpenAI service unhealthy, switching to local');
        this.primaryService = this.localService;
      } else if (health.openai.healthy && this.primaryService === this.localService) {
        console.log('OpenAI service restored, switching back');
        this.primaryService = this.openaiService;
      }
    }
    
    this.emit('health', health);
    return health;
  }

  getMetrics() {
    return {
      primaryService: this.primaryService.constructor.name,
      openai: this.openaiService.getMetrics(),
      local: this.localService.getMetrics(),
      lastHealthCheck: this.lastHealthCheck
    };
  }
}

module.exports = TranscriptionManager;
```

## Implementation Steps
1. Set up OpenAI client with API key
2. Implement audio format conversion
3. Add request queuing and rate limiting
4. Implement retry logic with backoff
5. Create transcription manager for fallback
6. Add health monitoring system

## Testing Requirements
- Mock OpenAI API responses
- Test retry logic with failures
- Verify rate limiting behavior
- Test fallback mechanism
- Validate response parsing

## Estimated Time
4 hours

## Dependencies
- openai (official SDK)
- form-data (for multipart uploads)
- Audio format converter utility