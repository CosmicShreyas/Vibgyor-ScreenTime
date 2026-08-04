import { MonitoringPayload } from '../models/activity-log.model';
import { validateMonitoringPayload, ValidationResult } from '../models/validation.schemas';
import { logger } from '../utils/logger';

/**
 * Service for validating monitoring payloads
 */
export class ValidationService {
  /**
   * Validate monitoring payload structure with detailed error reporting
   */
  validatePayloadDetailed(payload: any): ValidationResult {
    try {
      const result = validateMonitoringPayload(payload);
      
      if (!result.valid) {
        // Log validation error with sanitized payload details (requirement 16.4)
        const sanitizedPayload = {
          client_id: payload?.client_id || 'missing',
          employee_name: payload?.employee_name || 'not set',
          timestamp: payload?.timestamp || 'missing',
          hasActivity: !!payload?.activity,
          hasApplications: !!payload?.applications,
          hasBrowserTabs: !!payload?.browser_tabs,
          hasScreenshot: !!payload?.screenshot
        };
        logger.warn('Invalid payload received:', { 
          errors: result.errors,
          payload: sanitizedPayload
        });
      }
      
      return result;
    } catch (error) {
      logger.error('Error validating payload:', error);
      return {
        valid: false,
        errors: ['Unexpected validation error']
      };
    }
  }

  /**
   * Validate monitoring payload structure (type guard)
   */
  validatePayload(payload: any): payload is MonitoringPayload {
    const result = this.validatePayloadDetailed(payload);
    return result.valid;
  }
}

export const validationService = new ValidationService();
