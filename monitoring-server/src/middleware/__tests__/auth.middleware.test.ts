/**
 * Unit tests for authentication middleware
 * Tests token validation for client and dashboard endpoints
 * Feature: vibgyorseek-employee-monitoring
 */

import { Request, Response, NextFunction } from 'express';
import { validateClientToken, validateJwtToken } from '../auth.middleware';
import { config } from '../../config';
import jwt from 'jsonwebtoken';

// Mock the logger to prevent console output during tests
jest.mock('../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn()
  }
}));

describe('Authentication Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    statusMock = jest.fn().mockReturnThis();
    jsonMock = jest.fn();
    
    mockRequest = {
      headers: {},
      ip: '127.0.0.1',
      path: '/api/test',
      method: 'POST'
    };
    
    mockResponse = {
      status: statusMock,
      json: jsonMock
    };
    
    mockNext = jest.fn();
  });

  describe('validateClientToken', () => {
    describe('Valid token scenarios', () => {
      it('should call next() when valid token is provided (Property 25)', () => {
        mockRequest.headers = {
          authorization: `Bearer ${config.clientAuthToken}`
        };

        validateClientToken(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalled();
        expect(statusMock).not.toHaveBeenCalled();
      });

      it('should call next() when token without Bearer prefix matches', () => {
        mockRequest.headers = {
          authorization: config.clientAuthToken
        };

        validateClientToken(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalled();
        expect(statusMock).not.toHaveBeenCalled();
      });
    });

    describe('Invalid token scenarios (Property 25)', () => {
      it('should return 401 when authorization header is missing', () => {
        mockRequest.headers = {};

        validateClientToken(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Missing authentication token' });
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should return 401 when token is invalid', () => {
        mockRequest.headers = {
          authorization: 'Bearer invalid-token-12345'
        };

        validateClientToken(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid authentication token' });
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should return 401 when token is empty string', () => {
        mockRequest.headers = {
          authorization: ''
        };

        validateClientToken(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Missing authentication token' });
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should return 401 when authorization header is undefined', () => {
        mockRequest.headers = {
          authorization: undefined
        };

        validateClientToken(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Missing authentication token' });
        expect(mockNext).not.toHaveBeenCalled();
      });
    });

    describe('Logging authentication failures', () => {
      it('should log authentication failures with request details', () => {
        const { logger } = require('../../utils/logger');
        mockRequest.headers = {
          authorization: 'Bearer wrong-token'
        };

        validateClientToken(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(logger.warn).toHaveBeenCalledWith(
          'Authentication failure: Invalid client token',
          expect.objectContaining({
            ip: '127.0.0.1',
            path: '/api/test',
            method: 'POST'
          })
        );
      });

      it('should log when authorization header is missing', () => {
        const { logger } = require('../../utils/logger');
        mockRequest.headers = {};

        validateClientToken(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(logger.warn).toHaveBeenCalledWith(
          'Authentication failure: Missing authorization header',
          expect.any(Object)
        );
      });
    });
  });

  describe('validateJwtToken', () => {
    const validJwtSecret = config.jwtSecret;
    
    describe('Valid JWT scenarios (Property 26)', () => {
      it('should call next() when valid JWT token is provided', (done) => {
        const payload = { userId: '123', username: 'testuser' };
        const token = jwt.sign(payload, validJwtSecret, { expiresIn: '1h' });
        
        mockRequest.headers = {
          authorization: `Bearer ${token}`
        };

        validateJwtToken(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // JWT verification is async, so we need to wait
        setTimeout(() => {
          expect(mockNext).toHaveBeenCalled();
          expect(statusMock).not.toHaveBeenCalled();
          expect((mockRequest as any).user).toBeDefined();
          expect((mockRequest as any).user.userId).toBe('123');
          done();
        }, 100);
      });

      it('should attach decoded token to request object', (done) => {
        const payload = { userId: '456', role: 'admin' };
        const token = jwt.sign(payload, validJwtSecret);
        
        mockRequest.headers = {
          authorization: `Bearer ${token}`
        };

        validateJwtToken(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        setTimeout(() => {
          expect((mockRequest as any).user).toEqual(
            expect.objectContaining({
              userId: '456',
              role: 'admin'
            })
          );
          done();
        }, 100);
      });

      it('should handle token without Bearer prefix', (done) => {
        const payload = { userId: '789' };
        const token = jwt.sign(payload, validJwtSecret);
        
        mockRequest.headers = {
          authorization: token
        };

        validateJwtToken(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        setTimeout(() => {
          expect(mockNext).toHaveBeenCalled();
          done();
        }, 100);
      });
    });

    describe('Invalid JWT scenarios (Property 26)', () => {
      it('should return 401 when authorization header is missing', () => {
        mockRequest.headers = {};

        validateJwtToken(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Missing authentication token' });
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should return 401 when JWT token is invalid', (done) => {
        mockRequest.headers = {
          authorization: 'Bearer invalid.jwt.token'
        };

        validateJwtToken(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        setTimeout(() => {
          expect(statusMock).toHaveBeenCalledWith(401);
          expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid authentication token' });
          expect(mockNext).not.toHaveBeenCalled();
          done();
        }, 100);
      });

      it('should return 401 when JWT token is expired', (done) => {
        const payload = { userId: '123' };
        const token = jwt.sign(payload, validJwtSecret, { expiresIn: '-1h' }); // Expired 1 hour ago
        
        mockRequest.headers = {
          authorization: `Bearer ${token}`
        };

        validateJwtToken(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        setTimeout(() => {
          expect(statusMock).toHaveBeenCalledWith(401);
          expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid authentication token' });
          expect(mockNext).not.toHaveBeenCalled();
          done();
        }, 100);
      });

      it('should return 401 when JWT token is signed with wrong secret', (done) => {
        const payload = { userId: '123' };
        const token = jwt.sign(payload, 'wrong-secret');
        
        mockRequest.headers = {
          authorization: `Bearer ${token}`
        };

        validateJwtToken(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        setTimeout(() => {
          expect(statusMock).toHaveBeenCalledWith(401);
          expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid authentication token' });
          expect(mockNext).not.toHaveBeenCalled();
          done();
        }, 100);
      });

      it('should return 401 when token is empty after Bearer prefix', () => {
        mockRequest.headers = {
          authorization: 'Bearer '
        };

        validateJwtToken(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid authentication token' });
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should return 401 when authorization header is empty string', () => {
        mockRequest.headers = {
          authorization: ''
        };

        validateJwtToken(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Missing authentication token' });
        expect(mockNext).not.toHaveBeenCalled();
      });
    });

    describe('Logging JWT authentication failures', () => {
      it('should log JWT authentication failures with request details', (done) => {
        const { logger } = require('../../utils/logger');
        mockRequest.headers = {
          authorization: 'Bearer invalid.token'
        };

        validateJwtToken(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        setTimeout(() => {
          expect(logger.warn).toHaveBeenCalledWith(
            'Authentication failure: Invalid JWT token',
            expect.objectContaining({
              ip: '127.0.0.1',
              path: '/api/test',
              method: 'POST',
              error: expect.any(String)
            })
          );
          done();
        }, 100);
      });

      it('should log when JWT authorization header is missing', () => {
        const { logger } = require('../../utils/logger');
        mockRequest.headers = {};

        validateJwtToken(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(logger.warn).toHaveBeenCalledWith(
          'Authentication failure: Missing JWT authorization header',
          expect.any(Object)
        );
      });
    });
  });
});
