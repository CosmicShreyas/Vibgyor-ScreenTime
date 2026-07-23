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
    /// Input is present but judged not genuine (auto-clicker, jiggler, etc.).
    /// Counted as idle in totals but reported distinctly so the dashboard can flag it.
    SuspectedFake,
}

impl Default for ActivityState {
    fn default() -> Self {
        ActivityState::Work
    }
}

/// Activity data for a monitoring interval.
///
/// The intensity/genuineness fields are privacy-safe: only counts, rates, and
/// verdicts are ever populated — never which keys were pressed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityData {
    pub work_seconds: u64,
    pub idle_seconds: u64,

    // --- Intensity metrics (optional; omitted when detection is disabled) ---
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keystrokes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mouse_clicks: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mouse_distance_px: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scroll_events: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keystrokes_per_min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mouse_activity_per_min: Option<f64>,

    // --- Genuineness / anti-cheat ---
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suspected_fake_seconds: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub genuineness_score: Option<u8>, // 0-100
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub suspicion_reasons: Vec<String>,
}

impl ActivityData {
    /// Backward-compatible constructor for just work/idle (detection off).
    pub fn basic(work_seconds: u64, idle_seconds: u64) -> Self {
        Self {
            work_seconds,
            idle_seconds,
            keystrokes: None,
            mouse_clicks: None,
            mouse_distance_px: None,
            scroll_events: None,
            keystrokes_per_min: None,
            mouse_activity_per_min: None,
            suspected_fake_seconds: None,
            genuineness_score: None,
            suspicion_reasons: Vec::new(),
        }
    }
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
    pub idle_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<Location>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_info: Option<crate::modules::system_info::SystemInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tamper: Option<TamperReport>,
}

/// Integrity/tamper signals reported to the server so the dashboard can flag
/// attempts to interfere with monitoring, even when they can't be fully prevented.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TamperReport {
    /// The monitoring process restarted since the last report (killed & revived,
    /// crashed, or machine rebooted mid-shift).
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub process_restarted: bool,
    /// The wall clock jumped unexpectedly vs. the monotonic clock (possible
    /// clock tampering to skew time records).
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub clock_jump_detected: bool,
    /// Seconds monitoring spent paused during the interval.
    #[serde(skip_serializing_if = "is_zero_u64")]
    pub paused_seconds: u64,
    /// The watchdog had to relaunch the main process (someone killed it).
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub relaunched_by_watchdog: bool,
    /// The main client detected that its separate watchdog had exited and
    /// started a replacement watchdog.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub watchdog_restarted: bool,
    /// The server was unreachable for this many seconds (network/host block).
    #[serde(skip_serializing_if = "is_zero_u64")]
    pub server_unreachable_seconds: u64,
    /// The client had to restore its own auto-start entry (someone removed it).
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub autostart_restored: bool,
}

fn is_zero_u64(v: &u64) -> bool {
    *v == 0
}

impl TamperReport {
    /// True if anything worth flagging happened.
    pub fn has_signal(&self) -> bool {
        self.process_restarted
            || self.clock_jump_detected
            || self.paused_seconds > 0
            || self.relaunched_by_watchdog
            || self.watchdog_restarted
            || self.server_unreachable_seconds > 0
            || self.autostart_restored
    }
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
