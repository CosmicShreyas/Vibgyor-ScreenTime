import { Request, Response, NextFunction } from 'express';
import { globalErrorHandler, notFoundHandler, asyncHandler } from '../error.middleware';
import { logger } from '../../utils/logger';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('Error Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      path: '/test',
      method: 'GET',
      ip: '127.0.0.1',
      body: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('globalErrorHandler', () => {
    it('should log error with stack trace and return 500 response', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.ts:1:1';

      globalErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Verify error was logged with details
      expect(logger.error).toHaveBeenCalledWith('Unhandled error:', {
        message: 'Test error',
        stack: error.stack,
        path: '/test',
        method: 'GET',
        ip: '127.0.0.1',
        body: {},
      });

      // Verify 500 response
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: undefined,
      });
    });

    it('should include error message in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Development error');

      globalErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'Development error',
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle errors without stack traces', () => {
      const error = new Error('Simple error');
      delete error.stack;

      globalErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(logger.error).toHaveBeenCalledWith('Unhandled error:', {
        message: 'Simple error',
        stack: undefined,
        path: '/test',
        method: 'GET',
        ip: '127.0.0.1',
        body: {},
      });
    });

    it('should log request body for debugging', () => {
      mockRequest.body = { employee_name: 'John Doe', data: 'test' };
      const error = new Error('Test error');

      globalErrorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(logger.error).toHaveBeenCalledWith('Unhandled error:', {
        message: 'Test error',
        stack: error.stack,
        path: '/test',
        method: 'GET',
        ip: '127.0.0.1',
        body: { employee_name: 'John Doe', data: 'test' },
      });
    });
  });

  describe('notFoundHandler', () => {
    it('should log warning and return 404 response', () => {
      notFoundHandler(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Verify warning was logged
      expect(logger.warn).toHaveBeenCalledWith('Route not found:', {
        path: '/test',
        method: 'GET',
        ip: '127.0.0.1',
      });

      // Verify 404 response
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Not found',
        message: 'Route GET /test not found',
      });
    });

    it('should handle different HTTP methods', () => {
      const postRequest = {
        ...mockRequest,
        method: 'POST',
        path: '/api/unknown',
      };

      notFoundHandler(
        postRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Not found',
        message: 'Route POST /api/unknown not found',
      });
    });
  });

  describe('asyncHandler', () => {
    it('should handle successful async operations', async () => {
      const asyncFn = jest.fn().mockResolvedValue('success');
      const wrappedFn = asyncHandler(asyncFn);

      await wrappedFn(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(asyncFn).toHaveBeenCalledWith(
        mockRequest,
        mockResponse,
        mockNext
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should catch async errors and pass to next', async () => {
      const error = new Error('Async error');
      const asyncFn = jest.fn().mockRejectedValue(error);
      const wrappedFn = asyncHandler(asyncFn);

      await wrappedFn(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(asyncFn).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should handle synchronous errors in async functions', async () => {
      const error = new Error('Sync error in async');
      const asyncFn = jest.fn().mockImplementation(async () => {
        throw error;
      });
      const wrappedFn = asyncHandler(asyncFn);

      await wrappedFn(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('Integration - Error Flow', () => {
    it('should handle complete error flow from async handler to global handler', async () => {
      const error = new Error('Integration test error');
      const asyncFn = jest.fn().mockRejectedValue(error);
      const wrappedFn = asyncHandler(asyncFn);

      // Simulate async handler catching error
      await wrappedFn(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Verify error was passed to next
      expect(mockNext).toHaveBeenCalledWith(error);

      // Simulate global error handler receiving the error
      const capturedError = (mockNext as jest.Mock).mock.calls[0][0];
      globalErrorHandler(
        capturedError,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Verify error was logged and response sent
      expect(logger.error).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(500);
    });
  });
});
