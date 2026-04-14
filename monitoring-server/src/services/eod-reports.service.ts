import { logger } from '../utils/logger';
import { EODReportConfig, ActivityLog } from '../database/schemas';
import { emailService } from './email.service';
import cron from 'node-cron';

interface EODReportEntry {
  _id: string;
  clientId: string;
  employeeName: string;
  email: string;
  enabled: boolean;
}

interface EmployeeDayData {
  employeeName: string;
  clientId: string;
  workTime: number;
  idleTime: number;
  offlineTime: number;
  totalTime: number;
  productivityRate: number;
  topApplications: Array<{ name: string; duration: number }>;
  topBrowserTabs: Array<{ title: string; duration: number }>;
  firstActivity: Date | null;
  lastActivity: Date | null;
}

export class EODReportsService {
  private cronJob: cron.ScheduledTask | null = null;

  /**
   * Initialize EOD reports scheduler
   */
  async initialize(): Promise<void> {
    const reportTime = process.env.EOD_REPORT_TIME || '00:00';
    const [hour, minute] = reportTime.split(':').map(Number);

    if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      logger.warn(`⚠️ Invalid EOD_REPORT_TIME format: ${reportTime}. Using default 00:00`);
      this.scheduleDailyReports(0, 0);
    } else {
      this.scheduleDailyReports(hour, minute);
    }
  }

  /**
   * Schedule daily EOD reports
   */
  private scheduleDailyReports(hour: number, minute: number): void {
    // Stop existing cron job if any
    if (this.cronJob) {
      this.cronJob.stop();
    }

    // Create cron expression: minute hour * * *
    const cronExpression = `${minute} ${hour} * * *`;
    
    logger.info(`📅 Scheduling daily EOD reports at ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);

    this.cronJob = cron.schedule(cronExpression, async () => {
      logger.info('⏰ Triggering scheduled EOD reports...');
      await this.sendAllEODReports();
    });

    logger.info('✅ EOD reports scheduler initialized');
  }

  /**
   * Get all EOD report configurations
   */
  async getAllConfigs(): Promise<EODReportEntry[]> {
    try {
      const configs = await EODReportConfig.find({}).lean();
      return configs.map(config => ({
        _id: config._id.toString(),
        clientId: config.clientId,
        employeeName: config.employeeName,
        email: config.email,
        enabled: config.enabled,
      }));
    } catch (error) {
      logger.error('Error fetching EOD report configs:', error);
      throw error;
    }
  }

  /**
   * Add new EOD report configuration
   */
  async addConfig(clientId: string, employeeName: string, email: string): Promise<EODReportEntry> {
    try {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Invalid email address');
      }

      // Check if config already exists
      const existing = await EODReportConfig.findOne({ clientId, email });
      if (existing) {
        throw new Error('EOD report configuration already exists for this client and email');
      }

      const config = await EODReportConfig.create({
        clientId,
        employeeName,
        email,
        enabled: true,
      });

      logger.info(`✅ Added EOD report config for ${employeeName} (${clientId}) -> ${email}`);

      return {
        _id: config._id.toString(),
        clientId: config.clientId,
        employeeName: config.employeeName,
        email: config.email,
        enabled: config.enabled,
      };
    } catch (error: any) {
      logger.error('Error adding EOD report config:', error);
      throw error;
    }
  }

  /**
   * Update EOD report configuration
   */
  async updateConfig(id: string, updates: { email?: string; enabled?: boolean }): Promise<EODReportEntry> {
    try {
      if (updates.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(updates.email)) {
          throw new Error('Invalid email address');
        }
      }

      const config = await EODReportConfig.findByIdAndUpdate(
        id,
        updates,
        { new: true, runValidators: true }
      );

      if (!config) {
        throw new Error('EOD report configuration not found');
      }

      logger.info(`✅ Updated EOD report config ${id}`);

      return {
        _id: config._id.toString(),
        clientId: config.clientId,
        employeeName: config.employeeName,
        email: config.email,
        enabled: config.enabled,
      };
    } catch (error) {
      logger.error('Error updating EOD report config:', error);
      throw error;
    }
  }

  /**
   * Delete EOD report configuration
   */
  async deleteConfig(id: string): Promise<void> {
    try {
      const result = await EODReportConfig.findByIdAndDelete(id);
      
      if (!result) {
        throw new Error('EOD report configuration not found');
      }

      logger.info(`✅ Deleted EOD report config ${id}`);
    } catch (error) {
      logger.error('Error deleting EOD report config:', error);
      throw error;
    }
  }

  /**
   * Generate EOD report data for a specific employee
   */
  private async generateEmployeeDayData(clientId: string, employeeName: string): Promise<EmployeeDayData | null> {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    logger.info(`📊 Generating EOD report for ${employeeName} (${clientId}) from ${dayStart.toISOString()} to ${dayEnd.toISOString()}`);

    // Find employee by name
    const { Employee } = await import('../database/schemas');
    const employee = await Employee.findOne({ name: employeeName }).lean();
    if (!employee) {
      logger.warn(`⚠️ Employee ${employeeName} not found`);
      return null;
    }

    // Get activity logs for today for this employee
    const logs = await ActivityLog.find({
      employeeId: employee._id,
      timestamp: { $gte: dayStart, $lte: dayEnd },
    }).lean();

    if (logs.length === 0) {
      logger.info(`ℹ️ No activity data found for ${employeeName} today`);
      return null;
    }

    // Calculate work and idle time
    const workSeconds = logs.reduce((sum, log) => sum + log.workSeconds, 0);
    const idleSeconds = logs.reduce((sum, log) => sum + log.idleSeconds, 0);
    const totalSeconds = workSeconds + idleSeconds;

    // Calculate offline time (time between first and last activity minus total tracked time)
    const timestamps = logs.map(log => log.timestamp).sort((a, b) => a.getTime() - b.getTime());
    const firstActivity = timestamps[0];
    const lastActivity = timestamps[timestamps.length - 1];
    
    const timeSpanSeconds = (lastActivity.getTime() - firstActivity.getTime()) / 1000;
    const offlineSeconds = Math.max(0, timeSpanSeconds - totalSeconds);

    // Aggregate application usage
    const appUsage = new Map<string, number>();
    logs.forEach(log => {
      log.applications.forEach(app => {
        const current = appUsage.get(app.name) || 0;
        appUsage.set(app.name, current + (app.duration || 0));
      });
    });

    const topApplications = Array.from(appUsage.entries())
      .map(([name, duration]) => ({ name, duration }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5);

    // Aggregate browser tab usage
    const tabUsage = new Map<string, number>();
    logs.forEach(log => {
      log.browserTabs.forEach(tab => {
        const current = tabUsage.get(tab.title) || 0;
        tabUsage.set(tab.title, current + (tab.duration || 0));
      });
    });

    const topBrowserTabs = Array.from(tabUsage.entries())
      .map(([title, duration]) => ({ title, duration }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5);

    return {
      employeeName,
      clientId,
      workTime: workSeconds,
      idleTime: idleSeconds,
      offlineTime: offlineSeconds,
      totalTime: totalSeconds,
      productivityRate: totalSeconds > 0 ? (workSeconds / totalSeconds) * 100 : 0,
      topApplications,
      topBrowserTabs,
      firstActivity,
      lastActivity,
    };
  }

  /**
   * Send EOD report to a specific employee
   */
  async sendEODReport(clientId: string, employeeName: string, email: string): Promise<void> {
    try {
      logger.info(`📧 Sending EOD report to ${email} for ${employeeName} (${clientId})`);

      const data = await this.generateEmployeeDayData(clientId, employeeName);
      
      if (!data) {
        logger.warn(`⚠️ No data available for ${employeeName} today, skipping email`);
        return;
      }

      await emailService.sendEODReport(email, data);
      logger.info(`✅ EOD report sent successfully to ${email}`);
    } catch (error) {
      logger.error(`❌ Failed to send EOD report to ${email}:`, error);
      throw error;
    }
  }

  /**
   * Send all enabled EOD reports
   */
  async sendAllEODReports(): Promise<void> {
    try {
      const configs = await EODReportConfig.find({ enabled: true }).lean();
      
      if (configs.length === 0) {
        logger.info('ℹ️ No enabled EOD report configurations found');
        return;
      }

      logger.info(`📧 Sending ${configs.length} EOD reports...`);

      const results = await Promise.allSettled(
        configs.map(config => 
          this.sendEODReport(config.clientId, config.employeeName, config.email)
        )
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      logger.info(`✅ EOD reports sent: ${successful} successful, ${failed} failed`);
    } catch (error) {
      logger.error('❌ Error sending EOD reports:', error);
      throw error;
    }
  }

  /**
   * Update scheduler time
   */
  async updateSchedulerTime(time: string): Promise<void> {
    const [hour, minute] = time.split(':').map(Number);

    if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error('Invalid time format. Use HH:MM (24-hour format)');
    }

    this.scheduleDailyReports(hour, minute);
    logger.info(`✅ EOD report scheduler updated to ${time}`);
  }
}

export const eodReportsService = new EODReportsService();
