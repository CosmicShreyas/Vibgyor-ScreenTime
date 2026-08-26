/**
 * Unit tests for validation schemas
 * Tests validation functions for data models
 */

import {
  validateApplication,
  validateBrowserTab,
  validateMonitoringPayload,
  isValidUUID,
  isValidEmployeeName,
  isValidFilePath,
  isValidTimestamp,
  validateActivityTimeAccounting
} from '../validation.schemas';
import { Application, BrowserTab } from '../employee.model';
import { MonitoringPayload } from '../activity-log.model';

describe('Validation Schemas', () => {
  describe('validateApplication', () => {
    it('should validate a valid application', () => {
      const app: Application = {
        name: 'Visual Studio Code',
        active: true
      };
      
      expect(validateApplication(app)).toBe(true);
    });

    it('should reject application with missing name', () => {
      const app = {
        active: true
      };
      
      expect(validateApplication(app)).toBe(false);
    });

    it('should reject application with empty name', () => {
      const app = {
        name: '   ',
        active: true
      };
      
      expect(validateApplication(app)).toBe(false);
    });

    it('should reject application with missing active flag', () => {
      const app = {
        name: 'Chrome'
      };
      
      expect(validateApplication(app)).toBe(false);
    });

    it('should reject application with non-boolean active', () => {
      const app = {
        name: 'Chrome',
        active: 'yes'
      };
      
      expect(validateApplication(app)).toBe(false);
    });

    it('should reject null or undefined', () => {
      expect(validateApplication(null)).toBe(false);
      expect(validateApplication(undefined)).toBe(false);
    });
  });

  describe('validateBrowserTab', () => {
    it('should validate tab with both title and url', () => {
      const tab: BrowserTab = {
        browser: 'Chrome',
        title: 'GitHub',
        url: 'https://github.com'
      };
      
      expect(validateBrowserTab(tab)).toBe(true);
    });

    it('should validate tab with only title (Property 7)', () => {
      const tab = {
        browser: 'Firefox',
        title: 'New Tab',
        url: ''
      };
      
      expect(validateBrowserTab(tab)).toBe(true);
    });

    it('should validate tab with only url (Property 7)', () => {
      const tab = {
        browser: 'Edge',
        title: '',
        url: 'https://example.com'
      };
      
      expect(validateBrowserTab(tab)).toBe(true);
    });

    it('should reject tab with neither title nor url', () => {
      const tab = {
        browser: 'Chrome',
        title: '',
        url: ''
      };
      
      expect(validateBrowserTab(tab)).toBe(false);
    });

    it('should reject tab with missing browser', () => {
      const tab = {
        title: 'GitHub',
        url: 'https://github.com'
      };
      
      expect(validateBrowserTab(tab)).toBe(false);
    });

    it('should reject null or undefined', () => {
      expect(validateBrowserTab(null)).toBe(false);
      expect(validateBrowserTab(undefined)).toBe(false);
    });
  });

  describe('validateMonitoringPayload', () => {
    const validPayload: MonitoringPayload = {
      employee_name: 'John Doe',
      timestamp: '2024-01-15T14:30:00Z',
      interval_start: '2024-01-15T14:20:00Z',
      interval_end: '2024-01-15T14:30:00Z',
      activity: {
        work_seconds: 480,
        idle_seconds: 120
      },
      applications: [
        { name: 'VS Code', active: true },
        { name: 'Chrome', active: false }
      ],
      browser_tabs: [
        { browser: 'Chrome', title: 'GitHub', url: 'https://github.com' }
      ],
      screenshot: 'base64encodeddata'
    };

    it('should validate a complete valid payload (Property 2)', () => {
      const result = validateMonitoringPayload(validPayload);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate payload without optional screenshot', () => {
      const payload = { ...validPayload };
      delete payload.screenshot;
      
      const result = validateMonitoringPayload(payload);
      
      expect(result.valid).toBe(true);
    });

    it('should reject payload with missing employee_name', () => {
      const payload = { ...validPayload };
      delete (payload as any).employee_name;
      
      const result = validateMonitoringPayload(payload);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('employee_name is required and must be a string');
    });

    it('should reject payload with empty employee_name', () => {
      const payload = { ...validPayload, employee_name: '   ' };
      
      const result = validateMonitoringPayload(payload);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('employee_name cannot be empty');
    });

    it('should reject payload with invalid timestamp', () => {
      const payload = { ...validPayload, timestamp: 'not-a-date' };
      
      const result = validateMonitoringPayload(payload);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('timestamp'))).toBe(true);
    });

    it('should reject payload with missing activity', () => {
      const payload = { ...validPayload };
      delete (payload as any).activity;
      
      const result = validateMonitoringPayload(payload);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('activity is required and must be an object');
    });

    it('should reject payload with negative work_seconds', () => {
      const payload = {
        ...validPayload,
        activity: { work_seconds: -10, idle_seconds: 120 }
      };
      
      const result = validateMonitoringPayload(payload);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('activity.work_seconds must be non-negative');
    });

    it('should reject payload with negative idle_seconds', () => {
      const payload = {
        ...validPayload,
        activity: { work_seconds: 480, idle_seconds: -5 }
      };
      
      const result = validateMonitoringPayload(payload);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('activity.idle_seconds must be non-negative');
    });

    it('should reject payload with non-array applications', () => {
      const payload = { ...validPayload, applications: 'not-an-array' };
      
      const result = validateMonitoringPayload(payload);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('applications is required and must be an array');
    });

    it('should reject payload with invalid application in array', () => {
      const payload = {
        ...validPayload,
        applications: [
          { name: 'VS Code', active: true },
          { name: '', active: true } // Invalid: empty name
        ]
      };
      
      const result = validateMonitoringPayload(payload);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('applications[1]'))).toBe(true);
    });

    it('should reject payload with non-array browser_tabs', () => {
      const payload = { ...validPayload, browser_tabs: {} };
      
      const result = validateMonitoringPayload(payload);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('browser_tabs is required and must be an array');
    });

    it('should reject payload with invalid browser tab in array', () => {
      const payload = {
        ...validPayload,
        browser_tabs: [
          { browser: 'Chrome', title: '', url: '' } // Invalid: no title or url
        ]
      };
      
      const result = validateMonitoringPayload(payload);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('browser_tabs[0]'))).toBe(true);
    });

    it('should reject payload with non-string screenshot', () => {
      const payload = { ...validPayload, screenshot: 12345 };
      
      const result = validateMonitoringPayload(payload);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('screenshot must be a string (base64 encoded) if provided');
    });

    it('should allow empty arrays for applications and browser_tabs', () => {
      const payload = {
        ...validPayload,
        applications: [],
        browser_tabs: []
      };
      
      const result = validateMonitoringPayload(payload);
      
      expect(result.valid).toBe(true);
    });
  });

  describe('isValidUUID', () => {
    it('should validate correct UUID v4', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
    });

    it('should reject invalid UUID formats', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
      expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false);
      expect(isValidUUID('550e8400e29b41d4a716446655440000')).toBe(false);
      expect(isValidUUID('')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
    });
  });

  describe('isValidEmployeeName', () => {
    it('should validate normal employee names', () => {
      expect(isValidEmployeeName('John Doe')).toBe(true);
      expect(isValidEmployeeName('Jane Smith')).toBe(true);
      expect(isValidEmployeeName('A')).toBe(true);
    });

    it('should reject empty or whitespace-only names', () => {
      expect(isValidEmployeeName('')).toBe(false);
      expect(isValidEmployeeName('   ')).toBe(false);
      expect(isValidEmployeeName('\t\n')).toBe(false);
    });

    it('should reject names exceeding 255 characters', () => {
      const longName = 'A'.repeat(256);
      expect(isValidEmployeeName(longName)).toBe(false);
    });

    it('should accept names up to 255 characters', () => {
      const maxName = 'A'.repeat(255);
      expect(isValidEmployeeName(maxName)).toBe(true);
    });

    it('should reject non-string values', () => {
      expect(isValidEmployeeName(null as any)).toBe(false);
      expect(isValidEmployeeName(undefined as any)).toBe(false);
      expect(isValidEmployeeName(123 as any)).toBe(false);
    });
  });

  describe('isValidFilePath', () => {
    it('should validate normal file paths', () => {
      expect(isValidFilePath('screenshots/employee1/2024-01-15/image.jpg')).toBe(true);
      expect(isValidFilePath('/var/data/screenshot.png')).toBe(true);
    });

    it('should reject empty paths', () => {
      expect(isValidFilePath('')).toBe(false);
      expect(isValidFilePath('   ')).toBe(false);
    });

    it('should reject path traversal attempts', () => {
      expect(isValidFilePath('../../../etc/passwd')).toBe(false);
      expect(isValidFilePath('screenshots/../../../secret')).toBe(false);
      expect(isValidFilePath('~/private/data')).toBe(false);
    });

    it('should reject non-string values', () => {
      expect(isValidFilePath(null as any)).toBe(false);
      expect(isValidFilePath(undefined as any)).toBe(false);
    });
  });

  describe('isValidTimestamp', () => {
    it('should validate past timestamps', () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      expect(isValidTimestamp(pastDate)).toBe(true);
    });

    it('should validate current timestamp', () => {
      const now = new Date();
      expect(isValidTimestamp(now)).toBe(true);
    });

    it('should allow small clock skew (within 1 minute)', () => {
      const nearFuture = new Date(Date.now() + 30000); // 30 seconds in future
      expect(isValidTimestamp(nearFuture)).toBe(true);
    });

    it('should reject timestamps far in the future', () => {
      const farFuture = new Date(Date.now() + 1000 * 60 * 5); // 5 minutes in future
      expect(isValidTimestamp(farFuture)).toBe(false);
    });
  });

  describe('validateActivityTimeAccounting', () => {
    it('should validate when work + idle equals interval duration (Property 4)', () => {
      const intervalStart = new Date('2024-01-15T14:00:00Z');
      const intervalEnd = new Date('2024-01-15T14:10:00Z'); // 10 minutes = 600 seconds
      
      const result = validateActivityTimeAccounting(480, 120, intervalStart, intervalEnd);
      
      expect(result).toBe(true);
    });

    it('should allow small tolerance for rounding errors', () => {
      const intervalStart = new Date('2024-01-15T14:00:00Z');
      const intervalEnd = new Date('2024-01-15T14:10:00Z'); // 600 seconds
      
      // 598 seconds (2 seconds off, within 5 second tolerance)
      const result = validateActivityTimeAccounting(478, 120, intervalStart, intervalEnd);
      
      expect(result).toBe(true);
    });

    it('should reject when difference exceeds tolerance', () => {
      const intervalStart = new Date('2024-01-15T14:00:00Z');
      const intervalEnd = new Date('2024-01-15T14:10:00Z'); // 600 seconds
      
      // 590 seconds (10 seconds off, exceeds 5 second tolerance)
      const result = validateActivityTimeAccounting(470, 120, intervalStart, intervalEnd);
      
      expect(result).toBe(false);
    });

    it('should handle custom tolerance', () => {
      const intervalStart = new Date('2024-01-15T14:00:00Z');
      const intervalEnd = new Date('2024-01-15T14:10:00Z'); // 600 seconds
      
      // 590 seconds (10 seconds off)
      const result = validateActivityTimeAccounting(470, 120, intervalStart, intervalEnd, 10);
      
      expect(result).toBe(true);
    });

    it('should validate zero activity time', () => {
      const intervalStart = new Date('2024-01-15T14:00:00Z');
      const intervalEnd = new Date('2024-01-15T14:00:00Z'); // 0 seconds
      
      const result = validateActivityTimeAccounting(0, 0, intervalStart, intervalEnd);
      
      expect(result).toBe(true);
    });
  });
});
