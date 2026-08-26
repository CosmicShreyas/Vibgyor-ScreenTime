import {
  isRetryableError,
  retryDatabaseOperation,
  withRetry,
  RetryConfig,
} from '../database-retry';
import { logger } from '../logger';

// Mock logger
jest.mock('../logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Database Retry Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isRetryableError', () => {
    it('should identify retryable PostgreSQL error codes', () => {
      const retryableCodes = [
        '08000', // connection_exception
        '08003', // connection_does_not_exist
        '08006', // connection_failure
        '08001', // sqlclient_unable_to_establish_sqlconnection
        '08004', // sqlserver_rejected_establishment_of_sqlconnection
        '57P03', // cannot_connect_now
        '53300', // too_many_connections
        '40001', // serialization_failure
        '40P01', // deadlock_detected
      ];

      retryableCodes.forEach((code) => {
        const error = { code };
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should identify non-retryable PostgreSQL error codes', () => {
      const nonRetryableCodes = [
        '23505', // unique_violation
        '23503', // foreign_key_violation
        '42P01', // undefined_table
        '42703', // undefined_column
      ];

      nonRetryableCodes.forEach((code) => {
        const error = { code };
        expect(isRetryableError(error)).toBe(false);
      });
    });

    it('should identify timeout errors by message', () => {
      const timeoutMessages = [
        'Connection timeout',
        'Query timeout exceeded',
        'ETIMEDOUT',
        'Operation timed out',
      ];

      timeoutMessages.forEach((message) => {
        const error = { message };
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should identify connection refused errors', () => {
      const error = { message: 'ECONNREFUSED: Connection refused' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify host not found errors', () => {
      const error = { message: 'ENOTFOUND: Host not found' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for null or undefined errors', () => {
      expect(isRetryableError(null)).toBe(false);
      expect(isRetryableError(undefined)).toBe(false);
    });

    it('should return false for errors without code or message', () => {
      const error = {};
      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe('retryDatabaseOperation', () => {
    const config: RetryConfig = {
      maxRetries: 3,
      initialDelayMs: 10,
      maxDelayMs: 100,
      backoffMultiplier: 2,
    };

    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await retryDatabaseOperation(operation, config);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should retry on retryable error and succeed', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce({ code: '08006', message: 'connection_failure' })
        .mockResolvedValueOnce('success');

      const result = await retryDatabaseOperation(operation, config);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        'Database operation failed, retrying...',
        expect.objectContaining({
          attempt: 1,
          maxRetries: 3,
          errorCode: '08006',
        })
      );
    });

    it('should retry multiple times before succeeding', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce({ code: '08006' })
        .mockRejectedValueOnce({ code: '08006' })
        .mockResolvedValueOnce('success');

      const result = await retryDatabaseOperation(operation, config);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries with retryable error', async () => {
      const error = { code: '08006', message: 'connection_failure' };
      const operation = jest.fn().mockRejectedValue(error);

      await expect(retryDatabaseOperation(operation, config)).rejects.toEqual(
        error
      );

      expect(operation).toHaveBeenCalledTimes(4); // Initial + 3 retries
      expect(logger.warn).toHaveBeenCalledTimes(3);
      expect(logger.error).toHaveBeenCalledWith(
        'Database operation failed after max retries',
        expect.objectContaining({
          attempts: 4,
          errorCode: '08006',
        })
      );
    });

    it('should not retry on non-retryable error', async () => {
      const error = { code: '23505', message: 'unique_violation' };
      const operation = jest.fn().mockRejectedValue(error);

      await expect(retryDatabaseOperation(operation, config)).rejects.toEqual(
        error
      );

      expect(operation).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should use exponential backoff delays', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce({ code: '08006' })
        .mockRejectedValueOnce({ code: '08006' })
        .mockRejectedValueOnce({ code: '08006' })
        .mockResolvedValueOnce('success');

      const startTime = Date.now();
      await retryDatabaseOperation(operation, config);
      const duration = Date.now() - startTime;

      // Expected delays: 10ms, 20ms, 40ms = 70ms minimum
      expect(duration).toBeGreaterThanOrEqual(60);
      expect(logger.warn).toHaveBeenCalledTimes(3);

      // Verify increasing delays
      const calls = (logger.warn as jest.Mock).mock.calls;
      expect(calls[0][1].delayMs).toBe(10);
      expect(calls[1][1].delayMs).toBe(20);
      expect(calls[2][1].delayMs).toBe(40);
    });

    it('should cap delay at maxDelayMs', async () => {
      const shortConfig: RetryConfig = {
        maxRetries: 5,
        initialDelayMs: 50,
        maxDelayMs: 100,
        backoffMultiplier: 2,
      };

      const operation = jest
        .fn()
        .mockRejectedValueOnce({ code: '08006' })
        .mockRejectedValueOnce({ code: '08006' })
        .mockRejectedValueOnce({ code: '08006' })
        .mockRejectedValueOnce({ code: '08006' })
        .mockResolvedValueOnce('success');

      await retryDatabaseOperation(operation, shortConfig);

      const calls = (logger.warn as jest.Mock).mock.calls;
      // Delays: 50, 100, 100 (capped), 100 (capped)
      expect(calls[0][1].delayMs).toBe(50);
      expect(calls[1][1].delayMs).toBe(100);
      expect(calls[2][1].delayMs).toBe(100);
      expect(calls[3][1].delayMs).toBe(100);
    });

    it('should handle errors without error codes', async () => {
      const error = new Error('Generic error');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(retryDatabaseOperation(operation, config)).rejects.toEqual(
        error
      );

      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('withRetry', () => {
    it('should use default config when not provided', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should merge partial config with defaults', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce({ code: '08006' })
        .mockResolvedValueOnce('success');

      const result = await withRetry(operation, { maxRetries: 5 });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry with custom config', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce({ code: '08006' })
        .mockRejectedValueOnce({ code: '08006' })
        .mockResolvedValueOnce('success');

      const result = await withRetry(operation, {
        maxRetries: 2,
        initialDelayMs: 5,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle operation that throws synchronously', async () => {
      const error = new Error('Sync error');
      const operation = jest.fn().mockImplementation(() => {
        throw error;
      });

      await expect(
        retryDatabaseOperation(operation, {
          maxRetries: 1,
          initialDelayMs: 10,
          maxDelayMs: 100,
          backoffMultiplier: 2,
        })
      ).rejects.toEqual(error);
    });

    it('should handle zero max retries', async () => {
      const error = { code: '08006' };
      const operation = jest.fn().mockRejectedValue(error);

      await expect(
        retryDatabaseOperation(operation, {
          maxRetries: 0,
          initialDelayMs: 10,
          maxDelayMs: 100,
          backoffMultiplier: 2,
        })
      ).rejects.toEqual(error);

      expect(operation).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });
});
