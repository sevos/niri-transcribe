# TICKET-008: Main Orchestrator Process

## Blockers
- TICKET-003: Audio Capture Service
- TICKET-004: VAD Implementation  
- TICKET-005: OpenAI Transcription
- TICKET-006: Local Transcription
- TICKET-007: Text Output Service

## Priority
High

## Description
Implement the main orchestrator process that coordinates audio capture, VAD, transcription, and text output services into a cohesive real-time transcription system.

## Acceptance Criteria
- [ ] Service initialization and coordination
- [ ] Audio pipeline from capture to output
- [ ] Error handling and recovery
- [ ] Graceful shutdown
- [ ] Performance monitoring
- [ ] WebSocket API for external control

## Technical Requirements

### Main Orchestrator
```javascript
// src/main.js
const EventEmitter = require('events');
const AudioCaptureService = require('./services/audio-capture');
const VoiceActivityDetector = require('./services/voice-activity-detector');
const TranscriptionManager = require('./services/transcription/transcription-manager');
const TextOutputService = require('./services/text-output');
const ConfigurationManager = require('./config');
const express = require('express');

class TranscriptionOrchestrator extends EventEmitter {
  constructor() {
    super();
    
    this.config = null;
    this.services = {};
    this.state = 'stopped'; // stopped, starting, running, stopping
    this.isTranscribing = false;
    this.metrics = {
      sessionsStarted: 0,
      chunksProcessed: 0,
      transcriptionTime: 0,
      errors: 0
    };
    
    // HTTP server for health checks and control
    this.server = express();
    this.setupRoutes();
  }

  async initialize() {
    try {
      console.log('Initializing transcription system...');
      
      // Load configuration
      this.config = ConfigurationManager.load();
      
      // Initialize services
      await this.initializeServices();
      
      // Set up service event handlers
      this.setupEventHandlers();
      
      // Start HTTP server
      const port = this.config.server.port;
      this.httpServer = this.server.listen(port, this.config.server.host, () => {
        console.log(`Health server listening on port ${port}`);
      });
      
      this.state = 'stopped';
      console.log('Transcription system initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize transcription system:', error);
      throw error;
    }
  }

  async initializeServices() {
    // Audio capture service
    this.services.audioCapture = new AudioCaptureService(this.config);
    
    // Voice activity detector
    this.services.vad = new VoiceActivityDetector(this.config);
    
    // Transcription manager
    this.services.transcription = new TranscriptionManager(this.config);
    
    // Text output service
    this.services.textOutput = new TextOutputService(this.config);
    
    // Initialize services that require setup
    await this.services.textOutput.initialize();
    await this.services.transcription.localService?.initialize();
  }

  setupEventHandlers() {
    // Audio capture events
    this.services.audioCapture.on('audio', (audioData) => {
      if (this.isTranscribing) {
        this.services.vad.processAudio(audioData);
      }
    });

    this.services.audioCapture.on('error', (error) => {
      console.error('Audio capture error:', error);
      this.emit('error', error);
      this.metrics.errors++;
    });

    // VAD events
    this.services.vad.on('speechStart', () => {
      console.log('Speech detected, preparing for transcription...');
      this.emit('speechStart');
    });

    this.services.vad.on('speechEnd', async (data) => {
      console.log(`Speech ended, transcribing ${data.duration}ms of audio...`);
      await this.processAudioChunk(data);
    });

    this.services.vad.on('silenceTimeout', () => {
      console.log('Silence timeout, stopping transcription session');
      this.stopTranscription();
    });

    // Transcription events
    this.services.transcription.on('transcription', async (result) => {
      await this.handleTranscriptionResult(result);
    });

    this.services.transcription.on('health', (health) => {
      console.log('Transcription service health:', health);
    });

    // Text output events
    this.services.textOutput.on('typingComplete', (data) => {
      console.log(`Text output complete: "${data.text}"`);
      this.emit('textOutput', data);
    });

    this.services.textOutput.on('typingError', (data) => {
      console.error('Text output error:', data.error);
      this.metrics.errors++;
    });
  }

  async startTranscription() {
    if (this.state !== 'stopped') {
      throw new Error(`Cannot start transcription in state: ${this.state}`);
    }

    this.state = 'starting';
    this.isTranscribing = true;
    this.metrics.sessionsStarted++;

    try {
      console.log('Starting transcription session...');
      
      // Reset VAD state
      this.services.vad.reset();
      
      // Start audio capture
      await this.services.audioCapture.start();
      
      this.state = 'running';
      this.emit('transcriptionStarted');
      
      console.log('Transcription session started successfully');
      
    } catch (error) {
      this.state = 'stopped';
      this.isTranscribing = false;
      console.error('Failed to start transcription:', error);
      throw error;
    }
  }

  async stopTranscription() {
    if (this.state === 'stopped' || this.state === 'stopping') {
      return;
    }

    this.state = 'stopping';

    try {
      console.log('Stopping transcription session...');
      
      // Stop accepting new audio
      this.isTranscribing = false;
      
      // Stop audio capture
      await this.services.audioCapture.stop();
      
      // Wait for any pending text output
      await this.services.textOutput.stop();
      
      // Reset VAD
      this.services.vad.reset();
      
      this.state = 'stopped';
      this.emit('transcriptionStopped');
      
      console.log('Transcription session stopped');
      
    } catch (error) {
      console.error('Error stopping transcription:', error);
      this.state = 'stopped';
      this.emit('error', error);
    }
  }

  async processAudioChunk(chunkData) {
    if (!this.isTranscribing) {
      return;
    }

    const startTime = Date.now();
    this.metrics.chunksProcessed++;

    try {
      // Transcribe audio chunk
      const result = await this.services.transcription.transcribe(chunkData.audio, {
        timestamp: chunkData.timestamp
      });

      const transcriptionTime = Date.now() - startTime;
      this.metrics.transcriptionTime += transcriptionTime;

      console.log(`Transcription result: "${result.text}" (${transcriptionTime}ms)`);

      return result;
      
    } catch (error) {
      console.error('Failed to process audio chunk:', error);
      this.metrics.errors++;
      this.emit('transcriptionError', error);
    }
  }

  async handleTranscriptionResult(result) {
    if (!result.text || result.text.trim() === '') {
      console.log('Empty transcription result, skipping');
      return;
    }

    try {
      // Process and output text
      await this.services.textOutput.typeText(result.text);
      
    } catch (error) {
      console.error('Failed to output text:', error);
      this.metrics.errors++;
    }
  }

  setupRoutes() {
    // Health check endpoint
    this.server.get('/health', (req, res) => {
      const health = this.getHealth();
      const status = health.overall === 'healthy' ? 200 : 503;
      res.status(status).json(health);
    });

    // Start transcription
    this.server.post('/start', async (req, res) => {
      try {
        await this.startTranscription();
        res.json({ status: 'started' });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    // Stop transcription
    this.server.post('/stop', async (req, res) => {
      try {
        await this.stopTranscription();
        res.json({ status: 'stopped' });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    // Get metrics
    this.server.get('/metrics', (req, res) => {
      res.json({
        ...this.metrics,
        state: this.state,
        isTranscribing: this.isTranscribing,
        services: {
          audioCapture: this.services.audioCapture?.getStatus?.() || {},
          textOutput: this.services.textOutput?.getStatus?.() || {},
          transcription: this.services.transcription?.getMetrics?.() || {}
        }
      });
    });

    // Configuration endpoint
    this.server.get('/config', (req, res) => {
      // Return config without sensitive data
      const safeConfig = JSON.parse(JSON.stringify(this.config));
      if (safeConfig.transcription?.openai?.apiKey) {
        safeConfig.transcription.openai.apiKey = '***MASKED***';
      }
      res.json(safeConfig);
    });
  }

  getHealth() {
    const health = {
      overall: 'healthy',
      services: {},
      uptime: process.uptime(),
      state: this.state
    };

    // Check service health
    try {
      // Audio capture health (basic check)
      health.services.audioCapture = {
        healthy: this.services.audioCapture !== null,
        status: this.services.audioCapture?.isCapturing ? 'capturing' : 'stopped'
      };

      // Text output health
      health.services.textOutput = {
        healthy: this.services.textOutput !== null,
        ...this.services.textOutput?.getStatus?.()
      };

      // Overall health
      const unhealthyServices = Object.values(health.services)
        .filter(service => !service.healthy);
        
      if (unhealthyServices.length > 0) {
        health.overall = 'unhealthy';
      }

    } catch (error) {
      health.overall = 'unhealthy';
      health.error = error.message;
    }

    return health;
  }

  async shutdown() {
    console.log('Shutting down transcription system...');

    try {
      // Stop transcription if running
      await this.stopTranscription();
      
      // Stop HTTP server
      if (this.httpServer) {
        this.httpServer.close();
      }
      
      // Cleanup services
      if (this.services.transcription?.localService) {
        await this.services.transcription.localService.stop();
      }
      
      console.log('Shutdown complete');
      
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }
}

// Application entry point
async function main() {
  const orchestrator = new TranscriptionOrchestrator();

  // Handle process signals
  const gracefulShutdown = async (signal) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    await orchestrator.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
  });

  try {
    await orchestrator.initialize();
    
    // Auto-start transcription if configured
    if (process.env.AUTO_START === 'true') {
      await orchestrator.startTranscription();
    }
    
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

module.exports = TranscriptionOrchestrator;
```

