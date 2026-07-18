# Location Tracker Module

## Overview

The Location Tracker module provides IP-based geolocation functionality for the monitoring client. It determines the geographic location (city, state, country) based on the client's IP address using the ipapi.co geolocation service.

## Features

- **IP-based Geolocation**: Automatically determines location from client's IP address
- **Smart Caching**: Caches location data to minimize API calls and improve performance
- **Configurable Cache Duration**: Customize how long location data is cached
- **Graceful Fallback**: Returns cached location when API is unavailable
- **Thread-Safe**: Safe for concurrent access from multiple tasks
- **Async/Await**: Fully asynchronous implementation using Tokio

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   LocationTracker                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────┐         ┌──────────────────┐       │
│  │  HTTP Client   │────────▶│  ipapi.co API    │       │
│  │  (reqwest)     │         │  (Geolocation)   │       │
│  └────────────────┘         └──────────────────┘       │
│         │                                                │
│         ▼                                                │
│  ┌────────────────────────────────────────┐            │
│  │         Cached Location                 │            │
│  │  ┌──────────────────────────────────┐  │            │
│  │  │ Location { city, state, country }│  │            │
│  │  │ Timestamp (Instant)               │  │            │
│  │  └──────────────────────────────────┘  │            │
│  │         (RwLock for thread-safety)     │            │
│  └────────────────────────────────────────┘            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Usage

### Basic Usage

```rust
use monitoring_client::modules::location_tracker::LocationTracker;

#[tokio::main]
async fn main() {
    let tracker = LocationTracker::new();
    
    match tracker.get_location().await {
        Ok(Some(location)) => {
            println!("City: {}", location.city);
            println!("State: {}", location.state);
            println!("Country: {}", location.country);
        }
        Ok(None) => {
            println!("Location unavailable");
        }
        Err(e) => {
            eprintln!("Error: {}", e);
        }
    }
}
```

### Custom Cache Duration

```rust
use std::time::Duration;

// Cache location for 1 hour
let tracker = LocationTracker::with_cache_duration(Duration::from_secs(3600));
```

### Formatted Location String

```rust
let location_str = tracker.get_location_string().await;
println!("Location: {}", location_str);
// Output: "San Francisco, California, United States" or "Unknown"
```

### Force Refresh

```rust
// Bypass cache and fetch fresh location data
let location = tracker.refresh_location().await?;
```

### Cache Management

```rust
// Check if cache is valid
if tracker.is_cache_valid() {
    println!("Using cached location");
}

// Get cache age
if let Some(age) = tracker.cache_age() {
    println!("Cache age: {:?}", age);
}

// Clear cache
tracker.clear_cache();
```

## API Reference

### `LocationTracker`

#### Methods

##### `new() -> Self`
Create a new location tracker with default settings (30-minute cache duration).

##### `with_cache_duration(duration: Duration) -> Self`
Create a new location tracker with custom cache duration.

**Parameters:**
- `duration`: How long to cache location data before refreshing

##### `async get_location(&self) -> Result<Option<Location>>`
Get the current location based on IP address. Uses cached data if available and valid.

**Returns:**
- `Ok(Some(Location))`: Location successfully determined
- `Ok(None)`: Location unavailable (API error, network issue, etc.)
- `Err(MonitoringError)`: Critical error occurred

##### `async get_location_string(&self) -> String`
Get location as a formatted string.

**Returns:**
- Formatted string like "City, State, Country" or "Unknown" if unavailable

##### `async refresh_location(&self) -> Result<Option<Location>>`
Force refresh the cached location, bypassing the cache.

**Returns:**
- `Ok(Some(Location))`: Location successfully refreshed
- `Ok(None)`: Location unavailable
- `Err(MonitoringError)`: Critical error occurred

##### `is_cache_valid(&self) -> bool`
Check if cached location is still valid.

**Returns:**
- `true` if cached location exists and is not expired
- `false` otherwise

##### `cache_age(&self) -> Option<Duration>`
Get the age of the cached location.

**Returns:**
- `Some(Duration)`: Age of the cached location
- `None`: No cached location available

##### `clear_cache(&self)`
Clear the cached location, forcing the next call to fetch fresh data.

## Configuration

The location tracker can be configured through the main application configuration:

```env
# Location update interval in minutes (default: 30)
LOCATION_UPDATE_INTERVAL_MINUTES=30
```

## Geolocation Service

