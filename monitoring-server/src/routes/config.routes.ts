import { Router } from 'express';
import { logger } from '../utils/logger';
import { validateJwtToken } from '../middleware/auth.middleware';
import { configService } from '../services/config.service';
import { websocketService } from '../services/websocket.service';

const router = Router();

/**
 * GET /api/config/client/:employeeName
 * Get client configuration for a specific employee
 */
router.get('/client/:employeeName', async (req, res) => {
  try {
    const { employeeName } = req.params;
    
    const config = await configService.getClientConfig(employeeName);
    
    if (!config) {
      res.status(404).json({ error: 'Configuration not found' });
      return;
    }
    
    res.json(config);
  } catch (error) {
    logger.error('Error fetching client config:', error);
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

/**
 * GET /api/config/client/:employeeName/version
 * Get configuration version for change detection
 */
router.get('/client/:employeeName/version', async (req, res) => {
  try {
    const { employeeName } = req.params;
    
    const version = await configService.getConfigVersion(employeeName);
    
    res.json({ version });
  } catch (error) {
    logger.error('Error fetching config version:', error);
    res.status(500).json({ error: 'Failed to fetch version' });
  }
});

/**
 * PUT /api/config/client/:employeeName
 * Update client configuration (dashboard only)
 */
router.put('/client/:employeeName', validateJwtToken, async (req, res) => {
  try {
    const { employeeName } = req.params;
    const configUpdate = req.body;
    
    await configService.updateClientConfig(employeeName, configUpdate);
    
    // Notify client via WebSocket about config change
    websocketService.notifyEmployeeUpdate(
      employeeName,
      'config_update',
      { message: 'Configuration updated, please restart to apply changes' }
    );
    
    logger.info('Client configuration updated', { employee: employeeName });
    
    res.json({ success: true, message: 'Configuration updated successfully' });
  } catch (error) {
    logger.error('Error updating client config:', error);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

/**
 * GET /api/config/defaults
 * Get default configuration values
 */
router.get('/defaults', validateJwtToken, async (req, res) => {
  try {
    const defaults = configService.getDefaultConfig();
    res.json(defaults);
  } catch (error) {
    logger.error('Error fetching default config:', error);
    res.status(500).json({ error: 'Failed to fetch defaults' });
  }
});

/**
 * PUT /api/config/global
 * Update global configuration for all clients
 */
router.put('/global', validateJwtToken, async (req, res) => {
  try {
    const configUpdate = req.body;
    
    await configService.updateGlobalConfig(configUpdate);
    
    // Notify all clients via WebSocket about config change
    websocketService.broadcastToAll('config_update', {
      message: 'Configuration updated, please restart to apply changes'
    });
    
    logger.info('Global configuration updated');
    
    res.json({ success: true, message: 'Global configuration updated successfully' });
  } catch (error) {
    logger.error('Error updating global config:', error);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

export default router;
