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
use std::collections::{HashMap, HashSet};
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
                GetClassNameW, GetForegroundWindow, GetWindowTextW,
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

                // Classify the foreground window and extract a clean tab title.
                // The window title carries the browser suffix (and Incognito/
                // InPrivate/Private markers), which the helpers strip.
                if class_name == "Chrome_WidgetWin_1" {
                    let (browser, is_private) = classify_chromium_window(&title);
                    if let Some(browser) = browser {
                        let stripped = strip_browser_suffix(&title, browser);
                        if let Some(tab_title) = clean_tab_title(&stripped) {
                            return Ok(Some(BrowserTab {
                                browser: browser_label(browser, is_private),
                                title: tab_title,
                                url: String::new(),
                            }));
                        }
                    }
                } else if class_name == "MozillaWindowClass" {
                    let is_private = is_firefox_private(&title);
                    let stripped = strip_browser_suffix(&title, Browser::Firefox);
                    if let Some(tab_title) = clean_tab_title(&stripped) {
                        return Ok(Some(BrowserTab {
                            browser: browser_label(Browser::Firefox, is_private),
                            title: tab_title,
                            url: String::new(),
                        }));
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

    /// Get ALL currently open browser tabs across every Chrome, Edge, and Firefox
    /// window (including Incognito / InPrivate / Private windows), grouped and
    /// deduplicated into a single list. Titles only — no URLs are ever collected.
    ///
    /// Uses Windows UI Automation to enumerate live tab controls. If UIA yields
    /// nothing for a running browser (e.g. transient timeout), falls back to the
    /// foreground window title so a real open tab is never reported as zero.
    pub fn get_browser_tabs(&self) -> Result<Vec<BrowserTab>, MonitoringError> {
        #[cfg(target_os = "windows")]
        {
            let mut tabs = self.enumerate_all_tabs_uia();

            // Fallback: if enumeration found nothing but a browser is in the
            // foreground, capture at least the active tab so we don't regress.
            if tabs.is_empty() {
                if let Ok(Some(active)) = self.get_active_browser_tab() {
                    tabs.push(active);
                }
            }

            let grouped = group_tabs(tabs);
            if !grouped.is_empty() {
                info!(
                    "Captured {} open browser tab(s) across all windows",
                    grouped.len()
                );
            }
            Ok(grouped)
        }

        #[cfg(not(target_os = "windows"))]
        {
            // Non-Windows: best-effort foreground tab only.
            let mut tabs = Vec::new();
            if let Some(active) = self.get_active_browser_tab()? {
                tabs.push(active);
            }
            Ok(group_tabs(tabs))
        }
    }

    /// Enumerate every open tab across all Chromium (Chrome/Edge) and Firefox
    /// windows via UI Automation. Windows-only. Never returns URLs.
    ///
    /// Uses the raw `find_all(TreeScope::Subtree, condition)` API rather than the
    /// matcher builder's `.control_type().find_all()` — the latter walks the tree
    /// with a bounded timeout and reliably times out on tab-heavy browser windows
    /// ("find element time out"), returning zero tabs. The raw subtree query
    /// resolves all TabItem elements in one native call and is far faster.
    #[cfg(target_os = "windows")]
    fn enumerate_all_tabs_uia(&self) -> Vec<BrowserTab> {
        use uiautomation::types::{ControlType, TreeScope, UIProperty};
        use uiautomation::variants::Variant;
        use uiautomation::UIAutomation;

        let mut tabs = Vec::new();

        let automation = match UIAutomation::new() {
            Ok(a) => a,
            Err(e) => {
                warn!(
                    "UI Automation unavailable, browser tab capture degraded: {:?}",
                    e
                );
                return tabs;
            }
        };
        let root = match automation.get_root_element() {
            Ok(r) => r,
            Err(e) => {
                warn!("UI Automation root element unavailable: {:?}", e);
                return tabs;
            }
        };

        // Reusable condition matching TabItem controls anywhere in a window subtree.
        let tabitem_cond = match automation.create_property_condition(
            UIProperty::ControlType,
            Variant::from(ControlType::TabItem as i32),
            None,
        ) {
            Ok(c) => c,
            Err(e) => {
                warn!("Failed to build TabItem condition: {:?}", e);
                return tabs;
            }
        };

        // Map browser process PIDs to a Browser, so we can classify each window by
        // its OWNING PROCESS rather than by fragile window-title text. This is the
        // key fix for incognito/InPrivate: those windows' UIA Name frequently lacks
        // the "Google Chrome"/"Incognito" suffix, so title-based classification
        // skipped them entirely. Process name is title-independent and reliable.
        let pid_browser = self.browser_pids();

        // Condition to detect an Incognito/InPrivate indicator inside a window
        // subtree (Chrome shows an "Incognito" element; Edge shows "InPrivate").
        // We probe by NAME so it works across browser versions/locales that keep
        // the English marker.
        let build_name_cond = |needle: &str| {
            automation
                .create_property_condition(UIProperty::Name, Variant::from(needle), None)
                .ok()
        };
        let incognito_cond = build_name_cond("Incognito");
        let inprivate_cond = build_name_cond("InPrivate");

        // Helper to enumerate one window class.
        let mut collect_windows = |class: &str, is_firefox: bool| {
            let windows = match automation
                .create_matcher()
                .from_ref(&root)
                .timeout(2500)
                .classname(class)
                .find_all()
            {
                Ok(w) => w,
                Err(_) => return, // no such windows open
            };

            for window in windows {
                let window_title = window.get_name().unwrap_or_default();

                // Determine the browser from the window's owning process first
                // (reliable), falling back to title text only if the PID is unknown.
                let browser: Option<Browser> = if is_firefox {
                    Some(Browser::Firefox)
                } else {
                    match window
                        .get_process_id()
                        .ok()
                        .and_then(|pid| pid_browser.get(&pid).copied())
                    {
                        Some(b) => Some(b),
                        None => classify_chromium_window(&window_title).0,
                    }
                };

                // Skip non-browser windows sharing the class (e.g. Electron apps
                // like VS Code also use Chrome_WidgetWin_1).
                let browser = match browser {
                    Some(b) => b,
                    None => continue,
                };

                // Detect private mode: first via title marker (cheap), then by
                // probing the window subtree for the Incognito/InPrivate indicator.
                let mut is_private = match browser {
                    Browser::Firefox => is_firefox_private(&window_title),
                    Browser::Chrome => window_title.contains("Incognito"),
                    Browser::Edge => window_title.contains("InPrivate"),
                };
                if !is_private {
                    let probe = match browser {
                        Browser::Chrome => incognito_cond.as_ref(),
                        Browser::Edge => inprivate_cond.as_ref(),
                        Browser::Firefox => None,
                    };
                    if let Some(cond) = probe {
                        if let Ok(found) = window.find_first(TreeScope::Subtree, cond) {
                            let _ = found; // presence is enough
                            is_private = true;
                        }
                    }
                }

                // Raw subtree query — the reliable, fast path.
                if let Ok(tab_items) = window.find_all(TreeScope::Subtree, &tabitem_cond) {
                    for tab_item in tab_items {
                        if let Ok(name) = tab_item.get_name() {
                            if let Some(title) = clean_tab_title(&name) {
                                tabs.push(BrowserTab {
                                    browser: browser_label(browser, is_private),
                                    title,
                                    url: String::new(),
                                });
                            }
                        }
                    }
                }
            }
        };

        collect_windows("Chrome_WidgetWin_1", false); // Chrome + Edge
        collect_windows("MozillaWindowClass", true); // Firefox

        debug!("UIA enumerated {} raw tab(s) before grouping", tabs.len());
        tabs
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

    /// Build a map of process-id -> Browser for every running Chrome/Edge/Firefox
    /// process. Used to classify browser windows by their owning process, which is
    /// title-independent (so incognito/InPrivate windows are classified correctly).
    fn browser_pids(&self) -> HashMap<u32, Browser> {
        let mut map = HashMap::new();
        let mut system = self.system.write();
        system.refresh_processes();
        for (pid, proc_) in system.processes() {
            let name = proc_.name().to_lowercase();
            let browser = if name.contains("chrome") {
                Some(Browser::Chrome)
            } else if name.contains("msedge") || name == "edge.exe" {
                Some(Browser::Edge)
            } else if name.contains("firefox") {
                Some(Browser::Firefox)
            } else {
                None
            };
            if let Some(b) = browser {
                map.insert(pid.as_u32(), b);
            }
        }
        map
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
}

// ---------------------------------------------------------------------------
// Pure helpers for title normalization, browser/incognito classification, and
// grouping. Kept free-standing so they can be unit-tested without any OS state.
// ---------------------------------------------------------------------------

/// Classify a Chromium (Chrome_WidgetWin_1) window by its title suffix.
/// Returns the browser (None if the window isn't a recognizable browser) and
/// whether it is an Incognito (Chrome) / InPrivate (Edge) window.
fn classify_chromium_window(window_title: &str) -> (Option<Browser>, bool) {
    let t = window_title;
    // Edge check first: Edge titles contain "Microsoft Edge" (note: Edge uses a
    // zero-width char variant "Microsoft​ Edge" in some builds).
    if t.contains("Microsoft Edge") || t.contains("Microsoft\u{200b} Edge") {
        let private = t.contains("InPrivate");
        (Some(Browser::Edge), private)
    } else if t.contains("Google Chrome") {
        let private = t.contains("(Incognito)") || t.contains("Incognito");
        (Some(Browser::Chrome), private)
    } else {
        (None, false)
    }
}

/// Whether a Firefox window title indicates a Private Browsing window.
fn is_firefox_private(window_title: &str) -> bool {
    let t = window_title;
    t.contains("Private Browsing") || t.contains("(Private Browsing)")
}

/// Strip the trailing " - <Browser>[ (Incognito)/InPrivate]" suffix from a
/// full window title, leaving just the page/tab title.
fn strip_browser_suffix(title: &str, browser: Browser) -> String {
    let mut s = title.to_string();
    // Remove common private-mode markers first.
    for marker in [
        " (Incognito)",
        " - InPrivate",
        "InPrivate",
        " — Mozilla Firefox Private Browsing",
        " (Private Browsing)",
        " - Private Browsing",
    ] {
        s = s.replace(marker, "");
    }
    let suffixes: &[&str] = match browser {
        Browser::Chrome => &[" - Google Chrome"],
        Browser::Edge => &[" - Microsoft\u{200b} Edge", " - Microsoft Edge"],
        Browser::Firefox => &[" — Mozilla Firefox", " - Mozilla Firefox"],
    };
    for suffix in suffixes {
        if let Some(idx) = s.rfind(suffix) {
            s.truncate(idx);
        }
    }
    s.trim().to_string()
}

/// Normalize a raw tab-control name into a reportable title, or None if it's
/// empty, a new/blank tab, or an internal browser page.
///
/// Also strips Edge's tab-annotation noise appended to the accessibility name,
/// e.g. "Page Title - Sleeping - Memory usage - 246 MB" -> "Page Title".
fn clean_tab_title(raw: &str) -> Option<String> {
    let mut t = raw.trim().to_string();

    // Strip trailing "- Memory usage - N MB" (Edge appends this to the a11y name).
    if let Some(idx) = t.find(" - Memory usage - ") {
        t.truncate(idx);
    }
    // Strip trailing "- Sleeping" (Edge sleeping-tab marker).
    if let Some(idx) = t.rfind(" - Sleeping") {
        // Only strip if it's genuinely a trailing marker (nothing meaningful after).
        let after = &t[idx + " - Sleeping".len()..];
        if after.trim().is_empty() {
            t.truncate(idx);
        }
    }
    let t = t.trim();

    if t.is_empty() {
        return None;
    }
    // Filter internal/new-tab/system pages.
    let lower = t.to_lowercase();
    if lower == "new tab"
        || lower == "new incognito tab"
        || lower == "new inprivate tab"
        || lower == "start"
        || t.starts_with("chrome://")
        || t.starts_with("edge://")
        || t.starts_with("about:")
    {
        return None;
    }
    Some(t.to_string())
}

/// A user-facing browser label, marking private windows.
fn browser_label(browser: Browser, is_private: bool) -> String {
    let base = browser.as_str();
    if is_private {
        let mode = match browser {
            Browser::Chrome => "Incognito",
            Browser::Edge => "InPrivate",
            Browser::Firefox => "Private",
        };
        format!("{} ({})", base, mode)
    } else {
        base.to_string()
    }
}

/// Group + deduplicate tabs. Tabs with the same (browser, title) collapse into a
/// single entry. Preserves first-seen order. Never emits URLs.
fn group_tabs(tabs: Vec<BrowserTab>) -> Vec<BrowserTab> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut grouped: Vec<BrowserTab> = Vec::new();
    for mut tab in tabs {
        tab.url = String::new(); // title-only, always
        let key = format!("{}|{}", tab.browser, tab.title);
        if seen.insert(key) {
            grouped.push(tab);
        }
    }
    grouped
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

        // Full list of currently open tabs (for display).
        let open_tabs = self.browser_monitor.get_browser_tabs()?;

        // The ACTIVE (foreground) tab is the only one the user is actually using.
        // Elapsed time is credited to it alone — crediting every open tab caused
        // the total to grow at N× real time (the over-counting bug).
        let active_tab = self.browser_monitor.get_active_browser_tab().ok().flatten();

        let open_tab_keys: std::collections::HashSet<String> =
            open_tabs.iter().map(|tab| Self::get_tab_key(tab)).collect();

        if time_elapsed.as_secs() > 0 {
            let mut durations = self.tab_durations.write();

            // Drop tabs no longer open, but always keep the active tab's key.
            let active_key = active_tab.as_ref().map(Self::get_tab_key);
            durations
                .retain(|key, _| open_tab_keys.contains(key) || active_key.as_deref() == Some(key));

            // Credit elapsed time to the active tab only.
            if let Some(ref tab) = active_tab {
                let tab_key = Self::get_tab_key(tab);
                let duration = durations.entry(tab_key.clone()).or_insert(Duration::ZERO);
                *duration += time_elapsed;
                debug!(
                    "Added {:?} to ACTIVE tab: {} → Total: {:?}",
                    time_elapsed, tab_key, duration
                );
            }
        }

        // Merge: report all open tabs plus the active tab (if it isn't in the
        // open list for some reason), so the detailed list stays complete.
        let mut merged = open_tabs.clone();
        if let Some(tab) = active_tab {
            let key = Self::get_tab_key(&tab);
            if !merged.iter().any(|t| Self::get_tab_key(t) == key) {
                merged.push(tab);
            }
        }

        *self.current_tabs.write() = merged.clone();
        *self.last_update.write() = current_time;

        if !merged.is_empty() {
            info!("Tracking {} open browser tabs", merged.len());
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

    /// Get cumulative duration for each browser tab.
    ///
    /// Read-only: accumulation happens exclusively in `update()` (crediting the
    /// active tab). This method previously also added elapsed time to every tab,
    /// which double-counted and inflated totals — that logic has been removed.
    pub fn get_tab_durations(&self) -> Vec<BrowserTabData> {
        let durations = self.tab_durations.read();
        let current_tabs = self.current_tabs.read();

        // Report all currently-open tabs with their accumulated (active) time.
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

        result.sort_by(|a, b| b.duration.cmp(&a.duration));
        info!(
            "Returning {} browser tab durations (from {} open tabs)",
            result.len(),
            current_tabs.len()
        );
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

    #[test]
    fn test_classify_chromium_window() {
        assert_eq!(
            classify_chromium_window("GitHub - Google Chrome"),
            (Some(Browser::Chrome), false)
        );
        assert_eq!(
            classify_chromium_window("Secret - Google Chrome (Incognito)"),
            (Some(Browser::Chrome), true)
        );
        assert_eq!(
            classify_chromium_window("Docs - Work - Microsoft Edge"),
            (Some(Browser::Edge), false)
        );
        assert_eq!(
            classify_chromium_window("Bank - Microsoft Edge - InPrivate"),
            (Some(Browser::Edge), true)
        );
        // Non-browser Electron app using the same window class.
        assert_eq!(classify_chromium_window("Slack | general"), (None, false));
    }

    #[test]
    fn test_strip_browser_suffix() {
        assert_eq!(
            strip_browser_suffix("GitHub - Google Chrome", Browser::Chrome),
            "GitHub"
        );
        assert_eq!(
            strip_browser_suffix("Secret Page - Google Chrome (Incognito)", Browser::Chrome),
            "Secret Page"
        );
        assert_eq!(
            strip_browser_suffix("Docs - Work - Microsoft Edge", Browser::Edge),
            "Docs - Work"
        );
        assert_eq!(
            strip_browser_suffix("My Page — Mozilla Firefox", Browser::Firefox),
            "My Page"
        );
        assert_eq!(
            strip_browser_suffix(
                "My Page (Private Browsing) — Mozilla Firefox",
                Browser::Firefox
            ),
            "My Page"
        );
    }

    #[test]
    fn test_clean_tab_title_filters_system_pages() {
        assert_eq!(clean_tab_title("  GitHub  "), Some("GitHub".to_string()));
        assert_eq!(clean_tab_title(""), None);
        assert_eq!(clean_tab_title("New Tab"), None);
        assert_eq!(clean_tab_title("New Incognito Tab"), None);
        assert_eq!(clean_tab_title("chrome://settings"), None);
        assert_eq!(clean_tab_title("edge://downloads"), None);
    }

    #[test]
    fn test_clean_tab_title_strips_edge_noise() {
        assert_eq!(
            clean_tab_title("Bug List - Google Sheets - Sleeping - Memory usage - 277 MB"),
            Some("Bug List - Google Sheets".to_string())
        );
        assert_eq!(
            clean_tab_title("AI / ML Engineer - Sleeping - Memory usage - 83.7 MB"),
            Some("AI / ML Engineer".to_string())
        );
        assert_eq!(
            clean_tab_title("Some Page - Sleeping"),
            Some("Some Page".to_string())
        );
        // A real page whose title legitimately contains "Sleeping" mid-title is kept.
        assert_eq!(
            clean_tab_title("Sleeping habits - Research"),
            Some("Sleeping habits - Research".to_string())
        );
    }

    #[test]
    fn test_browser_label_marks_private() {
        assert_eq!(browser_label(Browser::Chrome, false), "Chrome");
        assert_eq!(browser_label(Browser::Chrome, true), "Chrome (Incognito)");
        assert_eq!(browser_label(Browser::Edge, true), "Edge (InPrivate)");
        assert_eq!(browser_label(Browser::Firefox, true), "Firefox (Private)");
    }

    #[test]
    fn test_group_tabs_dedups_and_strips_urls() {
        let tabs = vec![
            BrowserTab {
                browser: "Chrome".into(),
                title: "GitHub".into(),
                url: "https://github.com".into(),
            },
            BrowserTab {
                browser: "Chrome".into(),
                title: "GitHub".into(),
                url: "https://github.com/x".into(),
            },
            BrowserTab {
                browser: "Edge".into(),
                title: "GitHub".into(),
                url: "https://github.com".into(),
            },
            BrowserTab {
                browser: "Chrome".into(),
                title: "Docs".into(),
                url: "https://docs".into(),
            },
        ];
        let grouped = group_tabs(tabs);
        // (Chrome,GitHub) dedup'd; (Edge,GitHub) distinct; (Chrome,Docs) distinct.
        assert_eq!(grouped.len(), 3);
        assert!(
            grouped.iter().all(|t| t.url.is_empty()),
            "URLs must be stripped"
        );
        // First-seen order preserved.
        assert_eq!(grouped[0].title, "GitHub");
        assert_eq!(grouped[0].browser, "Chrome");
    }
}