### Process Manager
```javascript
// src/utils/process-manager.js
class ProcessManager {
  constructor() {
    this.processes = new Map();
  }

  register(name, process) {
    this.processes.set(name, process);
  }

  async stopAll() {
    const promises = [];
    
    for (const [name, process] of this.processes) {
      if (process && typeof process.stop === 'function') {
        promises.push(
          process.stop().catch(error => {
            console.error(`Error stopping ${name}:`, error);
          })
        );
      }
    }
    
    await Promise.all(promises);
  }

  getStatus() {
    const status = {};
    
    for (const [name, process] of this.processes) {
      if (process && typeof process.getStatus === 'function') {
        status[name] = process.getStatus();
      } else {
        status[name] = { active: !!process };
      }
    }
    
    return status;
  }
}

module.exports = ProcessManager;
```

## Implementation Steps
1. Create main orchestrator class structure
2. Implement service initialization and coordination
3. Set up audio pipeline event handling
4. Add HTTP API for health checks and control
5. Implement graceful shutdown handling
6. Add performance metrics and monitoring

## Testing Requirements
- Integration tests for full audio pipeline
- API endpoint testing
- Error recovery testing
- Performance benchmarking
- Graceful shutdown verification

## Estimated Time
6 hours

## Dependencies
- express (HTTP server)
- All service modules
- Configuration manager