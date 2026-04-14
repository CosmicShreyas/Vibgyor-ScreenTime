import { Router } from 'express';
import { logger } from '../utils/logger';
import { employeeService } from '../services/employee.service';
import { config } from '../config';

const router = Router();

/**
 * GET /api/employees
 * Returns list of all employees with summary data
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4
 */
router.get('/', async (_req, res) => {
  try {
    logger.info('Fetching all employees with summary data');
    
    const employees = await employeeService.getAllEmployeesWithSummary();
    
    logger.info(`Retrieved ${employees.length} employees`);
    
    // Log location data for debugging
    const withLocation = employees.filter(e => e.location).length;
    logger.info(`API Response: ${withLocation} employees have location data`);
    employees.forEach(emp => {
      if (emp.location) {
        logger.debug(`API: ${emp.name} location: ${JSON.stringify(emp.location)}`);
      }
    });
    
    res.status(200).json(employees);
  } catch (error) {
    logger.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

/**
 * GET /api/employees/timeline/all
 * Returns timeline data for all employees showing work/idle/offline periods
 */
router.get('/timeline/all', async (req, res) => {
  try {
    const { date } = req.query;
    
    logger.info(`Fetching timeline for all employees, date: ${date || 'today'}`);
    
    const timeline = await employeeService.getEmployeesTimeline(date as string);
    
    logger.info(`Retrieved timeline for ${timeline.length} employees`);
    
    // Include shift configuration in response
    res.status(200).json({
      employees: timeline,
      shiftStartHour: config.shiftStartHour,
      shiftEndHour: config.shiftEndHour,
    });
  } catch (error) {
    logger.error('Error fetching employees timeline:', error);
    res.status(500).json({ error: 'Failed to fetch employees timeline' });
  }
});

/**
 * GET /api/employees/:name/weekly-timeline
 * Returns weekly timeline data for specific employee
 * Supports both employee name and employee ID
 * IMPORTANT: This must come BEFORE the generic /:name route
 */
router.get('/:name/weekly-timeline', async (req, res) => {
  try {
    const { name } = req.params;
    
    logger.info(`📅 Fetching weekly timeline for: ${name}`);
    
    const timeline = await employeeService.getEmployeeWeeklyTimelineByNameOrId(name);
    
    if (!timeline) {
      logger.warn(`Employee not found: ${name}`);
      res.status(404).json({ error: 'Employee not found' });
      return;
    }
    
    logger.info(`✅ Retrieved weekly timeline for: ${name} with ${timeline.daily_timelines.length} days`);
    
    res.status(200).json(timeline);
  } catch (error) {
    logger.error(`❌ Error fetching weekly timeline for ${req.params.name}:`, error);
    res.status(500).json({ error: 'Failed to fetch weekly timeline' });
  }
});

/**
 * GET /api/employees/timesheet/monthly
 * Returns monthly timesheet report for all employees
 * Query params: year, month
 */
router.get('/timesheet/monthly', async (req, res) => {
  try {
    const { year, month } = req.query;
    
    if (!year || !month) {
      res.status(400).json({ error: 'year and month are required' });
      return;
    }
    
    const yearNum = parseInt(year as string);
    const monthNum = parseInt(month as string);
    
    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      res.status(400).json({ error: 'Invalid year or month' });
      return;
    }
    
    logger.info(`Fetching monthly timesheet: ${yearNum}-${monthNum}`);
    
    const timesheetData = await employeeService.getMonthlyTimesheetReport(yearNum, monthNum);
    
    logger.info(`Retrieved timesheet data for ${timesheetData.length} employees`);
    res.status(200).json(timesheetData);
  } catch (error) {
    logger.error('Error fetching monthly timesheet:', error);
    res.status(500).json({ error: 'Failed to fetch monthly timesheet' });
  }
});

/**
 * GET /api/employees/:name/app-usage
 * Returns application usage statistics for specific employee
 * Supports both employee name and employee ID
 * Query params: period (optional), startDate (optional), endDate (optional)
 */
router.get('/:name/app-usage', async (req, res) => {
  try {
    const { name } = req.params;
    const { period = 'today', startDate, endDate } = req.query;
    
    logger.info(`📊 Fetching application usage for: ${name}, period: ${period}, startDate: ${startDate}, endDate: ${endDate}`);
    
    const appUsage = await employeeService.getApplicationUsageByNameOrId(
      name, 
      period as string,
      startDate as string | undefined,
      endDate as string | undefined
    );
    
    if (!appUsage) {
      logger.warn(`Employee not found: ${name}`);
      res.status(404).json({ error: 'Employee not found' });
      return;
    }
    
    logger.info(`✅ Retrieved application usage for: ${name}, apps count: ${appUsage.applications.length}`);
    
    res.status(200).json(appUsage);
  } catch (error) {
    logger.error(`❌ Error fetching application usage for ${req.params.name}:`, error);
    res.status(500).json({ error: 'Failed to fetch application usage' });
  }
});

/**
 * GET /api/employees/:name/browser-tab-usage
 * Returns browser tab usage statistics for specific employee
 * Supports both employee name and employee ID
 * Query params: period (optional), startDate (optional), endDate (optional)
 */
router.get('/:name/browser-tab-usage', async (req, res) => {
  try {
    const { name } = req.params;
    const { period = 'today', startDate, endDate } = req.query;
    
    logger.info(`🌐 Fetching browser tab usage for: ${name}, period: ${period}, startDate: ${startDate}, endDate: ${endDate}`);
    
    const tabUsage = await employeeService.getBrowserTabUsageByNameOrId(
      name, 
      period as string,
      startDate as string | undefined,
      endDate as string | undefined
    );
    
    if (!tabUsage) {
      logger.warn(`Employee not found: ${name}`);
      res.status(404).json({ error: 'Employee not found' });
      return;
    }
    
    logger.info(`✅ Retrieved browser tab usage for: ${name}, tabs count: ${tabUsage.browser_tabs.length}`);
    
    res.status(200).json(tabUsage);
  } catch (error) {
    logger.error(`❌ Error fetching browser tab usage for ${req.params.name}:`, error);
    res.status(500).json({ error: 'Failed to fetch browser tab usage' });
  }
});

/**
 * GET /api/employees/by-id/activity
 * Returns complete employee activity data by employee ID (base64 encoded)
 * Query params: eid (required, base64 encoded employee ID), startDate (optional), endDate (optional)
 */
router.get('/by-id/activity', async (req, res) => {
  try {
    const { eid, startDate, endDate } = req.query;
    
    if (!eid) {
      res.status(400).json({ error: 'Employee ID (eid) is required' });
      return;
    }

    // Decode base64 employee ID
    let employeeId: string;
    try {
      employeeId = Buffer.from(eid as string, 'base64').toString('utf-8');
      logger.info(`📋 Decoded employee ID: ${employeeId}`);
    } catch (error) {
      logger.error('Failed to decode employee ID:', error);
      res.status(400).json({ error: 'Invalid employee ID format (must be base64 encoded)' });
      return;
    }

    logger.info(`📋 Fetching complete activity data for employee ID: ${employeeId}, startDate: ${startDate}, endDate: ${endDate}`);
    
    // Get employee detail
    const employeeDetail = await employeeService.getEmployeeDetailByNameOrId(
      employeeId,
      startDate as string | undefined,
      endDate as string | undefined
    );
    
    if (!employeeDetail) {
      logger.warn(`Employee not found with ID: ${employeeId}`);
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    // Get application usage
    const appUsage = await employeeService.getApplicationUsageByNameOrId(
      employeeId,
      'today',
      startDate as string | undefined,
      endDate as string | undefined
    );

    // Get browser tab usage
    const tabUsage = await employeeService.getBrowserTabUsageByNameOrId(
      employeeId,
      'today',
      startDate as string | undefined,
      endDate as string | undefined
    );

    // Get weekly timeline
    const weeklyTimeline = await employeeService.getEmployeeWeeklyTimelineByNameOrId(employeeId);

    logger.info(`✅ Retrieved complete activity data for: ${employeeDetail.name}`);
    
    res.status(200).json({
      employee_name: employeeDetail.name,
      employee_id: employeeId,
      location: employeeDetail.location,
      current_applications: employeeDetail.current_applications,
      current_browser_tabs: employeeDetail.current_browser_tabs,
      activity_history: employeeDetail.activity_history,
      recent_screenshots: employeeDetail.recent_screenshots,
      application_usage: appUsage,
      browser_tab_usage: tabUsage,
      weekly_timeline: weeklyTimeline,
    });
  } catch (error) {
    logger.error('Error fetching employee activity data:', error);
    res.status(500).json({ error: 'Failed to fetch employee activity data' });
  }
});

/**
 * GET /api/employees/:name
 * Returns detailed data for specific employee
 * Supports both employee name and employee ID
 * Query params: startDate (optional), endDate (optional)
 * IMPORTANT: This must come AFTER all specific routes like /weekly-timeline, /app-usage, etc.
 * Validates: Requirements 11.2, 11.3, 11.4, 11.5
 */
router.get('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { startDate, endDate } = req.query;
    
    logger.info(`👤 Fetching employee detail for: ${name}, startDate: ${startDate}, endDate: ${endDate}`);
    
    const employeeDetail = await employeeService.getEmployeeDetailByNameOrId(
      name,
      startDate as string | undefined,
      endDate as string | undefined
    );
    
    if (!employeeDetail) {
      logger.warn(`Employee not found: ${name}`);
      res.status(404).json({ error: 'Employee not found' });
      return;
    }
    
    logger.info(`✅ Retrieved employee detail for: ${name}, apps: ${employeeDetail.current_applications.length}, tabs: ${employeeDetail.current_browser_tabs.length}`);
    
    res.status(200).json(employeeDetail);
  } catch (error) {
    logger.error(`❌ Error fetching employee detail for ${req.params.name}:`, error);
    res.status(500).json({ error: 'Failed to fetch employee detail' });
  }
});

export default router;
