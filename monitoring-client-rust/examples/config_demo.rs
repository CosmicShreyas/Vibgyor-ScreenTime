//! Configuration module demonstration
//!
//! This example shows how to use the configuration module to load settings
//! from a .env file and manage client ID and employee name.
//!
//! Run with: cargo run --example config_demo

use monitoring_client::modules::config::{
    Config, generate_client_id, retrieve_client_id,
    store_employee_name, retrieve_employee_name,
};

fn main() {
    println!("=== Configuration Module Demo ===\n");
    
    // 1. Load configuration from .env file
    println!("1. Loading configuration from .env file...");
    match Config::load(None) {
        Ok(config) => {
            println!("✓ Configuration loaded successfully!");
            println!("  Server URL: {}", config.server_url);
            println!("  Screenshot Interval: {} minutes", config.screenshot_interval_minutes);
            println!("  Data Send Interval: {} minutes", config.data_send_interval_minutes);
            println!("  Idle Threshold: {} seconds", config.idle_threshold_seconds);
            println!("  Screenshot Quality: {}", config.screenshot_quality);
            println!("  Log Level: {}", config.log_level);
            println!("  App Usage Poll Interval: {} seconds", config.app_usage_poll_interval_seconds);
            println!("  File Download Path: {}", config.file_download_path.display());
            println!();
        }
        Err(e) => {
            println!("✗ Failed to load configuration: {}", e);
            println!("  Make sure you have a .env file with SERVER_URL and AUTH_TOKEN set.");
            println!();
        }
    }
    
    // 2. Generate and store client ID
    println!("2. Client ID Management...");
    match retrieve_client_id() {
        Ok(client_id) => {
            println!("✓ Client ID: {}", client_id);
            println!("  (This ID persists across restarts)");
            println!();
        }
        Err(e) => {
            println!("✗ Failed to retrieve client ID: {}", e);
            println!();
        }
    }
    
    // 3. Generate a new client ID (for demonstration)
    println!("3. Generating a new client ID...");
    let new_id = generate_client_id();
    println!("✓ Generated new ID: {}", new_id);
    println!("  (This is a UUID v4)");
    println!();
    
    // 4. Store and retrieve employee name
    println!("4. Employee Name Management...");
    let test_name = "Demo User";
    match store_employee_name(test_name) {
        Ok(_) => {
            println!("✓ Stored employee name: {}", test_name);
            
            match retrieve_employee_name() {
                Ok(Some(name)) => {
                    println!("✓ Retrieved employee name: {}", name);
                    println!();
                }
                Ok(None) => {
                    println!("✗ No employee name found");
                    println!();
                }
                Err(e) => {
                    println!("✗ Failed to retrieve employee name: {}", e);
                    println!();
                }
            }
        }
        Err(e) => {
            println!("✗ Failed to store employee name: {}", e);
            println!();
        }
    }
    
    // 5. Configuration validation examples
    println!("5. Configuration Validation Examples...");
    println!("  The config module validates:");
    println!("  • Screenshot quality must be 1-100");
    println!("  • Intervals must be positive numbers");
    println!("  • Log level must be DEBUG, INFO, WARNING, ERROR, or CRITICAL");
    println!("  • App usage poll interval must be >= 2.0 seconds");
    println!("  • SERVER_URL and AUTH_TOKEN are required");
    println!();
    
    // 6. Platform-specific config directory
    println!("6. Platform-Specific Configuration...");
    #[cfg(target_os = "windows")]
    println!("  Config directory: %APPDATA%\\VibgyorSeek");
    
    #[cfg(target_os = "linux")]
    println!("  Config directory: ~/.config/VibgyorSeek");
    
    #[cfg(target_os = "macos")]
    println!("  Config directory: ~/Library/Application Support/VibgyorSeek");
    
    println!("  Config file: employee_config.json");
    println!();
    
    println!("=== Demo Complete ===");
}
