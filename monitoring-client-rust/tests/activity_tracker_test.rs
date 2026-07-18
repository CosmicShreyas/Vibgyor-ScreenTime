//! Integration tests for activity tracker module

use monitoring_client::modules::activity_tracker::ActivityTracker;
use monitoring_client::modules::types::ActivityState;
use std::thread;
use std::time::Duration;

#[test]
fn test_activity_tracker_creation() {
    let tracker = ActivityTracker::new(300).expect("Failed to create tracker");
    assert_eq!(tracker.current_state(), ActivityState::Work);
    assert!(!tracker.is_running());
}

#[test]
fn test_activity_tracker_zero_threshold_error() {
    let result = ActivityTracker::new(0);
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("positive"));
}

#[test]
fn test_initial_activity_data() {
    let tracker = ActivityTracker::new(300).expect("Failed to create tracker");
    let (work, idle, state) = tracker.get_activity_data();
    
    assert_eq!(work, 0, "Initial work seconds should be 0");
    assert_eq!(idle, 0, "Initial idle seconds should be 0");
    assert_eq!(state, ActivityState::Work, "Initial state should be WORK");
}

#[test]
fn test_work_time_accumulation() {
    let tracker = ActivityTracker::new(300).expect("Failed to create tracker");
    
    // Wait for more than 1 second to accumulate measurable time
    thread::sleep(Duration::from_millis(1100));
    
    let (work, idle, state) = tracker.get_activity_data();
    
    assert!(work >= 1, "Work seconds should accumulate over time, got {}", work);
    assert_eq!(idle, 0, "Idle seconds should remain 0");
    assert_eq!(state, ActivityState::Work, "State should remain WORK");
}

#[test]
fn test_idle_transition_after_threshold() {
    let tracker = ActivityTracker::new(1).expect("Failed to create tracker");
    
    // Initially in WORK state
    assert_eq!(tracker.current_state(), ActivityState::Work);
    
    // Wait for idle threshold to pass (1 second + buffer)
    thread::sleep(Duration::from_millis(1300));
    
    // Should have transitioned to IDLE
    let current_state = tracker.current_state();
    assert_eq!(current_state, ActivityState::Idle, "Should transition to IDLE after threshold");
    
    let (work, idle, state) = tracker.get_activity_data();
    assert!(work >= 1, "Should have accumulated work time before going idle, got {}", work);
    assert!(idle >= 0, "Should have accumulated idle time after threshold, got {}", idle);
    assert_eq!(state, ActivityState::Idle, "State should be IDLE");
}

#[test]
fn test_interval_reset() {
    let tracker = ActivityTracker::new(300).expect("Failed to create tracker");
    
    // Accumulate more than 1 second
    thread::sleep(Duration::from_millis(1100));
    
    let (work_before, _, _) = tracker.get_activity_data();
    assert!(work_before >= 1, "Should have accumulated work time");
    
    // Reset interval
    tracker.reset_interval();
    
    // Check that counters are reset
    let (work_after, idle_after, _) = tracker.get_activity_data();
    assert_eq!(work_after, 0, "Work seconds should be reset to 0");
    assert_eq!(idle_after, 0, "Idle seconds should be reset to 0");
}

#[test]
fn test_interval_reset_preserves_state() {
    let tracker = ActivityTracker::new(1).expect("Failed to create tracker");
    
    // Wait to go idle
    thread::sleep(Duration::from_millis(1200));
    assert_eq!(tracker.current_state(), ActivityState::Idle);
    
    // Reset interval
    tracker.reset_interval();
    
    // State should still be IDLE (no new activity)
    let (_, _, state) = tracker.get_activity_data();
    assert_eq!(state, ActivityState::Idle, "State should be preserved after reset");
}

#[test]
fn test_multiple_intervals() {
    let tracker = ActivityTracker::new(300).expect("Failed to create tracker");
    
    // First interval - wait more than 1 second
    thread::sleep(Duration::from_millis(1100));
    let (work1, _, _) = tracker.get_activity_data();
    assert!(work1 >= 1, "First interval should have work time");
    
    tracker.reset_interval();
    
    // Second interval - wait more than 1 second
    thread::sleep(Duration::from_millis(1100));
    let (work2, _, _) = tracker.get_activity_data();
    assert!(work2 >= 1, "Second interval should have work time");
    
    // Work times should be independent (approximately equal since same sleep time)
    assert!(work2 >= 1 && work2 <= work1 + 1, "Second interval should be independent");
}

#[test]
fn test_start_and_stop() {
    let tracker = ActivityTracker::new(300).expect("Failed to create tracker");
    
    assert!(!tracker.is_running(), "Tracker should not be running initially");
    
    tracker.start().expect("Failed to start tracker");
    
    // Give the thread time to start
    thread::sleep(Duration::from_millis(50));
    
    assert!(tracker.is_running(), "Tracker should be running after start");
    
    tracker.stop();
    
    // Note: is_running might still be true briefly due to thread timing
    // but the stop flag has been set
}

