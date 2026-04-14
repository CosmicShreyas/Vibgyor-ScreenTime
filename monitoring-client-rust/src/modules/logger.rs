//! Logging infrastructure with single overwriting log file and UTF-8 support
//!
//! This module sets up structured logging using the tracing framework with:
//! - Single log file (log.txt) that overwrites on each run
//! - UTF-8 encoding for emoji and Unicode support
//! - Real-time flushing for immediate visibility
//! - Console and file output
//! - Minimal disk space usage
//!
//! Requirements: REQ-14.2, REQ-14.3, REQ-14.4

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tracing::Level;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

/// Custom file writer that overwrites a single log file
struct OverwritingFileWriter {
    log_path: PathBuf,
    current_file: Arc<Mutex<Option<File>>>,
}

impl OverwritingFileWriter {
    /// Create a new overwriting file writer
    /// The log file is truncated (overwritten) on each program start
    fn new(log_dir: PathBuf) -> io::Result<Self> {
        // Ensure log directory exists
        fs::create_dir_all(&log_dir)?;

        let log_path = log_dir.join("log.txt");

        // Open log file in truncate mode (overwrites existing content)
        let file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&log_path)?;

        let writer = Self {
            log_path,
            current_file: Arc::new(Mutex::new(Some(file))),
        };

        Ok(writer)
    }

    /// Write data to the log file
    fn write_data(&self, data: &[u8]) -> io::Result<()> {
        let mut file_guard = self.current_file.lock().unwrap();

        if let Some(file) = file_guard.as_mut() {
            file.write_all(data)?;
            file.flush()?; // Real-time flushing
        }

        Ok(())
    }
}

impl Write for OverwritingFileWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.write_data(buf)?;
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        let mut file_guard = self.current_file.lock().unwrap();
        if let Some(file) = file_guard.as_mut() {
            file.flush()?;
        }
        Ok(())
    }
}

// Make OverwritingFileWriter cloneable for use with tracing
impl Clone for OverwritingFileWriter {
    fn clone(&self) -> Self {
        Self {
            log_path: self.log_path.clone(),
            current_file: Arc::clone(&self.current_file),
        }
    }
}

/// Initialize the logging system with a single overwriting log file
///
/// # Arguments
/// * `log_dir` - Directory to store log file
/// * `log_level` - Logging level (DEBUG, INFO, WARN, ERROR, CRITICAL)
///
/// # Returns
/// Result indicating success or failure
///
/// # Requirements
/// - REQ-14.2: UTF-8 encoding for emoji and Unicode support
/// - REQ-14.3: Configurable log levels
/// - REQ-14.4: Real-time log flushing
///
/// # Note
/// The log file (log.txt) is overwritten on each program start to minimize disk space usage
/// Console output is DISABLED to prevent console window from appearing
pub fn init_logging(log_dir: PathBuf, log_level: &str) -> anyhow::Result<()> {
    // Create log directory if it doesn't exist
    fs::create_dir_all(&log_dir)?;

    // Parse log level
    let level = parse_log_level(log_level);

    // Create overwriting file writer
    let file_writer = OverwritingFileWriter::new(log_dir.clone())?;

    // Create file layer with UTF-8 support (ONLY file output, no console)
    let file_layer = fmt::layer()
        .with_writer(move || file_writer.clone())
        .with_ansi(false)
        .with_target(false)
        .with_thread_ids(false)
        .with_thread_names(false)
        .with_timer(fmt::time::ChronoLocal::rfc_3339());

    // Build the subscriber with ONLY file layer (no console layer)
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(level.as_str()));

    tracing_subscriber::registry()
        .with(env_filter)
        .with(file_layer)
        .init();

    // These logs will only go to file, not console
    tracing::info!("✅ Logging initialized at level: {}", log_level);
    tracing::info!("📁 Log file: {}", log_dir.join("log.txt").display());
    tracing::info!("🔄 Log mode: Single file (overwrites on restart)");
    tracing::info!("🖥️  Console output: DISABLED (file only)");

    Ok(())
}

/// Parse log level string to tracing Level
fn parse_log_level(log_level: &str) -> Level {
    match log_level.to_uppercase().as_str() {
        "DEBUG" => Level::DEBUG,
        "INFO" => Level::INFO,
        "WARN" | "WARNING" => Level::WARN,
        "ERROR" => Level::ERROR,
        "CRITICAL" => Level::ERROR, // Map CRITICAL to ERROR
        _ => {
            // Unknown log level, default to INFO
            // Note: Can't use tracing here as logger isn't initialized yet
            Level::INFO
        }
    }
}

