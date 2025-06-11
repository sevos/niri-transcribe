# TICKET-005: OpenAI Transcription Service - QA Test Plan

## Overview
This document outlines the manual testing procedures for the OpenAI Whisper API integration implemented in TICKET-005.

## Prerequisites
- ✅ Docker environment with audio access
- ✅ OPENAI_API_KEY environment variable set
- ✅ Audio input device available
- ✅ Service running on port 3000

## Test Environment Setup

### 1. Environment Variable Configuration
```bash
# Required for OpenAI integration
export OPENAI_API_KEY="your-openai-api-key-here"

# Optional: Configure provider preference
export TRANSCRIPTION_PROVIDER="openai"  # or "auto" (default)

# Optional: Enable debug logging
export DEBUG="true"
```

### 2. Service Startup
```bash
# Build and start the service
docker compose up --build

# Verify service is running
curl http://localhost:3000/health
```

## Test Scenarios

### 1. Basic Configuration Tests

#### 1.1 Health Check with API Key
**Objective**: Verify transcription service initializes correctly with API key

**Steps**:
1. Ensure OPENAI_API_KEY is set
2. Start service: `docker compose up`
3. Call health endpoint: `curl http://localhost:3000/health`

**Expected Result**:
```json
{
  "status": "healthy",
  "services": {
    "transcription": {
      "primaryService": "OpenAITranscriptionService",
      "openai": {
        "enabled": true
      }
    }
  }
}
```

#### 1.2 Health Check without API Key
**Objective**: Verify graceful degradation when API key is missing

**Steps**:
1. Unset OPENAI_API_KEY: `unset OPENAI_API_KEY`
2. Start service
3. Call health endpoint

**Expected Result**:
```json
{
  "services": {
    "transcription": {
      "primaryService": "LocalTranscriptionService",
      "openai": {
        "enabled": false
      }
    }
  }
}
```

### 2. Transcription Service Health Tests

#### 2.1 OpenAI Service Health Check
**Objective**: Verify OpenAI API connectivity

**Steps**:
1. Ensure OPENAI_API_KEY is set
2. Call: `curl http://localhost:3000/transcription/health`

**Expected Result**:
```json
{
  "openai": {
    "healthy": true
  },
  "local": {
    "healthy": false,
    "reason": "Not implemented (TICKET-006)"
  }
}
```

#### 2.2 Service Metrics
**Objective**: Verify metrics collection

**Steps**:
1. Call: `curl http://localhost:3000/transcription/metrics`

**Expected Result**:
```json
{
  "primaryService": "OpenAITranscriptionService",
  "openai": {
    "queueLength": 0,
    "processing": false,
    "enabled": true
  },
  "local": {
    "enabled": false,
    "modelLoaded": false
  }
}
```

### 3. Direct Transcription API Tests

#### 3.1 Test Transcription with Sample Audio
**Objective**: Test direct API transcription endpoint

**Steps**:
1. Generate test audio data (16kHz mono):
```bash
# Create a short sine wave for testing
node -e "
const fs = require('fs');
const sampleRate = 16000;
const duration = 1; // 1 second
const frequency = 440; // A4 note
const samples = [];
for (let i = 0; i < sampleRate * duration; i++) {
  samples.push(Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.3);
}
fs.writeFileSync('test-audio.json', JSON.stringify({ audioData: samples }));
"
```

2. Test transcription:
```bash
curl -X POST http://localhost:3000/transcription/test \
  -H "Content-Type: application/json" \
  -d @test-audio.json
```

**Expected Result**:
```json
{
  "success": true,
  "result": {
    "text": "",
    "language": "unknown",
    "confidence": 1.0
  },
  "metadata": {
    "audioSamples": 16000,
    "duration": 1
  }
}
```

#### 3.2 Test with Invalid Audio Data
**Objective**: Verify error handling for invalid input

**Steps**:
1. Send invalid data:
```bash
curl -X POST http://localhost:3000/transcription/test \
  -H "Content-Type: application/json" \
  -d '{"audioData": "invalid"}'
```

**Expected Result**:
```json
{
  "error": "audioData array is required"
}
```

### 4. End-to-End Integration Tests

#### 4.1 Audio Capture → VAD → Transcription Pipeline
**Objective**: Test complete pipeline from audio input to transcription

**Steps**:
1. Start audio capture: `curl -X POST http://localhost:3000/audio/start`
2. Speak into microphone for 2-3 seconds
3. Stop speaking and wait for silence detection
4. Check logs for transcription results
5. Stop audio: `curl -X POST http://localhost:3000/audio/stop`

**Expected Result**:
- Logs show "Speech detected - recording started"
- Logs show "Speech ended - silence detected" 
- Logs show "Transcription result" with your spoken text
- **Language field shows actual detected language (e.g., "english", "polish") not "detected"**
- No error messages in logs

#### 4.2 Multiple Speech Chunks
**Objective**: Test handling of multiple speech segments

**Steps**:
1. Start audio capture
2. Speak a sentence, pause, speak another sentence
3. Monitor logs for separate transcription events

