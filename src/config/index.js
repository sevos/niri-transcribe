const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const configSchema = require('./schema');

class ConfigurationManager {
  constructor() {
    this.config = null;
    this.ajv = new Ajv({ useDefaults: true });
  }

  load() {
    const configPath = path.join(__dirname, '../../config/config.json');
    let config = {};
    
    if (fs.existsSync(configPath)) {
      try {
        const configFile = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(configFile);
      } catch (error) {
        throw new Error(`Failed to parse configuration file: ${error.message}`);
      }
    }

    config = this.applyEnvironmentOverrides(config);

    const validate = this.ajv.compile(configSchema);
    if (!validate(config)) {
      throw new Error(`Configuration validation failed: ${JSON.stringify(validate.errors, null, 2)}`);
    }

    this.config = config;
    this.logConfiguration();

    return config;
  }

  applyEnvironmentOverrides(config) {
    if (process.env.OPENAI_API_KEY) {
      config.transcription = config.transcription || {};
      config.transcription.openai = config.transcription.openai || {};
      config.transcription.openai.apiKey = process.env.OPENAI_API_KEY;
    }

    if (process.env.AUDIO_DEVICE) {
      config.audio = config.audio || {};
      config.audio.device = process.env.AUDIO_DEVICE;
    }

    // Note: PORT environment variable only affects docker-compose external mapping
    // Internal container port should always be 3000 for simplicity

    if (process.env.VAD_THRESHOLD) {
      config.audio = config.audio || {};
      config.audio.vadThreshold = parseFloat(process.env.VAD_THRESHOLD);
    }

    if (process.env.TRANSCRIPTION_PROVIDER) {
      config.transcription = config.transcription || {};
      config.transcription.provider = process.env.TRANSCRIPTION_PROVIDER;
    }

    if (process.env.DEBUG === 'true') {
      config.output = config.output || {};
      config.output.debug = true;
    }

    return config;
  }

  logConfiguration() {
    const safeConfig = JSON.parse(JSON.stringify(this.config));
    
    if (safeConfig.transcription?.openai?.apiKey) {
      safeConfig.transcription.openai.apiKey = '***MASKED***';
    }

    console.log('Configuration loaded:', JSON.stringify(safeConfig, null, 2));
  }

  get(path) {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }

    const keys = path.split('.');
    let value = this.config;
    
    for (const key of keys) {
      value = value?.[key];
    }
    
    return value;
  }

  getAudioConfig() {
    return this.get('audio');
  }

  getTranscriptionConfig() {
    return this.get('transcription');
  }

  getOutputConfig() {
    return this.get('output');
  }

  getServerConfig() {
    return this.get('server');
  }

  isDebugEnabled() {
    return this.get('output.debug') || false;
  }
}

module.exports = new ConfigurationManager();