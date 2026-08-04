//! Configuration management module
//!
//! Handles loading configuration from .env files, validation, and persistence
//! of client ID and employee name.

use crate::modules::error::{MonitoringError, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

/// Main configuration structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    /// Server endpoint URL (required)
    pub server_url: String,

    /// Dashboard (web UI) base URL, used to build the employee self-view link
    /// opened from the tray. Optional — if empty it is derived from `server_url`
    /// by taking its origin (scheme://host:port).
    #[serde(default)]
    pub dashboard_url: String,

    /// Authentication token (required)
    pub auth_token: String,

    /// Screenshot capture interval in minutes
    pub screenshot_interval_minutes: u32,

    /// Data transmission interval in minutes
    pub data_send_interval_minutes: u32,

    /// Location update interval in minutes
    pub location_update_interval_minutes: u32,

    /// Idle timeout threshold in seconds
    pub idle_threshold_seconds: u32,

    /// JPEG screenshot quality (1-100)
    pub screenshot_quality: u8,

    /// Logging level
    pub log_level: String,

    /// Application usage polling interval in seconds
    pub app_usage_poll_interval_seconds: f64,

    /// Whether GitHub OTA updates are enabled
    pub ota_enabled: bool,

    /// GitHub repository URL used for OTA releases
    pub ota_github_repo_url: String,

    /// Whether the client should check for OTA updates on startup
    pub ota_check_on_startup: bool,

    /// Polling interval for OTA checks in minutes
    pub ota_check_interval_minutes: u32,

    /// Optional specific release asset name to use
    pub ota_release_asset_name: Option<String>,

    /// Optional executable name inside the release zip
    pub ota_executable_name: Option<String>,

    // --- Genuine-activity (anti-cheat) detection ---
    /// Master switch for genuine-activity detection.
    pub genuine_detection_enabled: bool,
    /// Sliding analysis window in seconds.
    pub genuine_window_seconds: u32,
    /// Suspicion score (0-100) at/above which activity is flagged as fake.
    pub genuine_flag_threshold: u8,

    // --- Fast heartbeat ---
    /// Heartbeat ping interval in seconds (0 disables).
    pub heartbeat_interval_seconds: u32,

    // --- Idle-reason prompt ---
    /// Minutes of idle after which a return-from-idle reason prompt is shown
    /// (0 disables the prompt).
    pub idle_reason_prompt_minutes: u32,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server_url: String::new(),
            dashboard_url: String::new(),
            auth_token: String::new(),
            screenshot_interval_minutes: 10,
            data_send_interval_minutes: 10,
            location_update_interval_minutes: 30,
            idle_threshold_seconds: 300,
            screenshot_quality: 75,
            log_level: "INFO".to_string(),
            app_usage_poll_interval_seconds: 2.0,
            ota_enabled: true,
            ota_github_repo_url: String::new(),
            ota_check_on_startup: true,
            ota_check_interval_minutes: 360,
            ota_release_asset_name: None,
            ota_executable_name: None,
            genuine_detection_enabled: true,
            genuine_window_seconds: 60,
            genuine_flag_threshold: 70,
            heartbeat_interval_seconds: 45,
            idle_reason_prompt_minutes: 10,
        }
    }
}

