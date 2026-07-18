import { CleanupService } from '../cleanup.service';
import { screenshotService } from '../screenshot.service';
import { logger } from '../../utils/logger';
import cron from 'node-cron';

// Mock dependencies
jest.mock('../screenshot.service');
jest.mock('../../utils/logger');
jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    stop: jest.fn(),
  })),
}));

describe('CleanupService', () => {
  let cleanupService: CleanupService;

  beforeEach(() => {
    cleanupService = new CleanupService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanupService.stop();
  });

  describe('start', () => {
    it('should start the scheduled cleanup job', () => {
      cleanupService.start();
      
      expect(cron.schedule).toHaveBeenCalledWith('0 0 * * *', expect.any(Function));
      expect(logger.info).toHaveBeenCalledWith(
        'Cleanup service started - scheduled to run daily at midnight'
      );
    });

    it('should warn if cleanup service is already running', () => {
      cleanupService.start();
      jest.clearAllMocks();
      cleanupService.start();
      
      expect(cron.schedule).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('Cleanup service is already running');
    });
  });

  describe('stop', () => {
    it('should stop the scheduled cleanup job', () => {
      cleanupService.start();
      cleanupService.stop();
      
      expect(logger.info).toHaveBeenCalledWith('Cleanup service stopped');
    });

    it('should handle stop when not running', () => {
      cleanupService.stop();
      
      // Should not throw error
      expect(logger.info).not.toHaveBeenCalledWith('Cleanup service stopped');
    });
  });

  describe('runCleanup', () => {
    it('should delete expired screenshots and log statistics', async () => {
      const mockDeletedCount = 5;
      (screenshotService.deleteExpiredScreenshots as jest.Mock).mockResolvedValue(mockDeletedCount);

      const result = await cleanupService.runCleanup();

      expect(screenshotService.deleteExpiredScreenshots).toHaveBeenCalled();
      expect(result).toBe(mockDeletedCount);
      expect(logger.info).toHaveBeenCalledWith('Starting screenshot cleanup process');
      expect(logger.info).toHaveBeenCalledWith(
        'Screenshot cleanup completed successfully',
        expect.objectContaining({
          deletedCount: mockDeletedCount,
          durationMs: expect.any(Number),
          timestamp: expect.any(String),
        })
      );
    });

    it('should handle cleanup with zero deletions', async () => {
      (screenshotService.deleteExpiredScreenshots as jest.Mock).mockResolvedValue(0);

      const result = await cleanupService.runCleanup();

      expect(result).toBe(0);
      expect(logger.info).toHaveBeenCalledWith(
        'Screenshot cleanup completed successfully',
        expect.objectContaining({
          deletedCount: 0,
        })
      );
    });

    it('should log error and throw when cleanup fails', async () => {
      const mockError = new Error('Database connection failed');
      (screenshotService.deleteExpiredScreenshots as jest.Mock).mockRejectedValue(mockError);

      await expect(cleanupService.runCleanup()).rejects.toThrow('Database connection failed');
      
      expect(logger.error).toHaveBeenCalledWith('Screenshot cleanup failed:', mockError);
    });

    it('should measure and log cleanup duration', async () => {
      (screenshotService.deleteExpiredScreenshots as jest.Mock).mockResolvedValue(3);

      await cleanupService.runCleanup();

      expect(logger.info).toHaveBeenCalledWith(
        'Screenshot cleanup completed successfully',
        expect.objectContaining({
          durationMs: expect.any(Number),
        })
      );
    });
  });
});
