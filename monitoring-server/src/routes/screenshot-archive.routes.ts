import { Router } from 'express';
import { logger } from '../utils/logger';
import { screenshotArchiveService } from '../services/screenshot-archive.service';

const router = Router();

/**
 * POST /api/screenshot-archive/create
 * Create a ZIP archive of screenshots
 */
router.post('/create', async (req, res) => {
  try {
    const { startDate, endDate, employeeName } = req.body;

    // Validate dates
    if (!startDate || !endDate) {
      res.status(400).json({ error: 'Start date and end date are required' });
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({ error: 'Invalid date format' });
      return;
    }

    if (start > end) {
      res.status(400).json({ error: 'Start date must be before end date' });
      return;
    }

    // Set end date to end of day
    end.setHours(23, 59, 59, 999);

    logger.info('Creating screenshot archive', { startDate, endDate, employeeName });

    // Create archive
    const { stream, filename } = await screenshotArchiveService.createArchive(
      start,
      end,
      employeeName
    );

    // Set response headers for file download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Pipe archive stream to response
    stream.pipe(res);

    stream.on('end', () => {
      logger.info('Screenshot archive download completed', { filename });
    });

    stream.on('error', (error) => {
      logger.error('Error streaming archive', { error });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create archive' });
      }
    });
  } catch (error) {
    logger.error('Error creating screenshot archive', { error });
    if (!res.headersSent) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to create archive' 
      });
    }
  }
});

/**
 * GET /api/screenshot-archive/expiring
 * Get screenshots that will expire soon
 */
router.get('/expiring', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 7;

    if (days < 1 || days > 365) {
      res.status(400).json({ error: 'Days must be between 1 and 365' });
      return;
    }

    const screenshots = await screenshotArchiveService.getExpiringScreenshots(days);

    res.status(200).json({
      success: true,
      count: screenshots.length,
      screenshots: screenshots.map((s: any) => ({
        id: s._id,
        employeeName: s.employeeId?.name || 'Unknown',
        capturedAt: s.capturedAt,
        expiresAt: s.expiresAt,
      })),
    });
  } catch (error) {
    logger.error('Error getting expiring screenshots', { error });
    res.status(500).json({ error: 'Failed to get expiring screenshots' });
  }
});

export default router;
