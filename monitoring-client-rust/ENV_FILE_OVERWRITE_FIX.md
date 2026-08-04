# .env File Overwrite Issue - FIXED

## Problem

The monitoring client was overwriting the `.env` file with `localhost:5000` even when you had configured a different server URL. This happened because:

1. **ConfigWatcher polls the server** every 60 seconds at `/api/client-env`
2. When the server doesn't respond or returns empty data, it used **hardcoded defaults**
3. The default `SERVER_URL` was `http://localhost:5000/api/monitoring/data`
4. This **overwrote your custom .env file** with localhost

## Root Cause

**File**: `src/modules/config_watcher.rs`

**Line 377** (old code):
```rust
let server_url = config_data["SERVER_URL"]
    .as_str()
    .unwrap_or("http://localhost:5000/api/monitoring/data");  // ❌ HARDCODED DEFAULT
```

When the server didn't provide a `SERVER_URL`, it defaulted to localhost and overwrote your file.

## Solution Implemented

### Change 1: Use Current Config as Defaults

Instead of hardcoded defaults, the code now uses the **current loaded configuration** as defaults:

```rust
// Get current config values as defaults (preserve existing .env values)
let current_config = self.config.read();

let server_url = config_data["SERVER_URL"]
    .as_str()
    .unwrap_or(&current_config.server_url);  // ✅ USE EXISTING VALUE
```

This means:
- If server provides new config → Use it
- If server doesn't provide config → Keep your existing value
- Your `.env` file is **never overwritten with localhost**

### Change 2: Only Write When Server Provides Data

Added validation to only update `.env` when server actually provides configuration:

```rust
// Only update .env if server provided actual configuration data
if config_data.is_object() && !config_data.as_object().unwrap().is_empty() {
    info!("📦 Received configuration data from server");
    self.write_env_file(&config_data)?;
    info!("✅ Configuration file updated successfully");
    Ok(true)
} else {
    warn!("⚠️ Server returned empty config - keeping existing .env file");
    Ok(false)
}
```

### Change 3: Better Error Messages

Updated error messages to be more informative:

```rust
warn!("⚠️ Failed to fetch config: HTTP {} - keeping existing .env file", response.status());
```

## How It Works Now

### Scenario 1: Server Provides Full Config
```
1. Client polls /api/client-env
2. Server responds with complete config
3. Client updates .env with server values
✅ Result: .env updated with server config
```

### Scenario 2: Server Provides Partial Config
```
1. Client polls /api/client-env
2. Server responds with partial config (e.g., only intervals)
3. Client uses server values for provided fields
4. Client uses existing .env values for missing fields
✅ Result: .env updated with mix of server + existing values
```

### Scenario 3: Server Doesn't Respond
```
1. Client polls /api/client-env
2. Server doesn't respond (timeout/error)
3. Client logs warning
4. Client keeps existing .env file unchanged
✅ Result: .env file preserved with your custom values
```

### Scenario 4: Server Returns Empty Config
```
1. Client polls /api/client-env
2. Server responds with empty object {}
3. Client detects empty config
4. Client keeps existing .env file unchanged
✅ Result: .env file preserved with your custom values
```

## Testing the Fix

### Before Fix:
```bash
# Your .env file
SERVER_URL=http://192.168.1.100:5000/api/monitoring/data

# After 60 seconds (when server doesn't respond)
SERVER_URL=http://localhost:5000/api/monitoring/data  # ❌ OVERWRITTEN!
```

### After Fix:
```bash
# Your .env file
SERVER_URL=http://192.168.1.100:5000/api/monitoring/data

# After 60 seconds (when server doesn't respond)
SERVER_URL=http://192.168.1.100:5000/api/monitoring/data  # ✅ PRESERVED!
```

## Rebuild Instructions

To apply this fix:

1. **Clean previous build**:
   ```batch
   cargo clean
   ```

2. **Rebuild the application**:
   ```batch
   cargo build --release
   ```
   OR use:
   ```batch
   rebuild_no_console.bat
   ```

3. **Verify your .env file**:
   - Set your custom `SERVER_URL`
   - Run the application
   - Wait 60+ seconds
   - Check that your `SERVER_URL` is still there

## Configuration Behavior

### What Gets Updated from Server:
- ✅ `SCREENSHOT_INTERVAL_MINUTES`
- ✅ `DATA_SEND_INTERVAL_MINUTES`
- ✅ `LOCATION_UPDATE_INTERVAL_MINUTES`
- ✅ `IDLE_THRESHOLD_SECONDS`
- ✅ `APP_USAGE_POLL_INTERVAL_SECONDS`
- ✅ `SCREENSHOT_QUALITY`
- ✅ `LOG_LEVEL`
- ✅ `FILE_DOWNLOAD_PATH`

### What Gets Preserved if Server Doesn't Provide:
- ✅ `SERVER_URL` (your custom server)
- ✅ `AUTH_TOKEN` (your authentication token)
- ✅ All interval settings (if server doesn't provide them)

## Server-Side Requirements

For the server to provide configuration, it should implement:

**Endpoint**: `GET /api/client-env`

**Response**:
```json
{
  "SERVER_URL": "http://your-server:5000/api/monitoring/data",
  "AUTH_TOKEN": "your-auth-token",
  "SCREENSHOT_INTERVAL_MINUTES": 10,
  "DATA_SEND_INTERVAL_MINUTES": 1,
  "LOCATION_UPDATE_INTERVAL_MINUTES": 30,
  "IDLE_THRESHOLD_SECONDS": 60,
  "APP_USAGE_POLL_INTERVAL_SECONDS": 10,
  "SCREENSHOT_QUALITY": 75,
  "LOG_LEVEL": "INFO",
  "FILE_DOWNLOAD_PATH": "C:\\Downloads\\CompanyFiles"
}
```

If the server doesn't implement this endpoint, the client will:
- ✅ Log a warning
- ✅ Keep existing .env values
- ✅ Continue working normally

## Disabling Server Config Polling (Optional)

If you don't want the client to poll the server for config updates at all, you can:

### Option 1: Increase Polling Interval
Edit `src/main.rs` and change the check interval:

```rust
// Check every 24 hours instead of 60 seconds
let config_watcher = Arc::new(ConfigWatcher::with_interval(
    Arc::clone(&config),
    None,
    86400  // 24 hours in seconds
)?);
```

### Option 2: Disable Config Watcher
Comment out the config watcher initialization in `src/main.rs`:

```rust
// // Start configuration watcher
// let config_watcher = Arc::clone(&self.config_watcher);
// let config_watcher_clone = Arc::clone(&config_watcher);
// tokio::spawn(async move {
//     if let Err(e) = config_watcher_clone.start().await {
//         error!("Configuration watcher error: {}", e);
//     }
// });
```

## Summary

The fix ensures that:
- ✅ Your custom `SERVER_URL` is never overwritten with localhost
- ✅ Existing .env values are preserved when server doesn't respond
- ✅ Server can still update configuration when it provides valid data
- ✅ Client continues working even if server config endpoint doesn't exist
- ✅ Better logging to understand what's happening

Your `.env` file is now safe from being overwritten! 🎉
