//! Payload Builder demonstration
//!
//! This example demonstrates the usage of the PayloadBuilder module,
//! including payload construction, serialization, and JSON output.
//!
//! Run with: cargo run --example payload_demo

use monitoring_client::modules::payload_builder::PayloadBuilder;
use monitoring_client::modules::types::{ActivityData, ApplicationData, BrowserTabData, Location, Payload};
use chrono::Utc;

fn main() {
    // Initialize tracing for logging
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    println!("=== Payload Builder Demo ===\n");

    // Example 1: Basic Payload
    println!("1. Basic Payload");
    println!("{}", "-".repeat(50));
    
    let basic_payload = Payload {
        client_id: "client-demo-001".to_string(),
        employee_name: "Demo User".to_string(),
        timestamp: Utc::now(),
        interval_start: Utc::now(),
        interval_end: Utc::now(),
        activity: ActivityData {
            work_seconds: 300,
            idle_seconds: 100,
        },
        applications: vec![
            ApplicationData {
                name: "Chrome".to_string(),
                duration: 200,
            },
            ApplicationData {
                name: "VSCode".to_string(),
                duration: 100,
            },
        ],
        browser_tabs: vec![],
        screenshot: "".to_string(),
        location: None,
    };
    
    match PayloadBuilder::serialize_payload_pretty(&basic_payload) {
        Ok(json) => println!("{}\n", json),
        Err(e) => eprintln!("Error: {}\n", e),
    }

    // Example 2: Payload with Location
    println!("2. Payload with Location");
    println!("{}", "-".repeat(50));
    
    let location_payload = Payload {
        client_id: "client-demo-002".to_string(),
        employee_name: "Jane Smith".to_string(),
        timestamp: Utc::now(),
        interval_start: Utc::now(),
        interval_end: Utc::now(),
        activity: ActivityData {
            work_seconds: 500,
            idle_seconds: 50,
        },
        applications: vec![
            ApplicationData {
                name: "Slack".to_string(),
                duration: 250,
            },
            ApplicationData {
                name: "Terminal".to_string(),
                duration: 250,
            },
        ],
        browser_tabs: vec![],
        screenshot: "".to_string(),
        location: Some(Location {
            city: "San Francisco".to_string(),
            state: "California".to_string(),
            country: "United States".to_string(),
        }),
    };
    
    match PayloadBuilder::serialize_payload_pretty(&location_payload) {
        Ok(json) => println!("{}\n", json),
        Err(e) => eprintln!("Error: {}\n", e),
    }

    // Example 3: Payload with Browser Tabs
    println!("3. Payload with Browser Tabs");
    println!("{}", "-".repeat(50));
    
    let browser_payload = Payload {
        client_id: "client-demo-003".to_string(),
        employee_name: "Bob Johnson".to_string(),
        timestamp: Utc::now(),
        interval_start: Utc::now(),
        interval_end: Utc::now(),
        activity: ActivityData {
            work_seconds: 400,
            idle_seconds: 200,
        },
        applications: vec![
            ApplicationData {
                name: "Chrome".to_string(),
                duration: 400,
            },
        ],
        browser_tabs: vec![
            BrowserTabData {
                browser: "Chrome".to_string(),
                title: "GitHub - Rust Repository".to_string(),
                url: "https://github.com/rust-lang/rust".to_string(),
                duration: 200,
            },
            BrowserTabData {
                browser: "Chrome".to_string(),
                title: "Rust Documentation".to_string(),
                url: "https://doc.rust-lang.org/".to_string(),
                duration: 150,
            },
            BrowserTabData {
                browser: "Chrome".to_string(),
                title: "Stack Overflow".to_string(),
                url: "https://stackoverflow.com/questions/tagged/rust".to_string(),
                duration: 50,
            },
        ],
        screenshot: "".to_string(),
        location: None,
    };
    
    match PayloadBuilder::serialize_payload_pretty(&browser_payload) {
        Ok(json) => println!("{}\n", json),
        Err(e) => eprintln!("Error: {}\n", e),
    }

    // Example 4: Complete Payload with All Fields
    println!("4. Complete Payload (All Fields)");
    println!("{}", "-".repeat(50));
    
    let complete_payload = Payload {
        client_id: "client-demo-004".to_string(),
        employee_name: "Alice Williams".to_string(),
        timestamp: Utc::now(),
        interval_start: Utc::now(),
        interval_end: Utc::now(),
        activity: ActivityData {
            work_seconds: 600,
            idle_seconds: 0,
        },
        applications: vec![
            ApplicationData {
                name: "Chrome".to_string(),
                duration: 300,
            },
            ApplicationData {
                name: "VSCode".to_string(),
                duration: 200,
            },
            ApplicationData {
                name: "Slack".to_string(),
                duration: 100,
            },
        ],
        browser_tabs: vec![
            BrowserTabData {
                browser: "Chrome".to_string(),
                title: "Project Documentation".to_string(),
                url: "https://docs.example.com".to_string(),
                duration: 200,
            },
            BrowserTabData {
                browser: "Chrome".to_string(),
                title: "Team Dashboard".to_string(),
                url: "https://dashboard.example.com".to_string(),
                duration: 100,
            },
        ],
        screenshot: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==".to_string(),
        location: Some(Location {
            city: "New York".to_string(),
            state: "New York".to_string(),
            country: "United States".to_string(),
        }),
    };
    
    match PayloadBuilder::serialize_payload_pretty(&complete_payload) {
        Ok(json) => println!("{}\n", json),
        Err(e) => eprintln!("Error: {}\n", e),
    }

    // Example 5: Compact JSON (no pretty print)
    println!("5. Compact JSON Format");
    println!("{}", "-".repeat(50));
    
    let compact_payload = Payload {
        client_id: "client-demo-005".to_string(),
        employee_name: "Compact Test".to_string(),
        timestamp: Utc::now(),
        interval_start: Utc::now(),
        interval_end: Utc::now(),
        activity: ActivityData {
            work_seconds: 100,
            idle_seconds: 50,
        },
        applications: vec![
            ApplicationData {
                name: "TestApp".to_string(),
                duration: 100,
            },
        ],
        browser_tabs: vec![],
        screenshot: "".to_string(),
        location: None,
    };
    
    match PayloadBuilder::serialize_payload(&compact_payload) {
        Ok(json) => {
            println!("Compact: {}\n", json);
            println!("Length: {} bytes\n", json.len());
        }
        Err(e) => eprintln!("Error: {}\n", e),
    }

    // Example 6: Payload Size Comparison
    println!("6. Payload Size Comparison");
    println!("{}", "-".repeat(50));
    
    let size_test_payload = Payload {
        client_id: "client-demo-006".to_string(),
        employee_name: "Size Test".to_string(),
        timestamp: Utc::now(),
        interval_start: Utc::now(),
        interval_end: Utc::now(),
        activity: ActivityData {
            work_seconds: 3600,
            idle_seconds: 600,
        },
        applications: (0..10).map(|i| ApplicationData {
            name: format!("Application {}", i),
            duration: i * 100,
        }).collect(),
        browser_tabs: (0..5).map(|i| BrowserTabData {
            browser: "Chrome".to_string(),
            title: format!("Tab {}", i),
            url: format!("https://example.com/page{}", i),
            duration: i * 50,
        }).collect(),
        screenshot: "x".repeat(1000), // Simulated screenshot
        location: Some(Location {
            city: "Test City".to_string(),
            state: "Test State".to_string(),
            country: "Test Country".to_string(),
        }),
    };
    
    match PayloadBuilder::serialize_payload(&size_test_payload) {
        Ok(compact) => {
            match PayloadBuilder::serialize_payload_pretty(&size_test_payload) {
                Ok(pretty) => {
                    println!("Compact size: {} bytes", compact.len());
                    println!("Pretty size:  {} bytes", pretty.len());
                    println!("Difference:   {} bytes ({:.1}% larger)\n",
                        pretty.len() - compact.len(),
                        ((pretty.len() - compact.len()) as f64 / compact.len() as f64) * 100.0
                    );
                }
                Err(e) => eprintln!("Error: {}\n", e),
            }
        }
        Err(e) => eprintln!("Error: {}\n", e),
    }

    // Example 7: Payload Statistics
    println!("7. Payload Statistics");
    println!("{}", "-".repeat(50));
    
    let stats_payload = Payload {
        client_id: "client-demo-007".to_string(),
        employee_name: "Stats Test".to_string(),
        timestamp: Utc::now(),
        interval_start: Utc::now(),
        interval_end: Utc::now(),
        activity: ActivityData {
            work_seconds: 2700,
            idle_seconds: 300,
        },
        applications: vec![
            ApplicationData { name: "Chrome".to_string(), duration: 1200 },
            ApplicationData { name: "VSCode".to_string(), duration: 900 },
            ApplicationData { name: "Slack".to_string(), duration: 600 },
        ],
        browser_tabs: vec![
            BrowserTabData {
                browser: "Chrome".to_string(),
                title: "Tab 1".to_string(),
                url: "https://example.com/1".to_string(),
                duration: 400,
            },
            BrowserTabData {
                browser: "Chrome".to_string(),
                title: "Tab 2".to_string(),
                url: "https://example.com/2".to_string(),
                duration: 300,
            },
        ],
        screenshot: "screenshot_data".to_string(),
        location: Some(Location {
            city: "Seattle".to_string(),
            state: "Washington".to_string(),
            country: "United States".to_string(),
        }),
    };
    
    println!("Client ID: {}", stats_payload.client_id);
    println!("Employee: {}", stats_payload.employee_name);
    println!("Work time: {}s ({}m)", stats_payload.activity.work_seconds, stats_payload.activity.work_seconds / 60);
    println!("Idle time: {}s ({}m)", stats_payload.activity.idle_seconds, stats_payload.activity.idle_seconds / 60);
    println!("Applications: {}", stats_payload.applications.len());
    println!("Browser tabs: {}", stats_payload.browser_tabs.len());
    println!("Has screenshot: {}", !stats_payload.screenshot.is_empty());
    println!("Has location: {}", stats_payload.location.is_some());
    
    if let Some(loc) = &stats_payload.location {
        println!("Location: {}, {}, {}", loc.city, loc.state, loc.country);
    }
    println!();

    println!("=== Demo Complete ===");
}
