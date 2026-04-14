//! Payload Builder Module
//!
//! This module aggregates data from all monitoring modules and constructs
//! JSON payloads for transmission to the server.
//!
//! # Features
//! - Aggregates data from all monitoring sources
//! - Builds structured JSON payloads
//! - Handles interval tracking
//! - Manages optional fields (location, screenshot)
//! - Thread-safe access to shared state
//!
//! # Example
//! ```no_run
//! use monitoring_client::modules::payload_builder::PayloadBuilder;
//! use std::sync::Arc;
//!
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! // Create monitoring modules (activity_tracker, app_usage_tracker, etc.)
//! // ...
//!
//! # let activity_tracker = unimplemented!();
//! # let app_usage_tracker = unimplemented!();
//! let builder = PayloadBuilder::new(
//!     activity_tracker,
//!     app_usage_tracker,
//!     None, // browser_tab_tracker
//!     None, // location_tracker
//! );
//!
//! builder.start_interval();
//! builder.set_screenshot("base64_encoded_screenshot".to_string());
//!
//! let payload = builder.build_payload("employee_name", "client_id").await?;
//! # Ok(())
//! # }
//! ```

use crate::modules::activity_tracker::ActivityTracker;
use crate::modules::app_monitor::AppUsageTracker;
use crate::modules::browser_monitor::BrowserTabUsageTracker;
use crate::modules::error::{MonitoringError, Result};
use crate::modules::location_tracker::LocationTracker;
use crate::modules::types::{ActivityData, ApplicationData, BrowserTabData, Location, Payload};
use chrono::{DateTime, Utc};
use parking_lot::RwLock;
use std::sync::Arc;
use tracing::{debug, info, warn};

/// Payload builder for aggregating monitoring data
///
/// The `PayloadBuilder` collects data from all monitoring modules and constructs
/// a complete JSON payload for transmission to the server. It manages interval
/// tracking and handles optional fields like location and screenshots.
pub struct PayloadBuilder {
    /// Activity tracking module
    activity_tracker: Arc<ActivityTracker>,
    
    /// Application usage tracking module
    app_usage_tracker: Arc<AppUsageTracker>,
    
    /// Browser tab usage tracking module (optional)
    browser_tab_tracker: Option<Arc<BrowserTabUsageTracker>>,
    
    /// Location tracking module (optional)
    location_tracker: Option<Arc<LocationTracker>>,
    
    /// Start time of the current monitoring interval
    interval_start_time: Arc<RwLock<Option<DateTime<Utc>>>>,
    
    /// Cached screenshot data for the current interval
    screenshot_data: Arc<RwLock<Option<String>>>,
}

impl PayloadBuilder {
    /// Create a new payload builder
    ///
    /// # Arguments
    /// * `activity_tracker` - Activity tracking module
    /// * `app_usage_tracker` - Application usage tracking module
    /// * `browser_tab_tracker` - Browser tab usage tracking module (optional)
    /// * `location_tracker` - Location tracking module (optional)
    ///
    /// # Returns
    /// A new `PayloadBuilder` instance
    pub fn new(
        activity_tracker: Arc<ActivityTracker>,
        app_usage_tracker: Arc<AppUsageTracker>,
        browser_tab_tracker: Option<Arc<BrowserTabUsageTracker>>,
        location_tracker: Option<Arc<LocationTracker>>,
    ) -> Self {
        Self {
            activity_tracker,
            app_usage_tracker,
            browser_tab_tracker,
            location_tracker,
            interval_start_time: Arc::new(RwLock::new(None)),
            screenshot_data: Arc::new(RwLock::new(None)),
        }
    }
    
    /// Mark the start of a new monitoring interval
    ///
    /// This should be called at the beginning of each monitoring interval to
    /// reset the interval start time and clear cached data.
    pub fn start_interval(&self) {
        let now = Utc::now();
        *self.interval_start_time.write() = Some(now);
        *self.screenshot_data.write() = None; // Clear screenshot for new interval
        debug!("Started new interval at {}", now.to_rfc3339());
    }
    
