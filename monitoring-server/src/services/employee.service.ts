import { Employee, ActivityLog, Screenshot } from '../database/schemas';
import { EmployeeSummary, EmployeeDetail } from '../models/employee.model';
import { logger } from '../utils/logger';
import { isValidEmployeeName } from '../models/validation.schemas';

/**
 * Service for managing employee data with MongoDB
 */
export class EmployeeService {
  /**
   * Get or create employee by name (upsert)
   */
  async upsertEmployee(
    name: string,
    location?: { city: string; state: string; country: string }
  ): Promise<any> {
    if (!isValidEmployeeName(name)) {
      throw new Error('Invalid employee name');
    }

    const trimmedName = name.trim();
    logger.info(`Upserting employee: ${trimmedName}${location ? ` with location: ${JSON.stringify(location)}` : ' (no location)'}`);

    try {
      const updateData: any = {
        $set: { lastSeen: new Date() },
        $setOnInsert: { firstSeen: new Date() },
      };

      // Update location if provided
      if (location) {
        updateData.$set.location = location;
        logger.info(`Setting location for ${trimmedName}: ${location.city}, ${location.state}, ${location.country}`);
      }

      const employee = await Employee.findOneAndUpdate(
        { name: trimmedName },
        updateData,
        { upsert: true, new: true }
      );

      logger.info(`Employee upserted successfully: ${employee._id}${employee.location ? ` - Location: ${employee.location.city}, ${employee.location.state}` : ' - No location'}`);
      return {
        id: employee._id.toString(),
        name: employee.name,
        location: employee.location,
        first_seen: employee.firstSeen,
        last_seen: employee.lastSeen,
        created_at: employee.createdAt,
        updated_at: employee.updatedAt,
      };
    } catch (error) {
      logger.error(`Failed to upsert employee ${trimmedName}:`, error);
      throw error;
    }
  }

  /**
   * Get employee by name
   */
  async getEmployeeByName(name: string): Promise<any | null> {
    if (!isValidEmployeeName(name)) {
      throw new Error('Invalid employee name');
    }

    const trimmedName = name.trim();
    logger.debug(`Fetching employee by name: ${trimmedName}`);

    try {
      const employee = await Employee.findOne({ name: trimmedName });
      if (!employee) return null;

      return {
        id: employee._id.toString(),
        name: employee.name,
        first_seen: employee.firstSeen,
        last_seen: employee.lastSeen,
        created_at: employee.createdAt,
        updated_at: employee.updatedAt,
      };
    } catch (error) {
      logger.error(`Failed to fetch employee ${trimmedName}:`, error);
      throw error;
    }
  }

  /**
   * Get employee by employee ID (from connected clients)
   */
  async getEmployeeByEmployeeId(employeeId: string): Promise<any | null> {
    logger.debug(`Fetching employee by employee ID: ${employeeId}`);

    try {
      // First, try to find the connected client with this employee ID
      const { ConnectedClient } = await import('../database/schemas');
      const connectedClient = await ConnectedClient.findOne({ employeeId });
      
      if (!connectedClient) {
        logger.warn(`No connected client found with employee ID: ${employeeId}`);
        return null;
      }

      // Get the employee name from the connected client
      const employeeName = connectedClient.employeeName;
      if (!employeeName) {
        logger.warn(`Connected client has no employee name for ID: ${employeeId}`);
        return null;
      }

      // Fetch the employee by name
      return await this.getEmployeeByName(employeeName);
    } catch (error) {
      logger.error(`Failed to fetch employee by ID ${employeeId}:`, error);
      throw error;
    }
  }

  /**
   * Get all employees
   */
  async getAllEmployees(): Promise<any[]> {
    logger.debug('Fetching all employees');

    try {
      const employees = await Employee.find().sort({ name: 1 });
      return employees.map((employee) => ({
        id: employee._id.toString(),
        name: employee.name,
        first_seen: employee.firstSeen,
        last_seen: employee.lastSeen,
        created_at: employee.createdAt,
        updated_at: employee.updatedAt,
      }));
    } catch (error) {
      logger.error('Failed to fetch all employees:', error);
      throw error;
    }
  }