/// Get the current log file path for testing
#[cfg(test)]
pub fn get_current_log_path(log_dir: &Path) -> PathBuf {
    log_dir.join("log.txt")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;
    use tempfile::tempdir;

    #[test]
    fn test_init_logging() {
        let temp_dir = tempdir().unwrap();
        let log_dir = temp_dir.path().to_path_buf();

        let result = init_logging(log_dir.clone(), "INFO");
        assert!(result.is_ok());

        // Verify log directory was created
        assert!(log_dir.exists());
    }

    #[test]
    fn test_log_directory_creation() {
        let temp_dir = tempdir().unwrap();
        let log_dir = temp_dir.path().join("nested").join("logs");

        let result = init_logging(log_dir.clone(), "DEBUG");
        assert!(result.is_ok());

        // Verify nested directory was created
        assert!(log_dir.exists());
    }

    #[test]
    fn test_log_file_creation() {
        let temp_dir = tempdir().unwrap();
        let log_dir = temp_dir.path().to_path_buf();

        init_logging(log_dir.clone(), "INFO").unwrap();

        // Write a log message
        tracing::info!("Test log message");

        // Give it a moment to flush
        thread::sleep(Duration::from_millis(100));

        // Verify log file was created
        let log_path = get_current_log_path(&log_dir);
        assert!(log_path.exists());
    }

    #[test]
    fn test_utf8_encoding() {
        let temp_dir = tempdir().unwrap();
        let log_dir = temp_dir.path().to_path_buf();

        init_logging(log_dir.clone(), "INFO").unwrap();

        // Write log messages with UTF-8 characters
        tracing::info!("✅ Success with emoji");
        tracing::info!("🚀 Rocket emoji");
        tracing::info!("日本語 Japanese text");
        tracing::info!("Ñoño Spanish characters");

        thread::sleep(Duration::from_millis(100));

        // Read log file and verify UTF-8 content
        let log_path = get_current_log_path(&log_dir);
        let content = fs::read_to_string(&log_path).unwrap();

        assert!(content.contains("✅ Success with emoji"));
        assert!(content.contains("🚀 Rocket emoji"));
        assert!(content.contains("日本語 Japanese text"));
        assert!(content.contains("Ñoño Spanish characters"));
    }

    #[test]
    fn test_log_levels() {
        let temp_dir = tempdir().unwrap();
        let log_dir = temp_dir.path().to_path_buf();

        // Test each log level
        for level in &["DEBUG", "INFO", "WARN", "ERROR", "CRITICAL"] {
            let result = init_logging(log_dir.clone(), level);
            assert!(result.is_ok(), "Failed to initialize with level: {}", level);
        }
    }

    #[test]
    fn test_invalid_log_level() {
        let temp_dir = tempdir().unwrap();
        let log_dir = temp_dir.path().to_path_buf();

        // Should default to INFO
        let result = init_logging(log_dir.clone(), "INVALID");
        assert!(result.is_ok());
    }

    #[test]
    fn test_overwriting_file_writer() {
        let temp_dir = tempdir().unwrap();
        let log_dir = temp_dir.path().to_path_buf();

        let mut writer = OverwritingFileWriter::new(log_dir.clone()).unwrap();

        // Write some data
        let test_data = b"Test log entry\n";
        let result = writer.write(test_data);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), test_data.len());

        // Flush
        assert!(writer.flush().is_ok());

        // Verify file exists
        let log_path = get_current_log_path(&log_dir);
        assert!(log_path.exists());
    }

    #[test]
    fn test_file_overwrite_on_restart() {
        let temp_dir = tempdir().unwrap();
        let log_dir = temp_dir.path().to_path_buf();

        // First run - write some data
        {
            let mut writer = OverwritingFileWriter::new(log_dir.clone()).unwrap();
            writer.write(b"First run data\n").unwrap();
            writer.flush().unwrap();
        }

        // Verify first run data
        let log_path = get_current_log_path(&log_dir);
        let content1 = fs::read_to_string(&log_path).unwrap();
        assert!(content1.contains("First run data"));

        // Second run - should overwrite
        {
            let mut writer = OverwritingFileWriter::new(log_dir.clone()).unwrap();
            writer.write(b"Second run data\n").unwrap();
            writer.flush().unwrap();
        }

        // Verify second run data (first run data should be gone)
        let content2 = fs::read_to_string(&log_path).unwrap();
        assert!(content2.contains("Second run data"));
        assert!(!content2.contains("First run data"));
    }

    #[test]
    fn test_concurrent_writes() {
        let temp_dir = tempdir().unwrap();
        let log_dir = temp_dir.path().to_path_buf();

        init_logging(log_dir.clone(), "INFO").unwrap();

        // Spawn multiple threads writing logs
        let handles: Vec<_> = (0..10)
            .map(|i| {
                thread::spawn(move || {
                    for j in 0..100 {
                        tracing::info!("Thread {} - Message {}", i, j);
                    }
                })
            })
            .collect();

        // Wait for all threads
        for handle in handles {
            handle.join().unwrap();
        }

        thread::sleep(Duration::from_millis(200));

        // Verify log file exists and has content
        let log_path = get_current_log_path(&log_dir);
        assert!(log_path.exists());

        let content = fs::read_to_string(&log_path).unwrap();
        assert!(!content.is_empty());
    }

    #[test]
    fn test_real_time_flushing() {
        let temp_dir = tempdir().unwrap();
        let log_dir = temp_dir.path().to_path_buf();

        init_logging(log_dir.clone(), "INFO").unwrap();

        // Write a log message
        tracing::info!("Immediate flush test");

        // Should be immediately visible (no sleep needed)
        let log_path = get_current_log_path(&log_dir);
        let content = fs::read_to_string(&log_path).unwrap();

        assert!(content.contains("Immediate flush test"));
    }
}
