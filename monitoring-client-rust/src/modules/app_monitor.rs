//! Application monitoring module
//!
//! Monitors running applications and identifies the foreground (active) application.
//! Uses sysinfo for process enumeration and platform-specific APIs for foreground detection.
//!
//! Requirements: REQ-2.1, REQ-2.2, REQ-2.3, REQ-2.4, REQ-2.5

use crate::modules::error::Result;
use crate::modules::types::{Application, ApplicationData};
use parking_lot::RwLock;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};
use sysinfo::{Pid, System};
use tracing::{debug, info, warn};

/// Map a raw process/executable name to a clean, human-friendly display name.
///
/// - Known apps get curated names (`OUTLOOK.EXE` → "Outlook", `msedge` →
///   "Microsoft Edge", `Code` → "Visual Studio Code", …).
/// - Everything else falls back to: strip a trailing ".exe", then Title-Case
///   the remaining token(s) so `notepad` → "Notepad", `SomeApp` stays readable.
pub fn friendly_app_name(raw: &str) -> String {
    let key = raw
        .to_lowercase()
        .strip_suffix(".exe")
        .unwrap_or(&raw.to_lowercase())
        .to_string();

    let mapped = match key.as_str() {
        // Browsers
        "msedge" => Some("Microsoft Edge"),
        "chrome" => Some("Google Chrome"),
        "firefox" => Some("Firefox"),
        "brave" => Some("Brave"),
        "opera" => Some("Opera"),
        "iexplore" => Some("Internet Explorer"),
        // Microsoft Office
        "outlook" => Some("Outlook"),
        "winword" => Some("Word"),
        "excel" => Some("Excel"),
        "powerpnt" => Some("PowerPoint"),
        "onenote" => Some("OneNote"),
        "msaccess" => Some("Access"),
        "mspub" => Some("Publisher"),
        "lync" | "ms-teams" | "teams" => Some("Microsoft Teams"),
        "onedrive" => Some("OneDrive"),
        // Dev tools
        "code" => Some("Visual Studio Code"),
        "code - insiders" => Some("VS Code Insiders"),
        "devenv" => Some("Visual Studio"),
        "idea64" | "idea" => Some("IntelliJ IDEA"),
        "pycharm64" | "pycharm" => Some("PyCharm"),
        "webstorm64" | "webstorm" => Some("WebStorm"),
        "rider64" | "rider" => Some("Rider"),
        "sublime_text" => Some("Sublime Text"),
        "windowsterminal" | "wt" => Some("Windows Terminal"),
        "powershell" | "pwsh" => Some("PowerShell"),
        "cmd" => Some("Command Prompt"),
        "postman" => Some("Postman"),
        "docker desktop" => Some("Docker Desktop"),
        "gitkraken" => Some("GitKraken"),
        // Communication / meetings
        "slack" => Some("Slack"),
        "discord" => Some("Discord"),
        "zoom" => Some("Zoom"),
        "whatsapp" => Some("WhatsApp"),
        "telegram" => Some("Telegram"),
        "skype" => Some("Skype"),
        // Media / misc
        "spotify" => Some("Spotify"),
        "vlc" => Some("VLC"),
        "notepad" => Some("Notepad"),
        "notepad++" => Some("Notepad++"),
        "calculatorapp" | "calc" | "calculator" => Some("Calculator"),
        "systemsettings" => Some("Settings"),
        "acrobat" | "acrord32" => Some("Adobe Acrobat"),
        "photoshop" => Some("Photoshop"),
        "figma" => Some("Figma"),
        "obsidian" => Some("Obsidian"),
        "explorer" => Some("File Explorer"),
        _ => None,
    };

    if let Some(name) = mapped {
        return name.to_string();
    }

    // Fallback: strip ".exe" and title-case the base name.
    let base = raw.strip_suffix(".exe").or_else(|| raw.strip_suffix(".EXE")).unwrap_or(raw);
    title_case(base)
}

