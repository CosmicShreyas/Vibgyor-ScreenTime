//! Configuration watcher module
//!
//! Monitors .env file changes and polls server for configuration updates.
//! Implements hot-reload functionality without requiring application restart.
//!
//! # Features
//! - File system watching for .env file changes
//! - Server configuration polling (every 60 seconds)
//! - Debouncing for rapid file changes (2 second window)
//! - Broadcast channel for configuration updates
//! - Automatic configuration merge and reload
//!
//! # Example
//! ```no_run
//! use monitoring_client::modules::config_watcher::ConfigWatcher;
//! use monitoring_client::modules::config::Config;
//! use std::sync::Arc;
//! use parking_lot::RwLock;
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let config = Arc::new(RwLock::new(Config::load(None)?));
//!     let watcher = ConfigWatcher::new(config.clone(), None)?;
//!     
//!     // Subscribe to configuration updates
//!     let mut rx = watcher.subscribe();
//!     
//!     // Start watching
//!     watcher.start().await?;
//!     
//!     // Listen for updates
//!     tokio::spawn(async move {
//!         while let Ok(new_config) = rx.recv().await {
//!             println!("Configuration updated!");
//!         }
//!     });
//!     
//!     Ok(())
//! }
//! ```

use crate::modules::config::Config;
use crate::modules::error::{MonitoringError, Result};
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::RwLock;
use reqwest::Client;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::broadcast;
use tracing::{debug, error, info, warn};

/// Debounce duration for file changes (2 seconds)
const DEBOUNCE_DURATION: Duration = Duration::from_secs(2);

/// Default server config check interval (10 seconds for faster updates)
pub const DEFAULT_CHECK_INTERVAL_SECONDS: u64 = 10;

/// Configuration watcher that monitors for changes
pub struct ConfigWatcher {
    /// Shared configuration reference
    pub config: Arc<RwLock<Config>>,
    
    /// Path to .env file being watched
    env_path: PathBuf,
    
    /// HTTP client for server requests
    client: Client,
    
    /// Broadcast channel for configuration updates
    update_tx: broadcast::Sender<Config>,
    
    /// Last file modification time for debouncing
    last_modified: Arc<RwLock<Instant>>,
    
    /// Server config check interval
    check_interval: Duration,
    
    /// Current configuration version from server
    current_version: Arc<RwLock<u32>>,
}

impl ConfigWatcher {
    /// Create a new configuration watcher
    ///
    /// # Arguments
    /// * `config` - Shared configuration reference
    /// * `env_path` - Optional path to .env file (defaults to ./.env)
    ///
    /// # Returns
    /// A new ConfigWatcher instance
    pub fn new(config: Arc<RwLock<Config>>, env_path: Option<PathBuf>) -> Result<Self> {
        let env_path = env_path.unwrap_or_else(|| PathBuf::from(".env"));
        
        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| MonitoringError::Config(format!("Failed to create HTTP client: {}", e)))?;
        
        let (update_tx, _) = broadcast::channel(16);
        
