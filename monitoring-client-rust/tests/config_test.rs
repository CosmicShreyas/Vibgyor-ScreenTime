//! Unit tests for configuration module

use monitoring_client::modules::config::{
    Config, generate_client_id, retrieve_client_id, store_client_id,
    store_employee_name, retrieve_employee_name,
};
use std::env;
use std::fs;
use std::path::PathBuf;

/// Helper to get test config directory
fn get_test_config_dir() -> PathBuf {
    if cfg!(target_os = "windows") {
        let appdata = env::var("APPDATA").expect("APPDATA not found");
        PathBuf::from(appdata).join("VibgyorSeek")
    } else if cfg!(target_os = "macos") {
        let home = env::var("HOME").expect("HOME not found");
        PathBuf::from(home).join("Library").join("Application Support").join("VibgyorSeek")
    } else {
        let home = env::var("HOME").expect("HOME not found");
        PathBuf::from(home).join(".config").join("VibgyorSeek")
    }
}

/// Helper to clean up test config file
fn cleanup_test_config() {
    let config_path = get_test_config_dir().join("employee_config.json");
    if config_path.exists() {
        fs::remove_file(config_path).ok();
    }
}

/// Helper to set up test environment
fn setup_test_env() {
    env::remove_var("SERVER_URL");
    env::remove_var("AUTH_TOKEN");
    env::remove_var("SCREENSHOT_INTERVAL_MINUTES");
    env::remove_var("DATA_SEND_INTERVAL_MINUTES");
    env::remove_var("LOCATION_UPDATE_INTERVAL_MINUTES");
    env::remove_var("IDLE_THRESHOLD_SECONDS");
    env::remove_var("SCREENSHOT_QUALITY");
    env::remove_var("LOG_LEVEL");
    env::remove_var("APP_USAGE_POLL_INTERVAL_SECONDS");
    env::remove_var("FILE_DOWNLOAD_PATH");
    env::remove_var("FILE_SYNC_INTERVAL");
    env::remove_var("OTA_ENABLED");
    env::remove_var("OTA_GITHUB_REPO_URL");
    env::remove_var("OTA_CHECK_ON_STARTUP");
    env::remove_var("OTA_CHECK_INTERVAL_MINUTES");
    env::remove_var("OTA_RELEASE_ASSET_NAME");
    env::remove_var("OTA_EXECUTABLE_NAME");
}

/// Helper to clean up test environment
fn cleanup_test_env() {
    setup_test_env();
}

#[test]
fn test_config_load_with_all_required_fields() {
    setup_test_env();
    
    env::set_var("SERVER_URL", "http://localhost:5000/api/monitoring/data");
    env::set_var("AUTH_TOKEN", "test-token-12345");
    
    let config = Config::load(None).expect("Failed to load config");
    
    assert_eq!(config.server_url, "http://localhost:5000/api/monitoring/data");
    assert_eq!(config.auth_token, "test-token-12345");
    
    // Check defaults
    assert_eq!(config.screenshot_interval_minutes, 10);
    assert_eq!(config.data_send_interval_minutes, 10);
    assert_eq!(config.location_update_interval_minutes, 30);
    assert_eq!(config.idle_threshold_seconds, 300);
    assert_eq!(config.screenshot_quality, 75);
    assert_eq!(config.log_level, "INFO");
    assert_eq!(config.app_usage_poll_interval_seconds, 10.0);
    assert_eq!(config.file_sync_interval_seconds, 30);
    assert!(config.ota_enabled);
    assert_eq!(config.ota_github_repo_url, "");
    assert!(config.ota_check_on_startup);
    assert_eq!(config.ota_check_interval_minutes, 360);
    assert!(config.ota_release_asset_name.is_none());
    assert!(config.ota_executable_name.is_none());
    
    cleanup_test_env();
}

#[test]
fn test_config_load_missing_server_url() {
    setup_test_env();
    
    env::set_var("AUTH_TOKEN", "test-token");
    
    let result = Config::load(None);
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("SERVER_URL"));
    
    cleanup_test_env();
}

