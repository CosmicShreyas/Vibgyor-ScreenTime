//! Activity tracking module
//!
//! Monitors keyboard and mouse input events to determine user activity state.
//! Maintains two states: WORK (active) and IDLE (inactive) based on input events
//! and a configurable idle threshold.
//!
//! On Windows, uses GetLastInputInfo() API which doesn't require admin permissions.
//! This is polled periodically to detect idle time.
//!
//! Requirements: REQ-1.1, REQ-1.2, REQ-1.3, REQ-1.4, REQ-1.5

use crate::modules::error::{MonitoringError, Result};
use crate::modules::genuineness::{self, DetectionConfig, ScoreContext};
use crate::modules::idle_prompt::{self, ReasonSlot};
use crate::modules::input_analyzer::{EventKind, InputAnalyzer};
use crate::modules::types::{ActivityData, ActivityState};
use parking_lot::RwLock;
use std::sync::{atomic::AtomicBool, Arc};
use std::time::{Duration, Instant};
use tracing::{debug, info, warn};

/// Privacy-safe intensity + genuineness counters accumulated over an interval.
#[derive(Debug, Default, Clone)]
struct IntensityCounters {
    keystrokes: u64,
    mouse_clicks: u64,
    mouse_distance_px: u64,
    scroll_events: u64,
    /// Seconds of input judged fake (auto-clicker/jiggler) this interval.
    suspected_fake_seconds: f64,
    /// Running average genuineness (0-100) weighted by scored windows.
    genuineness_sum: f64,
    genuineness_windows: u64,
    /// Deduplicated suspicion reasons seen this interval.
    reasons: Vec<String>,
    /// High-water mark of event timestamp already consumed from the analyzer
    /// buffer, so counters don't double-count across polls (ms).
    last_consumed_t_ms: u64,
}

#[cfg(target_os = "windows")]
use winapi::um::sysinfoapi::GetTickCount;
#[cfg(target_os = "windows")]
use winapi::um::winuser::{GetLastInputInfo, LASTINPUTINFO};

/// Activity tracker that monitors keyboard and mouse events
///
/// The tracker maintains a state machine with two states:
/// - WORK: User is actively providing input
/// - IDLE: No input detected for idle_threshold duration
///
/// Cumulative work and idle time are tracked per interval and can be reset.
///
/// On Windows, uses GetLastInputInfo() API which polls for last input time.
/// This doesn't require admin permissions unlike event-based approaches.
#[derive(Debug)]
pub struct ActivityTracker {
    /// Current activity state
    state: Arc<RwLock<ActivityState>>,

    /// Last time any input activity was detected
    last_activity_time: Arc<RwLock<Instant>>,

    /// Cumulative work seconds in current interval
    work_seconds: Arc<RwLock<f64>>,

    /// Cumulative idle seconds in current interval
    idle_seconds: Arc<RwLock<f64>>,

    /// Start time of current interval
    interval_start_time: Arc<RwLock<Instant>>,

    /// Idle threshold duration
    idle_threshold: Duration,

    /// Flag indicating if monitoring is active
    running: Arc<RwLock<bool>>,

    /// Input analyzer (anti-cheat). Present even when detection is disabled;
    /// it simply isn't started in that case.
    input_analyzer: Arc<InputAnalyzer>,

    /// Genuine-activity detection configuration.
    detection: DetectionConfig,

    /// Accumulated intensity + genuineness counters for the current interval.
    counters: Arc<RwLock<IntensityCounters>>,

    /// Minutes of idle after which a return-from-idle reason prompt fires (0 = off).
    idle_reason_prompt_minutes: u32,

    /// Shared slot holding the captured idle reason for the next payload.
    reason_slot: ReasonSlot,

    /// Prevents overlapping reason dialogs when one is already active.
    idle_prompt_in_flight: Arc<AtomicBool>,

    /// Last system tick count (Windows only)
    #[cfg(target_os = "windows")]
    last_tick_count: Arc<RwLock<u32>>,
}

