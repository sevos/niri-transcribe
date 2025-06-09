FROM node:20-slim

# Install audio and Wayland dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    pipewire \
    pipewire-pulse \
    wireplumber \
    alsa-utils \
    pulseaudio-utils \
    wtype \
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Use existing node user (UID 1000)
USER node

# Set up working directory
WORKDIR /app
RUN chown -R node:node /app

# Copy application files
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node . .

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node scripts/health-check.js || exit 1

CMD ["node", "src/main.js"]