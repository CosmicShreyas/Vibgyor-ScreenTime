/**
 * Employee data model
 */
export interface Employee {
  id: string;
  name: string;
  first_seen: Date;
  last_seen: Date;
  monitoring_paused: boolean;
  paused_at?: Date;
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
  status: 'active' | 'idle' | 'offline' | 'paused';
  monitoring_paused: boolean;
  paused_at?: Date;
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
  monitoring_paused: boolean;
  paused_at?: Date;
  current_applications: Application[];
  current_browser_tabs: BrowserTab[];
  activity_history: ActivityDataPoint[];
  recent_screenshots: ScreenshotInfo[];
  location?: {
    city: string;
    state: string;
    country: string;
  };
  productivity?: ProductivitySummary;
  website_usage?: WebsiteUsageInfo[];
  integrity?: IntegritySummary;
}

export interface IntegritySummary {
  keystrokes: number;
  mouse_clicks: number;
  mouse_distance_px: number;
  scroll_events: number;
  keystrokes_per_min: number;
  mouse_activity_per_min: number;
  suspected_fake_seconds: number;
  genuineness_score: number; // 0-100
  suspicion_reasons: string[];
}

export type ActivityCategory = 'productive' | 'neutral' | 'unproductive';

export interface ProductivitySummary {
  score: number; // 0-100
  work_seconds: number;
  idle_seconds: number;
  category_seconds: {
    productive: number;
    neutral: number;
    unproductive: number;
  };
}

export interface WebsiteUsageInfo {
  domain: string;
  duration: number;
  visits: number;
  category: ActivityCategory;
}

/**
 * Application information
 */
export interface Application {
  name: string;
  active?: boolean;  // Optional: for backward compatibility
  duration?: number; // Optional: duration in seconds
  category?: ActivityCategory;
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
