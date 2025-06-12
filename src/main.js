#!/usr/bin/env node

const express = require('express');
const winston = require('winston');
const config = require('./config');
const AudioCaptureService = require('./services/audio-capture');
const AudioFormatConverter = require('./utils/audio-format');
const TranscriptionManager = require('./services/transcription/transcription-manager');

// Load configuration
let appConfig;
try {
  appConfig = config.load();
} catch (error) {
  console.error('Failed to load configuration:', error.message);
  process.exit(1);
}

// Configure logging
const logger = winston.createLogger({
  level: config.isDebugEnabled() ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Create Express app for health checks
const app = express();
const serverConfig = config.getServerConfig();

// Initialize services
const audioCapture = new AudioCaptureService(appConfig, logger);
const transcriptionManager = new TranscriptionManager(appConfig);

// Transcription event handlers
transcriptionManager.on('transcription', (event) => {
  logger.debug('Transcription event:', {
    service: event.service,
    duration: event.duration,
    fallback: event.fallback || false
  });
});

transcriptionManager.on('health', (health) => {
  logger.debug('Transcription health update:', health);
});

// Audio event handlers
audioCapture.on('started', () => {
  logger.info('Audio capture started successfully');
});

audioCapture.on('stopped', () => {
  logger.info('Audio capture stopped');
});

audioCapture.on('error', (error) => {
  logger.error('Audio capture error:', error);
});

// Recording session event handlers
audioCapture.on('recordingStarted', () => {
  logger.info('Recording session started');
});

audioCapture.on('recordingStopped', async (sessionData) => {
  logger.info(`Recording session completed: ${sessionData.duration.toFixed(2)}s, ${sessionData.audio.length} samples`);
  
  try {
    // Transcribe the entire recording
    const transcriptionResult = await transcriptionManager.transcribe(sessionData.audio);
    logger.info('Transcription result:', {
      text: transcriptionResult.text,
      language: transcriptionResult.language,
      duration: sessionData.duration,
      audioSamples: sessionData.audio.length
    });
    
    // TODO: Send transcribed text to output service (TICKET-007)
  } catch (error) {
    logger.error('Transcription failed:', error);
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  logger.info('Health check requested');
  
  try {
    // Check basic functionality
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      config: {
        audioDevice: config.get('audio.device'),
        transcriptionProvider: config.get('transcription.provider'),
        serverPort: config.get('server.port'),
        debugEnabled: config.isDebugEnabled()
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        waylandDisplay: process.env.WAYLAND_DISPLAY,
        pulseServer: process.env.PULSE_SERVER
      },
      services: {
        audioCapture: await audioCapture.getDetailedStatus(),
        transcription: transcriptionManager.getMetrics()
      }
    };
    
    res.status(200).json(health);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({ 
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Add audio devices endpoint
app.get('/audio/devices', async (req, res) => {
  try {
    const devices = await audioCapture.listDevices();
    res.status(200).json(devices);
  } catch (error) {
    logger.error('Failed to list audio devices:', error);
    res.status(500).json({ error: 'Failed to list audio devices' });
  }
});

// Add audio control endpoints
app.post('/audio/start', async (req, res) => {
  try {
    await audioCapture.start();
    res.status(200).json({ status: 'started' });
  } catch (error) {
    logger.error('Failed to start audio capture:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/audio/stop', async (req, res) => {
  try {
    await audioCapture.stop();
    res.status(200).json({ status: 'stopped' });
  } catch (error) {
    logger.error('Failed to stop audio capture:', error);
    res.status(500).json({ error: error.message });
  }
});

// Recording session endpoints
app.post('/recording/start', async (req, res) => {
  try {
    audioCapture.startRecording();
    res.status(200).json({ status: 'recording_started' });
  } catch (error) {
    logger.error('Failed to start recording:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/recording/stop', async (req, res) => {
  try {
    const recordedAudio = audioCapture.stopRecording();
    res.status(200).json({ 
      status: 'recording_stopped',
      duration: recordedAudio.length / audioCapture.config.audio.sampleRate,
      samples: recordedAudio.length
    });
  } catch (error) {
    logger.error('Failed to stop recording:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/recording/status', (req, res) => {
  try {
    const status = audioCapture.getRecordingStatus();
    res.status(200).json(status);
  } catch (error) {
    logger.error('Failed to get recording status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add transcription endpoints
app.get('/transcription/health', async (req, res) => {
  try {
    const health = await transcriptionManager.checkHealth();
    res.status(200).json(health);
  } catch (error) {
    logger.error('Failed to get transcription health:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/transcription/metrics', (req, res) => {
  try {
    const metrics = transcriptionManager.getMetrics();
    res.status(200).json(metrics);
  } catch (error) {
    logger.error('Failed to get transcription metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/transcription/test', express.json({ limit: '50mb' }), async (req, res) => {
  try {
    const { audioData, options = {} } = req.body;
    
    if (!audioData || !Array.isArray(audioData)) {
      return res.status(400).json({ error: 'audioData array is required' });
    }
    
    // Convert array back to Float32Array
    const float32Data = new Float32Array(audioData);
    
    logger.info(`Testing transcription with ${float32Data.length} samples`);
    
    const result = await transcriptionManager.transcribe(float32Data, options);
    
    res.status(200).json({
      success: true,
      result: result,
      metadata: {
        audioSamples: float32Data.length,
        duration: float32Data.length / (appConfig.audio.sampleRate || 16000)
      }
    });
  } catch (error) {
    logger.error('Transcription test failed:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Start the server
app.listen(serverConfig.port, serverConfig.host, async () => {
  logger.info(`Niri Transcribe service started on ${serverConfig.host}:${serverConfig.port}`);
  logger.info('Configuration loaded successfully');
  logger.debug('Full configuration:', appConfig);
  logger.info('Environment check:', {
    waylandDisplay: process.env.WAYLAND_DISPLAY,
    pulseServer: process.env.PULSE_SERVER,
    xdgRuntimeDir: process.env.XDG_RUNTIME_DIR
  });

  // Auto-start audio capture
  try {
    await audioCapture.start();
    logger.info('Audio capture auto-started successfully');
  } catch (error) {
    logger.warn('Failed to auto-start audio capture:', error.message);
    logger.info('Audio capture can be started manually via /audio/start endpoint');
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  await audioCapture.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  await audioCapture.stop();
  process.exit(0);
});