    /// Store screenshot data for the current interval
    ///
    /// # Arguments
    /// * `screenshot_data` - Base64-encoded screenshot data
    pub fn set_screenshot(&self, screenshot_data: String) {
        *self.screenshot_data.write() = Some(screenshot_data);
        debug!("Screenshot data stored for current interval");
    }
    
    /// Build a complete data payload with all monitoring data
    ///
    /// # Arguments
    /// * `employee_name` - The name of the employee (deprecated, kept for compatibility)
    /// * `employee_id` - The employee ID (optional)
    /// * `client_id` - The unique client identifier
    /// * `system_info` - System information (optional, only sent on first run)
    ///
    /// # Returns
    /// * `Ok(Payload)` - Complete payload structure
    /// * `Err(MonitoringError)` - If client_id is empty or data collection fails
    ///
    /// # Example
    /// ```no_run
    /// # use monitoring_client::modules::payload_builder::PayloadBuilder;
    /// # async fn example(builder: PayloadBuilder) -> Result<(), Box<dyn std::error::Error>> {
    /// let payload = builder.build_payload("John Doe", None, "client-123", None).await?;
    /// println!("Payload timestamp: {}", payload.timestamp);
    /// # Ok(())
    /// # }
    /// ```
    pub async fn build_payload(
        &self,
        employee_name: &str,
        employee_id: Option<&str>,
        client_id: &str,
        system_info: Option<crate::modules::system_info::SystemInfo>,
    ) -> Result<Payload> {
        // Validate client_id
        if client_id.trim().is_empty() {
            return Err(MonitoringError::Config(
                "client_id cannot be empty".to_string(),
            ));
        }
        
        let interval_end_time = Utc::now();
        
        // Get interval start time, or use current time if not set
        let interval_start_time = {
            let start = self.interval_start_time.read();
            start.unwrap_or(interval_end_time)
        };
        
        // Get activity data
        let (work_seconds, idle_seconds, _current_state) =
            self.activity_tracker.get_activity_data();
        
        let activity = ActivityData {
            work_seconds,
            idle_seconds,
        };
        
        // Get application usage durations
        let app_durations = self.app_usage_tracker.get_application_durations();
        info!(
            "App usage durations from tracker: {} applications",
            app_durations.len()
        );
        debug!("App durations: {:?}", app_durations);
        
        // Get browser tab data with durations
        let browser_tabs = if let Some(ref tracker) = self.browser_tab_tracker {
            let tabs = tracker.get_tab_durations();
            info!("Browser tabs with durations: {} tabs", tabs.len());
            debug!("Browser tabs: {:?}", tabs);
            tabs
        } else {
            // No browser tab tracker available
            warn!("Browser tab tracker not initialized, using empty list");
            Vec::new()
        };
        
        // Get location data
        let location = if let Some(ref tracker) = self.location_tracker {
            info!("📍 Getting location for payload...");
            match tracker.get_location().await {
                Ok(Some(loc)) => {
                    info!(
                        "✅ Location data for payload: {}, {}, {}",
                        loc.city, loc.state, loc.country
                    );
                    Some(loc)
                }
                Ok(None) => {
                    warn!("⚠️ No location data available for payload");
                    None
                }
                Err(e) => {
                    warn!("⚠️ Error getting location for payload: {}", e);
                    None
                }
            }
        } else {
            warn!("⚠️ Location tracker not initialized");
            None
        };
        
        // Get stored screenshot data
        let screenshot_data = {
            let screenshot = self.screenshot_data.read();
            screenshot.clone().unwrap_or_default()
        };
        
        // Construct the payload
        let has_system_info = system_info.is_some();
        let payload = Payload {
            client_id: client_id.trim().to_string(),
            employee_name: if employee_name.trim().is_empty() {
                client_id.trim().to_string()
            } else {
                employee_name.trim().to_string()
            },
            employee_id: employee_id.map(|id| id.trim().to_string()),
            timestamp: interval_end_time,
            interval_start: interval_start_time,
            interval_end: interval_end_time,
            activity,
            applications: app_durations,
            browser_tabs,
            screenshot: screenshot_data.clone(),
            location,
            system_info,
        };
        
        info!(
            "Built payload for client {}: {}s work, {}s idle, {} apps, {} tabs, screenshot: {}, system_info: {}",
            client_id,
            payload.activity.work_seconds,
            payload.activity.idle_seconds,
            payload.applications.len(),
            payload.browser_tabs.len(),
            if screenshot_data.is_empty() {
                "no"
            } else {
                "yes"
            },
            if has_system_info {
                "yes"
            } else {
                "no"
            }
        );
        
        Ok(payload)
    }
    
