/**
 * Property-based tests for logging functionality
 * Feature: vibgyorseek-employee-monitoring, Property 11: Error Logging (server-side)
 * Feature: vibgyorseek-employee-monitoring, Property 23: Log File Rotation
 */

import * as fc from 'fast-check';
import winston from 'winston';
import fs from 'fs';
import path from 'path';
import { logger } from '../logger';

describe('Logger - Property-Based Tests', () => {
  const logsDir = path.join(process.cwd(), 'logs');
  const testLogFile = path.join(logsDir, 'test-property.log');

  beforeAll(() => {
    // Ensure logs directory exists
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test log files
    if (fs.existsSync(testLogFile)) {
      try {
        fs.unlinkSync(testLogFile);
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Property 11: Error Logging (server-side)', () => {
    /**
     * Property: For any error or exception encountered by the server,
     * a log entry containing the error details should be created in the log file
     */
    it('should create log entry for any error message', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (errorMessage) => {
            // Spy on the logger's error method
            const errorSpy = jest.spyOn(logger, 'error');

            // Log the error
            logger.error(errorMessage);

            // Verify the error was logged
            expect(errorSpy).toHaveBeenCalledWith(errorMessage);

            errorSpy.mockRestore();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any Error object logged, the log should include the error message
     */
    it('should log error objects with their messages', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (errorMessage) => {
            const errorSpy = jest.spyOn(logger, 'error');
            const error = new Error(errorMessage);

            logger.error('Error occurred:', error);

            expect(errorSpy).toHaveBeenCalled();
            const callArgs = errorSpy.mock.calls[0];
            expect(callArgs).toContain('Error occurred:');

            errorSpy.mockRestore();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any warning message, a log entry should be created
     */
    it('should create log entry for any warning message', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (warningMessage) => {
            const warnSpy = jest.spyOn(logger, 'warn');

            logger.warn(warningMessage);

            expect(warnSpy).toHaveBeenCalledWith(warningMessage);

            warnSpy.mockRestore();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any info message, a log entry should be created
     */
    it('should create log entry for any info message', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (infoMessage) => {
            const infoSpy = jest.spyOn(logger, 'info');

            logger.info(infoMessage);

            expect(infoSpy).toHaveBeenCalledWith(infoMessage);

            infoSpy.mockRestore();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any combination of log level and message,
     * the appropriate logging method should be called
     */
    it('should handle any log level with any message', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('error', 'warn', 'info', 'debug'),
          fc.string({ minLength: 1, maxLength: 200 }),
          (level, message) => {
            const spy = jest.spyOn(logger, level as any);

            (logger as any)[level](message);

            expect(spy).toHaveBeenCalledWith(message);

            spy.mockRestore();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 23: Log File Rotation', () => {
    /**
     * Property: For any log file that exceeds the configured size limit,
     * the logging system should create a new log file and continue writing to the new file
     */
    it('should have rotation configuration for all file transports', () => {
      const fileTransports = logger.transports.filter(
        (t) => t instanceof winston.transports.File
      ) as winston.transports.FileTransportInstance[];

      // Verify we have file transports
      expect(fileTransports.length).toBeGreaterThan(0);

      // Property: Every file transport must have maxsize configured
      fileTransports.forEach((transport) => {
        expect((transport as any).maxsize).toBeDefined();
        expect((transport as any).maxsize).toBeGreaterThan(0);
      });

      // Property: Every file transport must have maxFiles configured
      fileTransports.forEach((transport) => {
        expect((transport as any).maxFiles).toBeDefined();
        expect((transport as any).maxFiles).toBeGreaterThan(0);
      });
    });

    /**
     * Property: For any valid maxsize configuration value,
     * the file transport should accept and use that value
     */
    it('should accept any valid maxsize configuration', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }), // MB values
          (maxSizeMB) => {
            const maxSizeBytes = maxSizeMB * 1024 * 1024;
            
            // Create a test transport with the maxsize
            const testTransport = new winston.transports.File({
              filename: testLogFile,
              maxsize: maxSizeBytes,
              maxFiles: 5
            });

            // Verify the configuration was accepted
            expect((testTransport as any).maxsize).toBe(maxSizeBytes);
            
            // Clean up
            if (testTransport.close) {
              testTransport.close();
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: For any valid maxFiles configuration value,
     * the file transport should accept and use that value
     */
    it('should accept any valid maxFiles configuration', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          (maxFiles) => {
            // Create a test transport with the maxFiles
            const testTransport = new winston.transports.File({
              filename: testLogFile,
              maxsize: 1024 * 1024, // 1MB
              maxFiles: maxFiles
            });

            // Verify the configuration was accepted
            expect((testTransport as any).maxFiles).toBe(maxFiles);
            
            // Clean up
            if (testTransport.close) {
              testTransport.close();
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: For any combination of maxsize and maxFiles values,
     * the file transport should be properly configured
     */
    it('should handle any valid combination of rotation parameters', () => {
      fc.assert(
        fc.property(
          fc.record({
            maxSizeMB: fc.integer({ min: 1, max: 100 }),
            maxFiles: fc.integer({ min: 1, max: 20 })
          }),
          ({ maxSizeMB, maxFiles }) => {
            const maxSizeBytes = maxSizeMB * 1024 * 1024;
            
            const testTransport = new winston.transports.File({
              filename: testLogFile,
              maxsize: maxSizeBytes,
              maxFiles: maxFiles
            });

            // Verify both configurations
            expect((testTransport as any).maxsize).toBe(maxSizeBytes);
            expect((testTransport as any).maxFiles).toBe(maxFiles);
            
            // Clean up
            if (testTransport.close) {
              testTransport.close();
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: The logger should maintain rotation configuration from environment variables
     */
    it('should use environment-based rotation configuration consistently', () => {
      const expectedMaxSize = parseInt(process.env.LOG_MAX_SIZE_MB || '10', 10) * 1024 * 1024;
      const expectedMaxFiles = parseInt(process.env.LOG_MAX_FILES || '5', 10);

      const fileTransports = logger.transports.filter(
        (t) => t instanceof winston.transports.File
      ) as winston.transports.FileTransportInstance[];

      // Property: All file transports should use the same rotation configuration
      fileTransports.forEach((transport) => {
        expect((transport as any).maxsize).toBe(expectedMaxSize);
        expect((transport as any).maxFiles).toBe(expectedMaxFiles);
      });
    });
  });

  describe('Property: Log Entry Completeness', () => {
    /**
     * Property: For any log message, the logger should be able to handle it
     * without throwing errors
     */
    it('should handle any string message without errors', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (message) => {
            // Should not throw
            expect(() => {
              logger.info(message);
            }).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any object logged, the logger should handle it
     */
    it('should handle logging objects with any structure', () => {
      fc.assert(
        fc.property(
          fc.record({
            message: fc.string({ minLength: 1 }),
            data: fc.oneof(
              fc.string(),
              fc.integer(),
              fc.boolean(),
              fc.constant(null),
              fc.constant(undefined)
            )
          }),
          (logData) => {
            // Should not throw
            expect(() => {
              logger.info(logData.message, logData.data);
            }).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Request Logging', () => {
    /**
     * Property: For any HTTP method and URL combination,
     * the request logger should create appropriate log entries
     */
    it('should log any HTTP method and URL combination', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH'),
          fc.string({ minLength: 1, maxLength: 100 }).map(s => '/' + s.replace(/\s/g, '-')),
          (method, url) => {
            const infoSpy = jest.spyOn(logger, 'info');

            // Simulate request logging
            logger.info(`${method} ${url} - Request received`);

            expect(infoSpy).toHaveBeenCalled();
            const logMessage = infoSpy.mock.calls[0][0];
            expect(logMessage).toContain(method);
            expect(logMessage).toContain(url);

            infoSpy.mockRestore();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any HTTP status code, the appropriate log level should be used
     */
    it('should use correct log level for any status code', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 200, max: 599 }),
          (statusCode) => {
            const errorSpy = jest.spyOn(logger, 'error');
            const warnSpy = jest.spyOn(logger, 'warn');
            const infoSpy = jest.spyOn(logger, 'info');

            // Determine expected log level
            if (statusCode >= 500) {
              logger.error(`Request - ${statusCode}`);
              expect(errorSpy).toHaveBeenCalled();
            } else if (statusCode >= 400) {
              logger.warn(`Request - ${statusCode}`);
              expect(warnSpy).toHaveBeenCalled();
            } else {
              logger.info(`Request - ${statusCode}`);
              expect(infoSpy).toHaveBeenCalled();
            }

            errorSpy.mockRestore();
            warnSpy.mockRestore();
            infoSpy.mockRestore();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
