//! Integration tests for Queue Manager module
//!
//! These tests verify the queue manager's behavior in realistic scenarios,
//! including persistence across restarts, concurrent access, and edge cases.

use monitoring_client::modules::queue_manager::{QueueManager, MAX_QUEUE_SIZE};
use serde_json::json;
use std::thread;
use tempfile::TempDir;

/// Helper function to create a test queue manager with a temporary database
fn create_test_queue_manager() -> (QueueManager, TempDir) {
    let temp_dir = TempDir::new().expect("Failed to create temp directory");
    let db_path = temp_dir.path().join("test_queue.db");
    let queue_manager = QueueManager::new(Some(&db_path)).expect("Failed to create queue manager");
    (queue_manager, temp_dir)
}

#[test]
fn test_basic_queue_operations() {
    let (queue_manager, _temp_dir) = create_test_queue_manager();

    // Initially empty
    assert_eq!(queue_manager.size().unwrap(), 0);

    // Add a payload
    let payload = json!({
        "client_id": "test-client-001",
        "timestamp": "2024-01-01T10:00:00Z",
        "data": "test data"
    });
    queue_manager.add(payload.clone()).unwrap();

    // Verify size
    assert_eq!(queue_manager.size().unwrap(), 1);

    // Retrieve payload
    let payloads = queue_manager.retrieve(10).unwrap();
    assert_eq!(payloads.len(), 1);
    assert_eq!(payloads[0].1, payload);

    // Delete payload
    let (id, _) = payloads[0].clone();
    assert!(queue_manager.delete(id).unwrap());
    assert_eq!(queue_manager.size().unwrap(), 0);
}

#[test]
fn test_fifo_ordering_with_multiple_payloads() {
    let (queue_manager, _temp_dir) = create_test_queue_manager();

    // Add payloads with sequential timestamps
    let timestamps = vec![
        "2024-01-01T10:00:00Z",
        "2024-01-01T10:05:00Z",
        "2024-01-01T10:10:00Z",
        "2024-01-01T10:15:00Z",
        "2024-01-01T10:20:00Z",
    ];

    for (i, timestamp) in timestamps.iter().enumerate() {
        let payload = json!({
            "client_id": "test-client",
            "timestamp": timestamp,
            "sequence": i,
            "data": format!("payload {}", i)
        });
        queue_manager.add(payload).unwrap();
    }

    // Retrieve all payloads
    let payloads = queue_manager.retrieve(10).unwrap();
    assert_eq!(payloads.len(), 5);

    // Verify FIFO order
    for (i, (_, payload)) in payloads.iter().enumerate() {
        assert_eq!(payload.get("sequence").unwrap().as_u64().unwrap(), i as u64);
        assert_eq!(
            payload.get("timestamp").unwrap().as_str().unwrap(),
            timestamps[i]
        );
    }
}

#[test]
fn test_fifo_ordering_with_same_timestamp() {
    let (queue_manager, _temp_dir) = create_test_queue_manager();

    // Add multiple payloads with the same timestamp
    let timestamp = "2024-01-01T10:00:00Z";
    for i in 0..5 {
        let payload = json!({
            "timestamp": timestamp,
            "sequence": i,
            "data": format!("payload {}", i)
        });
        queue_manager.add(payload).unwrap();
    }

    // Retrieve all payloads
    let payloads = queue_manager.retrieve(10).unwrap();
    assert_eq!(payloads.len(), 5);

    // Verify order by ID (insertion order)
    for (i, (_, payload)) in payloads.iter().enumerate() {
        assert_eq!(payload.get("sequence").unwrap().as_u64().unwrap(), i as u64);
    }
}

#[test]
fn test_retrieve_with_limit() {
    let (queue_manager, _temp_dir) = create_test_queue_manager();

    // Add 10 payloads
    for i in 0..10 {
        let payload = json!({
            "timestamp": format!("2024-01-01T10:{:02}:00Z", i),
            "sequence": i
        });
        queue_manager.add(payload).unwrap();
    }

    // Retrieve only 3 payloads
    let payloads = queue_manager.retrieve(3).unwrap();
    assert_eq!(payloads.len(), 3);

    // Verify we got the first 3
    for (i, (_, payload)) in payloads.iter().enumerate() {
        assert_eq!(payload.get("sequence").unwrap().as_u64().unwrap(), i as u64);
    }

    // Verify queue still has all 10
    assert_eq!(queue_manager.size().unwrap(), 10);
}