impl Config {
    /// Load configuration from .env file
    ///
    /// # Arguments
    /// * `env_file` - Optional path to .env file. If None, looks for .env in current directory.
    ///
    /// # Returns
    /// * `Result<Config>` - Loaded and validated configuration
    ///
    /// # Errors
    /// * Returns error if required fields are missing or invalid
    pub fn load(env_file: Option<&str>) -> Result<Self> {
        // Load .env file
        if let Some(path) = env_file {
            dotenv::from_filename(path)
                .map_err(|e| MonitoringError::Config(format!("Failed to load .env file: {}", e)))?;
        } else {
            dotenv::dotenv().ok();
        }

        let mut config = Config::default();

        // Load required fields
        config.server_url = std::env::var("SERVER_URL")
            .map_err(|_| MonitoringError::Config("SERVER_URL is required".to_string()))?
            .trim()
            .to_string();

        config.auth_token = std::env::var("AUTH_TOKEN")
            .map_err(|_| MonitoringError::Config("AUTH_TOKEN is required".to_string()))?
            .trim()
            .to_string();

        // Optional: explicit dashboard/web URL for the self-view link.
        if let Ok(val) = std::env::var("DASHBOARD_URL") {
            config.dashboard_url = val.trim().to_string();
        }

        // Validate required fields are not empty
        if config.server_url.is_empty() {
            return Err(MonitoringError::Config(
                "SERVER_URL cannot be empty".to_string(),
            ));
        }

        if config.auth_token.is_empty() {
            return Err(MonitoringError::Config(
                "AUTH_TOKEN cannot be empty".to_string(),
            ));
        }

        // Load optional fields with validation
        if let Ok(val) = std::env::var("SCREENSHOT_INTERVAL_MINUTES") {
            if let Ok(interval) = val.parse::<u32>() {
                if interval > 0 {
                    config.screenshot_interval_minutes = interval;
                }
            }
        }

        if let Ok(val) = std::env::var("DATA_SEND_INTERVAL_MINUTES") {
            if let Ok(interval) = val.parse::<u32>() {
                if interval > 0 {
                    config.data_send_interval_minutes = interval;
                }
            }
        }

        if let Ok(val) = std::env::var("LOCATION_UPDATE_INTERVAL_MINUTES") {
            if let Ok(interval) = val.parse::<u32>() {
                if interval > 0 {
                    config.location_update_interval_minutes = interval;
                }
            }
        }

        if let Ok(val) = std::env::var("IDLE_THRESHOLD_SECONDS") {
            if let Ok(threshold) = val.parse::<u32>() {
                if threshold > 0 {
                    config.idle_threshold_seconds = threshold;
                }
            }
        }

        if let Ok(val) = std::env::var("SCREENSHOT_QUALITY") {
            if let Ok(quality) = val.parse::<u8>() {
                if (1..=100).contains(&quality) {
                    config.screenshot_quality = quality;
                }
            }
        }

        if let Ok(level) = std::env::var("LOG_LEVEL") {
            let level_upper = level.to_uppercase();
            if ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"].contains(&level_upper.as_str()) {
                config.log_level = level_upper;
            }
        }

        if let Ok(val) = std::env::var("APP_USAGE_POLL_INTERVAL_SECONDS") {
            if let Ok(interval) = val.parse::<f64>() {
                if interval >= 0.5 {
                    config.app_usage_poll_interval_seconds = interval;
                }
            }
        }

        if let Ok(val) = std::env::var("OTA_ENABLED") {
            let normalized = val.trim().to_ascii_lowercase();
            if ["true", "1", "yes", "on"].contains(&normalized.as_str()) {
                config.ota_enabled = true;
            } else if ["false", "0", "no", "off"].contains(&normalized.as_str()) {
                config.ota_enabled = false;
            }
        }

        // --- Genuine-activity detection / heartbeat / idle-reason prompt ---
        let parse_bool = |val: String, cur: bool| -> bool {
            let n = val.trim().to_ascii_lowercase();
            if ["true", "1", "yes", "on"].contains(&n.as_str()) {
                true
            } else if ["false", "0", "no", "off"].contains(&n.as_str()) {
                false
            } else {
                cur
            }
        };
        if let Ok(val) = std::env::var("GENUINE_DETECTION_ENABLED") {
            config.genuine_detection_enabled = parse_bool(val, config.genuine_detection_enabled);
        }
        if let Ok(val) = std::env::var("GENUINE_WINDOW_SECONDS") {
            if let Ok(n) = val.parse::<u32>() {
                if n >= 10 {
                    config.genuine_window_seconds = n;
                }
            }
        }
        if let Ok(val) = std::env::var("GENUINE_FLAG_THRESHOLD") {
            if let Ok(n) = val.parse::<u8>() {
                if n <= 100 {
                    config.genuine_flag_threshold = n;
                }
            }
        }
        if let Ok(val) = std::env::var("HEARTBEAT_INTERVAL_SECONDS") {
            if let Ok(n) = val.parse::<u32>() {
                config.heartbeat_interval_seconds = n;
            }
        }
        if let Ok(val) = std::env::var("IDLE_REASON_PROMPT_MINUTES") {
            if let Ok(n) = val.parse::<u32>() {
                config.idle_reason_prompt_minutes = n;
            }
        }

