/**
 * Central export for all data models and validation schemas
 */

// Employee models
export {
  Employee,
  EmployeeSummary,
  EmployeeDetail,
  Application,
  BrowserTab,
  ActivityDataPoint,
  ScreenshotInfo
} from './employee.model';

// Activity log models
export {
  ActivityLog,
  MonitoringPayload
} from './activity-log.model';

// Screenshot models
export {
  Screenshot
} from './screenshot.model';

// Validation schemas and utilities
export {
  ValidationResult,
  validateApplication,
  validateBrowserTab,
  validateMonitoringPayload,
  isMonitoringPayload,
  isValidUUID,
  isValidEmployeeName,
  isValidFilePath,
  isValidTimestamp,
  validateActivityTimeAccounting
} from './validation.schemas';
