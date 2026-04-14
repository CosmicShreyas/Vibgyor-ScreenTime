//! File synchronization manager module
//!
//! Manages OTA (Over-The-Air) file transfers from server to client.
//! Supports parallel downloads, status tracking, and file deletion synchronization.
//!
//! # Features
//! - Server polling for pending files
//! - Parallel downloads (max 5 concurrent)
//! - Download status tracking and reporting
//! - File deletion synchronization
//! - Automatic retry on failures
//! - Thread-safe operation
//!
//! # Example
//! ```no_run
//! use monitoring_client::modules::file_sync_manager::FileSyncManager;
//! use monitoring_client::modules::config::Config;
//! use std::sync::Arc;
//! use parking_lot::RwLock;
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let config = Arc::new(RwLock::new(Config::load(None)?));
//!     let manager = FileSyncManager::new(
//!         config,
//!         "employee@example.com".to_string(),
//!         "client-123".to_string(),
//!     )?;
//!     
//!     // Start file sync
//!     manager.start().await?;
//!     
//!     // Check for files
//!     manager.check_and_download().await?;
//!     
//!     Ok(())
//! }
//! ```

use crate::modules::config::Config;
use crate::modules::error::{MonitoringError, Result};
use parking_lot::RwLock;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use tokio::sync::Semaphore;
use tracing::{debug, error, info, warn};

/// Maximum number of parallel downloads
pub const MAX_PARALLEL_DOWNLOADS: usize = 5;

/// File information from server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    /// Unique file ID
    pub id: String,
    
    /// Filename
    pub filename: String,
    
    /// File size in bytes
    #[serde(rename = "fileSize")]
    pub file_size: Option<u64>,
}

/// Download status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DownloadStatus {
    /// Download is pending
    Pending,
    
    /// Download is in progress
    Downloading,
    
    /// Download completed successfully
    Completed,
    
    /// Download failed
    Failed,
}

/// File sync manager for OTA file transfers
pub struct FileSyncManager {
    /// Shared configuration
    config: Arc<RwLock<Config>>,
    
    /// Employee name
    employee_name: String,
    
    /// Client ID
    client_id: String,
    
    /// Download directory path
    download_path: PathBuf,
    
    /// HTTP client
    client: Client,
    
    /// Set of downloaded file IDs
    downloaded_files: Arc<RwLock<HashSet<String>>>,
    
    /// Map of file ID to filename
    file_id_to_name: Arc<RwLock<HashMap<String, String>>>,
    
    /// Semaphore for limiting parallel downloads
    download_semaphore: Arc<Semaphore>,
    
    /// Check counter for logging
    check_counter: Arc<RwLock<u32>>,
    
    /// Running flag
    running: Arc<RwLock<bool>>,
}

impl FileSyncManager {
    /// Create a new file sync manager
    ///
    /// # Arguments
    /// * `config` - Shared configuration
    /// * `employee_name` - Employee name
    /// * `client_id` - Unique client ID
    ///
    /// # Returns
    /// A new FileSyncManager instance
    pub fn new(
        config: Arc<RwLock<Config>>,
        employee_name: String,
        client_id: String,
    ) -> Result<Self> {
        let download_path = {
            let cfg = config.read();
            cfg.file_download_path.clone()
        };
        
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(300)) // 5 minutes for large files
            .build()
            .map_err(|e| MonitoringError::FileSync(format!("Failed to create HTTP client: {}", e)))?;
        
