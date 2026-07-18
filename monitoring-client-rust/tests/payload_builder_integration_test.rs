//! Integration tests for the payload builder module
//!
//! These tests verify the payload builder's behavior with mock data
//! and ensure proper JSON serialization.

use monitoring_client::modules::payload_builder::PayloadBuilder;
use monitoring_client::modules::types::{ActivityData, ApplicationData, BrowserTabData, Location, Payload};
use chrono::Utc;

#[test]
fn test_payload_serialization_basic() {
    let payload = Payload {
        client_id: "client-123".to_string(),
        employee_name: "John Doe".to_string(),
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
    
    let json = PayloadBuilder::serialize_payload(&payload);
    assert!(json.is_ok());
    
    let json_str = json.unwrap();
    assert!(json_str.contains("client-123"));
    assert!(json_str.contains("John Doe"));
    assert!(json_str.contains("Chrome"));
    assert!(json_str.contains("VSCode"));
}

#[test]
fn test_payload_serialization_with_location() {
    let payload = Payload {
        client_id: "client-456".to_string(),
        employee_name: "Jane Smith".to_string(),
        timestamp: Utc::now(),
        interval_start: Utc::now(),
        interval_end: Utc::now(),
        activity: ActivityData {
            work_seconds: 500,
            idle_seconds: 50,
        },
        applications: vec![],
        browser_tabs: vec![],
        screenshot: "base64encodeddata".to_string(),
        location: Some(Location {
            city: "San Francisco".to_string(),
            state: "California".to_string(),
            country: "United States".to_string(),
        }),
    };
    
    let json = PayloadBuilder::serialize_payload(&payload);
    assert!(json.is_ok());
    
    let json_str = json.unwrap();
    assert!(json_str.contains("San Francisco"));
    assert!(json_str.contains("California"));
    assert!(json_str.contains("United States"));
    assert!(json_str.contains("base64encodeddata"));
}

#[test]
fn test_payload_serialization_with_browser_tabs() {
    let payload = Payload {
        client_id: "client-789".to_string(),
        employee_name: "Bob Johnson".to_string(),
        timestamp: Utc::now(),
        interval_start: Utc::now(),
        interval_end: Utc::now(),
        activity: ActivityData {
            work_seconds: 400,
            idle_seconds: 200,
        },
        applications: vec![],
        browser_tabs: vec![
            BrowserTabData {
                browser: "Chrome".to_string(),
                title: "GitHub".to_string(),
                url: "https://github.com".to_string(),
                duration: 150,
            },
            BrowserTabData {
                browser: "Firefox".to_string(),
                title: "Stack Overflow".to_string(),
                url: "https://stackoverflow.com".to_string(),
                duration: 100,
            },
        ],
        screenshot: "".to_string(),
        location: None,
    };
    
    let json = PayloadBuilder::serialize_payload(&payload);
    assert!(json.is_ok());
    
    let json_str = json.unwrap();
    assert!(json_str.contains("GitHub"));
    assert!(json_str.contains("https://github.com"));
    assert!(json_str.contains("Stack Overflow"));
    assert!(json_str.contains("https://stackoverflow.com"));
}

#[test]
fn test_payload_serialization_complete() {
    let payload = Payload {
        client_id: "client-complete".to_string(),
        employee_name: "Complete Test".to_string(),
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
                name: "Slack".to_string(),
                duration: 200,
            },
            ApplicationData {
                name: "Terminal".to_string(),
                duration: 100,
            },
        ],
        browser_tabs: vec![
            BrowserTabData {
                browser: "Chrome".to_string(),
                title: "Documentation".to_string(),
                url: "https://docs.rs".to_string(),
                duration: 200,
            },
        ],
        screenshot: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==".to_string(),
        location: Some(Location {
            city: "New York".to_string(),
            state: "New York".to_string(),
            country: "United States".to_string(),
        }),
    };
    
    let json = PayloadBuilder::serialize_payload(&payload);
    assert!(json.is_ok());
    
    let json_str = json.unwrap();
    
    // Verify all fields are present
    assert!(json_str.contains("client-complete"));
    assert!(json_str.contains("Complete Test"));
    assert!(json_str.contains("Chrome"));
    assert!(json_str.contains("Slack"));
    assert!(json_str.contains("Terminal"));
    assert!(json_str.contains("Documentation"));
    assert!(json_str.contains("https://docs.rs"));
    assert!(json_str.contains("New York"));
    assert!(json_str.contains("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="));
}

