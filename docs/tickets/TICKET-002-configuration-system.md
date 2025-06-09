# TICKET-002: Configuration System

## Blockers
- TICKET-001: Docker Infrastructure Setup (need container structure)

## Priority
High

## Description
Implement a flexible configuration system for managing API keys, audio settings, and application behavior.

## Acceptance Criteria
- [ ] JSON configuration schema defined
- [ ] Environment variable override support
- [ ] Configuration validation on startup
- [ ] Example configuration file created
- [ ] Secure API key handling
- [ ] Configuration documentation complete

## Technical Requirements

### Configuration Schema
```javascript
// config/schema.js
const configSchema = {
  type: 'object',
  required: ['audio', 'transcription'],
  properties: {
    audio: {
      type: 'object',
      properties: {
        sampleRate: { type: 'number', default: 16000 },
        channels: { type: 'number', default: 1 },
        chunkDuration: { type: 'number', default: 2000 }, // ms
        vadThreshold: { type: 'number', default: 0.01 },
        silenceTimeout: { type: 'number', default: 10000 }, // ms
        device: { type: 'string', default: 'default' }
      }
    },
    transcription: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['openai', 'local', 'auto'], default: 'auto' },
        openai: {
          type: 'object',
          properties: {
            apiKey: { type: 'string' },
            model: { type: 'string', default: 'whisper-1' },
            temperature: { type: 'number', default: 0 },
            language: { type: 'string', default: 'en' }
          }
        },
        local: {
          type: 'object',
          properties: {
            modelPath: { type: 'string', default: '/app/models/base.en.bin' },
            modelSize: { type: 'string', enum: ['tiny', 'base', 'small'], default: 'base' },
            threads: { type: 'number', default: 4 }
          }
        }
      }
    },
    output: {
      type: 'object',
      properties: {
        typeDelay: { type: 'number', default: 10 }, // ms between characters
        punctuationDelay: { type: 'number', default: 100 }, // ms after punctuation
        debug: { type: 'boolean', default: false }
      }
    },
    server: {
      type: 'object',
      properties: {
        port: { type: 'number', default: 3000 },
        host: { type: 'string', default: '0.0.0.0' }
      }
    }
  }
};
```

### Configuration Loader
```javascript
// src/config/index.js
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

class ConfigurationManager {
  constructor() {
    this.config = null;
    this.ajv = new Ajv({ useDefaults: true });
  }

  load() {
    // Load base configuration
    const configPath = path.join(__dirname, '../../config/config.json');
    let config = {};
    
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    // Override with environment variables
    config = this.applyEnvironmentOverrides(config);

    // Validate configuration
    const validate = this.ajv.compile(configSchema);
    if (!validate(config)) {
      throw new Error(`Configuration validation failed: ${JSON.stringify(validate.errors)}`);
    }

    // Mask sensitive data in logs
    this.config = config;
    this.logConfiguration();

    return config;
  }

  applyEnvironmentOverrides(config) {
    // API Key
    if (process.env.OPENAI_API_KEY) {
      config.transcription = config.transcription || {};
      config.transcription.openai = config.transcription.openai || {};
      config.transcription.openai.apiKey = process.env.OPENAI_API_KEY;
    }

    // Audio settings
    if (process.env.AUDIO_DEVICE) {
      config.audio = config.audio || {};
      config.audio.device = process.env.AUDIO_DEVICE;
    }

    // Server settings
    if (process.env.PORT) {
      config.server = config.server || {};
      config.server.port = parseInt(process.env.PORT, 10);
    }

    return config;
  }

  logConfiguration() {
    const safeConfig = JSON.parse(JSON.stringify(this.config));
    
    // Mask sensitive data
    if (safeConfig.transcription?.openai?.apiKey) {
      safeConfig.transcription.openai.apiKey = '***MASKED***';
    }

    console.log('Configuration loaded:', JSON.stringify(safeConfig, null, 2));
  }

  get(path) {
    const keys = path.split('.');
    let value = this.config;
    
    for (const key of keys) {
      value = value?.[key];
    }
    
    return value;
  }
}

module.exports = new ConfigurationManager();
```

### Example Configuration
```json
{
  "audio": {
    "sampleRate": 16000,
    "channels": 1,
    "chunkDuration": 2000,
    "vadThreshold": 0.01,
    "silenceTimeout": 10000
  },
  "transcription": {
    "provider": "auto",
    "openai": {
      "model": "whisper-1",
      "temperature": 0,
      "language": "en"
    },
    "local": {
      "modelSize": "base",
      "threads": 4
    }
  },
  "output": {
    "typeDelay": 10,
    "punctuationDelay": 100,
    "debug": false
  },
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  }
}
```

## Implementation Steps
1. Define JSON schema for configuration
2. Implement configuration loader with validation
3. Add environment variable override support
4. Create secure API key handling
5. Implement configuration getter methods
6. Add configuration hot-reload support (optional)

## Testing Requirements
- Schema validation tests
- Environment override tests
- Missing configuration handling
- Invalid configuration rejection
- API key masking in logs

## Estimated Time
3 hours

## Dependencies
- ajv (JSON schema validator)
- Node.js fs module