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

module.exports = configSchema;