        if let Ok(val) = std::env::var("OTA_GITHUB_REPO_URL") {
            config.ota_github_repo_url = val.trim().to_string();
        }

        if let Ok(val) = std::env::var("OTA_CHECK_ON_STARTUP") {
            let normalized = val.trim().to_ascii_lowercase();
            if ["true", "1", "yes", "on"].contains(&normalized.as_str()) {
                config.ota_check_on_startup = true;
            } else if ["false", "0", "no", "off"].contains(&normalized.as_str()) {
                config.ota_check_on_startup = false;
            }
        }

        if let Ok(val) = std::env::var("OTA_CHECK_INTERVAL_MINUTES") {
            if let Ok(interval) = val.parse::<u32>() {
                if interval > 0 {
                    config.ota_check_interval_minutes = interval;
                }
            }
        }

        if let Ok(val) = std::env::var("OTA_RELEASE_ASSET_NAME") {
            let trimmed = val.trim();
            if !trimmed.is_empty() {
                config.ota_release_asset_name = Some(trimmed.to_string());
            }
        }

        if let Ok(val) = std::env::var("OTA_EXECUTABLE_NAME") {
            let trimmed = val.trim();
            if !trimmed.is_empty() {
                config.ota_executable_name = Some(trimmed.to_string());
            }
        }

        Ok(config)
    }

    /// Reload configuration from .env file
    ///
    /// This is useful for hot-reloading configuration without restarting the application.
    pub fn reload(&mut self, env_file: Option<&str>) -> Result<()> {
        let new_config = Self::load(env_file)?;
        *self = new_config;
        Ok(())
    }

    /// The dashboard (web UI) origin used to build employee-facing links. Uses
    /// `dashboard_url` if set, otherwise derives the origin from `server_url`
    /// (strips any `/api/...` path). Trailing slash removed.
    pub fn dashboard_origin(&self) -> String {
        let raw = if !self.dashboard_url.trim().is_empty() {
            self.dashboard_url.trim().to_string()
        } else {
            derive_origin(&self.server_url)
        };
        raw.trim_end_matches('/').to_string()
    }

    /// Build the employee self-view URL for a given employee name. The name is
    /// base64-encoded into the `usr` query param, matching the dashboard's
    /// `/self-view?usr=` route.
    pub fn self_view_url(&self, employee_name: &str) -> String {
        use base64::Engine;
        let encoded = base64::engine::general_purpose::STANDARD.encode(employee_name.as_bytes());
        // Percent-encode the base64 output. Standard-alphabet base64 only yields
        // A-Za-z0-9 plus '+', '/', '=', so escaping those three is sufficient and
        // keeps the value intact for the dashboard's atob() decode.
        let escaped = encoded
            .replace('+', "%2B")
            .replace('/', "%2F")
            .replace('=', "%3D");
        format!("{}/self-view?usr={}", self.dashboard_origin(), escaped)
    }
}

/// Extract the scheme://host[:port] origin from a full URL, dropping any path.
/// Falls back to the input unchanged if it doesn't look like a URL.
fn derive_origin(url: &str) -> String {
    let url = url.trim();
    // Find the "://" then the first "/" after it — everything before that is the origin.
    if let Some(scheme_end) = url.find("://") {
        let after = scheme_end + 3;
        if let Some(path_slash) = url[after..].find('/') {
            return url[..after + path_slash].to_string();
        }
    }
    url.to_string()
}

/// Employee configuration stored persistently
#[derive(Debug, Clone, Serialize, Deserialize)]
struct EmployeeConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    employee_name: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    client_id: Option<String>,
}

