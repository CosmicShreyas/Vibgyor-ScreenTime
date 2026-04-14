//! Browser monitoring module
//!
//! This module monitors open browser tabs across different browsers.
//! It detects running browser processes and extracts tab information
//! including titles and URLs.
//!
//! Supported browsers: Chrome, Firefox, Edge
//!
//! Requirements: REQ-3.1, REQ-3.2, REQ-3.3, REQ-3.4, REQ-3.5

use crate::modules::error::MonitoringError;
use crate::modules::types::{Browser, BrowserTab, BrowserTabData, Platform};
use parking_lot::RwLock;
use rusqlite::Connection;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use sysinfo::System;
use tracing::{debug, info, warn};

/// Browser process names by platform
const CHROME_PROCESSES_WINDOWS: &[&str] = &["chrome.exe"];
const FIREFOX_PROCESSES_WINDOWS: &[&str] = &["firefox.exe"];
const EDGE_PROCESSES_WINDOWS: &[&str] = &["msedge.exe"];

const CHROME_PROCESSES_LINUX: &[&str] = &["chrome", "chromium", "google-chrome"];
const FIREFOX_PROCESSES_LINUX: &[&str] = &["firefox"];
const EDGE_PROCESSES_LINUX: &[&str] = &["msedge", "microsoft-edge"];

const CHROME_PROCESSES_MACOS: &[&str] = &["Google Chrome"];
const FIREFOX_PROCESSES_MACOS: &[&str] = &["Firefox"];
const EDGE_PROCESSES_MACOS: &[&str] = &["Microsoft Edge"];

/// Browser monitor for detecting and extracting browser tab information
pub struct BrowserMonitor {
    platform: Platform,
    system: Arc<RwLock<System>>,
}

impl BrowserMonitor {
    /// Create a new browser monitor
    pub fn new() -> Self {
        let platform = Platform::current();
        info!("BrowserMonitor initialized for platform: {:?}", platform);

        Self {
            platform,
            system: Arc::new(RwLock::new(System::new_all())),
        }
    }

    /// Get list of open browser tabs from all supported browsers
    ///
    /// Returns a list of browser tabs with title and URL information.
    /// Uses UI Automation on Windows for better accuracy.
    /// Get currently active browser tab (foreground window only)
    /// 
    /// This is more reliable than UI Automation and more accurate for usage tracking
    /// since it only tracks tabs that are actually being viewed.
    pub fn get_active_browser_tab(&self) -> Result<Option<BrowserTab>, MonitoringError> {
        #[cfg(target_os = "windows")]
        {
            use windows::Win32::Foundation::HWND;
            use windows::Win32::UI::WindowsAndMessaging::{
                GetForegroundWindow, GetWindowTextW, GetClassNameW,
            };
            
            unsafe {
                let hwnd: HWND = GetForegroundWindow();
                
                if hwnd.0 == 0 {
                    return Ok(None);
                }
                
                // Get window title
                let mut title_buffer = [0u16; 512];
                let title_len = GetWindowTextW(hwnd, &mut title_buffer);
                let title = String::from_utf16_lossy(&title_buffer[..title_len as usize]);
                
                // Get window class name
                let mut class_buffer = [0u16; 256];
                let class_len = GetClassNameW(hwnd, &mut class_buffer);
                let class_name = String::from_utf16_lossy(&class_buffer[..class_len as usize]);
                
                // Check if this is a browser window and extract tab title
                if class_name == "Chrome_WidgetWin_1" {
                    // Chrome or Edge
                    if title.contains(" - Google Chrome") {
                        let tab_title = title.replace(" - Google Chrome", "").trim().to_string();
                        if !tab_title.is_empty() && tab_title != "New Tab" {
                            return Ok(Some(BrowserTab {
                                browser: "Chrome".to_string(),
                                title: tab_title,
                                url: String::new(),
                            }));
                        }
                    } else if title.contains(" - Microsoft​ Edge") || title.contains(" - Microsoft Edge") {
                        let tab_title = title
                            .replace(" - Microsoft​ Edge", "")
                            .replace(" - Microsoft Edge", "")
                            .trim()
                            .to_string();
                        if !tab_title.is_empty() && tab_title != "New Tab" && tab_title != "New tab" {
                            return Ok(Some(BrowserTab {
                                browser: "Edge".to_string(),
                                title: tab_title,
                                url: String::new(),
                            }));
                        }
                    }
                } else if class_name == "MozillaWindowClass" {
                    // Firefox
                    if title.contains(" - Mozilla Firefox") {
                        let tab_title = title.replace(" - Mozilla Firefox", "").trim().to_string();
                        if !tab_title.is_empty() && tab_title != "New Tab" {
                            return Ok(Some(BrowserTab {
                                browser: "Firefox".to_string(),
                                title: tab_title,
                                url: String::new(),
                            }));
                        }
                    }
                }
                
                Ok(None)
            }
        }
        
        #[cfg(not(target_os = "windows"))]
        {
            Ok(None)
        }
    }
    
