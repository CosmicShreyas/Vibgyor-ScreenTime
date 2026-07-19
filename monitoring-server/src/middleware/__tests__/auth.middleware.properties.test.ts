/**
 * Property-based tests for authentication middleware
 * Feature: vibgyorseek-employee-monitoring, Property 25: Authentication token validation
 * Feature: vibgyorseek-employee-monitoring, Property 26: Dashboard authentication requirement
 */

import { Request, Response } from 'express';
import { validateClientToken, validateJwtToken } from '../auth.middleware';
import { config } from '../../config';
import jwt from 'jsonwebtoken';
import * as fc from 'fast-check';

// Mock the logger
jest.mock('../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn()
  }
}));

describe('Authentication Middleware - Property-Based Tests', () => {
  const createMockRequest = (authHeader?: string): Partial<Request> => ({
    headers: authHeader ? { authorization: authHeader } : {},
    ip: '127.0.0.1',
    path: '/api/test',
    method: 'POST'
  });

  const createMockResponse = (): { 
    response: Partial<Response>, 
    statusMock: jest.Mock, 
    jsonMock: jest.Mock 
  } => {
    const statusMock = jest.fn().mockReturnThis();
    const jsonMock = jest.fn();
    
    return {
      response: {
        status: statusMock,
        json: jsonMock
      },
      statusMock,
      jsonMock
    };
  };

  describe('Property 25: Client Token Validation', () => {
    /**
     * Property: For any HTTP request to monitoring endpoints without a valid authentication token,
     * the server should return a 401 Unauthorized response
     */
    it('should return 401 for any invalid client token', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => s !== config.clientAuthToken && s !== `Bearer ${config.clientAuthToken}`),
          (invalidToken) => {
            const mockRequest = createMockRequest(invalidToken);
            const { response, statusMock, jsonMock } = createMockResponse();
            const mockNext = jest.fn();

            validateClientToken(
              mockRequest as Request,
              response as Response,
              mockNext
            );

            // Should return 401 and not call next
            expect(statusMock).toHaveBeenCalledWith(401);
            expect(jsonMock).toHaveBeenCalledWith(
              expect.objectContaining({ error: expect.any(String) })
            );
            expect(mockNext).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any request with the correct client token (with or without Bearer prefix),
     * the middleware should call next() and not return an error
     */
    it('should accept valid client token with any Bearer prefix format', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            config.clientAuthToken,
            `Bearer ${config.clientAuthToken}`,
            `bearer ${config.clientAuthToken}`,
            `BEARER ${config.clientAuthToken}`
          ),
          (validToken) => {
            const mockRequest = createMockRequest(validToken);
            const { response, statusMock } = createMockResponse();
            const mockNext = jest.fn();

            validateClientToken(
              mockRequest as Request,
              response as Response,
              mockNext
            );

            // Should call next and not return error
            expect(mockNext).toHaveBeenCalled();
            expect(statusMock).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Property: For any request without an authorization header,
     * the middleware should return 401
     */
    it('should return 401 for missing authorization header', () => {
      const mockRequest = createMockRequest();
      const { response, statusMock, jsonMock } = createMockResponse();
      const mockNext = jest.fn();

      validateClientToken(
        mockRequest as Request,
        response as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Missing authentication token' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Property 26: JWT Token Validation', () => {
    /**
     * Property: For any valid JWT token signed with the correct secret,
     * the middleware should call next() and attach the decoded payload to the request
     */
    it('should accept any valid JWT token and attach decoded payload', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.string({ minLength: 1, maxLength: 50 }),
            username: fc.string({ minLength: 1, maxLength: 50 }),
            role: fc.constantFrom('admin', 'user', 'manager')
          }),
          async (payload) => {
            const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '1h' });
            const mockRequest = createMockRequest(`Bearer ${token}`);
            const { response, statusMock } = createMockResponse();
            const mockNext = jest.fn();

            validateJwtToken(
              mockRequest as Request,
              response as Response,
              mockNext
            );

            // Wait for async JWT verification
            await new Promise(resolve => setTimeout(resolve, 50));

            // Should call next and attach user to request
            expect(mockNext).toHaveBeenCalled();
            expect(statusMock).not.toHaveBeenCalled();
            expect((mockRequest as any).user).toBeDefined();
            expect((mockRequest as any).user.userId).toBe(payload.userId);
            expect((mockRequest as any).user.username).toBe(payload.username);
            expect((mockRequest as any).user.role).toBe(payload.role);
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);

    /**
     * Property: For any JWT token signed with a wrong secret,
     * the middleware should return 401
     */
    it('should reject JWT tokens signed with wrong secret', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.string({ minLength: 1 }),
            secret: fc.string({ minLength: 10 }).filter(s => s !== config.jwtSecret)
          }),
          async ({ userId, secret }) => {
            const token = jwt.sign({ userId }, secret);
            const mockRequest = createMockRequest(`Bearer ${token}`);
            const { response, statusMock, jsonMock } = createMockResponse();
            const mockNext = jest.fn();

            validateJwtToken(
              mockRequest as Request,
              response as Response,
              mockNext
            );

            // Wait for async JWT verification
            await new Promise(resolve => setTimeout(resolve, 50));

            // Should return 401 and not call next
            expect(statusMock).toHaveBeenCalledWith(401);
            expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid authentication token' });
            expect(mockNext).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);

    /**
     * Property: For any malformed JWT token (not in JWT format),
     * the middleware should return 401
     */
    it('should reject any malformed JWT token', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string().filter(s => {
            // Filter out valid JWT tokens
            try {
              jwt.verify(s, config.jwtSecret);
              return false;
            } catch {
              return true;
            }
          }),
          async (malformedToken) => {
            const mockRequest = createMockRequest(`Bearer ${malformedToken}`);
            const { response, statusMock, jsonMock } = createMockResponse();
            const mockNext = jest.fn();

            validateJwtToken(
              mockRequest as Request,
              response as Response,
              mockNext
            );

            // Wait for async JWT verification
            await new Promise(resolve => setTimeout(resolve, 50));

            // Should return 401 and not call next
            expect(statusMock).toHaveBeenCalledWith(401);
            expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid authentication token' });
            expect(mockNext).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);

    /**
     * Property: For any request without an authorization header,
     * the middleware should return 401
     */
    it('should return 401 for missing JWT authorization header', () => {
      const mockRequest = createMockRequest();
      const { response, statusMock, jsonMock } = createMockResponse();
      const mockNext = jest.fn();

      validateJwtToken(
        mockRequest as Request,
        response as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Missing authentication token' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    /**
     * Property: For any empty or whitespace-only authorization header,
     * the middleware should return 401
     */
    it('should reject empty or whitespace authorization headers', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('', '   ', '\t', '\n', 'Bearer ', 'Bearer   '),
          (emptyHeader) => {
            const mockRequest = createMockRequest(emptyHeader);
            const { response, statusMock, jsonMock } = createMockResponse();
            const mockNext = jest.fn();

            validateJwtToken(
              mockRequest as Request,
              response as Response,
              mockNext
            );

            expect(statusMock).toHaveBeenCalledWith(401);
            // Empty strings return "Missing authentication token"
            expect(jsonMock).toHaveBeenCalledWith(
              expect.objectContaining({ error: expect.any(String) })
            );
            expect(mockNext).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property: Authentication Logging', () => {
    /**
     * Property: For any authentication failure, a log entry should be created
     */
    it('should log all client token authentication failures', () => {
      const { logger } = require('../../utils/logger');
      
      fc.assert(
        fc.property(
          fc.string().filter(s => s !== config.clientAuthToken),
          (invalidToken) => {
            logger.warn.mockClear();
            
            const mockRequest = createMockRequest(invalidToken);
            const { response } = createMockResponse();
            const mockNext = jest.fn();

            validateClientToken(
              mockRequest as Request,
              response as Response,
              mockNext
            );

            // Should have logged the failure
            expect(logger.warn).toHaveBeenCalled();
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: For any JWT authentication failure, a log entry should be created
     */
    it('should log all JWT authentication failures', async () => {
      const { logger } = require('../../utils/logger');
      
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (invalidToken) => {
            logger.warn.mockClear();
            
            const mockRequest = createMockRequest(`Bearer ${invalidToken}`);
            const { response } = createMockResponse();
            const mockNext = jest.fn();

            validateJwtToken(
              mockRequest as Request,
              response as Response,
              mockNext
            );

            // Wait for async JWT verification
            await new Promise(resolve => setTimeout(resolve, 50));

            // Should have logged the failure
            expect(logger.warn).toHaveBeenCalled();
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);
  });
});
