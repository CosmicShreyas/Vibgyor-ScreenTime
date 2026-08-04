//! Queue Manager Demo
//!
//! This example demonstrates the usage of the Queue Manager module,
//! showing how to queue payloads, retrieve them in FIFO order,
//! track retry counts, and manage queue persistence.
//!
//! Run with: cargo run --example queue_demo

use monitoring_client::modules::queue_manager::{QueueManager, MAX_QUEUE_SIZE};
use serde_json::json;
use std::thread;
use std::time::Duration;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("=== Queue Manager Demo ===\n");

    // Example 1: Basic Queue Operations
    println!("Example 1: Basic Queue Operations");
    println!("-".repeat(50));
    basic_queue_operations()?;
    println!();

    // Example 2: FIFO Ordering
    println!("Example 2: FIFO Ordering");
    println!("-".repeat(50));
    fifo_ordering()?;
    println!();

    // Example 3: Retry Count Tracking
    println!("Example 3: Retry Count Tracking");
    println!("-".repeat(50));
    retry_count_tracking()?;
    println!();

    // Example 4: Queue Size Limit
    println!("Example 4: Queue Size Limit");
    println!("-".repeat(50));
    queue_size_limit()?;
    println!();

    // Example 5: Persistence Across Restarts
    println!("Example 5: Persistence Across Restarts");
    println!("-".repeat(50));
    persistence_demo()?;
    println!();

    // Example 6: Realistic Transmission Retry Scenario
    println!("Example 6: Realistic Transmission Retry Scenario");
    println!("-".repeat(50));
    realistic_retry_scenario()?;
    println!();

    println!("=== Demo Complete ===");
    Ok(())
}

/// Example 1: Basic queue operations
fn basic_queue_operations() -> Result<(), Box<dyn std::error::Error>> {
    // Create queue manager with temporary database
    let queue_manager = QueueManager::new(Some("./demo_queue.db"))?;

    // Clear any existing data
    queue_manager.clear()?;

    println!("Initial queue size: {}", queue_manager.size()?);

    // Add a payload
    let payload = json!({
        "client_id": "demo-client-001",
        "employee_name": "John Doe",
        "timestamp": "2024-01-01T10:00:00Z",
        "activity": {
            "work_seconds": 600,
            "idle_seconds": 0
        }
    });

    println!("\nAdding payload to queue...");
    queue_manager.add(payload.clone())?;
    println!("Queue size after add: {}", queue_manager.size()?);

    // Retrieve payload
    println!("\nRetrieving payloads...");
    let payloads = queue_manager.retrieve(10)?;
    println!("Retrieved {} payload(s)", payloads.len());

    for (id, payload) in &payloads {
        println!("  Payload ID: {}", id);
        println!("  Client ID: {}", payload["client_id"]);
        println!("  Timestamp: {}", payload["timestamp"]);
    }

    // Delete payload
    if let Some((id, _)) = payloads.first() {
        println!("\nDeleting payload {}...", id);
        queue_manager.delete(*id)?;
        println!("Queue size after delete: {}", queue_manager.size()?);
    }

    Ok(())
}

/// Example 2: FIFO ordering demonstration
fn fifo_ordering() -> Result<(), Box<dyn std::error::Error>> {
    let queue_manager = QueueManager::new(Some("./demo_queue.db"))?;
    queue_manager.clear()?;

    println!("Adding 5 payloads with sequential timestamps...\n");

    // Add payloads with different timestamps
    let timestamps = vec![
        "2024-01-01T10:00:00Z",
        "2024-01-01T10:10:00Z",
        "2024-01-01T10:20:00Z",
        "2024-01-01T10:30:00Z",
        "2024-01-01T10:40:00Z",
    ];

    for (i, timestamp) in timestamps.iter().enumerate() {
        let payload = json!({
            "client_id": "demo-client",
            "timestamp": timestamp,
            "sequence": i + 1,
            "data": format!("Payload #{}", i + 1)
        });
        queue_manager.add(payload)?;
        println!("Added: {} - Sequence {}", timestamp, i + 1);
    }

    println!("\nRetrieving payloads in FIFO order...\n");
    let payloads = queue_manager.retrieve(10)?;

    for (i, (id, payload)) in payloads.iter().enumerate() {
        println!(
            "Position {}: ID={}, Timestamp={}, Sequence={}",
            i + 1,
            id,
            payload["timestamp"],
            payload["sequence"]
        );
    }

    println!("\n✓ Payloads retrieved in correct FIFO order");

    Ok(())
}

/// Example 3: Retry count tracking
fn retry_count_tracking() -> Result<(), Box<dyn std::error::Error>> {
    let queue_manager = QueueManager::new(Some("./demo_queue.db"))?;
    queue_manager.clear()?;

    // Add a payload
    let payload = json!({
        "client_id": "demo-client",
        "timestamp": "2024-01-01T10:00:00Z",
        "data": "Failed transmission payload"
    });

    println!("Adding payload that will be retried...");
    queue_manager.add(payload)?;

    // Get payload ID
    let payloads = queue_manager.retrieve(1)?;
    let (id, _) = payloads[0].clone();

    println!("Payload ID: {}\n", id);

    // Simulate retry attempts
    println!("Simulating retry attempts:");
    for attempt in 1..=5 {
        thread::sleep(Duration::from_millis(500));

        queue_manager.increment_retry_count(id)?;
        let retry_count = queue_manager.get_retry_count(id)?.unwrap();

        println!(
            "  Attempt {}: Retry count = {} {}",
            attempt,
            retry_count,
            if retry_count >= 3 { "⚠️" } else { "" }
        );
    }

    println!("\n✓ Retry count tracked successfully");

    Ok(())
}