/// Title-case a token like "somelauncher" → "Somelauncher", "some-app" →
/// "Some-App". Leaves already-mixed-case names largely intact but uppercases the
/// first letter so raw lowercase exe names read as names.
fn title_case(s: &str) -> String {
    if s.is_empty() {
        return s.to_string();
    }
    // If the name already has an uppercase letter (e.g. "GitKraken", "OneNote"),
    // keep it as-is — it's already a readable name, just ensure first char is upper.
    let has_upper = s.chars().any(|c| c.is_uppercase());
    if has_upper {
        let mut chars = s.chars();
        return match chars.next() {
            Some(f) => f.to_uppercase().collect::<String>() + chars.as_str(),
            None => s.to_string(),
        };
    }
    // All-lowercase: capitalize the first letter only (keep the rest).
    let mut chars = s.chars();
    match chars.next() {
        Some(f) => f.to_uppercase().collect::<String>() + chars.as_str(),
        None => s.to_string(),
    }
}

/// Application monitor that tracks running applications and foreground app
#[derive(Debug)]
pub struct AppMonitor {
    system: Arc<RwLock<System>>,
    system_processes: HashSet<String>,
}

impl AppMonitor {
    /// Create a new application monitor
    pub fn new() -> Self {
        let mut system = System::new_all();
        system.refresh_all();

        let system_processes = Self::get_system_process_list();

        info!(
            "AppMonitor initialized with {} system processes in filter list",
            system_processes.len()
        );

        Self {
            system: Arc::new(RwLock::new(system)),
            system_processes,
        }
    }

    /// Get the list of system processes to filter out
    fn get_system_process_list() -> HashSet<String> {
        let mut set = HashSet::new();

        // Windows system processes
        let windows_processes = vec![
            "system",
            "registry",
            "smss.exe",
            "csrss.exe",
            "wininit.exe",
            "services.exe",
            "lsass.exe",
            "svchost.exe",
            "winlogon.exe",
            "dwm.exe",
            "conhost.exe",
            "fontdrvhost.exe",
            "taskhostw.exe",
            "lsaiso.exe",
            "spoolsv.exe",
            "wmiprvse.exe",
            "securityhealthservice.exe",
            "memcompression",
            "unsecapp.exe",
            "rtkaudservice64.exe",
            "mpdefendercoreservice.exe",
            "sqlwriter.exe",
            "msmpsvc.exe",
            "msmpseng.exe",
            "wslservice.exe",
            "aggregatorhost.exe",
            "runtimebroker.exe",
            "ngciso.exe",
            "searchindexer.exe",
            "crossdeviceresume.exe",
            "ctfmon.exe",
            "sqlceip.exe",
            "nissrv.exe",
            "monotificationux.exe",
            "windowspackagemanagerserver.exe",
            "widgetservice.exe",
            "sqlservr.exe",
            "sihost.exe",
            "audiodg.exe",
            "wlanext.exe",
            "searchhost.exe",
            "searchapp.exe",
            "startmenuexperiencehost.exe",
            "startmenu.exe",
            "shellexperiencehost.exe",
            "textinputhost.exe",
            "shellhost.exe",
            "applicationframehost.exe",
            "useroobebroker.exe",
            // Windows shell / non-user surfaces that briefly grab foreground when
            // the user clicks Start, search, Widgets, notifications, lock screen,
            // etc. These are NOT apps the user chose to use, so they must not
            // accrue usage time.
            "widgets.exe",
            "widget.exe",
            "lockapp.exe",
            "logonui.exe",
            "dllhost.exe",
            "backgroundtaskhost.exe",
            "gamebar.exe",
            "gamebarftserver.exe",
            "systemsettingsbroker.exe",
            "cortana.exe",
            "peopleexperiencehost.exe",
            "inputapp.exe",
            "narrator.exe",
            "wlanext.exe",
        ];

        // Linux system processes
        let linux_processes = vec!["systemd", "kthreadd", "init", "kernel", "kworker"];

        // Store keys WITHOUT any ".exe" suffix (lowercased) so matching works
        // regardless of whether the source reports "SearchHost" or
        // "SearchHost.exe" — sysinfo and the UWP child-window resolution can
        // return either form.
        for proc in windows_processes.iter().chain(linux_processes.iter()) {
            set.insert(Self::normalize_proc_key(proc));
        }

        set
    }

    /// Normalize a process name to a comparison key: lowercased, ".exe" stripped.
    fn normalize_proc_key(name: &str) -> String {
        let n = name.to_lowercase();
        n.strip_suffix(".exe").unwrap_or(&n).to_string()
    }