impl ActivityTracker {
    /// Create a new activity tracker
    ///
    /// # Arguments
    /// * `idle_threshold_seconds` - Number of seconds without input before transitioning to IDLE
    ///
    /// # Returns
    /// * `Result<ActivityTracker>` - New activity tracker instance
    ///
    /// # Errors
    /// * Returns error if idle_threshold_seconds is 0
    pub fn new(idle_threshold_seconds: u32) -> Result<Self> {
        // Detection disabled by default for the simple constructor (used in tests).
        let mut det = DetectionConfig::default();
        det.enabled = false;
        Self::new_with_detection(idle_threshold_seconds, det, 0)
    }

    /// Create an activity tracker with genuine-activity detection configured.
    pub fn new_with_detection(
        idle_threshold_seconds: u32,
        detection: DetectionConfig,
        idle_reason_prompt_minutes: u32,
    ) -> Result<Self> {
        if idle_threshold_seconds == 0 {
            return Err(MonitoringError::ActivityTracking(
                "idle_threshold_seconds must be positive".to_string(),
            ));
        }

        let now = Instant::now();

        Ok(Self {
            state: Arc::new(RwLock::new(ActivityState::Work)),
            last_activity_time: Arc::new(RwLock::new(now)),
            work_seconds: Arc::new(RwLock::new(0.0)),
            idle_seconds: Arc::new(RwLock::new(0.0)),
            interval_start_time: Arc::new(RwLock::new(now)),
            idle_threshold: Duration::from_secs(idle_threshold_seconds as u64),
            running: Arc::new(RwLock::new(false)),
            input_analyzer: Arc::new(InputAnalyzer::new()),
            detection,
            counters: Arc::new(RwLock::new(IntensityCounters::default())),
            idle_reason_prompt_minutes,
            reason_slot: idle_prompt::new_slot(),
            idle_prompt_in_flight: Arc::new(AtomicBool::new(false)),
            #[cfg(target_os = "windows")]
            last_tick_count: Arc::new(RwLock::new(0)),
        })
    }

    /// Read-and-clear the captured idle reason (called by the payload builder).
    pub fn take_idle_reason(&self) -> Option<String> {
        idle_prompt::take_reason(&self.reason_slot)
    }