  /**
   * Get all employees with summary data
   * Only returns employees that have actual employee names (not just client IDs)
   */
  async getAllEmployeesWithSummary(): Promise<EmployeeSummary[]> {
    logger.info('Fetching all employees with summary data');

    try {
      const employees = await Employee.find().sort({ name: 1 });
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const summaries = await Promise.all(
        employees.map(async (employee) => {
          // Get today's activity logs
          const logs = await ActivityLog.find({
            employeeId: employee._id,
            timestamp: { $gte: startOfDay },
          });

          const workTimeToday = logs.reduce((sum, log) => sum + log.workSeconds, 0);
          const idleTimeToday = logs.reduce((sum, log) => sum + log.idleSeconds, 0);

          // Determine status
          const lastUpdate = employee.lastSeen;
          const now = new Date();
          const minutesSinceUpdate = (now.getTime() - lastUpdate.getTime()) / 60000;

          let status: 'active' | 'idle' | 'offline';
          if (minutesSinceUpdate < 15) {
            status = 'active';
          } else if (minutesSinceUpdate < 60) {
            status = 'idle';
          } else {
            status = 'offline';
          }

          const summary = {
            name: employee.name,
            location: employee.location,
            work_time_today: workTimeToday,
            idle_time_today: idleTimeToday,
            last_update: lastUpdate,
            status,
          };

          // Log location data for debugging
          if (employee.location) {
            logger.debug(`Employee ${employee.name} has location: ${JSON.stringify(employee.location)}`);
          } else {
            logger.debug(`Employee ${employee.name} has NO location data`);
          }

          return summary;
        })
      );

      // Filter out entries that look like client IDs:
      // - 24-character hex strings (MongoDB ObjectIds)
      // - UUIDs (8-4-4-4-12 format with dashes)
      const filteredSummaries = summaries.filter(summary => {
        const isMongoId = /^[a-f0-9]{24}$/i.test(summary.name);
        const isUUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(summary.name);
        
        if (isMongoId || isUUID) {
          logger.debug(`Filtering out client ID from employee list: ${summary.name}`);
          return false;
        }
        return true;
      });

      logger.info(`Returning ${filteredSummaries.length} employee summaries (filtered from ${summaries.length})`);
      // Log how many have location data
      const withLocation = filteredSummaries.filter(s => s.location).length;
      logger.info(`${withLocation} employees have location data`);

      return filteredSummaries;
    } catch (error) {
      logger.error('Failed to fetch employee summaries:', error);
      throw error;
    }
  }

