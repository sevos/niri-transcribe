# TICKET-012: Improved VAD with Sentence Boundary Detection

## Overview
Enhance the Voice Activity Detector (VAD) to support dynamic sentence completion and improve adaptive threshold calibration, addressing issues with mid-sentence breaks and threshold drift during speech.

## Current Issues
1. **Fixed 3-second chunks break sentences**: The current implementation forces speech end at exactly 3 seconds, often cutting off mid-sentence
2. **Adaptive threshold drift**: The threshold calibration updates during all non-speech periods, including brief pauses between words, causing the threshold to rise and making it harder to trigger transcription

## Goals
- Implement intelligent sentence boundary detection to create more natural transcription chunks
- Improve adaptive threshold calibration to only adjust during true silence periods
- Maintain real-time performance while improving transcription quality

## Technical Requirements

### 1. Dynamic Sentence Completion
- Replace hard 3-second cutoff with multi-tier pause detection:
  - **Short pause (200-400ms)**: Word boundaries - continue current chunk
  - **Medium pause (400-800ms)**: Potential sentence boundary - prepare to end chunk
  - **Long pause (1000ms+)**: Definite sentence end - finalize chunk
- Implement safety maximum chunk duration (10-15 seconds) to prevent memory issues
- Add energy contour analysis to detect natural speech rhythm patterns
- Support early termination for clear sentence endings (e.g., falling intonation)

### 2. Improved Adaptive Threshold Calibration
- Implement calibration states:
  - **CALIBRATING**: Only during extended silence (no speech for 2-3 seconds)
  - **SPEECH_ACTIVE**: During speech and immediate post-speech period
  - **COOLDOWN**: Post-speech period where calibration is disabled
- Track separate metrics:
  - **Ambient noise floor**: Long-term background noise level (slow adaptation)
  - **Speech pause floor**: Energy level during speech pauses (not used for calibration)
  - **Active threshold**: Dynamically adjusted based on ambient noise only
- Add maximum adaptation rate cap to prevent rapid threshold changes
- Store calibration history for debugging and tuning

### 3. Enhanced Audio Analysis
- Add pause classification based on duration and context
- Implement energy contour derivative analysis for speech pattern detection
- Add basic prosody detection for sentence ending cues
- Support frame-level confidence scoring for VAD decisions

## Implementation Details

### Files to Modify

1. **src/services/voice-activity-detector.js**
   - Add pause duration tracking with multiple tiers
   - Implement calibration state machine
   - Add energy contour buffer and analysis
   - Extend chunk duration limits
   - Add sentence boundary detection logic

2. **src/utils/audio-analysis.js**
   - Add `classifyPause(duration, energyContour)` method
   - Implement `detectSentenceBoundary(audioBuffer, pauseDuration)` method
   - Add `calculateEnergyDerivative(energyContour)` for rhythm analysis
   - Enhance existing VAD features with prosody hints

3. **src/config/schema.js**
   - Add new configuration parameters:
     - `vad.shortPauseThreshold` (default: 300ms)
     - `vad.mediumPauseThreshold` (default: 600ms)
     - `vad.longPauseThreshold` (default: 1000ms)
     - `vad.maxChunkDuration` (default: 15000ms)
     - `vad.calibrationCooldown` (default: 3000ms)
     - `vad.adaptationRateCap` (default: 0.01)

4. **tests/voice-activity-detector.test.js**
   - Update timing tests for new pause-based logic
   - Add sentence boundary detection tests
   - Add calibration state machine tests
   - Test various speech patterns (fast, slow, with pauses)

## Test Scenarios

1. **Natural Speech Flow**
   - User speaks: "Hello world. This is a test."
   - Expected: Two chunks split at the period pause

2. **Run-on Speech**
   - User speaks continuously for 20 seconds
   - Expected: Chunk splits at natural pause points before 15-second maximum

3. **Noisy Environment**
   - Background noise increases during speech
   - Expected: Threshold remains stable, calibration only during silence

4. **Stuttering/Hesitation**
   - User says: "Um... let me... uh... think about that"
   - Expected: Single chunk despite hesitations (short pauses)

5. **Multiple Sentences**
   - User speaks 3-4 sentences with clear pauses
   - Expected: Each sentence as separate chunk when pauses are long enough

## Dependencies
- Depends on: TICKET-004 (VAD Implementation) ✅ COMPLETED
- Blocking: None (enhances existing functionality)

## Estimated Time
- Implementation: 3 hours
- Testing: 1 hour
- Documentation: 30 minutes
- **Total: 4.5 hours**

## Success Criteria
- [ ] Sentences are not cut mid-word or mid-phrase
- [ ] Adaptive threshold remains stable during speech with pauses
- [ ] Natural sentence boundaries are detected 90%+ of the time
- [ ] Maximum chunk duration prevents memory issues
- [ ] All existing VAD tests pass with modifications
- [ ] New test suite covers all pause scenarios
- [ ] Performance impact < 5% CPU increase

## Notes
- Consider future enhancement: Use ML model for better sentence boundary detection
- May need tuning for different languages/speaking styles
- Could benefit from user-adjustable sensitivity settings