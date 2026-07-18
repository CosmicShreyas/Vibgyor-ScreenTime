# Logging System Guide

## Overview

The monitoring client uses a simple, space-efficient logging system built on the `tracing` framework with a single overwriting log file.

## Features

### ✅ Single Overwriting File
- One log file: `log.txt`
- Overwrites on each program start
- Minimal disk space usage
- No rotation or backup files

### ✅ UTF-8 Support
- Full Unicode support
- Emojis: ✅❌🚀📁🔄⚠️
- International characters: 日本語, Español, Русский, العربية

### ✅ Real-Time Flushing
- Immediate write-through
- No buffering delays
- Instant visibility in log files

### ✅ Thread-Safe
- Concurrent access from multiple threads
- Lock-based synchronization
- No data corruption

## Usage

### Basic Initialization

```rust
use monitoring_client::modules::logger;
use std::path::PathBuf;

// Initialize logging
let log_dir = PathBuf::from("logs");
logger::init_logging(log_dir, "INFO")?;
```

### Log Levels

```rust
// DEBUG - Detailed debugging information
tracing::debug!("Debug message");

// INFO - General informational messages
tracing::info!("Info message");

// WARN - Warning messages
tracing::warn!("Warning message");

// ERROR - Error messages
tracing::error!("Error message");
```

### Supported Log Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| DEBUG | Detailed debugging info | Development, troubleshooting |
| INFO | General information | Normal operation |
| WARN | Warning messages | Potential issues |
| ERROR | Error messages | Failures, exceptions |
| CRITICAL | Critical errors | Mapped to ERROR level |

### Using Emojis

```rust
tracing::info!("✅ Operation successful");
tracing::error!("❌ Operation failed");
tracing::warn!("⚠️  Warning condition");
tracing::info!("🚀 Starting process");
tracing::info!("📁 File operation");
```

### Structured Logging

```rust
// With fields
tracing::info!(
    user_id = %user_id,
    action = "login",
    "User logged in successfully"
);

// With multiple fields
tracing::error!(
    error = %err,
    file = %path,
    "Failed to read file"
);
```

## Log File Structure

### Directory Layout

```
logs/
└── log.txt       # Single log file (overwrites on restart)
```

### Log Entry Format

```
2026-04-09T15:30:45.123456Z  INFO monitoring_client: Message text
│                            │    │                   │
│                            │    │                   └─ Log message
│                            │    └───────────────────── Logger name
│                            └────────────────────────── Log level
└─────────────────────────────────────────────────────── Timestamp (RFC 3339)
```

## Disk Space Management

The single-file approach ensures:
- Predictable disk usage
- No accumulation of old logs
- Fresh start on each run
- Minimal maintenance required

If you need to preserve logs between runs, copy the file before restarting:
```bash
# Windows
copy logs\log.txt logs\log-backup-%date%.txt

# Linux/Mac
cp logs/log.txt logs/log-backup-$(date +%Y%m%d-%H%M%S).txt
```

## Configuration

### Environment Variables

```bash
# Set log level via environment
export RUST_LOG=debug

# Or in .env file
RUST_LOG=debug
```

### Programmatic Configuration

```rust
// Initialize with specific level
logger::init_logging(log_dir, "DEBUG")?;

// Or use environment variable
logger::init_logging(log_dir, "INFO")?;
```

## Best Practices

### 1. Use Appropriate Log Levels

```rust
// ✅ Good
tracing::debug!("Detailed state: {:?}", state);
tracing::info!("User logged in: {}", username);
tracing::warn!("Retry attempt {}/3", attempt);
tracing::error!("Failed to connect: {}", err);

// ❌ Bad
tracing::info!("Detailed state: {:?}", state);  // Too verbose for INFO
tracing::error!("User logged in");  // Not an error
```

### 2. Include Context

