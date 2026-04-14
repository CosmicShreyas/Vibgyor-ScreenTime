import { ActivityLog as ActivityLogModel, MonitoringPayload } from '../models/activity-log.model';
import { logger } from '../utils/logger';
import { ActivityLog, IActivityLog } from '../database/schemas';
import mongoose from 'mongoose';

/**
 * Service for managing activity log data
 */
export class ActivityLogService {
  /**
   * Store activity log record with all monitoring data
   * 
   * @param employeeId - Employee MongoDB ObjectId as string
   * @param payload - Monitoring data payload from client
   * @returns Created activity log record
   * @throws Error if validation fails or database operation fails
   */
  async storeActivityLog(employeeId: string, payload: MonitoringPayload): Promise<ActivityLogModel> {
    logger.info(`Storing activity log for employee: ${employeeId}`);

    try {
      // Parse timestamps
      const timestamp = new Date(payload.timestamp);
      const intervalStart = new Date(payload.interval_start);
      const intervalEnd = new Date(payload.interval_end);

      // Validate timestamps
      if (isNaN(timestamp.getTime()) || isNaN(intervalStart.getTime()) || isNaN(intervalEnd.getTime())) {
        throw new Error('Invalid timestamp format');
      }

      // Validate activity data
      if (payload.activity.work_seconds < 0 || payload.activity.idle_seconds < 0) {
        throw new Error('Work and idle seconds must be non-negative');
      }

      // Transform applications data to match schema
      const applications = payload.applications.map(app => ({
        name: app.name,
        duration: app.duration || 0, // Use duration from payload, default to 0 if not provided
      }));

      // Log application durations for debugging
      const appsWithDuration = applications.filter(app => app.duration > 0);
      logger.info(`📱 Received ${payload.applications.length} apps, ${appsWithDuration.length} with duration > 0`);
      if (appsWithDuration.length > 0) {
        logger.info(`📊 Apps with duration: ${appsWithDuration.map(a => `${a.name}: ${a.duration}s`).join(', ')}`);
      }

      // Transform browser tabs data to match schema
      const browserTabs = payload.browser_tabs.map(tab => ({
        title: tab.title || '',
        url: tab.url || '',
        duration: tab.duration || 0, // Use duration from payload, default to 0 if not provided
      }));

      // Log browser tab durations for debugging
      const tabsWithDuration = browserTabs.filter(tab => tab.duration > 0);
      logger.info(`🌐 Received ${payload.browser_tabs.length} tabs, ${tabsWithDuration.length} with duration > 0`);
      if (tabsWithDuration.length > 0) {
        logger.info(`📊 Tabs with duration: ${tabsWithDuration.map(t => `${t.title}: ${t.duration}s`).join(', ')}`);
      }

      // Create activity log document
      const activityLog = new ActivityLog({
        employeeId: new mongoose.Types.ObjectId(employeeId),
        timestamp,
        intervalStart,
        intervalEnd,
        workSeconds: payload.activity.work_seconds,
        idleSeconds: payload.activity.idle_seconds,
        applications,
        browserTabs,
      });

      await activityLog.save();

      logger.info(`Activity log stored successfully: ${activityLog._id}`);
      
      // Return in the expected format
      return {
        id: activityLog._id.toString(),
        employee_id: employeeId,
        timestamp: activityLog.timestamp,
        interval_start: activityLog.intervalStart,
        interval_end: activityLog.intervalEnd,
        work_seconds: activityLog.workSeconds,
        idle_seconds: activityLog.idleSeconds,
        applications: payload.applications,
        browser_tabs: payload.browser_tabs,
        created_at: activityLog.createdAt,
      };
    } catch (error) {
      logger.error(`Failed to store activity log for employee ${employeeId}:`, error);
      throw error;
    }
  }

  /**
   * Get activity logs for a specific employee
   * 
   * @param employeeId - Employee MongoDB ObjectId as string
   * @param limit - Maximum number of records to return (default: 100)
   * @returns Array of activity log records
   */
  async getActivityLogsByEmployee(employeeId: string, limit: number = 100): Promise<ActivityLogModel[]> {
    logger.debug(`Fetching activity logs for employee: ${employeeId}`);

    try {
      const logs = await ActivityLog.find({ employeeId: new mongoose.Types.ObjectId(employeeId) })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      return logs.map(log => ({
        id: log._id.toString(),
        employee_id: employeeId,
        timestamp: log.timestamp,
        interval_start: log.intervalStart,
        interval_end: log.intervalEnd,
        work_seconds: log.workSeconds,
        idle_seconds: log.idleSeconds,
        applications: log.applications.map(app => ({ name: app.name, active: false })),
        browser_tabs: log.browserTabs.map(tab => ({ browser: 'unknown', title: tab.title, url: tab.url })),
        created_at: log.createdAt,
      }));
    } catch (error) {
      logger.error(`Failed to fetch activity logs for employee ${employeeId}:`, error);
      throw error;
    }
  }

