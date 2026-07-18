//! Integration tests for File Sync Manager module
//!
//! These tests verify the file sync manager's behavior with file downloads,
//! status tracking, and deletion synchronization.
//!
//! NOTE: These tests modify environment variables and should be run with:
//! `cargo test --test file_sync_manager_integration_test -- --test-threads=1`

use monitoring_client::modules::config::Config;
use monitoring_client::modules::file_sync_manager::{
    DownloadStatus, FileInfo, FileSyncManager, MAX_PARALLEL_DOWNLOADS,
};
use parking_lot::RwLock;
use std::sync::Arc;
use tempfile::TempDir;
use tokio::fs;

/// Helper function to create a test file sync manager
fn create_test_manager() -> (Arc<FileSyncManager>, TempDir) {
    let temp_dir = TempDir::new().expect("Failed to create temp directory");
    let env_path = temp_dir.path().join(".env");
    let download_path = temp_dir.path().join("downloads");
    
    // Convert Windows path to use forward slashes for .env file compatibility
    let download_path_str = download_path.to_str().unwrap().replace('\\', "/");
    
    // Create .env file
    std::fs::write(
        &env_path,
        format!(
            r#"SERVER_URL=http://localhost:5000/api/monitoring/data
AUTH_TOKEN=test-token
FILE_DOWNLOAD_PATH={}
"#,
            download_path_str
        ),
    )
    .expect("Failed to write .env file");
    
    // Clear environment variable before loading to avoid pollution from previous tests
    std::env::remove_var("FILE_DOWNLOAD_PATH");
    
    let config = Arc::new(RwLock::new(
        Config::load(Some(env_path.to_str().unwrap())).expect("Failed to load config"),
    ));
    
    let manager = Arc::new(
        FileSyncManager::new(config, "test@example.com".to_string(), "client-123".to_string())
            .expect("Failed to create manager"),
    );
    
    (manager, temp_dir)
}

#[tokio::test]
async fn test_file_sync_manager_creation() {

    let (manager, _temp_dir) = create_test_manager();
    
    assert!(!manager.is_running());
    assert_eq!(manager.downloaded_count(), 0);
}

#[tokio::test]
async fn test_start_creates_download_directory() {

    let (manager, temp_dir) = create_test_manager();
    let download_path = temp_dir.path().join("downloads");
    
    // Directory should not exist yet
    assert!(!download_path.exists());
    
    // Start manager
    manager.start().await.expect("Failed to start manager");
    
    // Directory should now exist
    assert!(download_path.exists());
    assert!(manager.is_running());
}

#[tokio::test]
async fn test_stop() {

    let (manager, _temp_dir) = create_test_manager();
    
    manager.start().await.expect("Failed to start manager");
    assert!(manager.is_running());
    
    manager.stop();
    assert!(!manager.is_running());
}

#[tokio::test]
async fn test_download_path() {

    let (manager, temp_dir) = create_test_manager();
    let expected_path = temp_dir.path().join("downloads");
    
    // The manager should use the path from the config
    // Compare as PathBuf to handle different path separators
    assert_eq!(manager.download_path(), &expected_path);
}

#[tokio::test]
async fn test_handle_file_deleted_removes_file() {

    let (manager, temp_dir) = create_test_manager();
    let download_path = temp_dir.path().join("downloads");
    
    // Start manager to create directory
    manager.start().await.expect("Failed to start manager");
    
    // Create a test file
    let test_file = download_path.join("test.txt");
    fs::write(&test_file, b"test content")
        .await
        .expect("Failed to write test file");
    
    assert!(test_file.exists());
    
    // Handle file deletion
    manager
        .handle_file_deleted("file-123", Some("test.txt"))
        .await
        .expect("Failed to handle deletion");
    
    // File should be deleted
    assert!(!test_file.exists());
}

