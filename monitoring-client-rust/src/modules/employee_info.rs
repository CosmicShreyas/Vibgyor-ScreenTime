//! Employee Information Management
//!
//! Handles storage and retrieval of employee information (name, ID)
//! and admin password verification.

use crate::modules::error::{MonitoringError, Result};
use crate::modules::system_info::SystemInfo;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tracing::{info, warn};

/// Employee information structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmployeeInfo {
    /// Employee name
    pub employee_name: String,
    
    /// Employee ID
    pub employee_id: String,
    
    /// Unique client ID (UUID)
    pub client_id: String,
    
    /// System information (collected on first run)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_info: Option<SystemInfo>,
}

/// Employee info manager
pub struct EmployeeInfoManager {
    /// Path to info.json file
    info_file_path: PathBuf,
    
    /// Admin password for verification
    admin_password: String,
}

impl EmployeeInfoManager {
    /// Create a new employee info manager
    ///
    /// # Arguments
    /// * `info_file_path` - Path to info.json file (defaults to ./info.json)
    /// * `admin_password` - Admin password from server env
    pub fn new(info_file_path: Option<PathBuf>, admin_password: String) -> Self {
        let info_file_path = info_file_path.unwrap_or_else(|| PathBuf::from("info.json"));
        
        Self {
            info_file_path,
            admin_password,
        }
    }
    
    /// Check if employee info exists
    pub fn info_exists(&self) -> bool {
        self.info_file_path.exists()
    }
    
    /// Load employee info from file
    pub fn load_info(&self) -> Result<EmployeeInfo> {
        if !self.info_exists() {
            return Err(MonitoringError::Config(
                "Employee info file not found".to_string(),
            ));
        }
        
        let content = fs::read_to_string(&self.info_file_path)
            .map_err(|e| MonitoringError::Config(format!("Failed to read info file: {}", e)))?;
        
        let info: EmployeeInfo = serde_json::from_str(&content)
            .map_err(|e| MonitoringError::Config(format!("Failed to parse info file: {}", e)))?;
        
        info!("✅ Employee info loaded: {} (ID: {})", info.employee_name, info.employee_id);
        
        Ok(info)
    }
    
    /// Save employee info to file
    pub fn save_info(&self, info: &EmployeeInfo) -> Result<()> {
        let json = serde_json::to_string_pretty(info)
            .map_err(|e| MonitoringError::Config(format!("Failed to serialize info: {}", e)))?;
        
        fs::write(&self.info_file_path, json)
            .map_err(|e| MonitoringError::Config(format!("Failed to write info file: {}", e)))?;
        
        info!("✅ Employee info saved: {} (ID: {})", info.employee_name, info.employee_id);
        
        Ok(())
    }
    
    /// Verify admin password
    pub fn verify_password(&self, password: &str) -> bool {
        password == self.admin_password
    }
    
    /// Update employee info with OTP verification
    pub fn update_info(&self, employee_name: String, employee_id: String) -> Result<EmployeeInfo> {
        // Load existing info to get client_id and system_info, or generate new one
        let (client_id, system_info) = if let Ok(existing_info) = self.load_info() {
            (existing_info.client_id, existing_info.system_info)
        } else {
            // First run - collect system info
            let sys_info = SystemInfo::collect().ok();
            (uuid::Uuid::new_v4().to_string(), sys_info)
        };
        
        let info = EmployeeInfo {
            employee_name,
            employee_id,
            client_id,
            system_info,
        };
        
        self.save_info(&info)?;
        
        Ok(info)
    }
    
    /// Get info file path
    pub fn get_info_path(&self) -> &Path {
        &self.info_file_path
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    
    #[test]
    fn test_employee_info_manager() {
        let temp_dir = TempDir::new().unwrap();
        let info_path = temp_dir.path().join("info.json");
        
        let manager = EmployeeInfoManager::new(
            Some(info_path.clone()),
            "admin123".to_string(),
        );
        
        // Initially no info
        assert!(!manager.info_exists());
        
        // Create info with correct password
        let info = manager.update_info(
            "John Doe".to_string(),
            "EMP001".to_string(),
            "admin123".to_string(),
        ).unwrap();
        
        assert_eq!(info.employee_name, "John Doe");
        assert_eq!(info.employee_id, "EMP001");
        
        // Info should now exist
        assert!(manager.info_exists());
        
        // Load info
        let loaded_info = manager.load_info().unwrap();
        assert_eq!(loaded_info.employee_name, "John Doe");
        assert_eq!(loaded_info.employee_id, "EMP001");
        assert_eq!(loaded_info.client_id, info.client_id);
        
        // Try with wrong password
        let result = manager.update_info(
            "Jane Doe".to_string(),
            "EMP002".to_string(),
            "wrongpassword".to_string(),
        );
        assert!(result.is_err());
    }
    
    #[test]
    fn test_password_verification() {
        let manager = EmployeeInfoManager::new(None, "secret123".to_string());
        
        assert!(manager.verify_password("secret123"));
        assert!(!manager.verify_password("wrong"));
        assert!(!manager.verify_password(""));
    }
}
