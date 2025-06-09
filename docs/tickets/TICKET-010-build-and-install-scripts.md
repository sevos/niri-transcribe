# TICKET-010: Build and Installation Scripts

## Blockers
- TICKET-001: Docker Infrastructure Setup

## Priority
Medium

## Description
Create comprehensive build and installation scripts for easy deployment and dependency management of the transcription system.

## Acceptance Criteria
- [ ] Container build script with optimization
- [ ] Host dependency installation script
- [ ] Health check and monitoring script
- [ ] Environment setup automation
- [ ] Development vs production builds
- [ ] Cleanup and uninstall scripts

## Technical Requirements

### Container Build Script
```bash
#!/bin/bash
# scripts/build.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IMAGE_NAME="niri-transcribe"
BUILD_MODE="${BUILD_MODE:-production}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Check build requirements
check_build_requirements() {
    log "Checking build requirements..."
    
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose is not installed or not in PATH"
        exit 1
    fi
    
    # Check Docker daemon
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
        exit 1
    fi
    
    success "Build requirements satisfied"
}

# Clean up old images and containers
cleanup_old_builds() {
    log "Cleaning up old builds..."
    
    # Stop and remove existing containers
    docker-compose -f "$PROJECT_DIR/docker-compose.yml" down --remove-orphans 2>/dev/null || true
    
    # Remove old images (keep last 2)
    local old_images
    old_images=$(docker images "$IMAGE_NAME" --format "table {{.ID}}" | tail -n +4)
    
    if [ -n "$old_images" ]; then
        echo "$old_images" | xargs docker rmi -f 2>/dev/null || true
        log "Removed old images"
    fi
    
    # Clean up build cache if requested
    if [ "$CLEAN_CACHE" = "true" ]; then
        docker builder prune -f
        log "Cleaned build cache"
    fi
}

# Build the container
build_container() {
    log "Building container (mode: $BUILD_MODE)..."
    
    cd "$PROJECT_DIR"
    
    # Build arguments
    local build_args=(
        --build-arg "BUILD_MODE=$BUILD_MODE"
        --build-arg "NODE_ENV=${NODE_ENV:-production}"
        --build-arg "BUILDKIT_INLINE_CACHE=1"
    )
    
    # Add cache from previous builds
    if docker image inspect "$IMAGE_NAME:latest" &> /dev/null; then
        build_args+=(--cache-from "$IMAGE_NAME:latest")
    fi
    
    # Build with docker-compose for proper context
    export BUILD_MODE
    export NODE_ENV
    
    if docker-compose build "${build_args[@]}"; then
        success "Container built successfully"
    else
        error "Container build failed"
        exit 1
    fi
}

# Verify the build
verify_build() {
    log "Verifying build..."
    
    # Start container for verification
    cd "$PROJECT_DIR"
    docker-compose up -d
    
    # Wait for health check
    local timeout=60
    while [ $timeout -gt 0 ]; do
        local health_status
        health_status=$(docker inspect --format='{{.State.Health.Status}}' "niri-transcribe" 2>/dev/null || echo "none")
        
        if [ "$health_status" = "healthy" ]; then
            success "Container is healthy"
            break
        elif [ "$health_status" = "unhealthy" ]; then
            error "Container health check failed"
            docker logs "niri-transcribe"
            exit 1
        fi
        
        sleep 1
        ((timeout--))
    done
    
    if [ $timeout -eq 0 ]; then
        error "Container health check timeout"
        docker logs "niri-transcribe"
        exit 1
    fi
    
    # Test API endpoint
    if curl -f -s http://localhost:3000/health > /dev/null; then
        success "API endpoint responsive"
    else
        error "API endpoint not responding"
        exit 1
    fi
    
    # Stop verification container
    docker-compose down
}

# Show build information
show_build_info() {
    local image_id
    image_id=$(docker images "$IMAGE_NAME:latest" --format "{{.ID}}")
    local image_size
    image_size=$(docker images "$IMAGE_NAME:latest" --format "{{.Size}}")
    
    log "Build Information:"
    echo "  Image ID: $image_id"
    echo "  Image Size: $image_size"
    echo "  Build Mode: $BUILD_MODE"
    echo "  Node Environment: ${NODE_ENV:-production}"
}

# Usage information
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
    --clean-cache       Clean Docker build cache before building
    --dev              Build in development mode
    --no-verify        Skip build verification
    --help             Show this help message

Environment Variables:
    BUILD_MODE         Build mode (production|development)
    NODE_ENV          Node.js environment (production|development)
    CLEAN_CACHE       Clean build cache (true|false)

Examples:
    $0                 # Build production image
    $0 --dev           # Build development image
    $0 --clean-cache   # Build with cache cleanup
EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --clean-cache)
            CLEAN_CACHE="true"
            shift
            ;;
        --dev)
            BUILD_MODE="development"
            NODE_ENV="development"
            shift
            ;;
        --no-verify)
            SKIP_VERIFY="true"
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Main build process
main() {
    log "Starting container build process..."
    
    check_build_requirements
    cleanup_old_builds
    build_container
    
    if [ "$SKIP_VERIFY" != "true" ]; then
        verify_build
    fi
    
    show_build_info
    success "Build process completed successfully!"
}

main "$@"
```

