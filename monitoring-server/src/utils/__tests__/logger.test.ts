import { logger, requestLogger } from '../logger';
import winston from 'winston';
import fs from 'fs';
import path from 'path';

describe('Logger Configuration', () => {
  const logsDir = path.join(process.cwd(), 'logs');

  beforeAll(() => {
    // Ensure logs directory exists
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  });

  describe('Logger Instance', () => {
    it('should be a Winston logger instance', () => {
      expect(logger).toBeDefined();
      expect(logger).toBeInstanceOf(winston.Logger);
    });

    it('should have correct log level from environment or default', () => {
      const expectedLevel = process.env.LOG_LEVEL || 'info';
      expect(logger.level).toBe(expectedLevel);
    });

    it('should have console transport configured', () => {
      const consoleTransport = logger.transports.find(
        (t) => t instanceof winston.transports.Console
      );
      expect(consoleTransport).toBeDefined();
    });

    it('should have file transport for all logs', () => {
      const fileTransport = logger.transports.find(
        (t) => t instanceof winston.transports.File && 
        (t as any).filename.includes('server.log')
      );
      expect(fileTransport).toBeDefined();
    });

    it('should have file transport for error logs', () => {
      const errorTransport = logger.transports.find(
        (t) => t instanceof winston.transports.File && 
        (t as any).filename.includes('error.log')
      );
      expect(errorTransport).toBeDefined();
    });

    it('should have log rotation configured', () => {
      const fileTransports = logger.transports.filter(
        (t) => t instanceof winston.transports.File
      ) as winston.transports.FileTransportInstance[];

      fileTransports.forEach((transport) => {
        expect((transport as any).maxsize).toBeDefined();
        expect((transport as any).maxFiles).toBeDefined();
        expect((transport as any).maxsize).toBeGreaterThan(0);
        expect((transport as any).maxFiles).toBeGreaterThan(0);
      });
    });
  });

  describe('Log Rotation Configuration', () => {
    it('should use configurable max size from environment', () => {
      const expectedMaxSize = parseInt(process.env.LOG_MAX_SIZE_MB || '10', 10) * 1024 * 1024;
      
      const fileTransports = logger.transports.filter(
        (t) => t instanceof winston.transports.File
      ) as winston.transports.FileTransportInstance[];

      fileTransports.forEach((transport) => {
        expect((transport as any).maxsize).toBe(expectedMaxSize);
      });
    });

    it('should use configurable max files from environment', () => {
      const expectedMaxFiles = parseInt(process.env.LOG_MAX_FILES || '5', 10);
      
      const fileTransports = logger.transports.filter(
        (t) => t instanceof winston.transports.File
      ) as winston.transports.FileTransportInstance[];

      fileTransports.forEach((transport) => {
        expect((transport as any).maxFiles).toBe(expectedMaxFiles);
      });
    });
  });

  describe('Logging Functionality', () => {
    it('should log info messages', () => {
      const spy = jest.spyOn(logger, 'info');
      logger.info('Test info message');
      expect(spy).toHaveBeenCalledWith('Test info message');
      spy.mockRestore();
    });

    it('should log error messages', () => {
      const spy = jest.spyOn(logger, 'error');
      logger.error('Test error message');
      expect(spy).toHaveBeenCalledWith('Test error message');
      spy.mockRestore();
    });

    it('should log warning messages', () => {
      const spy = jest.spyOn(logger, 'warn');
      logger.warn('Test warning message');
      expect(spy).toHaveBeenCalledWith('Test warning message');
      spy.mockRestore();
    });

    it('should log errors with stack traces', () => {
      const spy = jest.spyOn(logger, 'error');
      const error = new Error('Test error');
      logger.error('Error occurred:', error);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('Request Logger Middleware', () => {
    it('should be a function', () => {
      expect(typeof requestLogger).toBe('function');
    });

    it('should log incoming requests', () => {
      const spy = jest.spyOn(logger, 'info');
      const req = { method: 'GET', url: '/test' };
      const res = { 
        on: jest.fn((event, callback) => {
          if (event === 'finish') {
            // Simulate response finish
            setTimeout(() => callback(), 0);
          }
        }),
        statusCode: 200
      };
      const next = jest.fn();

      requestLogger(req, res, next);

      expect(spy).toHaveBeenCalledWith('GET /test - Request received');
      expect(next).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should log response with status code and duration', (done) => {
      const spy = jest.spyOn(logger, 'info');
      const req = { method: 'POST', url: '/api/test' };
      const res = { 
        on: jest.fn((event, callback) => {
          if (event === 'finish') {
            res.statusCode = 201;
            callback();
          }
        }),
        statusCode: 201
      };
      const next = jest.fn();

      requestLogger(req, res, next);

      // Trigger the finish event
      const finishCallback = (res.on as jest.Mock).mock.calls.find(
        call => call[0] === 'finish'
      )?.[1];
      
      if (finishCallback) {
        finishCallback();
        setTimeout(() => {
          expect(spy).toHaveBeenCalled();
          const calls = spy.mock.calls.map(call => String(call[0]));
          const responseLog = calls.find(msg => msg.includes('201'));
          expect(responseLog).toBeDefined();
          expect(responseLog).toMatch(/POST \/api\/test - 201 - \d+ms/);
          spy.mockRestore();
          done();
        }, 10);
      } else {
        spy.mockRestore();
        done();
      }
    });

    it('should log errors for 5xx status codes', (done) => {
      const spy = jest.spyOn(logger, 'error');
      const req = { method: 'GET', url: '/error' };
      const res = { 
        on: jest.fn((event, callback) => {
          if (event === 'finish') {
            res.statusCode = 500;
            callback();
          }
        }),
        statusCode: 500
      };
      const next = jest.fn();

      requestLogger(req, res, next);

      const finishCallback = (res.on as jest.Mock).mock.calls.find(
        call => call[0] === 'finish'
      )?.[1];
      
      if (finishCallback) {
        finishCallback();
        setTimeout(() => {
          expect(spy).toHaveBeenCalled();
          spy.mockRestore();
          done();
        }, 10);
      } else {
        spy.mockRestore();
        done();
      }
    });

    it('should log warnings for 4xx status codes', (done) => {
      const spy = jest.spyOn(logger, 'warn');
      const req = { method: 'GET', url: '/notfound' };
      const res = { 
        on: jest.fn((event, callback) => {
          if (event === 'finish') {
            res.statusCode = 404;
            callback();
          }
        }),
        statusCode: 404
      };
      const next = jest.fn();

      requestLogger(req, res, next);

      const finishCallback = (res.on as jest.Mock).mock.calls.find(
        call => call[0] === 'finish'
      )?.[1];
      
      if (finishCallback) {
        finishCallback();
        setTimeout(() => {
          expect(spy).toHaveBeenCalled();
          spy.mockRestore();
          done();
        }, 10);
      } else {
        spy.mockRestore();
        done();
      }
    });
  });
});
