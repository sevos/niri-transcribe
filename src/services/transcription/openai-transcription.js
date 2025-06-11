const OpenAI = require('openai');
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
    // Create a File object from the buffer
    const file = new File([wavBuffer], 'audio.wav', { type: 'audio/wav' });
    
    const transcriptionOptions = {
      file: file,
      model: this.config.model || 'whisper-1',
    };
    
    // Only set language if explicitly specified (not 'auto')
    if (this.config.language && this.config.language !== 'auto') {
      transcriptionOptions.language = this.config.language;
    }
    // When language is 'auto' or not specified, let Whisper auto-detect
    
    if (this.config.temperature !== undefined) {
      transcriptionOptions.temperature = this.config.temperature;
    }
    
    // Optional parameters from options
    if (options.prompt) {
      transcriptionOptions.prompt = options.prompt;
    }
    
    if (options.responseFormat) {
      transcriptionOptions.response_format = options.responseFormat;
    } else {
      // Use verbose_json to get language detection information
      transcriptionOptions.response_format = 'verbose_json';
    }

    const response = await this.client.audio.transcriptions.create(transcriptionOptions);

    return response;
  }

  parseResponse(response) {
    if (typeof response === 'string') {
      return {
        text: response,
        confidence: 1.0,
        language: 'unknown' // For text responses, we can't determine language
      };
    }

    // Extract language from verbose_json response
    let detectedLanguage = 'unknown';
    if (response.language) {
      detectedLanguage = response.language;
    }

    return {
      text: response.text || '',
      confidence: response.confidence || 1.0,
      language: detectedLanguage, // Use actual detected language from API
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