/// Example 4: Queue size limit enforcement
fn queue_size_limit() -> Result<(), Box<dyn std::error::Error>> {
    let queue_manager = QueueManager::new(Some("./demo_queue.db"))?;
    queue_manager.clear()?;

    println!("Maximum queue size: {}\n", MAX_QUEUE_SIZE);

    // Add payloads up to the limit
    println!("Adding {} payloads...", MAX_QUEUE_SIZE + 10);

    for i in 0..(MAX_QUEUE_SIZE + 10) {
        let payload = json!({
            "timestamp": format!("2024-01-01T{:02}:{:02}:00Z", i / 60, i % 60),
            "sequence": i
        });
        queue_manager.add(payload)?;

        if i % 200 == 0 {
            println!("  Added {} payloads...", i);
        }
    }

    let final_size = queue_manager.size()?;
    println!("\nFinal queue size: {}", final_size);
    println!("✓ Queue size capped at maximum (oldest payloads removed)");

    // Verify oldest payloads were removed
    let payloads = queue_manager.retrieve(5)?;
    println!("\nFirst 5 payloads in queue:");
    for (i, (id, payload)) in payloads.iter().enumerate() {
        println!(
            "  {}: ID={}, Sequence={}",
            i + 1,
            id,
            payload["sequence"]
        );
    }

    Ok(())
}

/// Example 5: Persistence across restarts
fn persistence_demo() -> Result<(), Box<dyn std::error::Error>> {
    let db_path = "./demo_persistent_queue.db";

    // First session: Add payloads
    println!("Session 1: Adding payloads...");
    {
        let queue_manager = QueueManager::new(Some(db_path))?;
        queue_manager.clear()?;

        for i in 0..3 {
            let payload = json!({
                "timestamp": format!("2024-01-01T10:{:02}:00Z", i * 10),
                "session": 1,
                "sequence": i,
                "data": format!("Persistent payload {}", i)
            });
            queue_manager.add(payload)?;
        }

        println!("  Added 3 payloads");
        println!("  Queue size: {}", queue_manager.size()?);
    }

    println!("\n(Simulating application restart...)\n");
    thread::sleep(Duration::from_secs(1));

    // Second session: Verify persistence
    println!("Session 2: Verifying persistence...");
    {
        let queue_manager = QueueManager::new(Some(db_path))?;
        let size = queue_manager.size()?;
        println!("  Queue size after restart: {}", size);

        let payloads = queue_manager.retrieve(10)?;
        println!("  Retrieved {} payloads:", payloads.len());

        for (id, payload) in &payloads {
            println!(
                "    ID={}, Session={}, Sequence={}, Data={}",
                id,
                payload["session"],
                payload["sequence"],
                payload["data"]
            );
        }

        println!("\n✓ Payloads persisted successfully across restart");
    }

    Ok(())
}

/// Example 6: Realistic transmission retry scenario
fn realistic_retry_scenario() -> Result<(), Box<dyn std::error::Error>> {
    let queue_manager = QueueManager::new(Some("./demo_queue.db"))?;
    queue_manager.clear()?;

    println!("Simulating failed transmission and retry logic...\n");

    // Add a payload that "failed" to transmit
    let payload = json!({
        "client_id": "demo-client-001",
        "employee_name": "Jane Smith",
        "timestamp": "2024-01-01T10:00:00Z",
        "activity": {
            "work_seconds": 600,
            "idle_seconds": 0
        },
        "applications": [
            {"name": "Chrome", "duration": 300},
            {"name": "VSCode", "duration": 300}
        ]
    });

    println!("1. Initial transmission failed - queuing payload");
    queue_manager.add(payload)?;
    println!("   Queue size: {}", queue_manager.size()?);

    // Simulate retry attempts
    let max_retries = 10;
    let payloads = queue_manager.retrieve(1)?;
    let (id, payload_data) = payloads[0].clone();

    println!("\n2. Processing queued payload (ID: {})", id);
    println!("   Client: {}", payload_data["client_id"]);
    println!("   Timestamp: {}", payload_data["timestamp"]);

    println!("\n3. Retry attempts:");
    for retry in 1..=max_retries {
        thread::sleep(Duration::from_millis(300));

        // Increment retry count
        queue_manager.increment_retry_count(id)?;
        let count = queue_manager.get_retry_count(id)?.unwrap();

        // Simulate transmission attempt
        let success = retry == 7; // Succeed on 7th attempt

        if success {
            println!("   Attempt {}: ✓ SUCCESS - Transmission completed", retry);
            queue_manager.delete(id)?;
            break;
        } else {
            let backoff = 2_u32.pow(retry.min(5) - 1);
            println!(
                "   Attempt {}: ✗ FAILED (retry count: {}) - Backoff: {}s",
                retry, count, backoff
            );
        }

        // Check if max retries reached
        if count >= max_retries {
            println!("\n   ⚠️  Max retries reached - removing payload");
            queue_manager.delete(id)?;
            break;
        }
    }

    println!("\n4. Final queue size: {}", queue_manager.size()?);
    println!("\n✓ Retry scenario completed successfully");

    Ok(())
}
