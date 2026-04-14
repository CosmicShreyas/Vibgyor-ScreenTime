//! HTTP Transmission Module
//!
//! This module handles sending data payloads to the monitoring server via HTTPS POST requests.
//! Includes authentication token handling, timeout management, and response processing.
//!
//! # Features
//!
//! - HTTPS POST requests with TLS certificate validation
//! - Bearer token authentication
//! - Configurable request timeout (default: 30 seconds)
//! - Comprehensive HTTP response code handling
//! - Thread-safe reqwest client with connection pooling
//! - Detailed error types for different failure scenarios
//!
//! # Requirements
//!
//! - REQ-9.1: Send payloads via HTTPS POST requests
//! - REQ-9.2: Include authentication token in headers
//! - REQ-9.3: Handle HTTP response codes appropriately
//! - REQ-9.4: Configurable request timeout (default: 30 seconds)
//! - REQ-18.1: Use HTTPS for all server communication
//!
//! # Example
//!
//! ```no_run
//! use monitoring_client::modules::http_transmitter::HttpTransmitter;
//! use serde_json::json;
//!
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! // Create HTTP transmitter
//! let transmitter = HttpTransmitter::new(
//!     "https://api.example.com/monitoring/data",
//!     "your-auth-token-here",
//!     None, // Use default 30s timeout
//! )?;
//!
//! // Send a payload
//! let payload = json!({
//!     "client_id": "test-client",
//!     "timestamp": "2024-01-01T00:00:00Z",
//!     "data": "test data"
//! });
//!
//! match transmitter.send_payload(&payload).await {
//!     Ok(_) => println!("Payload sent successfully"),
//!     Err(e) => eprintln!("Failed to send payload: {}", e),
//! }
//! # Ok(())
//! # }
//! ```

use crate::modules::error::{MonitoringError, Result};
use reqwest::{Client, StatusCode};
use serde_json::Value as JsonValue;
use std::time::Duration;
use tracing::{debug, error, info, warn};

/// Default request timeout in seconds
pub const DEFAULT_TIMEOUT_SECONDS: u64 = 30;

/// HTTP Transmitter for sending monitoring data to the server
///
/// The transmitter uses a persistent HTTP client with connection pooling
/// for efficient communication with the server. It handles authentication,
/// timeouts, and various error scenarios.
#[derive(Debug)]
pub struct HttpTransmitter {
    /// Server endpoint URL
    server_url: String,
    
    /// Authentication token for Bearer authentication
    auth_token: String,
    
    /// HTTP client with TLS support
    client: Client,
    
    /// Request timeout duration
    timeout: Duration,
}

impl HttpTransmitter {
    /// Creates a new HTTP transmitter
    ///
    /// # Arguments
    ///
    /// * `server_url` - The server endpoint URL for data transmission
    /// * `auth_token` - Authentication token for server requests
    /// * `timeout_seconds` - Optional timeout in seconds (default: 30)
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - `server_url` is empty or invalid
    /// - `auth_token` is empty
    /// - HTTP client cannot be initialized
    ///
    /// # Example
    ///
    /// ```no_run
    /// use monitoring_client::modules::http_transmitter::HttpTransmitter;
    ///
    /// # fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// // Use default 30s timeout
    /// let transmitter = HttpTransmitter::new(
    ///     "https://api.example.com/data",
    ///     "token123",
    ///     None,
    /// )?;
    ///
    /// // Use custom 60s timeout
    /// let transmitter = HttpTransmitter::new(
    ///     "https://api.example.com/data",
    ///     "token123",
    ///     Some(60),
    /// )?;
    /// # Ok(())
    /// # }
    /// ```
    pub fn new(
        server_url: impl Into<String>,
        auth_token: impl Into<String>,
        timeout_seconds: Option<u64>,
    ) -> Result<Self> {
        let server_url = server_url.into();
        let auth_token = auth_token.into();
        
        // Validate inputs
        if server_url.trim().is_empty() {
            return Err(MonitoringError::Transmission(
                "server_url cannot be empty".to_string(),
            ));
        }
        
        if auth_token.trim().is_empty() {
            return Err(MonitoringError::Transmission(
                "auth_token cannot be empty".to_string(),
            ));
        }
        
        let server_url = server_url.trim().to_string();
        let auth_token = auth_token.trim().to_string();
        
        // Warn if not using HTTPS
        if !server_url.to_lowercase().starts_with("https://") {
            warn!(
                "Server URL does not use HTTPS: {}. Data transmission may not be secure.",
                server_url
            );
        }
        
        // Set timeout
        let timeout = Duration::from_secs(timeout_seconds.unwrap_or(DEFAULT_TIMEOUT_SECONDS));
        
        // Build HTTP client with TLS support
        let client = Client::builder()
            .timeout(timeout)
            .use_rustls_tls() // Use rustls for TLS
            .build()
            .map_err(|e| {
                MonitoringError::Transmission(format!("Failed to create HTTP client: {}", e))
            })?;
        
        info!(
            "HTTP transmitter initialized for {} with {}s timeout",
            server_url,
            timeout.as_secs()
        );
        
        Ok(Self {
            server_url,
            auth_token,
            client,
            timeout,
        })
    }
    
