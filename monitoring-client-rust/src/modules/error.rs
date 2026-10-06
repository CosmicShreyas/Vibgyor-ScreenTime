//! Error types for the monitoring client

use thiserror::Error;

/// Main error type for the monitoring client
#[derive(Debug, Error)]
pub enum MonitoringError {
    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Platform error: {0}")]
    Platform(String),

    #[error("Screenshot capture error: {0}")]
    Screenshot(String),

    #[error("Activity tracking error: {0}")]
    ActivityTracking(String),

    #[error("Application monitoring error: {0}")]
    AppMonitoring(String),

    #[error("Browser monitoring error: {0}")]
    BrowserMonitoring(String),

    #[error("Location tracking error: {0}")]
    LocationTracking(String),

    #[error("Queue operation error: {0}")]
    Queue(String),

    #[error("Transmission error: {0}")]
    Transmission(String),

    #[error("Authentication error")]
    Authentication,

    #[error("Timeout error")]
    Timeout,

    #[error("Unknown error: {0}")]
    Unknown(String),
}

/// Result type alias for monitoring operations
pub type Result<T> = std::result::Result<T, MonitoringError>;

impl MonitoringError {
    /// Check if the error is transient and should be retried
    pub fn is_transient(&self) -> bool {
        matches!(
            self,
            MonitoringError::Network(_) | MonitoringError::Timeout | MonitoringError::Io(_)
        )
    }

    /// Check if the error is fatal and should stop the application
    pub fn is_fatal(&self) -> bool {
        matches!(
            self,
            MonitoringError::Config(_) | MonitoringError::Authentication
        )
    }
}
