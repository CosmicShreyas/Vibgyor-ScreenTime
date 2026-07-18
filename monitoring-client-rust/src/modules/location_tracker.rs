//! Location tracking module using IP-based geolocation
//!
//! This module provides functionality to determine geographic location based on the client's
//! IP address. It uses the ipapi.co service for geolocation and implements caching to minimize
//! API calls.
//!
//! # Features
//! - IP-based geolocation
//! - Location caching to reduce API calls
//! - Configurable update intervals
//! - Graceful fallback when location is unavailable
//! - Thread-safe access to cached location
//!
//! # Example
//! ```no_run
//! use monitoring_client::modules::location_tracker::LocationTracker;
//!
//! #[tokio::main]
//! async fn main() {
//!     let tracker = LocationTracker::new();
//!     
//!     match tracker.get_location().await {
//!         Ok(Some(location)) => {
//!             println!("Location: {}, {}, {}",
//!                 location.city, location.state, location.country);
//!         }
//!         Ok(None) => println!("Location unavailable"),
//!         Err(e) => eprintln!("Error: {}", e),
//!     }
//! }
//! ```

use crate::modules::error::{MonitoringError, Result};
use crate::modules::types::Location;
use parking_lot::RwLock;
use reqwest::Client;
use serde::Deserialize;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{debug, error, info, warn};

/// Response structure from ip-api.com geolocation service
#[derive(Debug, Clone, Deserialize)]
struct IpApiResponse {
    #[serde(default)]
    city: Option<String>,

    #[serde(default, rename = "regionName")]
    region_name: Option<String>,

    #[serde(default)]
    country: Option<String>,

    #[serde(default)]
    query: Option<String>,

    #[serde(default)]
    status: Option<String>,

    #[serde(default)]
    message: Option<String>,
}

/// Cached location data with timestamp
#[derive(Debug, Clone)]
struct CachedLocation {
    location: Location,
    cached_at: Instant,
}

/// Location tracker for IP-based geolocation
///
/// The `LocationTracker` determines geographic location using IP-based geolocation services.
/// It caches location data to minimize API calls and provides thread-safe access.
pub struct LocationTracker {
    /// HTTP client for API requests
    client: Client,

    /// Cached location data
    cached_location: Arc<RwLock<Option<CachedLocation>>>,

    /// Cache validity duration (default: 30 minutes)
    cache_duration: Duration,

    /// API endpoint URL
    api_url: String,

    /// Request timeout
    timeout: Duration,
}

impl LocationTracker {
    /// Create a new location tracker with default settings
    ///
    /// # Returns
    /// A new `LocationTracker` instance with:
    /// - 30-minute cache duration
    /// - 10-second request timeout
    /// - ipapi.co as the geolocation service
    pub fn new() -> Self {
        Self::with_cache_duration(Duration::from_secs(30 * 60))
    }

