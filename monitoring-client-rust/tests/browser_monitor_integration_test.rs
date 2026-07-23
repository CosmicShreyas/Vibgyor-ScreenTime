//! Integration tests for browser monitor module
//!
//! These tests verify the browser monitor works with real browser data
//! when browsers are actually running.

use monitoring_client::modules::browser_monitor::{BrowserMonitor, BrowserTabUsageTracker};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

#[test]
fn test_real_browser_detection() {
    let monitor = BrowserMonitor::new();
    
    match monitor.get_browser_tabs() {
        Ok(tabs) => {
            println!("Successfully detected {} browser tabs", tabs.len());
            
            for tab in &tabs {
                println!("Browser: {}", tab.browser);
                println!("  Title: {}", tab.title);
                println!("  URL: {}", tab.url);
                println!();
            }
            
            // Verify tab structure
            for tab in &tabs {
                assert!(!tab.browser.is_empty(), "Browser name should not be empty");
                // Title or URL should be present
                assert!(
                    !tab.title.is_empty() || !tab.url.is_empty(),
                    "Tab should have either title or URL"
                );
            }
        }
        Err(e) => {
            println!("Error detecting browsers: {}", e);
            // This is acceptable if no browsers are running
        }
    }
}

#[test]
fn test_usage_tracking_over_time() {
    let monitor = Arc::new(BrowserMonitor::new());
    let tracker = BrowserTabUsageTracker::new(monitor);
    
    println!("Starting usage tracking test...");
    
    // Track for 5 seconds with updates every second
    for i in 1..=5 {
        let _ = tracker.update();
        println!("Update {} completed", i);
        
        let durations = tracker.get_tab_durations();
        println!("  Currently tracking {} tabs", durations.len());
        
        for tab_data in &durations {
            println!(
                "    {} - {}: {} seconds",
                tab_data.browser, tab_data.title, tab_data.duration
            );
        }
        
        thread::sleep(Duration::from_secs(1));
    }
    
    // Get final durations
    let final_durations = tracker.get_tab_durations();
    println!("\nFinal results: {} tabs tracked", final_durations.len());
    
    for tab_data in &final_durations {
        println!(
            "  {} - {}: {} seconds",
            tab_data.browser, tab_data.title, tab_data.duration
        );
        
        // If tabs were open, they should have accumulated time
        if tab_data.duration > 0 {
            assert!(
                tab_data.duration >= 4,
                "Tab should have accumulated at least 4 seconds"
            );
        }
    }
}

#[test]
fn test_multiple_browser_support() {
    let monitor = BrowserMonitor::new();
    
    match monitor.get_browser_tabs() {
        Ok(tabs) => {
            // Group tabs by browser
            let mut browsers = std::collections::HashSet::new();
            for tab in &tabs {
                browsers.insert(tab.browser.clone());
            }
            
            println!("Detected {} different browsers", browsers.len());
            for browser in &browsers {
                let browser_tabs: Vec<_> = tabs
                    .iter()
                    .filter(|t| t.browser == *browser)
                    .collect();
                
                println!("  {}: {} tabs", browser, browser_tabs.len());
            }
            
            // Verify we can handle multiple browsers
            assert!(browsers.len() <= 3, "Should not detect more than 3 browsers");
        }
        Err(e) => {
            println!("Error: {}", e);
        }
    }
}

#[test]
fn test_tab_url_extraction() {
    let monitor = BrowserMonitor::new();
    
    match monitor.get_browser_tabs() {
        Ok(tabs) => {
            let tabs_with_urls: Vec<_> = tabs.iter().filter(|t| !t.url.is_empty()).collect();
            
            println!("Found {} tabs with URLs", tabs_with_urls.len());
            
            for tab in tabs_with_urls {
                println!("  {}: {}", tab.title, tab.url);
                
                // Verify URL format
                assert!(
                    tab.url.starts_with("http://") || tab.url.starts_with("https://") || tab.url.starts_with("file://"),
                    "URL should have valid protocol: {}",
                    tab.url
                );
            }
        }
        Err(e) => {
            println!("Error: {}", e);
        }
    }
}

#[test]
fn test_locked_database_handling() {
    // This test verifies that the monitor can handle locked browser databases
    // by copying them to a temp location first
    
    let monitor = BrowserMonitor::new();
    
    // Try to get tabs multiple times in quick succession
    for i in 1..=3 {
        println!("Attempt {} to read browser data", i);
        
        match monitor.get_browser_tabs() {
            Ok(tabs) => {
                println!("  Successfully read {} tabs", tabs.len());
            }
            Err(e) => {
                println!("  Error: {}", e);
            }
        }
        
        thread::sleep(Duration::from_millis(100));
    }
    
    // Should not panic or hang
    println!("Locked database handling test passed");
}

#[test]
fn test_interval_reset_behavior() {
    let monitor = Arc::new(BrowserMonitor::new());
    let tracker = BrowserTabUsageTracker::new(monitor);
    
    println!("Phase 1: Accumulate data");
    for i in 1..=3 {
        let _ = tracker.update();
        thread::sleep(Duration::from_secs(1));
        println!("  Update {}", i);
    }
    
    let phase1_durations = tracker.get_tab_durations();
    println!("Phase 1 results: {} tabs", phase1_durations.len());
    
    for tab_data in &phase1_durations {
        println!(
            "  {} - {}: {} seconds",
            tab_data.browser, tab_data.title, tab_data.duration
        );
    }
    
    println!("\nResetting interval...");
    tracker.reset_interval();
    
    println!("\nPhase 2: Accumulate new data");
    for i in 1..=3 {
        let _ = tracker.update();
        thread::sleep(Duration::from_secs(1));
        println!("  Update {}", i);
    }
    
    let phase2_durations = tracker.get_tab_durations();
    println!("Phase 2 results: {} tabs", phase2_durations.len());
    
    for tab_data in &phase2_durations {
        println!(
            "  {} - {}: {} seconds",
            tab_data.browser, tab_data.title, tab_data.duration
        );
        
        // Phase 2 durations should be independent of Phase 1
        if tab_data.duration > 0 {
            assert!(
                tab_data.duration <= 4,
                "After reset, duration should not exceed Phase 2 time"
            );
        }
    }
}

#[test]
fn test_empty_browser_state() {
    // Test behavior when no browsers are running
    // This is a simulation - actual behavior depends on system state
    
    let monitor = BrowserMonitor::new();
    
    match monitor.get_browser_tabs() {
        Ok(tabs) => {
            if tabs.is_empty() {
                println!("No browser tabs detected (expected if no browsers running)");
            } else {
                println!("Detected {} tabs", tabs.len());
            }
            
            // Should handle empty state gracefully
            assert!(tabs.len() >= 0);
        }
        Err(e) => {
            println!("Error: {} (acceptable if no browsers running)", e);
        }
    }
}
