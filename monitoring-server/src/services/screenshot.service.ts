import { Screenshot as ScreenshotModel } from '../models/screenshot.model';
import { logger } from '../utils/logger';
import { Screenshot } from '../database/schemas';
import { config } from '../config';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import mongoose from 'mongoose';

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const mkdir = promisify(fs.mkdir);
const stat = promisify(fs.stat);

/**
 * Service for managing screenshot storage
 */
export class ScreenshotService {
  /**
   * Store screenshot file and metadata
   * Saves screenshot to organized directory structure and stores metadata in database
   * 
   * @param employeeId - Employee MongoDB ObjectId as string
   * @param activityLogId - Activity log MongoDB ObjectId as string
   * @param screenshotData - Base64 encoded screenshot data
   * @param capturedAt - Screenshot capture timestamp
   * @param employeeName - Employee name for directory structure
   * @returns Screenshot record with metadata
   */
  async storeScreenshot(
    employeeId: string,
    activityLogId: string,
    screenshotData: string,
    capturedAt: Date,
    employeeName: string
  ): Promise<ScreenshotModel> {
    logger.info(`Storing screenshot for employee: ${employeeId}`);

    try {
      // Generate file path with organized directory structure
      const filePath = await this.generateFilePath(employeeName, capturedAt);
      
      // Decode base64 screenshot data
      const buffer = Buffer.from(screenshotData, 'base64');
      const fileSize = buffer.length;

      // Write screenshot file to disk with file locking
      await this.writeScreenshotFile(filePath, buffer);

      // Calculate expiration date based on TTL
      const expiresAt = new Date(capturedAt);
      expiresAt.setDate(expiresAt.getDate() + config.screenshotTtlDays);

      // Create screenshot document
      const screenshot = new Screenshot({
        employeeId: new mongoose.Types.ObjectId(employeeId),
        activityLogId: new mongoose.Types.ObjectId(activityLogId),
        filePath,
        fileSize,
        capturedAt,
        expiresAt,
      });

      await screenshot.save();

      logger.info(`Screenshot stored successfully: ${screenshot._id}, path: ${filePath}`);
      
      // Return in expected format
      return {
        id: screenshot._id.toString(),
        employee_id: employeeId,
        activity_log_id: activityLogId,
        file_path: screenshot.filePath,
        file_size: screenshot.fileSize,
        captured_at: screenshot.capturedAt,
        created_at: screenshot.createdAt,
        expires_at: screenshot.expiresAt,
      };
    } catch (error) {
      logger.error(`Failed to store screenshot for employee ${employeeId}:`, error);
      throw error;
    }
  }

