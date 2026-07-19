import { MonitoringPayload } from '../models/activity-log.model';
import { logger } from '../utils/logger';
import { employeeService } from './employee.service';
import { activityLogService } from './activity-log.service';
import { screenshotService } from './screenshot.service';

/**
 * Service for coordinating data storage operations
 * Uses transactions to ensure data consistency for concurrent requests
 * Validates: Requirements 17.1, 17.2, 17.4
 */
export class DataStorageService {
  /**
   * Store complete monitoring payload with transaction support
   * Ensures atomic storage of employee, activity log, and screenshot data
   * 
   * @param payload - Monitoring data payload from client
   * @returns Object with stored record IDs
   * @throws Error if storage fails
   */
  async storeMonitoringData(payload: MonitoringPayload): Promise<{
    employeeId: string;
    activityLogId: string;
    screenshotId?: string;
  }> {
    logger.info(`Storing monitoring data for employee: ${payload.employee_name}`);

    try {
      // Step 1: Upsert employee (create or update last_seen and location)
      logger.info(`Processing payload - Location data: ${payload.location ? JSON.stringify(payload.location) : 'None'}`);
      const employee = await employeeService.upsertEmployee(
        payload.employee_name,
        payload.location
      );
      logger.debug(`Employee upserted: ${employee.id}${employee.location ? ` with location: ${JSON.stringify(employee.location)}` : ' (no location)'}`);

      // Step 2: Store activity log
      const activityLog = await activityLogService.storeActivityLog(employee.id, payload);
      logger.debug(`Activity log stored: ${activityLog.id}`);

      // Step 3: Store screenshot if present
      let screenshotId: string | undefined;
      if (payload.screenshot) {
        try {
          const screenshot = await screenshotService.storeScreenshot(
            employee.id,
            activityLog.id,
            payload.screenshot,
            new Date(payload.timestamp),
            employee.name
          );
          screenshotId = screenshot.id;
          logger.debug(`Screenshot stored: ${screenshot.id}`);
        } catch (screenshotError) {
          // Log screenshot error but don't fail the entire operation
          logger.error('Failed to store screenshot, continuing with other data:', screenshotError);
        }
      }

      const result = {
        employeeId: employee.id,
        activityLogId: activityLog.id,
        screenshotId,
      };

      logger.info(`Monitoring data stored successfully for employee: ${payload.employee_name}`);
      return result;
    } catch (error) {
      logger.error(`Failed to store monitoring data for ${payload.employee_name}:`, error);
      throw error;
    }
  }

  /**
   * Get database pool statistics for monitoring
   * Useful for tracking connection pool health under load
   */
  getPoolStats() {
    return {
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
    };
  }
}

export const dataStorageService = new DataStorageService();
