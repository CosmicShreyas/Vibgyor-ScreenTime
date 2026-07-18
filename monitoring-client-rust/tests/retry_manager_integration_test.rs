//! Integration tests for Retry Manager module
//!
//! These tests verify the retry manager's behavior with queue integration,
//! exponential backoff, and retry attempt tracking.

use monitoring_client::modules::http_transmitter::HttpTransmitter;
use monitoring_client::modules::queue_manager::QueueManager;
use monitoring_client::modules::retry_manager::{
    RetryManager, BACKOFF_MULTIPLIER, INITIAL_BACKOFF_SECONDS, MAX_BACKOFF_SECONDS,
    MAX_RETRY_ATTEMPTS,
};
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tempfile::TempDir;

/// Helper function to create a test retry manager with temporary database
fn create_test_retry_manager() -> (RetryManager, TempDir) {
    let temp_dir = TempDir::new().expect("Failed to create temp directory");
    let db_path = temp_dir.path().join("test_queue.db");
    
    let queue_manager = Arc::new(
        QueueManager::new(Some(&db_path)).expect("Failed to create queue manager"),
    );
    
    // Use httpbin.org for testing
    let http_transmitter = Arc::new(
        HttpTransmitter::new("https://httpbin.org/post", "test-token", Some(10))
            .expect("Failed to create HTTP transmitter"),
    );
    
    let retry_manager = RetryManager::new(queue_manager, http_transmitter);
    
    (retry_manager, temp_dir)
}

#[tokio::test]
async fn test_retry_manager_creation() {
    let (retry_manager, _temp_dir) = create_test_retry_manager();
    
    // Should start with empty queue
    assert_eq!(retry_manager.get_queue_size().unwrap(), 0);
}

#[tokio::test]
async fn test_send_with_retry_success() {
    let (retry_manager, _temp_dir) = create_test_retry_manager();
    
    let payload = json!({
        "client_id": "test-client",
        "timestamp": "2024-01-01T10:00:00Z",
        "data": "test data"
    });
    
    // Should succeed with httpbin.org
    let result = retry_manager.send_with_retry(&payload).await;
    assert!(result.is_ok());
    assert!(result.unwrap()); // Should return true for success
    
    // Queue should remain empty
    assert_eq!(retry_manager.get_queue_size().unwrap(), 0);
}

#[tokio::test]
async fn test_send_with_retry_failure_queues_payload() {
    let temp_dir = TempDir::new().expect("Failed to create temp directory");
    let db_path = temp_dir.path().join("test_queue.db");
    
    let queue_manager = Arc::new(
        QueueManager::new(Some(&db_path)).expect("Failed to create queue manager"),
    );
    
    // Use invalid domain to force failure
    let http_transmitter = Arc::new(
        HttpTransmitter::new(
            "https://this-domain-does-not-exist-12345.invalid",
            "test-token",
            Some(2),
        )
        .expect("Failed to create HTTP transmitter"),
    );
    
    let retry_manager = RetryManager::new(queue_manager, http_transmitter);
    
    let payload = json!({
        "client_id": "test-client",
        "timestamp": "2024-01-01T10:00:00Z"
    });
    
    // Should fail and queue the payload
    let result = retry_manager.send_with_retry(&payload).await;
    assert!(result.is_ok());
    assert!(!result.unwrap()); // Should return false for queued
    
    // Queue should have 1 payload
    assert_eq!(retry_manager.get_queue_size().unwrap(), 1);
}

#[test]
fn test_calculate_backoff_initial() {
    assert_eq!(
        RetryManager::calculate_backoff(0),
        Duration::from_secs(INITIAL_BACKOFF_SECONDS)
    );
}