### Host Dependencies Installation
```bash
#!/bin/bash
# scripts/install-deps.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Detect the operating system
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    else
        error "Cannot detect operating system"
        exit 1
    fi
    
    log "Detected OS: $OS $VERSION"
}

# Install Docker
install_docker() {
    if command -v docker &> /dev/null; then
        log "Docker already installed"
        return 0
    fi
    
    log "Installing Docker..."
    
    case $OS in
        ubuntu|debian)
            # Update package index
            sudo apt-get update
            
            # Install dependencies
            sudo apt-get install -y \
                ca-certificates \
                curl \
                gnupg \
                lsb-release
            
            # Add Docker GPG key
            sudo mkdir -p /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/$OS/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            
            # Add Docker repository
            echo \
                "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS \
                $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
            
            # Install Docker
            sudo apt-get update
            sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;
        fedora|centos|rhel)
            sudo dnf install -y docker docker-compose
            ;;
        *)
            error "Unsupported OS for automatic Docker installation: $OS"
            echo "Please install Docker manually from https://docs.docker.com/get-docker/"
            exit 1
            ;;
    esac
    
    # Add user to docker group
    sudo usermod -aG docker "$USER"
    
    # Start and enable Docker service
    sudo systemctl start docker
    sudo systemctl enable docker
    
    success "Docker installed successfully"
    warn "Please log out and back in for Docker group membership to take effect"
}

# Install system dependencies
install_system_deps() {
    log "Installing system dependencies..."
    
    case $OS in
        ubuntu|debian)
            sudo apt-get update
            sudo apt-get install -y \
                wtype \
                libnotify-bin \
                curl \
                jq \
                pipewire \
                pipewire-pulse \
                alsa-utils
            ;;
        fedora|centos|rhel)
            sudo dnf install -y \
                wtype \
                libnotify \
                curl \
                jq \
                pipewire \
                pipewire-pulseaudio \
                alsa-utils
            ;;
        *)
            warn "Automatic dependency installation not supported for $OS"
            echo "Please install the following packages manually:"
            echo "  - wtype (Wayland text input)"
            echo "  - libnotify (desktop notifications)"
            echo "  - curl (API communication)"
            echo "  - jq (JSON processing)"
            echo "  - pipewire or pulseaudio (audio system)"
            ;;
    esac
    
    success "System dependencies installed"
}

# Verify installation
verify_installation() {
    log "Verifying installation..."
    
    local missing_deps=()
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        missing_deps+=("docker")
    fi
    
    # Check Docker Compose
    if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
        missing_deps+=("docker-compose")
    fi
    
    # Check wtype
    if ! command -v wtype &> /dev/null; then
        missing_deps+=("wtype")
    fi
    
    # Check notify-send
    if ! command -v notify-send &> /dev/null; then
        missing_deps+=("libnotify-bin/libnotify")
    fi
    
    # Check audio system
    if ! command -v pw-cli &> /dev/null && ! command -v pactl &> /dev/null; then
        missing_deps+=("pipewire or pulseaudio")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        error "Missing dependencies: ${missing_deps[*]}"
        return 1
    fi
    
    success "All dependencies verified"
    return 0
}

# Create configuration directory
setup_config() {
    log "Setting up configuration..."
    
    local config_dir="$SCRIPT_DIR/../config"
    mkdir -p "$config_dir"
    
    # Create example configuration if it doesn't exist
    if [ ! -f "$config_dir/config.json" ]; then
        cat > "$config_dir/config.json" << 'EOF'
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
EOF
        success "Created example configuration at $config_dir/config.json"
    fi
    
    # Create environment file template
    if [ ! -f "$config_dir/.env.example" ]; then
        cat > "$config_dir/.env.example" << 'EOF'
# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Container Configuration
NODE_ENV=production
TRANSCRIBE_PORT=3000

# Audio Configuration
AUDIO_DEVICE=default

# Debug Mode
DEBUG=false
EOF
        success "Created environment template at $config_dir/.env.example"
    fi
}

# Show post-installation instructions
show_post_install() {
    cat << EOF

=== Installation Complete! ===

Next steps:
1. Configure your OpenAI API key (if using):
   export OPENAI_API_KEY="your-api-key"

2. Build the container:
   ./scripts/build.sh

3. Test the installation:
   ./transcribe.sh test

4. Add Niri key bindings to your config.kdl:
   bind "Super+Super" { spawn "bash" "$(realpath "$SCRIPT_DIR/../transcribe.sh")" "start"; }

5. Start transcription:
   ./transcribe.sh start

For more information, see the documentation in docs/

EOF
}

# Usage information
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
    --skip-docker      Skip Docker installation
    --skip-system      Skip system dependencies
    --verify-only      Only verify existing installation
    --help            Show this help message

Examples:
    $0                # Full installation
    $0 --skip-docker  # Skip Docker installation
    $0 --verify-only  # Just verify current installation
EOF
}

# Parse command line arguments
SKIP_DOCKER=false
SKIP_SYSTEM=false
VERIFY_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-docker)
            SKIP_DOCKER=true
            shift
            ;;
        --skip-system)
            SKIP_SYSTEM=true
            shift
            ;;
        --verify-only)
            VERIFY_ONLY=true
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Main installation process
main() {
    log "Starting dependency installation..."
    
    detect_os
    
    if [ "$VERIFY_ONLY" = "true" ]; then
        verify_installation
        exit $?
    fi
    
    if [ "$SKIP_DOCKER" != "true" ]; then
        install_docker
    fi
    
    if [ "$SKIP_SYSTEM" != "true" ]; then
        install_system_deps
    fi
    
    setup_config
    
    if verify_installation; then
        success "Installation completed successfully!"
        show_post_install
    else
        error "Installation verification failed"
        exit 1
    fi
}

main "$@"
```

