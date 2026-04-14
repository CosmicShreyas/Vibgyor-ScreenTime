import { Router } from 'express';
import { logger } from '../utils/logger';
import { screenshotService } from '../services/screenshot.service';
import { validateJwtToken } from '../middleware/auth.middleware';
import fs from 'fs/promises';

const router = Router();

/**
 * GET /api/screenshots/list
 * Get screenshots with filters (date range, employee)
 * Query params: startDate, endDate, employeeName (optional)
 */
router.get('/list', validateJwtToken, async (req, res) => {
  try {
    const { startDate, endDate, employeeName } = req.query;
    
    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate are required' });
      return;
    }
    
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    
    // Set end date to end of day
    end.setHours(23, 59, 59, 999);
    
    logger.info(`Fetching screenshots: ${start.toISOString()} to ${end.toISOString()}, employee: ${employeeName || 'all'}`);
    
    const screenshots = await screenshotService.getScreenshotsWithFilters(
      start,
      end,
      employeeName as string | undefined
    );
    
    logger.info(`Retrieved ${screenshots.length} screenshots`);
    res.status(200).json(screenshots);
  } catch (error) {
    logger.error('Error fetching screenshots with filters:', error);
    res.status(500).json({ error: 'Failed to fetch screenshots' });
  }
});

/**
 * GET /api/screenshots/:id
 * Serves screenshot image file
 * Validates: Requirements 11.6
 */
router.get('/:id', validateJwtToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    logger.info(`Fetching screenshot: ${id}`);
    
    // Get screenshot metadata from database
    const screenshot = await screenshotService.getScreenshot(id);
    
    if (!screenshot) {
      logger.warn(`Screenshot not found: ${id}`);
      res.status(404).json({ error: 'Screenshot not found' });
      return;
    }
    
    // Check if file exists
    try {
      await fs.stat(screenshot.file_path);
    } catch (error) {
      logger.error(`Screenshot file not found on disk: ${screenshot.file_path}`, error);
      res.status(404).json({ error: 'Screenshot file not found' });
      return;
    }
    
    // Read and serve the screenshot file
    const fileBuffer = await fs.readFile(screenshot.file_path);
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    
    logger.info(`Serving screenshot: ${id}, size: ${fileBuffer.length} bytes`);
    res.send(fileBuffer);
  } catch (error) {
    logger.error('Error fetching screenshot:', error);
    res.status(500).json({ error: 'Failed to fetch screenshot' });
  }
});

/**
 * DELETE /api/screenshots/:id
 * Delete a screenshot (both database record and file)
 */
router.delete('/:id', validateJwtToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    logger.info(`Deleting screenshot: ${id}`);
    
    const deleted = await screenshotService.deleteScreenshot(id);
    
    if (!deleted) {
      res.status(404).json({ error: 'Screenshot not found' });
      return;
    }
    
    logger.info(`Screenshot deleted successfully: ${id}`);
    res.status(200).json({ message: 'Screenshot deleted successfully' });
  } catch (error) {
    logger.error('Error deleting screenshot:', error);
    res.status(500).json({ error: 'Failed to delete screenshot' });
  }
});

/**
 * POST /api/screenshots/sync
 * Sync database with filesystem - remove orphaned records
 */
router.post('/sync', validateJwtToken, async (req, res) => {
  try {
    logger.info('Starting database sync with filesystem');
    
    const removedCount = await screenshotService.syncDatabaseWithFilesystem();
    
    logger.info(`Database sync completed: ${removedCount} orphaned records removed`);
    res.status(200).json({ 
      message: 'Database synced successfully',
      removedCount 
    });
  } catch (error) {
    logger.error('Error syncing database:', error);
    res.status(500).json({ error: 'Failed to sync database' });
  }
});

export default router;
