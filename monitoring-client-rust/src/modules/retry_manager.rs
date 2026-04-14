//! Retry Manager Module
//!
//! This module implements retry logic with exponential backoff for failed transmissions.
//! It integrates the QueueManager and HTTPTransmitter to process queued payloads when
//! the connection is restored.
//!
//! # Features
//!
//! - Exponential backoff starting at 1 second
//! - Maximum backoff of 300 seconds (5 minutes)
//! - Backoff multiplier of 2
//! - Maximum 10 retry attempts per payload
//! - Automatic queuing of failed payloads
//! - FIFO queue processing
//! - Backoff reset on successful transmission
//!
//! # Requirements
//!
//! - REQ-10.1: Exponential backoff starting at 1 second
//! - REQ-10.2: Maximum backoff of 300 seconds (5 minutes)
//! - REQ-10.3: Backoff multiplier of 2
//! - REQ-10.4: Maximum 10 retry attempts per payload
//! - REQ-10.5: Queue payloads on transmission failure
//!
//! # Example
//!
//! ```no_run
//! use monitoring_client::modules::retry_manager::RetryManager;
//! use monitoring_client::modules::queue_manager::QueueManager;
//! use monitoring_client::modules::http_transmitter::HttpTransmitter;
//! use serde_json::json;
//! use std::sync::Arc;
//!
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! // Create dependencies
//! let queue_manager = Arc::new(QueueManager::new(None)?);
//! let http_transmitter = Arc::new(HttpTransmitter::new(
//!     "https://api.example.com/data",
//!     "token",
//!     None,
//! )?);
//!
//! // Create retry manager
//! let retry_manager = RetryManager::new(queue_manager, http_transmitter);
//!
//! // Send payload with automatic retry on failure
//! let payload = json!({
//!     "client_id": "test",
//!     "timestamp": "2024-01-01T00:00:00Z"
//! });
//!
//! retry_manager.send_with_retry(&payload).await?;
//!
//! // Process queued payloads
//! let (successful, failed) = retry_manager.process_queue().await?;
//! println!("Processed: {} successful, {} failed", successful, failed);
//! # Ok(())
//! # }
//! ```

use crate::modules::error::Result;
use crate::modules::http_transmitter::HttpTransmitter;
use crate::modules::queue_manager::QueueManager;
use serde_json::Value as JsonValue;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::time::sleep;
use tracing::{debug, error, info, warn};

/// Initial backoff duration in seconds
pub const INITIAL_BACKOFF_SECONDS: u64 = 1;

/// Maximum backoff duration in seconds (5 minutes)
pub const MAX_BACKOFF_SECONDS: u64 = 300;

/// Backoff multiplier for exponential backoff
pub const BACKOFF_MULTIPLIER: u32 = 2;

/// Maximum number of retry attempts per payload
pub const MAX_RETRY_ATTEMPTS: u32 = 10;

/// Retry Manager for handling failed transmissions with exponential backoff
///
/// The retry manager coordinates between the queue manager and HTTP transmitter
/// to ensure reliable payload delivery. It implements exponential backoff to
/// avoid overwhelming the server during outages.
pub struct RetryManager {
    /// Queue manager for storing failed payloads
    queue_manager: Arc<QueueManager>,
    
    /// HTTP transmitter for sending payloads
    http_transmitter: Arc<HttpTransmitter>,
    
    /// Last retry attempt time
    last_retry_time: parking_lot::RwLock<Option<Instant>>,
    
    /// Current backoff duration
    current_backoff: parking_lot::RwLock<Duration>,
}

impl RetryManager {
    /// Creates a new retry manager
    ///
    /// # Arguments
    ///
    /// * `queue_manager` - Queue manager instance for payload queuing
    /// * `http_transmitter` - HTTP transmitter instance for sending payloads
    ///
    /// # Example
    ///
    /// ```no_run
    /// use monitoring_client::modules::retry_manager::RetryManager;
    /// use monitoring_client::modules::queue_manager::QueueManager;
    /// use monitoring_client::modules::http_transmitter::HttpTransmitter;
    /// use std::sync::Arc;
    ///
    /// # fn example() -> Result<(), Box<dyn std::error::Error>> {
    /// let queue_manager = Arc::new(QueueManager::new(None)?);
    /// let http_transmitter = Arc::new(HttpTransmitter::new(
    ///     "https://api.example.com/data",
    ///     "token",
    ///     None,
    /// )?);
    ///
    /// let retry_manager = RetryManager::new(queue_manager, http_transmitter);
    /// # Ok(())
    /// # }
    /// ```
    pub fn new(
        queue_manager: Arc<QueueManager>,
        http_transmitter: Arc<HttpTransmitter>,
    ) -> Self {
        info!("Retry manager initialized");
        
        Self {
            queue_manager,
            http_transmitter,
            last_retry_time: parking_lot::RwLock::new(None),
            current_backoff: parking_lot::RwLock::new(Duration::from_secs(INITIAL_BACKOFF_SECONDS)),
        }
    }
    