  /**
   * Get detailed data for specific employee
   */
  async getEmployeeDetail(name: string, startDateStr?: string, endDateStr?: string): Promise<EmployeeDetail | null> {
    logger.info(`Fetching employee detail: ${name}, startDate: ${startDateStr}, endDate: ${endDateStr}`);

    if (!isValidEmployeeName(name)) {
      throw new Error('Invalid employee name');
    }

    const trimmedName = name.trim();

    try {
      const employee = await Employee.findOne({ name: trimmedName });
      if (!employee) {
        return null;
      }

      // Determine date range
      let startOfDay: Date;
      let endOfDay: Date;

      if (startDateStr && endDateStr) {
        startOfDay = new Date(startDateStr);
        startOfDay.setHours(0, 0, 0, 0);
        endOfDay = new Date(endDateStr);
        endOfDay.setHours(23, 59, 59, 999);
      } else {
        // Default to today
        startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
      }

      const todayLogs = await ActivityLog.find({
        employeeId: employee._id,
        timestamp: { $gte: startOfDay, $lte: endOfDay },
      });

      // Aggregate application durations from all today's logs
      const appUsageMap = new Map<string, number>();
      todayLogs.forEach((log) => {
        log.applications.forEach((app: any) => {
          const currentDuration = appUsageMap.get(app.name) || 0;
          appUsageMap.set(app.name, currentDuration + (app.duration || 0));
        });
      });

      // Convert to array and sort by duration (highest to lowest)
      const currentApplications = Array.from(appUsageMap.entries())
        .map(([name, duration]) => ({
          name,
          duration,
          active: true,
        }))
        .sort((a, b) => b.duration - a.duration);

      // Aggregate browser tab durations from all today's logs
      const tabUsageMap = new Map<string, { title: string; url: string; duration: number; browser: string }>();
      todayLogs.forEach((log) => {
        log.browserTabs.forEach((tab: any) => {
          const tabKey = `${tab.title}|${tab.url}`;
          const existing = tabUsageMap.get(tabKey);
          if (existing) {
            existing.duration += (tab.duration || 0);
          } else {
            tabUsageMap.set(tabKey, {
              title: tab.title,
              url: tab.url,
              duration: tab.duration || 0,
              browser: 'Unknown', // Browser info not stored in schema
            });
          }
        });
      });

      // Convert to array and sort by duration (highest to lowest)
      const currentBrowserTabs = Array.from(tabUsageMap.values())
        .sort((a, b) => b.duration - a.duration);

      // Get activity history for date range
      const activityHistory = await ActivityLog.find({
        employeeId: employee._id,
        timestamp: { $gte: startOfDay, $lte: endOfDay },
      })
        .sort({ timestamp: 1 })
        .select('timestamp workSeconds idleSeconds');

      // Get recent screenshots
      const screenshots = await Screenshot.find({
        employeeId: employee._id,
      })
        .sort({ capturedAt: -1 })
        .limit(20)
        .select('_id capturedAt');

      const recentScreenshots = screenshots.map((screenshot) => ({
        id: screenshot._id.toString(),
        thumbnail_url: `/api/screenshots/${screenshot._id}`,
        full_url: `/api/screenshots/${screenshot._id}`,
        captured_at: screenshot.capturedAt,
      }));

      return {
        name: employee.name,
        location: employee.location,
        current_applications: currentApplications,
        current_browser_tabs: currentBrowserTabs,
        activity_history: activityHistory.map((log) => ({
          timestamp: log.timestamp,
          work_seconds: log.workSeconds,
          idle_seconds: log.idleSeconds,
        })),
        recent_screenshots: recentScreenshots,
      };
    } catch (error) {
      logger.error(`Failed to fetch employee detail for ${trimmedName}:`, error);
      throw error;
    }
  }

  /**
   * Update employee last_seen timestamp
   */
  async updateLastSeen(employeeId: string): Promise<void> {
    logger.debug(`Updating last_seen for employee: ${employeeId}`);

    try {
      await Employee.findByIdAndUpdate(employeeId, {
        lastSeen: new Date(),
      });

      logger.debug(`Updated last_seen for employee: ${employeeId}`);
    } catch (error) {
      logger.error(`Failed to update last_seen for employee ${employeeId}:`, error);
      throw error;
    }
  }

