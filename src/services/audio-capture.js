const { spawn } = require('child_process');
const EventEmitter = require('events');

class AudioCaptureService extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.captureProcess = null;
    this.isCapturing = false;
    this.isRecording = false;
    this.sessionBuffer = [];
    this.audioSystem = null;
    this.restartCount = 0;
    this.maxRestartAttempts = 5;
  }

  async start() {
    if (this.isCapturing) {
      throw new Error('Audio capture already in progress');
    }

    try {
      await this.detectAudioSystem();
      this.startCapture();
      this.isCapturing = true;
      this.restartCount = 0;
      this.logger.info('Audio capture service started successfully', {
        audioSystem: this.audioSystem,
        sampleRate: this.config.audio.sampleRate,
        channels: this.config.audio.channels,
        device: this.config.audio.device
      });
      this.emit('started');
    } catch (error) {
      this.logger.error('Failed to start audio capture:', error);
      this.emit('error', error);
      throw error;
    }
  }

  async detectAudioSystem() {
    // Try PipeWire first
    try {
      await this.execCommand('pw-cli', ['--version']);
      this.audioSystem = 'pipewire';
      this.logger.info('Detected PipeWire audio system');
      return;
    } catch (error) {
      this.logger.debug('PipeWire not available:', error.message);
    }

    // Try PulseAudio
    try {
      await this.execCommand('pactl', ['--version']);
      this.audioSystem = 'pulseaudio';
      this.logger.info('Detected PulseAudio audio system');
      return;
    } catch (error) {
      this.logger.debug('PulseAudio not available:', error.message);
    }

    throw new Error('No compatible audio system found (PipeWire or PulseAudio required)');
  }

  startCapture() {
    const args = this.buildCaptureArgs();
    
    this.logger.debug('Starting audio capture process', {
      command: args.command,
      args: args.args
    });

    this.captureProcess = spawn(args.command, args.args);
    
    this.captureProcess.stdout.on('data', (data) => {
      this.processAudioData(data);
    });

    this.captureProcess.stderr.on('data', (data) => {
      const errorMsg = data.toString().trim();
      if (errorMsg) {
        this.logger.warn('Audio capture stderr:', errorMsg);
      }
    });

    this.captureProcess.on('error', (error) => {
      this.logger.error('Audio capture process error:', error);
      this.emit('error', error);
      this.handleProcessExit();
    });

    this.captureProcess.on('exit', (code, signal) => {
      if (this.isCapturing) {
        this.logger.warn('Audio capture process exited unexpectedly', {
          code,
          signal,
          restartCount: this.restartCount
        });
        this.handleProcessExit();
      }
    });
  }

  buildCaptureArgs() {
    const { sampleRate, channels, device } = this.config.audio;

    if (this.audioSystem === 'pipewire') {
      return {
        command: 'pw-record',
        args: [
          '--format', 's16',
          '--rate', sampleRate.toString(),
          '--channels', channels.toString(),
          '--target', device === 'default' ? '@DEFAULT_SOURCE@' : device,
          '-'
        ]
      };
    } else {
      // PulseAudio
      return {
        command: 'parecord',
        args: [
          '--format=s16le',
          '--rate=' + sampleRate.toString(),
          '--channels=' + channels.toString(),
          '--raw',
          '--device=' + (device === 'default' ? '@DEFAULT_SOURCE@' : device),
          '-'
        ]
      };
    }
  }

  processAudioData(data) {
    try {
      // Convert raw PCM data to Float32Array
      const samples = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
      const floatSamples = new Float32Array(samples.length);
      
      for (let i = 0; i < samples.length; i++) {
        floatSamples[i] = samples[i] / 32768.0; // Convert to -1.0 to 1.0 range
      }

      // Add to session buffer if recording
      if (this.isRecording) {
        this.sessionBuffer.push(...floatSamples);
      }
      
      // Emit audio data for monitoring (optional)
      this.emit('audio', floatSamples);
    } catch (error) {
      this.logger.error('Error processing audio data:', error);
    }
  }

  async stop() {
    if (!this.isCapturing) {
      return;
    }

    this.logger.info('Stopping audio capture service');
    this.isCapturing = false;
    
    if (this.captureProcess) {
      this.captureProcess.kill('SIGTERM');
      
      // Give process time to terminate gracefully
      setTimeout(() => {
        if (this.captureProcess && !this.captureProcess.killed) {
          this.captureProcess.kill('SIGKILL');
        }
      }, 1000);
      
      this.captureProcess = null;
    }

    this.emit('stopped');
  }

  handleProcessExit() {
    if (!this.isCapturing) {
      return;
    }

    this.restartCount++;
    
    if (this.restartCount >= this.maxRestartAttempts) {
      this.logger.error('Maximum restart attempts reached, stopping audio capture');
      this.isCapturing = false;
      this.emit('error', new Error('Audio capture failed after maximum restart attempts'));
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.restartCount - 1), 10000); // Exponential backoff, max 10s
    this.logger.info(`Restarting audio capture in ${delay}ms (attempt ${this.restartCount}/${this.maxRestartAttempts})`);
    
    setTimeout(() => {
      if (this.isCapturing) {
        this.restart();
      }
    }, delay);
  }

  async restart() {
    try {
      this.logger.info('Attempting to restart audio capture...');
      
      // Clean up current process
      if (this.captureProcess) {
        this.captureProcess.kill('SIGTERM');
        this.captureProcess = null;
      }

      // Re-detect audio system in case it changed
      await this.detectAudioSystem();
      this.startCapture();
      
      this.logger.info('Audio capture restarted successfully');
    } catch (error) {
      this.logger.error('Failed to restart audio capture:', error);
      this.emit('error', error);
    }
  }

  async listDevices() {
    const devices = [];

    try {
      if (this.audioSystem === 'pipewire') {
        const output = await this.execCommand('pw-cli', ['list-objects']);
        const lines = output.split('\n');
        let currentNode = null;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trim();
          
          // Look for Node objects with id
          if (trimmed.match(/id \d+, type PipeWire:Interface:Node/)) {
            // Reset for new node
            currentNode = {
              id: null,
              name: null,
              description: null,
              type: null,
              state: 'available'
            };
            
            const idMatch = trimmed.match(/id (\d+)/);
            if (idMatch) {
              currentNode.id = idMatch[1];
            }
          }
          
          // Parse properties for current node
          if (currentNode && trimmed.includes(' = ')) {
            if (trimmed.includes('media.class = "Audio/Source"')) {
              currentNode.type = 'source';
            } else if (trimmed.includes('node.name = "')) {
              const nameMatch = trimmed.match(/node\.name = "([^"]+)"/);
              if (nameMatch) {
                currentNode.name = nameMatch[1];
              }
            } else if (trimmed.includes('node.description = "')) {
              const descMatch = trimmed.match(/node\.description = "([^"]+)"/);
              if (descMatch) {
                currentNode.description = descMatch[1];
              }
            } else if (trimmed.includes('node.nick = "')) {
              const nickMatch = trimmed.match(/node\.nick = "([^"]+)"/);
              if (nickMatch && !currentNode.description) {
                currentNode.description = nickMatch[1];
              }
            }
          }
          
          // Check if we hit next node or end of current node properties
          const nextLine = lines[i + 1];
          const isEndOfNode = !nextLine || 
                             nextLine.match(/id \d+, type/) || 
                             (!nextLine.trim().startsWith('\t') && nextLine.trim() !== '');
          
          if (isEndOfNode && currentNode && currentNode.type === 'source' && currentNode.name) {
            // Skip monitor sources (capture audio output)
            if (!currentNode.name.includes('.monitor')) {
              devices.push({
                id: currentNode.name,
                name: currentNode.description || currentNode.name,
                state: currentNode.state
              });
            }
            currentNode = null;
          }
        }
      } else {
        // PulseAudio
        const output = await this.execCommand('pactl', ['list', 'sources', 'short']);
        const lines = output.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          const parts = line.split('\t');
          if (parts.length >= 4) {
            const [id, name, driver, format, state] = parts;
            // Skip monitor sources (they capture output, not input)
            if (name && !name.includes('.monitor')) {
              devices.push({ 
                id: name, 
                name: name.replace(/[._]/g, ' '), 
                state: state || 'available'
              });
            }
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to list audio devices:', error);
    }

    return devices;
  }

  execCommand(command, args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      let output = '';
      let error = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr.on('data', (data) => {
        error += data.toString();
      });

      proc.on('exit', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(error || `Command ${command} failed with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to execute ${command}: ${err.message}`));
      });
    });
  }

  startRecording() {
    if (!this.isCapturing) {
      throw new Error('Audio capture must be started before recording');
    }
    if (this.isRecording) {
      throw new Error('Recording session already in progress');
    }
    
    this.isRecording = true;
    this.sessionBuffer = [];
    this.logger.info('Recording session started');
    this.emit('recordingStarted');
  }

  stopRecording() {
    if (!this.isRecording) {
      throw new Error('No recording session in progress');
    }
    
    this.isRecording = false;
    const recordedAudio = new Float32Array(this.sessionBuffer);
    const duration = recordedAudio.length / this.config.audio.sampleRate;
    
    this.logger.info(`Recording session stopped: ${duration.toFixed(2)}s, ${recordedAudio.length} samples`);
    this.emit('recordingStopped', {
      audio: recordedAudio,
      duration: duration,
      sampleRate: this.config.audio.sampleRate
    });
    
    return recordedAudio;
  }

  getRecordingStatus() {
    return {
      isRecording: this.isRecording,
      duration: this.isRecording ? this.sessionBuffer.length / this.config.audio.sampleRate : 0,
      samples: this.sessionBuffer.length
    };
  }

  async getDefaultDevice() {
    try {
      if (this.audioSystem === 'pipewire') {
        // Try wpctl first (more reliable)
        try {
          const output = await this.execCommand('wpctl', ['status']);
          const lines = output.split('\n');
          let inSourcesSection = false;
          
          for (const line of lines) {
            if (line.includes('Sources:')) {
              inSourcesSection = true;
              continue;
            }
            if (inSourcesSection && line.includes('*')) {
              // Default source is marked with *
              const match = line.match(/\*\s*\d+\.\s*([^\s\[]+)/);
              if (match) {
                return match[1];
              }
            }
            if (inSourcesSection && line.includes('Sinks:')) {
              break; // End of sources section
            }
          }
        } catch (error) {
          // Fall back to pw-cli if wpctl fails
          const output = await this.execCommand('pw-cli', ['list-objects']);
          const lines = output.split('\n');
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes('type PipeWire:Interface:Node') && 
                lines[i + 10] && lines[i + 10].includes('media.class = "Audio/Source"')) {
              
              // Look for default property or commonly used source
              for (let j = i; j < i + 20 && j < lines.length; j++) {
                const propLine = lines[j].trim();
                if (propLine.includes('node.name = "') && !propLine.includes('.monitor')) {
                  const nameMatch = propLine.match(/node\.name = "([^"]+)"/);
                  if (nameMatch) {
                    return nameMatch[1];
                  }
                }
              }
            }
          }
        }
      } else {
        // Get default source from PulseAudio
        const output = await this.execCommand('pactl', ['info']);
        const lines = output.split('\n');
        
        for (const line of lines) {
          if (line.includes('Default Source:')) {
            return line.split(':')[1].trim();
          }
        }
      }
    } catch (error) {
      this.logger.debug('Failed to get default device:', error.message);
    }
    
    return null;
  }

  getStatus() {
    // Return synchronous status - don't resolve device asynchronously in tests
    return {
      isCapturing: this.isCapturing,
      isRecording: this.isRecording,
      audioSystem: this.audioSystem,
      sessionSamples: this.sessionBuffer.length,
      sessionDuration: this.sessionBuffer.length / this.config.audio.sampleRate,
      restartCount: this.restartCount,
      processId: this.captureProcess ? this.captureProcess.pid : null
    };
  }
  
  async getDetailedStatus() {
    const defaultDevice = this.config.audio.device === 'default' ? await this.getDefaultDevice() : null;
    
    return {
      ...this.getStatus(),
      configuredDevice: this.config.audio.device,
      actualDevice: this.config.audio.device === 'default' ? '@DEFAULT_SOURCE@' : this.config.audio.device,
      resolvedDevice: defaultDevice
    };
  }
}

module.exports = AudioCaptureService;