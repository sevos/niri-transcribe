const AudioCaptureService = require('../src/services/audio-capture');

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
    channels: 1,
    device: 'default'
  }
};

describe('AudioCaptureService', () => {
  let audioCapture;

  beforeEach(() => {
    audioCapture = new AudioCaptureService(mockConfig, mockLogger);
    // Mock the audio system detection
    audioCapture.audioSystem = 'pipewire';
  });

  describe('Device Parsing', () => {
    test('should parse PipeWire audio sources correctly', async () => {
      const mockPipeWireOutput = `id 0, type PipeWire:Interface:Core/4
		object.serial = "0"
		core.name = "pipewire-0"
	id 43, type PipeWire:Interface:Node/3
		object.serial = "60"
		object.path = "alsa:acp:Microphone:4:capture"
		factory.id = "19"
		client.id = "47"
		device.id = "50"
		priority.session = "2009"
		priority.driver = "2009"
		node.description = "Yeti Stereo Microphone Analog Stereo"
		node.name = "alsa_input.usb-Blue_Microphones_Yeti_Stereo_Microphone_797_2019_11_26_88648-00.analog-stereo"
		node.nick = "Yeti Stereo Microphone"
		media.class = "Audio/Source"
	id 44, type PipeWire:Interface:Node/3
		object.serial = "61"
		object.path = "alsa:acp:Camera:0:capture"
		factory.id = "19"
		client.id = "47"
		device.id = "49"
		priority.session = "2009"
		priority.driver = "2009"
		node.description = "USB 2.0 Camera Analog Stereo"
		node.name = "alsa_input.usb-Sonix_Technology_Co.__Ltd._USB_2.0_Camera_SN0001-02.analog-stereo"
		node.nick = "USB 2.0 Camera"
		media.class = "Audio/Source"
	id 45, type PipeWire:Interface:Node/3
		object.serial = "62"
		object.path = "alsa:acp:Microphone:4:playback"
		factory.id = "19"
		client.id = "47"
		device.id = "50"
		priority.session = "1009"
		priority.driver = "1009"
		node.description = "Yeti Stereo Microphone Analog Stereo"
		node.name = "alsa_output.usb-Blue_Microphones_Yeti_Stereo_Microphone_797_2019_11_26_88648-00.analog-stereo"
		node.nick = "Yeti Stereo Microphone"
		media.class = "Audio/Sink"
	id 60, type PipeWire:Interface:Node/3
		object.serial = "69"
		object.path = "alsa:acp:ALC897:0:capture"
		factory.id = "19"
		client.id = "47"
		device.id = "52"
		priority.session = "2009"
		priority.driver = "2009"
		node.description = "Wbudowany dźwięk Analog Stereo"
		node.name = "alsa_input.pci-0000_00_1f.3.analog-stereo"
		node.nick = "ALC897 Analog"
		media.class = "Audio/Source"`;

      // Mock execCommand to return our test data
      audioCapture.execCommand = jest.fn().mockResolvedValue(mockPipeWireOutput);

      const devices = await audioCapture.listDevices();

      expect(devices).toHaveLength(3);
      
      expect(devices[0]).toEqual({
        id: 'alsa_input.usb-Blue_Microphones_Yeti_Stereo_Microphone_797_2019_11_26_88648-00.analog-stereo',
        name: 'Yeti Stereo Microphone Analog Stereo',
        state: 'available'
      });

      expect(devices[1]).toEqual({
        id: 'alsa_input.usb-Sonix_Technology_Co.__Ltd._USB_2.0_Camera_SN0001-02.analog-stereo',
        name: 'USB 2.0 Camera Analog Stereo',
        state: 'available'
      });

      expect(devices[2]).toEqual({
        id: 'alsa_input.pci-0000_00_1f.3.analog-stereo',
        name: 'Wbudowany dźwięk Analog Stereo',
        state: 'available'
      });
    });

    test('should skip Audio/Sink devices (outputs)', async () => {
      const mockPipeWireOutput = `id 45, type PipeWire:Interface:Node/3
		object.serial = "62"
		node.description = "Speaker Output"
		node.name = "alsa_output.speaker"
		media.class = "Audio/Sink"
	id 46, type PipeWire:Interface:Node/3
		object.serial = "63"
		node.description = "Microphone Input"
		node.name = "alsa_input.microphone"
		media.class = "Audio/Source"`;

      audioCapture.execCommand = jest.fn().mockResolvedValue(mockPipeWireOutput);

      const devices = await audioCapture.listDevices();

      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('Microphone Input');
    });

    test('should skip monitor sources', async () => {
      const mockPipeWireOutput = `id 47, type PipeWire:Interface:Node/3
		object.serial = "64"
		node.description = "Monitor of Speaker"
		node.name = "alsa_output.speaker.monitor"
		media.class = "Audio/Source"
	id 48, type PipeWire:Interface:Node/3
		object.serial = "65"
		node.description = "Real Microphone"
		node.name = "alsa_input.microphone"
		media.class = "Audio/Source"`;

      audioCapture.execCommand = jest.fn().mockResolvedValue(mockPipeWireOutput);

      const devices = await audioCapture.listDevices();

      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('Real Microphone');
      expect(devices[0].id).not.toContain('.monitor');
    });

    test('should use node.nick as fallback for description', async () => {
      const mockPipeWireOutput = `id 49, type PipeWire:Interface:Node/3
		object.serial = "66"
		node.name = "alsa_input.test"
		node.nick = "Test Microphone"
		media.class = "Audio/Source"`;

      audioCapture.execCommand = jest.fn().mockResolvedValue(mockPipeWireOutput);

      const devices = await audioCapture.listDevices();

      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('Test Microphone');
    });

    test('should handle PulseAudio device listing', async () => {
      audioCapture.audioSystem = 'pulseaudio';
      
      const mockPulseAudioOutput = `0\talsa_input.usb-Blue_Microphones_Yeti-00.analog-stereo\tmodule-alsa-card.c\ts16le 2ch 44100Hz\tSUSPENDED
1\talsa_input.pci-0000_00_1f.3.analog-stereo\tmodule-alsa-card.c\ts16le 2ch 44100Hz\tIDLE
2\talsa_output.pci-0000_00_1f.3.analog-stereo.monitor\tmodule-alsa-card.c\ts16le 2ch 44100Hz\tSUSPENDED`;

      audioCapture.execCommand = jest.fn().mockResolvedValue(mockPulseAudioOutput);

      const devices = await audioCapture.listDevices();

      expect(devices).toHaveLength(2);
      expect(devices[0].id).toBe('alsa_input.usb-Blue_Microphones_Yeti-00.analog-stereo');
      expect(devices[1].id).toBe('alsa_input.pci-0000_00_1f.3.analog-stereo');
      
      // Should not include monitor source
      expect(devices.find(d => d.id.includes('.monitor'))).toBeUndefined();
    });

    test('should handle command execution errors gracefully', async () => {
      audioCapture.execCommand = jest.fn().mockRejectedValue(new Error('Command failed'));

      const devices = await audioCapture.listDevices();

      expect(devices).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to list audio devices:', expect.any(Error));
    });

    test('should handle empty PipeWire output', async () => {
      audioCapture.execCommand = jest.fn().mockResolvedValue('');

      const devices = await audioCapture.listDevices();

      expect(devices).toEqual([]);
    });

    test('should handle malformed PipeWire output', async () => {
      const malformedOutput = `some random text
not a pipewire output
id missing, type broken`;

      audioCapture.execCommand = jest.fn().mockResolvedValue(malformedOutput);

      const devices = await audioCapture.listDevices();

      expect(devices).toEqual([]);
    });

    test('should handle nodes without required properties', async () => {
      const incompleteOutput = `id 50, type PipeWire:Interface:Node/3
		object.serial = "67"
		media.class = "Audio/Source"
	id 51, type PipeWire:Interface:Node/3
		object.serial = "68"
		node.name = "alsa_input.incomplete"
		media.class = "Audio/Sink"`;

      audioCapture.execCommand = jest.fn().mockResolvedValue(incompleteOutput);

      const devices = await audioCapture.listDevices();

      expect(devices).toEqual([]);
    });
  });

  describe('Audio Format Processing', () => {
    test('should convert Int16 PCM to Float32 correctly', () => {
      const testData = Buffer.from([
        0x00, 0x00,  // 0
        0xFF, 0x7F,  // 32767 (max positive)
        0x00, 0x80,  // -32768 (max negative)
        0x00, 0x40   // 16384 (quarter scale)
      ]);

      audioCapture.processAudioData(testData);

      // Check that audio buffer was updated
      expect(audioCapture.audioBuffer.length).toBeGreaterThan(0);
      
      // First sample should be 0
      expect(audioCapture.audioBuffer[0]).toBeCloseTo(0, 5);
      
      // Second sample should be close to 1.0
      expect(audioCapture.audioBuffer[1]).toBeCloseTo(1.0, 3);
      
      // Third sample should be close to -1.0
      expect(audioCapture.audioBuffer[2]).toBeCloseTo(-1.0, 3);
      
      // Fourth sample should be close to 0.5
      expect(audioCapture.audioBuffer[3]).toBeCloseTo(0.5, 3);
    });

    test('should maintain circular buffer size limit', () => {
      const bufferSize = audioCapture.bufferSize;
      const testData = Buffer.alloc(4096, 0xFF); // Large data chunk
      
      // Fill buffer beyond capacity
      for (let i = 0; i < 10; i++) {
        audioCapture.processAudioData(testData);
      }

      expect(audioCapture.audioBuffer.length).toBeLessThanOrEqual(bufferSize);
    });
  });

  describe('Device Selection', () => {
    test('should build correct PipeWire command arguments', () => {
      audioCapture.audioSystem = 'pipewire';
      
      const args = audioCapture.buildCaptureArgs();
      
      expect(args.command).toBe('pw-record');
      expect(args.args).toEqual([
        '--format', 's16',
        '--rate', '16000',
        '--channels', '1',
        '--target', '@DEFAULT_SOURCE@',
        '-'
      ]);
    });

    test('should build correct PulseAudio command arguments', () => {
      audioCapture.audioSystem = 'pulseaudio';
      
      const args = audioCapture.buildCaptureArgs();
      
      expect(args.command).toBe('parecord');
      expect(args.args).toEqual([
        '--format=s16le',
        '--rate=16000',
        '--channels=1',
        '--raw',
        '--device=@DEFAULT_SOURCE@',
        '-'
      ]);
    });

    test('should handle custom device selection', () => {
      const customConfig = {
        audio: {
          sampleRate: 16000,
          channels: 1,
          device: 'alsa_input.usb-microphone'
        }
      };
      
      const customAudioCapture = new AudioCaptureService(customConfig, mockLogger);
      customAudioCapture.audioSystem = 'pipewire';
      
      const args = customAudioCapture.buildCaptureArgs();
      
      expect(args.args).toContain('alsa_input.usb-microphone');
    });
  });

  describe('Status Reporting', () => {
    test('should report correct status when not capturing', () => {
      const status = audioCapture.getStatus();
      
      expect(status).toEqual({
        isCapturing: false,
        audioSystem: 'pipewire',
        bufferLength: 0,
        bufferDuration: 0,
        restartCount: 0,
        processId: null
      });
    });

    test('should calculate buffer duration correctly', () => {
      // Add 16000 samples (1 second at 16kHz)
      audioCapture.audioBuffer = new Array(16000).fill(0);
      
      const status = audioCapture.getStatus();
      
      expect(status.bufferLength).toBe(16000);
      expect(status.bufferDuration).toBe(1);
    });
  });

  describe('Buffer Management', () => {
    test('should return correct buffered audio for duration', () => {
      // Fill buffer with test pattern
      audioCapture.audioBuffer = [1, 2, 3, 4, 5, 6, 7, 8];
      
      const audio = audioCapture.getBufferedAudio(0.0005); // 0.5ms at 16kHz = 8 samples
      
      expect(audio).toBeInstanceOf(Float32Array);
      expect(audio.length).toBe(8);
      expect(Array.from(audio)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    test('should return partial buffer when requested duration exceeds available', () => {
      audioCapture.audioBuffer = [1, 2, 3, 4];
      
      const audio = audioCapture.getBufferedAudio(1); // 1 second = 16000 samples
      
      expect(audio.length).toBe(4);
      expect(Array.from(audio)).toEqual([1, 2, 3, 4]);
    });
  });
});