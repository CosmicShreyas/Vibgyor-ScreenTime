//! Resilience & anti-tamper.
//!
//! Legitimate hardening for a corporate monitoring agent — NOT rootkit/kernel
//! techniques. Four layers:
//!   1. Self-heal auto-start: re-create the logon auto-start entry if removed.
//!   2. Watchdog relaunch: a distinct, clearly named `ScreenTime Watchdog.exe`
//!      companion relaunches the main agent within seconds if it is killed; the
//!      main agent relaunches the watchdog if the companion exits.
//!   3. Tamper signals: clock jumps, process restarts, prolonged pauses, and
//!      server-unreachable stretches are recorded and reported to the server.
//!   4. Network-block resilience is handled by the existing queue/retry layer;
//!      this module just tracks and flags prolonged unreachability.
//!
//! Everything here is observable and removable by a legitimate admin uninstall
//! (it uses the standard Scheduled Task / HKCU Run entry the installer created).

use parking_lot::RwLock;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};
use tracing::{debug, info, warn};

use crate::modules::types::TamperReport;

const TASK_NAME: &str = "VibgyorSeek Monitoring";
const RUN_VALUE_NAME: &str = "VibgyorSeek Monitoring";
pub const WATCHDOG_FILENAME: &str = "ScreenTime Watchdog.exe";
pub const WATCHDOG_PID_ENV: &str = "VIBGYOR_WATCHDOG_PID";

/// Shared, cheaply-cloneable tamper state. Interior mutability via atomics so any
/// task/thread can flag a signal without locking.
#[derive(Clone)]
pub struct TamperState {
    process_restarted: Arc<AtomicBool>,
    clock_jump: Arc<AtomicBool>,
    relaunched: Arc<AtomicBool>,
    watchdog_restarted: Arc<AtomicBool>,
    autostart_restored: Arc<AtomicBool>,
    paused_seconds: Arc<AtomicU64>,
    server_unreachable_seconds: Arc<AtomicU64>,
    /// Wall/monotonic reference for clock-jump detection.
    reference: Arc<RwLock<Option<(Instant, SystemTime)>>>,
}

impl TamperState {
    pub fn new() -> Self {
        Self {
            process_restarted: Arc::new(AtomicBool::new(false)),
            clock_jump: Arc::new(AtomicBool::new(false)),
            relaunched: Arc::new(AtomicBool::new(false)),
            watchdog_restarted: Arc::new(AtomicBool::new(false)),
            autostart_restored: Arc::new(AtomicBool::new(false)),
            paused_seconds: Arc::new(AtomicU64::new(0)),
            server_unreachable_seconds: Arc::new(AtomicU64::new(0)),
            reference: Arc::new(RwLock::new(None)),
        }
    }

    pub fn mark_process_restarted(&self) {
        self.process_restarted.store(true, Ordering::Relaxed);
    }
    pub fn mark_relaunched(&self) {
        self.relaunched.store(true, Ordering::Relaxed);
    }
    pub fn mark_watchdog_restarted(&self) {
        self.watchdog_restarted.store(true, Ordering::Relaxed);
    }
    pub fn mark_autostart_restored(&self) {
        self.autostart_restored.store(true, Ordering::Relaxed);
    }
    pub fn add_paused_seconds(&self, s: u64) {
        self.paused_seconds.fetch_add(s, Ordering::Relaxed);
    }
    pub fn add_unreachable_seconds(&self, s: u64) {
        self.server_unreachable_seconds
            .fetch_add(s, Ordering::Relaxed);
    }

    /// Sample the clock: if wall-clock advanced far more/less than the monotonic
    /// clock since the last sample, flag a clock jump. Call periodically.
    pub fn sample_clock(&self) {
        let now_mono = Instant::now();
        let now_wall = SystemTime::now();
        let mut r = self.reference.write();
        if let Some((prev_mono, prev_wall)) = *r {
            let mono_delta = now_mono.duration_since(prev_mono).as_secs_f64();
            let wall_delta = now_wall
                .duration_since(prev_wall)
                .map(|d| d.as_secs_f64())
                // Wall clock went backwards → definitely a jump.
                .unwrap_or(-1.0);
            // Allow generous slack (sleep/suspend legitimately pauses monotonic).
            // Flag only large divergence not explained by monotonic advancing.
            if wall_delta < 0.0 || (wall_delta - mono_delta).abs() > 120.0 {
                warn!(
                    "⏱️ Clock jump detected (mono +{:.0}s, wall +{:.0}s)",
                    mono_delta, wall_delta
                );
                self.clock_jump.store(true, Ordering::Relaxed);
            }
        }
        *r = Some((now_mono, now_wall));
    }