#[test]
fn test_payload_deserialization() {
    let payload = Payload {
        client_id: "client-deser".to_string(),
        employee_name: "Deser Test".to_string(),
        timestamp: Utc::now(),
        interval_start: Utc::now(),
        interval_end: Utc::now(),
        activity: ActivityData {
            work_seconds: 100,
            idle_seconds: 50,
        },
        applications: vec![],
        browser_tabs: vec![],
        screenshot: "".to_string(),
        location: None,
    };
    
    // Serialize
    let json_str = PayloadBuilder::serialize_payload(&payload).unwrap();
    
    // Deserialize
    let deserialized: Result<Payload, _> = serde_json::from_str(&json_str);
    assert!(deserialized.is_ok());
    
    let deserialized_payload = deserialized.unwrap();
    assert_eq!(deserialized_payload.client_id, "client-deser");
    assert_eq!(deserialized_payload.employee_name, "Deser Test");
    assert_eq!(deserialized_payload.activity.work_seconds, 100);
    assert_eq!(deserialized_payload.activity.idle_seconds, 50);
}

#[test]
fn test_payload_pretty_print() {
    let payload = Payload {
        client_id: "client-pretty".to_string(),
        employee_name: "Pretty Test".to_string(),
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
                duration: 60,
            },
        ],
        browser_tabs: vec![],
        screenshot: "".to_string(),
        location: None,
    };
    
    let json = PayloadBuilder::serialize_payload_pretty(&payload);
    assert!(json.is_ok());
    
    let json_str = json.unwrap();
    
    // Pretty JSON should have newlines and indentation
    assert!(json_str.contains('\n'));
    assert!(json_str.contains("  ")); // Indentation
    
    // Should still contain all data
    assert!(json_str.contains("client-pretty"));
    assert!(json_str.contains("Pretty Test"));
    assert!(json_str.contains("TestApp"));
}

#[test]
fn test_payload_empty_employee_name() {
    let payload = Payload {
        client_id: "client-no-name".to_string(),
        employee_name: "client-no-name".to_string(), // Should default to client_id
        timestamp: Utc::now(),
        interval_start: Utc::now(),
        interval_end: Utc::now(),
        activity: ActivityData {
            work_seconds: 0,
            idle_seconds: 0,
        },
        applications: vec![],
        browser_tabs: vec![],
        screenshot: "".to_string(),
        location: None,
    };
    
    let json = PayloadBuilder::serialize_payload(&payload);
    assert!(json.is_ok());
    
    let json_str = json.unwrap();
    assert!(json_str.contains("client-no-name"));
}

#[test]
fn test_payload_iso8601_timestamps() {
    let now = Utc::now();
    let payload = Payload {
        client_id: "client-timestamp".to_string(),
        employee_name: "Timestamp Test".to_string(),
        timestamp: now,
        interval_start: now,
        interval_end: now,
        activity: ActivityData {
            work_seconds: 100,
            idle_seconds: 50,
        },
        applications: vec![],
        browser_tabs: vec![],
        screenshot: "".to_string(),
        location: None,
    };
    
    let json = PayloadBuilder::serialize_payload(&payload);
    assert!(json.is_ok());
    
    let json_str = json.unwrap();
    
    // Check for ISO 8601 format (contains 'T' and 'Z')
    assert!(json_str.contains('T'));
    assert!(json_str.contains('Z'));
}

#[test]
fn test_payload_optional_location_omitted() {
    let payload = Payload {
        client_id: "client-no-loc".to_string(),
        employee_name: "No Location".to_string(),
        timestamp: Utc::now(),
        interval_start: Utc::now(),
        interval_end: Utc::now(),
        activity: ActivityData {
            work_seconds: 100,
            idle_seconds: 50,
        },
        applications: vec![],
        browser_tabs: vec![],
        screenshot: "".to_string(),
        location: None,
    };
    
    let json = PayloadBuilder::serialize_payload(&payload);
    assert!(json.is_ok());
    
    let json_str = json.unwrap();
    
    // Location field should not be present when None
    // (due to skip_serializing_if attribute)
    assert!(!json_str.contains("\"location\""));
}

#[test]
fn test_payload_large_data() {
    // Test with large amounts of data
    let mut applications = Vec::new();
    for i in 0..100 {
        applications.push(ApplicationData {
            name: format!("App{}", i),
            duration: i * 10,
        });
    }
    
    let mut browser_tabs = Vec::new();
    for i in 0..50 {
        browser_tabs.push(BrowserTabData {
            browser: "Chrome".to_string(),
            title: format!("Tab {}", i),
            url: format!("https://example.com/page{}", i),
            duration: i * 5,
        });
    }
    
    let payload = Payload {
        client_id: "client-large".to_string(),
        employee_name: "Large Data Test".to_string(),
        timestamp: Utc::now(),
        interval_start: Utc::now(),
        interval_end: Utc::now(),
        activity: ActivityData {
            work_seconds: 3600,
            idle_seconds: 600,
        },
        applications,
        browser_tabs,
        screenshot: "x".repeat(10000), // Large screenshot
        location: Some(Location {
            city: "Test City".to_string(),
            state: "Test State".to_string(),
            country: "Test Country".to_string(),
        }),
    };
    
    let json = PayloadBuilder::serialize_payload(&payload);
    assert!(json.is_ok());
    
    let json_str = json.unwrap();
    assert!(json_str.len() > 10000); // Should be large
    assert!(json_str.contains("App99"));
    assert!(json_str.contains("Tab 49"));
}