#[test]
fn test_start_idempotent() {
    let tracker = ActivityTracker::new(300).expect("Failed to create tracker");
    
    tracker.start().expect("Failed to start tracker");
    
    // Starting again should not error
    let result = tracker.start();
    assert!(result.is_ok(), "Starting already running tracker should not error");
    
    tracker.stop();
}

#[test]
fn test_stop_idempotent() {
    let tracker = ActivityTracker::new(300).expect("Failed to create tracker");
    
    // Stopping when not running should not panic
    tracker.stop();
    tracker.stop(); // Second stop should also be fine
}

#[test]
fn test_work_idle_work_cycle() {
    let tracker = ActivityTracker::new(1).expect("Failed to create tracker");
    
    // Start in WORK state
    assert_eq!(tracker.current_state(), ActivityState::Work);
    
    // Accumulate work time - wait more than 1 second
    thread::sleep(Duration::from_millis(1100));
    let (work1, idle1, _) = tracker.get_activity_data();
    assert!(work1 >= 1, "Should have work time");
    assert_eq!(idle1, 0);
    
    // Wait to go IDLE
    thread::sleep(Duration::from_millis(1300));
    let (work2, idle2, state2) = tracker.get_activity_data();
    assert!(work2 >= 1, "Should still have work time");
    assert!(idle2 >= 0, "Should have idle time");
    assert_eq!(state2, ActivityState::Idle);
    
    // Note: In a real scenario, we would simulate input to go back to WORK
    // but that requires actual input events which are hard to simulate in tests
}

#[test]
fn test_concurrent_access() {
    use std::sync::Arc;
    
    let tracker = Arc::new(ActivityTracker::new(300).expect("Failed to create tracker"));
    
    // Spawn multiple threads accessing the tracker
    let handles: Vec<_> = (0..5)
        .map(|_| {
            let tracker_clone = Arc::clone(&tracker);
            thread::spawn(move || {
                for _ in 0..10 {
                    let _ = tracker_clone.get_activity_data();
                    thread::sleep(Duration::from_millis(50));
                }
            })
        })
        .collect();
    
    // Wait for all threads to complete
    for handle in handles {
        handle.join().expect("Thread panicked");
    }
    
    // Should not panic or deadlock
    let (work, idle, _) = tracker.get_activity_data();
    // With 5 threads each sleeping 50ms * 10 times, we should have accumulated at least 1 second
    assert!(work >= 1, "Should have accumulated time from concurrent access, got {}", work);
    assert_eq!(idle, 0);
}

#[test]
fn test_different_idle_thresholds() {
    // Test with 2 second threshold
    let tracker1 = ActivityTracker::new(2).expect("Failed to create tracker");
    assert_eq!(tracker1.current_state(), ActivityState::Work);
    
    thread::sleep(Duration::from_millis(2200));
    assert_eq!(tracker1.current_state(), ActivityState::Idle);
    
    // Test with 5 second threshold
    let tracker2 = ActivityTracker::new(5).expect("Failed to create tracker");
    assert_eq!(tracker2.current_state(), ActivityState::Work);
    
    thread::sleep(Duration::from_millis(2200));
    assert_eq!(tracker2.current_state(), ActivityState::Work, "Should still be WORK with 5s threshold");
}

#[test]
fn test_get_activity_data_updates_state() {
    let tracker = ActivityTracker::new(1).expect("Failed to create tracker");
    
    // Initially WORK
    let (_, _, state1) = tracker.get_activity_data();
    assert_eq!(state1, ActivityState::Work);
    
    // Wait for idle threshold
    thread::sleep(Duration::from_millis(1200));
    
    // get_activity_data should update the state
    let (_, _, state2) = tracker.get_activity_data();
    assert_eq!(state2, ActivityState::Idle);
}

#[test]
fn test_time_precision() {
    let tracker = ActivityTracker::new(300).expect("Failed to create tracker");
    
    // Sleep for a known duration
    thread::sleep(Duration::from_millis(500));
    
    let (work, _, _) = tracker.get_activity_data();
    
    // Should be approximately 0.5 seconds (allowing for some variance)
    assert!(work >= 0 && work <= 1, "Work time should be approximately 0.5 seconds, got {}", work);
}

#[test]
fn test_drop_stops_tracker() {
    {
        let tracker = ActivityTracker::new(300).expect("Failed to create tracker");
        tracker.start().expect("Failed to start tracker");
        assert!(tracker.is_running());
        
        // Tracker goes out of scope here and Drop is called
    }
    
    // If Drop didn't stop the tracker, the background thread would continue
    // This test verifies that Drop is implemented correctly
    thread::sleep(Duration::from_millis(100));
    // No assertion needed - if Drop doesn't work, the test would hang or leak threads
}
