import { Router } from 'express';
import { clientEnvService } from '../services/client-env.service';
import { validateJwtToken } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/client-env
 * Get the client environment configuration (for clients to fetch)
 * No authentication required - clients need to access this
 */
router.get('/', (req, res) => {
  try {
    const config = clientEnvService.readClientEnv();
    res.json(config);
  } catch (error) {
    logger.error('Error fetching client env:', error);
    res.status(500).json({ error: 'Failed to fetch client configuration' });
  }
});

/**
 * GET /api/client-env/raw
 * Get the raw .env file content (for clients to fetch)
 * No authentication required - clients need to access this
 */
router.get('/raw', (req, res) => {
  try {
    const content = clientEnvService.getRawEnvContent();
    res.type('text/plain').send(content);
  } catch (error) {
    logger.error('Error fetching raw client env:', error);
    res.status(500).json({ error: 'Failed to fetch client configuration' });
  }
});

/**
 * PUT /api/client-env
 * Update the client environment configuration (dashboard only)
 * Requires authentication
 */
router.put('/', validateJwtToken, (req, res) => {
  try {
    const updates = req.body;
    
    logger.info('Updating client configuration:', updates);
    
    clientEnvService.writeClientEnv(updates);
    
    const updatedConfig = clientEnvService.readClientEnv();
    
    logger.info('Client configuration updated successfully');
    
    res.json({
      success: true,
      message: 'Client configuration updated successfully',
      config: updatedConfig
    });
  } catch (error) {
    logger.error('Error updating client env:', error);
    res.status(500).json({ error: 'Failed to update client configuration' });
  }
});

export default router;