    /// Get browser tabs - returns active tab only (more reliable approach)
    /// 
    /// This method returns the currently active browser tab as a Vec for compatibility.
    /// It's more reliable than UI Automation and more accurate for usage tracking.
    pub fn get_browser_tabs(&self) -> Result<Vec<BrowserTab>, MonitoringError> {
        let mut tabs = Vec::new();
        
        if let Some(active_tab) = self.get_active_browser_tab()? {
            info!("Active browser tab: [{}] {}", active_tab.browser, active_tab.title);
            tabs.push(active_tab);
        }
        
        Ok(tabs)
    }
    
    /// Get running browsers
    fn get_running_browsers(&self) -> Vec<Browser> {
        let mut running = Vec::new();
        let system = self.system.read();

        // Get all running process names
        let running_process_names: HashSet<String> = system
            .processes()
            .values()
            .filter_map(|proc| Some(proc.name().to_lowercase()))
            .collect();

        // Check each browser
        if self.is_browser_running(&running_process_names, Browser::Chrome) {
            running.push(Browser::Chrome);
        }
        if self.is_browser_running(&running_process_names, Browser::Firefox) {
            running.push(Browser::Firefox);
        }
        if self.is_browser_running(&running_process_names, Browser::Edge) {
            running.push(Browser::Edge);
        }

        debug!("Running browsers: {:?}", running);
        running
    }

    /// Check if a specific browser is running
    fn is_browser_running(&self, running_processes: &HashSet<String>, browser: Browser) -> bool {
        let process_names = self.get_browser_process_names(browser);

        for proc_name in process_names {
            if running_processes.contains(&proc_name.to_lowercase()) {
                return true;
            }
        }

        false
    }