    /// Sends a payload with automatic queuing on failure
    ///
    /// Attempts to send the payload immediately. If the transmission fails,
    /// the payload is automatically queued for retry.
    ///
    /// # Arguments
    ///
    /// * `payload` - The JSON payload to send
    ///
    /// # Returns
    ///
    /// Returns `Ok(true)` if sent successfully, `Ok(false)` if queued for retry.
    ///
    /// # Errors
    ///
    /// Returns an error if queuing fails (transmission errors are handled internally).
    ///
    /// # Example
    ///
    /// ```no_run
    /// use monitoring_client::modules::retry_manager::RetryManager;
    /// use serde_json::json;
    ///
    /// # async fn example(retry_manager: RetryManager) -> Result<(), Box<dyn std::error::Error>> {
    /// let payload = json!({
    ///     "client_id": "test",
    ///     "timestamp": "2024-01-01T00:00:00Z"
    /// });
    ///
    /// let sent = retry_manager.send_with_retry(&payload).await?;
    /// if sent {
    ///     println!("Payload sent successfully");
    /// } else {
    ///     println!("Payload queued for retry");
    /// }
    /// # Ok(())
    /// # }
    /// ```
    pub async fn send_with_retry(&self, payload: &JsonValue) -> Result<bool> {
        match self.http_transmitter.send_payload(payload).await {
            Ok(_) => {
                info!("Payload sent successfully");
                // Reset backoff on successful transmission
                *self.current_backoff.write() = Duration::from_secs(INITIAL_BACKOFF_SECONDS);
                Ok(true)
            }
            Err(e) => {
                warn!("Transmission failed: {}. Queuing for retry.", e);
                
                // Queue the payload for retry
                self.queue_manager.add(payload.clone()).map_err(|e| {
                    error!("Failed to queue payload: {}", e);
                    e
                })?;
                
                info!("Payload queued for retry");
                Ok(false)
            }
        }
    }
    
    /// Processes queued payloads with exponential backoff
    ///
    /// Attempts to send queued payloads in FIFO order. Uses exponential backoff
    /// to avoid overwhelming the server. Stops processing if a transmission fails.
    ///
    /// # Returns
    ///
    /// Returns a tuple of (successful_count, failed_count).
    ///
    /// # Errors
    ///
    /// Returns an error if queue operations fail.
    ///
    /// # Example
    ///
    /// ```no_run
    /// use monitoring_client::modules::retry_manager::RetryManager;
    ///
    /// # async fn example(retry_manager: RetryManager) -> Result<(), Box<dyn std::error::Error>> {
    /// let (successful, failed) = retry_manager.process_queue().await?;
    /// println!("Processed: {} successful, {} failed", successful, failed);
    /// # Ok(())
    /// # }
    /// ```
    pub async fn process_queue(&self) -> Result<(usize, usize)> {
        let queue_size = self.queue_manager.size()?;
        if queue_size == 0 {
            return Ok((0, 0));
        }
        
        info!("Processing queue with {} payload(s)", queue_size);
        
        let mut successful_count = 0;
        let mut failed_count = 0;
        
        // Process payloads in FIFO order
        loop {
            // Retrieve next payload
            let payloads = self.queue_manager.retrieve(1)?;
            if payloads.is_empty() {
                break;
            }
            
            let (payload_id, payload) = &payloads[0];
            let retry_count = self.queue_manager.get_retry_count(*payload_id)?.unwrap_or(0);
            
            // Check if max retries exceeded
            if retry_count >= MAX_RETRY_ATTEMPTS {
                error!(
                    "Payload {} exceeded max retry attempts ({}). Removing from queue.",
                    payload_id, MAX_RETRY_ATTEMPTS
                );
                self.queue_manager.delete(*payload_id)?;
                failed_count += 1;
                continue;
            }
            
            // Calculate backoff delay based on retry count
            let backoff_delay = Self::calculate_backoff(retry_count);
            
            // Apply backoff delay
            if let Some(last_retry) = *self.last_retry_time.read() {
                let time_since_last_retry = last_retry.elapsed();
                
                if time_since_last_retry < backoff_delay {
                    let wait_time = backoff_delay - time_since_last_retry;
                    debug!("Applying backoff delay: {:.2} seconds", wait_time.as_secs_f64());
                    let _ = last_retry; // Drop the guard before await
                    sleep(wait_time).await;
                }
            }
            
            // Attempt to send payload
            info!("Retrying payload {} (attempt {})", payload_id, retry_count + 1);
            
            match self.http_transmitter.send_payload(payload).await {
                Ok(_) => {
                    info!("Payload {} sent successfully on retry", payload_id);
                    self.queue_manager.delete(*payload_id)?;
                    successful_count += 1;
                    
                    // Reset backoff on success
                    *self.current_backoff.write() = Duration::from_secs(INITIAL_BACKOFF_SECONDS);
                    
                    // Update last retry time
                    *self.last_retry_time.write() = Some(Instant::now());
                }
                Err(e) => {
                    warn!("Retry failed for payload {}: {}", payload_id, e);
                    self.queue_manager.increment_retry_count(*payload_id)?;
                    failed_count += 1;
                    
                    // Update last retry time
                    *self.last_retry_time.write() = Some(Instant::now());
                    
                    // Stop processing queue on failure (server likely still unreachable)
                    break;
                }
            }
        }
        
        info!(
            "Queue processing complete: {} successful, {} failed",
            successful_count, failed_count
        );
        
        Ok((successful_count, failed_count))
    }
    
