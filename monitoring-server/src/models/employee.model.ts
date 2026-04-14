/**
 * Employee data model
 */
export interface Employee {
  id: string;
  name: string;
  first_seen: Date;
  last_seen: Date;
  created_at: Date;
  updated_at: Date;
}

/**
 * Employee summary for overview display
 */
export interface EmployeeSummary {
  name: string;
  work_time_today: number;
  idle_time_today: number;
  last_update: Date;
  status: 'active' | 'idle' | 'offline';
  location?: {
    city: string;
    state: string;
    country: string;
  };
}

/**
 * Employee detail for detailed view
 */
export interface EmployeeDetail {
  name: string;
  current_applications: Application[];
  current_browser_tabs: BrowserTab[];
  activity_history: ActivityDataPoint[];
  recent_screenshots: ScreenshotInfo[];
  location?: {
    city: string;
    state: string;
    country: string;
  };
}

/**
 * Application information
 */
export interface Application {
  name: string;
  active?: boolean;  // Optional: for backward compatibility
  duration?: number; // Optional: duration in seconds
}

/**
 * Browser tab information
 */
export interface BrowserTab {
  browser: string;
  title: string;
  url: string;
  duration?: number; // Optional: duration in seconds
}

/**
 * Activity data point for charts
 */
export interface ActivityDataPoint {
  timestamp: Date;
  work_seconds: number;
  idle_seconds: number;
}

/**
 * Screenshot information
 */
export interface ScreenshotInfo {
  id: string;
  thumbnail_url: string;
  full_url: string;
  captured_at: Date;
}
