import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { dashboardConfigService } from '../services/dashboard-config.service';

const router = Router();

/**
 * POST /api/auth/login
 * Login endpoint for dashboard authentication
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    // Validate request body
    if (!username || !password) {
      logger.warn('Login attempt with missing credentials', { ip: req.ip });
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    // Verify credentials using dashboard config service
    const isValid = await dashboardConfigService.verifyCredentials(username, password);
    
    if (!isValid) {
      logger.warn('Login attempt with invalid credentials', { 
        ip: req.ip, 
        username 
      });
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        username,
        role: 'admin',
        iat: Math.floor(Date.now() / 1000)
      },
      config.jwtSecret,
      { expiresIn: '24h' }
    );

    logger.info('Successful login', { username, ip: req.ip });

    res.json({
      token,
      user: {
        username,
        role: 'admin'
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
