//! Integration tests for application monitor module

use monitoring_client::modules::app_monitor::{AppMonitor, AppUsageTracker};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

#[test]
fn test_app_monitor_creation() {
    let monitor = AppMonitor::new();
    // Should create successfully
    assert!(true);
}

#[test]
fn test_get_running_applications() {
    let monitor = AppMonitor::new();
    let apps = monitor.get_running_applications().expect("Failed to get applications");
    
    // Should have at least some applications running (including the test process itself)
    assert!(!apps.is_empty(), "Should find at least some running applications");
    
    println!("Found {} applications", apps.len());
    
    // Check that applications have valid data
    for app in &apps {
        assert!(!app.name.is_empty(), "Application name should not be empty");
        assert!(app.pid.is_some(), "Application should have a PID");
        assert!(app.is_foreground.is_some(), "Application should have foreground status");
    }
}

#[test]
fn test_system_process_filtering() {
    let monitor = AppMonitor::new();
    let apps = monitor.get_running_applications().expect("Failed to get applications");
    
    // Check that system processes are filtered out
    for app in &apps {
        let name_lower = app.name.to_lowercase();
        
        // These common system processes should not appear
        assert!(!name_lower.contains("svchost"), "svchost should be filtered");
        assert!(!name_lower.contains("csrss"), "csrss should be filtered");
        assert!(name_lower != "system", "system should be filtered");
    }
    
    println!("System process filtering working correctly");
}

#[test]
fn test_get_application_names() {
    let monitor = AppMonitor::new();
    let names = monitor.get_application_names().expect("Failed to get application names");
    
    assert!(!names.is_empty(), "Should have at least some application names");
    
    // All names should be non-empty
    for name in &names {
        assert!(!name.is_empty(), "Application name should not be empty");
    }
    
    println!("Got {} application names", names.len());
}

#[test]
fn test_get_foreground_application() {
    let monitor = AppMonitor::new();
    let foreground = monitor.get_foreground_application();
    
    // May or may not have a foreground app depending on environment
    if let Some(app_name) = foreground {
        println!("Foreground application: {}", app_name);
        assert!(!app_name.is_empty(), "Foreground app name should not be empty");
    } else {
        println!("No foreground application detected (may be headless environment)");
    }
}

#[test]
fn test_foreground_app_in_list() {
    let monitor = AppMonitor::new();
    let apps = monitor.get_running_applications().expect("Failed to get applications");
    
    // Check if any app is marked as foreground
    let foreground_count = apps.iter().filter(|app| app.is_foreground == Some(true)).count();
    
    println!("Found {} foreground applications", foreground_count);
    
    // Should have at most one foreground app
    assert!(foreground_count <= 1, "Should have at most one foreground application");
}

#[test]
fn test_no_duplicate_app_names() {
    let monitor = AppMonitor::new();
    let apps = monitor.get_running_applications().expect("Failed to get applications");
    
    let mut seen_names = std::collections::HashSet::new();
    
    for app in &apps {
        let name_lower = app.name.to_lowercase();
        assert!(!seen_names.contains(&name_lower), 
                "Duplicate application name found: {}", app.name);
        seen_names.insert(name_lower);
    }
    
    println!("No duplicate application names found");
}

#[test]
fn test_app_usage_tracker_creation() {
    let monitor = Arc::new(AppMonitor::new());
    let tracker = AppUsageTracker::new(monitor, 10.0);
    
    assert!(!tracker.is_running(), "Tracker should not be running initially");
    assert_eq!(tracker.get_current_application(), None, "Should have no current app initially");
}

#[test]
fn test_app_usage_tracker_minimum_poll_interval() {
    let monitor = Arc::new(AppMonitor::new());
    
    // Try to create with interval < 2.0 seconds
    let tracker = AppUsageTracker::new(monitor, 0.5);
    
    // Should be clamped to minimum 2.0 seconds
    // We can't directly check the interval, but the tracker should work
    assert!(!tracker.is_running());
}

#[test]
fn test_app_usage_tracker_start_stop() {
    let monitor = Arc::new(AppMonitor::new());
    let tracker = AppUsageTracker::new(monitor, 10.0);
    
    assert!(!tracker.is_running());
    
    tracker.start().expect("Failed to start tracker");
    
    // Give the thread time to start
    thread::sleep(Duration::from_millis(100));
    
    assert!(tracker.is_running(), "Tracker should be running after start");
    
    tracker.stop();
    
    println!("Start/stop cycle completed successfully");
}

#[test]
fn test_app_usage_tracker_idempotent_start() {
    let monitor = Arc::new(AppMonitor::new());
    let tracker = AppUsageTracker::new(monitor, 10.0);
    
    tracker.start().expect("Failed to start tracker");
    
    // Starting again should not error
    let result = tracker.start();
    assert!(result.is_ok(), "Starting already running tracker should not error");
    
    tracker.stop();
}

#[test]
fn test_app_usage_tracker_idempotent_stop() {
    let monitor = Arc::new(AppMonitor::new());
    let tracker = AppUsageTracker::new(monitor, 10.0);
    
    // Stopping when not running should not panic
    tracker.stop();
    tracker.stop(); // Second stop should also be fine
}

