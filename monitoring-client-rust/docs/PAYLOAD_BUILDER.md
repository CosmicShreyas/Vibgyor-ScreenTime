# Payload Builder Module

## Overview

The Payload Builder module aggregates data from all monitoring modules and constructs JSON payloads for transmission to the server. It manages interval tracking, handles optional fields, and provides thread-safe access to shared state.

## Features

- **Data Aggregation**: Collects data from activity tracker, app usage tracker, browser tab tracker, and location tracker
- **Interval Management**: Tracks monitoring intervals with start/end timestamps
- **Screenshot Handling**: Manages screenshot data for each interval
- **Optional Fields**: Properly handles optional location and screenshot data
- **JSON Serialization**: Converts payloads to JSON (compact or pretty-printed)
- **Thread-Safe**: Safe for concurrent access from multiple tasks
- **Async-Compatible**: Works with async location fetching

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   PayloadBuilder                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────┐         ┌──────────────────┐       │
│  │  Activity      │────────▶│  Activity Data   │       │
│  │  Tracker       │         │  (work/idle)     │       │
│  └────────────────┘         └──────────────────┘       │
│                                                          │
│  ┌────────────────┐         ┌──────────────────┐       │
│  │  App Usage     │────────▶│  Application     │       │
│  │  Tracker       │         │  Durations       │       │
│  └────────────────┘         └──────────────────┘       │
│                                                          │
│  ┌────────────────┐         ┌──────────────────┐       │
│  │  Browser Tab   │────────▶│  Browser Tab     │       │
│  │  Tracker       │         │  Durations       │       │
│  └────────────────┘         └──────────────────┘       │
│                                                          │
│  ┌────────────────┐         ┌──────────────────┐       │
│  │  Location      │────────▶│  Location Data   │       │
│  │  Tracker       │         │  (optional)      │       │
│  └────────────────┘         └──────────────────┘       │
│                                                          │
│  ┌────────────────┐         ┌──────────────────┐       │
│  │  Screenshot    │────────▶│  Screenshot Data │       │
│  │  Data          │         │  (optional)      │       │
│  └────────────────┘         └──────────────────┘       │
│                                                          │
│                    ▼                                     │
│            ┌──────────────────┐                         │
│            │  JSON Payload    │                         │
│            └──────────────────┘                         │
└─────────────────────────────────────────────────────────┘
```

## Usage

### Basic Usage

```rust
use monitoring_client::modules::payload_builder::PayloadBuilder;
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create monitoring modules
    let activity_tracker = Arc::new(ActivityTracker::new(300)?);
    let app_usage_tracker = Arc::new(AppUsageTracker::new(app_monitor, 10.0));
    let browser_tab_tracker = Some(Arc::new(BrowserTabUsageTracker::new(browser_monitor)));
    let location_tracker = Some(Arc::new(LocationTracker::new()));
    
    // Create payload builder
    let builder = PayloadBuilder::new(
        activity_tracker,
        app_usage_tracker,
        browser_tab_tracker,
        location_tracker,
    );
    
    // Start a new interval
    builder.start_interval();
    
    // ... monitoring happens ...
    
    // Set screenshot data
    builder.set_screenshot("base64_encoded_screenshot".to_string());
    
    // Build payload
    let payload = builder.build_payload("John Doe", "client-123").await?;
    
    // Serialize to JSON
    let json = PayloadBuilder::serialize_payload(&payload)?;
    println!("{}", json);
    
    Ok(())
}
```

### Interval Management

```rust
// Start a new interval
builder.start_interval();

// Check interval start time
if let Some(start) = builder.get_interval_start() {
    println!("Interval started at: {}", start);
}

// Build payload (automatically uses interval times)
let payload = builder.build_payload("employee", "client-id").await?;
```

### Screenshot Management

```rust
// Set screenshot data
builder.set_screenshot(screenshot_base64);

// Check if screenshot is available
if builder.has_screenshot() {
    println!("Screenshot available");
}

// Clear screenshot
builder.clear_screenshot();
```

### JSON Serialization

```rust
// Compact JSON
let compact = PayloadBuilder::serialize_payload(&payload)?;

// Pretty-printed JSON
let pretty = PayloadBuilder::serialize_payload_pretty(&payload)?;

