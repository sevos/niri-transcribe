# Implementation Plan and Ticket Dependencies

## Project Overview
This document outlines the implementation strategy for the real-time transcription system, including ticket dependencies and the critical path for development.

## Ticket Dependency Tree

```
TICKET-001: Docker Infrastructure Setup (@tickets/TICKET-001-docker-infrastructure.md)
├── TICKET-002: Configuration System
├── TICKET-007: Text Output Service  
└── TICKET-010: Build and Installation Scripts

TICKET-002: Configuration System
├── TICKET-005: OpenAI Transcription
└── TICKET-006: Local Transcription

TICKET-003: Audio Capture Service
└── TICKET-004: VAD Implementation

TICKET-004: VAD Implementation
├── TICKET-005: OpenAI Transcription
├── TICKET-006: Local Transcription
└── TICKET-008: Main Orchestrator

TICKET-005: OpenAI Transcription
└── TICKET-008: Main Orchestrator

TICKET-006: Local Transcription  
└── TICKET-008: Main Orchestrator

TICKET-007: Text Output Service
└── TICKET-008: Main Orchestrator

TICKET-008: Main Orchestrator
├── TICKET-009: Host Activation Script
└── TICKET-011: Integration Testing

TICKET-009: Host Activation Script
└── TICKET-011: Integration Testing

TICKET-010: Build and Installation Scripts
└── TICKET-011: Integration Testing
```

## Critical Path Analysis

### Phase 1: Foundation (Weeks 1-2)
**Priority: High - Core Infrastructure**

1. **TICKET-001: Docker Infrastructure Setup** ✅ COMPLETED (4 hours)
   - No blockers
   - Enables all containerized development
   - Critical for local development environment
   - **Result**: Full Docker setup with audio/Wayland access verified

2. **TICKET-002: Configuration System** ✅ COMPLETED (3 hours)
   - Blocked by: TICKET-001
   - Required for all service configuration
   - Essential for API key management
   - **Result**: Full JSON schema validation, environment overrides, secure API key handling

3. **TICKET-003: Audio Capture Service** ✅ COMPLETED (6 hours)
   - Blocked by: TICKET-001, TICKET-002
   - Core audio functionality
   - Required for all audio processing
   - **Result**: Full real-time audio capture with PipeWire/PulseAudio, device discovery, format conversion

### Phase 2: Audio Processing (Week 2)
**Priority: High - Audio Pipeline**

4. **TICKET-004: VAD Implementation** (5 hours)
   - Blocked by: TICKET-003
   - Essential for speech detection
   - Required for chunk creation

5. **TICKET-007: Text Output Service** (4 hours)
   - Blocked by: TICKET-001
   - Can be developed in parallel with audio services
   - Required for text injection

### Phase 3: Transcription Services (Week 3)
**Priority: High - Transcription Backends**

6. **TICKET-005: OpenAI Transcription** (4 hours)
   - Blocked by: TICKET-002, TICKET-004
   - Primary transcription service
   - Can be developed in parallel with local service

7. **TICKET-006: Local Transcription** (5 hours)
   - Blocked by: TICKET-002, TICKET-004
   - Fallback transcription service
   - Independent of OpenAI service

### Phase 4: Integration (Week 4)
**Priority: High - System Integration**

8. **TICKET-008: Main Orchestrator** (6 hours)
   - Blocked by: All core services (003-007)
   - Coordinates entire system
   - Critical for system functionality

9. **TICKET-009: Host Activation Script** (4 hours)
   - Blocked by: TICKET-008
   - User interface for system
   - Required for Niri integration

### Phase 5: Deployment & Testing (Week 5)
**Priority: Medium - Production Readiness**

10. **TICKET-010: Build and Installation Scripts** (3 hours)
    - Blocked by: TICKET-001
    - Can be developed early in parallel
    - Required for easy deployment

11. **TICKET-011: Integration Testing** (5 hours)
    - Blocked by: TICKET-008, TICKET-009, TICKET-010
    - Validates complete system
    - Essential for production deployment

## Resource Allocation

### Total Estimated Hours: 43 hours
- **Foundation**: 13 hours (30%)
- **Audio Processing**: 9 hours (21%)
- **Transcription**: 9 hours (21%)
- **Integration**: 10 hours (23%)
- **Deployment**: 2 hours (5%)

### Development Phases

#### Week 1: Infrastructure Setup ✅ COMPLETED
- TICKET-001: Docker Infrastructure (4h) ✅ COMPLETED
- TICKET-002: Configuration System (3h) ✅ COMPLETED
- TICKET-003: Audio Capture (6h) ✅ COMPLETED
- TICKET-010: Build Scripts (3h) - *Can start early*
- **Total: 16 hours (13h completed, 3h remaining)**

