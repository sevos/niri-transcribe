const AudioAnalysis = require('../src/utils/audio-analysis');

describe('AudioAnalysis', () => {
  describe('calculateZeroCrossingRate', () => {
    test('should return 0 for constant signal', () => {
      const frame = new Float32Array(100).fill(0.5);
      expect(AudioAnalysis.calculateZeroCrossingRate(frame)).toBe(0);
    });

    test('should calculate correct ZCR for alternating signal', () => {
      const frame = new Float32Array([1, -1, 1, -1, 1, -1]);
      const zcr = AudioAnalysis.calculateZeroCrossingRate(frame);
      expect(zcr).toBeCloseTo(5/6, 2); // 5 crossings in 6 samples
    });

    test('should handle zero-centered signals', () => {
      const frame = new Float32Array([0.1, -0.1, 0.1, -0.1]);
      const zcr = AudioAnalysis.calculateZeroCrossingRate(frame);
      expect(zcr).toBeCloseTo(3/4, 2);
    });
  });

  describe('applyPreEmphasis', () => {
    test('should apply pre-emphasis filter correctly', () => {
      const frame = new Float32Array([1, 1, 1, 1]);
      const coefficient = 0.97;
      const filtered = AudioAnalysis.applyPreEmphasis(frame, coefficient);
      
      expect(filtered[0]).toBe(1); // First sample unchanged
      expect(filtered[1]).toBeCloseTo(1 - 0.97 * 1, 5);
      expect(filtered[2]).toBeCloseTo(1 - 0.97 * 1, 5);
    });

    test('should use default coefficient', () => {
      const frame = new Float32Array([1, 0.5]);
      const filtered = AudioAnalysis.applyPreEmphasis(frame);
      
      expect(filtered[0]).toBe(1);
      expect(filtered[1]).toBeCloseTo(0.5 - 0.97 * 1, 5);
    });
  });

  describe('calculateSpectralCentroid', () => {
    test('should return 0 for silent frame', () => {
      const frame = new Float32Array(100).fill(0);
      const centroid = AudioAnalysis.calculateSpectralCentroid(frame, 16000);
      expect(centroid).toBe(0);
    });

    test('should calculate centroid for non-zero signal', () => {
      const frame = new Float32Array(100);
      // Create a signal with energy concentrated at higher frequencies
      for (let i = 50; i < 100; i++) {
        frame[i] = 0.5;
      }
      const centroid = AudioAnalysis.calculateSpectralCentroid(frame, 16000);
      expect(centroid).toBeGreaterThan(0);
    });
  });

  describe('classifyFrame', () => {
    test('should classify silence correctly', () => {
      const frame = new Float32Array(100).fill(0.001);
      const energy = 0.005;
      expect(AudioAnalysis.classifyFrame(frame, energy)).toBe('silence');
    });

    test('should classify voiced speech', () => {
      // Low frequency sine wave (voiced-like)
      const frame = new Float32Array(100);
      for (let i = 0; i < 100; i++) {
        frame[i] = Math.sin(2 * Math.PI * i / 20);
      }
      const energy = 0.5;
      expect(AudioAnalysis.classifyFrame(frame, energy)).toBe('voiced');
    });

    test('should classify unvoiced speech', () => {
      // High ZCR signal (unvoiced-like)
      const frame = new Float32Array(100);
      for (let i = 0; i < 100; i++) {
        frame[i] = (i % 4 < 2) ? 0.5 : -0.5;
      }
      const energy = 0.5;
      expect(AudioAnalysis.classifyFrame(frame, energy)).toBe('unvoiced');
    });
  });

  describe('calculateEnergyContour', () => {
    test('should calculate energy contour correctly', () => {
      const audio = new Float32Array(1000).fill(0.5);
      const frameSize = 100;
      const hopSize = 50;
      
      const contour = AudioAnalysis.calculateEnergyContour(audio, frameSize, hopSize);
      
      // Expected number of frames
      const expectedFrames = Math.floor((1000 - 100) / 50) + 1;
      expect(contour.length).toBe(expectedFrames);
      
      // All frames should have same energy for constant signal
      const expectedEnergy = 0.5;
      for (let i = 0; i < contour.length; i++) {
        expect(contour[i]).toBeCloseTo(expectedEnergy, 5);
      }
    });
  });

  describe('extractVADFeatures', () => {
    test('should extract all features correctly', () => {
      const frame = new Float32Array(480);
      // Create a simple sine wave
      for (let i = 0; i < 480; i++) {
        frame[i] = 0.3 * Math.sin(2 * Math.PI * i / 40);
      }
      
      const features = AudioAnalysis.extractVADFeatures(frame, 16000);
      
      expect(features).toHaveProperty('energy');
      expect(features).toHaveProperty('zcr');
      expect(features).toHaveProperty('spectralCentroid');
      expect(features).toHaveProperty('frameClass');
      expect(features).toHaveProperty('periodicity');
      expect(features).toHaveProperty('isSpeechLikely');
      
      expect(features.energy).toBeGreaterThan(0);
      expect(features.zcr).toBeGreaterThan(0);
      expect(features.isSpeechLikely).toBe(true);
    });
  });
});