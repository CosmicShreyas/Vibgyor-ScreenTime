//! Queue Manager Module
//!
//! This module manages a local SQLite queue for storing failed data transmission payloads.
//! When the server is unreachable, payloads are queued locally and can be retrieved for retry.
//!
//! # Features
//!
//! - SQLite-based persistent queue
//! - FIFO (First-In-First-Out) ordering
//! - Retry count tracking per payload
//! - Maximum queue size enforcement (1000 payloads)
//! - Thread-safe operations with parking_lot RwLock
//! - Automatic removal of oldest payloads when queue is full
//!
//! # Requirements
//!
//! - REQ-8.1: Persist failed payloads to SQLite database
//! - REQ-8.2: FIFO queue processing
//! - REQ-8.3: Maximum queue size limit (1000 payloads)
//! - REQ-8.4: Track retry count per payload
//! - REQ-8.5: Remove payloads exceeding max retry attempts
//!
//! # Example
//!
//! ```no_run
//! use monitoring_client::modules::queue_manager::QueueManager;
//! use serde_json::json;
//!
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! // Create queue manager with default database path
//! let queue_manager = QueueManager::new(None)?;
//!
//! // Add a payload to the queue
//! let payload = json!({
//!     "client_id": "test-client",
//!     "timestamp": "2024-01-01T00:00:00Z",
//!     "data": "test data"
//! });
//! queue_manager.add(payload)?;
//!
//! // Retrieve payloads in FIFO order
//! let payloads = queue_manager.retrieve(10)?;
//! for (id, payload) in payloads {
//!     println!("Processing payload {}: {:?}", id, payload);
//!     
//!     // After successful transmission, delete the payload
//!     queue_manager.delete(id)?;
//! }
//!
//! // Check queue size
//! let size = queue_manager.size()?;
//! println!("Queue size: {}", size);
//! # Ok(())
//! # }
//! ```

use crate::modules::error::{MonitoringError, Result};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde_json::Value as JsonValue;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tracing::{debug, error, info, warn};

/// Maximum number of payloads allowed in the queue
pub const MAX_QUEUE_SIZE: usize = 1000;

/// Default database filename
const DEFAULT_DB_FILENAME: &str = "queue.db";

/// Manages a SQLite-based queue for failed transmission payloads
///
/// The queue manager provides thread-safe operations for adding, retrieving,
/// and deleting payloads. It automatically enforces a maximum queue size by
/// removing the oldest payloads when the limit is reached.
pub struct QueueManager {
    db_path: PathBuf,
    connection: Arc<Mutex<Connection>>,
    max_queue_size: usize,
}

/// Represents a queued payload with metadata
#[derive(Debug, Clone)]
pub struct QueuedPayload {
    pub id: i64,
    pub payload_json: String,
    pub timestamp: DateTime<Utc>,
    pub retry_count: u32,
    pub created_at: DateTime<Utc>,
}

