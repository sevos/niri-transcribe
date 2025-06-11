const OpenAITranscriptionService = require('../src/services/transcription/openai-transcription');

// Mock OpenAI
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => {
    return {
      audio: {
        transcriptions: {
          create: jest.fn()
        }
      }
    };
  });
});

const OpenAI = require('openai');

describe('OpenAITranscriptionService', () => {
  let service;
  let mockConfig;
  let mockOpenAIInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    OpenAI.mockClear();
    
    mockConfig = {
      transcription: {
        openai: {
          apiKey: 'test-api-key',
          model: 'whisper-1',
          language: 'auto',
          temperature: 0.5,
          sampleRate: 16000
        }
      }
    };

    mockOpenAIInstance = new OpenAI();
    
    service = new OpenAITranscriptionService(mockConfig);
  });

  describe('constructor', () => {
    it('should initialize with enabled state when API key is provided', () => {
      expect(service.enabled).toBe(true);
      expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
    });

    it('should initialize with disabled state when API key is not provided', () => {
      OpenAI.mockClear(); // Clear any previous calls
      mockConfig.transcription.openai.apiKey = '';
      service = new OpenAITranscriptionService(mockConfig);
      
      expect(service.enabled).toBe(false);
      expect(OpenAI).not.toHaveBeenCalled();
    });

    it('should set rate limiting parameters', () => {
      expect(service.minRequestInterval).toBe(100);
      expect(service.requestQueue).toEqual([]);
      expect(service.processing).toBe(false);
    });

    it('should set retry configuration', () => {
      expect(service.maxRetries).toBe(3);
      expect(service.retryDelay).toBe(1000);
      expect(service.retryBackoff).toBe(2);
    });
  });

  describe('transcribe', () => {
    it('should throw error when service is not enabled', async () => {
      mockConfig.transcription.openai.apiKey = '';
      service = new OpenAITranscriptionService(mockConfig);
      
      const audioData = new Float32Array(16000);
      
      await expect(service.transcribe(audioData)).rejects.toThrow(
        'OpenAI transcription service is not configured'
      );
    });

    it('should queue request and process it', async () => {
      const audioData = new Float32Array(16000);
      const mockResponse = { text: 'Hello world' };
      
      service.client.audio.transcriptions.create.mockResolvedValue(mockResponse);
      
      const result = await service.transcribe(audioData);
      
      expect(result).toEqual({
        text: 'Hello world',
        confidence: 1.0,
        language: 'unknown',
        segments: [],
        duration: undefined
      });
    });

    it('should handle multiple concurrent requests with rate limiting', async () => {
      const audioData1 = new Float32Array(16000);
      const audioData2 = new Float32Array(16000);
      
      service.client.audio.transcriptions.create
        .mockResolvedValueOnce({ text: 'First' })
        .mockResolvedValueOnce({ text: 'Second' });
      
      const start = Date.now();
      const [result1, result2] = await Promise.all([
        service.transcribe(audioData1),
        service.transcribe(audioData2)
      ]);
      const duration = Date.now() - start;
      
      expect(result1.text).toBe('First');
      expect(result2.text).toBe('Second');
      expect(duration).toBeGreaterThanOrEqual(100); // Rate limiting delay
    });
  });

  describe('callWhisperAPI', () => {
    it('should call OpenAI API with correct parameters and auto language detection', async () => {
      const wavBuffer = Buffer.from('fake-wav-data');
      const options = { prompt: 'Test prompt' };
      
      service.client.audio.transcriptions.create.mockResolvedValue({ text: 'Test' });
      
      await service.callWhisperAPI(wavBuffer, options);
      
      const callArgs = service.client.audio.transcriptions.create.mock.calls[0][0];
      expect(callArgs.model).toBe('whisper-1');
      expect(callArgs.language).toBeUndefined(); // Should not set language for auto-detection
      expect(callArgs.temperature).toBe(0.5);
      expect(callArgs.prompt).toBe('Test prompt');
      expect(callArgs.response_format).toBe('verbose_json'); // Changed to verbose_json for language detection
    });

    it('should set specific language when not auto', async () => {
      service.config.language = 'pl'; // Polish
      const wavBuffer = Buffer.from('fake-wav-data');
      
      service.client.audio.transcriptions.create.mockResolvedValue({ text: 'Test' });
      
      await service.callWhisperAPI(wavBuffer, {});
      
      const callArgs = service.client.audio.transcriptions.create.mock.calls[0][0];
      expect(callArgs.language).toBe('pl');
    });

    it('should not set language parameter when language is auto', async () => {
      service.config.language = 'auto';
      const wavBuffer = Buffer.from('fake-wav-data');
      
      service.client.audio.transcriptions.create.mockResolvedValue({ text: 'Test' });
      
      await service.callWhisperAPI(wavBuffer, {});
      
      const callArgs = service.client.audio.transcriptions.create.mock.calls[0][0];
      expect(callArgs.language).toBeUndefined();
    });

    it('should use custom response format when specified', async () => {
      const wavBuffer = Buffer.from('fake-wav-data');
      const options = { responseFormat: 'text' };
      
      service.client.audio.transcriptions.create.mockResolvedValue('Plain text');
      
      await service.callWhisperAPI(wavBuffer, options);
      
      const callArgs = service.client.audio.transcriptions.create.mock.calls[0][0];
      expect(callArgs.response_format).toBe('text');
    });
  });

  describe('retry logic', () => {
    it('should retry on retryable errors', async () => {
      const audioData = new Float32Array(16000);
      const error = new Error('Network error');
      error.code = 'ECONNRESET';
      
      service.client.audio.transcriptions.create
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ text: 'Success after retries' });
      
      const result = await service.transcribe(audioData);
      
      expect(result.text).toBe('Success after retries');
      expect(service.client.audio.transcriptions.create).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const audioData = new Float32Array(16000);
      const error = new Error('Authentication failed');
      error.status = 401;
      
      service.client.audio.transcriptions.create.mockRejectedValue(error);
      
      await expect(service.transcribe(audioData)).rejects.toThrow('Authentication failed');
      expect(service.client.audio.transcriptions.create).toHaveBeenCalledTimes(1);
    });

    it('should apply exponential backoff between retries', async () => {
      const audioData = new Float32Array(16000);
      const error = new Error('Server error');
      error.status = 500;
      
      service.client.audio.transcriptions.create
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ text: 'Success' });
      
      const start = Date.now();
      await service.transcribe(audioData);
      const duration = Date.now() - start;
      
      // First retry: 1000ms, Second retry: 2000ms
      expect(duration).toBeGreaterThanOrEqual(3000);
    });
  });

  describe('isRetryableError', () => {
    it('should identify network errors as retryable', () => {
      const errors = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'];
      
      errors.forEach(code => {
        const error = new Error('Network error');
        error.code = code;
        expect(service.isRetryableError(error)).toBe(true);
      });
    });

    it('should identify server errors as retryable', () => {
      const statuses = [429, 500, 502, 503, 504];
      
      statuses.forEach(status => {
        const error = new Error('Server error');
        error.status = status;
        expect(service.isRetryableError(error)).toBe(true);
      });
    });

    it('should identify client errors as non-retryable', () => {
      const statuses = [400, 401, 403, 404];
      
      statuses.forEach(status => {
        const error = new Error('Client error');
        error.status = status;
        expect(service.isRetryableError(error)).toBe(false);
      });
    });
  });

  describe('parseResponse', () => {
    it('should parse string response with unknown language marker', () => {
      const response = 'Plain text response';
      const parsed = service.parseResponse(response);
      
      expect(parsed).toEqual({
        text: 'Plain text response',
        confidence: 1.0,
        language: 'unknown'
      });
    });

    it('should parse JSON response with detected language from API', () => {
      const response = {
        text: 'Dzień dobry',
        language: 'polish',
        segments: [{ start: 0, end: 1, text: 'Dzień' }],
        duration: 1.5
      };
      
      const parsed = service.parseResponse(response);
      
      expect(parsed).toEqual({
        text: 'Dzień dobry',
        confidence: 1.0,
        language: 'polish',
        segments: [{ start: 0, end: 1, text: 'Dzień' }],
        duration: 1.5
      });
    });

    it('should handle response without language detection', () => {
      const response = {
        text: 'Hello world',
        segments: [],
        duration: 1.0
      };
      
      const parsed = service.parseResponse(response);
      
      expect(parsed).toEqual({
        text: 'Hello world',
        confidence: 1.0,
        language: 'unknown',
        segments: [],
        duration: 1.0
      });
    });

    it('should handle empty response', () => {
      const response = {};
      const parsed = service.parseResponse(response);
      
      expect(parsed).toEqual({
        text: '',
        confidence: 1.0,
        language: 'unknown',
        segments: [],
        duration: undefined
      });
    });
  });

  describe('checkHealth', () => {
    it('should return unhealthy when service is disabled', async () => {
      mockConfig.transcription.openai.apiKey = '';
      service = new OpenAITranscriptionService(mockConfig);
      
      const health = await service.checkHealth();
      
      expect(health).toEqual({
        healthy: false,
        reason: 'API key not configured'
      });
    });

    it('should return healthy when API is accessible', async () => {
      service.client.audio.transcriptions.create.mockResolvedValue('');
      
      const health = await service.checkHealth();
      
      expect(health).toEqual({ healthy: true });
    });

    it('should return unhealthy with error details when API fails', async () => {
      const error = new Error('API connection failed');
      service.client.audio.transcriptions.create.mockRejectedValue(error);
      
      const health = await service.checkHealth();
      
      expect(health).toEqual({
        healthy: false,
        reason: 'API connection failed',
        error: error
      });
    });
  });

  describe('getMetrics', () => {
    it('should return current service metrics', () => {
      const metrics = service.getMetrics();
      
      expect(metrics).toEqual({
        queueLength: 0,
        processing: false,
        enabled: true
      });
    });

    it('should reflect queue state in metrics', async () => {
      // Mock the API to resolve successfully
      service.client.audio.transcriptions.create.mockResolvedValue({ text: 'Test' });
      
      // Add multiple requests to queue
      const promises = [
        service.transcribe(new Float32Array(16000)),
        service.transcribe(new Float32Array(16000)),
        service.transcribe(new Float32Array(16000))
      ];
      
      // Check metrics while processing
      const metricsWhileProcessing = service.getMetrics();
      expect(metricsWhileProcessing.processing).toBe(true);
      
      // Wait for all requests to complete
      await Promise.all(promises);
      
      const metricsAfter = service.getMetrics();
      expect(metricsAfter.queueLength).toBe(0);
      expect(metricsAfter.processing).toBe(false);
    });
  });
});