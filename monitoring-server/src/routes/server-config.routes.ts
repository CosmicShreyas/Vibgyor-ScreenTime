import { Router } from 'express';
import { logger } from '../utils/logger';
import { serverConfigService } from '../services/server-config.service';
import { validateJwtToken } from '../middleware/auth.middleware';

const router = Router();

/**
 * GET /api/server-config
 * Get current server configuration
 */
router.get('/', validateJwtToken, async (req, res) => {
  try {
    logger.info('Fetching current server configuration');
    
    const config = serverConfigService.getCurrentConfig();
    
    res.status(200).json(config);
  } catch (error) {
    logger.error('Error fetching server configuration:', error);
    res.status(500).json({ error: 'Failed to fetch server configuration' });
  }
});

/**
 * PUT /api/server-config
 * Update server configuration and trigger hot-reload
 */
router.put('/', validateJwtToken, async (req, res) => {
  try {
    logger.info('Updating server configuration');
    
    const config = req.body;
    
    // Validate required fields
    if (!config.PORT || !config.MONGODB_URI || !config.JWT_SECRET || !config.CLIENT_AUTH_TOKEN) {
      res.status(400).json({ error: 'Missing required configuration fields' });
      return;
    }
    
    // Update .env file
    await serverConfigService.updateEnvFile(config);
    
    logger.info('✅ Server configuration updated successfully');
    
    res.status(200).json({ 
      message: 'Server configuration updated successfully. Hot-reload will apply changes automatically.',
      config: serverConfigService.getCurrentConfig()
    });
  } catch (error) {
    logger.error('Error updating server configuration:', error);
    res.status(500).json({ error: 'Failed to update server configuration' });
  }
});

export default router;
