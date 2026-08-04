import { Router } from 'express';
import { logger } from '../utils/logger';
import { screenshotService } from '../services/screenshot.service';
import { validateJwtToken } from '../middleware/auth.middleware';
import { startOfDay as tzStartOfDay, endOfDay as tzEndOfDay } from '../utils/timezone';
import fs from 'fs/promises';

const router = Router();

/**
 * GET /api/screenshots/list
 * Get screenshots with filters (date range, employee)
 * Query params: startDate, endDate, employeeName (optional)
 */
router.get('/list', validateJwtToken, async (req, res) => {
  try {
    const { startDate, endDate, employeeName, limit, offset } = req.query;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate are required' });
      return;
    }

    // Interpret the picker's YYYY-MM-DD range as full days in the business timezone.
    const start = tzStartOfDay(startDate as string);
    const end = tzEndOfDay(endDate as string);

    const pageLimit = limit ? parseInt(limit as string, 10) : 60;
    const pageOffset = offset ? parseInt(offset as string, 10) : 0;

    const { items, total } = await screenshotService.getScreenshotsWithFilters(
      start,
      end,
      employeeName as string | undefined,
      pageLimit,
      pageOffset
    );

    logger.info(`Retrieved ${items.length}/${total} screenshots (offset ${pageOffset})`);
    // Backward-compatible-ish: return a paged envelope. `items` is the page,
    // `total` is the full count for the range so the UI can paginate.
    res.status(200).json({ items, total, offset: pageOffset, limit: pageLimit });
  } catch (error) {
    logger.error('Error fetching screenshots with filters:', error);
    res.status(500).json({ error: 'Failed to fetch screenshots' });
  }
});

/**
 * GET /api/screenshots/index
 * Lightweight {id, employee_name, captured_at} list for the timeline tooltip's
 * nearest-capture thumbnail lookup. Scope to one employee via `employeeName`.
 */
router.get('/index', validateJwtToken, async (req, res) => {
  try {
    const { startDate, endDate, employeeName } = req.query;
    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate are required' });
      return;
    }
    const start = tzStartOfDay(startDate as string);
    const end = tzEndOfDay(endDate as string);
    const index = await screenshotService.getScreenshotIndex(
      start,
      end,
      employeeName as string | undefined
    );
    res.status(200).json(index);
  } catch (error) {
    logger.error('Error fetching screenshot index:', error);
    res.status(500).json({ error: 'Failed to fetch screenshot index' });
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
