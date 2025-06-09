#!/usr/bin/env node

const express = require('express');
const winston = require('winston');
const config = require('./config');

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

// Health check endpoint
app.get('/health', (req, res) => {
  logger.info('Health check requested');
  
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
    }
  };
  
  res.status(200).json(health);
});

// Start the server
app.listen(serverConfig.port, serverConfig.host, () => {
  logger.info(`Niri Transcribe service started on ${serverConfig.host}:${serverConfig.port}`);
  logger.info('Configuration loaded successfully');
  logger.debug('Full configuration:', appConfig);
  logger.info('Environment check:', {
    waylandDisplay: process.env.WAYLAND_DISPLAY,
    pulseServer: process.env.PULSE_SERVER,
    xdgRuntimeDir: process.env.XDG_RUNTIME_DIR
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});