#[test]
fn test_config_load_missing_auth_token() {
    setup_test_env();
    
    env::set_var("SERVER_URL", "http://localhost:5000");
    
    let result = Config::load(None);
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("AUTH_TOKEN"));
    
    cleanup_test_env();
}

#[test]
fn test_config_load_empty_server_url() {
    setup_test_env();
    
    env::set_var("SERVER_URL", "   ");
    env::set_var("AUTH_TOKEN", "test-token");
    
    let result = Config::load(None);
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("SERVER_URL"));
    
    cleanup_test_env();
}

#[test]
fn test_config_load_empty_auth_token() {
    setup_test_env();
    
    env::set_var("SERVER_URL", "http://localhost:5000");
    env::set_var("AUTH_TOKEN", "   ");
    
    let result = Config::load(None);
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("AUTH_TOKEN"));
    
    cleanup_test_env();
}

#[test]
fn test_config_load_with_custom_intervals() {
    setup_test_env();
    
    env::set_var("SERVER_URL", "http://localhost:5000");
    env::set_var("AUTH_TOKEN", "test-token");
    env::set_var("SCREENSHOT_INTERVAL_MINUTES", "15");
    env::set_var("DATA_SEND_INTERVAL_MINUTES", "5");
    env::set_var("LOCATION_UPDATE_INTERVAL_MINUTES", "60");
    env::set_var("IDLE_THRESHOLD_SECONDS", "600");
    
    let config = Config::load(None).expect("Failed to load config");
    
    assert_eq!(config.screenshot_interval_minutes, 15);
    assert_eq!(config.data_send_interval_minutes, 5);
    assert_eq!(config.location_update_interval_minutes, 60);
    assert_eq!(config.idle_threshold_seconds, 600);
    
    cleanup_test_env();
}

#[test]
fn test_config_load_with_invalid_intervals() {
    setup_test_env();
    
    env::set_var("SERVER_URL", "http://localhost:5000");
    env::set_var("AUTH_TOKEN", "test-token");
    env::set_var("SCREENSHOT_INTERVAL_MINUTES", "0"); // Invalid: must be > 0
    env::set_var("DATA_SEND_INTERVAL_MINUTES", "-5"); // Invalid: negative
    env::set_var("LOCATION_UPDATE_INTERVAL_MINUTES", "abc"); // Invalid: not a number
    
    let config = Config::load(None).expect("Failed to load config");
    
    // Should use defaults for invalid values
    assert_eq!(config.screenshot_interval_minutes, 10);
    assert_eq!(config.data_send_interval_minutes, 10);
    assert_eq!(config.location_update_interval_minutes, 30);
    
    cleanup_test_env();
}

#[test]
fn test_config_load_with_screenshot_quality() {
    setup_test_env();
    
    env::set_var("SERVER_URL", "http://localhost:5000");
    env::set_var("AUTH_TOKEN", "test-token");
    env::set_var("SCREENSHOT_QUALITY", "90");
    
    let config = Config::load(None).expect("Failed to load config");
    assert_eq!(config.screenshot_quality, 90);
    
    cleanup_test_env();
}

#[test]
fn test_config_load_with_invalid_screenshot_quality() {
    setup_test_env();
    
    env::set_var("SERVER_URL", "http://localhost:5000");
    env::set_var("AUTH_TOKEN", "test-token");
    
    // Test quality > 100
    env::set_var("SCREENSHOT_QUALITY", "150");
    let config = Config::load(None).expect("Failed to load config");
    assert_eq!(config.screenshot_quality, 75); // Should use default
    
    // Test quality < 1
    env::set_var("SCREENSHOT_QUALITY", "0");
    let config = Config::load(None).expect("Failed to load config");
    assert_eq!(config.screenshot_quality, 75); // Should use default
    
    // Test invalid string
    env::set_var("SCREENSHOT_QUALITY", "high");
    let config = Config::load(None).expect("Failed to load config");
    assert_eq!(config.screenshot_quality, 75); // Should use default
    
    cleanup_test_env();
}