println!("Compact: {} bytes", compact.len());
println!("Pretty:  {} bytes", pretty.len());
```

## API Reference

### `PayloadBuilder`

#### Methods

##### `new(...) -> Self`
Create a new payload builder.

**Parameters:**
- `activity_tracker`: Arc<ActivityTracker> - Activity tracking module
- `app_usage_tracker`: Arc<AppUsageTracker> - App usage tracking module
- `browser_tab_tracker`: Option<Arc<BrowserTabUsageTracker>> - Browser tab tracker (optional)
- `location_tracker`: Option<Arc<LocationTracker>> - Location tracker (optional)

**Returns:**
- New `PayloadBuilder` instance

##### `start_interval(&self)`
Mark the start of a new monitoring interval. Resets interval start time and clears cached screenshot.

##### `set_screenshot(&self, screenshot_data: String)`
Store screenshot data for the current interval.

**Parameters:**
- `screenshot_data`: Base64-encoded screenshot string

##### `async build_payload(&self, employee_name: &str, client_id: &str) -> Result<Payload>`
Build a complete data payload with all monitoring data.

**Parameters:**
- `employee_name`: Employee name (defaults to client_id if empty)
- `client_id`: Unique client identifier (required, cannot be empty)

**Returns:**
- `Ok(Payload)`: Complete payload structure
- `Err(MonitoringError)`: If client_id is empty or data collection fails

##### `get_interval_start(&self) -> Option<DateTime<Utc>>`
Get the current interval start time.

**Returns:**
- `Some(DateTime<Utc>)`: Interval start time if set
- `None`: If no interval has been started

##### `has_screenshot(&self) -> bool`
Check if screenshot data is available.

**Returns:**
- `true` if screenshot data has been set

##### `clear_screenshot(&self)`
Clear the cached screenshot data.

##### `serialize_payload(payload: &Payload) -> Result<String>`
Serialize payload to compact JSON string.

**Parameters:**
- `payload`: The payload to serialize

**Returns:**
- `Ok(String)`: JSON string representation
- `Err(MonitoringError)`: If serialization fails

##### `serialize_payload_pretty(payload: &Payload) -> Result<String>`
Serialize payload to pretty-printed JSON string.

**Parameters:**
- `payload`: The payload to serialize

**Returns:**
- `Ok(String)`: Pretty-printed JSON string
- `Err(MonitoringError)`: If serialization fails

## Payload Structure

### JSON Format

```json
{
  "client_id": "unique-client-id",
  "employee_name": "Employee Name",
  "timestamp": "2026-04-08T12:00:00.000Z",
  "interval_start": "2026-04-08T11:50:00.000Z",
  "interval_end": "2026-04-08T12:00:00.000Z",
  "activity": {
    "work_seconds": 500,
    "idle_seconds": 100
  },
  "applications": [
    {
      "name": "Chrome",
      "duration": 300
    },
    {
      "name": "VSCode",
      "duration": 200
    }
  ],
  "browser_tabs": [
    {
      "browser": "Chrome",
      "title": "GitHub",
      "url": "https://github.com",
      "duration": 150
    }
  ],
  "screenshot": "base64_encoded_data...",
  "location": {
    "city": "San Francisco",
    "state": "California",
    "country": "United States"
  }
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| client_id | String | Yes | Unique client identifier |
| employee_name | String | Yes | Employee name (defaults to client_id) |
| timestamp | DateTime | Yes | Payload creation timestamp (ISO 8601) |
| interval_start | DateTime | Yes | Monitoring interval start time |
| interval_end | DateTime | Yes | Monitoring interval end time |
| activity | Object | Yes | Activity data (work/idle seconds) |
| applications | Array | Yes | Application usage data |
| browser_tabs | Array | Yes | Browser tab usage data |
| screenshot | String | Yes | Base64-encoded screenshot (empty if none) |
| location | Object | No | Geographic location (omitted if unavailable) |

### Optional Fields

Fields marked with `#[serde(skip_serializing_if = "Option::is_none")]` are omitted from JSON when `None`:

- `location`: Only included when location data is available

## Data Flow

### 1. Interval Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│ 1. Start Interval                                        │
│    - Set interval_start_time to current time            │
│    - Clear cached screenshot                            │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│ 2. Monitoring Period                                     │
│    - Activity tracker accumulates work/idle time        │
│    - App usage tracker records application durations    │
│    - Browser tab tracker records tab durations          │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│ 3. Screenshot Capture (Optional)                        │
│    - Capture screenshot at configured interval          │
│    - Store base64-encoded data                          │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│ 4. Build Payload                                         │
│    - Collect data from all trackers                     │
│    - Fetch location (if tracker available)              │
│    - Set interval_end_time to current time              │
│    - Construct Payload struct                           │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│ 5. Serialize to JSON                                     │
│    - Convert Payload to JSON string                     │
│    - Ready for transmission                             │
└─────────────────────────────────────────────────────────┘
```

### 2. Data Collection Flow

```rust
// Activity data
let (work_seconds, idle_seconds, _) = activity_tracker.get_activity_data();

// Application durations
let app_durations = app_usage_tracker.get_application_durations();

// Browser tab durations (if available)
let browser_tabs = if let Some(tracker) = browser_tab_tracker {
    tracker.get_tab_durations()
} else {
    Vec::new()
};

// Location (if available)
let location = if let Some(tracker) = location_tracker {
    tracker.get_location().await.ok().flatten()
} else {
    None
};

// Screenshot (from cache)
let screenshot = screenshot_data.clone().unwrap_or_default();
```

## Thread Safety

The PayloadBuilder uses `parking_lot::RwLock` for thread-safe access to shared state:

- **interval_start_time**: Protected by RwLock
- **screenshot_data**: Protected by RwLock
- **Monitoring modules**: Shared via Arc, each has its own synchronization

### Concurrent Access

```rust
// Multiple tasks can safely access the builder
let builder = Arc::new(PayloadBuilder::new(...));

// Task 1: Set screenshot
let builder_clone = Arc::clone(&builder);
tokio::spawn(async move {
    builder_clone.set_screenshot(screenshot);
});

// Task 2: Build payload
let builder_clone = Arc::clone(&builder);
tokio::spawn(async move {
    let payload = builder_clone.build_payload("name", "id").await?;
});
```

## Error Handling

### Validation Errors

```rust
// Empty client_id
let result = builder.build_payload("name", "").await;
assert!(matches!(result, Err(MonitoringError::Config(_))));

// Whitespace-only client_id
let result = builder.build_payload("name", "   ").await;
assert!(matches!(result, Err(MonitoringError::Config(_))));
```

### Serialization Errors

```rust
// Serialization should not fail for valid payloads
let json = PayloadBuilder::serialize_payload(&payload);
assert!(json.is_ok());
```

### Location Errors

Location errors are handled gracefully - if location fetching fails, the payload is built without location data:

```rust
// Location error doesn't prevent payload building
let payload = builder.build_payload("name", "id").await?;
assert!(payload.location.is_none()); // Location omitted on error
```

## Performance Characteristics

### Memory Usage
- **PayloadBuilder**: ~200 bytes (pointers + RwLocks)
- **Payload**: Variable (depends on data size)
  - Typical: 1-10 KB
  - With screenshot: 10-100 KB
  - Large (many apps/tabs): 100+ KB

### Serialization Performance
- **Compact JSON**: ~1-5ms for typical payload
- **Pretty JSON**: ~2-10ms for typical payload
- **Large payloads**: Linear with data size

### Concurrency
- **Read operations**: Multiple concurrent readers
- **Write operations**: Exclusive access (one writer at a time)
- **No blocking**: Async-compatible

## Integration Example

### In Monitoring Loop

```rust
use std::sync::Arc;
use tokio::time::{interval, Duration};

async fn monitoring_loop() {
    let builder = Arc::new(PayloadBuilder::new(...));
    let mut data_timer = interval(Duration::from_secs(600)); // 10 minutes
    let mut screenshot_timer = interval(Duration::from_secs(600));
    
    loop {
        tokio::select! {
            _ = data_timer.tick() => {
                // Build and send payload
                match builder.build_payload("employee", "client-id").await {
                    Ok(payload) => {
                        let json = PayloadBuilder::serialize_payload(&payload)?;
                        // Send to server...
                    }
                    Err(e) => eprintln!("Error building payload: {}", e),
                }
                
                // Start new interval
                builder.start_interval();
            }
            
            _ = screenshot_timer.tick() => {
                // Capture and store screenshot
                if let Ok(screenshot) = capture_screenshot().await {
                    builder.set_screenshot(screenshot);
                }
            }
        }
    }
}
```

## Testing

### Unit Tests

Run unit tests:
```bash
cargo test --lib payload_builder
```

### Integration Tests

Run integration tests:
```bash
cargo test --test payload_builder_integration_test
```

### Example Demo

Run the payload demo:
```bash
cargo run --example payload_demo
```

## Troubleshooting

### Empty Payload Fields

**Problem**: Applications or browser tabs array is empty

**Solutions:**
- Verify monitoring modules are running
- Check that trackers have collected data
- Ensure sufficient time has passed for data collection

### Missing Location

**Problem**: Location field is omitted from JSON

**Solutions:**
- Verify location tracker is initialized
- Check network connectivity to geolocation API
- Review location tracker logs for errors
- This is expected behavior when location is unavailable

### Serialization Errors

**Problem**: JSON serialization fails

**Solutions:**
- Check for invalid UTF-8 in strings
- Verify all fields are properly initialized
- Review error message for specific field causing issue

### Timestamp Format Issues

**Problem**: Timestamps not in ISO 8601 format

**Solutions:**
- Ensure using `chrono::DateTime<Utc>`
- Verify serde_json is serializing correctly
- Check that timestamps are not manually formatted

## Best Practices

1. **Start Intervals**: Always call `start_interval()` at the beginning of each monitoring period
2. **Screenshot Timing**: Set screenshot data before building payload
3. **Error Handling**: Handle `build_payload()` errors gracefully
4. **Validation**: Validate client_id before passing to `build_payload()`
5. **Serialization**: Use compact JSON for transmission, pretty JSON for debugging
6. **Thread Safety**: Share PayloadBuilder via Arc when using across tasks
7. **Optional Trackers**: It's okay to pass None for optional trackers

## Related Modules

- **Activity Tracker**: Provides work/idle time data
- **App Usage Tracker**: Provides application duration data
- **Browser Tab Tracker**: Provides browser tab duration data
- **Location Tracker**: Provides geographic location data
- **Screenshot Module**: Captures and encodes screenshots
- **HTTP Transmitter**: Sends payloads to server

## References

- [Serde JSON Documentation](https://docs.rs/serde_json/)
- [Chrono DateTime](https://docs.rs/chrono/)
- [parking_lot RwLock](https://docs.rs/parking_lot/)
