# TICKET-001: Docker Infrastructure Setup

## Blockers
- None (first ticket)

## Priority
High

## Description
Set up the Docker infrastructure for the real-time transcription system with proper audio and Wayland access.

## Acceptance Criteria
- [ ] Dockerfile created with Node.js 20 base image
- [ ] PipeWire and audio tools installed in container
- [ ] Wayland socket access configured
- [ ] Non-root user setup for security
- [ ] Docker Compose configuration complete
- [ ] Container builds successfully
- [ ] Health check endpoint implemented

## Technical Requirements

### Dockerfile Structure
```dockerfile
FROM node:20-slim

# Install audio and Wayland dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    pipewire \
    pipewire-pulse \
    alsa-utils \
    pulseaudio-utils \
    wtype \
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 -s /bin/bash transcribe

# Set up working directory
WORKDIR /app
RUN chown -R transcribe:transcribe /app

# Switch to non-root user
USER transcribe

# Copy application files (will be added in later tickets)
COPY --chown=transcribe:transcribe package*.json ./
RUN npm ci --only=production

COPY --chown=transcribe:transcribe . .

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node scripts/health-check.js || exit 1

CMD ["node", "src/main.js"]
```

### Docker Compose Configuration
```yaml
version: '3.8'

services:
  transcribe:
    build: .
    container_name: niri-transcribe
    user: "1000:1000"
    environment:
      - XDG_RUNTIME_DIR=/tmp
      - WAYLAND_DISPLAY=${WAYLAND_DISPLAY}
      - PULSE_SERVER=/tmp/pulse/native
      - NODE_ENV=production
    volumes:
      # PipeWire socket
      - /run/user/1000/pipewire-0:/tmp/pipewire-0:ro
      # PulseAudio fallback
      - /run/user/1000/pulse:/tmp/pulse:ro
      # Wayland socket
      - ${XDG_RUNTIME_DIR}/${WAYLAND_DISPLAY}:/tmp/${WAYLAND_DISPLAY}:rw
      # Config directory
      - ./config:/app/config:ro
    devices:
      # ALSA fallback
      - /dev/snd:/dev/snd
    restart: unless-stopped
    networks:
      - transcribe-net

networks:
  transcribe-net:
    driver: bridge
```

### Health Check Script
```javascript
// scripts/health-check.js
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/health',
  timeout: 2000,
};

const req = http.request(options, (res) => {
  process.exit(res.statusCode === 200 ? 0 : 1);
});

req.on('error', () => {
  process.exit(1);
});

req.end();
```

## Implementation Steps
1. Create Dockerfile with minimal Node.js image
2. Install required system dependencies
3. Configure proper user permissions
4. Create docker-compose.yml with socket mounts
5. Implement basic health check
6. Test container build and runtime access

## Testing Requirements
- Container builds without errors
- Audio device access verified
- Wayland socket accessible
- Health check responds correctly
- Non-root user verification

## Estimated Time
4 hours

## Dependencies
- Docker Engine 20.10+
- Docker Compose 2.0+
- Host system with PipeWire/PulseAudio
- Wayland compositor (Niri)