#[test]
fn test_config_load_with_log_levels() {
    setup_test_env();
    
    env::set_var("SERVER_URL", "http://localhost:5000");
    env::set_var("AUTH_TOKEN", "test-token");
    
    let valid_levels = vec!["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"];
    
    for level in valid_levels {
        env::set_var("LOG_LEVEL", level);
        let config = Config::load(None).expect("Failed to load config");
        assert_eq!(config.log_level, level);
        
        // Test lowercase
        env::set_var("LOG_LEVEL", level.to_lowercase());
        let config = Config::load(None).expect("Failed to load config");
        assert_eq!(config.log_level, level); // Should be uppercase
    }
    
    // Test invalid level
    env::set_var("LOG_LEVEL", "INVALID");
    let config = Config::load(None).expect("Failed to load config");
    assert_eq!(config.log_level, "INFO"); // Should use default
    
    cleanup_test_env();
}

#[test]
fn test_config_load_with_app_usage_poll_interval() {
    setup_test_env();
    
    env::set_var("SERVER_URL", "http://localhost:5000");
    env::set_var("AUTH_TOKEN", "test-token");
    env::set_var("APP_USAGE_POLL_INTERVAL_SECONDS", "5.5");
    
    let config = Config::load(None).expect("Failed to load config");
    assert_eq!(config.app_usage_poll_interval_seconds, 5.5);
    
    // Values below the 0.5-second floor fall back to the default.
    env::set_var("APP_USAGE_POLL_INTERVAL_SECONDS", "0.25");
    let config = Config::load(None).expect("Failed to load config");
    assert_eq!(config.app_usage_poll_interval_seconds, 2.0); // Should use default
    
    cleanup_test_env();
}

#[test]
fn test_config_load_with_file_download_path() {
    setup_test_env();
    
    env::set_var("SERVER_URL", "http://localhost:5000");
    env::set_var("AUTH_TOKEN", "test-token");
    env::set_var("FILE_DOWNLOAD_PATH", "D:\\CustomPath\\Files");
    
    let config = Config::load(None).expect("Failed to load config");
    assert_eq!(config.file_download_path.to_str().unwrap(), "D:\\CustomPath\\Files");
    
    cleanup_test_env();
}

#[test]
fn test_config_reload() {
    setup_test_env();
    
    env::set_var("SERVER_URL", "http://localhost:5000");
    env::set_var("AUTH_TOKEN", "test-token");
    env::set_var("SCREENSHOT_INTERVAL_MINUTES", "10");
    
    let mut config = Config::load(None).expect("Failed to load config");
    assert_eq!(config.screenshot_interval_minutes, 10);
    
    // Change environment variable
    env::set_var("SCREENSHOT_INTERVAL_MINUTES", "20");
    
    // Reload configuration
    config.reload(None).expect("Failed to reload config");
    assert_eq!(config.screenshot_interval_minutes, 20);
    
    cleanup_test_env();
}

#[test]
fn test_generate_client_id() {
    let id1 = generate_client_id();
    let id2 = generate_client_id();
    
    // Should be valid UUIDs
    assert!(uuid::Uuid::parse_str(&id1).is_ok());
    assert!(uuid::Uuid::parse_str(&id2).is_ok());
    
    // Should be unique
    assert_ne!(id1, id2);
    
    // Should be version 4 (random)
    let uuid = uuid::Uuid::parse_str(&id1).unwrap();
    assert_eq!(uuid.get_version(), Some(uuid::Version::Random));
}

#[test]
fn test_store_and_retrieve_employee_name() {
    cleanup_test_config();
    
    let name = "John Doe";
    
    store_employee_name(name).expect("Failed to store employee name");
    
    let retrieved = retrieve_employee_name().expect("Failed to retrieve employee name");
    assert_eq!(retrieved, Some(name.to_string()));
    
    cleanup_test_config();
}

#[test]
fn test_store_employee_name_with_whitespace() {
    cleanup_test_config();
    
    let name = "  Jane Smith  ";
    
    store_employee_name(name).expect("Failed to store employee name");
    
    let retrieved = retrieve_employee_name().expect("Failed to retrieve employee name");
    assert_eq!(retrieved, Some("Jane Smith".to_string())); // Should be trimmed
    
    cleanup_test_config();
}