    /// Start monitoring keyboard and mouse activity
    ///
    /// On Windows, spawns a background thread that polls GetLastInputInfo() API.
    /// This doesn't require admin permissions.
    pub fn start(&self) -> Result<()> {
        let mut running = self.running.write();
        if *running {
            warn!("Activity tracker already running");
            return Ok(());
        }

        *running = true;
        info!(
            "Starting activity tracker with idle threshold: {:?}",
            self.idle_threshold
        );
        info!("✅ Using Windows GetLastInputInfo() API - no admin permissions required");

        // Start the input analyzer for genuine-activity detection, if enabled.
        if self.detection.enabled {
            self.input_analyzer.start();
            info!(
                "✅ Genuine-activity detection enabled (window={}s, flag>={})",
                self.detection.window_seconds, self.detection.flag_threshold
            );
        }

        // Clone Arc references for the polling thread
        let last_activity_time = Arc::clone(&self.last_activity_time);
        let state = Arc::clone(&self.state);
        let work_seconds = Arc::clone(&self.work_seconds);
        let idle_seconds = Arc::clone(&self.idle_seconds);
        let interval_start_time = Arc::clone(&self.interval_start_time);
        let idle_threshold = self.idle_threshold;
        let running_flag = Arc::clone(&self.running);
        let analyzer = Arc::clone(&self.input_analyzer);
        let detection = self.detection.clone();
        let counters = Arc::clone(&self.counters);
        let reason_slot = Arc::clone(&self.reason_slot);
        let idle_prompt_in_flight = Arc::clone(&self.idle_prompt_in_flight);
        let idle_reason_prompt_minutes = self.idle_reason_prompt_minutes;
        // Tracks the longest idle observed since the last activity, so we can
        // decide whether to prompt on return.
        let idle_run_ms = Arc::new(RwLock::new(0u64));

        #[cfg(target_os = "windows")]
        let last_tick_count = Arc::clone(&self.last_tick_count);

        // Spawn polling thread
        std::thread::spawn(move || {
            info!("🎯 Activity tracker polling thread started");

            #[cfg(target_os = "windows")]
            {
                // Initialize last tick count
                *last_tick_count.write() = unsafe { GetTickCount() };

                while *running_flag.read() {
                    // Poll every 500ms for responsive detection
                    std::thread::sleep(Duration::from_millis(500));

                    // Get idle time from Windows API
                    match Self::get_windows_idle_time_static() {
                        Ok(idle_ms) => {
                            let idle_duration = Duration::from_millis(idle_ms);

                            // If idle time is very small, user is active
                            if idle_duration < Duration::from_secs(1) {
                                // Returning from idle: if the preceding idle run was
                                // long enough, prompt for a reason (non-blocking).
                                if idle_reason_prompt_minutes > 0 {
                                    let prior_idle_ms = *idle_run_ms.read();
                                    let threshold_ms = idle_reason_prompt_minutes as u64 * 60_000;
                                    if prior_idle_ms >= threshold_ms {
                                        idle_prompt::prompt_async(
                                            Arc::clone(&reason_slot),
                                            Arc::clone(&idle_prompt_in_flight),
                                            prior_idle_ms / 60_000,
                                        );
                                    }
                                }
                                *idle_run_ms.write() = 0;

                                // Activity detected
                                Self::on_activity(
                                    &last_activity_time,
                                    &state,
                                    &work_seconds,
                                    &idle_seconds,
                                    &interval_start_time,
                                    idle_threshold,
                                );
                            } else {
                                // User is idle: grow the idle-run counter and update time.
                                *idle_run_ms.write() = idle_ms;
                                let current_time = Instant::now();
                                Self::update_cumulative_time_internal(
                                    &current_time,
                                    &last_activity_time,
                                    &state,
                                    &work_seconds,
                                    &idle_seconds,
                                    &interval_start_time,
                                    idle_threshold,
                                );
                            }
                        }
                        Err(e) => {
                            warn!("⚠️  Failed to get Windows idle time: {}", e);
                        }
                    }

                    // Genuine-activity scoring + intensity accumulation.
                    if detection.enabled && analyzer.is_active() {
                        Self::accumulate_and_score(&analyzer, &detection, &counters, &state);
                    }
                }
            }

            #[cfg(not(target_os = "windows"))]
            {
                warn!("Activity tracking not implemented for this platform");
                warn!("Only Windows is currently supported");
            }

            info!("🎯 Activity tracker polling thread stopped");
        });

        debug!("Activity tracker started successfully");
        Ok(())
    }

    /// Stop monitoring keyboard and mouse activity
    pub fn stop(&self) {
        let mut running = self.running.write();
        if !*running {
            return;
        }

        *running = false;
        self.input_analyzer.stop();
        info!("Activity tracker stopped");
    }

    /// Internal callback for activity events
    ///
    /// Updates last activity time and transitions to WORK state if needed.
    fn on_activity(
        last_activity_time: &Arc<RwLock<Instant>>,
        state: &Arc<RwLock<ActivityState>>,
        work_seconds: &Arc<RwLock<f64>>,
        idle_seconds: &Arc<RwLock<f64>>,
        interval_start_time: &Arc<RwLock<Instant>>,
        idle_threshold: Duration,
    ) {
        let current_time = Instant::now();

        // Update cumulative time before state change
        Self::update_cumulative_time_internal(
            &current_time,
            last_activity_time,
            state,
            work_seconds,
            idle_seconds,
            interval_start_time,
            idle_threshold,
        );

        // Update last activity time
        *last_activity_time.write() = current_time;

        // Any real input returns us to WORK. If the previous window was flagged
        // as fake, the scorer will re-flag it on the next scoring pass; we don't
        // want a stale SuspectedFake to persist once genuine input resumes.
        let mut current_state = state.write();
        if *current_state != ActivityState::Work {
            debug!("State transition: {:?} -> WORK", *current_state);
            *current_state = ActivityState::Work;
        }
    }