/// Get the platform-specific configuration directory path
///
/// # Returns
/// * Windows: %APPDATA%\VibgyorSeek
/// * Linux: ~/.config/VibgyorSeek
/// * macOS: ~/Library/Application Support/VibgyorSeek
fn get_config_dir() -> Result<PathBuf> {
    let config_dir = if cfg!(target_os = "windows") {
        // Windows: Use APPDATA
        let appdata = std::env::var("APPDATA").map_err(|_| {
            MonitoringError::Config("APPDATA environment variable not found".to_string())
        })?;
        PathBuf::from(appdata).join("VibgyorSeek")
    } else if cfg!(target_os = "macos") {
        // macOS: Use ~/Library/Application Support
        let home = std::env::var("HOME").map_err(|_| {
            MonitoringError::Config("HOME environment variable not found".to_string())
        })?;
        PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("VibgyorSeek")
    } else {
        // Linux and others: Use ~/.config
        let home = std::env::var("HOME").map_err(|_| {
            MonitoringError::Config("HOME environment variable not found".to_string())
        })?;
        PathBuf::from(home).join(".config").join("VibgyorSeek")
    };

    // Create directory if it doesn't exist
    fs::create_dir_all(&config_dir)?;

    Ok(config_dir)
}

/// Get the path to the employee configuration file
fn get_employee_config_path() -> Result<PathBuf> {
    Ok(get_config_dir()?.join("employee_config.json"))
}

/// Load employee configuration from disk
fn load_employee_config() -> Result<EmployeeConfig> {
    let config_path = get_employee_config_path()?;

    if !config_path.exists() {
        return Ok(EmployeeConfig {
            employee_name: None,
            client_id: None,
        });
    }

    let content = fs::read_to_string(&config_path)?;
    let config: EmployeeConfig = serde_json::from_str(&content)
        .map_err(|e| MonitoringError::Config(format!("Failed to parse employee config: {}", e)))?;

    Ok(config)
}

/// Save employee configuration to disk
fn save_employee_config(config: &EmployeeConfig) -> Result<()> {
    let config_path = get_employee_config_path()?;
    let content = serde_json::to_string_pretty(config)?;
    fs::write(&config_path, content)?;
    Ok(())
}

/// Store employee name persistently
///
/// # Arguments
/// * `name` - The employee name to store
///
/// # Errors
/// * Returns error if name is empty or unable to write to disk
pub fn store_employee_name(name: &str) -> Result<()> {
    let name = name.trim();
    if name.is_empty() {
        return Err(MonitoringError::Config(
            "Employee name cannot be empty".to_string(),
        ));
    }

    let mut config = load_employee_config()?;
    config.employee_name = Some(name.to_string());
    save_employee_config(&config)?;

    Ok(())
}

/// Retrieve stored employee name
///
/// # Returns
/// * `Option<String>` - The stored employee name, or None if not found
pub fn retrieve_employee_name() -> Result<Option<String>> {
    let config = load_employee_config()?;
    Ok(config.employee_name)
}

/// Generate a unique client ID using UUID v4
///
/// # Returns
/// * A unique client ID string
pub fn generate_client_id() -> String {
    Uuid::new_v4().to_string()
}

/// Store client ID persistently
///
/// # Arguments
/// * `client_id` - The client ID to store
///
/// # Errors
/// * Returns error if unable to write to disk
pub fn store_client_id(client_id: &str) -> Result<()> {
    let mut config = load_employee_config()?;
    config.client_id = Some(client_id.to_string());
    save_employee_config(&config)?;
    Ok(())
}

