// Placeholder for local transcription service
// This will be implemented in TICKET-006

class LocalTranscriptionService {
  constructor(config) {
    this.config = config.transcription.local || {};
    this.enabled = false; // Disabled until TICKET-006
  }

  async transcribe(audioData, options = {}) {
    throw new Error('Local transcription not implemented yet (TICKET-006)');
  }

  async checkHealth() {
    return {
      healthy: false,
      reason: 'Not implemented (TICKET-006)'
    };
  }

  getMetrics() {
    return {
      enabled: this.enabled,
      modelLoaded: false
    };
  }
}

module.exports = LocalTranscriptionService;