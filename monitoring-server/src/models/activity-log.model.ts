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
    // Intensity + genuineness (anti-cheat). All optional/privacy-safe counts.
    keystrokes?: number;
    mouse_clicks?: number;
    mouse_distance_px?: number;
    scroll_events?: number;
    keystrokes_per_min?: number;
    mouse_activity_per_min?: number;
    suspected_fake_seconds?: number;
    genuineness_score?: number;
    suspicion_reasons?: string[];
  };
  applications: Application[];
  browser_tabs: BrowserTab[];
  screenshot?: string; // base64 encoded or multipart reference
  idle_reason?: string;
  location?: {
    city: string;
    state: string;
    country: string;
  };
  // Resilience/anti-tamper signals reported by the client (all optional).
  tamper?: {
    process_restarted?: boolean;
    clock_jump_detected?: boolean;
    paused_seconds?: number;
    relaunched_by_watchdog?: boolean;
    watchdog_restarted?: boolean;
    server_unreachable_seconds?: number;
    autostart_restored?: boolean;
  };
}
