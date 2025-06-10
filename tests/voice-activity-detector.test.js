const VoiceActivityDetector = require('../src/services/voice-activity-detector');

// Mock logger
const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Mock config
const mockConfig = {
  audio: {
    sampleRate: 16000,
    vadThreshold: 0.01,
    silenceTimeout: 10000
  }
};

describe('VoiceActivityDetector', () => {
  let vad;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    vad = new VoiceActivityDetector(mockConfig);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Core Algorithm Tests', () => {
    test('should calculate RMS energy correctly', () => {
      // Test with known values
      const testFrames = [
        new Float32Array([0, 0, 0, 0]), // Silence
        new Float32Array([0.5, 0.5, 0.5, 0.5]), // Constant signal
        new Float32Array([1, -1, 1, -1]), // Alternating max amplitude
        new Float32Array([0.1, 0.2, 0.3, 0.4]) // Varying amplitude
      ];

      const expectedRMS = [
        0, // Silence
        0.5, // Constant 0.5
        1, // RMS of alternating ±1
        Math.sqrt((0.01 + 0.04 + 0.09 + 0.16) / 4) // Calculated RMS
      ];

      testFrames.forEach((frame, index) => {
        const energy = vad.calculateEnergy(frame);
        expect(energy).toBeCloseTo(expectedRMS[index], 5);
      });
    });

    test('should detect speech based on energy threshold', () => {
      // Set known threshold
      vad.energyThreshold = 0.1;
      vad.adaptiveThreshold = 0.1;
      vad.noiseFloor = 0.01;

      expect(vad.detectSpeech(0.05)).toBe(false); // Below threshold
      expect(vad.detectSpeech(0.15)).toBe(true);  // Above threshold
      expect(vad.detectSpeech(0.1)).toBe(false);  // Exactly at threshold
    });

    test('should update noise floor adaptively', () => {
      const initialNoiseFloor = vad.noiseFloor;
      const alpha = 0.01;

      // Update with non-speech energy
      vad.updateNoiseFloor(0.05, false);
      const expectedNoiseFloor = alpha * 0.05 + (1 - alpha) * initialNoiseFloor;
      expect(vad.noiseFloor).toBeCloseTo(expectedNoiseFloor, 5);

      // Should not update during speech
      const currentNoiseFloor = vad.noiseFloor;
      vad.updateNoiseFloor(0.5, true);
      expect(vad.noiseFloor).toBe(currentNoiseFloor);
    });
  });

  describe('Speech Detection Timing Tests', () => {
    test('should delay speech start by 300ms', () => {
      const speechStartHandler = jest.fn();
      vad.on('speechStart', speechStartHandler);

      // Create speech-level audio
      const speechFrame = new Float32Array(480).fill(0.5);
      
      // Process frame - should not trigger immediately
      vad.processFrame(speechFrame);
      expect(speechStartHandler).not.toHaveBeenCalled();

      // Advance time by 299ms - still no trigger
      jest.advanceTimersByTime(299);
      expect(speechStartHandler).not.toHaveBeenCalled();

      // Advance by 1ms more - should trigger
      jest.advanceTimersByTime(1);
      expect(speechStartHandler).toHaveBeenCalledTimes(1);
    });

    test('should delay speech end by 1000ms', () => {
      const speechEndHandler = jest.fn();
      vad.on('speechEnd', speechEndHandler);

      // Start speech
      const speechFrame = new Float32Array(480).fill(0.5);
      vad.processFrame(speechFrame);
      jest.advanceTimersByTime(300);

      // End speech
      const silenceFrame = new Float32Array(480).fill(0);
      vad.processFrame(silenceFrame);
      
      // Should not end immediately
      expect(speechEndHandler).not.toHaveBeenCalled();

      // Advance time by 999ms - still no trigger
      jest.advanceTimersByTime(999);
      expect(speechEndHandler).not.toHaveBeenCalled();

      // Advance by 1ms more - should trigger
      jest.advanceTimersByTime(1);
      expect(speechEndHandler).toHaveBeenCalledTimes(1);
    });

    test('should cancel speech end if speech resumes', () => {
      const speechEndHandler = jest.fn();
      vad.on('speechEnd', speechEndHandler);

      // Start speech
      const speechFrame = new Float32Array(480).fill(0.5);
      vad.processFrame(speechFrame);
      jest.advanceTimersByTime(300); // Speech officially starts

      // Continue speech for a while to establish it's really speaking
      for (let i = 0; i < 20; i++) {
        vad.processFrame(speechFrame);
      }

      // Brief silence - this should start the end timer
      const silenceFrame = new Float32Array(480).fill(0);
      vad.processFrame(silenceFrame);
      
      // Wait halfway through the end delay (500ms out of 1000ms)
      jest.advanceTimersByTime(500);

      // Resume speech - this should cancel the end timer
      vad.processFrame(speechFrame);
      
      // Continue speech to prove we're still speaking
      for (let i = 0; i < 10; i++) {
        vad.processFrame(speechFrame);
      }

      // Advance time past when the original end timer would have fired
      jest.advanceTimersByTime(600); // Total 1100ms from silence start

      // Should not have ended because speech resumed
      expect(speechEndHandler).not.toHaveBeenCalled();
      
      // Verify we're still speaking
      expect(vad.isSpeaking).toBe(true);
    });
  });

  describe('Audio Buffering Tests', () => {
    test('should include pre-speech buffer of 300ms', () => {
      const speechStartHandler = jest.fn();
      vad.on('speechStart', speechStartHandler);

      // Fill buffer with identifiable pattern before speech
      const preSpeechFrames = 10; // 10 frames = 300ms at 30ms/frame
      for (let i = 0; i < preSpeechFrames; i++) {
        const silenceFrame = new Float32Array(480).fill(0.001 * i);
        vad.processFrame(silenceFrame);
      }

      // Start speech
      const speechFrame = new Float32Array(480).fill(0.5);
      vad.processFrame(speechFrame);
      jest.advanceTimersByTime(300);

      // Check buffer includes pre-speech samples
      const preSpeechSamples = Math.floor(16000 * 0.3); // 300ms worth
      expect(vad.audioBuffer.length).toBeGreaterThanOrEqual(preSpeechSamples);
    });

    test('should maintain circular buffer correctly', () => {
      // Process many frames
      const frame = new Float32Array(480).fill(0.1);
      for (let i = 0; i < 100; i++) {
        vad.processFrame(frame);
      }

      // Buffer should contain exactly the processed samples
      expect(vad.audioBuffer.length).toBe(480 * 100);
    });
  });

  describe('Chunk Generation Tests', () => {
    test('should not emit chunks shorter than 1 second', () => {
      const speechEndHandler = jest.fn();
      vad.on('speechEnd', speechEndHandler);

      // Start speech but don't let it fully start
      const speechFrame = new Float32Array(480).fill(0.5);
      vad.processFrame(speechFrame);
      
      // Wait less than the start delay
      jest.advanceTimersByTime(200);
      
      // End speech before it officially started
      const silenceFrame = new Float32Array(480).fill(0);
      vad.processFrame(silenceFrame);
      
      // Advance past all delays
      jest.advanceTimersByTime(2000);

      // Should not emit chunk because speech never officially started
      expect(speechEndHandler).not.toHaveBeenCalled();
    });

    test('should emit chunks of at least 1 second', () => {
      const speechEndHandler = jest.fn();
      vad.on('speechEnd', speechEndHandler);

      // Start speech
      const speechFrame = new Float32Array(480).fill(0.5);
      vad.processFrame(speechFrame);
      jest.advanceTimersByTime(300);

      // Continue for 1.2 seconds
      for (let i = 0; i < 40; i++) { // 40 frames = 1.2s
        vad.processFrame(speechFrame);
      }

      // End speech
      const silenceFrame = new Float32Array(480).fill(0);
      vad.processFrame(silenceFrame);
      jest.advanceTimersByTime(1000);

      expect(speechEndHandler).toHaveBeenCalledTimes(1);
      const event = speechEndHandler.mock.calls[0][0];
      expect(event.duration).toBeGreaterThanOrEqual(1000);
      expect(event.audio).toBeInstanceOf(Float32Array);
      expect(event.reason).toBe('silence');
    });

    test('should force end speech at 3 seconds', () => {
      const speechEndHandler = jest.fn();
      const speechStartHandler = jest.fn();
      vad.on('speechEnd', speechEndHandler);
      vad.on('speechStart', speechStartHandler);

      // Start speech
      const speechFrame = new Float32Array(480).fill(0.5);
      vad.processFrame(speechFrame);
      jest.advanceTimersByTime(300);
      
      // Record initial start
      expect(speechStartHandler).toHaveBeenCalledTimes(1);

      // Continue for exactly 3 seconds worth of frames
      // The force end happens when duration >= maxChunkDuration
      const startTime = Date.now();
      jest.advanceTimersByTime(3000); // Advance time to trigger force end
      
      // Process one more frame to trigger the check
      vad.processFrame(speechFrame);

      // Should force end and start new segment
      expect(speechEndHandler).toHaveBeenCalledTimes(1);
      expect(speechStartHandler).toHaveBeenCalledTimes(2); // Initial + new segment
      
      const event = speechEndHandler.mock.calls[0][0];
      expect(event.duration).toBeCloseTo(3000, -2);
      expect(event.reason).toBe('max_duration');
    });
  });

  describe('Silence Timeout Tests', () => {
    test('should emit silence timeout after 10 seconds', () => {
      const silenceTimeoutHandler = jest.fn();
      vad.on('silenceTimeout', silenceTimeoutHandler);

      // Have some initial speech
      const speechFrame = new Float32Array(480).fill(0.5);
      vad.processFrame(speechFrame);
      jest.advanceTimersByTime(300);

      // Continue speech for a bit
      for (let i = 0; i < 10; i++) {
        vad.processFrame(speechFrame);
      }

      // Then silence
      const silenceFrame = new Float32Array(480).fill(0);
      vad.processFrame(silenceFrame);
      
      // The silence timer starts immediately when silence is detected
      // after having speech, not after speech end delay
      
      // Wait for 9.9 seconds
      jest.advanceTimersByTime(9900);
      expect(silenceTimeoutHandler).not.toHaveBeenCalled();

      // One more moment to trigger timeout (10 seconds total)
      jest.advanceTimersByTime(100);
      expect(silenceTimeoutHandler).toHaveBeenCalledTimes(1);
    });

    test('should reset silence timer on speech', () => {
      const silenceTimeoutHandler = jest.fn();
      vad.on('silenceTimeout', silenceTimeoutHandler);

      // Initial speech
      const speechFrame = new Float32Array(480).fill(0.5);
      vad.processFrame(speechFrame);
      jest.advanceTimersByTime(300);
      
      // Continue speech to establish lastSpeechTime
      for (let i = 0; i < 10; i++) {
        vad.processFrame(speechFrame);
      }

      // Start silence
      const silenceFrame = new Float32Array(480).fill(0);
      vad.processFrame(silenceFrame);
      
      // 8 seconds of silence
      jest.advanceTimersByTime(8000);

      // Resume speech - should reset timer
      vad.processFrame(speechFrame);
      
      // Process a few more speech frames to ensure timer is cleared
      for (let i = 0; i < 5; i++) {
        vad.processFrame(speechFrame);
      }
      
      // Start silence again
      vad.processFrame(silenceFrame);
      
      // Another 8 seconds of silence
      jest.advanceTimersByTime(8000);

      // Should not have triggered
      expect(silenceTimeoutHandler).not.toHaveBeenCalled();
    });
  });

  describe('Configuration Tests', () => {
    test('should update configuration dynamically', () => {
      const newConfig = {
        vadThreshold: 0.05,
        silenceTimeout: 5000
      };

      vad.updateConfig(newConfig);

      expect(vad.energyThreshold).toBe(0.05);
      expect(vad.silenceTimeout).toBe(5000);
      expect(vad.adaptiveThreshold).toBe(0.05);
    });

    test('should handle partial configuration updates', () => {
      const originalThreshold = vad.energyThreshold;
      const originalTimeout = vad.silenceTimeout;

      vad.updateConfig({ vadThreshold: 0.02 });
      expect(vad.energyThreshold).toBe(0.02);
      expect(vad.silenceTimeout).toBe(originalTimeout);

      vad.updateConfig({ silenceTimeout: 15000 });
      expect(vad.energyThreshold).toBe(0.02);
      expect(vad.silenceTimeout).toBe(15000);
    });
  });

  describe('Reset Functionality Tests', () => {
    test('should reset all state and timers', () => {
      // Start some activity
      const speechFrame = new Float32Array(480).fill(0.5);
      vad.processFrame(speechFrame);
      jest.advanceTimersByTime(150); // Halfway through start delay

      // Reset
      vad.reset();

      // Verify state
      expect(vad.isSpeaking).toBe(false);
      expect(vad.speechStartTime).toBeNull();
      expect(vad.speechEndTime).toBeNull();
      expect(vad.lastSpeechTime).toBeNull();
      expect(vad.audioBuffer).toEqual([]);
      expect(vad.frameBuffer).toEqual([]);

      // Verify timers are cleared (no events should fire)
      const handler = jest.fn();
      vad.on('speechStart', handler);
      jest.advanceTimersByTime(1000);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Frame Processing Tests', () => {
    test('should handle partial frames correctly', () => {
      // Send partial frame
      const partialData = new Float32Array(200);
      vad.processAudio(partialData);
      
      // Should buffer it
      expect(vad.frameBuffer.length).toBe(200);

      // Send more data to complete frame
      const moreData = new Float32Array(300);
      vad.processAudio(moreData);

      // Should have processed one complete frame
      expect(vad.frameBuffer.length).toBe(20); // 500 - 480
    });

    test('should process multiple frames in one call', () => {
      const processSpy = jest.spyOn(vad, 'processFrame');
      
      // Send 3 frames worth of data
      const multiFrameData = new Float32Array(480 * 3);
      vad.processAudio(multiFrameData);

      expect(processSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('Event Data Validation Tests', () => {
    test('should emit correct data with speechEnd event', () => {
      const speechEndHandler = jest.fn();
      vad.on('speechEnd', speechEndHandler);

      // Create identifiable audio pattern
      const speechFrame = new Float32Array(480);
      for (let i = 0; i < 480; i++) {
        speechFrame[i] = Math.sin(2 * Math.PI * i / 480) * 0.5;
      }

      // Start speech
      vad.processFrame(speechFrame);
      jest.advanceTimersByTime(300);
      const startTime = Date.now();

      // Continue for 1.5 seconds
      for (let i = 0; i < 50; i++) {
        vad.processFrame(speechFrame);
      }

      // End speech
      const silenceFrame = new Float32Array(480).fill(0);
      vad.processFrame(silenceFrame);
      jest.advanceTimersByTime(1000);

      const eventData = speechEndHandler.mock.calls[0][0];
      expect(eventData).toHaveProperty('audio');
      expect(eventData).toHaveProperty('duration');
      expect(eventData).toHaveProperty('timestamp');
      expect(eventData).toHaveProperty('reason');
      expect(eventData.audio).toBeInstanceOf(Float32Array);
      expect(eventData.duration).toBeGreaterThanOrEqual(1000);
      expect(eventData.timestamp).toBeCloseTo(startTime, -2);
      expect(eventData.reason).toBe('silence');
    });
  });
});