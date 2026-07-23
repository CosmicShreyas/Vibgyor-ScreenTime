//! Location tracker demonstration
//!
//! This example demonstrates the usage of the LocationTracker module,
//! including basic location fetching, caching, and refresh operations.
//!
//! Run with: cargo run --example location_demo

use monitoring_client::modules::location_tracker::LocationTracker;
use std::time::Duration;
use tokio::time::sleep;

#[tokio::main]
async fn main() {
    // Initialize tracing for logging
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    println!("=== Location Tracker Demo ===\n");

    // Example 1: Basic location fetching
    println!("1. Basic Location Fetching");
    println!("{}", "-".repeat(50));
    let tracker = LocationTracker::new();
    
    match tracker.get_location().await {
        Ok(Some(location)) => {
            println!("✅ Location detected:");
            println!("   City: {}", location.city);
            println!("   State: {}", location.state);
            println!("   Country: {}", location.country);
        }
        Ok(None) => {
            println!("⚠️  Location unavailable");
        }
        Err(e) => {
            println!("❌ Error: {}", e);
        }
    }
    println!();

    // Example 2: Location string formatting
    println!("2. Formatted Location String");
    println!("{}", "-".repeat(50));
    let location_str = tracker.get_location_string().await;
    println!("Location: {}", location_str);
    println!();

    // Example 3: Cache demonstration
    println!("3. Cache Demonstration");
    println!("{}", "-".repeat(50));
    
    // First call (fetches from API)
    println!("First call (from API)...");
    let start = std::time::Instant::now();
    let _ = tracker.get_location().await;
    let first_duration = start.elapsed();
    println!("   Duration: {:?}", first_duration);
    
    // Second call (from cache)
    println!("Second call (from cache)...");
    let start = std::time::Instant::now();
    let _ = tracker.get_location().await;
    let second_duration = start.elapsed();
    println!("   Duration: {:?}", second_duration);
    
    println!("   Speed improvement: {}x faster", 
        first_duration.as_micros() / second_duration.as_micros().max(1));
    println!();

    // Example 4: Cache status
    println!("4. Cache Status");
    println!("{}", "-".repeat(50));
    if tracker.is_cache_valid() {
        println!("✅ Cache is valid");
        if let Some(age) = tracker.cache_age() {
            println!("   Cache age: {:?}", age);
        }
    } else {
        println!("⚠️  Cache is invalid or empty");
    }
    println!();

    // Example 5: Custom cache duration
    println!("5. Custom Cache Duration");
    println!("{}", "-".repeat(50));
    let short_cache_tracker = LocationTracker::with_cache_duration(Duration::from_secs(5));
    println!("Created tracker with 5-second cache duration");
    
    let _ = short_cache_tracker.get_location().await;
    println!("Fetched location (cache valid: {})", short_cache_tracker.is_cache_valid());
    
    println!("Waiting 6 seconds for cache to expire...");
    sleep(Duration::from_secs(6)).await;
    
    println!("After 6 seconds (cache valid: {})", short_cache_tracker.is_cache_valid());
    println!();

    // Example 6: Force refresh
    println!("6. Force Refresh");
    println!("{}", "-".repeat(50));
    println!("Forcing location refresh...");
    match tracker.refresh_location().await {
        Ok(Some(location)) => {
            println!("✅ Location refreshed: {}, {}, {}", 
                location.city, location.state, location.country);
        }
        Ok(None) => {
            println!("⚠️  Location unavailable");
        }
        Err(e) => {
            println!("❌ Error: {}", e);
        }
    }
    println!();

    // Example 7: Clear cache
    println!("7. Clear Cache");
    println!("{}", "-".repeat(50));
    println!("Cache valid before clear: {}", tracker.is_cache_valid());
    tracker.clear_cache();
    println!("Cache valid after clear: {}", tracker.is_cache_valid());
    println!();

    // Example 8: Periodic updates
    println!("8. Periodic Updates Simulation");
    println!("{}", "-".repeat(50));
    println!("Simulating periodic location updates (every 3 seconds for 10 seconds)...");
    
    let periodic_tracker = LocationTracker::with_cache_duration(Duration::from_secs(2));
    
    for i in 1..=3 {
        println!("\nUpdate #{}", i);
        let start = std::time::Instant::now();
        
        match periodic_tracker.get_location().await {
            Ok(Some(location)) => {
                let duration = start.elapsed();
                let from_cache = duration < Duration::from_millis(10);
                println!("   Location: {}, {}", location.city, location.state);
                println!("   Source: {}", if from_cache { "Cache" } else { "API" });
                println!("   Duration: {:?}", duration);
            }
            Ok(None) => {
                println!("   Location unavailable");
            }
            Err(e) => {
                println!("   Error: {}", e);
            }
        }
        
        if i < 3 {
            sleep(Duration::from_secs(3)).await;
        }
    }
    println!();

    println!("=== Demo Complete ===");
}