### Health Check Script
```bash
#!/bin/bash
# scripts/health-check.js (Node.js version for container)

const http = require('http');
const { spawn } = require('child_process');

const TIMEOUT = 5000; // 5 seconds

async function checkAPI() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/health',
      timeout: TIMEOUT,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const health = JSON.parse(data);
          resolve({ healthy: res.statusCode === 200 && health.overall === 'healthy', data: health });
        } catch (error) {
          resolve({ healthy: false, error: 'Invalid JSON response' });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ healthy: false, error: error.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ healthy: false, error: 'Request timeout' });
    });

    req.end();
  });
}

async function checkAudio() {
  return new Promise((resolve) => {
    const proc = spawn('pw-cli', ['list-objects', 'Node'], { timeout: 3000 });
    
    proc.on('exit', (code) => {
      resolve({ healthy: code === 0 });
    });
    
    proc.on('error', () => {
      // Try PulseAudio fallback
      const paProc = spawn('pactl', ['info'], { timeout: 3000 });
      paProc.on('exit', (code) => {
        resolve({ healthy: code === 0 });
      });
      paProc.on('error', () => {
        resolve({ healthy: false, error: 'No audio system available' });
      });
    });
  });
}

async function main() {
  const checks = {
    api: await checkAPI(),
    audio: await checkAudio(),
  };

  const allHealthy = Object.values(checks).every(check => check.healthy);
  
  console.log(JSON.stringify({ healthy: allHealthy, checks }, null, 2));
  process.exit(allHealthy ? 0 : 1);
}

main();
```

## Implementation Steps
1. Create container build script with optimization
2. Implement host dependency installer for multiple OS
3. Add configuration setup automation
4. Create health check verification
5. Add cleanup and uninstall utilities
6. Document installation process

## Testing Requirements
- Test on Ubuntu/Debian systems
- Verify Docker installation
- Test dependency verification
- Validate build process
- Test cleanup procedures

## Estimated Time
3 hours

## Dependencies
- Docker and Docker Compose
- OS-specific package managers
- System audio tools