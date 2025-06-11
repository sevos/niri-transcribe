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
    // Initial health check - don't await to avoid blocking constructor
    this.checkHealth().catch(error => {
      console.error('Initial health check failed:', error);
    });
    
    // Periodic health checks
    this.healthCheckIntervalId = setInterval(() => {
      this.checkHealth().catch(error => {
        console.error('Periodic health check failed:', error);
      });
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
      const openaiHealthy = health.openai && health.openai.healthy;
      const localHealthy = health.local && health.local.healthy;
      
      if (!openaiHealthy && localHealthy) {
        console.log('OpenAI service unhealthy, switching to local');
        this.primaryService = this.localService;
      } else if (openaiHealthy && this.primaryService === this.localService) {
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