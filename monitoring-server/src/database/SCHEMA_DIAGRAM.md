# Database Schema Diagram

## Entity Relationship Diagram

```
┌─────────────────────────────────────┐
│           employees                 │
├─────────────────────────────────────┤
│ PK  id              UUID            │
│ UK  name            VARCHAR(255)    │
│     first_seen      TIMESTAMP       │
│     last_seen       TIMESTAMP       │
│     created_at      TIMESTAMP       │
│     updated_at      TIMESTAMP       │
└─────────────────────────────────────┘
              │
              │ 1
              │
              │ N
              ├──────────────────────────────────────┐
              │                                      │
              ▼                                      ▼
┌─────────────────────────────────────┐   ┌─────────────────────────────────────┐
│        activity_logs                │   │          screenshots                │
├─────────────────────────────────────┤   ├─────────────────────────────────────┤
│ PK  id              UUID            │   │ PK  id              UUID            │
│ FK  employee_id     UUID            │◄──┤ FK  employee_id     UUID            │
│     timestamp       TIMESTAMP       │   │ FK  activity_log_id UUID            │
│     interval_start  TIMESTAMP       │   │     file_path       VARCHAR(512)    │
│     interval_end    TIMESTAMP       │   │     file_size       INTEGER         │
│     work_seconds    INTEGER         │   │     captured_at     TIMESTAMP       │
│     idle_seconds    INTEGER         │   │     created_at      TIMESTAMP       │
│     applications    JSONB           │   │     expires_at      TIMESTAMP       │
│     browser_tabs    JSONB           │   └─────────────────────────────────────┘
│     created_at      TIMESTAMP       │              ▲
└─────────────────────────────────────┘              │
              │                                      │
              │ 1                                    │
              │                                      │
              │ N                                    │
              └──────────────────────────────────────┘
```

## Relationships

### employees → activity_logs (One-to-Many)
- One employee can have many activity log entries
- Foreign Key: `activity_logs.employee_id` → `employees.id`
- Delete Behavior: CASCADE (deleting an employee deletes all their activity logs)

### employees → screenshots (One-to-Many)
- One employee can have many screenshots
- Foreign Key: `screenshots.employee_id` → `employees.id`
- Delete Behavior: CASCADE (deleting an employee deletes all their screenshots)

### activity_logs → screenshots (One-to-Many)
- One activity log can have many associated screenshots
- Foreign Key: `screenshots.activity_log_id` → `activity_logs.id`
- Delete Behavior: CASCADE (deleting an activity log deletes associated screenshots)

## Index Strategy

### employees Table
```
PRIMARY KEY: id
UNIQUE: name
INDEX: idx_employees_name (name)
INDEX: idx_employees_last_seen (last_seen)
```

**Query Optimization:**
- Fast employee lookup by name (most common query)
- Efficient status queries based on last activity time

### activity_logs Table
```
PRIMARY KEY: id
FOREIGN KEY: employee_id → employees(id)
INDEX: idx_activity_logs_employee_id (employee_id)
INDEX: idx_activity_logs_timestamp (timestamp)
INDEX: idx_activity_logs_employee_timestamp (employee_id, timestamp DESC)
INDEX: idx_activity_logs_interval_start (interval_start)
```

**Query Optimization:**
- Fast retrieval of all activity for a specific employee
- Time-based queries for activity history
- Composite index optimizes the most common query pattern (employee + recent activity)
- Date range filtering for reports

### screenshots Table
```
PRIMARY KEY: id
FOREIGN KEY: employee_id → employees(id)
FOREIGN KEY: activity_log_id → activity_logs(id)
INDEX: idx_screenshots_employee_id (employee_id)
INDEX: idx_screenshots_activity_log_id (activity_log_id)
INDEX: idx_screenshots_captured_at (captured_at)
INDEX: idx_screenshots_expires_at (expires_at)
INDEX: idx_screenshots_employee_captured (employee_id, captured_at DESC)
```