#[test]
fn test_calculate_backoff_exponential_growth() {
    // Verify exponential growth: 1, 2, 4, 8, 16, 32, 64, 128, 256
    let expected = vec![1, 2, 4, 8, 16, 32, 64, 128, 256];
    
    for (retry_count, expected_secs) in expected.iter().enumerate() {
        assert_eq!(
            RetryManager::calculate_backoff(retry_count as u32),
            Duration::from_secs(*expected_secs),
            "Backoff calculation failed at retry count {}",
            retry_count
        );
    }
}

#[test]
fn test_calculate_backoff_capped_at_max() {
    // Should be capped at MAX_BACKOFF_SECONDS (300)
    assert_eq!(
        RetryManager::calculate_backoff(9),
        Duration::from_secs(MAX_BACKOFF_SECONDS)
    );
    
    assert_eq!(
        RetryManager::calculate_backoff(10),
        Duration::from_secs(MAX_BACKOFF_SECONDS)
    );
    
    assert_eq!(
        RetryManager::calculate_backoff(20),
        Duration::from_secs(MAX_BACKOFF_SECONDS)
    );
}

#[test]
fn test_backoff_multiplier() {
    // Verify multiplier is 2
    assert_eq!(BACKOFF_MULTIPLIER, 2);
    
    // Verify it's applied correctly
    let backoff_1 = RetryManager::calculate_backoff(1);
    let backoff_0 = RetryManager::calculate_backoff(0);
    
    assert_eq!(backoff_1, backoff_0 * BACKOFF_MULTIPLIER);
}

#[test]
fn test_max_retry_attempts_constant() {
    assert_eq!(MAX_RETRY_ATTEMPTS, 10);
}

#[tokio::test]
async fn test_process_empty_queue() {
    let (retry_manager, _temp_dir) = create_test_retry_manager();
    
    let (successful, failed) = retry_manager.process_queue().await.unwrap();
    
    assert_eq!(successful, 0);
    assert_eq!(failed, 0);
}

#[tokio::test]
async fn test_process_queue_with_successful_payloads() {
    // Create a temporary database for this test
    let temp_dir = TempDir::new().expect("Failed to create temp directory");
    let db_path = temp_dir.path().join("test_queue.db");
    
    // Manually add payloads to queue
    let queue_manager = Arc::new(
        QueueManager::new(Some(&db_path)).expect("Failed to create queue manager"),
    );
    
    let http_transmitter = Arc::new(
        HttpTransmitter::new("https://httpbin.org/post", "test-token", Some(10))
            .expect("Failed to create HTTP transmitter"),
    );
    
    let retry_manager = RetryManager::new(queue_manager.clone(), http_transmitter);
    
    // Add test payloads
    for i in 0..3 {
        let payload = json!({
            "client_id": "test-client",
            "timestamp": format!("2024-01-01T10:{:02}:00Z", i),
            "sequence": i
        });
        queue_manager.add(payload).unwrap();
    }
    
    assert_eq!(retry_manager.get_queue_size().unwrap(), 3);
    
    // Process queue
    let (successful, failed) = retry_manager.process_queue().await.unwrap();
    
    // All should succeed with httpbin.org
    assert_eq!(successful, 3);
    assert_eq!(failed, 0);
    assert_eq!(retry_manager.get_queue_size().unwrap(), 0);
}

#[tokio::test]
async fn test_clear_queue() {
    // Create a temporary database for this test
    let temp_dir = TempDir::new().expect("Failed to create temp directory");
    let db_path = temp_dir.path().join("test_queue.db");
    
    // Manually add payloads
    let queue_manager = Arc::new(
        QueueManager::new(Some(&db_path)).expect("Failed to create queue manager"),
    );
    
    let http_transmitter = Arc::new(
        HttpTransmitter::new("https://httpbin.org/post", "test-token", Some(10))
            .expect("Failed to create HTTP transmitter"),
    );
    
    let retry_manager = RetryManager::new(queue_manager.clone(), http_transmitter);
    
    for i in 0..5 {
        let payload = json!({"sequence": i});
        queue_manager.add(payload).unwrap();
    }
    
    assert_eq!(retry_manager.get_queue_size().unwrap(), 5);
    
    let cleared = retry_manager.clear_queue().unwrap();
    assert_eq!(cleared, 5);
    assert_eq!(retry_manager.get_queue_size().unwrap(), 0);
}