```rust
// ✅ Good - Includes context
tracing::error!(
    file = %path,
    error = %err,
    "Failed to read configuration file"
);

// ❌ Bad - No context
tracing::error!("Failed to read file");
```

### 3. Use Structured Fields

```rust
// ✅ Good - Structured
tracing::info!(
    user_id = %user_id,
    duration_ms = duration.as_millis(),
    "Request completed"
);

// ❌ Bad - Unstructured
tracing::info!("Request completed for user {} in {}ms", user_id, duration.as_millis());
```

### 4. Avoid Sensitive Data

```rust
// ✅ Good - Sanitized
tracing::info!(user_id = %user_id, "User authenticated");

// ❌ Bad - Contains password
tracing::info!("Login: {} / {}", username, password);
```

## Troubleshooting

### Log Files Not Created

**Problem**: Log directory doesn't exist

**Solution**:
```rust
// Ensure directory is created
std::fs::create_dir_all("logs")?;
logger::init_logging(PathBuf::from("logs"), "INFO")?;
```

### Emojis Not Displaying

**Problem**: Console encoding issues

**Solution**: The file logs will always have correct UTF-8. Console display depends on terminal settings.

### Permission Denied

**Problem**: No write access to log directory

**Solution**:
```bash
# Check permissions
ls -la logs/

# Fix permissions (Linux/macOS)
chmod 755 logs/

# Run as administrator (Windows)
```

## Performance Considerations

### Memory Usage
- ~1KB per log file handle
- Minimal overhead
- No unbounded buffers

### CPU Usage
- ~1-2% during active logging
- Efficient lock-free reads
- Quick write operations

### I/O Performance
- Real-time writes (immediate flush)
- OS-level buffering
- No rotation overhead

## Testing

### Run Unit Tests

```bash
cargo test logger
```

### Run Integration Tests

```bash
cargo test --test logger_integration_test
```

### Manual Testing

```bash
# Run the demo
cargo run --example logging_demo

# Run the main application
cargo run
```

## Examples

### Example 1: Basic Logging

```rust
use monitoring_client::modules::logger;
use std::path::PathBuf;

fn main() -> anyhow::Result<()> {
    // Initialize
    logger::init_logging(PathBuf::from("logs"), "INFO")?;
    
    // Log messages
    tracing::info!("Application started");
    tracing::info!("Processing data...");
    tracing::info!("Application finished");
    
    Ok(())
}

// Logs appear in both console and file:
// - Console: Real-time output
// - File: logs/log.txt
```

### Example 2: Error Handling

```rust
fn process_file(path: &Path) -> Result<(), Error> {
    tracing::info!("Processing file: {}", path.display());
    
    match std::fs::read_to_string(path) {
        Ok(content) => {
            tracing::debug!("File content length: {}", content.len());
            Ok(())
        }
        Err(err) => {
            tracing::error!(
                file = %path.display(),
                error = %err,
                "Failed to read file"
            );
            Err(err.into())
        }
    }
}
```

### Example 3: Concurrent Logging

```rust
use std::thread;

fn main() -> anyhow::Result<()> {
    logger::init_logging(PathBuf::from("logs"), "INFO")?;
    
    let handles: Vec<_> = (0..10)
        .map(|i| {
            thread::spawn(move || {
                for j in 0..100 {
                    tracing::info!("Thread {} - Message {}", i, j);
                }
            })
        })
        .collect();
    
    for handle in handles {
        handle.join().unwrap();
    }
    
    Ok(())
}
```

## Reference

### Functions

```rust
pub fn init_logging(log_dir: PathBuf, log_level: &str) -> anyhow::Result<()>
```

### Macros

```rust
tracing::debug!(...)   // Debug level
tracing::info!(...)    // Info level
tracing::warn!(...)    // Warning level
tracing::error!(...)   // Error level
```

## See Also

- [Tracing Documentation](https://docs.rs/tracing/)
- [examples/logging_demo.rs](../examples/logging_demo.rs) - Demo application