#[test]
fn test_max_queue_size_enforcement() {
    let (queue_manager, _temp_dir) = create_test_queue_manager();

    // Add MAX_QUEUE_SIZE + 10 payloads
    for i in 0..(MAX_QUEUE_SIZE + 10) {
        let payload = json!({
            "timestamp": format!("2024-01-01T{:02}:{:02}:00Z", i / 60, i % 60),
            "sequence": i
        });
        queue_manager.add(payload).unwrap();
    }

    // Queue should be capped at MAX_QUEUE_SIZE
    assert_eq!(queue_manager.size().unwrap(), MAX_QUEUE_SIZE);

    // Verify oldest payloads were removed (first 10)
    let payloads = queue_manager.retrieve(20).unwrap();
    assert_eq!(payloads.len(), 20);

    // First payload should have sequence 10 (0-9 were removed)
    assert_eq!(
        payloads[0].1.get("sequence").unwrap().as_u64().unwrap(),
        10
    );
}

#[test]
fn test_retry_count_tracking() {
    let (queue_manager, _temp_dir) = create_test_queue_manager();

    // Add a payload
    let payload = json!({"data": "test"});
    queue_manager.add(payload).unwrap();

    // Get payload ID
    let payloads = queue_manager.retrieve(1).unwrap();
    let (id, _) = payloads[0].clone();

    // Initial retry count should be 0
    assert_eq!(queue_manager.get_retry_count(id).unwrap(), Some(0));

    // Increment retry count multiple times
    for expected_count in 1..=5 {
        queue_manager.increment_retry_count(id).unwrap();
        assert_eq!(
            queue_manager.get_retry_count(id).unwrap(),
            Some(expected_count)
        );
    }

    // Verify payload is still in queue
    assert_eq!(queue_manager.size().unwrap(), 1);
}

#[test]
fn test_retry_count_for_nonexistent_payload() {
    let (queue_manager, _temp_dir) = create_test_queue_manager();

    // Try to get retry count for non-existent payload
    assert_eq!(queue_manager.get_retry_count(999).unwrap(), None);

    // Try to increment retry count for non-existent payload
    assert!(!queue_manager.increment_retry_count(999).unwrap());
}

#[test]
fn test_delete_nonexistent_payload() {
    let (queue_manager, _temp_dir) = create_test_queue_manager();

    // Try to delete non-existent payload
    assert!(!queue_manager.delete(999).unwrap());
}

#[test]
fn test_clear_queue() {
    let (queue_manager, _temp_dir) = create_test_queue_manager();

    // Add multiple payloads
    for i in 0..10 {
        let payload = json!({"sequence": i});
        queue_manager.add(payload).unwrap();
    }

    assert_eq!(queue_manager.size().unwrap(), 10);

    // Clear queue
    let deleted = queue_manager.clear().unwrap();
    assert_eq!(deleted, 10);
    assert_eq!(queue_manager.size().unwrap(), 0);

    // Verify retrieve returns empty
    let payloads = queue_manager.retrieve(10).unwrap();
    assert_eq!(payloads.len(), 0);
}

#[test]
fn test_clear_empty_queue() {
    let (queue_manager, _temp_dir) = create_test_queue_manager();

    // Clear empty queue
    let deleted = queue_manager.clear().unwrap();
    assert_eq!(deleted, 0);
    assert_eq!(queue_manager.size().unwrap(), 0);
}

