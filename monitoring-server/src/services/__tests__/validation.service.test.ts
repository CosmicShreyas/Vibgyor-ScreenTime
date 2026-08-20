import { validationService } from '../validation.service';
import { MonitoringPayload } from '../../models/activity-log.model';

describe('ValidationService', () => {
  describe('validatePayload', () => {
    it('should validate a complete valid payload', () => {
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
        ],
        browser_tabs: [
          { browser: 'Chrome', title: 'GitHub', url: 'https://github.com' },
        ],
      };

      expect(validationService.validatePayload(validPayload)).toBe(true);
    });

    it('should reject payload with missing employee_name', () => {
      const invalidPayload = {
        timestamp: '2024-01-15T14:30:00Z',
        interval_start: '2024-01-15T14:20:00Z',
        interval_end: '2024-01-15T14:30:00Z',
        activity: { work_seconds: 480, idle_seconds: 120 },
        applications: [],
        browser_tabs: [],
      };

      expect(validationService.validatePayload(invalidPayload)).toBe(false);
    });

    it('should reject payload with missing activity', () => {
      const invalidPayload = {
        employee_name: 'John Doe',
        timestamp: '2024-01-15T14:30:00Z',
        interval_start: '2024-01-15T14:20:00Z',
        interval_end: '2024-01-15T14:30:00Z',
        applications: [],
        browser_tabs: [],
      };

      expect(validationService.validatePayload(invalidPayload)).toBe(false);
    });

    it('should reject payload with invalid applications type', () => {
      const invalidPayload = {
        employee_name: 'John Doe',
        timestamp: '2024-01-15T14:30:00Z',
        interval_start: '2024-01-15T14:20:00Z',
        interval_end: '2024-01-15T14:30:00Z',
        activity: { work_seconds: 480, idle_seconds: 120 },
        applications: 'not an array',
        browser_tabs: [],
      };

      expect(validationService.validatePayload(invalidPayload)).toBe(false);
    });
  });
});