    /// Update cumulative work and idle time based on current state
    fn update_cumulative_time_internal(
        current_time: &Instant,
        last_activity_time: &Arc<RwLock<Instant>>,
        state: &Arc<RwLock<ActivityState>>,
        work_seconds: &Arc<RwLock<f64>>,
        idle_seconds: &Arc<RwLock<f64>>,
        interval_start_time: &Arc<RwLock<Instant>>,
        idle_threshold: Duration,
    ) {
        let interval_start = *interval_start_time.read();
        let time_delta = current_time.duration_since(interval_start).as_secs_f64();

        if time_delta <= 0.0 {
            return;
        }

        let last_activity = *last_activity_time.read();
        let time_since_activity = current_time.duration_since(last_activity);

        let mut current_state = state.write();

        if time_since_activity >= idle_threshold {
            // We should be in IDLE state. Both Work and SuspectedFake are "active"
            // live states that transition to Idle when input stops.
            if *current_state != ActivityState::Idle {
                // Transition from active to IDLE
                // Calculate when we became idle
                let idle_start_time = last_activity + idle_threshold;

                // Time from interval start to idle start is work time
                if idle_start_time > interval_start {
                    let work_time = idle_start_time.duration_since(interval_start).as_secs_f64();
                    if work_time > 0.0 {
                        *work_seconds.write() += work_time;
                    }
                }

                // Time from idle start to now is idle time
                if *current_time > idle_start_time {
                    let idle_time = current_time.duration_since(idle_start_time).as_secs_f64();
                    if idle_time > 0.0 {
                        *idle_seconds.write() += idle_time;
                    }
                }

                debug!("State transition: WORK -> IDLE (threshold exceeded)");
                *current_state = ActivityState::Idle;
            } else {
                // Already IDLE, add all time as idle
                *idle_seconds.write() += time_delta;
            }
        } else {
            // Still active, add all time as work
            *work_seconds.write() += time_delta;
        }

        // Reset interval start time to current time
        *interval_start_time.write() = *current_time;
    }

    /// Consume new input events from the analyzer, update intensity counters,
    /// score the recent window for genuineness, and (if flagged) accumulate
    /// suspected-fake time and reasons. Runs on the polling thread (~2Hz).
    fn accumulate_and_score(
        analyzer: &Arc<InputAnalyzer>,
        detection: &DetectionConfig,
        counters: &Arc<RwLock<IntensityCounters>>,
        state: &Arc<RwLock<ActivityState>>,
    ) {
        // 1) Update raw intensity counters from events NOT yet consumed.
        let all = analyzer.snapshot(detection.window_seconds.saturating_mul(1000).max(1000));
        {
            let mut c = counters.write();
            let last = c.last_consumed_t_ms;
            let mut max_t = last;
            for e in all.iter().filter(|e| e.t_ms > last) {
                match e.kind {
                    EventKind::Key => c.keystrokes += 1,
                    EventKind::MouseClick => c.mouse_clicks += 1,
                    EventKind::Scroll => c.scroll_events += 1,
                    EventKind::MouseMove => {
                        // Manhattan distance is a fine, cheap proxy for effort.
                        c.mouse_distance_px += (e.dx.unsigned_abs() + e.dy.unsigned_abs()) as u64;
                    }
                }
                if e.t_ms > max_t {
                    max_t = e.t_ms;
                }
            }
            c.last_consumed_t_ms = max_t;
        }

        // 2) Score the recent window.
        let window = analyzer.snapshot(detection.window_seconds.saturating_mul(1000).max(1000));
        // Foreground-change context is best-effort; we don't have it here, so
        // report "changed" (true) to avoid over-penalizing via signal 5, which
        // is intended only as a corroborating signal when we KNOW it didn't change.
        let ctx = ScoreContext {
            foreground_changed: true,
        };
        if let Some(verdict) = genuineness::score(&window, detection, ctx) {
            let mut c = counters.write();
            c.genuineness_sum += verdict.genuineness as f64;
            c.genuineness_windows += 1;
            if verdict.flagged {
                // This ~0.5s poll's worth of input is fake.
                c.suspected_fake_seconds += 0.5;
                for r in verdict.reasons {
                    if !c.reasons.contains(&r) {
                        c.reasons.push(r);
                    }
                }
                // Reflect in live state so current_state() can report it.
                let mut s = state.write();
                if *s == ActivityState::Work {
                    *s = ActivityState::SuspectedFake;
                }
            }
        }
    }

