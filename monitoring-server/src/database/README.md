# Database Schema

This directory contains the database schema and migration utilities for the VibgyorSeek Employee Monitoring System.

## Schema Overview

The database consists of three main tables:

### 1. employees
Stores employee information and tracking metadata.

**Columns:**
- `id` (UUID, Primary Key): Unique employee identifier
- `name` (VARCHAR, UNIQUE): Employee name used as identifier
- `first_seen` (TIMESTAMP): Timestamp of first data received
- `last_seen` (TIMESTAMP): Timestamp of most recent data received
- `created_at` (TIMESTAMP): Record creation timestamp
- `updated_at` (TIMESTAMP): Record last update timestamp

**Indexes:**
- `idx_employees_name`: Fast lookups by employee name
- `idx_employees_last_seen`: Status queries based on last activity

### 2. activity_logs
Stores monitoring data collected from client applications.

**Columns:**
- `id` (UUID, Primary Key): Unique activity log identifier
- `employee_id` (UUID, Foreign Key): References employees(id)
- `timestamp` (TIMESTAMP): Data collection timestamp from client
- `interval_start` (TIMESTAMP): Start of monitoring interval
- `interval_end` (TIMESTAMP): End of monitoring interval
- `work_seconds` (INTEGER): Cumulative work time in seconds
- `idle_seconds` (INTEGER): Cumulative idle time in seconds
- `applications` (JSONB): JSON array of open applications
- `browser_tabs` (JSONB): JSON array of browser tabs
- `created_at` (TIMESTAMP): Record creation timestamp

**Indexes:**
- `idx_activity_logs_employee_id`: Fast employee-specific queries
- `idx_activity_logs_timestamp`: Time-based queries
- `idx_activity_logs_employee_timestamp`: Composite index for most common query pattern
- `idx_activity_logs_interval_start`: Date range queries

### 3. screenshots
Stores screenshot metadata and file path references.

**Columns:**
- `id` (UUID, Primary Key): Unique screenshot identifier
- `employee_id` (UUID, Foreign Key): References employees(id)
- `activity_log_id` (UUID, Foreign Key): References activity_logs(id)
- `file_path` (VARCHAR): Filesystem path to screenshot image
- `file_size` (INTEGER): File size in bytes
- `captured_at` (TIMESTAMP): Screenshot capture timestamp
- `created_at` (TIMESTAMP): Record creation timestamp
- `expires_at` (TIMESTAMP): TTL expiration timestamp for cleanup

**Indexes:**
- `idx_screenshots_employee_id`: Employee-specific screenshot queries
- `idx_screenshots_activity_log_id`: Linking screenshots to activity logs
- `idx_screenshots_captured_at`: Time-based queries
- `idx_screenshots_expires_at`: TTL cleanup job queries
- `idx_screenshots_employee_captured`: Composite index for employee + time queries

## Relationships

```
employees (1) ──< (N) activity_logs
employees (1) ──< (N) screenshots
activity_logs (1) ──< (N) screenshots
```

- One employee can have many activity logs
- One employee can have many screenshots
- One activity log can have many screenshots
- Foreign keys use CASCADE DELETE to maintain referential integrity

## Running Migrations

### Automatic Initialization
The database schema is automatically initialized when the server starts if tables don't exist.

### Manual Migration
To manually run migrations:

```bash
npm run migrate
```

Or using ts-node:

```bash
npx ts-node src/database/migrate.ts
```

### Check Schema Status
The migration utility automatically checks if tables exist before running migrations.

## Query Optimization

The schema includes several indexes optimized for common query patterns:

1. **Employee Lookup**: Fast retrieval by employee name
2. **Recent Activity**: Composite index on (employee_id, timestamp) for dashboard queries
3. **Date Range Queries**: Indexes on timestamp fields for filtering by date
4. **TTL Cleanup**: Index on expires_at for efficient screenshot cleanup job
5. **Status Queries**: Index on last_seen for determining employee online/offline status

## Data Types

- **UUID**: Used for all primary keys and foreign keys for better distribution and security
- **TIMESTAMP**: All timestamps stored in UTC
- **JSONB**: Used for applications and browser_tabs arrays for flexible schema and efficient querying
- **INTEGER**: Used for time durations and file sizes with CHECK constraints for validation

## Constraints

- **NOT NULL**: All required fields have NOT NULL constraints
- **UNIQUE**: Employee name must be unique
- **CHECK**: Positive values enforced for work_seconds, idle_seconds, and file_size
- **FOREIGN KEY**: Referential integrity with CASCADE DELETE

## Triggers

- **update_employees_updated_at**: Automatically updates the updated_at timestamp on employee records

## Performance Considerations

- Connection pooling configured with max 20 connections
- Composite indexes for common query patterns
- JSONB for flexible schema without performance penalty
- Proper indexing strategy for read-heavy workload
- CASCADE DELETE for automatic cleanup of related records