    /// Check if a process name is a system/shell process (not a user-facing app).
    /// Matches regardless of ".exe" suffix or case.
    fn is_system_process(&self, name: &str) -> bool {
        self.system_processes
            .contains(&Self::normalize_proc_key(name))
    }

    /// Get list of running user-facing applications
    ///
    /// # Returns
    /// * `Vec<Application>` - List of applications with name, pid, and foreground status
    pub fn get_running_applications(&self) -> Result<Vec<Application>> {
        let mut system = self.system.write();
        system.refresh_processes();

        let foreground_pid = self.get_foreground_pid();

        let mut applications = Vec::new();
        let mut seen_names = HashSet::new();

        for (pid, process) in system.processes() {
            let proc_name = process.name();

            // Skip empty names
            if proc_name.is_empty() {
                continue;
            }

            // Skip system processes
            if self.is_system_process(proc_name) {
                continue;
            }

            // Avoid duplicates (same app name)
            let name_lower = proc_name.to_lowercase();
            if seen_names.contains(&name_lower) {
                continue;
            }

            seen_names.insert(name_lower);

            let is_foreground = foreground_pid
                .map(|fg_pid| fg_pid == pid.as_u32())
                .unwrap_or(false);

            applications.push(Application {
                name: friendly_app_name(proc_name),
                pid: Some(pid.as_u32()),
                is_foreground: Some(is_foreground),
            });
        }

        debug!("Found {} user-facing applications", applications.len());
        Ok(applications)
    }

    /// Get the PID of the foreground (active) application
    ///
    /// # Returns
    /// * `Option<u32>` - PID of foreground application, or None if unable to determine
    pub fn get_foreground_pid(&self) -> Option<u32> {
        #[cfg(target_os = "windows")]
        {
            self.get_foreground_pid_windows()
        }

        #[cfg(target_os = "linux")]
        {
            self.get_foreground_pid_linux()
        }

        #[cfg(target_os = "macos")]
        {
            self.get_foreground_pid_macos()
        }
    }