    /// Build the full activity payload for the current interval, including
    /// intensity metrics and genuineness verdict (privacy-safe counts only).
    pub fn get_activity_payload(&self) -> ActivityData {
        let (work, idle, _state) = self.get_activity_data();

        if !self.detection.enabled {
            return ActivityData::basic(work, idle);
        }

        let c = self.counters.read();
        // Interval length in minutes for rate calculations.
        let interval_secs = (work + idle).max(1) as f64;
        let minutes = (interval_secs / 60.0).max(1.0 / 60.0);

        let fake = c.suspected_fake_seconds.round() as u64;
        // Suspected-fake time is counted as idle, so subtract it from work.
        let adj_work = work.saturating_sub(fake);
        let adj_idle = idle + fake.min(work);

        let genuineness = if c.genuineness_windows > 0 {
            (c.genuineness_sum / c.genuineness_windows as f64).round() as u8
        } else {
            100
        };

        ActivityData {
            work_seconds: adj_work,
            idle_seconds: adj_idle,
            keystrokes: Some(c.keystrokes),
            mouse_clicks: Some(c.mouse_clicks),
            mouse_distance_px: Some(c.mouse_distance_px),
            scroll_events: Some(c.scroll_events),
            keystrokes_per_min: Some((c.keystrokes as f64 / minutes * 10.0).round() / 10.0),
            mouse_activity_per_min: Some(
                ((c.mouse_clicks + c.scroll_events) as f64 / minutes * 10.0).round() / 10.0,
            ),
            suspected_fake_seconds: Some(fake),
            genuineness_score: Some(genuineness),
            suspicion_reasons: c.reasons.clone(),
        }
    }

    /// Update cumulative time (public method)
    fn update_cumulative_time(&self) {
        let current_time = Instant::now();
        Self::update_cumulative_time_internal(
            &current_time,
            &self.last_activity_time,
            &self.state,
            &self.work_seconds,
            &self.idle_seconds,
            &self.interval_start_time,
            self.idle_threshold,
        );
    }

    /// Get cumulative activity data for the current interval
    ///
    /// # Returns
    /// * `(work_seconds, idle_seconds, current_state)` - Tuple of activity data
    pub fn get_activity_data(&self) -> (u64, u64, ActivityState) {
        // Update cumulative time before returning
        self.update_cumulative_time();

        // Check current state based on time since last activity
        let current_time = Instant::now();
        let last_activity = *self.last_activity_time.read();
        let time_since_activity = current_time.duration_since(last_activity);

        // Determine actual current state
        let actual_state = if time_since_activity >= self.idle_threshold {
            ActivityState::Idle
        } else {
            ActivityState::Work
        };

        let work = *self.work_seconds.read();
        let idle = *self.idle_seconds.read();

        debug!(
            "Activity data: work={}s, idle={}s, state={:?}, time_since_activity={:?}",
            work.round() as u64,
            idle.round() as u64,
            actual_state,
            time_since_activity
        );

        (work.round() as u64, idle.round() as u64, actual_state)
    }

    /// Get idle time from Windows API (static version for use in thread)
    #[cfg(target_os = "windows")]
    fn get_windows_idle_time_static() -> Result<u64> {
        unsafe {
            let mut last_input_info = LASTINPUTINFO {
                cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
                dwTime: 0,
            };

            if GetLastInputInfo(&mut last_input_info) == 0 {
                return Err(MonitoringError::Platform(
                    "GetLastInputInfo failed".to_string(),
                ));
            }

            let current_tick = GetTickCount();

            // Handle tick count rollover (happens every 49.7 days)
            let idle_ms = if current_tick >= last_input_info.dwTime {
                current_tick.saturating_sub(last_input_info.dwTime) as u64
            } else {
                // Rollover occurred
                let max_u32 = u32::MAX as u64;
                max_u32 - last_input_info.dwTime as u64 + current_tick as u64
            };

            Ok(idle_ms)
        }
    }

