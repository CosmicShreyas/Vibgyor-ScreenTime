import { Router, Request, Response } from 'express';
import { eodReportsService } from '../services/eod-reports.service';
import { logger } from '../utils/logger';
import { validateJwtToken } from '../middleware/auth.middleware';

const router = Router();

/**
 * GET /api/eod-reports
 * Get all EOD report configurations
 */
router.get('/', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const configs = await eodReportsService.getAllConfigs();
    res.json(configs);
  } catch (error) {
    logger.error('Error fetching EOD report configs:', error);
    res.status(500).json({ error: 'Failed to fetch EOD report configurations' });
  }
});

/**
 * POST /api/eod-reports
 * Add new EOD report configuration
 */
router.post('/', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const { clientId, employeeName, email } = req.body;

    if (!clientId || !employeeName || !email) {
      return res.status(400).json({ error: 'clientId, employeeName, and email are required' });
    }

    const config = await eodReportsService.addConfig(clientId, employeeName, email);
    res.status(201).json({ message: 'EOD report configuration added successfully', config });
  } catch (error: any) {
    logger.error('Error adding EOD report config:', error);
    res.status(400).json({ error: error.message || 'Failed to add EOD report configuration' });
  }
});

/**
 * PUT /api/eod-reports/:id
 * Update EOD report configuration
 */
router.put('/:id', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const config = await eodReportsService.updateConfig(id, updates);
    res.json({ message: 'EOD report configuration updated successfully', config });
  } catch (error: any) {
    logger.error('Error updating EOD report config:', error);
    res.status(400).json({ error: error.message || 'Failed to update EOD report configuration' });
  }
});

/**
 * DELETE /api/eod-reports/:id
 * Delete EOD report configuration
 */
router.delete('/:id', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await eodReportsService.deleteConfig(id);
    res.json({ message: 'EOD report configuration deleted successfully' });
  } catch (error: any) {
    logger.error('Error deleting EOD report config:', error);
    res.status(400).json({ error: error.message || 'Failed to delete EOD report configuration' });
  }
});

/**
 * POST /api/eod-reports/send-now
 * Send EOD report immediately for a specific configuration
 */
router.post('/send-now', validateJwtToken, async (req: Request, res: Response) => {
  try {
    const { clientId, employeeName, email } = req.body;

    if (!clientId || !employeeName || !email) {
      return res.status(400).json({ error: 'clientId, employeeName, and email are required' });
    }

    await eodReportsService.sendEODReport(clientId, employeeName, email);
    res.json({ message: 'EOD report sent successfully' });
  } catch (error: any) {
    logger.error('Error sending EOD report:', error);
    res.status(500).json({ error: error.message || 'Failed to send EOD report' });
  }
});

/**
 * POST /api/eod-reports/send-all
 * Send all enabled EOD reports immediately
 */
router.post('/send-all', validateJwtToken, async (req: Request, res: Response) => {
  try {
    await eodReportsService.sendAllEODReports();
    res.json({ message: 'All EOD reports sent successfully' });
  } catch (error: any) {
    logger.error('Error sending all EOD reports:', error);
    res.status(500).json({ error: error.message || 'Failed to send EOD reports' });
  }
});

export default router;