#[tokio::test]
async fn test_handle_file_deleted_nonexistent_file() {

    let (manager, _temp_dir) = create_test_manager();
    
    manager.start().await.expect("Failed to start manager");
    
    // Should not error when deleting non-existent file
    let result = manager
        .handle_file_deleted("file-456", Some("nonexistent.txt"))
        .await;
    
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_handle_file_uploaded() {

    let (manager, _temp_dir) = create_test_manager();
    
    manager.start().await.expect("Failed to start manager");
    
    // Should not error (will fail to connect to server, but that's expected)
    let result = manager.handle_file_uploaded("newfile.txt").await;
    
    // Result may be error due to no server, but function should complete
    let _ = result;
}

#[tokio::test]
async fn test_update_when_not_running() {

    let (manager, _temp_dir) = create_test_manager();
    
    // Should not error when not running
    let result = manager.update().await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_check_and_download_when_not_running() {

    let (manager, _temp_dir) = create_test_manager();
    
    // Should not error when not running
    let result = manager.check_and_download().await;
    assert!(result.is_ok());
}

#[test]
fn test_max_parallel_downloads_constant() {
    assert_eq!(MAX_PARALLEL_DOWNLOADS, 5);
}

#[test]
fn test_download_status_serialization() {
    use serde_json;
    
    let status = DownloadStatus::Downloading;
    let json = serde_json::to_string(&status).unwrap();
    assert_eq!(json, "\"downloading\"");
    
    let status = DownloadStatus::Completed;
    let json = serde_json::to_string(&status).unwrap();
    assert_eq!(json, "\"completed\"");
    
    let status = DownloadStatus::Failed;
    let json = serde_json::to_string(&status).unwrap();
    assert_eq!(json, "\"failed\"");
    
    let status = DownloadStatus::Pending;
    let json = serde_json::to_string(&status).unwrap();
    assert_eq!(json, "\"pending\"");
}

#[test]
fn test_download_status_deserialization() {
    use serde_json;
    
    let status: DownloadStatus = serde_json::from_str("\"downloading\"").unwrap();
    assert_eq!(status, DownloadStatus::Downloading);
    
    let status: DownloadStatus = serde_json::from_str("\"completed\"").unwrap();
    assert_eq!(status, DownloadStatus::Completed);
    
    let status: DownloadStatus = serde_json::from_str("\"failed\"").unwrap();
    assert_eq!(status, DownloadStatus::Failed);
    
    let status: DownloadStatus = serde_json::from_str("\"pending\"").unwrap();
    assert_eq!(status, DownloadStatus::Pending);
}

#[test]
fn test_file_info_deserialization() {
    use serde_json;
    
    let json = r#"{
        "id": "file-123",
        "filename": "test.txt",
        "fileSize": 1024
    }"#;
    
    let file_info: FileInfo = serde_json::from_str(json).unwrap();
    assert_eq!(file_info.id, "file-123");
    assert_eq!(file_info.filename, "test.txt");
    assert_eq!(file_info.file_size, Some(1024));
}

#[test]
fn test_file_info_deserialization_without_size() {
    use serde_json;
    
    let json = r#"{
        "id": "file-456",
        "filename": "document.pdf"
    }"#;
    
    let file_info: FileInfo = serde_json::from_str(json).unwrap();
    assert_eq!(file_info.id, "file-456");
    assert_eq!(file_info.filename, "document.pdf");
    assert_eq!(file_info.file_size, None);
}

#[tokio::test]
async fn test_multiple_file_deletions() {

    let (manager, temp_dir) = create_test_manager();
    let download_path = temp_dir.path().join("downloads");
    
    manager.start().await.expect("Failed to start manager");
    
    // Create multiple test files
    for i in 1..=3 {
        let test_file = download_path.join(format!("test{}.txt", i));
        fs::write(&test_file, format!("content {}", i).as_bytes())
            .await
            .expect("Failed to write test file");
    }
    
    // Delete all files
    for i in 1..=3 {
        manager
            .handle_file_deleted(&format!("file-{}", i), Some(&format!("test{}.txt", i)))
            .await
            .expect("Failed to handle deletion");
    }
    
    // All files should be deleted
    for i in 1..=3 {
        let test_file = download_path.join(format!("test{}.txt", i));
        assert!(!test_file.exists());
    }
}

#[tokio::test]
async fn test_start_twice() {

    let (manager, _temp_dir) = create_test_manager();
    
    manager.start().await.expect("Failed to start manager");
    assert!(manager.is_running());
    
    // Starting again should not error
    manager.start().await.expect("Failed to start manager again");
    assert!(manager.is_running());
}

#[tokio::test]
async fn test_downloaded_count_tracking() {

    let (manager, _temp_dir) = create_test_manager();
    
    // Initial count should be 0
    assert_eq!(manager.downloaded_count(), 0);
    
    // Note: Actual download tracking is tested through integration with real server
    // This test verifies the counter exists and is accessible
}