/// Retrieve stored client ID, generating and storing a new one if not found
///
/// # Returns
/// * The stored or newly generated client ID
pub fn retrieve_client_id() -> Result<String> {
    let config = load_employee_config()?;

    if let Some(client_id) = config.client_id {
        return Ok(client_id);
    }

    // Generate new client ID
    let new_client_id = generate_client_id();
    store_client_id(&new_client_id)?;

    Ok(new_client_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_config_default() {
        let config = Config::default();
        assert_eq!(config.screenshot_interval_minutes, 10);
        assert_eq!(config.data_send_interval_minutes, 10);
        assert_eq!(config.location_update_interval_minutes, 30);
        assert_eq!(config.idle_threshold_seconds, 300);
        assert_eq!(config.screenshot_quality, 75);
        assert_eq!(config.log_level, "INFO");
        assert_eq!(config.app_usage_poll_interval_seconds, 2.0);
        assert!(config.ota_enabled);
        assert!(config.ota_check_on_startup);
        assert_eq!(config.ota_check_interval_minutes, 360);
    }

    #[test]
    fn test_config_load_missing_required() {
        // Clear environment variables
        env::remove_var("SERVER_URL");
        env::remove_var("AUTH_TOKEN");

        let result = Config::load(None);
        assert!(result.is_err());
    }

    #[test]
    fn test_config_load_with_env_vars() {
        env::set_var("SERVER_URL", "http://localhost:5000");
        env::set_var("AUTH_TOKEN", "test-token");
        env::set_var("SCREENSHOT_INTERVAL_MINUTES", "15");
        env::set_var("SCREENSHOT_QUALITY", "80");
        env::set_var("LOG_LEVEL", "DEBUG");

        let config = Config::load(None).unwrap();
        assert_eq!(config.server_url, "http://localhost:5000");
        assert_eq!(config.auth_token, "test-token");
        assert_eq!(config.screenshot_interval_minutes, 15);
        assert_eq!(config.screenshot_quality, 80);
        assert_eq!(config.log_level, "DEBUG");

        // Cleanup
        env::remove_var("SERVER_URL");
        env::remove_var("AUTH_TOKEN");
        env::remove_var("SCREENSHOT_INTERVAL_MINUTES");
        env::remove_var("SCREENSHOT_QUALITY");
        env::remove_var("LOG_LEVEL");
    }

    #[test]
    fn test_config_validation_screenshot_quality() {
        env::set_var("SERVER_URL", "http://localhost:5000");
        env::set_var("AUTH_TOKEN", "test-token");
        env::set_var("SCREENSHOT_QUALITY", "150"); // Invalid: > 100

        let config = Config::load(None).unwrap();
        assert_eq!(config.screenshot_quality, 75); // Should use default

        env::set_var("SCREENSHOT_QUALITY", "0"); // Invalid: < 1
        let config = Config::load(None).unwrap();
        assert_eq!(config.screenshot_quality, 75); // Should use default

        // Cleanup
        env::remove_var("SERVER_URL");
        env::remove_var("AUTH_TOKEN");
        env::remove_var("SCREENSHOT_QUALITY");
    }

    #[test]
    fn test_config_validation_intervals() {
        env::set_var("SERVER_URL", "http://localhost:5000");
        env::set_var("AUTH_TOKEN", "test-token");
        env::set_var("SCREENSHOT_INTERVAL_MINUTES", "0"); // Invalid
        env::set_var("DATA_SEND_INTERVAL_MINUTES", "-5"); // Invalid

        let config = Config::load(None).unwrap();
        assert_eq!(config.screenshot_interval_minutes, 10); // Should use default
        assert_eq!(config.data_send_interval_minutes, 10); // Should use default

        // Cleanup
        env::remove_var("SERVER_URL");
        env::remove_var("AUTH_TOKEN");
        env::remove_var("SCREENSHOT_INTERVAL_MINUTES");
        env::remove_var("DATA_SEND_INTERVAL_MINUTES");
    }

    #[test]
    fn test_generate_client_id() {
        let id1 = generate_client_id();
        let id2 = generate_client_id();

        // Should be valid UUIDs
        assert!(Uuid::parse_str(&id1).is_ok());
        assert!(Uuid::parse_str(&id2).is_ok());

        // Should be unique
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_employee_name_validation() {
        let result = store_employee_name("");
        assert!(result.is_err());

        let result = store_employee_name("   ");
        assert!(result.is_err());
    }
}