    /// Snapshot the current signals and reset the transient ones for the next
    /// interval. Returns None when nothing is worth reporting.
    pub fn take_report(&self) -> Option<TamperReport> {
        let report = TamperReport {
            process_restarted: self.process_restarted.swap(false, Ordering::Relaxed),
            clock_jump_detected: self.clock_jump.swap(false, Ordering::Relaxed),
            paused_seconds: self.paused_seconds.swap(0, Ordering::Relaxed),
            relaunched_by_watchdog: self.relaunched.swap(false, Ordering::Relaxed),
            watchdog_restarted: self.watchdog_restarted.swap(false, Ordering::Relaxed),
            server_unreachable_seconds: self.server_unreachable_seconds.swap(0, Ordering::Relaxed),
            autostart_restored: self.autostart_restored.swap(false, Ordering::Relaxed),
        };
        if report.has_signal() {
            Some(report)
        } else {
            None
        }
    }
}

impl Default for TamperState {
    fn default() -> Self {
        Self::new()
    }
}

/// Path of the currently-running executable.
pub fn current_exe() -> Option<std::path::PathBuf> {
    std::env::current_exe().ok()
}

// ---------------------------------------------------------------------------
// Self-heal auto-start (Windows)
// ---------------------------------------------------------------------------

/// Ensure the client has a logon auto-start entry; recreate it if a user removed
/// it. Prefers the HKCU Run key (no admin needed); the Scheduled Task created by
/// the admin installer is left as-is if present. Returns true if it restored one.
#[cfg(target_os = "windows")]
pub fn ensure_autostart(state: &TamperState) -> bool {
    let exe = match current_exe() {
        Some(p) => p,
        None => return false,
    };
    // If a scheduled task already exists, that's the admin-managed path — leave it.
    if scheduled_task_exists() {
        return false;
    }
    if run_key_present(&exe) {
        return false;
    }
    if set_run_key(&exe) {
        warn!("🔁 Auto-start entry was missing; restored HKCU Run key");
        state.mark_autostart_restored();
        return true;
    }
    false
}