#[test]
fn test_persistence_across_restarts() {
    let temp_dir = TempDir::new().expect("Failed to create temp directory");
    let db_path = temp_dir.path().join("persistent_queue.db");

    // First session: Add payloads
    {
        let queue_manager = QueueManager::new(Some(&db_path)).unwrap();

        for i in 0..5 {
            let payload = json!({
                "timestamp": format!("2024-01-01T10:{:02}:00Z", i),
                "sequence": i,
                "data": format!("persistent payload {}", i)
            });
            queue_manager.add(payload).unwrap();
        }

        assert_eq!(queue_manager.size().unwrap(), 5);
    }

    // Second session: Verify payloads persisted
    {
        let queue_manager = QueueManager::new(Some(&db_path)).unwrap();
        assert_eq!(queue_manager.size().unwrap(), 5);

        let payloads = queue_manager.retrieve(10).unwrap();
        assert_eq!(payloads.len(), 5);

        // Verify data integrity
        for (i, (_, payload)) in payloads.iter().enumerate() {
            assert_eq!(payload.get("sequence").unwrap().as_u64().unwrap(), i as u64);
            assert_eq!(
                payload.get("data").unwrap().as_str().unwrap(),
                format!("persistent payload {}", i)
            );
        }
    }

    // Third session: Delete some payloads
    {
        let queue_manager = QueueManager::new(Some(&db_path)).unwrap();

        let payloads = queue_manager.retrieve(3).unwrap();
        for (id, _) in payloads {
            queue_manager.delete(id).unwrap();
        }

        assert_eq!(queue_manager.size().unwrap(), 2);
    }

    // Fourth session: Verify deletions persisted
    {
        let queue_manager = QueueManager::new(Some(&db_path)).unwrap();
        assert_eq!(queue_manager.size().unwrap(), 2);

        let payloads = queue_manager.retrieve(10).unwrap();
        assert_eq!(payloads.len(), 2);

        // Should have sequences 3 and 4 (0, 1, 2 were deleted)
        assert_eq!(payloads[0].1.get("sequence").unwrap().as_u64().unwrap(), 3);
        assert_eq!(payloads[1].1.get("sequence").unwrap().as_u64().unwrap(), 4);
    }
}

#[test]
fn test_concurrent_access() {
    let temp_dir = TempDir::new().expect("Failed to create temp directory");
    let db_path = temp_dir.path().join("concurrent_queue.db");

    // SQLite connections are not Sync, so we create separate queue managers per thread
    // This simulates multiple processes accessing the same database file
    let mut handles = vec![];
    for thread_id in 0..5 {
        let db_path_clone = db_path.clone();
        let handle = thread::spawn(move || {
            // Each thread creates its own queue manager (connection)
            let qm = QueueManager::new(Some(&db_path_clone)).unwrap();
            for i in 0..10 {
                let payload = json!({
                    "thread_id": thread_id,
                    "sequence": i,
                    "data": format!("thread {} payload {}", thread_id, i)
                });
                qm.add(payload).unwrap();
            }
        });
        handles.push(handle);
    }

    // Wait for all threads to complete
    for handle in handles {
        handle.join().unwrap();
    }

    // Create a new queue manager to verify all payloads were added
    let queue_manager = QueueManager::new(Some(&db_path)).unwrap();
    assert_eq!(queue_manager.size().unwrap(), 50);

    // Retrieve all payloads
    let payloads = queue_manager.retrieve(100).unwrap();
    assert_eq!(payloads.len(), 50);
}

#[test]
fn test_payload_with_missing_timestamp() {
    let (queue_manager, _temp_dir) = create_test_queue_manager();

    // Add payload without timestamp
    let payload = json!({
        "client_id": "test-client",
        "data": "no timestamp"
    });
    queue_manager.add(payload).unwrap();

    // Should still be added successfully
    assert_eq!(queue_manager.size().unwrap(), 1);

    // Retrieve and verify
    let payloads = queue_manager.retrieve(1).unwrap();
    assert_eq!(payloads.len(), 1);
    assert_eq!(
        payloads[0].1.get("data").unwrap().as_str().unwrap(),
        "no timestamp"
    );
}

#[test]
fn test_payload_with_complex_structure() {
    let (queue_manager, _temp_dir) = create_test_queue_manager();

    // Add payload with nested structure
    let payload = json!({
        "client_id": "test-client",
        "timestamp": "2024-01-01T10:00:00Z",
        "activity": {
            "work_seconds": 600,
            "idle_seconds": 0
        },
        "applications": [
            {"name": "Chrome", "duration": 300},
            {"name": "VSCode", "duration": 300}
        ],
        "browser_tabs": [
            {"title": "GitHub", "url": "https://github.com", "duration": 150},
            {"title": "Stack Overflow", "url": "https://stackoverflow.com", "duration": 150}
        ],
        "location": {
            "city": "San Francisco",
            "state": "CA",
            "country": "USA"
        }
    });

    queue_manager.add(payload.clone()).unwrap();

    // Retrieve and verify structure is preserved
    let payloads = queue_manager.retrieve(1).unwrap();
    assert_eq!(payloads.len(), 1);
    assert_eq!(payloads[0].1, payload);

    // Verify nested fields
    assert_eq!(
        payloads[0].1["activity"]["work_seconds"]
            .as_u64()
            .unwrap(),
        600
    );
    assert_eq!(payloads[0].1["applications"].as_array().unwrap().len(), 2);
    assert_eq!(payloads[0].1["browser_tabs"].as_array().unwrap().len(), 2);
    assert_eq!(
        payloads[0].1["location"]["city"].as_str().unwrap(),
        "San Francisco"
    );
}