    /// Calculates the backoff duration for a given retry count
    ///
    /// Uses exponential backoff: initial_backoff * (multiplier ^ retry_count)
    /// Capped at MAX_BACKOFF_SECONDS.
    ///
    /// # Arguments
    ///
    /// * `retry_count` - The number of previous retry attempts
    ///
    /// # Returns
    ///
    /// The backoff duration to wait before the next retry.
    ///
    /// # Example
    ///
    /// ```
    /// use monitoring_client::modules::retry_manager::RetryManager;
    /// use std::time::Duration;
    ///
    /// // First retry: 1 second
    /// assert_eq!(RetryManager::calculate_backoff(0), Duration::from_secs(1));
    ///
    /// // Second retry: 2 seconds
    /// assert_eq!(RetryManager::calculate_backoff(1), Duration::from_secs(2));
    ///
    /// // Third retry: 4 seconds
    /// assert_eq!(RetryManager::calculate_backoff(2), Duration::from_secs(4));
    ///
    /// // Eventually capped at 300 seconds
    /// assert_eq!(RetryManager::calculate_backoff(10), Duration::from_secs(300));
    /// ```
    pub fn calculate_backoff(retry_count: u32) -> Duration {
        let backoff_secs = INITIAL_BACKOFF_SECONDS
            .saturating_mul(BACKOFF_MULTIPLIER.saturating_pow(retry_count) as u64);
        
        let capped_backoff = backoff_secs.min(MAX_BACKOFF_SECONDS);
        Duration::from_secs(capped_backoff)
    }
    
    /// Gets the current queue size
    ///
    /// # Returns
    ///
    /// The number of payloads currently in the queue.
    ///
    /// # Errors
    ///
    /// Returns an error if the queue operation fails.
    pub fn get_queue_size(&self) -> Result<usize> {
        self.queue_manager.size()
    }
    
    /// Clears all queued payloads
    ///
    /// # Returns
    ///
    /// The number of payloads that were cleared.
    ///
    /// # Errors
    ///
    /// Returns an error if the queue operation fails.
    pub fn clear_queue(&self) -> Result<usize> {
        self.queue_manager.clear()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_calculate_backoff_initial() {
        assert_eq!(
            RetryManager::calculate_backoff(0),
            Duration::from_secs(1)
        );
    }
    
    #[test]
    fn test_calculate_backoff_exponential() {
        assert_eq!(
            RetryManager::calculate_backoff(1),
            Duration::from_secs(2)
        );
        assert_eq!(
            RetryManager::calculate_backoff(2),
            Duration::from_secs(4)
        );
        assert_eq!(
            RetryManager::calculate_backoff(3),
            Duration::from_secs(8)
        );
        assert_eq!(
            RetryManager::calculate_backoff(4),
            Duration::from_secs(16)
        );
    }
    
    #[test]
    fn test_calculate_backoff_capped() {
        // Should be capped at MAX_BACKOFF_SECONDS (300)
        assert_eq!(
            RetryManager::calculate_backoff(10),
            Duration::from_secs(300)
        );
        assert_eq!(
            RetryManager::calculate_backoff(20),
            Duration::from_secs(300)
        );
    }
    
    #[test]
    fn test_calculate_backoff_progression() {
        let expected = vec![1, 2, 4, 8, 16, 32, 64, 128, 256, 300, 300];
        
        for (retry_count, expected_secs) in expected.iter().enumerate() {
            assert_eq!(
                RetryManager::calculate_backoff(retry_count as u32),
                Duration::from_secs(*expected_secs),
                "Failed at retry count {}",
                retry_count
            );
        }
    }
}