#[cfg(target_os = "windows")]
pub fn scheduled_task_exists() -> bool {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    Command::new("schtasks")
        .args(["/query", "/tn", TASK_NAME, "/xml"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|output| {
            if !output.status.success() {
                return false;
            }
            // A legacy installer created a task that launched a short-lived VBS
            // wrapper. It exists, but cannot recover the real client process.
            // Only treat the new direct, stop-aware action as OS-owned recovery.
            let xml = String::from_utf8_lossy(&output.stdout).to_ascii_lowercase();
            xml.contains("monitoring-client.exe") && xml.contains("--scheduled")
        })
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn run_key_present(exe: &std::path::Path) -> bool {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    Command::new("reg")
        .args([
            "query",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            "/v",
            RUN_VALUE_NAME,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| {
            o.status.success()
                && String::from_utf8_lossy(&o.stdout).contains(&*exe.to_string_lossy())
        })
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn set_run_key(exe: &std::path::Path) -> bool {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    Command::new("reg")
        .args([
            "add",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            "/v",
            RUN_VALUE_NAME,
            "/t",
            "REG_SZ",
            "/d",
            &format!("\"{}\" --scheduled", exe.to_string_lossy()),
            "/f",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(not(target_os = "windows"))]
pub fn scheduled_task_exists() -> bool {
    false
}

#[cfg(not(target_os = "windows"))]
pub fn ensure_autostart(_state: &TamperState) -> bool {
    false
}

// ---------------------------------------------------------------------------
// Watchdog: mutual revival
// ---------------------------------------------------------------------------

/// Spawn a detached watchdog companion that will relaunch this process if it
/// dies. Called by the MAIN process. Returns the watchdog PID if spawned.
#[cfg(target_os = "windows")]
pub fn spawn_watchdog() -> Option<u32> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const DETACHED_PROCESS: u32 = 0x00000008;

    let client_exe = current_exe()?;
    let watchdog_exe = client_exe.parent()?.join(WATCHDOG_FILENAME);
    if !watchdog_exe.is_file() {
        warn!(
            "ScreenTime watchdog executable is missing: {}",
            watchdog_exe.display()
        );
        return None;
    }
    let main_pid = std::process::id();

    match Command::new(&watchdog_exe)
        .args([
            "--watch",
            &main_pid.to_string(),
            "--client",
            &client_exe.to_string_lossy(),
        ])
        .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
        .spawn()
    {
        Ok(child) => {
            let pid = child.id();
            info!("🛡️ Watchdog companion spawned (pid {})", pid);
            Some(pid)
        }
        Err(e) => {
            warn!("Failed to spawn watchdog: {}", e);
            None
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn spawn_watchdog() -> Option<u32> {
    None
}

/// The watchdog's main loop. Runs in the distinct ScreenTime Watchdog binary.
/// Watches the parent PID; when it disappears, relaunches the main agent, then
/// keeps watching the new instance. Exits if it is told to stop via a sentinel
/// file, so uninstall can cleanly end it.
#[cfg(target_os = "windows")]
pub fn run_watchdog_loop(client_exe: std::path::PathBuf, initial_pid: u32) -> ! {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // logger may not be initialized in the watchdog; use eprintln as a fallback.
    let mut watched_pid = initial_pid;

    const POLL: Duration = Duration::from_secs(5);
    // A single "parent looks gone" reading is NOT enough to relaunch: on
    // sleep/resume the parent can transiently drop off `tasklist` while it wakes,
    // which previously caused a spurious relaunch → a SECOND agent instance.
    // Require several consecutive misses before concluding the parent truly died.
    const MISSES_BEFORE_RELAUNCH: u32 = 3;
    let mut consecutive_misses: u32 = 0;

    // Sleep/resume detection: compare monotonic vs wall time across each poll.
    // A frozen laptop pauses the monotonic clock too, but wall time jumps far
    // ahead on resume. When we detect that gap we treat this cycle as a
    // just-resumed cycle and let the parent settle instead of judging liveness.
    let mut last_wall = SystemTime::now();

    loop {
        std::thread::sleep(POLL);

        // Clean-exit hook for uninstallers and deliberate `--stop`. Honors both
        // the temp watchdog marker and the durable stop marker so the watchdog
        // never relaunches an agent the user has explicitly stopped.
        if stop_requested() {
            std::process::exit(0);
        }

        // Did we just come back from sleep/hibernate? If wall time advanced much
        // more than our ~5s poll, the machine was suspended. Give the parent time
        // to wake before we trust any liveness reading, and reset the miss count
        // so a pre-sleep miss doesn't combine with a post-resume glitch.
        let now_wall = SystemTime::now();
        let wall_advance = now_wall
            .duration_since(last_wall)
            .unwrap_or(Duration::ZERO)
            .as_secs();
        last_wall = now_wall;
        if wall_advance > 30 {
            eprintln!(
                "[watchdog] resume detected (~{}s gap) — deferring liveness check",
                wall_advance
            );
            consecutive_misses = 0;
            // Let the OS finish resuming processes before we poll again.
            std::thread::sleep(Duration::from_secs(10));
            continue;
        }

        if watched_pid != 0 && process_alive(watched_pid) {
            consecutive_misses = 0;
            continue;
        }

        // Parent appears gone. Debounce: only relaunch after several consecutive
        // misses, re-checking quickly between them so a transient tasklist glitch
        // does not trigger a duplicate agent.
        consecutive_misses += 1;
        if consecutive_misses < MISSES_BEFORE_RELAUNCH {
            eprintln!(
                "[watchdog] parent not seen ({}/{}) — re-checking before relaunch",
                consecutive_misses, MISSES_BEFORE_RELAUNCH
            );
            std::thread::sleep(Duration::from_secs(2));
            continue;
        }

        // Parent confirmed gone — relaunch the main agent (without the watchdog
        // env, so it starts as a normal agent and spawns a fresh watchdog of its
        // own). The relaunched agent's single-instance mutex is the final guard:
        // if the original is somehow still alive, the new one exits immediately.
        match Command::new(&client_exe)
            .env("VIBGYOR_RELAUNCHED", "1")
            .env(WATCHDOG_PID_ENV, std::process::id().to_string())
            .creation_flags(CREATE_NO_WINDOW | 0x00000008)
            .spawn()
        {
            Ok(child) => {
                watched_pid = child.id();
                eprintln!("[watchdog] relaunched main agent as pid {}", watched_pid);
                // Stay attached to the newly launched client. It receives this
                // watchdog PID through the environment and adopts us instead of
                // spawning a duplicate companion.
                consecutive_misses = 0;
            }
            Err(e) => {
                eprintln!("[watchdog] failed to relaunch: {}", e);
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn run_watchdog_loop(_client_exe: std::path::PathBuf, _initial_pid: u32) -> ! {
    loop {
        std::thread::sleep(Duration::from_secs(60));
    }
}

/// Path used as a stop-signal for the watchdog (uninstaller creates it).
pub fn watchdog_stop_marker() -> std::path::PathBuf {
    std::env::temp_dir().join("vibgyorseek_watchdog_stop")
}

/// Durable stop-signal that BOTH the running agent's main loop and the watchdog
/// poll. Placed under LOCALAPPDATA (not %TEMP%) so it isn't wiped by temp
/// cleaners between the moment `--stop` writes it and the agent noticing it.
/// This is the mechanism behind a clean, deliberate `monitoring-client.exe --stop`.
pub fn stop_marker() -> std::path::PathBuf {
    let base = std::env::var("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
    base.join("VibgyorSeek").join("stop.signal")
}

/// True if a deliberate stop has been requested (marker present).
pub fn stop_requested() -> bool {
    stop_marker().exists() || watchdog_stop_marker().exists()
}

/// Request a clean, deliberate shutdown of the whole client (agent + watchdog).
/// Writes both stop markers so whichever process checks first will exit, and
/// the other follows. Returns Ok once the signal is on disk.
pub fn request_stop() -> std::io::Result<()> {
    let marker = stop_marker();
    if let Some(parent) = marker.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&marker, "stop")?;
    // Also drop the watchdog's temp marker so a currently-running watchdog that
    // only polls the temp path exits immediately too.
    let _ = std::fs::write(watchdog_stop_marker(), "stop");
    Ok(())
}

/// Clear all stop markers so a subsequent legitimate start isn't immediately
/// told to shut down again. Called once the agent has honored the stop, and on
/// a normal fresh start.
pub fn clear_stop_markers() {
    let _ = std::fs::remove_file(stop_marker());
    let _ = std::fs::remove_file(watchdog_stop_marker());
}

/// Check whether a PID is still alive (Windows).
#[cfg(target_os = "windows")]
pub fn process_alive(pid: u32) -> bool {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    // tasklist filter is reliable and needs no special privileges.
    Command::new("tasklist")
        .args(["/FI", &format!("PID eq {}", pid), "/NH"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()))
        .unwrap_or(true) // fail-open: assume alive rather than relaunch-storm
}

#[cfg(not(target_os = "windows"))]
pub fn process_alive(_pid: u32) -> bool {
    true
}

/// True if this process was started by the watchdog after a kill.
pub fn was_relaunched() -> bool {
    std::env::var("VIBGYOR_RELAUNCHED").is_ok()
}

/// Restart-marker file: written on clean start, checked next start to detect an
/// unclean prior exit (process was killed rather than shut down gracefully).
pub fn restart_marker() -> std::path::PathBuf {
    std::env::temp_dir().join("vibgyorseek_running.marker")
}

/// Returns true if the previous run did not exit cleanly (marker still present).
pub fn detect_unclean_prior_exit() -> bool {
    let m = restart_marker();
    let existed = m.exists();
    // (Re)create the marker for this run.
    let _ = std::fs::write(&m, std::process::id().to_string());
    if existed {
        debug!("Prior run did not remove its marker — treating as restart/kill");
    }
    existed
}

/// Remove the restart marker on graceful shutdown.
pub fn clear_restart_marker() {
    let _ = std::fs::remove_file(restart_marker());
}