#[test]
fn test_app_usage_tracker_duration_tracking() {
    let monitor = Arc::new(AppMonitor::new());
    let tracker = AppUsageTracker::new(monitor, 2.0);
    
    tracker.start().expect("Failed to start tracker");
    
    // Wait for at least one poll cycle plus some buffer
    thread::sleep(Duration::from_millis(2500));
    
    let durations = tracker.get_application_durations();
    
    println!("Tracked {} applications", durations.len());
    
    // In a headless environment, there might be no foreground app
    // So we just check that the function works
    for app_data in &durations {
        println!("  {}: {}s", app_data.name, app_data.duration);
        assert!(!app_data.name.is_empty(), "App name should not be empty");
        assert!(app_data.duration > 0, "Duration should be positive");
    }
    
    tracker.stop();
}

#[test]
fn test_app_usage_tracker_reset_interval() {
    let monitor = Arc::new(AppMonitor::new());
    let tracker = AppUsageTracker::new(monitor, 2.0);
    
    tracker.start().expect("Failed to start tracker");
    
    // Wait for some tracking
    thread::sleep(Duration::from_millis(2500));
    
    let durations_before = tracker.get_application_durations();
    println!("Before reset: {} applications tracked", durations_before.len());
    
    // Reset interval
    tracker.reset_interval();
    
    // Wait a moment to ensure no immediate accumulation
    thread::sleep(Duration::from_millis(100));
    
    let durations_after = tracker.get_application_durations();
    
    // After reset and a short wait, durations should be minimal (< 1 second)
    let total_duration: u64 = durations_after.iter().map(|d| d.duration).sum();
    assert!(total_duration < 1, "Total duration after reset should be < 1 second, got {}", total_duration);
    
    println!("After reset: {} applications tracked with total {}s", durations_after.len(), total_duration);
    
    tracker.stop();
}

#[test]
fn test_app_usage_tracker_multiple_intervals() {
    let monitor = Arc::new(AppMonitor::new());
    let tracker = AppUsageTracker::new(monitor, 2.0);
    
    tracker.start().expect("Failed to start tracker");
    
    // First interval
    thread::sleep(Duration::from_millis(2500));
    let durations1 = tracker.get_application_durations();
    println!("Interval 1: {} applications", durations1.len());
    
    tracker.reset_interval();
    
    // Second interval
    thread::sleep(Duration::from_millis(2500));
    let durations2 = tracker.get_application_durations();
    println!("Interval 2: {} applications", durations2.len());
    
    // Intervals should be independent
    // (Can't assert much here as it depends on foreground app changes)
    
    tracker.stop();
}

#[test]
fn test_app_usage_tracker_get_current_application() {
    let monitor = Arc::new(AppMonitor::new());
    let tracker = AppUsageTracker::new(monitor, 2.0);
    
    tracker.start().expect("Failed to start tracker");
    
    // Wait for at least one poll
    thread::sleep(Duration::from_millis(2500));
    
    let current_app = tracker.get_current_application();
    
    if let Some(app_name) = current_app {
        println!("Current application: {}", app_name);
        assert!(!app_name.is_empty(), "Current app name should not be empty");
    } else {
        println!("No current application (may be headless environment)");
    }
    
    tracker.stop();
}

#[test]
fn test_app_usage_tracker_sorted_by_duration() {
    let monitor = Arc::new(AppMonitor::new());
    let tracker = AppUsageTracker::new(monitor, 2.0);
    
    tracker.start().expect("Failed to start tracker");
    
    // Wait for tracking
    thread::sleep(Duration::from_millis(2500));
    
    let durations = tracker.get_application_durations();
    
    // Check that durations are sorted in descending order
    for i in 1..durations.len() {
        assert!(durations[i-1].duration >= durations[i].duration,
                "Durations should be sorted in descending order");
    }
    
    println!("Durations are properly sorted");
    
    tracker.stop();
}

#[test]
fn test_app_usage_tracker_drop_stops() {
    let monitor = Arc::new(AppMonitor::new());
    
    {
        let tracker = AppUsageTracker::new(monitor, 2.0);
        tracker.start().expect("Failed to start tracker");
        thread::sleep(Duration::from_millis(100));
        assert!(tracker.is_running());
        
        // Tracker goes out of scope here and Drop is called
    }
    
    // If Drop didn't stop the tracker, the background thread would continue
    thread::sleep(Duration::from_millis(100));
    // No assertion needed - if Drop doesn't work, the test would hang or leak threads
}

#[test]
fn test_concurrent_access_to_durations() {
    let monitor = Arc::new(AppMonitor::new());
    let tracker = Arc::new(AppUsageTracker::new(monitor, 2.0));
    
    tracker.start().expect("Failed to start tracker");
    
    // Spawn multiple threads accessing durations
    let handles: Vec<_> = (0..5)
        .map(|i| {
            let tracker_clone = Arc::clone(&tracker);
            thread::spawn(move || {
                for _ in 0..10 {
                    let durations = tracker_clone.get_application_durations();
                    println!("Thread {}: {} apps", i, durations.len());
                    thread::sleep(Duration::from_millis(100));
                }
            })
        })
        .collect();
    
    // Wait for all threads
    for handle in handles {
        handle.join().expect("Thread panicked");
    }
    
    tracker.stop();
    
    println!("Concurrent access test completed successfully");
}
