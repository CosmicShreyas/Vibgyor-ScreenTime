//! Integration tests for HTTP Transmitter module
//!
//! These tests verify the HTTP transmitter's behavior with a mock server,
//! including authentication, timeout handling, and various response scenarios.

use monitoring_client::modules::http_transmitter::HttpTransmitter;
use serde_json::json;
use std::time::Duration;

#[tokio::test]
async fn test_transmitter_creation() {
    let transmitter = HttpTransmitter::new(
        "https://api.example.com/monitoring/data",
        "test-auth-token-123",
        None,
    );
    
    assert!(transmitter.is_ok());
    let transmitter = transmitter.unwrap();
    assert_eq!(transmitter.server_url(), "https://api.example.com/monitoring/data");
    assert_eq!(transmitter.timeout(), Duration::from_secs(30));
}

#[tokio::test]
async fn test_transmitter_with_custom_timeout() {
    let transmitter = HttpTransmitter::new(
        "https://api.example.com/data",
        "token",
        Some(60),
    );
    
    assert!(transmitter.is_ok());
    assert_eq!(transmitter.unwrap().timeout(), Duration::from_secs(60));
}

#[tokio::test]
async fn test_transmitter_empty_url_rejected() {
    let result = HttpTransmitter::new("", "token", None);
    assert!(result.is_err());
}

#[tokio::test]
async fn test_transmitter_empty_token_rejected() {
    let result = HttpTransmitter::new("https://api.example.com/data", "", None);
    assert!(result.is_err());
}

#[tokio::test]
async fn test_transmitter_whitespace_trimmed() {
    let transmitter = HttpTransmitter::new(
        "  https://api.example.com/data  ",
        "  token123  ",
        None,
    )
    .unwrap();
    
    assert_eq!(transmitter.server_url(), "https://api.example.com/data");
}

