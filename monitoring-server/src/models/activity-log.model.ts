import { Application, BrowserTab } from './employee.model';

/**
 * Activity log data model
 */
export interface ActivityLog {
  id: string;
  employee_id: string;
  timestamp: Date;
  interval_start: Date;
  interval_end: Date;
  work_seconds: number;
  idle_seconds: number;
  applications: Application[];
  browser_tabs: BrowserTab[];
  created_at: Date;
}

/**
 * Monitoring data payload received from client
 */
export interface MonitoringPayload {
  client_id: string;
  employee_name: string;
  timestamp: string;
  interval_start: string;
  interval_end: string;
  activity: {
    work_seconds: number;
    idle_seconds: number;
  };
  applications: Application[];
  browser_tabs: BrowserTab[];
  screenshot?: string; // base64 encoded or multipart reference
  location?: {
    city: string;
    state: string;
    country: string;
  };
}