The module uses [ipapi.co](https://ipapi.co/) for IP-based geolocation:

- **Endpoint**: `https://ipapi.co/json/`
- **Rate Limit**: 1,000 requests per day (free tier)
- **Timeout**: 10 seconds
- **Response Format**: JSON

### Example API Response

```json
{
  "ip": "8.8.8.8",
  "city": "Mountain View",
  "region": "California",
  "country_name": "United States",
  "latitude": 37.386,
  "longitude": -122.0838
}
```

## Caching Strategy

The location tracker implements a time-based caching strategy:

1. **First Request**: Fetches location from API and caches it
2. **Subsequent Requests**: Returns cached location if still valid
3. **Cache Expiration**: After cache duration expires, fetches fresh data
4. **API Failure**: Falls back to cached location even if expired
5. **No Cache**: Returns `None` if no cached data and API fails

### Cache Benefits

- **Reduced API Calls**: Minimizes requests to stay within rate limits
- **Improved Performance**: Cache hits are ~1000x faster than API calls
- **Offline Resilience**: Works with cached data when network is unavailable
- **Cost Savings**: Reduces API usage for paid tiers

## Error Handling

The module handles various error scenarios gracefully:

### Network Errors
- **Timeout**: 10-second timeout for API requests
- **Connection Failed**: Falls back to cached location
- **DNS Resolution**: Handled by reqwest client

### API Errors
- **Rate Limit Exceeded**: Returns cached location
- **Invalid Response**: Logs error and returns cached location
- **Service Unavailable**: Falls back to cached location

### Data Errors
- **Missing Fields**: Uses "Unknown" as default value
- **Invalid JSON**: Returns error with details
- **Empty Response**: Treated as API error

## Performance Characteristics

### API Call Performance
- **First Call**: ~100-500ms (network dependent)
- **Cached Call**: <1ms (memory access)
- **Speed Improvement**: ~1000x faster with cache

### Memory Usage
- **Per Instance**: ~200 bytes (Location struct + metadata)
- **HTTP Client**: Shared connection pool (minimal overhead)

### Concurrency
- **Thread-Safe**: Uses `RwLock` for safe concurrent access
- **Multiple Readers**: Allows concurrent cache reads
- **Single Writer**: Exclusive access for cache updates

## Integration Example

### In Monitoring Loop

```rust
use std::sync::Arc;
use tokio::time::{interval, Duration};

async fn monitoring_loop() {
    let location_tracker = Arc::new(LocationTracker::new());
    let mut location_timer = interval(Duration::from_secs(30 * 60)); // 30 minutes
    
    loop {
        tokio::select! {
            _ = location_timer.tick() => {
                // Update location periodically
                if let Ok(Some(location)) = location_tracker.get_location().await {
                    println!("Location: {}, {}, {}", 
                        location.city, location.state, location.country);
                }
            }
        }
    }
}
```

### In Payload Builder

```rust
use crate::modules::payload_builder::PayloadBuilder;

impl PayloadBuilder {
    pub async fn build_payload(&self) -> Result<Payload> {
        // ... other payload data ...
        
        let location = self.location_tracker.get_location().await?;
        
        Ok(Payload {
            // ... other fields ...
            location,
        })
    }
}
```

## Testing

### Unit Tests

Run unit tests:
```bash
cargo test --lib location_tracker
```

### Integration Tests

Run integration tests (requires network):
```bash
cargo test --test location_tracker_integration_test
```

### Example Demo

Run the location demo:
```bash
cargo run --example location_demo
```

## Troubleshooting

### Location Always Returns "Unknown"

**Possible Causes:**
1. Network connectivity issues
2. API rate limit exceeded
3. Firewall blocking API requests
4. Invalid API response

**Solutions:**
- Check network connectivity
- Verify API is accessible: `curl https://ipapi.co/json/`
- Check firewall rules
- Review logs for detailed error messages

### Cache Not Working

**Possible Causes:**
1. Cache duration too short
2. Multiple tracker instances
3. Cache cleared externally

**Solutions:**
- Increase cache duration
- Use a single shared tracker instance
- Check for explicit `clear_cache()` calls

### Slow Performance

**Possible Causes:**
1. Not using cache (cache disabled or expired)
2. Network latency
3. API service slow

**Solutions:**
- Verify cache is enabled and valid
- Increase cache duration
- Check network latency to API
- Consider using a different geolocation service

## Best Practices

1. **Reuse Tracker Instances**: Create one tracker and share it across the application
2. **Appropriate Cache Duration**: Balance freshness vs. API usage (30 minutes is recommended)
3. **Handle None Gracefully**: Always handle the case where location is unavailable
4. **Log Errors**: Log location errors for debugging but don't fail the application
5. **Periodic Updates**: Update location periodically in background tasks
6. **Respect Rate Limits**: Don't disable caching or use very short cache durations

## Future Enhancements

Potential improvements for future versions:

1. **Multiple Geolocation Services**: Support fallback to alternative services
2. **Manual Location Override**: Allow users to manually set location
3. **GPS Support**: Add GPS-based location for mobile clients
4. **Location History**: Track location changes over time
5. **Accuracy Metrics**: Include accuracy/confidence in location data
6. **Custom API Keys**: Support for paid API tiers with higher limits
7. **Offline Mode**: Pre-cache location for offline operation

## Related Modules

- **Config Module**: Provides location update interval configuration
- **Payload Builder**: Includes location data in monitoring payloads
- **Logger**: Logs location tracking events and errors

## References

- [ipapi.co Documentation](https://ipapi.co/api/)
- [Tokio Async Runtime](https://tokio.rs/)
- [reqwest HTTP Client](https://docs.rs/reqwest/)
- [parking_lot RwLock](https://docs.rs/parking_lot/)