**Query Optimization:**
- Fast retrieval of screenshots for a specific employee
- Linking screenshots to activity logs
- Time-based screenshot queries
- Efficient TTL cleanup job (expires_at index)
- Composite index for employee's recent screenshots

## Data Types

### UUID
- Used for all primary keys and foreign keys
- Provides better distribution across indexes
- More secure than sequential integers
- Generated using `uuid_generate_v4()` function

### TIMESTAMP
- All timestamps stored without timezone (UTC assumed)
- Consistent time representation across the system
- Efficient for range queries and sorting

### JSONB
- Used for `applications` and `browser_tabs` arrays
- Binary JSON format for efficient storage and querying
- Allows flexible schema for application and tab data
- Supports indexing and querying within JSON structure

### INTEGER
- Used for time durations (work_seconds, idle_seconds)
- Used for file sizes (file_size)
- CHECK constraints ensure positive values

### VARCHAR
- `name`: 255 characters (sufficient for employee names)
- `file_path`: 512 characters (sufficient for file paths)

## Constraints

### NOT NULL Constraints
All essential fields are marked as NOT NULL to ensure data integrity:
- Employee name, timestamps
- Activity log data (employee_id, timestamps, work/idle seconds)
- Screenshot metadata (employee_id, activity_log_id, file_path, etc.)

### UNIQUE Constraints
- `employees.name`: Each employee name must be unique

### CHECK Constraints
- `work_seconds >= 0`: Work time cannot be negative
- `idle_seconds >= 0`: Idle time cannot be negative
- `file_size > 0`: Screenshot file must have positive size

### Foreign Key Constraints
All foreign keys use CASCADE DELETE:
- Deleting an employee automatically deletes their activity logs and screenshots
- Deleting an activity log automatically deletes associated screenshots
- Maintains referential integrity automatically

## Triggers

### update_employees_updated_at
- Automatically updates `updated_at` timestamp on employee record updates
- Triggered BEFORE UPDATE on employees table
- Ensures `updated_at` always reflects the last modification time

## Common Query Patterns

### 1. Get Employee Summary
```sql
SELECT 
  e.name,
  e.last_seen,
  COALESCE(SUM(al.work_seconds), 0) as work_time_today,
  COALESCE(SUM(al.idle_seconds), 0) as idle_time_today
FROM employees e
LEFT JOIN activity_logs al ON e.id = al.employee_id 
  AND al.timestamp >= CURRENT_DATE
GROUP BY e.id, e.name, e.last_seen;
```
**Uses indexes:** idx_employees_name, idx_activity_logs_employee_timestamp

### 2. Get Employee Activity History
```sql
SELECT 
  timestamp,
  work_seconds,
  idle_seconds,
  applications,
  browser_tabs
FROM activity_logs
WHERE employee_id = $1
  AND timestamp >= $2
  AND timestamp <= $3
ORDER BY timestamp DESC;
```
**Uses index:** idx_activity_logs_employee_timestamp

### 3. Get Recent Screenshots
```sql
SELECT 
  id,
  file_path,
  captured_at,
  file_size
FROM screenshots
WHERE employee_id = $1
ORDER BY captured_at DESC
LIMIT 20;
```
**Uses index:** idx_screenshots_employee_captured

### 4. TTL Cleanup Query
```sql
SELECT id, file_path
FROM screenshots
WHERE expires_at < CURRENT_TIMESTAMP;
```
**Uses index:** idx_screenshots_expires_at

## Performance Considerations

1. **Connection Pooling**: Max 20 connections configured in database utility
2. **Composite Indexes**: Optimized for most common query patterns
3. **JSONB**: Efficient storage and querying for flexible data structures
4. **Proper Indexing**: All foreign keys and frequently queried columns indexed
5. **CASCADE DELETE**: Automatic cleanup reduces manual maintenance queries
6. **CHECK Constraints**: Database-level validation prevents invalid data
7. **Read-Heavy Optimization**: Index strategy optimized for dashboard queries