**Expected Result**:
- Two separate "Transcription result" log entries
- Each transcription shows different text
- No API rate limiting errors

### 5. Error Handling Tests

#### 5.1 Network Connectivity Test
**Objective**: Test behavior when OpenAI API is unreachable

**Steps**:
1. Block network access temporarily:
```bash
# In container, block OpenAI API
iptables -A OUTPUT -d api.openai.com -j DROP
```
2. Attempt transcription
3. Restore network access

**Expected Result**:
- Logs show retry attempts with exponential backoff
- After max retries, falls back to local service (which fails with "Not implemented")
- Service continues running after network issues

#### 5.2 Invalid API Key Test
**Objective**: Test behavior with invalid API key

**Steps**:
1. Set invalid API key: `export OPENAI_API_KEY="invalid-key"`
2. Restart service
3. Attempt transcription

**Expected Result**:
- Authentication error logged
- Service switches to local fallback
- Health check shows OpenAI as unhealthy

### 6. Performance Tests

#### 6.1 Rate Limiting Verification
**Objective**: Verify rate limiting works correctly

**Steps**:
1. Send multiple rapid transcription requests:
```bash
for i in {1..5}; do
  curl -X POST http://localhost:3000/transcription/test \
    -H "Content-Type: application/json" \
    -d @test-audio.json &
done
wait
```

**Expected Result**:
- Requests processed sequentially with 100ms delays
- No API errors from exceeding rate limits
- All requests complete successfully

#### 6.2 Large Audio Chunk Test
**Objective**: Test handling of maximum-sized audio chunks (3 seconds)

**Steps**:
1. Generate 3-second audio sample
2. Send for transcription
3. Monitor processing time

**Expected Result**:
- Transcription completes within 5 seconds
- No memory issues or timeouts
- Accurate transcription results

### 7. Configuration Tests

#### 7.1 Provider Selection Test
**Objective**: Test different provider configurations

**Steps**:
1. Test with `TRANSCRIPTION_PROVIDER=openai`
2. Test with `TRANSCRIPTION_PROVIDER=auto`
3. Test with `TRANSCRIPTION_PROVIDER=local`

**Expected Result**:
- Provider selection reflected in health endpoint
- Appropriate service used for transcription
- Fallback behavior works in auto mode

#### 7.2 OpenAI Configuration Test
**Objective**: Test OpenAI-specific configuration options

**Steps**:
1. Modify config.json:
```json
{
  "transcription": {
    "openai": {
      "model": "whisper-1",
      "temperature": 0.5,
      "language": "en"
    }
  }
}
```
2. Restart service and test transcription

**Expected Result**:
- Configuration parameters sent to OpenAI API
- Transcription uses specified language and temperature

## Success Criteria

### Must Pass
- ✅ Service starts successfully with valid API key
- ✅ Health endpoints return correct status
- ✅ End-to-end transcription pipeline works
- ✅ Error handling for network issues
- ✅ Rate limiting prevents API abuse
- ✅ Fallback to local service when OpenAI fails

### Should Pass
- ✅ Provider selection works correctly
- ✅ Configuration parameters applied correctly
- ✅ Performance meets acceptable thresholds
- ✅ Logs provide useful debugging information

## Test Results Log

### Test Run: [DATE]
**Environment**: Docker on [OS]
**OPENAI_API_KEY**: Set ✅
**Audio Device**: [DEVICE_NAME]

| Test Case | Status | Notes |
|-----------|--------|-------|
| 1.1 Health Check with API Key | ❌ | |
| 1.2 Health Check without API Key | ❌ | |
| 2.1 OpenAI Service Health | ❌ | |
| 2.2 Service Metrics | ❌ | |
| 3.1 Direct Transcription | ❌ | |
| 3.2 Invalid Audio Data | ❌ | |
| 4.1 E2E Pipeline | ❌ | |
| 4.2 Multiple Chunks | ❌ | |
| 5.1 Network Issues | ❌ | |
| 5.2 Invalid API Key | ❌ | |
| 6.1 Rate Limiting | ❌ | |
| 6.2 Large Audio | ❌ | |
| 7.1 Provider Selection | ❌ | |
| 7.2 OpenAI Config | ❌ | |

## Known Issues
- Local transcription service not implemented (TICKET-006)
- Text output service not implemented (TICKET-007)

## Language Detection Improvements (Latest Update)
- ✅ **Fixed**: Language field now shows actual detected language from OpenAI API
- ✅ **Fixed**: Uses `verbose_json` response format to get language information  
- ✅ **Fixed**: No longer hardcodes "detected" as language value
- ✅ **Expected**: Language field will show values like "english", "polish", "spanish", etc.

### Multi-Language Testing
When testing language detection, try speaking in different languages:
- **English**: Should show `"language": "english"`
- **Polish**: Should show `"language": "polish"`  
- **Spanish**: Should show `"language": "spanish"`
- **Other**: OpenAI Whisper supports 50+ languages

## Next Steps
1. Execute all test scenarios
2. Document any issues found
3. Verify integration with existing VAD system
4. Prepare for TICKET-006 (Local Transcription) implementation