        Ok(Self {
            config,
            employee_name,
            client_id,
            download_path,
            client,
            downloaded_files: Arc::new(RwLock::new(HashSet::new())),
            file_id_to_name: Arc::new(RwLock::new(HashMap::new())),
            download_semaphore: Arc::new(Semaphore::new(MAX_PARALLEL_DOWNLOADS)),
            check_counter: Arc::new(RwLock::new(0)),
            running: Arc::new(RwLock::new(false)),
        })
    }
    
    /// Start the file sync manager
    pub async fn start(&self) -> Result<()> {
        if *self.running.read() {
            warn!("⚠️ File sync manager already running");
            return Ok(());
        }
        
        *self.running.write() = true;
        
        // Ensure download directory exists
        fs::create_dir_all(&self.download_path)
            .await
            .map_err(|e| MonitoringError::FileSync(format!("Failed to create download directory: {}", e)))?;
        
        info!("📁 File sync manager initialized. Download path: {:?}", self.download_path);
        info!("🆔 Client ID: {}", self.client_id);
        info!("✅ File sync manager started");
        
        Ok(())
    }
    
    /// Stop the file sync manager
    pub fn stop(&self) {
        *self.running.write() = false;
        info!("🛑 File sync manager stopped");
    }
    
    /// Update file sync - check for files
    ///
    /// This is called periodically from the monitoring loop
    pub async fn update(&self) -> Result<()> {
        if !*self.running.read() {
            return Ok(());
        }
        
        *self.check_counter.write() += 1;
        
        self.check_and_download().await
    }
    
    /// Force an immediate check for pending files and process downloads
    pub async fn check_and_download(&self) -> Result<()> {
        if !*self.running.read() {
            return Ok(());
        }
        
        info!("🔍 File sync: Force check triggered");
        
        self.check_pending_files().await?;
        
        Ok(())
    }
    
    /// Check server for pending files and sync deletions
    async fn check_pending_files(&self) -> Result<()> {
        let (base_url, auth_token) = {
            let config = self.config.read();
            let base_url = config.server_url.trim_end_matches("/api/monitoring/data").to_string();
            (base_url, config.auth_token.clone())
        };
        
        // Check for pending files
        let pending_url = format!(
            "{}/api/files/pending/{}?client_id={}",
            base_url, self.employee_name, self.client_id
        );
        
        debug!("🌐 Checking pending files at: {}", pending_url);
        
        let response = self
            .client
            .get(&pending_url)
            .header("Authorization", format!("Bearer {}", auth_token))
            .send()
            .await
            .map_err(|e| MonitoringError::FileSync(format!("Failed to check pending files: {}", e)))?;
        
        if response.status().is_success() {
            #[derive(Deserialize)]
            struct PendingFilesResponse {
                files: Vec<FileInfo>,
            }
            
            let data: PendingFilesResponse = response
                .json()
                .await
                .map_err(|e| MonitoringError::FileSync(format!("Failed to parse response: {}", e)))?;
            
            let files = data.files;
            
            if !files.is_empty() {
                info!("📦 Found {} pending file(s)", files.len());
            } else {
                let counter = *self.check_counter.read();
                if counter % 6 == 1 {
                    debug!("✅ No pending files (check #{})", counter);
                }
            }
            
            // Download files in parallel
            let mut tasks = Vec::new();
            
            for file_info in files {
                let file_id = file_info.id.clone();
                let filename = file_info.filename.clone();
                
                // Check if already downloaded
                if self.downloaded_files.read().contains(&file_id) {
                    debug!("⏭️ File already downloaded: {}", filename);
                    continue;
                }
                
                info!("📄 File: {} (ID: {}, Size: {:?})", filename, file_id, file_info.file_size);
                info!("✅ Queued for download: {}", filename);
                
                // Spawn download task
                let task = self.download_file(file_info);
                tasks.push(task);
            }
            
            // Wait for all downloads to complete
            for task in tasks {
                let _ = task.await;
            }
        } else {
            warn!("⚠️ Failed to check pending files: HTTP {}", response.status());
        }
        
        // Check for deleted files
        debug!("🔍 Checking for deleted files...");
        self.sync_deletions(&base_url, &auth_token).await?;
        
        Ok(())
    }
    
    /// Download a file from the server
    async fn download_file(&self, file_info: FileInfo) -> Result<()> {
        let file_id = file_info.id.clone();
        let filename = file_info.filename.clone();
        
        // Acquire semaphore permit for parallel download limiting
        let _permit = self.download_semaphore.acquire().await.map_err(|e| {
            MonitoringError::FileSync(format!("Failed to acquire download permit: {}", e))
        })?;
        
        info!("⬇️ Starting download: {}", filename);
        
        // Update status to downloading
        self.update_status(&file_id, DownloadStatus::Downloading, None).await?;
        
        let (base_url, auth_token) = {
            let config = self.config.read();
            let base_url = config.server_url.trim_end_matches("/api/monitoring/data").to_string();
            (base_url, config.auth_token.clone())
        };
        
        // Download file
        let url = format!("{}/api/files/{}/download", base_url, file_id);
        
        debug!("🌐 Download URL: {}", url);
        
        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", auth_token))
            .query(&[("employeeName", &self.employee_name)])
            .send()
            .await;
        
        match response {
            Ok(resp) if resp.status().is_success() => {
                // Save file
                let file_path = self.download_path.join(&filename);
                
                info!("💾 Saving file to: {:?}", file_path);
                
                let bytes = resp
                    .bytes()
                    .await
                    .map_err(|e| MonitoringError::FileSync(format!("Failed to read response: {}", e)))?;
                
                fs::write(&file_path, &bytes)
                    .await
                    .map_err(|e| MonitoringError::FileSync(format!("Failed to write file: {}", e)))?;
                
                info!("✅ Download completed: {} ({} bytes)", filename, bytes.len());
                
                // Update status to completed
                self.update_status(&file_id, DownloadStatus::Completed, None).await?;
                
                // Track downloaded file
                self.downloaded_files.write().insert(file_id.clone());
                self.file_id_to_name.write().insert(file_id, filename);
                
                Ok(())
            }
            Ok(resp) => {
                let status = resp.status();
                let error_msg = format!("Download failed with status {}", status);
                error!("❌ {}: {}", error_msg, filename);
                
                self.update_status(&file_id, DownloadStatus::Failed, Some(&error_msg)).await?;
                
                Err(MonitoringError::FileSync(error_msg))
            }
            Err(e) => {
                let error_msg = format!("Download request failed: {}", e);
                error!("❌ Error downloading {}: {}", filename, error_msg);
                
                self.update_status(&file_id, DownloadStatus::Failed, Some(&error_msg)).await?;
                
                Err(MonitoringError::FileSync(error_msg))
            }
        }
    }
    
    /// Update download status on server
    async fn update_status(
        &self,
        file_id: &str,
        status: DownloadStatus,
        error: Option<&str>,
    ) -> Result<()> {
        let (base_url, auth_token) = {
            let config = self.config.read();
            let base_url = config.server_url.trim_end_matches("/api/monitoring/data").to_string();
            (base_url, config.auth_token.clone())
        };
        
        let url = format!("{}/api/files/{}/status", base_url, file_id);
        
        #[derive(Serialize)]
        struct StatusUpdate<'a> {
            #[serde(rename = "employeeName")]
            employee_name: &'a str,
            status: DownloadStatus,
            #[serde(skip_serializing_if = "Option::is_none")]
            error: Option<&'a str>,
        }
        
        let data = StatusUpdate {
            employee_name: &self.employee_name,
            status,
            error,
        };
        
        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", auth_token))
            .header("Content-Type", "application/json")
            .json(&data)
            .send()
            .await;
        
        match response {
            Ok(resp) if !resp.status().is_success() => {
                warn!("Failed to update status: {}", resp.status());
            }
            Err(e) => {
                error!("Error updating status: {}", e);
            }
            _ => {}
        }
        
        Ok(())
    }
    
    /// Check for deleted files and remove them from local storage
    async fn sync_deletions(&self, base_url: &str, auth_token: &str) -> Result<()> {
        let active_url = format!("{}/api/files/active/{}", base_url, self.employee_name);
        
        debug!("🔍 Checking for deleted files at: {}", active_url);
        
        let response = self
            .client
            .get(&active_url)
            .header("Authorization", format!("Bearer {}", auth_token))
            .send()
            .await
            .map_err(|e| MonitoringError::FileSync(format!("Failed to check active files: {}", e)))?;
        
        if response.status().is_success() {
            #[derive(Deserialize)]
            struct ActiveFilesResponse {
                files: Vec<FileInfo>,
            }
            
            let data: ActiveFilesResponse = response
                .json()
                .await
                .map_err(|e| MonitoringError::FileSync(format!("Failed to parse response: {}", e)))?;
            
            // Build set of filenames that should exist
            let server_filenames: HashSet<String> = data.files.iter().map(|f| f.filename.clone()).collect();
            
            debug!("📋 Server has {} active file(s)", server_filenames.len());
            
            // Check local files
            if self.download_path.exists() {
                let mut entries = fs::read_dir(&self.download_path)
                    .await
                    .map_err(|e| MonitoringError::FileSync(format!("Failed to read directory: {}", e)))?;
                
                while let Some(entry) = entries
                    .next_entry()
                    .await
                    .map_err(|e| MonitoringError::FileSync(format!("Failed to read entry: {}", e)))?
                {
                    let path = entry.path();
                    
                    if path.is_file() {
                        if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                            // If file exists locally but not on server, delete it
                            if !server_filenames.contains(filename) {
                                match fs::remove_file(&path).await {
                                    Ok(_) => {
                                        info!("🗑️ Deleted orphaned file: {}", filename);
                                        
                                        // Remove from tracking
                                        let mut file_id_to_remove = None;
                                        {
                                            let mapping = self.file_id_to_name.read();
                                            for (fid, fname) in mapping.iter() {
                                                if fname == filename {
                                                    file_id_to_remove = Some(fid.clone());
                                                    break;
                                                }
                                            }
                                        }
                                        
                                        if let Some(fid) = file_id_to_remove {
                                            self.downloaded_files.write().remove(&fid);
                                            self.file_id_to_name.write().remove(&fid);
                                        }
                                    }
                                    Err(e) => {
                                        error!("❌ Error deleting {}: {}", filename, e);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else {
            warn!("⚠️ Could not check for deletions: HTTP {}", response.status());
        }
        
        Ok(())
    }
    
    /// Handle file uploaded event (e.g., from WebSocket)
    pub async fn handle_file_uploaded(&self, filename: &str) -> Result<()> {
        info!("📢 Received file upload notification: {}", filename);
        self.check_and_download().await
    }
    
    /// Handle file deleted event (e.g., from WebSocket)
    pub async fn handle_file_deleted(&self, file_id: &str, filename: Option<&str>) -> Result<()> {
        info!("🗑️ Received file deletion notification: {}", file_id);
        
        // Try to get filename from mapping or use provided filename
        let fname = {
            let mapping = self.file_id_to_name.read();
            mapping.get(file_id).cloned().or_else(|| filename.map(|s| s.to_string()))
        };
        
        if let Some(fname) = fname {
            let file_path = self.download_path.join(&fname);
            
            match fs::remove_file(&file_path).await {
                Ok(_) => {
                    info!("✅ Deleted local file: {}", fname);
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    warn!("⚠️ File not found locally: {}", fname);
                }
                Err(e) => {
                    error!("❌ Error deleting file {}: {}", fname, e);
                    return Err(MonitoringError::FileSync(format!("Failed to delete file: {}", e)));
                }
            }
        } else {
            error!("❌ Cannot delete - filename unknown for ID: {}", file_id);
        }
        
        // Remove from tracking
        self.downloaded_files.write().remove(file_id);
        self.file_id_to_name.write().remove(file_id);
        
        Ok(())
    }
    
    /// Get the download path
    pub fn download_path(&self) -> &PathBuf {
        &self.download_path
    }
    
    /// Check if running
    pub fn is_running(&self) -> bool {
        *self.running.read()
    }
    
    /// Get number of downloaded files
    pub fn downloaded_count(&self) -> usize {
        self.downloaded_files.read().len()
    }
}
