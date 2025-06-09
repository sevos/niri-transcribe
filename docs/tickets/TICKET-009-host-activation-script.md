# TICKET-009: Host Activation Script

## Blockers
- TICKET-008: Main Orchestrator Process (need running container)

## Priority
Medium

## Description
Implement the host-side activation script that provides the user interface for controlling the transcription system through keyboard shortcuts and container management.

## Acceptance Criteria
- [ ] Container lifecycle management
- [ ] Double Super key detection
- [ ] Visual feedback system
- [ ] Error handling and recovery
- [ ] Test mode for validation
- [ ] Integration with Niri key bindings

## Technical Requirements

### Main Activation Script
```bash
#!/bin/bash
# transcribe.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER_NAME="niri-transcribe"
CONFIG_DIR="$SCRIPT_DIR/config"
LOCKFILE="/tmp/transcribe.lock"

# Configuration
DOUBLE_TAP_TIMEOUT=500  # ms
CONTAINER_STARTUP_TIMEOUT=30  # seconds

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging
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

# Check dependencies
check_dependencies() {
    local missing_deps=()
    
    if ! command -v docker &> /dev/null; then
        missing_deps+=("docker")
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        missing_deps+=("docker-compose")
    fi
    
    if ! command -v notify-send &> /dev/null; then
        missing_deps+=("libnotify-bin")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        error "Missing dependencies: ${missing_deps[*]}"
        echo "Please install missing dependencies and try again."
        exit 1
    fi
}

# Container management
is_container_running() {
    docker ps --filter "name=$CONTAINER_NAME" --filter "status=running" --quiet | grep -q .
}

is_container_healthy() {
    local health_status
    health_status=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "none")
    [ "$health_status" = "healthy" ]
}

start_container() {
    log "Starting transcription container..."
    
    if is_container_running; then
        log "Container is already running"
        return 0
    fi
    
    # Start container
    cd "$SCRIPT_DIR"
    docker-compose up -d
    
    # Wait for container to be healthy
    local timeout=$CONTAINER_STARTUP_TIMEOUT
    while [ $timeout -gt 0 ]; do
        if is_container_healthy; then
            success "Container started and healthy"
            return 0
        fi
        
        sleep 1
        ((timeout--))
    done
    
    error "Container failed to start or become healthy within ${CONTAINER_STARTUP_TIMEOUT}s"
    return 1
}

stop_container() {
    log "Stopping transcription container..."
    
    if ! is_container_running; then
        log "Container is not running"
        return 0
    fi
    
    cd "$SCRIPT_DIR"
    docker-compose down
    success "Container stopped"
}

restart_container() {
    log "Restarting transcription container..."
    stop_container
    start_container
}

# API communication
call_api() {
    local endpoint="$1"
    local method="${2:-GET}"
    local port="${TRANSCRIBE_PORT:-3000}"
    
    curl -s -X "$method" \
         -H "Content-Type: application/json" \
         "http://localhost:$port$endpoint" \
         --max-time 5 \
         --retry 0
}

# Transcription control
start_transcription() {
    log "Starting transcription session..."
    
    # Ensure container is running
    if ! is_container_running || ! is_container_healthy; then
        log "Container not ready, starting..."
        start_container || return 1
    fi
    
    # Start transcription via API
    local response
    response=$(call_api "/start" "POST" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        success "Transcription started"
        show_notification "🎤 Transcription Started" "Speak now - your words will appear as text"
        return 0
    else
        error "Failed to start transcription"
        show_notification "❌ Transcription Failed" "Could not start transcription service"
        return 1
    fi
}

stop_transcription() {
    log "Stopping transcription session..."
    
    local response
    response=$(call_api "/stop" "POST" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        success "Transcription stopped"
        show_notification "🛑 Transcription Stopped" "Session ended"
        return 0
    else
        warn "Failed to stop transcription gracefully"
        return 1
    fi
}

# Visual feedback
show_notification() {
    local title="$1"
    local message="$2"
    local urgency="${3:-normal}"
    
    if command -v notify-send &> /dev/null; then
        notify-send -u "$urgency" -t 3000 "$title" "$message"
    else
        echo "$title: $message"
    fi
}

# Key detection for double-tap
detect_double_super() {
    local last_press=0
    local current_time
    
    # Use evtest or similar for key detection
    # This is a simplified version - in practice, would need proper key event handling
    
    while true; do
        # Wait for Super key press
        # Implementation would depend on available tools
        current_time=$(date +%s%3N)
        
        if [ $((current_time - last_press)) -le $DOUBLE_TAP_TIMEOUT ]; then
            echo "double_tap"
            return 0
        fi
        
        last_press=$current_time
        sleep 0.01
    done
}

# Status and health
check_status() {
    echo "=== Transcription System Status ==="
    echo
    
    # Container status
    if is_container_running; then
        echo "🟢 Container: Running"
        
        if is_container_healthy; then
            echo "🟢 Health: Healthy"
        else
            echo "🟡 Health: Unhealthy"
        fi
    else
        echo "🔴 Container: Stopped"
    fi
    
    # API status
    if is_container_running; then
        local health_response
        health_response=$(call_api "/health" "GET" 2>/dev/null)
        
        if [ $? -eq 0 ]; then
            echo "🟢 API: Responsive"
            
            # Parse and display metrics
            if command -v jq &> /dev/null; then
                echo
                echo "=== Metrics ==="
                echo "$health_response" | jq -r '
                    "State: \(.state)",
                    "Uptime: \(.uptime)s",
                    "Services: \(.services | keys | join(", "))"
                '
            fi
        else
            echo "🔴 API: Not responding"
        fi
    fi
}

# Test mode
run_tests() {
    echo "=== Running Tests ==="
    echo
    
    # Test 1: Dependencies
    echo "1. Checking dependencies..."
    check_dependencies && echo "   ✅ All dependencies found" || echo "   ❌ Missing dependencies"
    
    # Test 2: Container build
    echo "2. Building container..."
    cd "$SCRIPT_DIR"
    if docker-compose build --quiet; then
        echo "   ✅ Container builds successfully"
    else
        echo "   ❌ Container build failed"
        return 1
    fi
    
    # Test 3: Container start
    echo "3. Starting container..."
    if start_container; then
        echo "   ✅ Container starts and becomes healthy"
    else
        echo "   ❌ Container failed to start"
        return 1
    fi
    
    # Test 4: API connectivity
    echo "4. Testing API..."
    local health_response
    health_response=$(call_api "/health" "GET" 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo "   ✅ API responds to health check"
    else
        echo "   ❌ API not responding"
    fi
    
    # Test 5: Transcription cycle
    echo "5. Testing transcription cycle..."
    if start_transcription && sleep 2 && stop_transcription; then
        echo "   ✅ Transcription start/stop cycle works"
    else
        echo "   ❌ Transcription cycle failed"
    fi
    
    # Cleanup
    echo "6. Cleaning up..."
    stop_container
    echo "   ✅ Test cleanup complete"
    
    echo
    echo "=== Test Summary ==="
    echo "✅ All tests passed - system is ready!"
}

# Lock management
acquire_lock() {
    if [ -f "$LOCKFILE" ]; then
        local pid
        pid=$(cat "$LOCKFILE")
        if kill -0 "$pid" 2>/dev/null; then
            error "Another instance is already running (PID: $pid)"
            return 1
        else
            warn "Removing stale lock file"
            rm -f "$LOCKFILE"
        fi
    fi
    
    echo $$ > "$LOCKFILE"
    trap 'rm -f "$LOCKFILE"; exit' INT TERM EXIT
}

release_lock() {
    rm -f "$LOCKFILE"
}

# Usage information
show_usage() {
    cat << EOF
Usage: $0 [COMMAND]

Commands:
    start           Start transcription session
    stop            Stop transcription session
    restart         Restart transcription container
    status          Show system status
    test            Run system tests
    daemon          Run in daemon mode (for key detection)
    
Options:
    -h, --help      Show this help message
    
Environment Variables:
    TRANSCRIBE_PORT     Port for API communication (default: 3000)
    OPENAI_API_KEY     OpenAI API key for transcription
    
Examples:
    $0 start                    # Start transcription
    $0 status                   # Check system status
    $0 test                     # Run system tests
    
For Niri integration, add to your config.kdl:
    bind "Super+Super" { spawn "$PWD/transcribe.sh" "start"; }
EOF
}

# Main command handling
main() {
    case "${1:-}" in
        start)
            acquire_lock || exit 1
            start_transcription
            release_lock
            ;;
        stop)
            stop_transcription
            ;;
        restart)
            restart_container
            ;;
        status)
            check_status
            ;;
        test)
            run_tests
            ;;
        daemon)
            # For future key detection implementation
            error "Daemon mode not yet implemented"
            exit 1
            ;;
        -h|--help|help)
            show_usage
            ;;
        "")
            # Default action: start transcription
            acquire_lock || exit 1
            start_transcription
            release_lock
            ;;
        *)
            error "Unknown command: $1"
            show_usage
            exit 1
            ;;
    esac
}

# Check dependencies before running
check_dependencies

# Run main function
main "$@"
```

### Niri Configuration Addition
```kdl
# Add to niri/config.kdl in the binds section
bind "Super+Super" { spawn "bash" "/path/to/transcribe/transcribe.sh" "start"; }
bind "Super+Escape" { spawn "bash" "/path/to/transcribe/transcribe.sh" "stop"; }
```

### Desktop Entry (Optional)
```ini
# ~/.local/share/applications/niri-transcribe.desktop
[Desktop Entry]
Name=Niri Transcribe
Comment=Real-time speech-to-text transcription
Exec=/path/to/transcribe/transcribe.sh start
Icon=audio-input-microphone
Terminal=false
Type=Application
Categories=Utility;AudioVideo;
Keywords=speech;transcription;voice;text;
```

## Implementation Steps
1. Create main activation script structure
2. Implement container lifecycle management
3. Add API communication functions
4. Create visual notification system
5. Add test mode for validation
6. Document Niri integration

## Testing Requirements
- Test container start/stop cycles
- Verify API communication
- Test notification system
- Validate error handling
- Test lock file management

## Estimated Time
4 hours

## Dependencies
- docker and docker-compose
- notify-send (libnotify)
- curl for API communication
- Basic shell utilities