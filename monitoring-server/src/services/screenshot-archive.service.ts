import { Screenshot } from '../database/schemas';
import { logger } from '../utils/logger';
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

/**
 * Service for creating screenshot archive backups
 */
class ScreenshotArchiveService {
  /**
   * Create a ZIP archive of screenshots organized by employee
   * 
   * @param startDate - Start date for screenshots to include
   * @param endDate - End date for screenshots to include
   * @param employeeName - Optional employee name to filter by
   * @returns Stream of the ZIP file
   */
  async createArchive(
    startDate: Date,
    endDate: Date,
    employeeName?: string
  ): Promise<{ stream: Readable; filename: string }> {
    try {
      logger.info('Creating screenshot archive', { startDate, endDate, employeeName });

      // Query screenshots within date range
      const query: any = {
        capturedAt: {
          $gte: startDate,
          $lte: endDate,
        },
      };

      // Populate employee data to get employee name
      const screenshots = await Screenshot.find(query)
        .populate('employeeId', 'name')
        .sort({ capturedAt: 1 })
        .lean();

      if (screenshots.length === 0) {
        throw new Error('No screenshots found for the specified date range');
      }

      // Filter by employee name if specified
      const filteredScreenshots = employeeName
        ? screenshots.filter((s: any) => s.employeeId?.name === employeeName)
        : screenshots;

      if (filteredScreenshots.length === 0) {
        throw new Error('No screenshots found for the specified criteria');
      }

      logger.info(`Found ${filteredScreenshots.length} screenshots to archive`);

      // Create archive
      const archive = archiver('zip', {
        zlib: { level: 9 }, // Maximum compression
      });

      // Group screenshots by employee
      const screenshotsByEmployee = new Map<string, any[]>();
      
      for (const screenshot of filteredScreenshots) {
        const empName = (screenshot as any).employeeId?.name || 'Unknown';
        if (!screenshotsByEmployee.has(empName)) {
          screenshotsByEmployee.set(empName, []);
        }
        screenshotsByEmployee.get(empName)!.push(screenshot);
      }

      // Add screenshots to archive organized by employee
      for (const [empName, empScreenshots] of screenshotsByEmployee) {
        logger.info(`Adding ${empScreenshots.length} screenshots for employee: ${empName}`);
        
        for (const screenshot of empScreenshots) {
          const screenshotPath = screenshot.filePath;
          
          // Check if file exists
          if (!fs.existsSync(screenshotPath)) {
            logger.warn(`Screenshot file not found: ${screenshotPath}`);
            continue;
          }

          // Format filename: YYYY-MM-DD_HH-MM-SS.png
          const capturedDate = new Date(screenshot.capturedAt);
          const filename = this.formatScreenshotFilename(capturedDate);
          
          // Add to archive: employee-name/YYYY-MM-DD_HH-MM-SS.png
          const archivePath = `${this.sanitizeFilename(empName)}/${filename}`;
          archive.file(screenshotPath, { name: archivePath });
        }
      }

      // Finalize archive
      archive.finalize();

      // Generate archive filename
      const archiveFilename = this.generateArchiveFilename(startDate, endDate, employeeName);

      logger.info('Screenshot archive created successfully', { filename: archiveFilename });

      return {
        stream: archive,
        filename: archiveFilename,
      };
    } catch (error) {
      logger.error('Error creating screenshot archive', { error });
      throw error;
    }
  }

  /**
   * Format screenshot filename based on captured date
   * Format: YYYY-MM-DD_HH-MM-SS.png
   */
  private formatScreenshotFilename(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}.png`;
  }

  /**
   * Generate archive filename
   * Format: screenshots_backup_YYYY-MM-DD_to_YYYY-MM-DD[_employee-name].zip
   */
  private generateArchiveFilename(startDate: Date, endDate: Date, employeeName?: string): string {
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const start = formatDate(startDate);
    const end = formatDate(endDate);
    const empSuffix = employeeName ? `_${this.sanitizeFilename(employeeName)}` : '';
    
    return `screenshots_backup_${start}_to_${end}${empSuffix}.zip`;
  }

  /**
   * Sanitize filename to remove invalid characters
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Get screenshots that will expire soon (within specified days)
   * This can be used to identify screenshots that need to be backed up before TTL deletion
   */
  async getExpiringScreenshots(daysUntilExpiry: number = 7): Promise<any[]> {
    try {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + daysUntilExpiry);

      const screenshots = await Screenshot.find({
        expiresAt: {
          $lte: expiryDate,
          $gte: new Date(), // Not yet expired
        },
      })
        .populate('employeeId', 'name')
        .sort({ expiresAt: 1 })
        .lean();

      logger.info(`Found ${screenshots.length} screenshots expiring within ${daysUntilExpiry} days`);

      return screenshots;
    } catch (error) {
      logger.error('Error getting expiring screenshots', { error });
      throw error;
    }
  }
}

export const screenshotArchiveService = new ScreenshotArchiveService();