    /// Get idle time (non-Windows platforms)
    #[cfg(not(target_os = "windows"))]
    fn get_windows_idle_time_static() -> Result<u64> {
        Err(MonitoringError::Platform(
            "Windows API not available on this platform".to_string(),
        ))
    }

    /// Reset the activity counters for a new interval
    ///
    /// Preserves the current state and last activity time.
    pub fn reset_interval(&self) {
        let current_time = Instant::now();

        // Update cumulative time before reset
        self.update_cumulative_time();

        // Reset counters
        *self.work_seconds.write() = 0.0;
        *self.idle_seconds.write() = 0.0;
        *self.interval_start_time.write() = current_time;

        // Reset intensity/genuineness counters for the new interval, but keep the
        // analyzer's consumed-watermark so we don't re-count old events.
        {
            let last = self.counters.read().last_consumed_t_ms;
            let mut fresh = IntensityCounters::default();
            fresh.last_consumed_t_ms = last;
            *self.counters.write() = fresh;
        }

        debug!("Activity interval reset");
    }

    /// Get the current activity state
    ///
    /// # Returns
    /// * `ActivityState` - Current state (WORK or IDLE)
    pub fn current_state(&self) -> ActivityState {
        let current_time = Instant::now();
        let last_activity = *self.last_activity_time.read();
        let time_since_activity = current_time.duration_since(last_activity);

        if time_since_activity >= self.idle_threshold {
            ActivityState::Idle
        } else {
            ActivityState::Work
        }
    }

    /// Check if the tracker is currently running
    pub fn is_running(&self) -> bool {
        *self.running.read()
    }
}

impl Drop for ActivityTracker {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn test_new_activity_tracker() {
        let tracker = ActivityTracker::new(300).unwrap();
        assert_eq!(tracker.current_state(), ActivityState::Work);
        assert!(!tracker.is_running());
    }

    #[test]
    fn test_new_with_zero_threshold() {
        let result = ActivityTracker::new(0);
        assert!(result.is_err());
    }

    #[test]
    fn test_initial_state() {
        let tracker = ActivityTracker::new(300).unwrap();
        let (work, idle, state) = tracker.get_activity_data();

        assert_eq!(work, 0);
        assert_eq!(idle, 0);
        assert_eq!(state, ActivityState::Work);
    }

    #[test]
    fn test_reset_interval() {
        let tracker = ActivityTracker::new(300).unwrap();

        // Simulate some time passing (more than 1 second)
        thread::sleep(Duration::from_millis(1100));

        let (work1, _, _) = tracker.get_activity_data();
        assert!(work1 >= 1);

        // Reset interval
        tracker.reset_interval();

        let (work2, idle2, _) = tracker.get_activity_data();
        assert_eq!(work2, 0);
        assert_eq!(idle2, 0);
    }

    #[test]
    fn test_idle_threshold_transition() {
        let tracker = ActivityTracker::new(1).unwrap(); // 1 second threshold

        // Initially in WORK state
        assert_eq!(tracker.current_state(), ActivityState::Work);

        // Wait for idle threshold to pass
        thread::sleep(Duration::from_millis(1200));

        // Should transition to IDLE
        assert_eq!(tracker.current_state(), ActivityState::Idle);
    }

    #[test]
    fn test_cumulative_time_tracking() {
        let tracker = ActivityTracker::new(300).unwrap();

        // Wait more than 1 second
        thread::sleep(Duration::from_millis(1100));

        let (work, idle, _) = tracker.get_activity_data();

        // Should have accumulated at least 1 second of work time
        assert!(work >= 1);
        assert_eq!(idle, 0);
    }

    #[test]
    fn test_start_stop() {
        let tracker = ActivityTracker::new(300).unwrap();

        assert!(!tracker.is_running());

        tracker.start().unwrap();
        assert!(tracker.is_running());

        tracker.stop();
        // Note: is_running() might still be true briefly due to thread timing
    }

    #[test]
    fn test_start_already_running() {
        let tracker = ActivityTracker::new(300).unwrap();

        tracker.start().unwrap();
        let result = tracker.start();

        // Should not error when starting already running tracker
        assert!(result.is_ok());

        tracker.stop();
    }
}