    /// Get foreground PID on Windows.
    ///
    /// Handles the UWP/Store-app case: modern packaged apps (Settings, Calculator,
    /// Store WhatsApp/Spotify, Mail, Photos, …) are hosted inside a shared
    /// `ApplicationFrameHost.exe` window. `GetWindowThreadProcessId` on that window
    /// returns the *host's* PID, so the client would see `ApplicationFrameHost.exe`
    /// (a filtered system process) instead of the real app the user is using. When
    /// we detect that host, we drill into its child windows to find the actual
    /// hosted app process (a child window owned by a *different* PID) and return
    /// that instead.
    #[cfg(target_os = "windows")]
    fn get_foreground_pid_windows(&self) -> Option<u32> {
        use windows::Win32::UI::WindowsAndMessaging::{
            GetForegroundWindow, GetWindowThreadProcessId,
        };

        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0 == 0 {
                debug!("GetForegroundWindow returned null");
                return None;
            }

            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid as *mut u32));

            if pid == 0 {
                debug!("GetWindowThreadProcessId returned PID 0");
                return None;
            }

            // If the foreground window is an ApplicationFrameHost shell hosting a
            // UWP app, resolve the real hosted app PID.
            if Self::process_image_name(pid)
                .map(|n| n.eq_ignore_ascii_case("ApplicationFrameHost.exe"))
                .unwrap_or(false)
            {
                if let Some(real_pid) = Self::resolve_uwp_child_pid(hwnd, pid) {
                    debug!("Resolved UWP host {} -> real app PID {}", pid, real_pid);
                    return Some(real_pid);
                }
            }

            debug!("Foreground PID: {}", pid);
            Some(pid)
        }
    }

    /// Query a process's image file name (e.g. "chrome.exe") directly from the
    /// OS — robust and independent of sysinfo's refresh state.
    #[cfg(target_os = "windows")]
    fn process_image_name(pid: u32) -> Option<String> {
        use windows::core::PWSTR;
        use windows::Win32::Foundation::{CloseHandle, MAX_PATH};
        use windows::Win32::System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
            PROCESS_QUERY_LIMITED_INFORMATION,
        };

        if pid == 0 {
            return None;
        }
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            if handle.is_invalid() {
                return None;
            }
            let mut path = [0u16; MAX_PATH as usize];
            let mut size = path.len() as u32;
            let ok =
                QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(path.as_mut_ptr()), &mut size);
            let _ = CloseHandle(handle);
            if ok.is_err() {
                return None;
            }
            let full = String::from_utf16_lossy(&path[..size as usize]);
            full.rsplit(['\\', '/']).next().map(|s| s.to_string())
        }
    }

    /// Given an ApplicationFrameHost window, find the PID of the actual hosted
    /// UWP app by scanning its child windows for one owned by a different process.
    #[cfg(target_os = "windows")]
    fn resolve_uwp_child_pid(host_hwnd: windows::Win32::Foundation::HWND, host_pid: u32) -> Option<u32> {
        use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
        use windows::Win32::UI::WindowsAndMessaging::{EnumChildWindows, GetWindowThreadProcessId};

        // (host_pid, found_pid) passed through the enum callback.
        struct Ctx {
            host_pid: u32,
            found: u32,
        }
        let mut ctx = Ctx { host_pid, found: 0 };

        unsafe extern "system" fn enum_child(child: HWND, lparam: LPARAM) -> BOOL {
            let ctx = &mut *(lparam.0 as *mut Ctx);
            let mut cpid: u32 = 0;
            GetWindowThreadProcessId(child, Some(&mut cpid as *mut u32));
            // The hosted CoreWindow belongs to the real app, a different process.
            if cpid != 0 && cpid != ctx.host_pid {
                ctx.found = cpid;
                return BOOL(0); // stop enumeration
            }
            BOOL(1) // continue
        }

        unsafe {
            let _ = EnumChildWindows(host_hwnd, Some(enum_child), LPARAM(&mut ctx as *mut Ctx as isize));
        }

        if ctx.found != 0 {
            Some(ctx.found)
        } else {
            None
        }
    }

    /// Get foreground PID on Linux
    #[cfg(target_os = "linux")]
    fn get_foreground_pid_linux(&self) -> Option<u32> {
        use std::process::Command;

        // Try using xdotool to get the focused window PID
        match Command::new("xdotool")
            .args(&["getwindowfocus", "getwindowpid"])
            .output()
        {
            Ok(output) if output.status.success() => {
                let pid_str = String::from_utf8_lossy(&output.stdout);
                pid_str.trim().parse::<u32>().ok()
            }
            _ => {
                debug!("xdotool not available or command failed");
                None
            }
        }
    }

    /// Get foreground PID on macOS
    #[cfg(target_os = "macos")]
    fn get_foreground_pid_macos(&self) -> Option<u32> {
        // This would require AppKit bindings
        // For now, return None - can be implemented later
        warn!("macOS foreground detection not yet implemented");
        None
    }

    /// Get the name of the foreground application
    ///
    /// # Returns
    /// * `Option<String>` - Name of foreground application, or None if unable to determine
    pub fn get_foreground_application(&self) -> Option<String> {
        let foreground_pid = self.get_foreground_pid()?;
        let pid = Pid::from_u32(foreground_pid);

        // The original tracker only refreshed the process table during startup
        // or an unrelated full enumeration. Applications launched afterwards
        // therefore had a valid foreground PID but no matching sysinfo record.
        let mut system = self.system.write();
        system.refresh_process(pid);

        let raw = system.process(pid).map(|proc| proc.name().to_string());
        drop(system);

        let raw = raw.or_else(|| Self::process_image_name(foreground_pid))?;

        // Skip Windows shell/system surfaces (Start menu, search, Widgets,
        // ShellExperienceHost, etc.). These briefly hold the foreground but are
        // NOT apps the user chose to use — crediting them time produced the
        // "ShellExperienceHost / SearchHost / ShellHost" junk on the dashboard.
        if self.is_system_process(&raw) {
            debug!("Foreground is a system/shell surface ({}), skipping", raw);
            return None;
        }

        let friendly = friendly_app_name(&raw);
        debug!(
            "Foreground app: {} (raw: {}, PID: {})",
            friendly, raw, foreground_pid
        );
        Some(friendly)
    }

    /// Get list of application names only
    pub fn get_application_names(&self) -> Result<Vec<String>> {
        let apps = self.get_running_applications()?;
        Ok(apps.into_iter().map(|app| app.name).collect())
    }
}

impl Default for AppMonitor {
    fn default() -> Self {
        Self::new()
    }
}

