import { Router } from 'express';
import { logger } from '../utils/logger';
import { screenshotService } from '../services/screenshot.service';
import { validateJwtToken } from '../middleware/auth.middleware';
import { startOfDay as tzStartOfDay, endOfDay as tzEndOfDay } from '../utils/timezone';
import fs from 'fs/promises';
import { managerService } from '../services/manager.service';

async function scope(req: any): Promise<string[] | undefined> {
  return req.user?.role === 'manager' && req.user.managerEmployeeId
    ? (await managerService.getAssignedEmployeeIds(req.user.managerEmployeeId)).map(id => id.toString()) : undefined;
}

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

    const requestedLimit = limit ? parseInt(limit as string, 10) : 60;
    const requestedOffset = offset ? parseInt(offset as string, 10) : 0;
    const pageLimit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 60;
    const pageOffset = Number.isFinite(requestedOffset) ? Math.max(0, requestedOffset) : 0;

    const { items, total } = await screenshotService.getScreenshotsWithFilters(
      start,
      end,
      employeeName as string | undefined,
      pageLimit,
      pageOffset,
      await scope(req)
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
 * GET /api/screenshots/summary
 * Returns one compact aggregate row per employee for the selected range.
 */
router.get('/summary', validateJwtToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate are required' });
      return;
    }

    const summaries = await screenshotService.getScreenshotSummaries(
      tzStartOfDay(startDate as string),
      tzEndOfDay(endDate as string),
      await scope(req)
    );
    res.status(200).json(summaries);
  } catch (error) {
    logger.error('Error fetching screenshot summaries:', error);
    res.status(500).json({ error: 'Failed to fetch screenshot summaries' });
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
      employeeName as string | undefined,
      4000,
      await scope(req)
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
    
    logger.debug(`Fetching screenshot: ${id}`);
    
    // Get screenshot metadata from database
    const screenshot = await screenshotService.getScreenshot(id);
    
    if (!screenshot) {
      logger.warn(`Screenshot not found: ${id}`);
      res.status(404).json({ error: 'Screenshot not found' });
      return;
    }
    const allowed = await scope(req);
    if (allowed && !allowed.includes(screenshot.employee_id)) return res.status(404).json({ error: 'Screenshot not found' });
    
    // Check if file exists
    try {
      await fs.stat(screenshot.file_path);
    } catch (error) {
      logger.error(`Screenshot file not found on disk: ${screenshot.file_path}`, error);
      res.status(404).json({ error: 'Screenshot file not found' });
      return;
    }
    
    // Stream rather than buffer each image in Node's heap. Gallery thumbnail
    // bursts then remain bounded by backpressure instead of blocking the event
    // loop with many large readFile buffers.
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.sendFile(screenshot.file_path, (sendError) => {
      if (!sendError) return;
      if (!res.headersSent) {
        res.status(sendError.name === 'NotFoundError' ? 404 : 500).json({
          error: sendError.name === 'NotFoundError' ? 'Screenshot file not found' : 'Failed to serve screenshot',
        });
      }
      logger.error('Error streaming screenshot ' + id + ':', sendError);
    });
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
