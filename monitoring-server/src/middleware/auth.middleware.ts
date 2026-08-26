import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { ManagerAccount } from '../database/schemas';

export interface DashboardUser { role: 'admin' | 'manager'; username: string; managerEmployeeId?: string; }
export type DashboardRequest = Request & { user?: DashboardUser };

export const requireAdmin = (req: DashboardRequest, res: Response, next: NextFunction): void => {
  if (req.user?.role !== 'admin') { res.status(403).json({ error: 'Administrator access is required' }); return; }
  next();
};

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
export const validateJwtToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let token: string | undefined;
    
    // Try to get token from Authorization header first
    const authHeader = req.headers.authorization;
    const hadAuthorizationValue = !!authHeader?.trim();
    if (authHeader && authHeader.trim() !== '') {
      // Extract token from "Bearer <token>" format (case-insensitive)
      token = authHeader.replace(/^bearer\s+/i, '').trim();
    }
    
    // If no token in header, try query parameter (for image requests)
    if (!token && req.query?.token) {
      token = req.query.token as string;
    }
    
    if (!token) {
      if (hadAuthorizationValue) {
        logger.warn('Authentication failure: Invalid JWT token', { ip: req.ip, path: req.path, method: req.method, error: 'Empty token value' });
        res.status(401).json({ error: 'Invalid authentication token' });
        return;
      }
      logger.warn('Authentication failure: Missing JWT authorization header', {
        ip: req.ip,
        path: req.path,
        method: req.method
      });
      res.status(401).json({ error: 'Missing authentication token' });
      return;
    }

    const decoded = jwt.verify(token, config.jwtSecret) as DashboardUser;

    // Manager revocation takes effect immediately, including for already-issued
    // JWTs. Admin tokens do not require a manager-account lookup.
    if (decoded.role === 'manager' && decoded.managerEmployeeId) {
      const accountStillExists = await ManagerAccount.exists({ employeeId: decoded.managerEmployeeId });
      if (!accountStillExists) {
        logger.warn('Authentication failure: Revoked manager token', { ip: req.ip, path: req.path, method: req.method });
        res.status(401).json({ error: 'Manager access has been revoked' });
        return;
      }
    }

    (req as DashboardRequest).user = decoded;
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('Authentication failure: Invalid JWT token', { ip: req.ip, path: req.path, method: req.method, error: message });
    res.status(401).json({ error: 'Invalid authentication token' });
  }
};