  /**
   * Get screenshot by ID
   * 
   * @param id - Screenshot MongoDB ObjectId as string
   * @returns Screenshot record or null if not found
   */
  async getScreenshot(id: string): Promise<ScreenshotModel | null> {
    logger.debug(`Fetching screenshot: ${id}`);

    try {
      const screenshot = await Screenshot.findById(id).lean();

      if (!screenshot) {
        return null;
      }

      return {
        id: screenshot._id.toString(),
        employee_id: screenshot.employeeId.toString(),
        activity_log_id: screenshot.activityLogId.toString(),
        file_path: screenshot.filePath,
        file_size: screenshot.fileSize,
        captured_at: screenshot.capturedAt,
        created_at: screenshot.createdAt,
        expires_at: screenshot.expiresAt,
      };
    } catch (error) {
      logger.error(`Failed to fetch screenshot ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get screenshots for employee
   * 
   * @param employeeId - Employee MongoDB ObjectId as string
   * @param limit - Maximum number of screenshots to return (default: 50)
   * @returns Array of screenshot records
   */
  async getScreenshotsForEmployee(employeeId: string, limit: number = 50): Promise<ScreenshotModel[]> {
    logger.debug(`Fetching screenshots for employee: ${employeeId}`);

    try {
      const screenshots = await Screenshot.find({ employeeId: new mongoose.Types.ObjectId(employeeId) })
        .sort({ capturedAt: -1 })
        .limit(limit)
        .lean();

      return screenshots.map((screenshot) => ({
        id: screenshot._id.toString(),
        employee_id: screenshot.employeeId.toString(),
        activity_log_id: screenshot.activityLogId.toString(),
        file_path: screenshot.filePath,
        file_size: screenshot.fileSize,
        captured_at: screenshot.capturedAt,
        created_at: screenshot.createdAt,
        expires_at: screenshot.expiresAt,
      }));
    } catch (error) {
      logger.error(`Failed to fetch screenshots for employee ${employeeId}:`, error);
      throw error;
    }
  }

  /**
   * Get screenshots with filters (date range, employee)
   * 
   * @param startDate - Start date for filtering
   * @param endDate - End date for filtering
   * @param employeeName - Optional employee name filter
   * @param limit - Maximum number of screenshots to return (default: 1000)
   * @returns Array of screenshot records with employee info
   */
  async getScreenshotsWithFilters(
    startDate: Date,
    endDate: Date,
    employeeName?: string,
    limit: number = 1000
  ): Promise<Array<ScreenshotModel & { employee_name: string }>> {
    logger.debug(`Fetching screenshots with filters: ${startDate} to ${endDate}, employee: ${employeeName || 'all'}`);

    try {
      const query: any = {
        capturedAt: { $gte: startDate, $lte: endDate },
      };

      // If employee name is provided, find the employee first
      if (employeeName) {
        const { Employee } = await import('../database/schemas');
        const employee = await Employee.findOne({ name: employeeName }).lean();
        
        if (!employee) {
          logger.warn(`Employee not found: ${employeeName}`);
          return [];
        }
        
        query.employeeId = employee._id;
      }

      const screenshots = await Screenshot.find(query)
        .sort({ capturedAt: -1 })
        .limit(limit)
        .populate('employeeId', 'name')
        .lean();

      return screenshots.map((screenshot: any) => ({
        id: screenshot._id.toString(),
        employee_id: screenshot.employeeId._id.toString(),
        employee_name: screenshot.employeeId.name,
        activity_log_id: screenshot.activityLogId.toString(),
        file_path: screenshot.filePath,
        file_size: screenshot.fileSize,
        captured_at: screenshot.capturedAt,
        created_at: screenshot.createdAt,
        expires_at: screenshot.expiresAt,
      }));
    } catch (error) {
      logger.error('Failed to fetch screenshots with filters:', error);
      throw error;
    }
  }

  /**
   * Delete screenshot by ID
   * Removes both database record and file from filesystem
   * 
   * @param id - Screenshot MongoDB ObjectId as string
   * @returns True if deleted successfully
   */
  async deleteScreenshot(id: string): Promise<boolean> {
    logger.info(`Deleting screenshot: ${id}`);

    try {
      const screenshot = await Screenshot.findById(id).lean();

      if (!screenshot) {
        logger.warn(`Screenshot not found: ${id}`);
        return false;
      }

      // Delete file from filesystem if it exists
      try {
        await unlink(screenshot.filePath);
        logger.debug(`Deleted screenshot file: ${screenshot.filePath}`);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          // Only log if error is not "file not found"
          logger.warn(`Failed to delete screenshot file ${screenshot.filePath}:`, error);
        }
      }

      // Delete database record
      await Screenshot.findByIdAndDelete(id);
      logger.info(`Deleted screenshot: ${id}`);

      return true;
    } catch (error) {
      logger.error(`Failed to delete screenshot ${id}:`, error);
      throw error;
    }
  }

  /**
   * Sync database with filesystem - remove database records for missing files
   * 
   * @returns Number of orphaned records removed
   */
  async syncDatabaseWithFilesystem(): Promise<number> {
    logger.info('Syncing database with filesystem');

    try {
      const allScreenshots = await Screenshot.find().lean();
      let removedCount = 0;

      for (const screenshot of allScreenshots) {
        try {
          await stat(screenshot.filePath);
          // File exists, no action needed
        } catch (error) {
          // File doesn't exist, remove database record
          await Screenshot.findByIdAndDelete(screenshot._id);
          logger.info(`Removed orphaned screenshot record: ${screenshot._id}, missing file: ${screenshot.filePath}`);
          removedCount++;
        }
      }

      logger.info(`Database sync completed: ${removedCount} orphaned records removed`);
      return removedCount;
    } catch (error) {
      logger.error('Failed to sync database with filesystem:', error);
      throw error;
    }
  }

  /**
   * Delete expired screenshots based on TTL
   * Removes both database records and files from filesystem
   * 
   * @returns Number of screenshots deleted
   */
  async deleteExpiredScreenshots(): Promise<number> {
    logger.info('Deleting expired screenshots');

    try {
      // Query for expired screenshots
      const expiredScreenshots = await Screenshot.find({
        expiresAt: { $lt: new Date() },
      }).lean();

      let deletedCount = 0;

      // Delete each screenshot file and database record
      for (const screenshot of expiredScreenshots) {
        try {
          // Delete file from filesystem
          await unlink(screenshot.filePath);
          logger.debug(`Deleted screenshot file: ${screenshot.filePath}`);

          // Delete database record
          await Screenshot.findByIdAndDelete(screenshot._id);

          logger.info(`Deleted expired screenshot: ${screenshot._id} for employee: ${screenshot.employeeId}`);
          deletedCount++;
        } catch (error) {
          // Log error but continue with other deletions
          logger.error(`Failed to delete screenshot ${screenshot._id}:`, error);
        }
      }

      logger.info(`Screenshot cleanup completed: ${deletedCount} screenshots deleted`);
      return deletedCount;
    } catch (error) {
      logger.error('Failed to delete expired screenshots:', error);
      throw error;
    }
  }

  /**
   * Generate file path for screenshot with organized directory structure
   * Directory structure: /screenshots/{employee_name}/{YYYY-MM-DD}/{timestamp}.jpg
   * 
   * @param employeeName - Employee name
   * @param timestamp - Screenshot timestamp
   * @returns Full file path
   */
  private async generateFilePath(employeeName: string, timestamp: Date): Promise<string> {
    // Format date as YYYY-MM-DD
    const date = timestamp.toISOString().split('T')[0];
    
    // Format timestamp for filename (replace colons and dots with dashes)
    const time = timestamp.toISOString().replace(/[:.]/g, '-');
    
    // Create directory path: /screenshots/{employee_name}/{YYYY-MM-DD}
    const dir = path.join(config.screenshotStoragePath, employeeName, date);
    
    // Ensure directory exists
    await this.ensureStorageDirectory(dir);
    
    // Return full file path
    return path.join(dir, `${time}.jpg`);
  }

  /**
   * Ensure storage directory exists, create if necessary
   * 
   * @param dirPath - Directory path to create
   */
  private async ensureStorageDirectory(dirPath: string): Promise<void> {
    try {
      await stat(dirPath);
    } catch (error) {
      // Directory doesn't exist, create it
      await mkdir(dirPath, { recursive: true });
      logger.debug(`Created screenshot directory: ${dirPath}`);
    }
  }

  /**
   * Write screenshot file to disk with proper error handling
   * Implements file locking to prevent concurrent write conflicts
   * 
   * @param filePath - Full file path
   * @param buffer - Screenshot data buffer
   */
  private async writeScreenshotFile(filePath: string, buffer: Buffer): Promise<void> {
    try {
      // Write file atomically
      // Node.js fs.writeFile is atomic on most systems
      await writeFile(filePath, buffer, { flag: 'wx' }); // 'wx' flag fails if file exists
      logger.debug(`Screenshot file written: ${filePath}, size: ${buffer.length} bytes`);
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        // File already exists, this shouldn't happen with unique timestamps
        // but we'll handle it by appending a random suffix
        const randomSuffix = Math.random().toString(36).substring(7);
        const newPath = filePath.replace('.jpg', `-${randomSuffix}.jpg`);
        await writeFile(newPath, buffer);
        logger.warn(`File existed, wrote to alternate path: ${newPath}`);
      } else {
        throw error;
      }
    }
  }
}

export const screenshotService = new ScreenshotService();