  /**
   * Query activity logs by employee and date range
   * 
   * @param employeeId - Employee MongoDB ObjectId as string
   * @param startDate - Start of date range (inclusive)
   * @param endDate - End of date range (inclusive)
   * @returns Array of activity log records within the date range
   */
  async getActivityLogsByDateRange(
    employeeId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ActivityLogModel[]> {
    logger.debug(`Fetching activity logs for employee ${employeeId} from ${startDate} to ${endDate}`);

    try {
      // Validate date range
      if (startDate > endDate) {
        throw new Error('Start date must be before or equal to end date');
      }

      const logs = await ActivityLog.find({
        employeeId: new mongoose.Types.ObjectId(employeeId),
        timestamp: { $gte: startDate, $lte: endDate },
      })
        .sort({ timestamp: -1 })
        .lean();

      return logs.map(log => ({
        id: log._id.toString(),
        employee_id: employeeId,
        timestamp: log.timestamp,
        interval_start: log.intervalStart,
        interval_end: log.intervalEnd,
        work_seconds: log.workSeconds,
        idle_seconds: log.idleSeconds,
        applications: log.applications.map(app => ({ name: app.name, active: false })),
        browser_tabs: log.browserTabs.map(tab => ({ browser: 'unknown', title: tab.title, url: tab.url })),
        created_at: log.createdAt,
      }));
    } catch (error) {
      logger.error(
        `Failed to fetch activity logs for employee ${employeeId} in date range:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get the most recent activity log for an employee
   * 
   * @param employeeId - Employee MongoDB ObjectId as string
   * @returns Most recent activity log or null if none found
   */
  async getLatestActivityLog(employeeId: string): Promise<ActivityLogModel | null> {
    logger.debug(`Fetching latest activity log for employee: ${employeeId}`);

    try {
      const log = await ActivityLog.findOne({ employeeId: new mongoose.Types.ObjectId(employeeId) })
        .sort({ timestamp: -1 })
        .lean();

      if (!log) {
        return null;
      }

      return {
        id: log._id.toString(),
        employee_id: employeeId,
        timestamp: log.timestamp,
        interval_start: log.intervalStart,
        interval_end: log.intervalEnd,
        work_seconds: log.workSeconds,
        idle_seconds: log.idleSeconds,
        applications: log.applications.map(app => ({ name: app.name, active: false })),
        browser_tabs: log.browserTabs.map(tab => ({ browser: 'unknown', title: tab.title, url: tab.url })),
        created_at: log.createdAt,
      };
    } catch (error) {
      logger.error(`Failed to fetch latest activity log for employee ${employeeId}:`, error);
      throw error;
    }
  }

  /**
   * Get activity summary for an employee on a specific date
   * 
   * @param employeeId - Employee MongoDB ObjectId as string
   * @param date - Date to get summary for
   * @returns Summary with total work and idle seconds
   */
  async getActivitySummaryForDate(
    employeeId: string,
    date: Date
  ): Promise<{ work_seconds: number; idle_seconds: number }> {
    logger.debug(`Fetching activity summary for employee ${employeeId} on ${date}`);

    try {
      // Get start and end of day
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const result = await ActivityLog.aggregate([
        {
          $match: {
            employeeId: new mongoose.Types.ObjectId(employeeId),
            timestamp: { $gte: startOfDay, $lte: endOfDay },
          },
        },
        {
          $group: {
            _id: null,
            total_work_seconds: { $sum: '$workSeconds' },
            total_idle_seconds: { $sum: '$idleSeconds' },
          },
        },
      ]);

      if (result.length === 0) {
        return { work_seconds: 0, idle_seconds: 0 };
      }

      return {
        work_seconds: result[0].total_work_seconds || 0,
        idle_seconds: result[0].total_idle_seconds || 0,
      };
    } catch (error) {
      logger.error(`Failed to fetch activity summary for employee ${employeeId}:`, error);
      throw error;
    }
  }
}

export const activityLogService = new ActivityLogService();
