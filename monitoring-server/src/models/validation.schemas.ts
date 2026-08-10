/**
 * Validation schemas for data models
 * Provides runtime validation for incoming data
 */

import { Application, BrowserTab } from './employee.model';
import { MonitoringPayload } from './activity-log.model';

/**
 * Validation result type
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate Application object
 */
export function validateApplication(app: any): app is Application {
  if (!app || typeof app !== 'object') {
    return false;
  }
  
  if (typeof app.name !== 'string' || app.name.trim().length === 0) {
    return false;
  }
  
  // Support both old format (active: boolean) and new format (duration: number)
  if (app.duration !== undefined) {
    // New format with duration
    if (typeof app.duration !== 'number' || app.duration < 0) {
      return false;
    }
  } else if (app.active !== undefined) {
    // Old format with active
    if (typeof app.active !== 'boolean') {
      return false;
    }
  } else {
    // Must have either duration or active
    return false;
  }
  
  return true;
}

/**
 * Validate BrowserTab object
 */
export function validateBrowserTab(tab: any): tab is BrowserTab {
  if (!tab || typeof tab !== 'object') {
    return false;
  }
  
  if (typeof tab.browser !== 'string' || tab.browser.trim().length === 0) {
    return false;
  }
  
  // At least one of title or url must be present (Property 7)
  const hasTitle = typeof tab.title === 'string' && tab.title.trim().length > 0;
  const hasUrl = typeof tab.url === 'string' && tab.url.trim().length > 0;
  
  if (!hasTitle && !hasUrl) {
    return false;
  }
  
  // Validate duration if present
  if (tab.duration !== undefined) {
    if (typeof tab.duration !== 'number' || tab.duration < 0) {
      return false;
    }
  }
  
  return true;
}

/**
 * Validate MonitoringPayload with detailed error messages
 */
export function validateMonitoringPayload(payload: any): ValidationResult {
  const errors: string[] = [];
  
  // Validate client_id (required)
  if (!payload.client_id || typeof payload.client_id !== 'string') {
    errors.push('client_id is required and must be a string');
  } else if (payload.client_id.trim().length === 0) {
    errors.push('client_id cannot be empty');
  }
  
  // Validate employee_name (optional, for backward compatibility)
  if (payload.employee_name !== undefined) {
    if (typeof payload.employee_name !== 'string') {
      errors.push('employee_name must be a string if provided');
    } else if (payload.employee_name.trim().length === 0) {
      errors.push('employee_name cannot be empty if provided');
    }
  }
  
  // Validate timestamp
  if (!payload.timestamp || typeof payload.timestamp !== 'string') {
    errors.push('timestamp is required and must be a string');
  } else if (isNaN(Date.parse(payload.timestamp))) {
    errors.push('timestamp must be a valid ISO 8601 date string');
  }
  
  // Validate interval_start
  if (!payload.interval_start || typeof payload.interval_start !== 'string') {
    errors.push('interval_start is required and must be a string');
  } else if (isNaN(Date.parse(payload.interval_start))) {
    errors.push('interval_start must be a valid ISO 8601 date string');
  }
  
  // Validate interval_end
  if (!payload.interval_end || typeof payload.interval_end !== 'string') {
    errors.push('interval_end is required and must be a string');
  } else if (isNaN(Date.parse(payload.interval_end))) {
    errors.push('interval_end must be a valid ISO 8601 date string');
  }
  
  // Validate activity object
  if (!payload.activity || typeof payload.activity !== 'object') {
    errors.push('activity is required and must be an object');
  } else {
    if (typeof payload.activity.work_seconds !== 'number') {
      errors.push('activity.work_seconds is required and must be a number');
    } else if (payload.activity.work_seconds < 0) {
      errors.push('activity.work_seconds must be non-negative');
    }
    
    if (typeof payload.activity.idle_seconds !== 'number') {
      errors.push('activity.idle_seconds is required and must be a number');
    } else if (payload.activity.idle_seconds < 0) {
      errors.push('activity.idle_seconds must be non-negative');
    }
  }
  
  // Validate applications array
  if (!Array.isArray(payload.applications)) {
    errors.push('applications is required and must be an array');
  } else {
    payload.applications.forEach((app: any, index: number) => {
      if (!validateApplication(app)) {
        // Log the actual app data for debugging
        const appData = JSON.stringify(app);
        errors.push(`applications[${index}] is invalid: must have name (string) and either duration (number) or active (boolean). Received: ${appData}`);
      }
    });
  }
  
  // Validate browser_tabs array
  if (!Array.isArray(payload.browser_tabs)) {
    errors.push('browser_tabs is required and must be an array');
  } else {
    payload.browser_tabs.forEach((tab: any, index: number) => {
      if (!validateBrowserTab(tab)) {
        errors.push(`browser_tabs[${index}] is invalid: must have browser (string) and at least title or url`);
      }
    });
  }
  
  // Screenshot is optional, but if present should be a string
  if (payload.screenshot !== undefined && typeof payload.screenshot !== 'string') {
    errors.push('screenshot must be a string (base64 encoded) if provided');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Type guard for MonitoringPayload
 */
export function isMonitoringPayload(payload: any): payload is MonitoringPayload {
  return validateMonitoringPayload(payload).valid;
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate employee name format
 */
export function isValidEmployeeName(name: string): boolean {
  if (typeof name !== 'string') {
    return false;
  }
  
  const trimmed = name.trim();
  
  // Must not be empty
  if (trimmed.length === 0) {
    return false;
  }
  
  // Must be reasonable length (1-255 characters)
  if (trimmed.length > 255) {
    return false;
  }
  
  return true;
}

/**
 * Validate file path format
 */
export function isValidFilePath(path: string): boolean {
  if (typeof path !== 'string' || path.trim().length === 0) {
    return false;
  }
  
  // Check for path traversal attempts
  if (path.includes('..') || path.includes('~')) {
    return false;
  }
  
  return true;
}

/**
 * Validate timestamp is not in the future
 */
export function isValidTimestamp(timestamp: Date): boolean {
  const now = new Date();
  const maxFuture = 60000; // Allow 1 minute clock skew
  
  return timestamp.getTime() <= now.getTime() + maxFuture;
}

/**
 * Validate activity time accounting (Property 4)
 * work_seconds + idle_seconds should equal interval duration
 */
export function validateActivityTimeAccounting(
  workSeconds: number,
  idleSeconds: number,
  intervalStart: Date,
  intervalEnd: Date,
  toleranceSeconds: number = 5
): boolean {
  const totalSeconds = workSeconds + idleSeconds;
  const intervalDuration = (intervalEnd.getTime() - intervalStart.getTime()) / 1000;
  
  // Allow small tolerance for rounding errors
  const difference = Math.abs(totalSeconds - intervalDuration);
  
  return difference <= toleranceSeconds;
}