        Ok(Self {
            config,
            env_path,
            client,
            update_tx,
            last_modified: Arc::new(RwLock::new(Instant::now())),
            check_interval: Duration::from_secs(DEFAULT_CHECK_INTERVAL_SECONDS),
            current_version: Arc::new(RwLock::new(0)),
        })
    }
    
    /// Create a new configuration watcher with custom check interval
    ///
    /// # Arguments
    /// * `config` - Shared configuration reference
    /// * `env_path` - Optional path to .env file
    /// * `check_interval_seconds` - Server config check interval in seconds
    pub fn with_interval(
        config: Arc<RwLock<Config>>,
        env_path: Option<PathBuf>,
        check_interval_seconds: u64,
    ) -> Result<Self> {
        let mut watcher = Self::new(config, env_path)?;
        watcher.check_interval = Duration::from_secs(check_interval_seconds);
        Ok(watcher)
    }
    
    /// Subscribe to configuration updates
    ///
    /// # Returns
    /// A receiver for configuration update notifications
    pub fn subscribe(&self) -> broadcast::Receiver<Config> {
        self.update_tx.subscribe()
    }
    
    /// Start the configuration watcher
    ///
    /// Spawns two async tasks:
    /// 1. File system watcher for .env file changes
    /// 2. Server configuration poller
    pub async fn start(self: Arc<Self>) -> Result<()> {
        info!("🚀 Starting configuration watcher");
        
        // Get initial version from server
        if let Some(version) = self.get_config_version().await {
            *self.current_version.write() = version;
            info!("📊 Initial config version: {}", version);
        } else {
            warn!("⚠️ Could not get initial config version");
        }
        
        // Start file watcher task
        let watcher_self = self.clone();
        tokio::spawn(async move {
            if let Err(e) = watcher_self.watch_file().await {
                error!("File watcher error: {}", e);
            }
        });
        
        // Start server poller task
        let poller_self = self.clone();
        tokio::spawn(async move {
            poller_self.poll_server_config().await;
        });
        
        info!("✅ Configuration watcher started");
        Ok(())
    }
    
    /// Watch .env file for changes
    async fn watch_file(&self) -> Result<()> {
        let env_path = self.env_path.clone();
        let watch_dir = env_path
            .parent()
            .ok_or_else(|| MonitoringError::Config("Invalid .env path".to_string()))?
            .to_path_buf();
        
        info!("👁️ Watching for changes: {}", env_path.display());
        
        let (tx, mut rx) = tokio::sync::mpsc::channel(32);
        let last_modified = self.last_modified.clone();
        let config = self.config.clone();
        let update_tx = self.update_tx.clone();
        let env_path_clone = env_path.clone();
        
        // Create file watcher
        let mut watcher = RecommendedWatcher::new(
            move |res: notify::Result<Event>| {
                if let Ok(event) = res {
                    // Check if the event involves our .env file
                    if event.paths.iter().any(|p| p.ends_with(".env")) {
                        let _ = tx.blocking_send(event);
                    }
                }
            },
            notify::Config::default(),
        )
        .map_err(|e| MonitoringError::Config(format!("Failed to create file watcher: {}", e)))?;
        
        watcher
            .watch(&watch_dir, RecursiveMode::NonRecursive)
            .map_err(|e| MonitoringError::Config(format!("Failed to watch directory: {}", e)))?;
        
        // Process file events
        while let Some(_event) = rx.recv().await {
            // Debounce: only trigger if at least 2 seconds have passed
            let now = Instant::now();
            let last = *last_modified.read();
            
            if now.duration_since(last) > DEBOUNCE_DURATION {
                *last_modified.write() = now;
                
                info!("📝 .env file changed, triggering hot-reload...");
                
                // Reload configuration
                match Config::load(Some(env_path_clone.to_str().unwrap())) {
                    Ok(new_config) => {
                        *config.write() = new_config.clone();
                        
                        // Broadcast update
                        let _ = update_tx.send(new_config);
                        
                        info!("✅ Configuration hot-reloaded successfully!");
                    }
                    Err(e) => {
                        error!("❌ Failed to reload configuration: {}", e);
                    }
                }
            }
        }
        
        Ok(())
    }
    
    /// Poll server for configuration updates
    async fn poll_server_config(&self) {
        let mut interval = tokio::time::interval(self.check_interval);
        
        loop {
            interval.tick().await;
            
            debug!("🔍 Checking for server configuration updates...");
            
            if let Err(e) = self.check_for_updates().await {
                error!("Error checking for updates: {}", e);
            }
        }
    }
    
    /// Check for configuration updates from server
    async fn check_for_updates(&self) -> Result<()> {
        let server_version = match self.get_config_version().await {
            Some(v) => v,
            None => {
                info!("⚠️ Could not get server config version");
                return Ok(());
            }
        };
        
        let current_version = *self.current_version.read();
        
        info!(
            "📊 Config versions - Current: {}, Server: {}",
            current_version, server_version
        );
        
        if server_version > current_version {
            info!(
                "🔔 Configuration update detected (v{} -> v{})",
                current_version, server_version
            );
            
            if self.fetch_and_apply_config().await? {
                *self.current_version.write() = server_version;
                info!("✅ Config version updated to {}", server_version);
            } else {
                error!("❌ Failed to fetch and apply config");
            }
        } else {
            debug!("✓ Config is up to date (version {})", current_version);
        }
        
        Ok(())
    }
    
    /// Get current configuration version from server
    async fn get_config_version(&self) -> Option<u32> {
        let base_url = {
            let config = self.config.read();
            config
                .server_url
                .trim_end_matches("/api/monitoring/data")
                .to_string()
        };
        
        // For now, we'll use a simple approach - fetch the config and hash it
        // In production, the server should provide a version endpoint
        let url = format!("{}/api/client-env", base_url);
        
        info!("🌐 Fetching config version from: {}", url);
        
        match self.client.get(&url).send().await {
            Ok(response) if response.status().is_success() => {
                match response.json::<serde_json::Value>().await {
                    Ok(data) => {
                        // Use a simple hash of the config as version
                        let version = Self::hash_config(&data);
                        info!("✅ Server config version: {}", version);
                        Some(version)
                    }
                    Err(e) => {
                        warn!("Failed to parse config response: {}", e);
                        None
                    }
                }
            }
            Ok(response) => {
                warn!("Failed to fetch config version: HTTP {}", response.status());
                None
            }
            Err(e) => {
                warn!("Error fetching config version: {}", e);
                None
            }
        }
    }
    
    /// Fetch configuration from server and update .env file
    async fn fetch_and_apply_config(&self) -> Result<bool> {
        let base_url = {
            let config = self.config.read();
            config
                .server_url
                .trim_end_matches("/api/monitoring/data")
                .to_string()
        };
        
        let url = format!("{}/api/client-env", base_url);
        
        info!("🌐 Fetching config from: {}", url);
        
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| MonitoringError::Config(format!("Failed to fetch config: {}", e)))?;
        
        if !response.status().is_success() {
            warn!("⚠️ Failed to fetch config: HTTP {}", response.status());
            return Ok(false);
        }
        
        let config_data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| MonitoringError::Config(format!("Failed to parse config: {}", e)))?;
        
        info!("📦 Received configuration data from server");
        
        // Write to .env file
        self.write_env_file(&config_data)?;
        
        info!("✅ Configuration file updated successfully");
        Ok(true)
    }
    
    /// Write configuration data to .env file
    pub fn write_env_file(&self, config_data: &serde_json::Value) -> Result<()> {
        use std::io::Write;
        
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
        
        let server_url = config_data["SERVER_URL"]
            .as_str()
            .unwrap_or("http://localhost:5000/api/monitoring/data");
        let auth_token = config_data["AUTH_TOKEN"]
            .as_str()
            .unwrap_or("vibgyorseek-client-token-2024");
        let screenshot_interval = config_data["SCREENSHOT_INTERVAL_MINUTES"]
            .as_u64()
            .unwrap_or(10);
        let data_send_interval = config_data["DATA_SEND_INTERVAL_MINUTES"]
            .as_u64()
            .unwrap_or(10);
        let location_interval = config_data["LOCATION_UPDATE_INTERVAL_MINUTES"]
            .as_u64()
            .unwrap_or(30);
        let idle_threshold = config_data["IDLE_THRESHOLD_SECONDS"]
            .as_u64()
            .unwrap_or(300);
        let app_poll_interval = config_data["APP_USAGE_POLL_INTERVAL_SECONDS"]
            .as_f64()
            .unwrap_or(10.0);
        let screenshot_quality = config_data["SCREENSHOT_QUALITY"]
            .as_u64()
            .unwrap_or(75);
        let log_level = config_data["LOG_LEVEL"]
            .as_str()
            .unwrap_or("INFO");
        let file_download_path = config_data["FILE_DOWNLOAD_PATH"]
            .as_str()
            .unwrap_or("C:\\Downloads\\CompanyFiles");
        
        // Escape backslashes in Windows paths for .env file
        let file_download_path_escaped = file_download_path.replace("\\", "\\\\");
        
        let env_content = format!(
            r#"# Auto-generated configuration from server
# Last updated: {}

SERVER_URL={}
AUTH_TOKEN={}

# Intervals
SCREENSHOT_INTERVAL_MINUTES={}
DATA_SEND_INTERVAL_MINUTES={}
LOCATION_UPDATE_INTERVAL_MINUTES={}

# Activity Tracking
IDLE_THRESHOLD_SECONDS={}
APP_USAGE_POLL_INTERVAL_SECONDS={}

# Screenshot Settings
SCREENSHOT_QUALITY={}

# Logging
LOG_LEVEL={}

# OTA File Transfer Configuration
FILE_DOWNLOAD_PATH={}
"#,
            timestamp,
            server_url,
            auth_token,
            screenshot_interval,
            data_send_interval,
            location_interval,
            idle_threshold,
            app_poll_interval,
            screenshot_quality,
            log_level,
            file_download_path_escaped
        );
        
        let mut file = std::fs::File::create(&self.env_path)
            .map_err(|e| MonitoringError::Config(format!("Failed to create .env file: {}", e)))?;
        
        file.write_all(env_content.as_bytes())
            .map_err(|e| MonitoringError::Config(format!("Failed to write .env file: {}", e)))?;
        
        info!("💾 Successfully wrote configuration to {}", self.env_path.display());
        Ok(())
    }
    
    /// Simple hash function for configuration versioning
    pub fn hash_config(config: &serde_json::Value) -> u32 {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        
        let config_str = config.to_string();
        let mut hasher = DefaultHasher::new();
        config_str.hash(&mut hasher);
        hasher.finish() as u32
    }
    
    /// Get current configuration version
    pub fn current_version(&self) -> u32 {
        *self.current_version.read()
    }
    
    /// Manually trigger a configuration check
    pub async fn check_once(&self) -> Result<()> {
        info!("🔍 Manual configuration check triggered");
        self.check_for_updates().await
    }
}
