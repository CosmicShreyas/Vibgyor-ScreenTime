/**
 * Unit tests for data models
 * Tests type definitions and model structure
 */

import {
  Employee,
  EmployeeSummary,
  EmployeeDetail,
  Application,
  BrowserTab,
  ActivityDataPoint,
  ScreenshotInfo
} from '../employee.model';
import { ActivityLog, MonitoringPayload } from '../activity-log.model';
import { Screenshot } from '../screenshot.model';

describe('Data Models', () => {
  describe('Employee', () => {
    it('should create a valid Employee object', () => {
      const employee: Employee = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'John Doe',
        first_seen: new Date('2024-01-15T10:00:00Z'),
        last_seen: new Date('2024-01-15T14:30:00Z'),
        created_at: new Date('2024-01-15T10:00:00Z'),
        updated_at: new Date('2024-01-15T14:30:00Z')
      };

      expect(employee.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(employee.name).toBe('John Doe');
      expect(employee.first_seen).toBeInstanceOf(Date);
      expect(employee.last_seen).toBeInstanceOf(Date);
      expect(employee.created_at).toBeInstanceOf(Date);
      expect(employee.updated_at).toBeInstanceOf(Date);
    });
  });

  describe('EmployeeSummary', () => {
    it('should create a valid EmployeeSummary object', () => {
      const summary: EmployeeSummary = {
        name: 'Jane Smith',
        work_time_today: 28800, // 8 hours in seconds
        idle_time_today: 3600,  // 1 hour in seconds
        last_update: new Date('2024-01-15T14:30:00Z'),
        status: 'active'
      };

      expect(summary.name).toBe('Jane Smith');
      expect(summary.work_time_today).toBe(28800);
      expect(summary.idle_time_today).toBe(3600);
      expect(summary.status).toBe('active');
    });

    it('should support all status values', () => {
      const statuses: Array<'active' | 'idle' | 'offline'> = ['active', 'idle', 'offline'];
      
      statuses.forEach(status => {
        const summary: EmployeeSummary = {
          name: 'Test User',
          work_time_today: 0,
          idle_time_today: 0,
          last_update: new Date(),
          status
        };
        
        expect(summary.status).toBe(status);
      });
    });
  });

  describe('Application', () => {
    it('should create a valid Application object', () => {
      const app: Application = {
        name: 'Visual Studio Code',
        active: true
      };

      expect(app.name).toBe('Visual Studio Code');
      expect(app.active).toBe(true);
    });

    it('should support inactive applications', () => {
      const app: Application = {
        name: 'Chrome',
        active: false
      };

      expect(app.active).toBe(false);
    });
  });

  describe('BrowserTab', () => {
    it('should create a valid BrowserTab object', () => {
      const tab: BrowserTab = {
        browser: 'Chrome',
        title: 'GitHub - Project Repository',
        url: 'https://github.com/user/repo'
      };

      expect(tab.browser).toBe('Chrome');
      expect(tab.title).toBe('GitHub - Project Repository');
      expect(tab.url).toBe('https://github.com/user/repo');
    });
  });

  describe('ActivityLog', () => {
    it('should create a valid ActivityLog object', () => {
      const log: ActivityLog = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        employee_id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: new Date('2024-01-15T14:30:00Z'),
        interval_start: new Date('2024-01-15T14:20:00Z'),
        interval_end: new Date('2024-01-15T14:30:00Z'),
        work_seconds: 480,
        idle_seconds: 120,
        applications: [
          { name: 'VS Code', active: true },
          { name: 'Chrome', active: false }
        ],
        browser_tabs: [
          { browser: 'Chrome', title: 'GitHub', url: 'https://github.com' }
        ],
        created_at: new Date('2024-01-15T14:30:00Z')
      };

      expect(log.id).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(log.employee_id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(log.work_seconds).toBe(480);
      expect(log.idle_seconds).toBe(120);
      expect(log.applications).toHaveLength(2);
      expect(log.browser_tabs).toHaveLength(1);
    });

    it('should support empty applications and browser_tabs arrays', () => {
      const log: ActivityLog = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        employee_id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: new Date('2024-01-15T14:30:00Z'),
        interval_start: new Date('2024-01-15T14:20:00Z'),
        interval_end: new Date('2024-01-15T14:30:00Z'),
        work_seconds: 0,
        idle_seconds: 600,
        applications: [],
        browser_tabs: [],
        created_at: new Date('2024-01-15T14:30:00Z')
      };

      expect(log.applications).toHaveLength(0);
      expect(log.browser_tabs).toHaveLength(0);
    });
  });

  describe('MonitoringPayload', () => {
    it('should create a valid MonitoringPayload object', () => {
      const payload: MonitoringPayload = {
        employee_name: 'John Doe',
        timestamp: '2024-01-15T14:30:00Z',
        interval_start: '2024-01-15T14:20:00Z',
        interval_end: '2024-01-15T14:30:00Z',
        activity: {
          work_seconds: 480,
          idle_seconds: 120
        },
        applications: [
          { name: 'VS Code', active: true }
        ],
        browser_tabs: [
          { browser: 'Chrome', title: 'GitHub', url: 'https://github.com' }
        ],
        screenshot: 'base64encodeddata'
      };

      expect(payload.employee_name).toBe('John Doe');
      expect(payload.activity.work_seconds).toBe(480);
      expect(payload.activity.idle_seconds).toBe(120);
      expect(payload.screenshot).toBe('base64encodeddata');
    });

    it('should support optional screenshot field', () => {
      const payload: MonitoringPayload = {
        employee_name: 'John Doe',
        timestamp: '2024-01-15T14:30:00Z',
        interval_start: '2024-01-15T14:20:00Z',
        interval_end: '2024-01-15T14:30:00Z',
        activity: {
          work_seconds: 480,
          idle_seconds: 120
        },
        applications: [],
        browser_tabs: []
      };

      expect(payload.screenshot).toBeUndefined();
    });
  });

  describe('Screenshot', () => {
    it('should create a valid Screenshot object', () => {
      const screenshot: Screenshot = {
        id: '550e8400-e29b-41d4-a716-446655440002',
        employee_id: '550e8400-e29b-41d4-a716-446655440000',
        activity_log_id: '550e8400-e29b-41d4-a716-446655440001',
        file_path: 'screenshots/johndoe/2024-01-15/143000.jpg',
        file_size: 245678,
        captured_at: new Date('2024-01-15T14:30:00Z'),
        created_at: new Date('2024-01-15T14:30:05Z'),
        expires_at: new Date('2024-02-14T14:30:05Z')
      };

      expect(screenshot.id).toBe('550e8400-e29b-41d4-a716-446655440002');
      expect(screenshot.employee_id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(screenshot.activity_log_id).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(screenshot.file_path).toBe('screenshots/johndoe/2024-01-15/143000.jpg');
      expect(screenshot.file_size).toBe(245678);
      expect(screenshot.captured_at).toBeInstanceOf(Date);
      expect(screenshot.expires_at).toBeInstanceOf(Date);
    });
  });

  describe('EmployeeDetail', () => {
    it('should create a valid EmployeeDetail object', () => {
      const detail: EmployeeDetail = {
        name: 'John Doe',
        current_applications: [
          { name: 'VS Code', active: true },
          { name: 'Chrome', active: false }
        ],
        current_browser_tabs: [
          { browser: 'Chrome', title: 'GitHub', url: 'https://github.com' }
        ],
        activity_history: [
          {
            timestamp: new Date('2024-01-15T14:00:00Z'),
            work_seconds: 480,
            idle_seconds: 120
          },
          {
            timestamp: new Date('2024-01-15T14:10:00Z'),
            work_seconds: 500,
            idle_seconds: 100
          }
        ],
        recent_screenshots: [
          {
            id: '550e8400-e29b-41d4-a716-446655440002',
            thumbnail_url: '/api/screenshots/550e8400-e29b-41d4-a716-446655440002/thumbnail',
            full_url: '/api/screenshots/550e8400-e29b-41d4-a716-446655440002',
            captured_at: new Date('2024-01-15T14:30:00Z')
          }
        ]
      };

      expect(detail.name).toBe('John Doe');
      expect(detail.current_applications).toHaveLength(2);
      expect(detail.current_browser_tabs).toHaveLength(1);
      expect(detail.activity_history).toHaveLength(2);
      expect(detail.recent_screenshots).toHaveLength(1);
    });
  });

  describe('ActivityDataPoint', () => {
    it('should create a valid ActivityDataPoint object', () => {
      const dataPoint: ActivityDataPoint = {
        timestamp: new Date('2024-01-15T14:30:00Z'),
        work_seconds: 480,
        idle_seconds: 120
      };

      expect(dataPoint.timestamp).toBeInstanceOf(Date);
      expect(dataPoint.work_seconds).toBe(480);
      expect(dataPoint.idle_seconds).toBe(120);
    });
  });

  describe('ScreenshotInfo', () => {
    it('should create a valid ScreenshotInfo object', () => {
      const info: ScreenshotInfo = {
        id: '550e8400-e29b-41d4-a716-446655440002',
        thumbnail_url: '/api/screenshots/550e8400-e29b-41d4-a716-446655440002/thumbnail',
        full_url: '/api/screenshots/550e8400-e29b-41d4-a716-446655440002',
        captured_at: new Date('2024-01-15T14:30:00Z')
      };

      expect(info.id).toBe('550e8400-e29b-41d4-a716-446655440002');
      expect(info.thumbnail_url).toContain('thumbnail');
      expect(info.full_url).toBe('/api/screenshots/550e8400-e29b-41d4-a716-446655440002');
      expect(info.captured_at).toBeInstanceOf(Date);
    });
  });
});
