#!/usr/bin/env node

const express = require('express');
const winston = require('winston');
const config = require('./config');
const AudioCaptureService = require('./services/audio-capture');
const AudioFormatConverter = require('./utils/audio-format');

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

// Initialize audio capture service
const audioCapture = new AudioCaptureService(appConfig, logger);

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

audioCapture.on('audio', (audioData) => {
  // TODO: Pass audio data to VAD service (TICKET-004)
  if (config.isDebugEnabled()) {
    const rms = AudioFormatConverter.calculateRMS(audioData);
    logger.debug(`Audio data received: ${audioData.length} samples, RMS: ${rms.toFixed(4)}`);
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
        audioCapture: await audioCapture.getStatus()
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