#### Week 2: Audio Pipeline
- TICKET-004: VAD Implementation (5h)
- TICKET-007: Text Output (4h) - *Parallel development*
- **Total: 9 hours**

#### Week 3: Transcription Services
- TICKET-005: OpenAI Transcription (4h)
- TICKET-006: Local Transcription (5h) - *Parallel development*
- **Total: 9 hours**

#### Week 4: System Integration
- TICKET-008: Main Orchestrator (6h)
- TICKET-009: Host Activation Script (4h)
- **Total: 10 hours**

#### Week 5: Testing & Validation
- TICKET-011: Integration Testing (5h)
- Bug fixes and optimization (3h)
- **Total: 8 hours**

## Parallel Development Opportunities

### Week 2 Parallelization
- **Developer A**: TICKET-003 (Audio Capture) → TICKET-004 (VAD)
- **Developer B**: TICKET-007 (Text Output Service)

### Week 3 Parallelization  
- **Developer A**: TICKET-005 (OpenAI Transcription)
- **Developer B**: TICKET-006 (Local Transcription)

### Early Start Options
- **TICKET-010** (Build Scripts) can start immediately after TICKET-001
- **TICKET-007** (Text Output) only needs TICKET-001, can start early

## Risk Mitigation

### High-Risk Items
1. **Audio Capture (TICKET-003)** - Complex PipeWire integration
   - *Mitigation*: Start with PulseAudio fallback, comprehensive testing
   
2. **VAD Implementation (TICKET-004)** - Custom algorithm development
   - *Mitigation*: Use simple energy-based approach, iterate later
   
3. **whisper.cpp Integration (TICKET-006)** - Binary compilation and integration
   - *Mitigation*: Use pre-built binaries, test early

### Medium-Risk Items
1. **Container Audio Access (TICKET-001)** ✅ RESOLVED - Socket mounting complexity
   - *Mitigation*: Test with simple audio tools first
   - **Status**: Successfully implemented with PipeWire, PulseAudio, and ALSA access
   
2. **Wayland Text Injection (TICKET-007)** - wtype reliability
   - *Mitigation*: Test thoroughly with different applications

## Quality Gates

### After Phase 1 (Foundation) ✅ COMPLETED
- ✅ Container builds and runs
- ✅ Basic health checks pass
- ✅ Audio device access verified (/dev/snd/*)
- ✅ Wayland socket accessible (wayland-1)
- ✅ Express server foundation operational
- ✅ Configuration loads correctly with validation (TICKET-002)
- ✅ Environment variable overrides working
- ✅ API key security and masking implemented

### After Phase 2 (Audio Pipeline)
- ✅ Audio capture works in container (TICKET-003 COMPLETED)
- ✅ Real-time audio streaming with PipeWire/PulseAudio
- ✅ Device discovery and enumeration functional
- ✅ Audio format conversion utilities working
- ✅ Circular buffer management and error recovery
- ✅ Enhanced status reporting with device resolution
- ⏳ VAD detects speech accurately
- ⏳ Text injection works in test applications

### After Phase 3 (Transcription)
- ✅ OpenAI API integration functional
- ✅ Local whisper.cpp working
- ✅ Fallback mechanism operates correctly

### After Phase 4 (Integration)
- ✅ End-to-end audio → text pipeline works
- ✅ Host activation script functional
- ✅ Niri key bindings operational

### After Phase 5 (Deployment)
- ✅ Complete test suite passes
- ✅ Installation scripts work on clean system
- ✅ Performance meets target specifications

## Success Metrics

### Performance Targets
- **Activation Latency**: < 500ms from key press to recording
- **Transcription Latency**: < 2 seconds from speech end to text
- **Memory Usage**: < 200MB container footprint
- **CPU Usage**: < 20% during active transcription

### Functionality Requirements
- **Accuracy**: VAD correctly identifies speech 95%+ of time
- **Reliability**: System recovers gracefully from errors
- **Usability**: Simple activation via double Super key tap
- **Privacy**: Local fallback available for sensitive content

## Technology Stack Summary

### Single Language: JavaScript/Node.js
- **Audio Processing**: Native binaries via child_process
- **VAD**: Custom energy-based implementation  
- **Transcription**: OpenAI API + whisper.cpp CLI
- **Text Output**: wtype via child_process
- **Container**: Docker with proper socket access

### Key Dependencies
- **openai**: Official OpenAI API client
- **node-wav**: Fast audio format conversion
- **express**: HTTP server for health/control API
- **ajv**: JSON schema validation

This implementation plan provides a clear roadmap for developing the real-time transcription system while minimizing risks and maximizing parallel development opportunities.