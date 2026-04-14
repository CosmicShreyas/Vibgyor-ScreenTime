//! Common types used across the monitoring client

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Activity state enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum ActivityState {
    Work,
    Idle,
}

impl Default for ActivityState {
    fn default() -> Self {
        ActivityState::Work
    }
}

/// Activity data for a monitoring interval
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityData {
    pub work_seconds: u64,
    pub idle_seconds: u64,
}

/// Application information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Application {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_foreground: Option<bool>,
}

/// Application usage data with duration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplicationData {
    pub name: String,
    pub duration: u64, // seconds
}

/// Browser type enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Browser {
    Chrome,
    Firefox,
    Edge,
}

impl Browser {
    pub fn as_str(&self) -> &'static str {
        match self {
            Browser::Chrome => "Chrome",
            Browser::Firefox => "Firefox",
            Browser::Edge => "Edge",
        }
    }
}

/// Browser tab information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserTab {
    pub browser: String,
    pub title: String,
    pub url: String,
}

/// Browser tab with usage duration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserTabData {
    pub browser: String,
    pub title: String,
    pub url: String,
    pub duration: u64, // seconds
}

/// Geographic location information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Location {
    pub city: String,
    pub state: String,
    pub country: String,
}

/// Complete monitoring payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Payload {
    pub client_id: String,
    pub employee_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub employee_id: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub interval_start: DateTime<Utc>,
    pub interval_end: DateTime<Utc>,
    pub activity: ActivityData,
    pub applications: Vec<ApplicationData>,
    pub browser_tabs: Vec<BrowserTabData>,
    pub screenshot: String, // base64 encoded
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<Location>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_info: Option<crate::modules::system_info::SystemInfo>,
}

/// File information for OTA transfer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub id: String,
    pub filename: String,
    #[serde(rename = "fileSize")]
    pub file_size: u64,
}

/// Download status for file transfers
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DownloadStatus {
    Pending,
    Downloading,
    Completed,
    Failed,
}

/// Platform enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Windows,
    Linux,
    MacOS,
}

impl Platform {
    pub fn current() -> Self {
        #[cfg(target_os = "windows")]
        return Platform::Windows;

        #[cfg(target_os = "linux")]
        return Platform::Linux;

        #[cfg(target_os = "macos")]
        return Platform::MacOS;
    }
}

/// Helper function to convert Duration to seconds
pub fn duration_to_seconds(duration: Duration) -> u64 {
    duration.as_secs()
}

/// Helper function to create Duration from seconds
pub fn seconds_to_duration(seconds: u64) -> Duration {
    Duration::from_secs(seconds)
}