/// Application usage tracker that monitors foreground app and tracks duration
#[derive(Debug)]
pub struct AppUsageTracker {
    app_monitor: Arc<AppMonitor>,
    app_durations: Arc<RwLock<HashMap<String, f64>>>,
    current_app: Arc<RwLock<Option<String>>>,
    last_check_time: Arc<RwLock<Instant>>,
    poll_interval: Duration,
    running: Arc<RwLock<bool>>,
}

impl AppUsageTracker {
    /// Create a new application usage tracker
    ///
    /// # Arguments
    /// * `app_monitor` - AppMonitor instance to get foreground app
    /// * `poll_interval_seconds` - How often to check foreground app (minimum 2.0 seconds)
    pub fn new(app_monitor: Arc<AppMonitor>, poll_interval_seconds: f64) -> Self {
        let poll_interval = Duration::from_secs_f64(poll_interval_seconds.clamp(0.5, 2.0));

        info!(
            "AppUsageTracker initialized with poll_interval={:?}",
            poll_interval
        );

        Self {
            app_monitor,
            app_durations: Arc::new(RwLock::new(HashMap::new())),
            current_app: Arc::new(RwLock::new(None)),
            last_check_time: Arc::new(RwLock::new(Instant::now())),
            poll_interval,
            running: Arc::new(RwLock::new(false)),
        }
    }

    /// Start tracking application usage
    pub fn start(&self) -> Result<()> {
        let mut running = self.running.write();
        if *running {
            warn!("Application usage tracker already running");
            return Ok(());
        }

        *running = true;
        *self.last_check_time.write() = Instant::now();

        info!("Starting application usage tracker...");

        // Clone Arc references for the background thread
        let app_monitor = Arc::clone(&self.app_monitor);
        let app_durations = Arc::clone(&self.app_durations);
        let current_app = Arc::clone(&self.current_app);
        let last_check_time = Arc::clone(&self.last_check_time);
        let poll_interval = self.poll_interval;
        let running_flag = Arc::clone(&self.running);

        // Spawn background tracking thread
        std::thread::spawn(move || {
            info!("App usage tracking loop started");

            let mut iteration = 0;
            while *running_flag.read() {
                iteration += 1;
                let current_time = Instant::now();

                // Get current foreground application
                let foreground_app = app_monitor.get_foreground_application();

                if let Some(ref app) = foreground_app {
                    debug!("[Poll {}] Foreground: {}", iteration, app);
                } else {
                    debug!("[Poll {}] No foreground app detected", iteration);
                }

                // Update durations
                let mut durations = app_durations.write();
                let mut current = current_app.write();
                let mut last_check = last_check_time.write();

                // Calculate time elapsed since last check
                let time_elapsed = current_time.duration_since(*last_check).as_secs_f64();

                // Add elapsed time to current app's duration
                if let Some(ref app_name) = *current {
                    if time_elapsed > 0.0 {
                        *durations.entry(app_name.clone()).or_insert(0.0) += time_elapsed;
                        debug!(
                            "[Poll {}] Added {:.1}s to {} → Total: {:.1}s",
                            iteration, time_elapsed, app_name, durations[app_name]
                        );
                    }
                }

                // Update current app and last check time
                *current = foreground_app;
                *last_check = current_time;

                drop(durations);
                drop(current);
                drop(last_check);

                // Sleep for poll interval
                std::thread::sleep(poll_interval);
            }

            info!("App usage tracking loop stopped");
        });

        info!("Application usage tracking thread started successfully");
        Ok(())
    }

    /// Stop tracking application usage
    pub fn stop(&self) {
        let mut running = self.running.write();
        if !*running {
            return;
        }

        *running = false;
        info!("Application usage tracking stopped");
    }