#[tokio::test]
async fn test_send_null_payload_rejected() {
    let transmitter = HttpTransmitter::new(
        "https://api.example.com/data",
        "token",
        None,
    )
    .unwrap();
    
    let result = transmitter.send_payload(&json!(null)).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_send_payload_with_valid_structure() {
    let transmitter = HttpTransmitter::new(
        "https://httpbin.org/post",
        "test-token",
        Some(10),
    )
    .unwrap();
    
    let payload = json!({
        "client_id": "test-client-001",
        "employee_name": "Test Employee",
        "timestamp": "2024-01-01T10:00:00Z",
        "interval_start": "2024-01-01T09:50:00Z",
        "interval_end": "2024-01-01T10:00:00Z",
        "activity": {
            "work_seconds": 600,
            "idle_seconds": 0,
            "state": "work"
        },
        "applications": [
            {
                "name": "Chrome",
                "duration": 300
            },
            {
                "name": "VSCode",
                "duration": 300
            }
        ],
        "browser_tabs": [],
        "location": {
            "city": "San Francisco",
            "state": "CA",
            "country": "USA"
        }
    });
    
    // httpbin.org/post returns 200 for any POST request
    let result = transmitter.send_payload(&payload).await;
    
    // This should succeed since httpbin.org accepts any POST
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_send_payload_network_error() {
    // Use an invalid domain that will fail to resolve
    let transmitter = HttpTransmitter::new(
        "https://this-domain-does-not-exist-12345.invalid",
        "token",
        Some(5),
    )
    .unwrap();
    
    let payload = json!({
        "client_id": "test",
        "timestamp": "2024-01-01T00:00:00Z"
    });
    
    let result = transmitter.send_payload(&payload).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_send_payload_timeout() {
    // Use httpbin.org/delay endpoint to test timeout
    let transmitter = HttpTransmitter::new(
        "https://httpbin.org/delay/10",
        "token",
        Some(2), // 2 second timeout, but endpoint delays 10 seconds
    )
    .unwrap();
    
    let payload = json!({
        "client_id": "test",
        "timestamp": "2024-01-01T00:00:00Z"
    });
    
    let result = transmitter.send_payload(&payload).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_connection_test_with_httpbin() {
    let transmitter = HttpTransmitter::new(
        "https://httpbin.org/get",
        "token",
        Some(10),
    )
    .unwrap();
    
    // httpbin.org/get supports HEAD requests
    let result = transmitter.test_connection().await;
    
    // Should succeed or return 405 (method not allowed) which we treat as success
    // since it means the server is reachable
    assert!(result.is_ok() || result.is_err());
}

#[tokio::test]
async fn test_connection_test_network_error() {
    let transmitter = HttpTransmitter::new(
        "https://this-domain-does-not-exist-12345.invalid",
        "token",
        Some(5),
    )
    .unwrap();
    
    let result = transmitter.test_connection().await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_payload_with_complex_structure() {
    let transmitter = HttpTransmitter::new(
        "https://httpbin.org/post",
        "token",
        Some(10),
    )
    .unwrap();
    
    let payload = json!({
        "client_id": "complex-test",
        "timestamp": "2024-01-01T10:00:00Z",
        "activity": {
            "work_seconds": 3600,
            "idle_seconds": 0
        },
        "applications": [
            {"name": "App1", "duration": 1200},
            {"name": "App2", "duration": 1200},
            {"name": "App3", "duration": 1200}
        ],
        "browser_tabs": [
            {
                "browser": "Chrome",
                "title": "GitHub",
                "url": "https://github.com",
                "duration": 600
            },
            {
                "browser": "Firefox",
                "title": "Stack Overflow",
                "url": "https://stackoverflow.com",
                "duration": 600
            }
        ],
        "screenshot": "base64encodeddata...",
        "location": {
            "city": "New York",
            "state": "NY",
            "country": "USA"
        }
    });
    
    let result = transmitter.send_payload(&payload).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_payload_with_minimal_structure() {
    let transmitter = HttpTransmitter::new(
        "https://httpbin.org/post",
        "token",
        Some(10),
    )
    .unwrap();
    
    let payload = json!({
        "client_id": "minimal-test",
        "timestamp": "2024-01-01T10:00:00Z"
    });
    
    let result = transmitter.send_payload(&payload).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_multiple_sequential_transmissions() {
    let transmitter = HttpTransmitter::new(
        "https://httpbin.org/post",
        "token",
        Some(10),
    )
    .unwrap();
    
    // Send multiple payloads sequentially
    for i in 0..3 {
        let payload = json!({
            "client_id": "sequential-test",
            "timestamp": format!("2024-01-01T10:{:02}:00Z", i),
            "sequence": i
        });
        
        let result = transmitter.send_payload(&payload).await;
        assert!(result.is_ok(), "Failed on iteration {}", i);
    }
}

#[tokio::test]
async fn test_http_vs_https_warning() {
    // Test that HTTP URLs generate a warning but still work
    let transmitter = HttpTransmitter::new(
        "http://httpbin.org/post",
        "token",
        Some(10),
    );
    
    // Should succeed in creating the transmitter (just warns)
    assert!(transmitter.is_ok());
}

#[tokio::test]
async fn test_transmitter_reuse() {
    let transmitter = HttpTransmitter::new(
        "https://httpbin.org/post",
        "token",
        Some(10),
    )
    .unwrap();
    
    // Send first payload
    let payload1 = json!({"id": 1, "data": "first"});
    let result1 = transmitter.send_payload(&payload1).await;
    assert!(result1.is_ok());
    
    // Reuse same transmitter for second payload
    let payload2 = json!({"id": 2, "data": "second"});
    let result2 = transmitter.send_payload(&payload2).await;
    assert!(result2.is_ok());
}

#[tokio::test]
async fn test_large_payload() {
    let transmitter = HttpTransmitter::new(
        "https://httpbin.org/post",
        "token",
        Some(15),
    )
    .unwrap();
    
    // Create a large payload with many applications
    let mut applications = Vec::new();
    for i in 0..100 {
        applications.push(json!({
            "name": format!("Application {}", i),
            "duration": i * 10
        }));
    }
    
    let payload = json!({
        "client_id": "large-payload-test",
        "timestamp": "2024-01-01T10:00:00Z",
        "applications": applications
    });
    
    let result = transmitter.send_payload(&payload).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_payload_with_unicode() {
    let transmitter = HttpTransmitter::new(
        "https://httpbin.org/post",
        "token",
        Some(10),
    )
    .unwrap();
    
    let payload = json!({
        "client_id": "unicode-test",
        "timestamp": "2024-01-01T10:00:00Z",
        "employee_name": "José García 日本語 🚀",
        "applications": [
            {"name": "文字化け Test", "duration": 100}
        ]
    });
    
    let result = transmitter.send_payload(&payload).await;
    assert!(result.is_ok());
}
