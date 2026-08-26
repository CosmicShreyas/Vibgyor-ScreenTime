import cron from 'node-cron';
import { screenshotService } from './screenshot.service';
import { logger } from '../utils/logger';

/**
 * Service for scheduled cleanup of expired screenshots
 * Runs daily to delete screenshots that exceed the configured TTL
 */
export class CleanupService {
  private cronJob: cron.ScheduledTask | null = null;

  /**
   * Start the scheduled cleanup job
   * Runs daily at midnight (00:00)
   */
  start(): void {
    if (this.cronJob) {
      logger.warn('Cleanup service is already running');
      return;
    }

    // Schedule job to run daily at midnight
    // Cron expression: '0 0 * * *' = At 00:00 every day
    this.cronJob = cron.schedule('0 0 * * *', async () => {
      await this.runCleanup();
    });

    logger.info('Cleanup service started - scheduled to run daily at midnight');
  }

  /**
   * Stop the scheduled cleanup job
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Cleanup service stopped');
    }
  }

  /**
   * Run the cleanup process immediately
   * Queries for expired screenshots, deletes files and database records, logs statistics
   * 
   * @returns Number of screenshots deleted
   */
  async runCleanup(): Promise<number> {
    const startTime = Date.now();
    logger.info('Starting screenshot cleanup process');

    try {
      // Delete expired screenshots using screenshot service
      const deletedCount = await screenshotService.deleteExpiredScreenshots();

      const duration = Date.now() - startTime;
      
      // Log deletion statistics
      logger.info(`Screenshot cleanup completed successfully`, {
        deletedCount,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      });

      return deletedCount;
    } catch (error) {
      logger.error('Screenshot cleanup failed:', error);
      throw error;
    }
  }
}

export const cleanupService = new CleanupService();