#[tokio::test]
async fn test_get_queue_size() {
    let (retry_manager, _temp_dir) = create_test_retry_manager();
    
    assert_eq!(retry_manager.get_queue_size().unwrap(), 0);
    
    // Add a payload that will fail
    let temp_dir = TempDir::new().expect("Failed to create temp directory");
    let db_path = temp_dir.path().join("test_queue.db");
    
    let queue_manager = Arc::new(
        QueueManager::new(Some(&db_path)).expect("Failed to create queue manager"),
    );
    
    let http_transmitter = Arc::new(
        HttpTransmitter::new(
            "https://this-domain-does-not-exist-12345.invalid",
            "test-token",
            Some(2),
        )
        .expect("Failed to create HTTP transmitter"),
    );
    
    let retry_manager = RetryManager::new(queue_manager, http_transmitter);
    
    let payload = json!({"data": "test"});
    retry_manager.send_with_retry(&payload).await.unwrap();
    
    assert_eq!(retry_manager.get_queue_size().unwrap(), 1);
}

#[tokio::test]
async fn test_multiple_send_with_retry() {
    let (retry_manager, _temp_dir) = create_test_retry_manager();
    
    // Send multiple payloads
    for i in 0..3 {
        let payload = json!({
            "client_id": "test-client",
            "timestamp": format!("2024-01-01T10:{:02}:00Z", i),
            "sequence": i
        });
        
        let result = retry_manager.send_with_retry(&payload).await;
        assert!(result.is_ok());
        assert!(result.unwrap()); // All should succeed
    }
    
    // Queue should remain empty
    assert_eq!(retry_manager.get_queue_size().unwrap(), 0);
}

#[test]
fn test_backoff_constants() {
    assert_eq!(INITIAL_BACKOFF_SECONDS, 1);
    assert_eq!(MAX_BACKOFF_SECONDS, 300);
    assert_eq!(BACKOFF_MULTIPLIER, 2);
    assert_eq!(MAX_RETRY_ATTEMPTS, 10);
}

#[test]
fn test_backoff_sequence() {
    // Test the complete backoff sequence
    let expected_sequence = vec![
        1,   // retry 0
        2,   // retry 1
        4,   // retry 2
        8,   // retry 3
        16,  // retry 4
        32,  // retry 5
        64,  // retry 6
        128, // retry 7
        256, // retry 8
        300, // retry 9 (capped)
        300, // retry 10 (capped)
    ];
    
    for (retry_count, expected_secs) in expected_sequence.iter().enumerate() {
        let backoff = RetryManager::calculate_backoff(retry_count as u32);
        assert_eq!(
            backoff,
            Duration::from_secs(*expected_secs),
            "Backoff mismatch at retry {}",
            retry_count
        );
    }
}

#[tokio::test]
async fn test_send_with_retry_with_complex_payload() {
    let (retry_manager, _temp_dir) = create_test_retry_manager();
    
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
            {"name": "Chrome", "duration": 300},
            {"name": "VSCode", "duration": 300}
        ],
        "browser_tabs": [],
        "location": {
            "city": "San Francisco",
            "state": "CA",
            "country": "USA"
        }
    });
    
    let result = retry_manager.send_with_retry(&payload).await;
    assert!(result.is_ok());
    assert!(result.unwrap());
}

#[test]
fn test_backoff_overflow_protection() {
    // Test with very large retry counts to ensure no overflow
    let large_retry_count = 100;
    let backoff = RetryManager::calculate_backoff(large_retry_count);
    
    // Should be capped at MAX_BACKOFF_SECONDS
    assert_eq!(backoff, Duration::from_secs(MAX_BACKOFF_SECONDS));
}
