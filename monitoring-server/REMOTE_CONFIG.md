# Remote Configuration Management

This document describes the remote configuration management system that allows administrators to remotely configure monitoring clients from the dashboard.

## Overview

The remote configuration system enables:
- Centralized configuration management from the dashboard
- Real-time configuration updates pushed to clients
- Automatic client restart to apply new settings
- Version tracking to detect configuration changes

## Architecture

### Components

1. **Server (monitoring-server)**
   - `config.service.ts`: Manages configuration storage and retrieval
   - `config.routes.ts`: API endpoints for configuration management
   - Database table: `client_configs` stores per-employee configurations

2. **Dashboard (monitoring-dashboard)**
   - `ConfigurationTab.tsx`: UI for editing client configurations
   - `SettingsPage.tsx`: Settings page with configuration tab
   - `api.ts`: API client methods for config operations

3. **Client (monitoring-client)**
   - `config_watcher.py`: Monitors for configuration changes
   - `config.py`: Configuration loader and manager
   - Integrated into `monitoring_loop.py` for automatic checking

## How It Works

### Configuration Update Flow

```
Dashboard → Server → Database → Client Detection → Client Restart
```

1. **Admin Updates Config**: Administrator edits configuration in the dashboard
2. **Server Stores Config**: Server saves configuration to database with incremented version
3. **WebSocket Notification**: Server sends real-time notification to connected clients
4. **Client Polls for Changes**: Client periodically checks configuration version (every 60 seconds)
5. **Client Detects Change**: When version increases, client downloads new configuration
6. **Client Applies Config**: Client writes new configuration to `.env` file
7. **Client Restarts**: Client automatically restarts to load new configuration

### Configuration Parameters

The following parameters can be remotely configured:

#### Interval Settings
- `screenshot_interval_minutes`: Screenshot capture frequency (default: 10 min)
- `data_send_interval_minutes`: Data transmission frequency (default: 10 min)
- `location_update_interval_minutes`: Location update frequency (default: 30 min)
- `idle_threshold_seconds`: Idle timeout threshold (default: 300 sec)
- `app_usage_poll_interval_seconds`: App usage polling frequency (default: 10 sec)

#### Screenshot Settings
- `screenshot_quality`: JPEG quality 1-100 (default: 75)

#### File Transfer Settings
- `file_download_path`: Download directory for OTA files
- `file_sync_interval`: File sync check interval in seconds (default: 30)

#### Advanced Settings
- `log_level`: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
- `server_url`: Server endpoint URL
- `auth_token`: Authentication token

## API Endpoints

### Get Client Configuration
```http
GET /api/config/client/:employeeName
```

Returns the current configuration for a specific employee.

**Response:**
```json
{
  "employee_name": "John Doe",
  "server_url": "http://localhost:5000/api/monitoring/data",
  "auth_token": "token",
  "screenshot_interval_minutes": 10,
  "data_send_interval_minutes": 10,
  "location_update_interval_minutes": 30,
  "idle_threshold_seconds": 300,
  "app_usage_poll_interval_seconds": 10,
  "screenshot_quality": 75,
  "log_level": "INFO",
  "file_download_path": "C:\\Downloads\\CompanyFiles",
  "file_sync_interval": 30,
  "version": 1,
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### Get Configuration Version
```http
GET /api/config/client/:employeeName/version
```

Returns only the version number for change detection.

**Response:**
```json
{
  "version": 5
}
```

### Update Client Configuration
```http
PUT /api/config/client/:employeeName
Authorization: Bearer <dashboard-token>
Content-Type: application/json

{
  "screenshot_interval_minutes": 15,
  "screenshot_quality": 80
}
```

Updates the configuration for a specific employee. Only changed fields need to be provided.

**Response:**
```json
{
  "success": true,
  "message": "Configuration updated successfully"
}
```

### Get Default Configuration
```http
GET /api/config/defaults
Authorization: Bearer <dashboard-token>
```

Returns the default configuration values.

## Database Schema

```sql
CREATE TABLE client_configs (
  employee_name VARCHAR(255) PRIMARY KEY,
  server_url VARCHAR(512) NOT NULL,
  auth_token VARCHAR(512) NOT NULL,
  screenshot_interval_minutes INTEGER NOT NULL DEFAULT 10,
  data_send_interval_minutes INTEGER NOT NULL DEFAULT 10,
  location_update_interval_minutes INTEGER NOT NULL DEFAULT 30,
  idle_threshold_seconds INTEGER NOT NULL DEFAULT 300,
  app_usage_poll_interval_seconds INTEGER NOT NULL DEFAULT 10,
  screenshot_quality INTEGER NOT NULL DEFAULT 75,
  log_level VARCHAR(20) NOT NULL DEFAULT 'INFO',
  file_download_path VARCHAR(512) NOT NULL DEFAULT 'C:\Downloads\CompanyFiles',
  file_sync_interval INTEGER NOT NULL DEFAULT 30,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Client Implementation

### ConfigWatcher Class

The `ConfigWatcher` class in `config_watcher.py` handles:
- Periodic version checking (every 60 seconds)
- Configuration download when changes detected
- `.env` file updates
- Automatic application restart

### Integration with Monitoring Loop

The config watcher is integrated into the main monitoring loop:

```python
# Initialize config watcher
self.config_watcher = ConfigWatcher(
    config=self.config,
    check_interval_seconds=60
)

# Start config watcher
self.config_watcher.start()

# Check for updates in main loop
self.config_watcher.check_once()
```

## Security Considerations

1. **Authentication**: Configuration updates require dashboard authentication token
2. **Authorization**: Only authenticated dashboard users can modify configurations
3. **Validation**: Server validates all configuration parameters before storing
4. **Audit Trail**: All configuration changes are logged with timestamps
5. **Version Control**: Version tracking prevents race conditions

## Usage Guide

### For Administrators

1. Navigate to Settings → Configuration in the dashboard
2. Select the employee whose configuration you want to modify
3. Adjust the desired parameters using the UI controls
4. Click "Save Changes"
5. The client will automatically detect and apply changes within 60 seconds

### For Developers

To add a new configuration parameter:

1. Add the field to the database schema in `schema.sql`
2. Update the `ClientConfig` interface in `config.service.ts`
3. Add the field to `getDefaultConfig()` and `updateClientConfig()` methods
4. Update the `Config` class in `config.py` to read the new parameter
5. Add UI controls in `ConfigurationTab.tsx`
6. Update the `.env` file template in `config_watcher.py`

## Troubleshooting

### Client Not Detecting Changes

1. Check client logs for config watcher errors
2. Verify network connectivity to server
3. Ensure employee name matches exactly
4. Check server logs for API errors

### Configuration Not Applied

1. Verify client restarted successfully
2. Check `.env` file was updated
3. Review client logs for configuration loading errors
4. Ensure no syntax errors in `.env` file

### Version Mismatch

1. Check database for correct version number
2. Verify client is checking the correct endpoint
3. Review server logs for version query errors

## Best Practices

1. **Test Changes**: Test configuration changes on a single client before rolling out
2. **Document Changes**: Keep notes on why configurations were changed
3. **Monitor Impact**: Watch client behavior after configuration changes
4. **Gradual Rollout**: Update configurations in batches, not all at once
5. **Backup Configs**: Keep backups of working configurations
6. **Reasonable Values**: Use recommended values as guidelines

## Future Enhancements

- Bulk configuration updates for multiple employees
- Configuration templates and profiles
- Scheduled configuration changes
- Configuration rollback functionality
- Configuration change history and audit log
- Real-time configuration preview
- Configuration validation before applying