  /**
   * Get application usage statistics for an employee
   */
  async getApplicationUsage(name: string, period: string = 'today', startDateStr?: string, endDateStr?: string): Promise<any | null> {
    logger.info(`Fetching application usage for ${name}, period: ${period}, startDate: ${startDateStr}, endDate: ${endDateStr}`);

    if (!isValidEmployeeName(name)) {
      throw new Error('Invalid employee name');
    }

    const trimmedName = name.trim();

    try {
      const employee = await Employee.findOne({ name: trimmedName });
      if (!employee) {
        return null;
      }

      // Determine time range based on period or custom dates
      let startDate: Date;
      let endDate: Date;

      if (startDateStr && endDateStr) {
        // Use custom date range
        startDate = new Date(startDateStr);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(endDateStr);
        endDate.setHours(23, 59, 59, 999);
      } else {
        // Use period-based range
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);

        switch (period) {
          case 'today':
            startDate = new Date();
            startDate.setHours(0, 0, 0, 0);
            break;
          case 'week':
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 7);
            break;
          case 'month':
            startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 1);
            break;
          default:
            startDate = new Date();
            startDate.setHours(0, 0, 0, 0);
        }
      }

      // Aggregate application usage from activity logs
      const logs = await ActivityLog.find({
        employeeId: employee._id,
        timestamp: { $gte: startDate, $lte: endDate },
      });

      // Aggregate durations by application name
      const appUsageMap = new Map<string, number>();
      let totalDuration = 0;

      logs.forEach((log) => {
        log.applications.forEach((app: any) => {
          // Handle both old format (active: boolean) and new format (duration: number)
          let duration = 0;
          if (app.duration !== undefined && typeof app.duration === 'number') {
            duration = app.duration;
          } else if (app.active === true) {
            // Old format: if active, assume it was used for the entire interval
            // This is an approximation since we don't have actual duration
            duration = 0; // Don't count old data
          }
          
          if (duration > 0) {
            const currentDuration = appUsageMap.get(app.name) || 0;
            appUsageMap.set(app.name, currentDuration + duration);
            totalDuration += duration;
          }
        });
      });

      // Convert to array and sort by duration
      const applications = Array.from(appUsageMap.entries())
        .map(([name, duration]) => ({
          name,
          duration,
          percentage: totalDuration > 0 ? (duration / totalDuration) * 100 : 0,
        }))
        .sort((a, b) => b.duration - a.duration);

      return {
        employee_name: employee.name,
        period,
        start_date: startDate,
        end_date: endDate,
        total_duration: totalDuration,
        applications,
      };
    } catch (error) {
      logger.error(`Failed to fetch application usage for ${trimmedName}:`, error);
      throw error;
    }
  }

  /**
   * Get browser tab usage statistics for an employee
   */
  async getBrowserTabUsage(name: string, period: string = 'today', startDateStr?: string, endDateStr?: string): Promise<any | null> {
    logger.info(`Fetching browser tab usage for ${name}, period: ${period}, startDate: ${startDateStr}, endDate: ${endDateStr}`);

    if (!isValidEmployeeName(name)) {
      throw new Error('Invalid employee name');
    }

    const trimmedName = name.trim();

    try {
      const employee = await Employee.findOne({ name: trimmedName });
      if (!employee) {
        return null;
      }

      // Determine time range based on period or custom dates
      let startDate: Date;
      let endDate: Date;

      if (startDateStr && endDateStr) {
        // Use custom date range
        startDate = new Date(startDateStr);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(endDateStr);
        endDate.setHours(23, 59, 59, 999);
      } else {
        // Use period-based range
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);

        switch (period) {
          case 'today':
            startDate = new Date();
            startDate.setHours(0, 0, 0, 0);
            break;
          case 'week':
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 7);
            break;
          case 'month':
            startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 1);
            break;
          default:
            startDate = new Date();
            startDate.setHours(0, 0, 0, 0);
        }
      }

      // Aggregate browser tab usage from activity logs
      const logs = await ActivityLog.find({
        employeeId: employee._id,
        timestamp: { $gte: startDate, $lte: endDate },
      });

      // Aggregate durations by tab (title + url)
      const tabUsageMap = new Map<string, { title: string; url: string; duration: number }>();
      let totalDuration = 0;

      logs.forEach((log) => {
        log.browserTabs.forEach((tab: any) => {
          const duration = tab.duration || 0;
          
          if (duration > 0) {
            const tabKey = `${tab.title}|${tab.url}`;
            const existing = tabUsageMap.get(tabKey);
            
            if (existing) {
              existing.duration += duration;
            } else {
              tabUsageMap.set(tabKey, {
                title: tab.title,
                url: tab.url,
                duration: duration,
              });
            }
            
            totalDuration += duration;
          }
        });
      });

      // Convert to array and sort by duration
      const browserTabs = Array.from(tabUsageMap.values())
        .map((tab) => ({
          title: tab.title,
          url: tab.url,
          duration: tab.duration,
          percentage: totalDuration > 0 ? (tab.duration / totalDuration) * 100 : 0,
        }))
        .sort((a, b) => b.duration - a.duration);

      return {
        employee_name: employee.name,
        period,
        start_date: startDate,
        end_date: endDate,
        total_duration: totalDuration,
        browser_tabs: browserTabs,
      };
    } catch (error) {
      logger.error(`Failed to fetch browser tab usage for ${trimmedName}:`, error);
      throw error;
    }
  }

  /**
   * Get timeline data for all employees showing work/idle/offline periods
   */
  async getEmployeesTimeline(dateStr?: string): Promise<any[]> {
    logger.info('Fetching timeline for all employees');

    try {
      const employees = await Employee.find().sort({ name: 1 });
      
      // Parse date or use today
      const targetDate = dateStr ? new Date(dateStr) : new Date();
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const timelines = await Promise.all(
        employees.map(async (employee) => {
          // Get all activity logs for the day
          const logs = await ActivityLog.find({
            employeeId: employee._id,
            timestamp: { $gte: startOfDay, $lte: endOfDay },
          }).sort({ intervalStart: 1 });

          // Calculate total times
          const workTimeToday = logs.reduce((sum, log) => sum + log.workSeconds, 0);
          const idleTimeToday = logs.reduce((sum, log) => sum + log.idleSeconds, 0);

          // Build timeline segments with work, idle, and offline periods
          const segments: Array<{
            start: Date;
            end: Date;
            type: 'work' | 'idle' | 'offline';
          }> = [];

          // If no logs at all, show entire day as offline
          if (logs.length === 0) {
            const now = new Date();
            const isToday = targetDate.toDateString() === now.toDateString();
            const finalTime = isToday && now < endOfDay ? now : endOfDay;
            
            segments.push({
              start: startOfDay,
              end: finalTime,
              type: 'offline',
            });
          } else {
            // Process logs and fill gaps with offline
            let lastEndTime = startOfDay;

            logs.forEach((log) => {
              const intervalStart = new Date(log.intervalStart);
              const intervalEnd = new Date(log.intervalEnd);
              
              // Add offline segment if there's a gap between last activity and this one
              if (intervalStart.getTime() > lastEndTime.getTime()) {
                segments.push({
                  start: lastEndTime,
                  end: intervalStart,
                  type: 'offline',
                });
              }
              
              // Add work segment if there's work time
              if (log.workSeconds > 0) {
                const workEnd = new Date(intervalStart.getTime() + log.workSeconds * 1000);
                segments.push({
                  start: intervalStart,
                  end: workEnd,
                  type: 'work',
                });
                lastEndTime = workEnd;
              }
              
              // Add idle segment if there's idle time
              if (log.idleSeconds > 0) {
                const idleStart = log.workSeconds > 0 
                  ? new Date(intervalStart.getTime() + log.workSeconds * 1000)
                  : intervalStart;
                const idleEnd = new Date(idleStart.getTime() + log.idleSeconds * 1000);
                segments.push({
                  start: idleStart,
                  end: idleEnd,
                  type: 'idle',
                });
                lastEndTime = idleEnd;
              }
              
              // If no work or idle time, update lastEndTime to intervalEnd
              if (log.workSeconds === 0 && log.idleSeconds === 0) {
                lastEndTime = intervalEnd;
              }
            });

            // Add final offline segment from last activity to end of day (or now if today)
            const now = new Date();
            const isToday = targetDate.toDateString() === now.toDateString();
            const finalTime = isToday && now < endOfDay ? now : endOfDay;
            
            if (lastEndTime < finalTime) {
              segments.push({
                start: lastEndTime,
                end: finalTime,
                type: 'offline',
              });
            }
          }

          // Determine current status
          const lastUpdate = employee.lastSeen;
          const now = new Date();
          const minutesSinceUpdate = (now.getTime() - lastUpdate.getTime()) / 60000;

          let status: 'active' | 'idle' | 'offline';
          if (minutesSinceUpdate < 15) {
            status = 'active';
          } else if (minutesSinceUpdate < 60) {
            status = 'idle';
          } else {
            status = 'offline';
          }

          return {
            name: employee.name,
            status,
            work_time_today: workTimeToday,
            idle_time_today: idleTimeToday,
            segments,
          };
        })
      );

      // Filter out entries that look like client IDs:
      // - 24-character hex strings (MongoDB ObjectIds)
      // - UUIDs (8-4-4-4-12 format with dashes)
      const filteredTimelines = timelines.filter(timeline => {
        const isMongoId = /^[a-f0-9]{24}$/i.test(timeline.name);
        const isUUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(timeline.name);
        
        if (isMongoId || isUUID) {
          logger.debug(`Filtering out client ID from timeline: ${timeline.name}`);
          return false;
        }
        return true;
      });

      logger.info(`Returning timeline for ${filteredTimelines.length} employees with segments (filtered from ${timelines.length})`);
      return filteredTimelines;
    } catch (error) {
      logger.error('Failed to fetch employees timeline:', error);
      throw error;
    }
  }

  /**
   * Get weekly timeline data for a specific employee
   */
  async getEmployeeWeeklyTimeline(name: string): Promise<any> {
    logger.info(`Fetching weekly timeline for employee: ${name}`);

    if (!isValidEmployeeName(name)) {
      throw new Error('Invalid employee name');
    }

    const trimmedName = name.trim();

    try {
      const employee = await Employee.findOne({ name: trimmedName });
      if (!employee) {
        return null;
      }

      // Get last 7 days (today + past 6 days)
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      
      // Use local date to avoid timezone issues
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      logger.info(`📅 Today's date: ${todayStr}`);
      
      const sixDaysAgo = new Date(today);
      sixDaysAgo.setDate(today.getDate() - 6); // 6 days before today
      
      const sixDaysAgoStr = `${sixDaysAgo.getFullYear()}-${String(sixDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sixDaysAgo.getDate()).padStart(2, '0')}`;
      logger.info(`📅 Six days ago: ${sixDaysAgoStr}`);

      const dailyTimelines = [];

      // Generate timeline for each day (from 6 days ago to today)
      for (let i = 0; i < 7; i++) {
        const targetDate = new Date(sixDaysAgo);
        targetDate.setDate(sixDaysAgo.getDate() + i);
        
        // Use local date to avoid timezone issues
        const targetDateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
        logger.info(`📅 Processing day ${i}: ${targetDateStr}`);
        
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Get all activity logs for the day
        const logs = await ActivityLog.find({
          employeeId: employee._id,
          timestamp: { $gte: startOfDay, $lte: endOfDay },
        }).sort({ intervalStart: 1 });

        // Calculate total times
        const workTimeToday = logs.reduce((sum, log) => sum + log.workSeconds, 0);
        const idleTimeToday = logs.reduce((sum, log) => sum + log.idleSeconds, 0);

        // Build timeline segments
        const segments: Array<{
          start: Date;
          end: Date;
          type: 'work' | 'idle' | 'offline';
        }> = [];

        if (logs.length === 0) {
          const now = new Date();
          const isToday = targetDate.toDateString() === now.toDateString();
          const finalTime = isToday && now < endOfDay ? now : endOfDay;
          
          segments.push({
            start: startOfDay,
            end: finalTime,
            type: 'offline',
          });
        } else {
          let lastEndTime = startOfDay;

          logs.forEach((log) => {
            const intervalStart = new Date(log.intervalStart);
            const intervalEnd = new Date(log.intervalEnd);
            
            if (intervalStart.getTime() > lastEndTime.getTime()) {
              segments.push({
                start: lastEndTime,
                end: intervalStart,
                type: 'offline',
              });
            }
            
            if (log.workSeconds > 0) {
              const workEnd = new Date(intervalStart.getTime() + log.workSeconds * 1000);
              segments.push({
                start: intervalStart,
                end: workEnd,
                type: 'work',
              });
              lastEndTime = workEnd;
            }
            
            if (log.idleSeconds > 0) {
              const idleStart = log.workSeconds > 0 
                ? new Date(intervalStart.getTime() + log.workSeconds * 1000)
                : intervalStart;
              const idleEnd = new Date(idleStart.getTime() + log.idleSeconds * 1000);
              segments.push({
                start: idleStart,
                end: idleEnd,
                type: 'idle',
              });
              lastEndTime = idleEnd;
            }
            
            if (log.workSeconds === 0 && log.idleSeconds === 0) {
              lastEndTime = intervalEnd;
            }
          });

          const now = new Date();
          const isToday = targetDate.toDateString() === now.toDateString();
          const finalTime = isToday && now < endOfDay ? now : endOfDay;
          
          if (lastEndTime < finalTime) {
            segments.push({
              start: lastEndTime,
              end: finalTime,
              type: 'offline',
            });
          }
        }

        dailyTimelines.push({
          date: `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`,
          work_time: workTimeToday,
          idle_time: idleTimeToday,
          segments,
        });
      }

      return {
        employee_name: employee.name,
        daily_timelines: dailyTimelines,
      };
    } catch (error) {
      logger.error(`Failed to fetch weekly timeline for ${trimmedName}:`, error);
      throw error;
    }
  }
  /**
   * Get monthly timesheet report for all employees
   * Aggregates daily data for the entire month
   * 
   * @param year - Year (e.g., 2026)
   * @param month - Month (1-12)
   * @returns Monthly timesheet data for all employees
   */
  async getMonthlyTimesheetReport(
    year: number,
    month: number
  ): Promise<any[]> {
    logger.info(`Fetching monthly timesheet report for ${year}-${month}`);

    try {
      // Calculate start and end of month
      const startDate = new Date(year, month - 1, 1);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(year, month, 0); // Last day of month
      endDate.setHours(23, 59, 59, 999);

      logger.info(`Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

      // Get all employees
      const employees = await Employee.find().lean();
      
      const timesheetData = [];

      for (const employee of employees) {
        // Get all activity logs for the month
        const logs = await ActivityLog.find({
          employeeId: employee._id,
          timestamp: { $gte: startDate, $lte: endDate },
        }).sort({ intervalStart: 1 }).lean();

        if (logs.length === 0) {
          // Employee has no activity this month
          continue;
        }

        // Calculate totals
        const totalWorkSeconds = logs.reduce((sum, log) => sum + log.workSeconds, 0);
        const totalIdleSeconds = logs.reduce((sum, log) => sum + log.idleSeconds, 0);
        
        // Calculate offline hours (total working hours in month - work - idle)
        // Exclude Sundays from the calculation
        const daysInMonth = new Date(year, month, 0).getDate();
        let workingDays = 0;
        
        // Count non-Sunday days in the month
        for (let day = 1; day <= daysInMonth; day++) {
          const date = new Date(year, month - 1, day);
          const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
          if (dayOfWeek !== 0) { // Exclude Sundays (0)
            workingDays++;
          }
        }
        
        const totalSecondsInWorkingDays = workingDays * 24 * 3600;
        const totalOfflineSeconds = Math.max(0, totalSecondsInWorkingDays - totalWorkSeconds - totalIdleSeconds);

        // Find first and last activity
        const firstActivity = logs[0].intervalStart;
        const lastActivity = logs[logs.length - 1].intervalEnd;

        const employeeData: any = {
          employee_name: employee.name,
          first_activity: firstActivity,
          last_activity: lastActivity,
          productive_hours: totalWorkSeconds / 3600,
          idle_hours: totalIdleSeconds / 3600,
          offline_hours: totalOfflineSeconds / 3600,
          total_hours: (totalWorkSeconds + totalIdleSeconds + totalOfflineSeconds) / 3600,
        };

        timesheetData.push(employeeData);
      }

      // Filter out entries that look like client IDs (24-character hex strings)
      const filteredTimesheetData = timesheetData.filter(data => {
        const isClientId = /^[a-f0-9]{24}$/i.test(data.employee_name);
        if (isClientId) {
          logger.debug(`Filtering out client ID from timesheet: ${data.employee_name}`);
        }
        return !isClientId;
      });

      logger.info(`Generated timesheet report for ${filteredTimesheetData.length} employees (filtered from ${timesheetData.length})`);
      return filteredTimesheetData;
    } catch (error) {
      logger.error(`Failed to generate monthly timesheet report:`, error);
      throw error;
    }
  }

  /**
   * Get employee detail by name or employee ID
   * Tries to resolve employee ID to name first, then fetches detail
   */
  async getEmployeeDetailByNameOrId(nameOrId: string, startDateStr?: string, endDateStr?: string): Promise<EmployeeDetail | null> {
    logger.info(`Fetching employee detail by name or ID: ${nameOrId}`);

    try {
      // First try as employee name
      let detail = await this.getEmployeeDetail(nameOrId, startDateStr, endDateStr);
      if (detail) {
        return detail;
      }

      // If not found, try as employee ID
      logger.info(`Employee not found by name, trying as employee ID: ${nameOrId}`);
      const employeeByName = await this.getEmployeeByEmployeeId(nameOrId);
      if (employeeByName) {
        return await this.getEmployeeDetail(employeeByName.name, startDateStr, endDateStr);
      }

      logger.warn(`Employee not found by name or ID: ${nameOrId}`);
      return null;
    } catch (error) {
      logger.error(`Failed to fetch employee detail by name or ID ${nameOrId}:`, error);
      throw error;
    }
  }

  /**
   * Get application usage by name or employee ID
   */
  async getApplicationUsageByNameOrId(nameOrId: string, period: string = 'today', startDateStr?: string, endDateStr?: string): Promise<any | null> {
    logger.info(`Fetching application usage by name or ID: ${nameOrId}`);

    try {
      // First try as employee name
      let usage = await this.getApplicationUsage(nameOrId, period, startDateStr, endDateStr);
      if (usage) {
        return usage;
      }

      // If not found, try as employee ID
      logger.info(`Application usage not found by name, trying as employee ID: ${nameOrId}`);
      const employeeByName = await this.getEmployeeByEmployeeId(nameOrId);
      if (employeeByName) {
        return await this.getApplicationUsage(employeeByName.name, period, startDateStr, endDateStr);
      }

      logger.warn(`Application usage not found by name or ID: ${nameOrId}`);
      return null;
    } catch (error) {
      logger.error(`Failed to fetch application usage by name or ID ${nameOrId}:`, error);
      throw error;
    }
  }

  /**
   * Get browser tab usage by name or employee ID
   */
  async getBrowserTabUsageByNameOrId(nameOrId: string, period: string = 'today', startDateStr?: string, endDateStr?: string): Promise<any | null> {
    logger.info(`Fetching browser tab usage by name or ID: ${nameOrId}`);

    try {
      // First try as employee name
      let usage = await this.getBrowserTabUsage(nameOrId, period, startDateStr, endDateStr);
      if (usage) {
        return usage;
      }

      // If not found, try as employee ID
      logger.info(`Browser tab usage not found by name, trying as employee ID: ${nameOrId}`);
      const employeeByName = await this.getEmployeeByEmployeeId(nameOrId);
      if (employeeByName) {
        return await this.getBrowserTabUsage(employeeByName.name, period, startDateStr, endDateStr);
      }

      logger.warn(`Browser tab usage not found by name or ID: ${nameOrId}`);
      return null;
    } catch (error) {
      logger.error(`Failed to fetch browser tab usage by name or ID ${nameOrId}:`, error);
      throw error;
    }
  }

  /**
   * Get weekly timeline by name or employee ID
   */
  async getEmployeeWeeklyTimelineByNameOrId(nameOrId: string): Promise<any> {
    logger.info(`Fetching weekly timeline by name or ID: ${nameOrId}`);

    try {
      // First try as employee name
      let timeline = await this.getEmployeeWeeklyTimeline(nameOrId);
      if (timeline) {
        return timeline;
      }

      // If not found, try as employee ID
      logger.info(`Weekly timeline not found by name, trying as employee ID: ${nameOrId}`);
      const employeeByName = await this.getEmployeeByEmployeeId(nameOrId);
      if (employeeByName) {
        return await this.getEmployeeWeeklyTimeline(employeeByName.name);
      }

      logger.warn(`Weekly timeline not found by name or ID: ${nameOrId}`);
      return null;
    } catch (error) {
      logger.error(`Failed to fetch weekly timeline by name or ID ${nameOrId}:`, error);
      throw error;
    }
  }
}

export const employeeService = new EmployeeService();
