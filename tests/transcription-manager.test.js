const EventEmitter = require('events');
const TranscriptionManager = require('../src/services/transcription/transcription-manager');

// Mock the transcription services
jest.mock('../src/services/transcription/openai-transcription');
jest.mock('../src/services/transcription/local-transcription');

const OpenAITranscriptionService = require('../src/services/transcription/openai-transcription');
const LocalTranscriptionService = require('../src/services/transcription/local-transcription');

describe('TranscriptionManager', () => {
  let manager;
  let mockConfig;
  let mockOpenAIService;
  let mockLocalService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    mockConfig = {
      transcription: {
        provider: 'auto',
        openai: {
          apiKey: 'test-key'
        },
        local: {
          modelPath: '/path/to/model'
        }
      }
    };

    // Create mock instances
    mockOpenAIService = {
      enabled: true,
      transcribe: jest.fn(),
      checkHealth: jest.fn(),
      getMetrics: jest.fn().mockReturnValue({ enabled: true })
    };

    mockLocalService = {
      enabled: true,
      transcribe: jest.fn(),
      checkHealth: jest.fn(),
      getMetrics: jest.fn().mockReturnValue({ enabled: true })
    };

    // Mock constructors
    OpenAITranscriptionService.mockImplementation(() => mockOpenAIService);
    LocalTranscriptionService.mockImplementation(() => mockLocalService);

    manager = new TranscriptionManager(mockConfig);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize both transcription services', () => {
      expect(OpenAITranscriptionService).toHaveBeenCalledWith(mockConfig);
      expect(LocalTranscriptionService).toHaveBeenCalledWith(mockConfig);
    });

    it('should extend EventEmitter', () => {
      expect(manager).toBeInstanceOf(EventEmitter);
    });

    it('should set health check interval', () => {
      expect(manager.healthCheckInterval).toBe(60000);
    });

    it('should start health monitoring', () => {
      const checkHealthSpy = jest.spyOn(TranscriptionManager.prototype, 'checkHealth').mockImplementation(() => Promise.resolve());
      
      manager = new TranscriptionManager(mockConfig);
      
      expect(checkHealthSpy).toHaveBeenCalled();
      checkHealthSpy.mockRestore();
    });
  });

  describe('selectPrimaryService', () => {
    it('should select OpenAI when provider is "openai" and enabled', () => {
      mockConfig.transcription.provider = 'openai';
      manager = new TranscriptionManager(mockConfig);
      expect(manager.primaryService).toBe(mockOpenAIService);
    });

    it('should select local when provider is "local"', () => {
      mockConfig.transcription.provider = 'local';
      manager = new TranscriptionManager(mockConfig);
      expect(manager.primaryService).toBe(mockLocalService);
    });

    it('should select OpenAI in auto mode when OpenAI is enabled', () => {
      mockConfig.transcription.provider = 'auto';
      mockOpenAIService.enabled = true;
      manager = new TranscriptionManager(mockConfig);
      expect(manager.primaryService).toBe(mockOpenAIService);
    });

    it('should select local in auto mode when OpenAI is disabled', () => {
      mockConfig.transcription.provider = 'auto';
      mockOpenAIService.enabled = false;
      manager = new TranscriptionManager(mockConfig);
      expect(manager.primaryService).toBe(mockLocalService);
    });

    it('should default to local for unknown provider', () => {
      mockConfig.transcription.provider = 'unknown';
      manager = new TranscriptionManager(mockConfig);
      expect(manager.primaryService).toBe(mockLocalService);
    });
  });

  describe('transcribe', () => {
    it('should use primary service for transcription', async () => {
      const audioData = new Float32Array(16000);
      const mockResult = { text: 'Hello world' };
      
      mockOpenAIService.transcribe.mockResolvedValue(mockResult);
      
      const result = await manager.transcribe(audioData);
      
      expect(mockOpenAIService.transcribe).toHaveBeenCalledWith(audioData, {});
      expect(result).toEqual(mockResult);
    });

    it('should emit transcription event on success', async () => {
      const audioData = new Float32Array(16000);
      const mockResult = { text: 'Hello world' };
      let emittedEvent;
      
      manager.on('transcription', (event) => {
        emittedEvent = event;
      });
      
      mockOpenAIService.transcribe.mockResolvedValue(mockResult);
      
      await manager.transcribe(audioData);
      
      expect(emittedEvent).toMatchObject({
        text: 'Hello world',
        service: 'Object', // constructor.name of mock object
        duration: expect.any(Number)
      });
    });

    it('should fallback to local service when OpenAI fails', async () => {
      const audioData = new Float32Array(16000);
      const mockError = new Error('API error');
      const mockLocalResult = { text: 'Local transcription' };
      
      mockOpenAIService.transcribe.mockRejectedValue(mockError);
      mockLocalService.transcribe.mockResolvedValue(mockLocalResult);
      
      const result = await manager.transcribe(audioData);
      
      expect(result).toEqual(mockLocalResult);
      expect(mockLocalService.transcribe).toHaveBeenCalledWith(audioData, {});
    });

    it('should emit fallback event when using fallback service', async () => {
      const audioData = new Float32Array(16000);
      const mockError = new Error('API error');
      const mockLocalResult = { text: 'Local transcription' };
      let emittedEvent;
      
      manager.on('transcription', (event) => {
        emittedEvent = event;
      });
      
      mockOpenAIService.transcribe.mockRejectedValue(mockError);
      mockLocalService.transcribe.mockResolvedValue(mockLocalResult);
      
      await manager.transcribe(audioData);
      
      expect(emittedEvent.fallback).toBe(true);
    });

    it('should throw error when both services fail', async () => {
      const audioData = new Float32Array(16000);
      const mockPrimaryError = new Error('Primary failed');
      const mockFallbackError = new Error('Fallback failed');
      
      mockOpenAIService.transcribe.mockRejectedValue(mockPrimaryError);
      mockLocalService.transcribe.mockRejectedValue(mockFallbackError);
      
      await expect(manager.transcribe(audioData)).rejects.toThrow('Fallback failed');
    });

    it('should not attempt fallback when primary is local service', async () => {
      mockConfig.transcription.provider = 'local';
      manager = new TranscriptionManager(mockConfig);
      
      const audioData = new Float32Array(16000);
      const mockError = new Error('Local failed');
      
      mockLocalService.transcribe.mockRejectedValue(mockError);
      
      await expect(manager.transcribe(audioData)).rejects.toThrow('Local failed');
      expect(mockOpenAIService.transcribe).not.toHaveBeenCalled();
    });

    it('should pass options to transcription service', async () => {
      const audioData = new Float32Array(16000);
      const options = { prompt: 'Test prompt', responseFormat: 'text' };
      
      mockOpenAIService.transcribe.mockResolvedValue({ text: 'Test' });
      
      await manager.transcribe(audioData, options);
      
      expect(mockOpenAIService.transcribe).toHaveBeenCalledWith(audioData, options);
    });
  });

  describe('health monitoring', () => {
    it('should check health of both services', async () => {
      mockOpenAIService.checkHealth.mockResolvedValue({ healthy: true });
      mockLocalService.checkHealth.mockResolvedValue({ healthy: true });
      
      const health = await manager.checkHealth();
      
      expect(mockOpenAIService.checkHealth).toHaveBeenCalled();
      expect(mockLocalService.checkHealth).toHaveBeenCalled();
      expect(health).toMatchObject({
        openai: { healthy: true },
        local: { healthy: true },
        timestamp: expect.any(Number)
      });
    });

    it('should emit health event', async () => {
      let emittedHealth;
      
      manager.on('health', (health) => {
        emittedHealth = health;
      });
      
      mockOpenAIService.checkHealth.mockResolvedValue({ healthy: true });
      mockLocalService.checkHealth.mockResolvedValue({ healthy: true });
      
      await manager.checkHealth();
      
      expect(emittedHealth).toMatchObject({
        openai: { healthy: true },
        local: { healthy: true }
      });
    });

    it('should switch to local in auto mode when OpenAI becomes unhealthy', async () => {
      mockConfig.transcription.provider = 'auto';
      manager = new TranscriptionManager(mockConfig);
      
      // Initially OpenAI is primary
      expect(manager.primaryService).toBe(mockOpenAIService);
      
      // OpenAI becomes unhealthy
      mockOpenAIService.checkHealth.mockResolvedValue({ healthy: false });
      mockLocalService.checkHealth.mockResolvedValue({ healthy: true });
      
      await manager.checkHealth();
      
      expect(manager.primaryService).toBe(mockLocalService);
    });

    it('should switch back to OpenAI when it becomes healthy again', async () => {
      mockConfig.transcription.provider = 'auto';
      manager = new TranscriptionManager(mockConfig);
      
      // Make OpenAI unhealthy first
      mockOpenAIService.checkHealth.mockResolvedValue({ healthy: false });
      mockLocalService.checkHealth.mockResolvedValue({ healthy: true });
      await manager.checkHealth();
      
      expect(manager.primaryService).toBe(mockLocalService);
      
      // OpenAI becomes healthy again
      mockOpenAIService.checkHealth.mockResolvedValue({ healthy: true });
      
      await manager.checkHealth();
      
      expect(manager.primaryService).toBe(mockOpenAIService);
    });

    it('should not switch services when not in auto mode', async () => {
      mockConfig.transcription.provider = 'openai';
      manager = new TranscriptionManager(mockConfig);
      
      // OpenAI becomes unhealthy
      mockOpenAIService.checkHealth.mockResolvedValue({ healthy: false });
      mockLocalService.checkHealth.mockResolvedValue({ healthy: true });
      
      await manager.checkHealth();
      
      // Should still use OpenAI as primary
      expect(manager.primaryService).toBe(mockOpenAIService);
    });

    it('should run periodic health checks', () => {
      const checkHealthSpy = jest.spyOn(manager, 'checkHealth').mockImplementation(() => Promise.resolve());
      
      // Clear initial call count
      checkHealthSpy.mockClear();
      
      // Fast forward time
      jest.advanceTimersByTime(60000);
      
      expect(checkHealthSpy).toHaveBeenCalledTimes(1); // Once after interval
    });
  });

  describe('getMetrics', () => {
    it('should return metrics from all services', () => {
      // Reset manager to avoid health check from constructor
      jest.clearAllMocks();
      
      // Create new manager without triggering health check
      const checkHealthSpy = jest.spyOn(TranscriptionManager.prototype, 'checkHealth').mockImplementation(() => Promise.resolve());
      
      manager = new TranscriptionManager(mockConfig);
      
      mockOpenAIService.getMetrics.mockReturnValue({
        queueLength: 2,
        processing: true,
        enabled: true
      });
      
      mockLocalService.getMetrics.mockReturnValue({
        enabled: true,
        modelLoaded: true
      });
      
      const metrics = manager.getMetrics();
      
      expect(metrics).toEqual({
        primaryService: 'Object',
        openai: {
          queueLength: 2,
          processing: true,
          enabled: true
        },
        local: {
          enabled: true,
          modelLoaded: true
        },
        lastHealthCheck: null
      });
      
      checkHealthSpy.mockRestore();
    });

    it('should include last health check in metrics', async () => {
      mockOpenAIService.checkHealth.mockResolvedValue({ healthy: true });
      mockLocalService.checkHealth.mockResolvedValue({ healthy: true });
      
      await manager.checkHealth();
      
      const metrics = manager.getMetrics();
      
      expect(metrics.lastHealthCheck).toMatchObject({
        openai: { healthy: true },
        local: { healthy: true },
        timestamp: expect.any(Number)
      });
    });
  });
});