import { ActivityLogService } from '../activity-log.service';
import { MonitoringPayload } from '../../models/activity-log.model';
import { database } from '../../utils/database';

// Mock the database module
jest.mock('../../utils/database');
jest.mock('../../utils/logger');

describe('ActivityLogService', () => {
  let activityLogService: ActivityLogService;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    activityLogService = new ActivityLogService();
    mockQuery = database.query as jest.Mock;
    mockQuery.mockClear();
  });

  describe('storeActivityLog', () => {
    const validPayload: MonitoringPayload = {
      employee_name: 'John Doe',
      timestamp: '2024-01-15T14:30:00Z',
      interval_start: '2024-01-15T14:20:00Z',
      interval_end: '2024-01-15T14:30:00Z',
      activity: {
        work_seconds: 480,
        idle_seconds: 120,
      },
      applications: [
        { name: 'Visual Studio Code', active: true },
        { name: 'Chrome', active: false },
      ],
      browser_tabs: [
        { browser: 'Chrome', title: 'GitHub', url: 'https://github.com' },
      ],
    };

    it('should store activity log with valid payload', async () => {
      const mockActivityLog = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        employee_id: 'emp-123',
        timestamp: new Date('2024-01-15T14:30:00Z'),
        interval_start: new Date('2024-01-15T14:20:00Z'),
        interval_end: new Date('2024-01-15T14:30:00Z'),
        work_seconds: 480,
        idle_seconds: 120,
        applications: validPayload.applications,
        browser_tabs: validPayload.browser_tabs,
        created_at: new Date('2024-01-15T14:30:00Z'),
      };

      mockQuery.mockResolvedValue({
        rows: [mockActivityLog],
      });

      const result = await activityLogService.storeActivityLog('emp-123', validPayload);

      expect(result).toEqual(mockActivityLog);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO activity_logs'),
        expect.arrayContaining([
          'emp-123',
          expect.any(Date),
          expect.any(Date),
          expect.any(Date),
          480,
          120,
          expect.any(String),
          expect.any(String),
        ])
      );
    });

    it('should throw error for invalid timestamp format', async () => {
      const invalidPayload = {
        ...validPayload,
        timestamp: 'invalid-date',
      };

      await expect(
        activityLogService.storeActivityLog('emp-123', invalidPayload)
      ).rejects.toThrow('Invalid timestamp format');
    });

    it('should throw error for negative work seconds', async () => {
      const invalidPayload = {
        ...validPayload,
        activity: {
          work_seconds: -10,
          idle_seconds: 120,
        },
      };

      await expect(
        activityLogService.storeActivityLog('emp-123', invalidPayload)
      ).rejects.toThrow('Work and idle seconds must be non-negative');
    });

    it('should throw error for negative idle seconds', async () => {
      const invalidPayload = {
        ...validPayload,
        activity: {
          work_seconds: 480,
          idle_seconds: -5,
        },
      };

      await expect(
        activityLogService.storeActivityLog('emp-123', invalidPayload)
      ).rejects.toThrow('Work and idle seconds must be non-negative');
    });

    it('should throw error if database operation fails', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(
        activityLogService.storeActivityLog('emp-123', validPayload)
      ).rejects.toThrow('Database error');
    });
  });

  describe('getActivityLogsByEmployee', () => {
    it('should return activity logs for employee', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          employee_id: 'emp-123',
          timestamp: new Date('2024-01-15T14:30:00Z'),
          interval_start: new Date('2024-01-15T14:20:00Z'),
          interval_end: new Date('2024-01-15T14:30:00Z'),
          work_seconds: 480,
          idle_seconds: 120,
          applications: [],
          browser_tabs: [],
          created_at: new Date('2024-01-15T14:30:00Z'),
        },
        {
          id: 'log-2',
          employee_id: 'emp-123',
          timestamp: new Date('2024-01-15T14:20:00Z'),
          interval_start: new Date('2024-01-15T14:10:00Z'),
          interval_end: new Date('2024-01-15T14:20:00Z'),
          work_seconds: 500,
          idle_seconds: 100,
          applications: [],
          browser_tabs: [],
          created_at: new Date('2024-01-15T14:20:00Z'),
        },
      ];

      mockQuery.mockResolvedValue({
        rows: mockLogs,
      });

      const result = await activityLogService.getActivityLogsByEmployee('emp-123');

      expect(result).toEqual(mockLogs);
      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE employee_id = $1'),
        ['emp-123', 100]
      );
    });

    it('should respect limit parameter', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await activityLogService.getActivityLogsByEmployee('emp-123', 50);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2'),
        ['emp-123', 50]
      );
    });

    it('should return empty array if no logs found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await activityLogService.getActivityLogsByEmployee('emp-123');

      expect(result).toEqual([]);
    });
  });

  describe('getActivityLogsByDateRange', () => {
    it('should return activity logs within date range', async () => {
      const startDate = new Date('2024-01-15T00:00:00Z');
      const endDate = new Date('2024-01-15T23:59:59Z');

      const mockLogs = [
        {
          id: 'log-1',
          employee_id: 'emp-123',
          timestamp: new Date('2024-01-15T14:30:00Z'),
          interval_start: new Date('2024-01-15T14:20:00Z'),
          interval_end: new Date('2024-01-15T14:30:00Z'),
          work_seconds: 480,
          idle_seconds: 120,
          applications: [],
          browser_tabs: [],
          created_at: new Date('2024-01-15T14:30:00Z'),
        },
      ];

      mockQuery.mockResolvedValue({
        rows: mockLogs,
      });

      const result = await activityLogService.getActivityLogsByDateRange(
        'emp-123',
        startDate,
        endDate
      );

      expect(result).toEqual(mockLogs);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('timestamp >= $2'),
        ['emp-123', startDate, endDate]
      );
    });

    it('should throw error if start date is after end date', async () => {
      const startDate = new Date('2024-01-16T00:00:00Z');
      const endDate = new Date('2024-01-15T00:00:00Z');

      await expect(
        activityLogService.getActivityLogsByDateRange('emp-123', startDate, endDate)
      ).rejects.toThrow('Start date must be before or equal to end date');
    });

    it('should return empty array if no logs in range', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const startDate = new Date('2024-01-15T00:00:00Z');
      const endDate = new Date('2024-01-15T23:59:59Z');

      const result = await activityLogService.getActivityLogsByDateRange(
        'emp-123',
        startDate,
        endDate
      );

      expect(result).toEqual([]);
    });
  });

  describe('getLatestActivityLog', () => {
    it('should return most recent activity log', async () => {
      const mockLog = {
        id: 'log-1',
        employee_id: 'emp-123',
        timestamp: new Date('2024-01-15T14:30:00Z'),
        interval_start: new Date('2024-01-15T14:20:00Z'),
        interval_end: new Date('2024-01-15T14:30:00Z'),
        work_seconds: 480,
        idle_seconds: 120,
        applications: [],
        browser_tabs: [],
        created_at: new Date('2024-01-15T14:30:00Z'),
      };

      mockQuery.mockResolvedValue({
        rows: [mockLog],
      });

      const result = await activityLogService.getLatestActivityLog('emp-123');

      expect(result).toEqual(mockLog);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY timestamp DESC'),
        ['emp-123']
      );
    });

    it('should return null if no logs found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await activityLogService.getLatestActivityLog('emp-123');

      expect(result).toBeNull();
    });
  });

  describe('getActivitySummaryForDate', () => {
    it('should return activity summary for specific date', async () => {
      const mockRow = {
        total_work_seconds: '3600',
        total_idle_seconds: '600',
      };

      mockQuery.mockResolvedValue({
        rows: [mockRow],
      });

      const date = new Date('2024-01-15T12:00:00Z');
      const result = await activityLogService.getActivitySummaryForDate('emp-123', date);

      expect(result).toEqual({
        work_seconds: 3600,
        idle_seconds: 600,
      });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SUM(work_seconds)'),
        expect.arrayContaining(['emp-123', expect.any(Date), expect.any(Date)])
      );
    });

    it('should return zeros if no activity on date', async () => {
      const mockRow = {
        total_work_seconds: '0',
        total_idle_seconds: '0',
      };

      mockQuery.mockResolvedValue({
        rows: [mockRow],
      });

      const date = new Date('2024-01-15T12:00:00Z');
      const result = await activityLogService.getActivitySummaryForDate('emp-123', date);

      expect(result).toEqual({
        work_seconds: 0,
        idle_seconds: 0,
      });
    });
  });
});
