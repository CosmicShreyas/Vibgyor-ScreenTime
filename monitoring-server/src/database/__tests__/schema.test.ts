import { readFileSync } from 'fs';
import { join } from 'path';

describe('Database Schema', () => {
  let schemaSql: string;

  beforeAll(() => {
    const schemaPath = join(__dirname, '../schema.sql');
    schemaSql = readFileSync(schemaPath, 'utf-8');
  });

  describe('Table Definitions', () => {
    test('should define employees table', () => {
      expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS employees');
      expect(schemaSql).toContain('id UUID PRIMARY KEY');
      expect(schemaSql).toContain('name VARCHAR(255) NOT NULL UNIQUE');
      expect(schemaSql).toContain('first_seen TIMESTAMP');
      expect(schemaSql).toContain('last_seen TIMESTAMP');
      expect(schemaSql).toContain('created_at TIMESTAMP');
      expect(schemaSql).toContain('updated_at TIMESTAMP');
    });

    test('should define activity_logs table', () => {
      expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS activity_logs');
      expect(schemaSql).toContain('id UUID PRIMARY KEY');
      expect(schemaSql).toContain('employee_id UUID NOT NULL REFERENCES employees(id)');
      expect(schemaSql).toContain('timestamp TIMESTAMP NOT NULL');
      expect(schemaSql).toContain('interval_start TIMESTAMP NOT NULL');
      expect(schemaSql).toContain('interval_end TIMESTAMP NOT NULL');
      expect(schemaSql).toContain('work_seconds INTEGER NOT NULL');
      expect(schemaSql).toContain('idle_seconds INTEGER NOT NULL');
      expect(schemaSql).toContain('applications JSONB');
      expect(schemaSql).toContain('browser_tabs JSONB');
    });

    test('should define screenshots table', () => {
      expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS screenshots');
      expect(schemaSql).toContain('id UUID PRIMARY KEY');
      expect(schemaSql).toContain('employee_id UUID NOT NULL REFERENCES employees(id)');
      expect(schemaSql).toContain('activity_log_id UUID NOT NULL REFERENCES activity_logs(id)');
      expect(schemaSql).toContain('file_path VARCHAR(512)');
      expect(schemaSql).toContain('file_size INTEGER NOT NULL');
      expect(schemaSql).toContain('captured_at TIMESTAMP');
      expect(schemaSql).toContain('expires_at TIMESTAMP');
    });
  });

  describe('Foreign Key Relationships', () => {
    test('should define CASCADE DELETE for activity_logs', () => {
      expect(schemaSql).toContain('REFERENCES employees(id) ON DELETE CASCADE');
    });

    test('should define CASCADE DELETE for screenshots', () => {
      const screenshotsSection = schemaSql.substring(
        schemaSql.indexOf('CREATE TABLE IF NOT EXISTS screenshots')
      );
      expect(screenshotsSection).toContain('REFERENCES employees(id) ON DELETE CASCADE');
      expect(screenshotsSection).toContain('REFERENCES activity_logs(id) ON DELETE CASCADE');
    });
  });

  describe('Indexes', () => {
    test('should create index on employees.name', () => {
      expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name)');
    });

    test('should create index on employees.last_seen', () => {
      expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_employees_last_seen ON employees(last_seen)');
    });

    test('should create index on activity_logs.employee_id', () => {
      expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_activity_logs_employee_id ON activity_logs(employee_id)');
    });

    test('should create index on activity_logs.timestamp', () => {
      expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp)');
    });

    test('should create composite index on activity_logs(employee_id, timestamp)', () => {
      expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_activity_logs_employee_timestamp ON activity_logs(employee_id, timestamp DESC)');
    });

    test('should create index on screenshots.employee_id', () => {
      expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_screenshots_employee_id ON screenshots(employee_id)');
    });

    test('should create index on screenshots.activity_log_id', () => {
      expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_screenshots_activity_log_id ON screenshots(activity_log_id)');
    });

    test('should create index on screenshots.captured_at', () => {
      expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_screenshots_captured_at ON screenshots(captured_at)');
    });

    test('should create index on screenshots.expires_at for TTL cleanup', () => {
      expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_screenshots_expires_at ON screenshots(expires_at)');
    });
  });

  describe('Constraints', () => {
    test('should enforce positive work_seconds', () => {
      expect(schemaSql).toContain('work_seconds INTEGER NOT NULL CHECK (work_seconds >= 0)');
    });

    test('should enforce positive idle_seconds', () => {
      expect(schemaSql).toContain('idle_seconds INTEGER NOT NULL CHECK (idle_seconds >= 0)');
    });

    test('should enforce positive file_size', () => {
      expect(schemaSql).toContain('file_size INTEGER NOT NULL CHECK (file_size > 0)');
    });
  });

  describe('Triggers', () => {
    test('should define update_updated_at_column function', () => {
      expect(schemaSql).toContain('CREATE OR REPLACE FUNCTION update_updated_at_column()');
      expect(schemaSql).toContain('NEW.updated_at = CURRENT_TIMESTAMP');
    });

    test('should create trigger for employees.updated_at', () => {
      expect(schemaSql).toContain('CREATE TRIGGER update_employees_updated_at');
      expect(schemaSql).toContain('BEFORE UPDATE ON employees');
      expect(schemaSql).toContain('EXECUTE FUNCTION update_updated_at_column()');
    });
  });

  describe('Extensions', () => {
    test('should enable uuid-ossp extension', () => {
      expect(schemaSql).toContain('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    });
  });
});
