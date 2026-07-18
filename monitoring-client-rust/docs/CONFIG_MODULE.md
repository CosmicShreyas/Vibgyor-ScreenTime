# Configuration Module Documentation

## Overview

The configuration module (`src/modules/config.rs`) provides comprehensive configuration management for the monitoring client, including:

- Loading configuration from `.env` files
- Validation of all configuration parameters
- Default values for optional parameters
- Client ID generation and persistence
- Employee name storage
- Platform-specific configuration directories

## Configuration Parameters

### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `SERVER_URL` | String | Server endpoint URL for data transmission |
| `AUTH_TOKEN` | String | Authentication token for API requests |

### Optional Parameters

| Parameter | Type | Default | Validation | Description |
|-----------|------|---------|------------|-------------|
| `SCREENSHOT_INTERVAL_MINUTES` | u32 | 10 | > 0 | Screenshot capture interval |
| `DATA_SEND_INTERVAL_MINUTES` | u32 | 10 | > 0 | Data transmission interval |
| `LOCATION_UPDATE_INTERVAL_MINUTES` | u32 | 30 | > 0 | Location update interval |
| `IDLE_THRESHOLD_SECONDS` | u32 | 300 | > 0 | Idle timeout threshold |
| `SCREENSHOT_QUALITY` | u8 | 75 | 1-100 | JPEG quality for screenshots |
| `LOG_LEVEL` | String | INFO | DEBUG, INFO, WARNING, ERROR, CRITICAL | Logging level |
| `APP_USAGE_POLL_INTERVAL_SECONDS` | f64 | 10.0 | >= 2.0 | Application polling interval |
| `FILE_DOWNLOAD_PATH` | String | C:\Downloads\CompanyFiles | - | OTA file download directory |
| `FILE_SYNC_INTERVAL` | u32 | 30 | > 0 | File sync check interval (seconds) |

## Usage Examples

### Loading Configuration

```rust
use monitoring_client::modules::config::Config;

// Load from default .env file
let config = Config::load(None)?;

// Load from specific file
let config = Config::load(Some("custom.env"))?;

// Access configuration values
println!("Server URL: {}", config.server_url);
println!("Screenshot Quality: {}", config.screenshot_quality);
```

### Hot-Reloading Configuration

```rust
let mut config = Config::load(None)?;

// Later, reload configuration without restarting
config.reload(None)?;
```

### Client ID Management

```rust
use monitoring_client::modules::config::{
    generate_client_id,
    retrieve_client_id,
    store_client_id,
};

// Generate a new UUID v4 client ID
let new_id = generate_client_id();

// Store client ID persistently
store_client_id(&new_id)?;

// Retrieve client ID (generates and stores if not found)
let client_id = retrieve_client_id()?;
```

### Employee Name Management

```rust
use monitoring_client::modules::config::{
    store_employee_name,
    retrieve_employee_name,
};

// Store employee name
store_employee_name("John Doe")?;

// Retrieve employee name
if let Some(name) = retrieve_employee_name()? {
    println!("Employee: {}", name);
}
```

## Platform-Specific Behavior

The configuration module stores persistent data (client ID and employee name) in platform-specific directories:

### Windows
- Directory: `%APPDATA%\VibgyorSeek`
- Example: `C:\Users\Username\AppData\Roaming\VibgyorSeek`

### Linux
- Directory: `~/.config/VibgyorSeek`
- Example: `/home/username/.config/VibgyorSeek`

### macOS
- Directory: `~/Library/Application Support/VibgyorSeek`
- Example: `/Users/username/Library/Application Support/VibgyorSeek`

The configuration file is named `employee_config.json` and contains:

```json
{
  "employee_name": "John Doe",
  "client_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

## Validation Rules

### Screenshot Quality
- Must be between 1 and 100 (inclusive)
- Invalid values fall back to default (75)

### Intervals
- All interval values must be positive (> 0)
- Invalid values fall back to defaults

### Log Level
- Must be one of: DEBUG, INFO, WARNING, ERROR, CRITICAL
- Case-insensitive (converted to uppercase)
- Invalid values fall back to INFO

### App Usage Poll Interval
- Must be >= 2.0 seconds (minimum polling frequency)
- Invalid values fall back to 10.0 seconds

### Required Fields
- `SERVER_URL` and `AUTH_TOKEN` must be present and non-empty
- Missing or empty values result in configuration load error

## Error Handling

The configuration module uses the `Result<T, MonitoringError>` type for error handling:

```rust
use monitoring_client::modules::config::Config;

match Config::load(None) {
    Ok(config) => {
        // Configuration loaded successfully
        println!("Server: {}", config.server_url);
    }
    Err(e) => {
        // Handle error
        eprintln!("Configuration error: {}", e);
    }
}
```

Common errors:
- `MonitoringError::Config("SERVER_URL is required")` - Missing required field
- `MonitoringError::Config("AUTH_TOKEN cannot be empty")` - Empty required field
- `MonitoringError::Io(_)` - File system errors when reading/writing config
- `MonitoringError::Serialization(_)` - JSON parsing errors

## Testing

The configuration module includes comprehensive unit tests covering:

- Loading with all required fields
- Missing required fields
- Empty required fields
- Custom interval values
- Invalid interval values
- Screenshot quality validation
- Log level validation
- App usage poll interval validation
- File download path configuration
- Configuration reload
- Client ID generation and persistence
- Employee name storage and retrieval

Run tests with:

```bash
cargo test --test config_test -- --test-threads=1
```

## Example Application

See `examples/config_demo.rs` for a complete demonstration:

```bash
cargo run --example config_demo
```

## Integration with Other Modules

The configuration module is used by all other monitoring modules:

- **Activity Tracker**: Uses `idle_threshold_seconds`
- **Screenshot Capture**: Uses `screenshot_interval_minutes` and `screenshot_quality`
- **HTTP Transmitter**: Uses `server_url`, `auth_token`, and `data_send_interval_minutes`
- **Location Tracker**: Uses `location_update_interval_minutes`
- **App Monitor**: Uses `app_usage_poll_interval_seconds`
- **File Sync Manager**: Uses `file_download_path` and `file_sync_interval_seconds`
- **Logger**: Uses `log_level`

## Best Practices

1. **Load Once**: Load configuration at application startup and share via `Arc<RwLock<Config>>`
2. **Hot-Reload**: Use the `reload()` method for configuration updates without restart
3. **Validation**: Always validate configuration after loading
4. **Error Handling**: Handle configuration errors gracefully with fallbacks
5. **Security**: Never log `AUTH_TOKEN` values
6. **Persistence**: Use `retrieve_client_id()` to ensure consistent client identification

## Future Enhancements

Potential improvements for future versions:

- Configuration encryption for sensitive values
- Remote configuration fetching from server
- Configuration schema validation with JSON Schema
- Configuration change notifications via channels
- Support for TOML and YAML configuration formats
- Environment-specific configuration profiles (dev, staging, prod)