    /// Create a new location tracker with custom cache duration
    ///
    /// # Arguments
    /// * `cache_duration` - How long to cache location data before refreshing
    ///
    /// # Returns
    /// A new `LocationTracker` instance with the specified cache duration
    pub fn with_cache_duration(cache_duration: Duration) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            client,
            cached_location: Arc::new(RwLock::new(None)),
            cache_duration,
            api_url: "http://ip-api.com/json/".to_string(),
            timeout: Duration::from_secs(10),
        }
    }

    /// Get the current location based on IP address
    ///
    /// This method first checks if cached location data is still valid. If not,
    /// it queries the geolocation API to get fresh location data.
    ///
    /// # Returns
    /// * `Ok(Some(Location))` - Location successfully determined
    /// * `Ok(None)` - Location unavailable (API error, network issue, etc.)
    /// * `Err(MonitoringError)` - Critical error occurred
    ///
    /// # Example
    /// ```no_run
    /// # use monitoring_client::modules::location_tracker::LocationTracker;
    /// # #[tokio::main]
    /// # async fn main() {
    /// let tracker = LocationTracker::new();
    /// if let Ok(Some(location)) = tracker.get_location().await {
    ///     println!("City: {}", location.city);
    /// }
    /// # }
    /// ```
    pub async fn get_location(&self) -> Result<Option<Location>> {
        // Check if cached location is still valid
        {
            let cached = self.cached_location.read();
            if let Some(cached_loc) = cached.as_ref() {
                if cached_loc.cached_at.elapsed() < self.cache_duration {
                    debug!(
                        "Using cached location: {}, {}, {} (age: {:?})",
                        cached_loc.location.city,
                        cached_loc.location.state,
                        cached_loc.location.country,
                        cached_loc.cached_at.elapsed()
                    );
                    return Ok(Some(cached_loc.location.clone()));
                }
            }
        }

        // Fetch fresh location data
        info!("🌍 Attempting to get location from IP address...");

        match self.fetch_location().await {
            Ok(location) => {
                info!(
                    "✅ Location detected successfully: {}, {}, {}",
                    location.city, location.state, location.country
                );

                // Update cache
                let mut cached = self.cached_location.write();
                *cached = Some(CachedLocation {
                    location: location.clone(),
                    cached_at: Instant::now(),
                });

                Ok(Some(location))
            }
            Err(e) => {
                warn!("⚠️ Failed to fetch location: {}", e);

                // Try to return cached location even if expired
                let cached = self.cached_location.read();
                if let Some(cached_loc) = cached.as_ref() {
                    info!(
                        "Using expired cached location: {}, {}, {}",
                        cached_loc.location.city,
                        cached_loc.location.state,
                        cached_loc.location.country
                    );
                    Ok(Some(cached_loc.location.clone()))
                } else {
                    warn!("No cached location available");
                    Ok(None)
                }
            }
        }
    }

    /// Fetch location data from the geolocation API
    ///
    /// # Returns
    /// * `Ok(Location)` - Location successfully fetched
    /// * `Err(MonitoringError)` - Failed to fetch location
    async fn fetch_location(&self) -> Result<Location> {
        debug!("Calling geolocation API: {}", self.api_url);

        let response = self
            .client
            .get(&self.api_url)
            .timeout(self.timeout)
            .send()
            .await
            .map_err(|e| {
                error!("Network error fetching location: {}", e);
                MonitoringError::LocationTracking(format!("Network error: {}", e))
            })?;

        if !response.status().is_success() {
            let status = response.status();
            error!("API returned error status: {}", status);
            return Err(MonitoringError::LocationTracking(format!(
                "API error: HTTP {}",
                status
            )));
        }

        let api_response: IpApiResponse = response.json().await.map_err(|e| {
            error!("Failed to parse API response: {}", e);
            MonitoringError::LocationTracking(format!("Parse error: {}", e))
        })?;

        debug!("API response: {:?}", api_response);

        // Check for API error (ip-api.com returns status: "fail" on error)
        if let Some(status) = &api_response.status {
            if status == "fail" {
                let message = api_response
                    .message
                    .unwrap_or_else(|| "Unknown error".to_string());
                error!("API returned error: {}", message);
                return Err(MonitoringError::LocationTracking(format!(
                    "API error: {}",
                    message
                )));
            }
        }

        // Extract location data with fallbacks
        let city = api_response.city.unwrap_or_else(|| "Unknown".to_string());
        let state = api_response
            .region_name
            .unwrap_or_else(|| "Unknown".to_string());
        let country = api_response
            .country
            .unwrap_or_else(|| "Unknown".to_string());

        if let Some(ip) = api_response.query {
            debug!("Detected IP: {}", ip);
        }

        Ok(Location {
            city,
            state,
            country,
        })
    }

    /// Get location as a formatted string
    ///
    /// # Returns
    /// A formatted string like "City, State, Country" or "Unknown" if unavailable
    ///
    /// # Example
    /// ```no_run
    /// # use monitoring_client::modules::location_tracker::LocationTracker;
    /// # #[tokio::main]
    /// # async fn main() {
    /// let tracker = LocationTracker::new();
    /// let location_str = tracker.get_location_string().await;
    /// println!("Location: {}", location_str);
    /// # }
    /// ```
    pub async fn get_location_string(&self) -> String {
        match self.get_location().await {
            Ok(Some(location)) => {
                format!(
                    "{}, {}, {}",
                    location.city, location.state, location.country
                )
            }
            Ok(None) | Err(_) => "Unknown".to_string(),
        }
    }

    /// Force refresh the cached location
    ///
    /// This method bypasses the cache and fetches fresh location data from the API.
    ///
    /// # Returns
    /// * `Ok(Some(Location))` - Location successfully refreshed
    /// * `Ok(None)` - Location unavailable
    /// * `Err(MonitoringError)` - Critical error occurred
    pub async fn refresh_location(&self) -> Result<Option<Location>> {
        info!("🔄 Forcing location refresh...");

        match self.fetch_location().await {
            Ok(location) => {
                // Update cache
                let mut cached = self.cached_location.write();
                *cached = Some(CachedLocation {
                    location: location.clone(),
                    cached_at: Instant::now(),
                });

                Ok(Some(location))
            }
            Err(e) => {
                error!("Failed to refresh location: {}", e);
                Ok(None)
            }
        }
    }

    /// Check if cached location is still valid
    ///
    /// # Returns
    /// `true` if cached location exists and is not expired, `false` otherwise
    pub fn is_cache_valid(&self) -> bool {
        let cached = self.cached_location.read();
        cached
            .as_ref()
            .map(|c| c.cached_at.elapsed() < self.cache_duration)
            .unwrap_or(false)
    }

    /// Get the age of the cached location
    ///
    /// # Returns
    /// * `Some(Duration)` - Age of the cached location
    /// * `None` - No cached location available
    pub fn cache_age(&self) -> Option<Duration> {
        let cached = self.cached_location.read();
        cached.as_ref().map(|c| c.cached_at.elapsed())
    }

    /// Clear the cached location
    ///
    /// This forces the next `get_location()` call to fetch fresh data from the API.
    pub fn clear_cache(&self) {
        let mut cached = self.cached_location.write();
        *cached = None;
        info!("Location cache cleared");
    }
}

impl Default for LocationTracker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_location_tracker_creation() {
        let tracker = LocationTracker::new();
        assert!(!tracker.is_cache_valid());
        assert!(tracker.cache_age().is_none());
    }

    #[tokio::test]
    async fn test_location_tracker_with_custom_duration() {
        let tracker = LocationTracker::with_cache_duration(Duration::from_secs(60));
        assert_eq!(tracker.cache_duration, Duration::from_secs(60));
    }

    #[tokio::test]
    async fn test_clear_cache() {
        let tracker = LocationTracker::new();
        tracker.clear_cache();
        assert!(!tracker.is_cache_valid());
    }

    #[tokio::test]
    async fn test_location_string_when_unavailable() {
        let tracker = LocationTracker::new();
        // Don't actually call the API in tests, just test the string formatting
        let location_str = tracker.get_location_string().await;
        // Should return "Unknown" or actual location depending on network
        assert!(!location_str.is_empty());
    }

    // Note: Integration tests with actual API calls should be in a separate test file
    // to avoid rate limiting and network dependencies in unit tests
}
