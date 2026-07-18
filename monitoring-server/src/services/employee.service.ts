import { Employee, ActivityLog, Screenshot } from '../database/schemas';
import { EmployeeSummary, EmployeeDetail } from '../models/employee.model';
import { logger } from '../utils/logger';
import { isValidEmployeeName } from '../models/validation.schemas';
import { config } from '../config';
import {
  startOfDay as tzStartOfDay,
  endOfDay as tzEndOfDay,
  dayAtHour,
  toDateStr,
  isSameZonedDay,
  addDaysStr,
  weekdayOf,
} from '../utils/timezone';
import { computeProductivity, categorize } from '../utils/productivity';

// The desktop client heartbeats every 45 seconds. Two missed heartbeats means
// it is no longer safe to present the employee as currently online.
const ACTIVE_HEARTBEAT_GRACE_MINUTES = 2;

// Sentinel name for the Command Center's "All Employees" selection: app/tab
// usage is aggregated across every employee's activity logs instead of one.
export const ALL_EMPLOYEES_SENTINEL = '__all__';

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
      // "Today" is the current calendar day in the business timezone (IST),
      // not the server process timezone.
      const startOfDay = tzStartOfDay();

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
          if (minutesSinceUpdate < ACTIVE_HEARTBEAT_GRACE_MINUTES) {
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
        startOfDay = tzStartOfDay(startDateStr);
        endOfDay = tzEndOfDay(endDateStr);
      } else {
        // Default to today (business timezone)
        startOfDay = tzStartOfDay();
        endOfDay = tzEndOfDay();
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

      // Productivity metrics: categorize apps/websites and derive a score.
      const workSecondsTotal = todayLogs.reduce((s, l) => s + l.workSeconds, 0);
      const idleSecondsTotal = todayLogs.reduce((s, l) => s + l.idleSeconds, 0);
      const { score, categorySeconds, websites } = computeProductivity(
        currentApplications.map((a) => ({ name: a.name, duration: a.duration })),
        currentBrowserTabs.map((t) => ({ title: t.title, url: t.url, duration: t.duration }))
      );

      // Intensity + genuineness aggregation for the day (privacy-safe).
      let keystrokes = 0;
      let mouseClicks = 0;
      let mouseDistancePx = 0;
      let scrollEvents = 0;
      let suspectedFakeSeconds = 0;
      let genuinenessSum = 0;
      let genuinenessCount = 0;
      const reasonSet = new Set<string>();
      for (const l of todayLogs as any[]) {
        keystrokes += l.keystrokes || 0;
        mouseClicks += l.mouseClicks || 0;
        mouseDistancePx += l.mouseDistancePx || 0;
        scrollEvents += l.scrollEvents || 0;
        suspectedFakeSeconds += l.suspectedFakeSeconds || 0;
        if (typeof l.genuinenessScore === 'number') {
          genuinenessSum += l.genuinenessScore;
          genuinenessCount++;
        }
        for (const r of (l.suspicionReasons || [])) reasonSet.add(r);
      }
      const activeMinutes = Math.max(1, (workSecondsTotal + idleSecondsTotal) / 60);

      return {
        name: employee.name,
        location: employee.location,
        current_applications: currentApplications.map((a) => ({
          ...a,
          category: categorize(a.name),
        })),
        current_browser_tabs: currentBrowserTabs,
        activity_history: activityHistory.map((log) => ({
          timestamp: log.timestamp,
          work_seconds: log.workSeconds,
          idle_seconds: log.idleSeconds,
        })),
        recent_screenshots: recentScreenshots,
        productivity: {
          score,
          work_seconds: workSecondsTotal,
          idle_seconds: idleSecondsTotal,
          category_seconds: categorySeconds,
        },
        website_usage: websites,
        integrity: {
          keystrokes,
          mouse_clicks: mouseClicks,
          mouse_distance_px: mouseDistancePx,
          scroll_events: scrollEvents,
          keystrokes_per_min: Math.round((keystrokes / activeMinutes) * 10) / 10,
          mouse_activity_per_min: Math.round(((mouseClicks + scrollEvents) / activeMinutes) * 10) / 10,
          suspected_fake_seconds: Math.round(suspectedFakeSeconds),
          genuineness_score: genuinenessCount > 0 ? Math.round(genuinenessSum / genuinenessCount) : 100,
          suspicion_reasons: Array.from(reasonSet),
        },
      };
    } catch (error) {
      logger.error(`Failed to fetch employee detail for ${trimmedName}:`, error);
      throw error;
    }
  }

  /**
   * Touch an employee's last_seen by name (used by the fast heartbeat so
   * offline detection is timely and independent of the data-send interval).
   * No-op if the employee record doesn't exist yet.
   */
  async touchLastSeenByName(name: string): Promise<void> {
    if (!name || !isValidEmployeeName(name)) return;
    try {
      await Employee.updateOne({ name: name.trim() }, { $set: { lastSeen: new Date() } });
    } catch (error) {
      logger.debug(`touchLastSeenByName failed for ${name}: ${error}`);
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

    const isAll = name === ALL_EMPLOYEES_SENTINEL;

    if (!isAll && !isValidEmployeeName(name)) {
      throw new Error('Invalid employee name');
    }

    const trimmedName = name.trim();

    try {
      const employee = isAll ? null : await Employee.findOne({ name: trimmedName });
      if (!isAll && !employee) {
        return null;
      }

      // Determine time range based on period or custom dates
      let startDate: Date;
      let endDate: Date;

      if (startDateStr && endDateStr) {
        // Use custom date range (business timezone day boundaries)
        startDate = tzStartOfDay(startDateStr);
        endDate = tzEndOfDay(endDateStr);
      } else {
        // Use period-based range, anchored to the business timezone
        const todayStr = toDateStr(new Date());
        endDate = tzEndOfDay(todayStr);

        switch (period) {
          case 'today':
            startDate = tzStartOfDay(todayStr);
            break;
          case 'week':
            startDate = tzStartOfDay(addDaysStr(todayStr, -6));
            break;
          case 'month':
            startDate = tzStartOfDay(addDaysStr(todayStr, -29));
            break;
          default:
            startDate = tzStartOfDay(todayStr);
        }
      }

      // Aggregate application usage from activity logs. For "All Employees" we
      // omit the employeeId filter so every employee's logs are combined.
      const logQuery: any = { timestamp: { $gte: startDate, $lte: endDate } };
      if (!isAll) logQuery.employeeId = employee!._id;
      const logs = await ActivityLog.find(logQuery);

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
        employee_name: isAll ? 'All Employees' : employee!.name,
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

    const isAll = name === ALL_EMPLOYEES_SENTINEL;

    if (!isAll && !isValidEmployeeName(name)) {
      throw new Error('Invalid employee name');
    }

    const trimmedName = name.trim();

    try {
      const employee = isAll ? null : await Employee.findOne({ name: trimmedName });
      if (!isAll && !employee) {
        return null;
      }

      // Determine time range based on period or custom dates
      let startDate: Date;
      let endDate: Date;

      if (startDateStr && endDateStr) {
        // Use custom date range (business timezone day boundaries)
        startDate = tzStartOfDay(startDateStr);
        endDate = tzEndOfDay(endDateStr);
      } else {
        // Use period-based range, anchored to the business timezone
        const todayStr = toDateStr(new Date());
        endDate = tzEndOfDay(todayStr);

        switch (period) {
          case 'today':
            startDate = tzStartOfDay(todayStr);
            break;
          case 'week':
            startDate = tzStartOfDay(addDaysStr(todayStr, -6));
            break;
          case 'month':
            startDate = tzStartOfDay(addDaysStr(todayStr, -29));
            break;
          default:
            startDate = tzStartOfDay(todayStr);
        }
      }

      // Aggregate browser tab usage from activity logs. For "All Employees" we
      // omit the employeeId filter so every employee's logs are combined.
      const logQuery: any = { timestamp: { $gte: startDate, $lte: endDate } };
      if (!isAll) logQuery.employeeId = employee!._id;
      const logs = await ActivityLog.find(logQuery);

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
        employee_name: isAll ? 'All Employees' : employee!.name,
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

      // Resolve the target calendar day in the business timezone.
      const resolvedDateStr = dateStr ? toDateStr(new Date(dateStr)) : toDateStr(new Date());
      const startOfDay = tzStartOfDay(resolvedDateStr);
      const endOfDay = tzEndOfDay(resolvedDateStr);
      const todayStr = toDateStr(new Date());

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
            const isToday = resolvedDateStr === todayStr;
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
            const isToday = resolvedDateStr === todayStr;
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

  async getEmployeesTimelineRange(startDateStr: string, endDateStr: string): Promise<any[]> {
    const timelines: any[] = [];
    let cursor = startDateStr;

    for (let guard = 0; guard < 400; guard++) {
      const dayTimelines = await this.getEmployeesTimeline(cursor);
      timelines.push(...dayTimelines.map((timeline) => ({ ...timeline, date: cursor })));
      if (cursor === endDateStr) break;
      cursor = addDaysStr(cursor, 1);
    }

    return timelines;
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

      // Get last 7 days (today + past 6 days), anchored to the business timezone
      const todayStr = toDateStr(new Date());
      logger.info(`📅 Today's date: ${todayStr}`);

      const sixDaysAgoStr = addDaysStr(todayStr, -6);
      logger.info(`📅 Six days ago: ${sixDaysAgoStr}`);

      const dailyTimelines = [];

      // Generate timeline for each day (from 6 days ago to today)
      for (let i = 0; i < 7; i++) {
        const targetDateStr = addDaysStr(sixDaysAgoStr, i);
        logger.info(`📅 Processing day ${i}: ${targetDateStr}`);

        const startOfDay = tzStartOfDay(targetDateStr);
        const endOfDay = tzEndOfDay(targetDateStr);

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
          const isToday = targetDateStr === todayStr;
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
          const isToday = targetDateStr === todayStr;
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
          date: targetDateStr,
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
      // Month boundaries in the business timezone (IST), as UTC instants.
      const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`;
      const daysInMonth = new Date(year, month, 0).getDate();
      const monthEndStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
      const startDate = tzStartOfDay(monthStartStr);
      const endDate = tzEndOfDay(monthEndStr);

      logger.info(`Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

      // Expected productive window per working day = shift length (not a full 24h).
      const shiftSecondsPerDay = Math.max(0, (config.shiftEndHour - config.shiftStartHour) * 3600);

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

        // Group logs by calendar day (business timezone) so offline is computed
        // per attended day against the shift window, not against a 24h/day month.
        const perDay = new Map<string, { work: number; idle: number }>();
        for (const log of logs) {
          const dayKey = toDateStr(new Date(log.timestamp));
          const bucket = perDay.get(dayKey) || { work: 0, idle: 0 };
          bucket.work += log.workSeconds;
          bucket.idle += log.idleSeconds;
          perDay.set(dayKey, bucket);
        }

        let totalWorkSeconds = 0;
        let totalIdleSeconds = 0;
        let totalOfflineSeconds = 0;

        for (const [dayKey, bucket] of perDay) {
          totalWorkSeconds += bucket.work;
          totalIdleSeconds += bucket.idle;

          // Sundays are non-working days: no expected shift, so no offline padding.
          const isSunday = weekdayOf(dayKey) === 0;
          if (!isSunday) {
            const accounted = bucket.work + bucket.idle;
            // Offline = unattended portion of the expected shift for that day,
            // capped so heavy overtime days never produce negative offline.
            totalOfflineSeconds += Math.max(0, shiftSecondsPerDay - accounted);
          }
        }

        // First/last activity as representative time-of-day across attended days:
        // earliest start and latest end, so the export reads as a real shift window
        // rather than two timestamps from different calendar days.
        const firstActivity = logs[0].intervalStart;
        const lastActivity = logs[logs.length - 1].intervalEnd;

        const attendedDays = perDay.size;
        const totalHours = (totalWorkSeconds + totalIdleSeconds + totalOfflineSeconds) / 3600;

        const employeeData: any = {
          employee_name: employee.name,
          first_activity: firstActivity,
          last_activity: lastActivity,
          days_present: attendedDays,
          productive_hours: totalWorkSeconds / 3600,
          idle_hours: totalIdleSeconds / 3600,
          offline_hours: totalOfflineSeconds / 3600,
          total_hours: totalHours,
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
