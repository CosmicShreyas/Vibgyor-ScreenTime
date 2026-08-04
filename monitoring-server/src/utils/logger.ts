import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Configuration from environment variables
const logLevel = process.env.LOG_LEVEL || 'info';
const logMaxSize = parseInt(process.env.LOG_MAX_SIZE_MB || '10', 10) * 1024 * 1024; // Default 10MB
const logMaxFiles = parseInt(process.env.LOG_MAX_FILES || '5', 10); // Default 5 files

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    if (stack) {
      return `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`;
    }
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      ),
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'server.log'),
      maxsize: logMaxSize,
      maxFiles: logMaxFiles,
    }),
    // File transport for errors only
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: logMaxSize,
      maxFiles: logMaxFiles,
    }),
  ],
});

/**
 * Express middleware for logging HTTP requests
 * Logs method, URL, status code, and response time
 */
export const requestLogger = (req: any, res: any, next: any) => {
  const startTime = Date.now();
  
  // Log request
  logger.info(`${req.method} ${req.url} - Request received`);
  
  // Capture response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logMessage = `${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`;
    
    if (res.statusCode >= 500) {
      logger.error(logMessage);
    } else if (res.statusCode >= 400) {
      logger.warn(logMessage);
    } else {
      logger.info(logMessage);
    }
  });
  
  next();
};