    /// Sends a data payload to the server via HTTPS POST request
    ///
    /// # Arguments
    ///
    /// * `payload` - The JSON payload to send
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` if the transmission was successful (HTTP 200).
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - Payload is null or empty
    /// - Network communication fails
    /// - Server returns an error status code
    /// - Request times out
    /// - Authentication fails (HTTP 401)
    ///
    /// # Example
    ///
    /// ```no_run
    /// use monitoring_client::modules::http_transmitter::HttpTransmitter;
    /// use serde_json::json;
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let transmitter = HttpTransmitter::new(
    ///     "https://api.example.com/data",
    ///     "token123",
    ///     None,
    /// )?;
    ///
    /// let payload = json!({
    ///     "client_id": "test-client",
    ///     "timestamp": "2024-01-01T00:00:00Z"
    /// });
    ///
    /// transmitter.send_payload(&payload).await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn send_payload(&self, payload: &JsonValue) -> Result<()> {
        // Validate payload
        if payload.is_null() {
            return Err(MonitoringError::Transmission(
                "Payload cannot be empty".to_string(),
            ));
        }
        
        debug!("Sending payload to {}", self.server_url);
        debug!("Auth token being sent: 'Bearer {}'", self.auth_token);
        debug!("Auth token length: {}", self.auth_token.len());
        
        // Log payload summary
        if let Some(obj) = payload.as_object() {
            let app_count = obj
                .get("applications")
                .and_then(|v| v.as_array())
                .map(|a| a.len())
                .unwrap_or(0);
            
            debug!("Payload contains {} applications", app_count);
        }
        
        // Prepare headers with authentication token
        let response = self
            .client
            .post(&self.server_url)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", self.auth_token))
            .json(payload)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    error!("Request timed out after {}s", self.timeout.as_secs());
                    MonitoringError::Timeout
                } else if e.is_connect() {
                    error!("Connection failed: {}", e);
                    MonitoringError::Network(e)
                } else {
                    error!("Request failed: {}", e);
                    MonitoringError::Network(e)
                }
            })?;
        
        // Handle response based on status code
        let status = response.status();
        
        match status {
            StatusCode::OK => {
                info!("Payload transmitted successfully");
                Ok(())
            }
            StatusCode::UNAUTHORIZED => {
                error!("Authentication failed: Invalid or missing token");
                Err(MonitoringError::Authentication)
            }
            StatusCode::BAD_REQUEST => {
                let error_text = response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Unknown error".to_string());
                error!("Bad request: {}", error_text);
                Err(MonitoringError::Transmission(format!(
                    "Bad request: {}",
                    error_text
                )))
            }
            status if status.is_server_error() => {
                let error_text = response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Unknown error".to_string());
                error!("Server error (status {}): {}", status.as_u16(), error_text);
                Err(MonitoringError::Transmission(format!(
                    "Server error (status {}): {}",
                    status.as_u16(),
                    error_text
                )))
            }
            _ => {
                let error_text = response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Unknown error".to_string());
                warn!(
                    "Unexpected response (status {}): {}",
                    status.as_u16(),
                    error_text
                );
                Err(MonitoringError::Transmission(format!(
                    "Unexpected response (status {}): {}",
                    status.as_u16(),
                    error_text
                )))
            }
        }
    }
    
    /// Tests the connection to the server
    ///
    /// Sends a HEAD request to verify server connectivity and authentication.
    /// This is useful for validating configuration before attempting to send data.
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` if the server is reachable and authentication is valid.
    ///
    /// # Errors
    ///
    /// Returns an error if the connection test fails.
    ///
    /// # Example
    ///
    /// ```no_run
    /// use monitoring_client::modules::http_transmitter::HttpTransmitter;
    ///
    /// # async fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let transmitter = HttpTransmitter::new(
    ///     "https://api.example.com/data",
    ///     "token123",
    ///     None,
    /// )?;
    ///
    /// // Test connection before sending data
    /// transmitter.test_connection().await?;
    /// println!("Server is reachable");
    /// # Ok(())
    /// # }
    /// ```
    pub async fn test_connection(&self) -> Result<()> {
        debug!("Testing connection to {}", self.server_url);
        
        let response = self
            .client
            .head(&self.server_url)
            .header("Authorization", format!("Bearer {}", self.auth_token))
            .timeout(Duration::from_secs(5))
            .send()
            .await
            .map_err(|e| {
                error!("Connection test failed: {}", e);
                MonitoringError::Network(e)
            })?;
        
        let status = response.status();
        
        // Accept 200, 404, or 405 as success (server is reachable)
        // 404/405 means the endpoint doesn't support HEAD but server is reachable
        if status == StatusCode::OK
            || status == StatusCode::NOT_FOUND
            || status == StatusCode::METHOD_NOT_ALLOWED
        {
            info!("Server connection test successful");
            Ok(())
        } else if status == StatusCode::UNAUTHORIZED {
            error!("Authentication failed during connection test");
            Err(MonitoringError::Authentication)
        } else {
            warn!("Server returned status {} during connection test", status);
            Err(MonitoringError::Transmission(format!(
                "Server returned status {}",
                status
            )))
        }
    }
    
    /// Gets the server URL
    pub fn server_url(&self) -> &str {
        &self.server_url
    }
    
    /// Gets the timeout duration
    pub fn timeout(&self) -> Duration {
        self.timeout
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_new_transmitter() {
        let transmitter = HttpTransmitter::new(
            "https://api.example.com/data",
            "test-token",
            None,
        );
        assert!(transmitter.is_ok());
        
        let transmitter = transmitter.unwrap();
        assert_eq!(transmitter.server_url(), "https://api.example.com/data");
        assert_eq!(transmitter.timeout(), Duration::from_secs(30));
    }
    
    #[test]
    fn test_new_transmitter_with_custom_timeout() {
        let transmitter = HttpTransmitter::new(
            "https://api.example.com/data",
            "test-token",
            Some(60),
        );
        assert!(transmitter.is_ok());
        
        let transmitter = transmitter.unwrap();
        assert_eq!(transmitter.timeout(), Duration::from_secs(60));
    }
    
    #[test]
    fn test_new_transmitter_empty_url() {
        let result = HttpTransmitter::new("", "test-token", None);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), MonitoringError::Transmission(_)));
    }
    
    #[test]
    fn test_new_transmitter_empty_token() {
        let result = HttpTransmitter::new("https://api.example.com/data", "", None);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), MonitoringError::Transmission(_)));
    }
    
    #[test]
    fn test_new_transmitter_whitespace_url() {
        let result = HttpTransmitter::new("   ", "test-token", None);
        assert!(result.is_err());
    }
    
    #[test]
    fn test_new_transmitter_whitespace_token() {
        let result = HttpTransmitter::new("https://api.example.com/data", "   ", None);
        assert!(result.is_err());
    }
    
    #[test]
    fn test_new_transmitter_trims_whitespace() {
        let transmitter = HttpTransmitter::new(
            "  https://api.example.com/data  ",
            "  test-token  ",
            None,
        );
        assert!(transmitter.is_ok());
        
        let transmitter = transmitter.unwrap();
        assert_eq!(transmitter.server_url(), "https://api.example.com/data");
    }
    
    #[tokio::test]
    async fn test_send_payload_null() {
        let transmitter = HttpTransmitter::new(
            "https://api.example.com/data",
            "test-token",
            None,
        )
        .unwrap();
        
        let result = transmitter.send_payload(&json!(null)).await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), MonitoringError::Transmission(_)));
    }
}