#[test]
fn test_empty_payload_rejection() {
    let (queue_manager, _temp_dir) = create_test_queue_manager();

    // Try to add null payload
    let result = queue_manager.add(json!(null));
    assert!(result.is_err());

    // Queue should remain empty
    assert_eq!(queue_manager.size().unwrap(), 0);
}

#[test]
fn test_retrieve_from_empty_queue() {
    let (queue_manager, _temp_dir) = create_test_queue_manager();

    // Retrieve from empty queue
    let payloads = queue_manager.retrieve(10).unwrap();
    assert_eq!(payloads.len(), 0);
}

#[test]
fn test_multiple_retrieve_operations() {
    let (queue_manager, _temp_dir) = create_test_queue_manager();

    // Add 10 payloads
    for i in 0..10 {
        let payload = json!({"sequence": i});
        queue_manager.add(payload).unwrap();
    }

    // Retrieve in batches - retrieve doesn't delete, so we get the same items
    let batch1 = queue_manager.retrieve(3).unwrap();
    assert_eq!(batch1.len(), 3);
    // First batch should have sequences 0, 1, 2
    assert_eq!(batch1[0].1.get("sequence").unwrap().as_u64().unwrap(), 0);

    let batch2 = queue_manager.retrieve(3).unwrap();
    assert_eq!(batch2.len(), 3);
    // Second batch should also have sequences 0, 1, 2 (same items)
    assert_eq!(batch2[0].1.get("sequence").unwrap().as_u64().unwrap(), 0);

    let batch3 = queue_manager.retrieve(10).unwrap();
    assert_eq!(batch3.len(), 10); // All 10 items

    // All payloads should still be in queue (retrieve doesn't delete)
    assert_eq!(queue_manager.size().unwrap(), 10);
}

#[test]
fn test_realistic_retry_scenario() {
    let (queue_manager, _temp_dir) = create_test_queue_manager();

    // Add a payload
    let payload = json!({
        "client_id": "test-client",
        "timestamp": "2024-01-01T10:00:00Z",
        "data": "important data"
    });
    queue_manager.add(payload).unwrap();

    // Simulate retry attempts
    let max_retries = 10;
    let payloads = queue_manager.retrieve(1).unwrap();
    let (id, _) = payloads[0].clone();

    for retry in 1..=max_retries {
        // Increment retry count
        queue_manager.increment_retry_count(id).unwrap();

        // Check retry count
        let count = queue_manager.get_retry_count(id).unwrap().unwrap();
        assert_eq!(count, retry);

        // Simulate: if max retries reached, delete payload
        if count >= max_retries {
            queue_manager.delete(id).unwrap();
            break;
        }
    }

    // Payload should be deleted after max retries
    assert_eq!(queue_manager.size().unwrap(), 0);
}

#[test]
fn test_queue_size_after_operations() {
    let (queue_manager, _temp_dir) = create_test_queue_manager();

    // Add 5 payloads
    for i in 0..5 {
        let payload = json!({"sequence": i});
        queue_manager.add(payload).unwrap();
    }
    assert_eq!(queue_manager.size().unwrap(), 5);

    // Delete 2 payloads
    let payloads = queue_manager.retrieve(2).unwrap();
    for (id, _) in payloads {
        queue_manager.delete(id).unwrap();
    }
    assert_eq!(queue_manager.size().unwrap(), 3);

    // Add 3 more payloads
    for i in 5..8 {
        let payload = json!({"sequence": i});
        queue_manager.add(payload).unwrap();
    }
    assert_eq!(queue_manager.size().unwrap(), 6);

    // Clear queue
    queue_manager.clear().unwrap();
    assert_eq!(queue_manager.size().unwrap(), 0);
}
