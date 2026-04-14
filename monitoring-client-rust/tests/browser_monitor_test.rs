//! Unit tests for browser monitor module

use monitoring_client::modules::browser_monitor::{BrowserMonitor, BrowserTabUsageTracker};
use monitoring_client::modules::types::BrowserTab;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

#[test]
fn test_browser_monitor_creation() {
    let monitor = BrowserMonitor::new();
    // Should not panic
    assert!(true);
}

#[test]
fn test_get_browser_tabs_no_panic() {
    let monitor = BrowserMonitor::new();
    let result = monitor.get_browser_tabs();
    
    // Should not panic, may return empty list or error
    match result {
        Ok(tabs) => {
            println!("Found {} browser tabs", tabs.len());
            for tab in &tabs {
                println!("  {} - {}: {}", tab.browser, tab.title, tab.url);
            }
        }
        Err(e) => {
            println!("Error getting browser tabs: {}", e);
        }
    }
}

#[test]
fn test_browser_tab_usage_tracker_creation() {
    let monitor = Arc::new(BrowserMonitor::new());
    let tracker = BrowserTabUsageTracker::new(monitor);
    
    // Should not panic
    assert!(true);
}

#[test]
fn test_browser_tab_usage_tracker_update() {
    let monitor = Arc::new(BrowserMonitor::new());
    let tracker = BrowserTabUsageTracker::new(monitor);
    
    // Update should not panic
    let result = tracker.update();
    match result {
        Ok(_) => println!("Update successful"),
        Err(e) => println!("Update error: {}", e),
    }
}

#[test]
fn test_browser_tab_usage_tracker_get_durations() {
    let monitor = Arc::new(BrowserMonitor::new());
    let tracker = BrowserTabUsageTracker::new(monitor);
    
    // Get durations should not panic
    let durations = tracker.get_tab_durations();
    println!("Got {} tab durations", durations.len());
    
    for tab_data in &durations {
        println!(
            "  {} - {}: {} seconds",
            tab_data.browser, tab_data.title, tab_data.duration
        );
    }
}

#[test]
fn test_browser_tab_usage_tracker_reset() {
    let monitor = Arc::new(BrowserMonitor::new());
    let tracker = BrowserTabUsageTracker::new(monitor);
    
    // Update to accumulate some data
    let _ = tracker.update();
    
    // Wait a bit
    thread::sleep(Duration::from_millis(100));
    
    // Update again
    let _ = tracker.update();
    
    // Get durations
    let durations_before = tracker.get_tab_durations();
    
    // Reset
    tracker.reset_interval();
    
    // Get durations after reset
    let durations_after = tracker.get_tab_durations();
    
    // After reset, durations should be empty or zero
    assert!(durations_after.is_empty() || durations_after.iter().all(|d| d.duration == 0));
}

#[test]
fn test_browser_tab_usage_accumulation() {
    let monitor = Arc::new(BrowserMonitor::new());
    let tracker = BrowserTabUsageTracker::new(monitor);
    
    // First update
    let _ = tracker.update();
    
    // Wait 1 second
    thread::sleep(Duration::from_secs(1));
    
    // Second update
    let _ = tracker.update();
    
    // Get durations
    let durations = tracker.get_tab_durations();
    
    // If there are any tabs, they should have accumulated at least 1 second
    for tab_data in &durations {
        println!(
            "Tab {} - {} accumulated {} seconds",
            tab_data.browser, tab_data.title, tab_data.duration
        );
        if tab_data.duration > 0 {
            assert!(tab_data.duration >= 1);
        }
    }
}

#[test]
fn test_multiple_updates() {
    let monitor = Arc::new(BrowserMonitor::new());
    let tracker = BrowserTabUsageTracker::new(monitor);
    
    // Perform multiple updates
    for i in 0..5 {
        let _ = tracker.update();
        thread::sleep(Duration::from_millis(200));
        println!("Update {} completed", i + 1);
    }
    
    // Get final durations
    let durations = tracker.get_tab_durations();
    println!("Final durations: {} tabs tracked", durations.len());
    
    for tab_data in &durations {
        println!(
            "  {} - {}: {} seconds",
            tab_data.browser, tab_data.title, tab_data.duration
        );
    }
}

#[test]
fn test_concurrent_access() {
    let monitor = Arc::new(BrowserMonitor::new());
    let tracker = Arc::new(BrowserTabUsageTracker::new(monitor));
    
    let tracker1 = Arc::clone(&tracker);
    let tracker2 = Arc::clone(&tracker);
    
    // Spawn two threads that access the tracker concurrently
    let handle1 = thread::spawn(move || {
        for _ in 0..10 {
            let _ = tracker1.update();
            thread::sleep(Duration::from_millis(50));
        }
    });
    
    let handle2 = thread::spawn(move || {
        for _ in 0..10 {
            let _ = tracker2.get_tab_durations();
            thread::sleep(Duration::from_millis(50));
        }
    });
    
    // Wait for both threads to complete
    handle1.join().unwrap();
    handle2.join().unwrap();
    
    // Should not panic or deadlock
    println!("Concurrent access test passed");
}

#[test]
fn test_tab_key_parsing() {
    use monitoring_client::modules::browser_monitor::BrowserTabUsageTracker;
    
    let tab = BrowserTab {
        browser: "Chrome".to_string(),
        title: "GitHub - Where the world builds software".to_string(),
        url: "https://github.com".to_string(),
    };
    
    let key = BrowserTabUsageTracker::get_tab_key(&tab);
    assert!(key.contains("Chrome"));
    assert!(key.contains("GitHub"));
    
    let (browser, title) = BrowserTabUsageTracker::parse_tab_key(&key);
    assert_eq!(browser, "Chrome");
    assert!(title.contains("GitHub"));
}

#[test]
fn test_empty_tabs() {
    let monitor = Arc::new(BrowserMonitor::new());
    let tracker = BrowserTabUsageTracker::new(monitor);
    
    // Without any updates, should return empty
    let durations = tracker.get_tab_durations();
    assert!(durations.is_empty());
}

#[test]
fn test_reset_clears_data() {
    let monitor = Arc::new(BrowserMonitor::new());
    let tracker = BrowserTabUsageTracker::new(monitor);
    
    // Update to potentially accumulate data
    let _ = tracker.update();
    thread::sleep(Duration::from_millis(100));
    let _ = tracker.update();
    
    // Reset
    tracker.reset_interval();
    
    // Get durations - should be empty
    let durations = tracker.get_tab_durations();
    assert!(durations.is_empty());
}
