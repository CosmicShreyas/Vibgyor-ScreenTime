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
use crate::modules::types::ActivityState;
use parking_lot::RwLock;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{debug, info, warn};

#[cfg(target_os = "windows")]
use winapi::um::winuser::{GetLastInputInfo, LASTINPUTINFO};
#[cfg(target_os = "windows")]
use winapi::um::sysinfoapi::GetTickCount;

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
            #[cfg(target_os = "windows")]
            last_tick_count: Arc::new(RwLock::new(0)),
        })
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
        info!("Starting activity tracker with idle threshold: {:?}", self.idle_threshold);
        info!("✅ Using Windows GetLastInputInfo() API - no admin permissions required");
        
        // Clone Arc references for the polling thread
        let last_activity_time = Arc::clone(&self.last_activity_time);
        let state = Arc::clone(&self.state);
        let work_seconds = Arc::clone(&self.work_seconds);
        let idle_seconds = Arc::clone(&self.idle_seconds);
        let interval_start_time = Arc::clone(&self.interval_start_time);
        let idle_threshold = self.idle_threshold;
        let running_flag = Arc::clone(&self.running);
        
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
                                // User is idle, update cumulative time
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
        
        // Transition to WORK state if currently IDLE
        let mut current_state = state.write();
        if *current_state == ActivityState::Idle {
            debug!("State transition: IDLE -> WORK");
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
            // We should be in IDLE state
            if *current_state == ActivityState::Work {
                // Transition from WORK to IDLE
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
        
        debug!("Activity data: work={}s, idle={}s, state={:?}, time_since_activity={:?}", 
               work.round() as u64, idle.round() as u64, actual_state, time_since_activity);
        
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
                    "GetLastInputInfo failed".to_string()
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
            "Windows API not available on this platform".to_string()
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
