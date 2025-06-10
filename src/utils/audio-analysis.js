class AudioAnalysis {
  /**
   * Calculate spectral centroid for better speech detection
   * @param {Float32Array} frame - Audio frame
   * @param {number} sampleRate - Sample rate in Hz
   * @returns {number} Spectral centroid frequency
   */
  static calculateSpectralCentroid(frame, sampleRate) {
    // FFT-based spectral centroid for better speech detection
    // Simplified implementation - in production, use FFT library
    let weightedSum = 0;
    let magnitudeSum = 0;
    
    for (let i = 0; i < frame.length; i++) {
      const magnitude = Math.abs(frame[i]);
      weightedSum += magnitude * i;
      magnitudeSum += magnitude;
    }
    
    return magnitudeSum > 0 ? (weightedSum / magnitudeSum) * (sampleRate / 2) / frame.length : 0;
  }

  /**
   * Calculate zero-crossing rate
   * @param {Float32Array} frame - Audio frame
   * @returns {number} Zero-crossing rate (0-1)
   */
  static calculateZeroCrossingRate(frame) {
    let crossings = 0;
    
    for (let i = 1; i < frame.length; i++) {
      if ((frame[i] >= 0) !== (frame[i - 1] >= 0)) {
        crossings++;
      }
    }
    
    return crossings / frame.length;
  }

  /**
   * Apply pre-emphasis filter to boost high frequencies
   * @param {Float32Array} frame - Audio frame
   * @param {number} coefficient - Pre-emphasis coefficient (typically 0.97)
   * @returns {Float32Array} Filtered frame
   */
  static applyPreEmphasis(frame, coefficient = 0.97) {
    const result = new Float32Array(frame.length);
    result[0] = frame[0];
    
    for (let i = 1; i < frame.length; i++) {
      result[i] = frame[i] - coefficient * frame[i - 1];
    }
    
    return result;
  }

  /**
   * Calculate frame energy with pre-emphasis
   * @param {Float32Array} frame - Audio frame
   * @param {boolean} usePreEmphasis - Whether to apply pre-emphasis
   * @returns {number} Frame energy
   */
  static calculateFrameEnergy(frame, usePreEmphasis = false) {
    const processedFrame = usePreEmphasis ? this.applyPreEmphasis(frame) : frame;
    
    let sum = 0;
    for (let i = 0; i < processedFrame.length; i++) {
      sum += processedFrame[i] * processedFrame[i];
    }
    
    return Math.sqrt(sum / processedFrame.length);
  }

  /**
   * Simple voice/unvoiced classification based on ZCR
   * @param {Float32Array} frame - Audio frame
   * @param {number} energy - Frame energy
   * @returns {string} 'voiced', 'unvoiced', or 'silence'
   */
  static classifyFrame(frame, energy) {
    const zcr = this.calculateZeroCrossingRate(frame);
    const energyThreshold = 0.01;
    const zcrThreshold = 0.1;
    
    if (energy < energyThreshold) {
      return 'silence';
    } else if (zcr > zcrThreshold) {
      return 'unvoiced'; // High ZCR indicates unvoiced speech (fricatives)
    } else {
      return 'voiced'; // Low ZCR indicates voiced speech (vowels)
    }
  }

  /**
   * Calculate short-term energy contour
   * @param {Float32Array} audio - Audio signal
   * @param {number} frameSize - Frame size in samples
   * @param {number} hopSize - Hop size in samples
   * @returns {Float32Array} Energy contour
   */
  static calculateEnergyContour(audio, frameSize, hopSize) {
    const numFrames = Math.floor((audio.length - frameSize) / hopSize) + 1;
    const energyContour = new Float32Array(numFrames);
    
    for (let i = 0; i < numFrames; i++) {
      const start = i * hopSize;
      const end = start + frameSize;
      const frame = audio.slice(start, end);
      
      let sum = 0;
      for (let j = 0; j < frame.length; j++) {
        sum += frame[j] * frame[j];
      }
      energyContour[i] = Math.sqrt(sum / frame.length);
    }
    
    return energyContour;
  }

  /**
   * Simple autocorrelation for pitch detection
   * @param {Float32Array} frame - Audio frame
   * @param {number} maxLag - Maximum lag to test
   * @returns {Float32Array} Autocorrelation values
   */
  static autocorrelation(frame, maxLag) {
    const result = new Float32Array(maxLag);
    
    for (let lag = 0; lag < maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < frame.length - lag; i++) {
        sum += frame[i] * frame[i + lag];
      }
      result[lag] = sum / (frame.length - lag);
    }
    
    return result;
  }

  /**
   * Enhanced VAD features combining multiple metrics
   * @param {Float32Array} frame - Audio frame
   * @param {number} sampleRate - Sample rate
   * @returns {Object} Combined features for VAD
   */
  static extractVADFeatures(frame, sampleRate) {
    const energy = this.calculateFrameEnergy(frame);
    const zcr = this.calculateZeroCrossingRate(frame);
    const spectralCentroid = this.calculateSpectralCentroid(frame, sampleRate);
    const frameClass = this.classifyFrame(frame, energy);
    
    // Simple periodicity measure (for voiced detection)
    const autocorr = this.autocorrelation(frame, Math.floor(frame.length / 2));
    const maxAutocorr = Math.max(...autocorr.slice(20)); // Skip first few lags
    
    return {
      energy,
      zcr,
      spectralCentroid,
      frameClass,
      periodicity: maxAutocorr,
      isSpeechLikely: energy > 0.01 && (frameClass === 'voiced' || frameClass === 'unvoiced')
    };
  }
}

module.exports = AudioAnalysis;