    /// Get process names for a browser based on platform
    fn get_browser_process_names(&self, browser: Browser) -> Vec<&'static str> {
        match (self.platform, browser) {
            (Platform::Windows, Browser::Chrome) => CHROME_PROCESSES_WINDOWS.to_vec(),
            (Platform::Windows, Browser::Firefox) => FIREFOX_PROCESSES_WINDOWS.to_vec(),
            (Platform::Windows, Browser::Edge) => EDGE_PROCESSES_WINDOWS.to_vec(),
            (Platform::Linux, Browser::Chrome) => CHROME_PROCESSES_LINUX.to_vec(),
            (Platform::Linux, Browser::Firefox) => FIREFOX_PROCESSES_LINUX.to_vec(),
            (Platform::Linux, Browser::Edge) => EDGE_PROCESSES_LINUX.to_vec(),
            (Platform::MacOS, Browser::Chrome) => CHROME_PROCESSES_MACOS.to_vec(),
            (Platform::MacOS, Browser::Firefox) => FIREFOX_PROCESSES_MACOS.to_vec(),
            (Platform::MacOS, Browser::Edge) => EDGE_PROCESSES_MACOS.to_vec(),
        }
    }

    /// Get Chrome tabs using UI Automation (Windows only)
    #[cfg(target_os = "windows")]
    fn get_chrome_tabs_uia(&self) -> Result<Vec<BrowserTab>, MonitoringError> {
        use uiautomation::UIAutomation;
        
        let mut tabs = Vec::new();
        
        match UIAutomation::new() {
            Ok(automation) => {
                match automation.get_root_element() {
                    Ok(root) => {
                        // Find all Chrome windows by class name
                        let matcher = automation.create_matcher()
                            .from(root)
                            .timeout(2000)  // Increased timeout
                            .classname("Chrome_WidgetWin_1");
                        
                        // Get all matching windows
                        if let Ok(windows) = matcher.find_all() {
                            info!("Found {} Chrome windows", windows.len());
                            
                            for window in windows {
                                // Find all TabItem controls (browser tabs)
                                let tab_matcher = automation.create_matcher()
                                    .from(window)
                                    .timeout(1000)
                                    .control_type(uiautomation::types::ControlType::TabItem);
                                
                                if let Ok(tab_items) = tab_matcher.find_all() {
                                    debug!("Found {} tab items in Chrome window", tab_items.len());
                                    
                                    for tab_item in tab_items {
                                        if let Ok(name) = tab_item.get_name() {
                                            let trimmed = name.trim();
                                            // Filter out empty, "New Tab", and system tabs
                                            if !trimmed.is_empty() 
                                                && trimmed != "New Tab" 
                                                && !trimmed.starts_with("chrome://")
                                                && !trimmed.starts_with("edge://") {
                                                tabs.push(BrowserTab {
                                                    browser: "Chrome".to_string(),
                                                    title: trimmed.to_string(),
                                                    url: String::new(),
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        } else {
                            debug!("No Chrome windows found via UI Automation");
                        }
                    }
                    Err(e) => {
                        warn!("Failed to get root element for Chrome: {:?}", e);
                    }
                }
            }
            Err(e) => {
                warn!("Failed to initialize UI Automation for Chrome: {:?}", e);
            }
        }
        
        info!("Found {} currently open Chrome tabs via UI Automation", tabs.len());
        Ok(tabs)
    }
    
    /// Get Edge tabs using UI Automation (Windows only)
    #[cfg(target_os = "windows")]
    fn get_edge_tabs_uia(&self) -> Result<Vec<BrowserTab>, MonitoringError> {
        use uiautomation::UIAutomation;
        
        let mut tabs = Vec::new();
        
        match UIAutomation::new() {
            Ok(automation) => {
                match automation.get_root_element() {
                    Ok(root) => {
                        // Find all Edge windows (Edge uses same class as Chrome)
                        let matcher = automation.create_matcher()
                            .from(root)
                            .timeout(3000)  // Increased timeout even more
                            .classname("Chrome_WidgetWin_1");
                        
                        // Get all matching windows
                        if let Ok(windows) = matcher.find_all() {
                            let mut edge_window_count = 0;
                            
                            for window in windows {
                                // Check if it's actually Edge by looking at the window title
                                let is_edge = if let Ok(window_name) = window.get_name() {
                                    let is_edge_window = window_name.contains("Microsoft Edge") 
                                        || window_name.contains("Edge") 
                                        || window_name.contains("- Microsoft​ Edge");
                                    
                                    if is_edge_window {
                                        info!("Found Edge window: {}", window_name);
                                    }
                                    is_edge_window
                                } else {
                                    false
                                };
                                
                                if !is_edge {
                                    continue; // Skip if not Edge
                                }
                                
                                edge_window_count += 1;
                                
                                // Approach 1: Look for TabItem controls
                                info!("Searching for TabItem controls...");
                                let tab_matcher = automation.create_matcher()
                                    .from(window.clone())
                                    .timeout(2000)
                                    .control_type(uiautomation::types::ControlType::TabItem);
                                
                                if let Ok(tab_items) = tab_matcher.find_all() {
                                    info!("Found {} TabItem controls", tab_items.len());
                                    
                                    for tab_item in tab_items {
                                        if let Ok(name) = tab_item.get_name() {
                                            let trimmed = name.trim();
                                            if !trimmed.is_empty() {
                                                info!("  TabItem: '{}'", trimmed);
                                            }
                                            
                                            // Filter out empty, "New Tab", and system tabs
                                            if !trimmed.is_empty() 
                                                && trimmed != "New Tab" 
                                                && trimmed != "New tab"
                                                && !trimmed.starts_with("chrome://")
                                                && !trimmed.starts_with("edge://") {
                                                tabs.push(BrowserTab {
                                                    browser: "Edge".to_string(),
                                                    title: trimmed.to_string(),
                                                    url: String::new(),
                                                });
                                            }
                                        }
                                    }
                                }
                                
                                // Approach 2: If no tabs found, try Tab control type
                                if tabs.is_empty() {
                                    info!("No TabItems found, trying Tab controls...");
                                    let tab_matcher2 = automation.create_matcher()
                                        .from(window.clone())
                                        .timeout(2000)
                                        .control_type(uiautomation::types::ControlType::Tab);
                                    
                                    if let Ok(tab_controls) = tab_matcher2.find_all() {
                                        info!("Found {} Tab controls", tab_controls.len());
                                    }
                                }
                                

                            }
                            
                            info!("Found {} Edge windows", edge_window_count);
                        } else {
                            warn!("No Edge windows found via UI Automation");
                        }
                    }
                    Err(e) => {
                        warn!("Failed to get root element for Edge: {:?}", e);
                    }
                }
            }
            Err(e) => {
                warn!("Failed to initialize UI Automation for Edge: {:?}", e);
            }
        }
        
        info!("Found {} currently open Edge tabs via UI Automation", tabs.len());
        Ok(tabs)
    }
    
    /// Get Chrome tabs
    fn get_chrome_tabs(&self) -> Result<Vec<BrowserTab>, MonitoringError> {
        let mut tabs = Vec::new();

        // Get Chrome profile paths
        let profile_paths = self.get_chrome_profile_paths();

        for profile_path in profile_paths {
            if let Ok(profile_tabs) = self.read_chrome_history(&profile_path) {
                tabs.extend(profile_tabs);
            }
        }

        debug!("Found {} Chrome tabs", tabs.len());
        Ok(tabs)
    }

    /// Get Chrome profile directory paths
    fn get_chrome_profile_paths(&self) -> Vec<PathBuf> {
        let mut paths = Vec::new();

        let base = match self.platform {
            Platform::Windows => {
                if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
                    PathBuf::from(local_appdata)
                        .join("Google")
                        .join("Chrome")
                        .join("User Data")
                } else {
                    return paths;
                }
            }
            Platform::MacOS => {
                if let Some(home) = dirs::home_dir() {
                    home.join("Library")
                        .join("Application Support")
                        .join("Google")
                        .join("Chrome")
                } else {
                    return paths;
                }
            }
            Platform::Linux => {
                if let Some(home) = dirs::home_dir() {
                    home.join(".config").join("google-chrome")
                } else {
                    return paths;
                }
            }
        };

        if !base.exists() {
            return paths;
        }

        // Check Default profile and numbered profiles
        for profile in &["Default", "Profile 1", "Profile 2", "Profile 3"] {
            let profile_path = base.join(profile);
            if profile_path.exists() {
                paths.push(profile_path);
            }
        }

        paths
    }

    /// Read Chrome history database to get recent URLs
    fn read_chrome_history(&self, profile_path: &Path) -> Result<Vec<BrowserTab>, MonitoringError> {
        let tabs = Vec::new();
        let history_path = profile_path.join("History");

        if !history_path.exists() {
            return Ok(tabs);
        }

        // Copy database to temp location to avoid locking issues
        let temp_dir = std::env::temp_dir();
        let temp_path = temp_dir.join(format!("chrome_history_{}.db", std::process::id()));

        if let Err(e) = fs::copy(&history_path, &temp_path) {
            debug!("Failed to copy Chrome history: {}", e);
            return Ok(tabs);
        }

        // Read from temp database
        let result = (|| -> Result<Vec<BrowserTab>, MonitoringError> {
            let conn = Connection::open(&temp_path)?;

            let mut stmt = conn.prepare(
                "SELECT title, url FROM urls ORDER BY last_visit_time DESC LIMIT 10",
            )?;

            let tab_iter = stmt.query_map([], |row| {
                Ok(BrowserTab {
                    browser: "Chrome".to_string(),
                    title: row.get(0).unwrap_or_default(),
                    url: row.get(1).unwrap_or_default(),
                })
            })?;

            let mut result_tabs = Vec::new();
            for tab in tab_iter {
                if let Ok(tab) = tab {
                    if !tab.title.is_empty() && !tab.url.is_empty() {
                        result_tabs.push(tab);
                    }
                }
            }

            Ok(result_tabs)
        })();

        // Clean up temp file
        let _ = fs::remove_file(&temp_path);

        result
    }

    /// Get Firefox tabs
    fn get_firefox_tabs(&self) -> Result<Vec<BrowserTab>, MonitoringError> {
        let mut tabs = Vec::new();

        // Get Firefox profile paths
        let profile_paths = self.get_firefox_profile_paths();

        for profile_path in profile_paths {
            if let Ok(profile_tabs) = self.read_firefox_session_data(&profile_path) {
                tabs.extend(profile_tabs);
            }
        }

        debug!("Found {} Firefox tabs", tabs.len());
        Ok(tabs)
    }

    /// Get Firefox profile directory paths
    fn get_firefox_profile_paths(&self) -> Vec<PathBuf> {
        let mut paths = Vec::new();

        let base = match self.platform {
            Platform::Windows => {
                if let Ok(appdata) = std::env::var("APPDATA") {
                    PathBuf::from(appdata).join("Mozilla").join("Firefox").join("Profiles")
                } else {
                    return paths;
                }
            }
            Platform::MacOS => {
                if let Some(home) = dirs::home_dir() {
                    home.join("Library")
                        .join("Application Support")
                        .join("Firefox")
                        .join("Profiles")
                } else {
                    return paths;
                }
            }
            Platform::Linux => {
                if let Some(home) = dirs::home_dir() {
                    home.join(".mozilla").join("firefox")
                } else {
                    return paths;
                }
            }
        };

        if !base.exists() {
            return paths;
        }

        // Firefox profiles are in subdirectories
        if let Ok(entries) = fs::read_dir(&base) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    paths.push(entry.path());
                }
            }
        }

        paths
    }

    /// Read Firefox session data
    fn read_firefox_session_data(&self, profile_path: &Path) -> Result<Vec<BrowserTab>, MonitoringError> {
        // Try different session file locations
        let session_files = vec![
            profile_path.join("sessionstore.jsonlz4"),
            profile_path.join("sessionstore-backups").join("recovery.jsonlz4"),
            profile_path.join("sessionstore.js"),
        ];

        for session_file in session_files {
            if !session_file.exists() {
                continue;
            }

            let tabs = if session_file.extension().and_then(|s| s.to_str()) == Some("jsonlz4") {
                self.read_firefox_lz4_session(&session_file)?
            } else {
                self.read_firefox_json_session(&session_file)?
            };

            if !tabs.is_empty() {
                return Ok(tabs);
            }
        }

        Ok(Vec::new())
    }

    /// Read Firefox LZ4-compressed session file
    fn read_firefox_lz4_session(&self, session_file: &Path) -> Result<Vec<BrowserTab>, MonitoringError> {
        let data = fs::read(session_file)?;

        // Check for mozLz40 header
        if data.len() < 8 || &data[0..8] != b"mozLz40\0" {
            return Ok(Vec::new());
        }

        // Decompress the rest
        let compressed = &data[8..];
        let decompressed = lz4::block::decompress(compressed, None)
            .map_err(|e| MonitoringError::Platform(format!("LZ4 decompression failed: {}", e)))?;

        // Parse JSON
        let session_data: FirefoxSessionData = serde_json::from_slice(&decompressed)?;
        Ok(self.parse_firefox_session_json(&session_data))
    }

    /// Read Firefox plain JSON session file
    fn read_firefox_json_session(&self, session_file: &Path) -> Result<Vec<BrowserTab>, MonitoringError> {
        let data = fs::read_to_string(session_file)?;
        let session_data: FirefoxSessionData = serde_json::from_str(&data)?;
        Ok(self.parse_firefox_session_json(&session_data))
    }

    /// Parse Firefox session JSON to extract tab information
    fn parse_firefox_session_json(&self, session_data: &FirefoxSessionData) -> Vec<BrowserTab> {
        let mut tabs = Vec::new();

        for window in &session_data.windows {
            for tab in &window.tabs {
                if let Some(entry) = tab.entries.last() {
                    let title = entry.title.clone().unwrap_or_default();
                    let url = entry.url.clone();

                    if !title.is_empty() || !url.is_empty() {
                        tabs.push(BrowserTab {
                            browser: "Firefox".to_string(),
                            title,
                            url,
                        });
                    }
                }
            }
        }

        tabs
    }

    /// Get Edge tabs
    fn get_edge_tabs(&self) -> Result<Vec<BrowserTab>, MonitoringError> {
        let mut tabs = Vec::new();

        // Get Edge profile paths
        let profile_paths = self.get_edge_profile_paths();

        for profile_path in profile_paths {
            if let Ok(profile_tabs) = self.read_edge_history(&profile_path) {
                tabs.extend(profile_tabs);
            }
        }

        debug!("Found {} Edge tabs", tabs.len());
        Ok(tabs)
    }

    /// Get Edge profile directory paths
    fn get_edge_profile_paths(&self) -> Vec<PathBuf> {
        let mut paths = Vec::new();

        let base = match self.platform {
            Platform::Windows => {
                if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
                    PathBuf::from(local_appdata)
                        .join("Microsoft")
                        .join("Edge")
                        .join("User Data")
                } else {
                    return paths;
                }
            }
            Platform::MacOS => {
                if let Some(home) = dirs::home_dir() {
                    home.join("Library")
                        .join("Application Support")
                        .join("Microsoft Edge")
                } else {
                    return paths;
                }
            }
            Platform::Linux => {
                if let Some(home) = dirs::home_dir() {
                    home.join(".config").join("microsoft-edge")
                } else {
                    return paths;
                }
            }
        };

        if !base.exists() {
            return paths;
        }

        // Check Default profile and numbered profiles
        for profile in &["Default", "Profile 1", "Profile 2", "Profile 3"] {
            let profile_path = base.join(profile);
            if profile_path.exists() {
                paths.push(profile_path);
            }
        }

        paths
    }

    /// Read Edge history database (similar to Chrome)
    fn read_edge_history(&self, profile_path: &Path) -> Result<Vec<BrowserTab>, MonitoringError> {
        let tabs = Vec::new();
        let history_path = profile_path.join("History");

        if !history_path.exists() {
            return Ok(tabs);
        }

        // Copy database to temp location to avoid locking issues
        let temp_dir = std::env::temp_dir();
        let temp_path = temp_dir.join(format!("edge_history_{}.db", std::process::id()));

        if let Err(e) = fs::copy(&history_path, &temp_path) {
            debug!("Failed to copy Edge history: {}", e);
            return Ok(tabs);
        }

        // Read from temp database
        let result = (|| -> Result<Vec<BrowserTab>, MonitoringError> {
            let conn = Connection::open(&temp_path)?;

            let mut stmt = conn.prepare(
                "SELECT title, url FROM urls ORDER BY last_visit_time DESC LIMIT 10",
            )?;

            let tab_iter = stmt.query_map([], |row| {
                Ok(BrowserTab {
                    browser: "Edge".to_string(),
                    title: row.get(0).unwrap_or_default(),
                    url: row.get(1).unwrap_or_default(),
                })
            })?;

            let mut result_tabs = Vec::new();
            for tab in tab_iter {
                if let Ok(tab) = tab {
                    if !tab.title.is_empty() && !tab.url.is_empty() {
                        result_tabs.push(tab);
                    }
                }
            }

            Ok(result_tabs)
        })();

        // Clean up temp file
        let _ = fs::remove_file(&temp_path);

        result
    }
}

/// Firefox session data structures for JSON parsing
#[derive(Debug, Deserialize)]
struct FirefoxSessionData {
    windows: Vec<FirefoxWindow>,
}

#[derive(Debug, Deserialize)]
struct FirefoxWindow {
    tabs: Vec<FirefoxTab>,
}

#[derive(Debug, Deserialize)]
struct FirefoxTab {
    entries: Vec<FirefoxEntry>,
}

#[derive(Debug, Deserialize)]
struct FirefoxEntry {
    title: Option<String>,
    url: String,
}

/// Browser tab usage tracker
///
/// Tracks cumulative usage time for each browser tab during a monitoring interval.
pub struct BrowserTabUsageTracker {
    browser_monitor: Arc<BrowserMonitor>,
    tab_durations: Arc<RwLock<HashMap<String, Duration>>>,
    current_tabs: Arc<RwLock<Vec<BrowserTab>>>,
    last_update: Arc<RwLock<Instant>>,
}

impl BrowserTabUsageTracker {
    /// Create a new browser tab usage tracker
    pub fn new(browser_monitor: Arc<BrowserMonitor>) -> Self {
        info!("BrowserTabUsageTracker initialized");

        Self {
            browser_monitor,
            tab_durations: Arc::new(RwLock::new(HashMap::new())),
            current_tabs: Arc::new(RwLock::new(Vec::new())),
            last_update: Arc::new(RwLock::new(Instant::now())),
        }
    }

    /// Update tab durations based on currently open tabs
    ///
    /// Should be called from the same polling loop as ApplicationUsageTracker.
    pub fn update(&self) -> Result<(), MonitoringError> {
        let current_time = Instant::now();
        let time_elapsed = {
            let last = *self.last_update.read();
            current_time.duration_since(last)
        };

        // Get currently open tabs
        let open_tabs = self.browser_monitor.get_browser_tabs()?;

        // Create a set of currently open tab keys
        let open_tab_keys: std::collections::HashSet<String> = open_tabs
            .iter()
            .map(|tab| Self::get_tab_key(tab))
            .collect();

        // Add elapsed time ONLY to currently open tabs
        if time_elapsed.as_secs() > 0 && !open_tabs.is_empty() {
            let mut durations = self.tab_durations.write();

            // Remove tabs that are no longer open
            durations.retain(|key, _| open_tab_keys.contains(key));

            // Add time to currently open tabs
            for tab in open_tabs.iter() {
                let tab_key = Self::get_tab_key(tab);
                let duration = durations.entry(tab_key.clone()).or_insert(Duration::ZERO);
                *duration += time_elapsed;

                debug!(
                    "Added {:?} to tab: {} → Total: {:?}",
                    time_elapsed, tab_key, duration
                );
            }
        }

        // Update current tabs and last update time
        *self.current_tabs.write() = open_tabs.clone();
        *self.last_update.write() = current_time;

        if !open_tabs.is_empty() {
            info!("Tracking {} open browser tabs", open_tabs.len());
        }

        Ok(())
    }

    /// Generate a unique key for a tab
    pub fn get_tab_key(tab: &BrowserTab) -> String {
        format!("{}|{}", tab.browser, tab.title)
    }

    /// Parse a tab key back into browser and title
    pub fn parse_tab_key(tab_key: &str) -> (String, String) {
        if let Some((browser, title)) = tab_key.split_once('|') {
            (browser.to_string(), title.to_string())
        } else {
            ("Unknown".to_string(), tab_key.to_string())
        }
    }

    /// Get cumulative duration for each browser tab
    pub fn get_tab_durations(&self) -> Vec<BrowserTabData> {
        // Update durations one more time before returning
        let current_time = Instant::now();
        let time_elapsed = {
            let last = *self.last_update.read();
            current_time.duration_since(last)
        };

        // Get currently open tabs
        let current_tabs = self.current_tabs.read().clone();
        
        if time_elapsed.as_secs() > 0 && !current_tabs.is_empty() {
            let mut durations = self.tab_durations.write();

            // Create a set of currently open tab keys
            let open_tab_keys: std::collections::HashSet<String> = current_tabs
                .iter()
                .map(|tab| Self::get_tab_key(tab))
                .collect();

            // Remove tabs that are no longer open
            durations.retain(|key, _| open_tab_keys.contains(key));

            // Add time to currently open tabs
            for tab in current_tabs.iter() {
                let tab_key = Self::get_tab_key(tab);
                let duration = durations.entry(tab_key).or_insert(Duration::ZERO);
                *duration += time_elapsed;
            }
        }

        *self.last_update.write() = current_time;

        // Convert to BrowserTabData - include ALL currently open tabs even if duration is 0
        // This ensures we report all open tabs, not just ones with accumulated time
        let durations = self.tab_durations.read();
        let current_tabs = self.current_tabs.read();
        
        // Build result from currently open tabs
        let mut result: Vec<BrowserTabData> = current_tabs
            .iter()
            .map(|tab| {
                let tab_key = Self::get_tab_key(tab);
                let duration = durations.get(&tab_key).map(|d| d.as_secs()).unwrap_or(0);
                
                BrowserTabData {
                    browser: tab.browser.clone(),
                    title: tab.title.clone(),
                    url: tab.url.clone(),
                    duration,
                }
            })
            .collect();

        // Sort by duration descending
        result.sort_by(|a, b| b.duration.cmp(&a.duration));

        info!("Returning {} browser tab durations (from {} open tabs)", result.len(), current_tabs.len());
        result
    }
    /// Reset tab durations for a new interval
    pub fn reset_interval(&self) {
        self.tab_durations.write().clear();
        *self.last_update.write() = Instant::now();
        debug!("Browser tab usage durations reset");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_browser_monitor_creation() {
        let monitor = BrowserMonitor::new();
        assert_eq!(monitor.platform, Platform::current());
    }

    #[test]
    fn test_tab_key_generation() {
        let tab = BrowserTab {
            browser: "Chrome".to_string(),
            title: "GitHub".to_string(),
            url: "https://github.com".to_string(),
        };

        let key = BrowserTabUsageTracker::get_tab_key(&tab);
        assert_eq!(key, "Chrome|GitHub");

        let (browser, title) = BrowserTabUsageTracker::parse_tab_key(&key);
        assert_eq!(browser, "Chrome");
        assert_eq!(title, "GitHub");
    }

    #[test]
    fn test_get_running_browsers() {
        let monitor = BrowserMonitor::new();
        let browsers = monitor.get_running_browsers();
        // Should not panic, may return empty list if no browsers running
        assert!(browsers.len() <= 3);
    }
}
