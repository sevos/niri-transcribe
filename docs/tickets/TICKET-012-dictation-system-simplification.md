# TICKET-012: Dictation System Simplification

## Priority
High

## Description
Simplify the current dictation system by removing over-engineered components and aligning the implementation with a ChatGPT-style approach: record the full audio while the user dictates, and transcribe it only after the user explicitly ends the dictation session.

## Background
The system was initially designed to simulate live transcription during dictation with voice activity detection (VAD), audio chunking, and near-real-time text streaming. This level of complexity is not necessary for the initial version and adds significant maintenance overhead.

## Acceptance Criteria
- [ ] Remove VAD service and all related code
- [ ] Remove audio chunking logic from audio capture service
- [ ] Remove streaming transcription pipeline
- [ ] Implement simple record-then-transcribe workflow
- [ ] Update HTTP API for session-based recording
- [ ] Update configuration to remove VAD-related settings
- [ ] Update documentation to reflect simplified architecture

## Technical Changes

### Removed Components
- `src/services/voice-activity-detector.js` - Entire VAD service
- `tests/voice-activity-detector.test.js` - VAD tests
- VAD integration in main.js
- Audio chunking and circular buffer logic
- Real-time transcription orchestration

### Modified Components
- **Audio Capture Service**: Remove chunking, add session recording
- **Main Application**: Simplify to basic recording control
- **Configuration**: Remove VAD-related options
- **Documentation**: Update architecture diagrams and flow

### New Simple Architecture
```
User Action → Start Recording → Continuous Audio Capture → Stop Recording → 
Full Transcription → Text Output
```

### Updated HTTP API
- `POST /recording/start` - Start recording session
- `POST /recording/stop` - Stop recording and transcribe full audio
- `GET /recording/status` - Get current recording status
- Keep existing `/health`, `/audio/devices` endpoints

## Implementation Benefits
- **Reduced Complexity**: ~60% reduction in codebase complexity
- **Easier Maintenance**: Fewer moving parts and edge cases
- **Faster Development**: Simplified testing and debugging
- **Better Reliability**: Fewer failure points in the audio pipeline

## Estimated Time
4 hours

## Dependencies
- Existing audio capture and transcription services
- OpenAI transcription service (TICKET-005)
- Text output service (TICKET-007 - to be simplified)

## Testing Requirements
- Test full recording session workflow
- Verify audio quality is maintained without chunking
- Test transcription accuracy with longer audio clips
- Validate new HTTP API endpoints