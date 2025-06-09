#!/usr/bin/env node

const express = require('express');
const winston = require('winston');

// Configure logging
const logger = winston.createLogger({
  level: 'info',
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
const port = 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  logger.info('Health check requested');
  
  // Check basic functionality
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
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
app.listen(port, () => {
  logger.info(`Niri Transcribe service started on port ${port}`);
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