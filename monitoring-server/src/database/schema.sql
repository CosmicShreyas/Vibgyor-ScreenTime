-- VibgyorSeek Employee Monitoring System Database Schema
-- PostgreSQL Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Employee Table
-- Stores basic employee information
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL UNIQUE,
  first_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index on employee name for fast lookups
CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);

-- Create index on last_seen for status queries
CREATE INDEX IF NOT EXISTS idx_employees_last_seen ON employees(last_seen);

-- Activity Log Table
-- Stores monitoring data collected from clients
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  timestamp TIMESTAMP NOT NULL,
  interval_start TIMESTAMP NOT NULL,
  interval_end TIMESTAMP NOT NULL,
  work_seconds INTEGER NOT NULL CHECK (work_seconds >= 0),
  idle_seconds INTEGER NOT NULL CHECK (idle_seconds >= 0),
  applications JSONB NOT NULL DEFAULT '[]'::jsonb,
  browser_tabs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index on employee_id for fast employee-specific queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_employee_id ON activity_logs(employee_id);

-- Create index on timestamp for time-based queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp);

-- Create composite index for employee + timestamp queries (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_activity_logs_employee_timestamp ON activity_logs(employee_id, timestamp DESC);

-- Create index on interval_start for date range queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_interval_start ON activity_logs(interval_start);

-- Screenshot Table
-- Stores screenshot metadata and file references
CREATE TABLE IF NOT EXISTS screenshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  activity_log_id UUID NOT NULL REFERENCES activity_logs(id) ON DELETE CASCADE,
  file_path VARCHAR(512) NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0),
  captured_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

-- Create index on employee_id for employee-specific screenshot queries
CREATE INDEX IF NOT EXISTS idx_screenshots_employee_id ON screenshots(employee_id);

-- Create index on activity_log_id for linking screenshots to activity logs
CREATE INDEX IF NOT EXISTS idx_screenshots_activity_log_id ON screenshots(activity_log_id);

-- Create index on captured_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_screenshots_captured_at ON screenshots(captured_at);

-- Create index on expires_at for TTL cleanup job
CREATE INDEX IF NOT EXISTS idx_screenshots_expires_at ON screenshots(expires_at);

-- Create composite index for employee + captured_at queries
CREATE INDEX IF NOT EXISTS idx_screenshots_employee_captured ON screenshots(employee_id, captured_at DESC);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on employees table
CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE employees IS 'Stores employee information and tracking metadata';
COMMENT ON TABLE activity_logs IS 'Stores monitoring data collected from client applications';
COMMENT ON TABLE screenshots IS 'Stores screenshot metadata and file path references';

COMMENT ON COLUMN employees.name IS 'Unique employee name used as identifier';
COMMENT ON COLUMN employees.first_seen IS 'Timestamp of first data received from this employee';
COMMENT ON COLUMN employees.last_seen IS 'Timestamp of most recent data received from this employee';

COMMENT ON COLUMN activity_logs.timestamp IS 'Data collection timestamp from client';
COMMENT ON COLUMN activity_logs.interval_start IS 'Start of monitoring interval';
COMMENT ON COLUMN activity_logs.interval_end IS 'End of monitoring interval';
COMMENT ON COLUMN activity_logs.work_seconds IS 'Cumulative work time in seconds';
COMMENT ON COLUMN activity_logs.idle_seconds IS 'Cumulative idle time in seconds';
COMMENT ON COLUMN activity_logs.applications IS 'JSON array of open applications';
COMMENT ON COLUMN activity_logs.browser_tabs IS 'JSON array of browser tabs';

COMMENT ON COLUMN screenshots.file_path IS 'Filesystem path to screenshot image';
COMMENT ON COLUMN screenshots.file_size IS 'File size in bytes';
COMMENT ON COLUMN screenshots.captured_at IS 'Screenshot capture timestamp';
COMMENT ON COLUMN screenshots.expires_at IS 'TTL expiration timestamp for cleanup';

-- Client Configuration Table
-- Stores per-employee client configuration settings
CREATE TABLE IF NOT EXISTS client_configs (
  employee_name VARCHAR(255) PRIMARY KEY,
  server_url VARCHAR(512) NOT NULL,
  auth_token VARCHAR(512) NOT NULL,
  screenshot_interval_minutes INTEGER NOT NULL DEFAULT 10 CHECK (screenshot_interval_minutes > 0),
  data_send_interval_minutes INTEGER NOT NULL DEFAULT 10 CHECK (data_send_interval_minutes > 0),
  location_update_interval_minutes INTEGER NOT NULL DEFAULT 30 CHECK (location_update_interval_minutes > 0),
  idle_threshold_seconds INTEGER NOT NULL DEFAULT 300 CHECK (idle_threshold_seconds > 0),
  app_usage_poll_interval_seconds INTEGER NOT NULL DEFAULT 10 CHECK (app_usage_poll_interval_seconds >= 2),
  screenshot_quality INTEGER NOT NULL DEFAULT 75 CHECK (screenshot_quality BETWEEN 1 AND 100),
  log_level VARCHAR(20) NOT NULL DEFAULT 'INFO' CHECK (log_level IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL')),
  file_download_path VARCHAR(512) NOT NULL DEFAULT 'C:\Downloads\CompanyFiles',
  file_sync_interval INTEGER NOT NULL DEFAULT 30 CHECK (file_sync_interval > 0),
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index on version for change detection
CREATE INDEX IF NOT EXISTS idx_client_configs_version ON client_configs(version);

-- Create index on updated_at for tracking changes
CREATE INDEX IF NOT EXISTS idx_client_configs_updated_at ON client_configs(updated_at);

COMMENT ON TABLE client_configs IS 'Stores client configuration settings per employee';
COMMENT ON COLUMN client_configs.version IS 'Configuration version number for change detection';
COMMENT ON COLUMN client_configs.updated_at IS 'Last configuration update timestamp';
