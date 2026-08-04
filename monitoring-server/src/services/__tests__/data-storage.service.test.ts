import { dataStorageService } from '../data-storage.service';
import { employeeService } from '../employee.service';
import { activityLogService } from '../activity-log.service';
import { screenshotService } from '../screenshot.service';
import { MonitoringPayload } from '../../models/activity-log.model';
import { database } from '../../utils/database';

// Mock the database and services
jest.mock('../../utils/database');
jest.mock('../employee.service');
jest.mock('../activity-log.service');
jest.mock('../screenshot.service');

describe('DataStorageService', () => {
  const mockPayload: MonitoringPayload = {
    employee_name: 'John Doe',
    timestamp: '2024-01-15T14:30:00Z',
    interval_start: '2024-01-15T14:20:00Z',
    interval_end: '2024-01-15T14:30:00Z',
    activity: {
      work_seconds: 480,
      idle_seconds: 120,
    },
    applications: [
      { name: 'VS Code', active: true },
      { name: 'Chrome', active: false },
    ],
    browser_tabs: [
      { browser: 'Chrome', title: 'GitHub', url: 'https://github.com' },
    ],
    screenshot: 'base64encodeddata',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock database.transaction to execute the callback immediately
    (database.transaction as jest.Mock).mockImplementation(async (callback) => {
      return await callback(null);
    });
    
    // Mock database.getPoolStats
    (database.getPoolStats as jest.Mock).mockReturnValue({
      totalCount: 10,
      idleCount: 5,
      waitingCount: 0,
    });
  });

  describe('storeMonitoringData', () => {
    it('should store employee, activity log, and screenshot in transaction', async () => {
      const mockEmployee = {
        id: 'employee-123',
        name: 'John Doe',
        first_seen: new Date(),
        last_seen: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockActivityLog = {
        id: 'activity-456',
        employee_id: 'employee-123',
        timestamp: new Date(),
        interval_start: new Date(),
        interval_end: new Date(),
        work_seconds: 480,
        idle_seconds: 120,
        applications: [],
        browser_tabs: [],
        created_at: new Date(),
      };

      const mockScreenshot = {
        id: 'screenshot-789',
        employee_id: 'employee-123',
        activity_log_id: 'activity-456',
        file_path: '/path/to/screenshot.jpg',
        file_size: 12345,
        captured_at: new Date(),
        created_at: new Date(),
        expires_at: new Date(),
      };

      (employeeService.upsertEmployee as jest.Mock).mockResolvedValue(mockEmployee);
      (activityLogService.storeActivityLog as jest.Mock).mockResolvedValue(mockActivityLog);
      (screenshotService.storeScreenshot as jest.Mock).mockResolvedValue(mockScreenshot);

      const result = await dataStorageService.storeMonitoringData(mockPayload);

      expect(result).toEqual({
        employeeId: 'employee-123',
        activityLogId: 'activity-456',
        screenshotId: 'screenshot-789',
      });

      expect(employeeService.upsertEmployee).toHaveBeenCalledWith('John Doe');
      expect(activityLogService.storeActivityLog).toHaveBeenCalledWith('employee-123', mockPayload);
      expect(screenshotService.storeScreenshot).toHaveBeenCalledWith(
        'employee-123',
        'activity-456',
        'base64encodeddata',
        expect.any(Date),
        'John Doe'
      );
    });

    it('should store data without screenshot if not present', async () => {
      const payloadWithoutScreenshot = { ...mockPayload, screenshot: undefined };

      const mockEmployee = {
        id: 'employee-123',
        name: 'John Doe',
        first_seen: new Date(),
        last_seen: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockActivityLog = {
        id: 'activity-456',
        employee_id: 'employee-123',
        timestamp: new Date(),
        interval_start: new Date(),
        interval_end: new Date(),
        work_seconds: 480,
        idle_seconds: 120,
        applications: [],
        browser_tabs: [],
        created_at: new Date(),
      };

      (employeeService.upsertEmployee as jest.Mock).mockResolvedValue(mockEmployee);
      (activityLogService.storeActivityLog as jest.Mock).mockResolvedValue(mockActivityLog);

      const result = await dataStorageService.storeMonitoringData(payloadWithoutScreenshot);

      expect(result).toEqual({
        employeeId: 'employee-123',
        activityLogId: 'activity-456',
        screenshotId: undefined,
      });

      expect(screenshotService.storeScreenshot).not.toHaveBeenCalled();
    });

    it('should continue if screenshot storage fails', async () => {
      const mockEmployee = {
        id: 'employee-123',
        name: 'John Doe',
        first_seen: new Date(),
        last_seen: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockActivityLog = {
        id: 'activity-456',
        employee_id: 'employee-123',
        timestamp: new Date(),
        interval_start: new Date(),
        interval_end: new Date(),
        work_seconds: 480,
        idle_seconds: 120,
        applications: [],
        browser_tabs: [],
        created_at: new Date(),
      };

      (employeeService.upsertEmployee as jest.Mock).mockResolvedValue(mockEmployee);
      (activityLogService.storeActivityLog as jest.Mock).mockResolvedValue(mockActivityLog);
      (screenshotService.storeScreenshot as jest.Mock).mockRejectedValue(
        new Error('Screenshot storage failed')
      );

      const result = await dataStorageService.storeMonitoringData(mockPayload);

      // Should still return employee and activity log IDs
      expect(result).toEqual({
        employeeId: 'employee-123',
        activityLogId: 'activity-456',
        screenshotId: undefined,
      });
    });

    it('should rollback transaction if employee upsert fails', async () => {
      (employeeService.upsertEmployee as jest.Mock).mockRejectedValue(
        new Error('Employee upsert failed')
      );

      await expect(dataStorageService.storeMonitoringData(mockPayload)).rejects.toThrow(
        'Employee upsert failed'
      );

      // Activity log and screenshot should not be called
      expect(activityLogService.storeActivityLog).not.toHaveBeenCalled();
      expect(screenshotService.storeScreenshot).not.toHaveBeenCalled();
    });

    it('should rollback transaction if activity log storage fails', async () => {
      const mockEmployee = {
        id: 'employee-123',
        name: 'John Doe',
        first_seen: new Date(),
        last_seen: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      (employeeService.upsertEmployee as jest.Mock).mockResolvedValue(mockEmployee);
      (activityLogService.storeActivityLog as jest.Mock).mockRejectedValue(
        new Error('Activity log storage failed')
      );

      await expect(dataStorageService.storeMonitoringData(mockPayload)).rejects.toThrow(
        'Activity log storage failed'
      );

      // Screenshot should not be called
      expect(screenshotService.storeScreenshot).not.toHaveBeenCalled();
    });
  });

  describe('getPoolStats', () => {
    it('should return database pool statistics', () => {
      const stats = dataStorageService.getPoolStats();
      
      expect(stats).toHaveProperty('totalCount');
      expect(stats).toHaveProperty('idleCount');
      expect(stats).toHaveProperty('waitingCount');
      expect(typeof stats.totalCount).toBe('number');
      expect(typeof stats.idleCount).toBe('number');
      expect(typeof stats.waitingCount).toBe('number');
    });
  });
});