    /// Get cumulative duration for each application
    ///
    /// # Returns
    /// * `Vec<ApplicationData>` - List of applications with their usage duration in seconds
    pub fn get_application_durations(&self) -> Vec<ApplicationData> {
        // Update current app's time before returning
        if *self.running.read() {
            if let Some(ref app_name) = *self.current_app.read() {
                let current_time = Instant::now();
                let mut last_check = self.last_check_time.write();
                let time_elapsed = current_time.duration_since(*last_check).as_secs_f64();

                if time_elapsed > 0.0 {
                    let mut durations = self.app_durations.write();
                    *durations.entry(app_name.clone()).or_insert(0.0) += time_elapsed;
                    *last_check = current_time;
                    debug!(
                        "Updated {}: +{:.1}s (total: {:.1}s)",
                        app_name, time_elapsed, durations[app_name]
                    );
                }
            }
        }

        // Return applications with >0 duration
        let durations = self.app_durations.read();
        let mut result: Vec<ApplicationData> = durations
            .iter()
            .filter(|(_, &duration)| duration > 0.0)
            .map(|(name, &duration)| ApplicationData {
                name: name.clone(),
                duration: duration.round() as u64,
            })
            .collect();

        // Sort by duration descending
        result.sort_by(|a, b| b.duration.cmp(&a.duration));

        debug!("Returning {} application durations", result.len());
        result
    }

    /// Reset application durations for a new interval
    pub fn reset_interval(&self) {
        let mut durations = self.app_durations.write();
        durations.clear();
        *self.last_check_time.write() = Instant::now();
        debug!("Application usage durations reset");
    }

    /// Get the currently active foreground application
    pub fn get_current_application(&self) -> Option<String> {
        self.current_app.read().clone()
    }

    /// Check if the tracker is currently running
    pub fn is_running(&self) -> bool {
        *self.running.read()
    }
}

impl Drop for AppUsageTracker {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn test_app_monitor_creation() {
        let monitor = AppMonitor::new();
        assert!(!monitor.system_processes.is_empty());
    }

    #[test]
    fn test_get_running_applications() {
        let monitor = AppMonitor::new();
        let apps = monitor.get_running_applications().unwrap();

        // Should have at least some applications running
        assert!(
            !apps.is_empty(),
            "Should find at least some running applications"
        );

        // Check that applications have names
        for app in &apps {
            assert!(!app.name.is_empty(), "Application name should not be empty");
        }
    }

    #[test]
    fn test_system_process_filtering() {
        let monitor = AppMonitor::new();

        // These should be filtered out
        assert!(monitor.is_system_process("svchost.exe"));
        assert!(monitor.is_system_process("SVCHOST.EXE")); // Case insensitive
        assert!(monitor.is_system_process("systemd"));

        // These should not be filtered
        assert!(!monitor.is_system_process("chrome.exe"));
        assert!(!monitor.is_system_process("code.exe"));
    }

    #[test]
    fn test_app_usage_tracker_creation() {
        let monitor = Arc::new(AppMonitor::new());
        let tracker = AppUsageTracker::new(monitor, 10.0);

        assert!(!tracker.is_running());
        assert_eq!(tracker.get_current_application(), None);
    }

    #[test]
    fn test_app_usage_tracker_start_stop() {
        let monitor = Arc::new(AppMonitor::new());
        let tracker = AppUsageTracker::new(monitor, 10.0);

        tracker.start().unwrap();
        thread::sleep(Duration::from_millis(100));
        assert!(tracker.is_running());

        tracker.stop();
        // Note: is_running might still be true briefly due to thread timing
    }

    #[test]
    fn test_app_usage_tracker_duration_tracking() {
        let monitor = Arc::new(AppMonitor::new());
        let tracker = AppUsageTracker::new(monitor, 2.0);

        tracker.start().unwrap();

        // Wait for at least one poll cycle
        thread::sleep(Duration::from_millis(2500));

        let durations = tracker.get_application_durations();

        // Should have tracked at least one application if there's a foreground app
        // (This might be 0 in headless environments)
        debug!("Tracked {} applications", durations.len());

        tracker.stop();
    }

    #[test]
    fn test_reset_interval() {
        let monitor = Arc::new(AppMonitor::new());
        let tracker = AppUsageTracker::new(monitor, 2.0);

        tracker.start().unwrap();
        thread::sleep(Duration::from_millis(2500));

        let durations_before = tracker.get_application_durations();

        tracker.reset_interval();

        // Wait a moment to ensure no immediate accumulation
        thread::sleep(Duration::from_millis(100));

        let durations_after = tracker.get_application_durations();

        // After reset and a short wait, total duration should be minimal
        let total_duration: u64 = durations_after.iter().map(|d| d.duration).sum();
        assert!(
            total_duration < 1,
            "Total duration after reset should be < 1 second"
        );

        tracker.stop();
    }
}
