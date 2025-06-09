class AudioFormatConverter {
  /**
   * Convert Float32Array audio data to WAV format buffer
   * @param {Float32Array} float32Array - Audio samples in range [-1.0, 1.0]
   * @param {number} sampleRate - Sample rate in Hz (e.g., 16000)
   * @param {number} channels - Number of channels (1 for mono, 2 for stereo)
   * @returns {Buffer} WAV format audio data
   */
  static float32ToWav(float32Array, sampleRate, channels = 1) {
    const length = float32Array.length;
    const bytesPerSample = 2; // 16-bit samples
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * bytesPerSample;
    const fileSize = 36 + dataSize;
    
    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);

    // Helper function to write strings
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // WAV file header (44 bytes)
    writeString(0, 'RIFF');                    // ChunkID
    view.setUint32(4, fileSize, true);         // ChunkSize (little-endian)
    writeString(8, 'WAVE');                    // Format
    
    // fmt subchunk
    writeString(12, 'fmt ');                   // Subchunk1ID
    view.setUint32(16, 16, true);              // Subchunk1Size (PCM = 16)
    view.setUint16(20, 1, true);               // AudioFormat (PCM = 1)
    view.setUint16(22, channels, true);        // NumChannels
    view.setUint32(24, sampleRate, true);      // SampleRate
    view.setUint32(28, byteRate, true);        // ByteRate
    view.setUint16(32, blockAlign, true);      // BlockAlign
    view.setUint16(34, 16, true);              // BitsPerSample
    
    // data subchunk
    writeString(36, 'data');                   // Subchunk2ID
    view.setUint32(40, dataSize, true);        // Subchunk2Size

    // Convert float32 samples to int16 and write to buffer
    let offset = 44;
    for (let i = 0; i < length; i++) {
      // Clamp sample to [-1.0, 1.0] range and convert to int16
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      const int16Sample = Math.round(sample * 0x7FFF);
      view.setInt16(offset, int16Sample, true);
      offset += 2;
    }

    return Buffer.from(arrayBuffer);
  }

  /**
   * Convert Int16Array PCM data to Float32Array
   * @param {Int16Array|Buffer} int16Data - 16-bit PCM audio data
   * @returns {Float32Array} Normalized audio samples in range [-1.0, 1.0]
   */
  static int16ToFloat32(int16Data) {
    let samples;
    
    if (Buffer.isBuffer(int16Data)) {
      // Convert Buffer to Int16Array
      samples = new Int16Array(int16Data.buffer, int16Data.byteOffset, int16Data.byteLength / 2);
    } else if (int16Data instanceof Int16Array) {
      samples = int16Data;
    } else {
      throw new Error('Input must be Buffer or Int16Array');
    }

    const floatSamples = new Float32Array(samples.length);
    
    for (let i = 0; i < samples.length; i++) {
      floatSamples[i] = samples[i] / 32768.0; // Convert to -1.0 to 1.0 range
    }
    
    return floatSamples;
  }

  /**
   * Convert Float32Array to Int16Array PCM data
   * @param {Float32Array} float32Data - Normalized audio samples
   * @returns {Int16Array} 16-bit PCM audio data
   */
  static float32ToInt16(float32Data) {
    const int16Samples = new Int16Array(float32Data.length);
    
    for (let i = 0; i < float32Data.length; i++) {
      // Clamp and convert to int16
      const sample = Math.max(-1, Math.min(1, float32Data[i]));
      int16Samples[i] = Math.round(sample * 0x7FFF);
    }
    
    return int16Samples;
  }

  /**
   * Resample audio data to a different sample rate (simple linear interpolation)
   * @param {Float32Array} inputSamples - Input audio samples
   * @param {number} inputSampleRate - Input sample rate
   * @param {number} outputSampleRate - Desired output sample rate
   * @returns {Float32Array} Resampled audio data
   */
  static resample(inputSamples, inputSampleRate, outputSampleRate) {
    if (inputSampleRate === outputSampleRate) {
      return inputSamples;
    }

    const ratio = inputSampleRate / outputSampleRate;
    const outputLength = Math.ceil(inputSamples.length / ratio);
    const outputSamples = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const inputIndex = i * ratio;
      const inputIndexFloor = Math.floor(inputIndex);
      const inputIndexCeil = Math.min(inputIndexFloor + 1, inputSamples.length - 1);
      const fraction = inputIndex - inputIndexFloor;

      // Linear interpolation
      outputSamples[i] = inputSamples[inputIndexFloor] * (1 - fraction) + 
                        inputSamples[inputIndexCeil] * fraction;
    }

    return outputSamples;
  }

  /**
   * Calculate RMS (Root Mean Square) energy of audio samples
   * @param {Float32Array} samples - Audio samples
   * @returns {number} RMS energy value
   */
  static calculateRMS(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  /**
   * Apply a simple high-pass filter to remove DC offset
   * @param {Float32Array} samples - Input audio samples
   * @param {number} cutoffFreq - Cutoff frequency in Hz
   * @param {number} sampleRate - Sample rate in Hz
   * @returns {Float32Array} Filtered audio samples
   */
  static highPassFilter(samples, cutoffFreq, sampleRate) {
    const rc = 1.0 / (cutoffFreq * 2 * Math.PI);
    const dt = 1.0 / sampleRate;
    const alpha = rc / (rc + dt);
    
    const filtered = new Float32Array(samples.length);
    let prevInput = samples[0];
    let prevOutput = samples[0];
    
    filtered[0] = samples[0];
    
    for (let i = 1; i < samples.length; i++) {
      filtered[i] = alpha * (prevOutput + samples[i] - prevInput);
      prevInput = samples[i];
      prevOutput = filtered[i];
    }
    
    return filtered;
  }

  /**
   * Normalize audio samples to use full dynamic range
   * @param {Float32Array} samples - Input audio samples
   * @param {number} targetPeak - Target peak level (0.0 to 1.0)
   * @returns {Float32Array} Normalized audio samples
   */
  static normalize(samples, targetPeak = 0.95) {
    let maxAbsValue = 0;
    
    // Find peak value
    for (let i = 0; i < samples.length; i++) {
      maxAbsValue = Math.max(maxAbsValue, Math.abs(samples[i]));
    }
    
    if (maxAbsValue === 0) {
      return samples; // Avoid division by zero
    }
    
    const gain = targetPeak / maxAbsValue;
    const normalized = new Float32Array(samples.length);
    
    for (let i = 0; i < samples.length; i++) {
      normalized[i] = samples[i] * gain;
    }
    
    return normalized;
  }
}

module.exports = AudioFormatConverter;