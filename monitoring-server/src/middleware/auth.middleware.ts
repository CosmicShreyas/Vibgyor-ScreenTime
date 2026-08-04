import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Middleware to validate client authentication token
 * Used for monitoring data endpoints
 * Validates: Requirements 18.2
 */
export const validateClientToken = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || authHeader.trim() === '') {
      logger.warn('Authentication failure: Missing authorization header', {
        ip: req.ip,
        path: req.path,
        method: req.method
      });
      res.status(401).json({ error: 'Missing authentication token' });
      return;
    }

    // Remove Bearer prefix (case-insensitive)
    const token = authHeader.replace(/^bearer\s+/i, '').trim();
    
    if (!token || token !== config.clientAuthToken) {
      logger.warn('Authentication failure: Invalid client token', {
        ip: req.ip,
        path: req.path,
        method: req.method
      });
      res.status(401).json({ error: 'Invalid authentication token' });
      return;
    }

    next();
  } catch (error) {
    logger.error('Error validating client token:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};

/**
 * Middleware to validate JWT token for dashboard API
 * Used for dashboard endpoints
 * Supports both Authorization header and query parameter for image requests
 * Validates: Requirements 18.4
 */
export const validateJwtToken = (req: Request, res: Response, next: NextFunction): void => {
  try {
    let token: string | undefined;
    
    // Try to get token from Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.trim() !== '') {
      // Extract token from "Bearer <token>" format (case-insensitive)
      token = authHeader.replace(/^bearer\s+/i, '').trim();
    }
    
    // If no token in header, try query parameter (for image requests)
    if (!token && req.query.token) {
      token = req.query.token as string;
    }
    
    if (!token) {
      logger.warn('Authentication failure: Missing JWT authorization header', {
        ip: req.ip,
        path: req.path,
        method: req.method
      });
      res.status(401).json({ error: 'Missing authentication token' });
      return;
    }

    // Verify JWT token
    jwt.verify(token, config.jwtSecret, (err, decoded) => {
      if (err) {
        logger.warn('Authentication failure: Invalid JWT token', {
          ip: req.ip,
          path: req.path,
          method: req.method,
          error: err.message
        });
        res.status(401).json({ error: 'Invalid authentication token' });
        return;
      }

      // Attach decoded token to request for use in route handlers
      (req as any).user = decoded;
      next();
    });
  } catch (error) {
    logger.error('Error validating JWT token:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};