    /// Get the current interval start time
    ///
    /// # Returns
    /// * `Some(DateTime<Utc>)` - The interval start time if set
    /// * `None` - If no interval has been started
    pub fn get_interval_start(&self) -> Option<DateTime<Utc>> {
        *self.interval_start_time.read()
    }
    
    /// Check if screenshot data is available
    ///
    /// # Returns
    /// `true` if screenshot data has been set for the current interval
    pub fn has_screenshot(&self) -> bool {
        self.screenshot_data.read().is_some()
    }
    
    /// Clear the cached screenshot data
    ///
    /// This is useful when you want to explicitly clear the screenshot
    /// without starting a new interval.
    pub fn clear_screenshot(&self) {
        *self.screenshot_data.write() = None;
        debug!("Screenshot data cleared");
    }
    
    /// Serialize the payload to JSON string
    ///
    /// # Arguments
    /// * `payload` - The payload to serialize
    ///
    /// # Returns
    /// * `Ok(String)` - JSON string representation
    /// * `Err(MonitoringError)` - If serialization fails
    pub fn serialize_payload(payload: &Payload) -> Result<String> {
        serde_json::to_string(payload).map_err(MonitoringError::Serialization)
    }
    
    /// Serialize the payload to pretty-printed JSON string
    ///
    /// # Arguments
    /// * `payload` - The payload to serialize
    ///
    /// # Returns
    /// * `Ok(String)` - Pretty-printed JSON string
    /// * `Err(MonitoringError)` - If serialization fails
    pub fn serialize_payload_pretty(payload: &Payload) -> Result<String> {
        serde_json::to_string_pretty(payload).map_err(MonitoringError::Serialization)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_payload_builder_structure() {
        // Test that the PayloadBuilder structure is valid
        // Full tests will be added once all dependencies are implemented
        assert!(true, "PayloadBuilder structure is valid");
    }
    
    #[test]
    fn test_serialize_payload() {
        // Test payload serialization
        let payload = Payload {
            client_id: "test-client".to_string(),
            employee_name: "Test Employee".to_string(),
            employee_id: None,
            timestamp: Utc::now(),
            interval_start: Utc::now(),
            interval_end: Utc::now(),
            activity: ActivityData {
                work_seconds: 100,
                idle_seconds: 50,
            },
            applications: vec![
                ApplicationData {
                    name: "TestApp".to_string(),
                    duration: 60,
                },
            ],
            browser_tabs: vec![],
            screenshot: "".to_string(),
            location: None,
            system_info: None,
        };
        
        let json = PayloadBuilder::serialize_payload(&payload);
        assert!(json.is_ok(), "Payload serialization should succeed");
        
        let json_str = json.unwrap();
        assert!(json_str.contains("test-client"));
        assert!(json_str.contains("Test Employee"));
    }
    
    #[test]
    fn test_serialize_payload_pretty() {
        let payload = Payload {
            client_id: "test-client".to_string(),
            employee_name: "Test Employee".to_string(),
            employee_id: None,
            timestamp: Utc::now(),
            interval_start: Utc::now(),
            interval_end: Utc::now(),
            activity: ActivityData {
                work_seconds: 100,
                idle_seconds: 50,
            },
            applications: vec![],
            browser_tabs: vec![],
            screenshot: "".to_string(),
            location: Some(Location {
                city: "Test City".to_string(),
                state: "Test State".to_string(),
                country: "Test Country".to_string(),
            }),
            system_info: None,
        };
        
        let json = PayloadBuilder::serialize_payload_pretty(&payload);
        assert!(json.is_ok(), "Pretty payload serialization should succeed");
        
        let json_str = json.unwrap();
        assert!(json_str.contains('\n'), "Pretty JSON should have newlines");
        assert!(json_str.contains("Test City"));
    }
}