#[test]
fn test_store_employee_name_empty() {
    let result = store_employee_name("");
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("empty"));
}

#[test]
fn test_store_employee_name_whitespace_only() {
    let result = store_employee_name("   ");
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("empty"));
}

#[test]
fn test_retrieve_employee_name_not_found() {
    cleanup_test_config();
    
    let retrieved = retrieve_employee_name().expect("Failed to retrieve employee name");
    assert!(retrieved.is_none());
}

#[test]
fn test_store_and_retrieve_client_id() {
    cleanup_test_config();
    
    let client_id = "test-client-id-12345";
    
    store_client_id(client_id).expect("Failed to store client ID");
    
    let retrieved = retrieve_client_id().expect("Failed to retrieve client ID");
    assert_eq!(retrieved, client_id);
    
    cleanup_test_config();
}

#[test]
fn test_retrieve_client_id_generates_if_not_found() {
    cleanup_test_config();
    
    let client_id = retrieve_client_id().expect("Failed to retrieve client ID");
    
    // Should be a valid UUID
    assert!(uuid::Uuid::parse_str(&client_id).is_ok());
    
    // Retrieving again should return the same ID
    let client_id2 = retrieve_client_id().expect("Failed to retrieve client ID");
    assert_eq!(client_id, client_id2);
    
    cleanup_test_config();
}

#[test]
fn test_config_default() {
    let config = Config::default();
    
    assert_eq!(config.server_url, "");
    assert_eq!(config.auth_token, "");
    assert_eq!(config.screenshot_interval_minutes, 10);
    assert_eq!(config.data_send_interval_minutes, 10);
    assert_eq!(config.location_update_interval_minutes, 30);
    assert_eq!(config.idle_threshold_seconds, 300);
    assert_eq!(config.screenshot_quality, 75);
    assert_eq!(config.log_level, "INFO");
    assert_eq!(config.app_usage_poll_interval_seconds, 10.0);
    assert_eq!(config.file_sync_interval_seconds, 30);
    assert!(config.ota_enabled);
    assert!(config.ota_check_on_startup);
    assert_eq!(config.ota_check_interval_minutes, 360);
}

#[test]
fn test_config_load_with_ota_settings() {
    setup_test_env();

    env::set_var("SERVER_URL", "http://localhost:5000");
    env::set_var("AUTH_TOKEN", "test-token");
    env::set_var("OTA_ENABLED", "true");
    env::set_var("OTA_GITHUB_REPO_URL", "https://github.com/CosmicShreyas/Vibgyor-Screentime");
    env::set_var("OTA_CHECK_ON_STARTUP", "true");
    env::set_var("OTA_CHECK_INTERVAL_MINUTES", "120");
    env::set_var("OTA_RELEASE_ASSET_NAME", "monitoring-client-windows.zip");
    env::set_var("OTA_EXECUTABLE_NAME", "monitoring-client.exe");

    let config = Config::load(None).expect("Failed to load config");

    assert!(config.ota_enabled);
    assert_eq!(
        config.ota_github_repo_url,
        "https://github.com/CosmicShreyas/Vibgyor-Screentime"
    );
    assert!(config.ota_check_on_startup);
    assert_eq!(config.ota_check_interval_minutes, 120);
    assert_eq!(
        config.ota_release_asset_name.as_deref(),
        Some("monitoring-client-windows.zip")
    );
    assert_eq!(
        config.ota_executable_name.as_deref(),
        Some("monitoring-client.exe")
    );

    cleanup_test_env();
}

#[test]
fn test_config_clone() {
    setup_test_env();
    
    env::set_var("SERVER_URL", "http://localhost:5000");
    env::set_var("AUTH_TOKEN", "test-token");
    
    let config1 = Config::load(None).expect("Failed to load config");
    let config2 = config1.clone();
    
    assert_eq!(config1.server_url, config2.server_url);
    assert_eq!(config1.auth_token, config2.auth_token);
    assert_eq!(config1.screenshot_interval_minutes, config2.screenshot_interval_minutes);
    
    cleanup_test_env();
}