impl QueueManager {
    /// Creates a new queue manager with the specified database path
    ///
    /// If `db_path` is None, uses the default path in the user's home directory:
    /// - Windows: `%USERPROFILE%\.vibgyorseek\queue.db`
    /// - Linux/macOS: `~/.vibgyorseek/queue.db`
    ///
    /// # Arguments
    ///
    /// * `db_path` - Optional custom database path
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - The database directory cannot be created
    /// - The database cannot be initialized
    /// - The database schema cannot be created
    ///
    /// # Example
    ///
    /// ```no_run
    /// use monitoring_client::modules::queue_manager::QueueManager;
    ///
    /// // Use default path
    /// let queue_manager = QueueManager::new(None)?;
    ///
    /// // Use custom path
    /// let queue_manager = QueueManager::new(Some("./custom_queue.db"))?;
    /// # Ok::<(), Box<dyn std::error::Error>>(())
    /// ```
    pub fn new(db_path: Option<impl AsRef<Path>>) -> Result<Self> {
        let db_path = if let Some(path) = db_path {
            PathBuf::from(path.as_ref())
        } else {
            Self::default_db_path()?
        };

        // Ensure the directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                MonitoringError::Queue(format!("Failed to create database directory: {}", e))
            })?;
        }

        // Open database connection
        let connection = Connection::open(&db_path).map_err(|e| {
            MonitoringError::Queue(format!("Failed to open database: {}", e))
        })?;

        let queue_manager = Self {
            db_path: db_path.clone(),
            connection: Arc::new(Mutex::new(connection)),
            max_queue_size: MAX_QUEUE_SIZE,
        };

        // Initialize database schema
        queue_manager.init_database()?;

        info!("Queue manager initialized with database: {:?}", db_path);
        Ok(queue_manager)
    }

    /// Returns the default database path based on the platform
    fn default_db_path() -> Result<PathBuf> {
        let home_dir = dirs::home_dir().ok_or_else(|| {
            MonitoringError::Queue("Failed to determine home directory".to_string())
        })?;

        let db_dir = home_dir.join(".vibgyorseek");
        Ok(db_dir.join(DEFAULT_DB_FILENAME))
    }

    /// Initializes the database schema
    ///
    /// Creates the `payload_queue` table and indexes if they don't exist.
    fn init_database(&self) -> Result<()> {
        let conn = self.connection.lock().unwrap();

        // Create the queue table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS payload_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                payload_json TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                retry_count INTEGER DEFAULT 0,
                created_at TEXT NOT NULL
            )",
            [],
        )
        .map_err(|e| {
            MonitoringError::Queue(format!("Failed to create payload_queue table: {}", e))
        })?;

        // Create index on timestamp for efficient FIFO retrieval
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_timestamp ON payload_queue(timestamp)",
            [],
        )
        .map_err(|e| {
            MonitoringError::Queue(format!("Failed to create timestamp index: {}", e))
        })?;

        debug!("Database schema initialized successfully");
        Ok(())
    }

    /// Adds a payload to the queue
    ///
    /// If the queue is full (reaches `MAX_QUEUE_SIZE`), the oldest payload
    /// is automatically removed to make room for the new one.
    ///
    /// # Arguments
    ///
    /// * `payload` - The JSON payload to queue
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - The payload is empty or invalid
    /// - The payload cannot be serialized to JSON
    /// - The database operation fails
    ///
    /// # Example
    ///
    /// ```no_run
    /// use monitoring_client::modules::queue_manager::QueueManager;
    /// use serde_json::json;
    ///
    /// # fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let queue_manager = QueueManager::new(None)?;
    /// let payload = json!({
    ///     "client_id": "test-client",
    ///     "timestamp": "2024-01-01T00:00:00Z"
    /// });
    /// queue_manager.add(payload)?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn add(&self, payload: JsonValue) -> Result<()> {
        if payload.is_null() {
            return Err(MonitoringError::Queue(
                "Cannot add empty payload to queue".to_string(),
            ));
        }

        // Check queue size before adding
        let current_size = self.size()?;
        if current_size >= self.max_queue_size {
            warn!(
                "Queue is full ({} items). Removing oldest payload to make room.",
                current_size
            );
            self.remove_oldest()?;
        }

        // Serialize payload to JSON
        let payload_json = serde_json::to_string(&payload).map_err(|e| {
            MonitoringError::Queue(format!("Failed to serialize payload: {}", e))
        })?;

        // Get timestamp from payload or use current time
        let timestamp = if let Some(ts) = payload.get("timestamp").and_then(|v| v.as_str()) {
            ts.to_string()
        } else {
            Utc::now().to_rfc3339()
        };

        let created_at = Utc::now().to_rfc3339();

        // Insert into database
        let conn = self.connection.lock().unwrap();
        conn.execute(
            "INSERT INTO payload_queue (payload_json, timestamp, created_at) VALUES (?1, ?2, ?3)",
            params![payload_json, timestamp, created_at],
        )
        .map_err(|e| {
            MonitoringError::Queue(format!("Failed to insert payload into queue: {}", e))
        })?;

        info!("Payload added to queue (timestamp: {})", timestamp);
        Ok(())
    }

    /// Retrieves payloads from the queue in FIFO order
    ///
    /// Returns up to `limit` payloads, ordered by timestamp (oldest first).
    /// If multiple payloads have the same timestamp, they are ordered by ID.
    ///
    /// # Arguments
    ///
    /// * `limit` - Maximum number of payloads to retrieve
    ///
    /// # Returns
    ///
    /// A vector of tuples containing (payload_id, payload_json)
    ///
    /// # Errors
    ///
    /// Returns an error if the database operation fails.
    /// Corrupted payloads are skipped and logged as errors.
    ///
    /// # Example
    ///
    /// ```no_run
    /// use monitoring_client::modules::queue_manager::QueueManager;
    ///
    /// # fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let queue_manager = QueueManager::new(None)?;
    /// let payloads = queue_manager.retrieve(10)?;
    /// for (id, payload) in payloads {
    ///     println!("Payload {}: {:?}", id, payload);
    /// }
    /// # Ok(())
    /// # }
    /// ```
    pub fn retrieve(&self, limit: usize) -> Result<Vec<(i64, JsonValue)>> {
        let conn = self.connection.lock().unwrap();

        let mut stmt = conn
            .prepare(
                "SELECT id, payload_json FROM payload_queue 
                 ORDER BY timestamp ASC, id ASC 
                 LIMIT ?1",
            )
            .map_err(|e| {
                MonitoringError::Queue(format!("Failed to prepare retrieve statement: {}", e))
            })?;

        let rows = stmt
            .query_map(params![limit], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| {
                MonitoringError::Queue(format!("Failed to retrieve payloads: {}", e))
            })?;

        let mut results = Vec::new();
        for row in rows {
            match row {
                Ok((id, payload_json)) => {
                    match serde_json::from_str::<JsonValue>(&payload_json) {
                        Ok(payload) => results.push((id, payload)),
                        Err(e) => {
                            error!(
                                "Failed to parse payload {}: {}. Skipping corrupted entry.",
                                id, e
                            );
                        }
                    }
                }
                Err(e) => {
                    error!("Failed to read row from database: {}", e);
                }
            }
        }

        if !results.is_empty() {
            debug!("Retrieved {} payload(s) from queue", results.len());
        }

        Ok(results)
    }

    /// Deletes a payload from the queue by ID
    ///
    /// # Arguments
    ///
    /// * `payload_id` - The ID of the payload to delete
    ///
    /// # Returns
    ///
    /// `true` if the payload was deleted, `false` if it wasn't found
    ///
    /// # Errors
    ///
    /// Returns an error if the database operation fails
    ///
    /// # Example
    ///
    /// ```no_run
    /// use monitoring_client::modules::queue_manager::QueueManager;
    ///
    /// # fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let queue_manager = QueueManager::new(None)?;
    /// let payloads = queue_manager.retrieve(1)?;
    /// if let Some((id, _)) = payloads.first() {
    ///     queue_manager.delete(*id)?;
    /// }
    /// # Ok(())
    /// # }
    /// ```
    pub fn delete(&self, payload_id: i64) -> Result<bool> {
        let conn = self.connection.lock().unwrap();

        let rows_affected = conn
            .execute("DELETE FROM payload_queue WHERE id = ?1", params![payload_id])
            .map_err(|e| {
                MonitoringError::Queue(format!("Failed to delete payload {}: {}", payload_id, e))
            })?;

        if rows_affected > 0 {
            debug!("Deleted payload {} from queue", payload_id);
            Ok(true)
        } else {
            warn!("Payload {} not found in queue", payload_id);
            Ok(false)
        }
    }

    /// Returns the current number of payloads in the queue
    ///
    /// # Errors
    ///
    /// Returns an error if the database operation fails
    ///
    /// # Example
    ///
    /// ```no_run
    /// use monitoring_client::modules::queue_manager::QueueManager;
    ///
    /// # fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let queue_manager = QueueManager::new(None)?;
    /// let size = queue_manager.size()?;
    /// println!("Queue has {} payloads", size);
    /// # Ok(())
    /// # }
    /// ```
    pub fn size(&self) -> Result<usize> {
        let conn = self.connection.lock().unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM payload_queue", [], |row| {
                row.get(0)
            })
            .map_err(|e| MonitoringError::Queue(format!("Failed to get queue size: {}", e)))?;

        Ok(count as usize)
    }

    /// Clears all payloads from the queue
    ///
    /// # Returns
    ///
    /// The number of payloads that were deleted
    ///
    /// # Errors
    ///
    /// Returns an error if the database operation fails
    ///
    /// # Example
    ///
    /// ```no_run
    /// use monitoring_client::modules::queue_manager::QueueManager;
    ///
    /// # fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let queue_manager = QueueManager::new(None)?;
    /// let deleted = queue_manager.clear()?;
    /// println!("Cleared {} payloads from queue", deleted);
    /// # Ok(())
    /// # }
    /// ```
    pub fn clear(&self) -> Result<usize> {
        let conn = self.connection.lock().unwrap();

        let rows_affected = conn
            .execute("DELETE FROM payload_queue", [])
            .map_err(|e| MonitoringError::Queue(format!("Failed to clear queue: {}", e)))?;

        info!("Cleared {} payload(s) from queue", rows_affected);
        Ok(rows_affected)
    }

    /// Removes the oldest payload from the queue
    ///
    /// This is called automatically when the queue reaches its maximum size.
    ///
    /// # Returns
    ///
    /// `true` if a payload was removed, `false` if the queue was empty
    ///
    /// # Errors
    ///
    /// Returns an error if the database operation fails
    fn remove_oldest(&self) -> Result<bool> {
        let conn = self.connection.lock().unwrap();

        let rows_affected = conn
            .execute(
                "DELETE FROM payload_queue WHERE id = (
                    SELECT id FROM payload_queue 
                    ORDER BY timestamp ASC, id ASC 
                    LIMIT 1
                )",
                [],
            )
            .map_err(|e| {
                MonitoringError::Queue(format!("Failed to remove oldest payload: {}", e))
            })?;

        if rows_affected > 0 {
            warn!("Removed oldest payload from full queue");
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Increments the retry count for a payload
    ///
    /// # Arguments
    ///
    /// * `payload_id` - The ID of the payload
    ///
    /// # Returns
    ///
    /// `true` if the retry count was incremented, `false` if the payload wasn't found
    ///
    /// # Errors
    ///
    /// Returns an error if the database operation fails
    ///
    /// # Example
    ///
    /// ```no_run
    /// use monitoring_client::modules::queue_manager::QueueManager;
    ///
    /// # fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let queue_manager = QueueManager::new(None)?;
    /// let payloads = queue_manager.retrieve(1)?;
    /// if let Some((id, _)) = payloads.first() {
    ///     queue_manager.increment_retry_count(*id)?;
    /// }
    /// # Ok(())
    /// # }
    /// ```
    pub fn increment_retry_count(&self, payload_id: i64) -> Result<bool> {
        let conn = self.connection.lock().unwrap();

        let rows_affected = conn
            .execute(
                "UPDATE payload_queue SET retry_count = retry_count + 1 WHERE id = ?1",
                params![payload_id],
            )
            .map_err(|e| {
                MonitoringError::Queue(format!(
                    "Failed to increment retry count for payload {}: {}",
                    payload_id, e
                ))
            })?;

        if rows_affected > 0 {
            debug!("Incremented retry count for payload {}", payload_id);
            Ok(true)
        } else {
            warn!(
                "Payload {} not found for retry count update",
                payload_id
            );
            Ok(false)
        }
    }

    /// Gets the retry count for a payload
    ///
    /// # Arguments
    ///
    /// * `payload_id` - The ID of the payload
    ///
    /// # Returns
    ///
    /// The retry count, or `None` if the payload wasn't found
    ///
    /// # Errors
    ///
    /// Returns an error if the database operation fails
    ///
    /// # Example
    ///
    /// ```no_run
    /// use monitoring_client::modules::queue_manager::QueueManager;
    ///
    /// # fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let queue_manager = QueueManager::new(None)?;
    /// let payloads = queue_manager.retrieve(1)?;
    /// if let Some((id, _)) = payloads.first() {
    ///     if let Some(count) = queue_manager.get_retry_count(*id)? {
    ///         println!("Payload {} has been retried {} times", id, count);
    ///     }
    /// }
    /// # Ok(())
    /// # }
    /// ```
    pub fn get_retry_count(&self, payload_id: i64) -> Result<Option<u32>> {
        let conn = self.connection.lock().unwrap();

        let result = conn.query_row(
            "SELECT retry_count FROM payload_queue WHERE id = ?1",
            params![payload_id],
            |row| row.get::<_, u32>(0),
        );

        match result {
            Ok(count) => Ok(Some(count)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(MonitoringError::Queue(format!(
                "Failed to get retry count for payload {}: {}",
                payload_id, e
            ))),
        }
    }

    /// Gets the database path
    pub fn db_path(&self) -> &Path {
        &self.db_path
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    fn create_test_queue_manager() -> (QueueManager, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test_queue.db");
        let queue_manager = QueueManager::new(Some(&db_path)).unwrap();
        (queue_manager, temp_dir)
    }

    #[test]
    fn test_new_queue_manager() {
        let (queue_manager, _temp_dir) = create_test_queue_manager();
        assert_eq!(queue_manager.size().unwrap(), 0);
    }

    #[test]
    fn test_add_and_retrieve() {
        let (queue_manager, _temp_dir) = create_test_queue_manager();

        let payload = json!({
            "client_id": "test-client",
            "timestamp": "2024-01-01T00:00:00Z",
            "data": "test data"
        });

        queue_manager.add(payload.clone()).unwrap();
        assert_eq!(queue_manager.size().unwrap(), 1);

        let payloads = queue_manager.retrieve(10).unwrap();
        assert_eq!(payloads.len(), 1);
        assert_eq!(payloads[0].1, payload);
    }

    #[test]
    fn test_fifo_ordering() {
        let (queue_manager, _temp_dir) = create_test_queue_manager();

        // Add payloads with different timestamps
        for i in 1..=5 {
            let payload = json!({
                "client_id": "test-client",
                "timestamp": format!("2024-01-0{}T00:00:00Z", i),
                "data": format!("test data {}", i)
            });
            queue_manager.add(payload).unwrap();
        }

        // Retrieve all payloads
        let payloads = queue_manager.retrieve(10).unwrap();
        assert_eq!(payloads.len(), 5);

        // Verify FIFO order
        for (i, (_, payload)) in payloads.iter().enumerate() {
            let expected_timestamp = format!("2024-01-0{}T00:00:00Z", i + 1);
            assert_eq!(
                payload.get("timestamp").unwrap().as_str().unwrap(),
                expected_timestamp
            );
        }
    }

    #[test]
    fn test_delete() {
        let (queue_manager, _temp_dir) = create_test_queue_manager();

        let payload = json!({"data": "test"});
        queue_manager.add(payload).unwrap();

        let payloads = queue_manager.retrieve(1).unwrap();
        let (id, _) = payloads[0].clone();

        assert!(queue_manager.delete(id).unwrap());
        assert_eq!(queue_manager.size().unwrap(), 0);
    }

    #[test]
    fn test_clear() {
        let (queue_manager, _temp_dir) = create_test_queue_manager();

        for i in 1..=5 {
            let payload = json!({"data": format!("test {}", i)});
            queue_manager.add(payload).unwrap();
        }

        assert_eq!(queue_manager.size().unwrap(), 5);
        let deleted = queue_manager.clear().unwrap();
        assert_eq!(deleted, 5);
        assert_eq!(queue_manager.size().unwrap(), 0);
    }

    #[test]
    fn test_max_queue_size() {
        let (queue_manager, _temp_dir) = create_test_queue_manager();

        // Add more than MAX_QUEUE_SIZE payloads
        for i in 1..=1005 {
            let payload = json!({
                "timestamp": format!("2024-01-01T{:02}:00:00Z", i % 24),
                "data": format!("test {}", i)
            });
            queue_manager.add(payload).unwrap();
        }

        // Queue should be capped at MAX_QUEUE_SIZE
        let size = queue_manager.size().unwrap();
        assert_eq!(size, MAX_QUEUE_SIZE);
    }

    #[test]
    fn test_retry_count() {
        let (queue_manager, _temp_dir) = create_test_queue_manager();

        let payload = json!({"data": "test"});
        queue_manager.add(payload).unwrap();

        let payloads = queue_manager.retrieve(1).unwrap();
        let (id, _) = payloads[0].clone();

        // Initial retry count should be 0
        assert_eq!(queue_manager.get_retry_count(id).unwrap(), Some(0));

        // Increment retry count
        queue_manager.increment_retry_count(id).unwrap();
        assert_eq!(queue_manager.get_retry_count(id).unwrap(), Some(1));

        // Increment again
        queue_manager.increment_retry_count(id).unwrap();
        assert_eq!(queue_manager.get_retry_count(id).unwrap(), Some(2));
    }

    #[test]
    fn test_persistence() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test_queue.db");

        // Create queue manager and add payload
        {
            let queue_manager = QueueManager::new(Some(&db_path)).unwrap();
            let payload = json!({"data": "persistent test"});
            queue_manager.add(payload).unwrap();
        }

        // Create new queue manager with same database
        {
            let queue_manager = QueueManager::new(Some(&db_path)).unwrap();
            assert_eq!(queue_manager.size().unwrap(), 1);

            let payloads = queue_manager.retrieve(1).unwrap();
            assert_eq!(payloads[0].1.get("data").unwrap(), "persistent test");
        }
    }
}
