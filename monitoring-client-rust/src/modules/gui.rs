//! GUI Module for Employee Information Management
//!
//! Provides a simple GUI for:
//! - Initial setup (employee name, ID, admin password)
//! - Settings update (change employee info)
//! - System tray integration

use crate::modules::employee_info::{EmployeeInfo, EmployeeInfoManager};
use crate::modules::otp_client::OTPClient;
use crate::modules::error::{MonitoringError, Result};
use std::sync::Arc;
use parking_lot::RwLock;
use tracing::{info, error};

#[cfg(target_os = "windows")]
use rfd::MessageDialog as RfdMessageDialog;
#[cfg(target_os = "windows")]
use rfd::MessageLevel;

/// Navigation result for multi-step dialogs
#[derive(Debug)]
enum NavigationResult {
    Next(String),
    Back,
    Cancel,
}

/// GUI state
pub struct GuiState {
    /// Employee info manager
    pub info_manager: Arc<EmployeeInfoManager>,
    
    /// OTP client
    pub otp_client: Arc<OTPClient>,
    
    /// Current employee info (if loaded)
    pub current_info: Arc<RwLock<Option<EmployeeInfo>>>,
    
    /// Callback for info updates
    pub on_info_updated: Arc<RwLock<Option<Box<dyn Fn(EmployeeInfo) + Send + Sync>>>>,
}

impl GuiState {
    /// Create new GUI state
    pub fn new(info_manager: Arc<EmployeeInfoManager>, otp_client: Arc<OTPClient>) -> Self {
        let current_info = if let Ok(info) = info_manager.load_info() {
            Some(info)
        } else {
            None
        };
        
        Self {
            info_manager,
            otp_client,
            current_info: Arc::new(RwLock::new(current_info)),
            on_info_updated: Arc::new(RwLock::new(None)),
        }
    }
    
    /// Request OTP synchronously (spawns async task and waits)
    fn request_otp_sync(&self, client_id: &str, employee_name: &str, employee_id: &str) -> Result<String> {
        let otp_client = Arc::clone(&self.otp_client);
        let client_id = client_id.to_string();
        let employee_name = employee_name.to_string();
        let employee_id = employee_id.to_string();
        
        // Spawn a new task and wait for it
        let result = std::thread::spawn(move || {
            tokio::runtime::Runtime::new()
                .unwrap()
                .block_on(async move {
                    otp_client.request_otp(&client_id, &employee_name, &employee_id).await
                })
        }).join();
        
        match result {
            Ok(r) => r,
            Err(_) => Err(MonitoringError::Config("Failed to request OTP".to_string())),
        }
    }
    
    /// Verify OTP synchronously (spawns async task and waits)
    fn verify_otp_sync(&self, client_id: &str, otp: &str) -> Result<()> {
        let otp_client = Arc::clone(&self.otp_client);
        let client_id = client_id.to_string();
        let otp = otp.to_string();
        
        // Spawn a new task and wait for it
        let result = std::thread::spawn(move || {
            tokio::runtime::Runtime::new()
                .unwrap()
                .block_on(async move {
                    otp_client.verify_otp(&client_id, &otp).await
                })
        }).join();
        
        match result {
            Ok(r) => r,
            Err(_) => Err(MonitoringError::Config("Failed to verify OTP".to_string())),
        }
    }
    
    /// Set callback for info updates
    pub fn set_on_info_updated<F>(&self, callback: F)
    where
        F: Fn(EmployeeInfo) + Send + Sync + 'static,
    {
        *self.on_info_updated.write() = Some(Box::new(callback));
    }
    
    /// Show setup dialog (first time)
    #[cfg(target_os = "windows")]
    pub fn show_setup_dialog(&self) -> Result<EmployeeInfo> {
        info!("📋 Showing initial setup dialog");
        
        // Store answers for navigation
        let mut employee_name = String::new();
        let mut employee_id = String::new();
        let mut password = String::new();
        let mut current_step = 1;
        
        loop {
            match current_step {
                1 => {
                    // Step 1: Get employee name
                    let prompt = if employee_name.is_empty() {
                        "Enter your full name:".to_string()
                    } else {
                        format!("Enter your full name:$([char]13)$([char]10)$([char]13)$([char]10)Current value: {}$([char]13)$([char]10)$([char]13)$([char]10)Press OK to keep or enter new value:", employee_name)
                    };
                    
                    match self.prompt_input_with_navigation("Employee Setup - Step 1/4", &prompt, &employee_name, false) {
                        NavigationResult::Next(name) if !name.trim().is_empty() => {
                            employee_name = name.trim().to_string();
                            current_step = 2;
                        }
                        NavigationResult::Next(_) => {
                            self.show_error("Setup Required", "Employee name cannot be empty.");
                        }
                        NavigationResult::Back => {
                            // Can't go back from step 1
                            self.show_info("First Step", "This is the first step. Please enter your name to continue.");
                        }
                        NavigationResult::Cancel => {
                            std::process::exit(0);
                        }
                    }
                }
                2 => {
                    // Step 2: Get employee ID
                    let summary = format!("Previous answers:$([char]13)$([char]10)  - Name: {}$([char]13)$([char]10)$([char]13)$([char]10)", employee_name);
                    let prompt = if employee_id.is_empty() {
                        format!("{}Enter your employee ID:", summary)
                    } else {
                        format!("{}Enter your employee ID:$([char]13)$([char]10)$([char]13)$([char]10)Current value: {}$([char]13)$([char]10)$([char]13)$([char]10)Press OK to keep or enter new value:", summary, employee_id)
                    };
                    
                    match self.prompt_input_with_navigation("Employee Setup - Step 2/4", &prompt, &employee_id, true) {
                        NavigationResult::Next(id) if !id.trim().is_empty() => {
                            employee_id = id.trim().to_string();
                            current_step = 3;
                        }
                        NavigationResult::Next(_) => {
                            self.show_error("Setup Required", "Employee ID cannot be empty.");
                        }
                        NavigationResult::Back => {
                            current_step = 1;
                        }
                        NavigationResult::Cancel => {
                            std::process::exit(0);
                        }
                    }
                }
                3 => {
                    // Step 3: Get admin password and verify
                    let summary = format!("Previous answers:$([char]13)$([char]10)  - Name: {}$([char]13)$([char]10)  - Employee ID: {}$([char]13)$([char]10)$([char]13)$([char]10)", employee_name, employee_id);
                    let prompt = format!("{}Enter admin password:", summary);
                    
                    match self.prompt_input_with_navigation("Employee Setup - Step 3/4", &prompt, "", true) {
                        NavigationResult::Next(pwd) if !pwd.is_empty() => {
                            // Verify password
                            if !self.info_manager.verify_password(&pwd) {
                                self.show_error("Invalid Password", "The admin password is incorrect. Please try again.");
                            } else {
                                password = pwd;
                                current_step = 4;
                            }
                        }
                        NavigationResult::Next(_) => {
                            self.show_error("Setup Required", "Admin password cannot be empty.");
                        }
                        NavigationResult::Back => {
                            current_step = 2;
                        }
                        NavigationResult::Cancel => {
                            std::process::exit(0);
                        }
                    }
                }
                4 => {
                    // Get or generate client ID
                    let client_id = if let Ok(existing_info) = self.info_manager.load_info() {
                        existing_info.client_id
                    } else {
                        uuid::Uuid::new_v4().to_string()
                    };
                    
                    // Password verified, now request OTP from server
                    info!("📧 Requesting OTP from server...");
                    let otp_message = match self.request_otp_sync(&client_id, &employee_name, &employee_id) {
                        Ok(msg) => msg,
                        Err(e) => {
                            self.show_error("OTP Request Failed", &format!("Failed to request OTP from server.$([char]13)$([char]10)$([char]13)$([char]10)Error: {}$([char]13)$([char]10)$([char]13)$([char]10)You can go back to correct your information.", e));
                            current_step = 3;
                            continue;
                        }
                    };
                    
                    self.show_info("OTP Sent", &otp_message);
                    
                    // Step 4: Get OTP from user
                    let summary = format!("Previous answers:$([char]13)$([char]10)  - Name: {}$([char]13)$([char]10)  - Employee ID: {}$([char]13)$([char]10)  - Password: Verified$([char]13)$([char]10)$([char]13)$([char]10)", employee_name, employee_id);
                    let prompt = format!("{}Enter the OTP sent to admin email:", summary);
                    
                    match self.prompt_input_with_navigation("Employee Setup - Step 4/4", &prompt, "", true) {
                        NavigationResult::Next(otp) if !otp.is_empty() => {
                            // Verify OTP with server
                            info!("🔐 Verifying OTP...");
                            match self.verify_otp_sync(&client_id, &otp) {
                                Ok(_) => {
                                    // OTP verified, save employee info
                                    match self.info_manager.update_info(employee_name.clone(), employee_id.clone()) {
                                        Ok(info) => {
                                            self.show_success(
                                                "Setup Complete",
                                                &format!("Employee information saved successfully!$([char]13)$([char]10)$([char]13)$([char]10)Name: {}$([char]13)$([char]10)ID: {}", 
                                                        info.employee_name, info.employee_id)
                                            );
                                            
                                            *self.current_info.write() = Some(info.clone());
                                            
                                            // Trigger callback
                                            if let Some(callback) = self.on_info_updated.read().as_ref() {
                                                callback(info.clone());
                                            }
                                            
                                            return Ok(info);
                                        }
                                        Err(e) => {
                                            self.show_error("Setup Failed", &format!("Failed to save employee information.$([char]13)$([char]10)$([char]13)$([char]10)Error: {}", e));
                                            current_step = 3;
                                        }
                                    }
                                }
                                Err(e) => {
                                    self.show_error("OTP Verification Failed", &format!("{}$([char]13)$([char]10)$([char]13)$([char]10)You can go back to request a new OTP.", e));
                                    current_step = 3;
                                }
                            }
                        }
                        NavigationResult::Next(_) => {
                            self.show_error("Setup Required", "OTP is required to complete setup.");
                        }
                        NavigationResult::Back => {
                            current_step = 3;
                        }
                        NavigationResult::Cancel => {
                            std::process::exit(0);
                        }
                    }
                }
                _ => unreachable!(),
            }
        }
    }
    
    /// Show settings dialog (update info)
    #[cfg(target_os = "windows")]
    pub fn show_settings_dialog(&self) -> Result<()> {
        info!("⚙️ Showing settings dialog");
        
        let current_info = self.current_info.read();
        let (current_name, current_id, client_id) = if let Some(info) = current_info.as_ref() {
            (info.employee_name.clone(), info.employee_id.clone(), info.client_id.clone())
        } else {
            (String::new(), String::new(), uuid::Uuid::new_v4().to_string())
        };
        drop(current_info);
        
        // Store answers for navigation
        let mut employee_name = current_name.clone();
        let mut employee_id = current_id.clone();
        let mut password = String::new();
        let mut current_step = 1;
        
        loop {
            match current_step {
                1 => {
                    // Step 1: Get new employee name
                    let prompt = format!(
                        "Enter your full name:$([char]13)$([char]10)$([char]13)$([char]10)Current value: {}$([char]13)$([char]10)$([char]13)$([char]10)Press OK to keep or enter new value:",
                        employee_name
                    );
                    
                    match self.prompt_input_with_navigation("Update Employee Information - Step 1/4", &prompt, &employee_name, false) {
                        NavigationResult::Next(name) if !name.trim().is_empty() => {
                            employee_name = name.trim().to_string();
                            current_step = 2;
                        }
                        NavigationResult::Next(_) => {
                            employee_name = current_name.clone();
                            current_step = 2;
                        }
                        NavigationResult::Back => {
                            self.show_info("First Step", "This is the first step. Please enter your name to continue.");
                        }
                        NavigationResult::Cancel => {
                            return Ok(());
                        }
                    }
                }
                2 => {
                    // Step 2: Get new employee ID
                    let summary = format!("Previous answers:$([char]13)$([char]10)  - Name: {}$([char]13)$([char]10)$([char]13)$([char]10)", employee_name);
                    let prompt = format!(
                        "{}Enter your employee ID:$([char]13)$([char]10)$([char]13)$([char]10)Current value: {}$([char]13)$([char]10)$([char]13)$([char]10)Press OK to keep or enter new value:",
                        summary, employee_id
                    );
                    
                    match self.prompt_input_with_navigation("Update Employee Information - Step 2/4", &prompt, &employee_id, true) {
                        NavigationResult::Next(id) if !id.trim().is_empty() => {
                            employee_id = id.trim().to_string();
                            current_step = 3;
                        }
                        NavigationResult::Next(_) => {
                            employee_id = current_id.clone();
                            current_step = 3;
                        }
                        NavigationResult::Back => {
                            current_step = 1;
                        }
                        NavigationResult::Cancel => {
                            return Ok(());
                        }
                    }
                }
                3 => {
                    // Step 3: Get admin password and verify
                    let summary = format!("Previous answers:$([char]13)$([char]10)  - Name: {}$([char]13)$([char]10)  - Employee ID: {}$([char]13)$([char]10)$([char]13)$([char]10)", employee_name, employee_id);
                    let prompt = format!("{}Enter admin password:", summary);
                    
                    match self.prompt_input_with_navigation("Update Employee Information - Step 3/4", &prompt, "", true) {
                        NavigationResult::Next(pwd) if !pwd.is_empty() => {
                            // Verify password
                            if !self.info_manager.verify_password(&pwd) {
                                self.show_error("Invalid Password", "The admin password is incorrect. Please try again.");
                            } else {
                                password = pwd;
                                current_step = 4;
                            }
                        }
                        NavigationResult::Next(_) => {
                            self.show_error("Password Required", "Admin password cannot be empty.");
                        }
                        NavigationResult::Back => {
                            current_step = 2;
                        }
                        NavigationResult::Cancel => {
                            return Ok(());
                        }
                    }
                }
                4 => {
                    // Password verified, now request OTP from server
                    info!("📧 Requesting OTP from server...");
                    let otp_message = match self.request_otp_sync(&client_id, &employee_name, &employee_id) {
                        Ok(msg) => msg,
                        Err(e) => {
                            self.show_error("OTP Request Failed", &format!("Failed to request OTP from server.$([char]13)$([char]10)$([char]13)$([char]10)Error: {}$([char]13)$([char]10)$([char]13)$([char]10)You can go back to correct your information.", e));
                            current_step = 3;
                            continue;
                        }
                    };
                    
                    self.show_info("OTP Sent", &otp_message);
                    
                    // Step 4: Get OTP from user
                    let summary = format!("Previous answers:$([char]13)$([char]10)  - Name: {}$([char]13)$([char]10)  - Employee ID: {}$([char]13)$([char]10)  - Password: Verified$([char]13)$([char]10)$([char]13)$([char]10)", employee_name, employee_id);
                    let prompt = format!("{}Enter the OTP sent to admin email:", summary);
                    
                    match self.prompt_input_with_navigation("Update Employee Information - Step 4/4", &prompt, "", true) {
                        NavigationResult::Next(otp) if !otp.is_empty() => {
                            // Verify OTP with server
                            info!("🔐 Verifying OTP...");
                            match self.verify_otp_sync(&client_id, &otp) {
                                Ok(_) => {
                                    // OTP verified, save employee info
                                    match self.info_manager.update_info(employee_name.clone(), employee_id.clone()) {
                                        Ok(info) => {
                                            self.show_success(
                                                "Update Complete",
                                                &format!("Employee information updated successfully!$([char]13)$([char]10)$([char]13)$([char]10)Name: {}$([char]13)$([char]10)ID: {}", 
                                                        info.employee_name, info.employee_id)
                                            );
                                            
                                            *self.current_info.write() = Some(info.clone());
                                            
                                            // Trigger callback
                                            if let Some(callback) = self.on_info_updated.read().as_ref() {
                                                callback(info.clone());
                                            }
                                            
                                            return Ok(());
                                        }
                                        Err(e) => {
                                            self.show_error("Update Failed", &format!("Failed to update employee information.$([char]13)$([char]10)$([char]13)$([char]10)Error: {}", e));
                                            current_step = 3;
                                        }
                                    }
                                }
                                Err(e) => {
                                    self.show_error("OTP Verification Failed", &format!("{}$([char]13)$([char]10)$([char]13)$([char]10)You can go back to request a new OTP.", e));
                                    current_step = 3;
                                }
                            }
                        }
                        NavigationResult::Next(_) => {
                            self.show_error("OTP Required", "OTP is required to complete the update.");
                        }
                        NavigationResult::Back => {
                            current_step = 3;
                        }
                        NavigationResult::Cancel => {
                            return Ok(());
                        }
                    }
                }
                _ => unreachable!(),
            }
        }
    }
    
    /// Show about dialog
    #[cfg(target_os = "windows")]
    pub fn show_about_dialog(&self) {
        let current_info = self.current_info.read();
        let info_text = if let Some(info) = current_info.as_ref() {
            format!(
                "VibgyorSeek Monitoring Client\n\n\
                Employee: {}\n\
                ID: {}\n\
                Client ID: {}\n\n\
                Version: 1.0.0",
                info.employee_name,
                info.employee_id,
                info.client_id
            )
        } else {
            "VibgyorSeek Monitoring Client\n\nVersion: 1.0.0\n\nNo employee information configured.".to_string()
        };
        
        RfdMessageDialog::new()
            .set_level(MessageLevel::Info)
            .set_title("About VibgyorSeek Monitoring")
            .set_description(&info_text)
            .set_buttons(rfd::MessageButtons::Ok)
            .show();
    }
    
    /// Prompt for text input with navigation support (Back/Next)
    #[cfg(target_os = "windows")]
    fn prompt_input_with_navigation(&self, title: &str, message: &str, default: &str, allow_back: bool) -> NavigationResult {
        use std::process::Command;
        
        // Create a custom dialog with Back/Next buttons
        let buttons_text = if allow_back {
            "Back | Next | Cancel"
        } else {
            "Next | Cancel"
        };
        
        // Use actual newline characters that Windows MessageBox understands
        // We need to use [char]13 (CR) and [char]10 (LF) for proper line breaks
        let full_message = format!("{}$([char]13)$([char]10)$([char]13)$([char]10){}", message, buttons_text);
        
        // First show the message with options
        let choice_script = if allow_back {
            format!(
                r#"Add-Type -AssemblyName System.Windows.Forms; $msg = "{}"; $result = [System.Windows.Forms.MessageBox]::Show($msg, '{}', 'YesNoCancel', 'Question'); if ($result -eq 'Yes') {{ 'NEXT' }} elseif ($result -eq 'No') {{ 'BACK' }} else {{ 'CANCEL' }}"#,
                full_message.replace("\"", "`\"").replace("'", "''"),
                title.replace("'", "''")
            )
        } else {
            format!(
                r#"Add-Type -AssemblyName System.Windows.Forms; $msg = "{}"; $result = [System.Windows.Forms.MessageBox]::Show($msg, '{}', 'OKCancel', 'Question'); if ($result -eq 'OK') {{ 'NEXT' }} else {{ 'CANCEL' }}"#,
                full_message.replace("\"", "`\"").replace("'", "''"),
                title.replace("'", "''")
            )
        };
        
        let choice_output = {
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                Command::new("powershell")
                    .args(&["-NoProfile", "-Command", &choice_script])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output()
                    .ok()
            }
            #[cfg(not(target_os = "windows"))]
            {
                Command::new("powershell")
                    .args(&["-NoProfile", "-Command", &choice_script])
                    .output()
                    .ok()
            }
        };
        
        if let Some(output) = choice_output {
            let choice = String::from_utf8_lossy(&output.stdout).trim().to_string();
            
            match choice.as_str() {
                "BACK" => return NavigationResult::Back,
                "CANCEL" => return NavigationResult::Cancel,
                "NEXT" => {
                    // Now show input dialog
                    let input_script = format!(
                        r#"Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.Interaction]::InputBox('Enter value:', '{}', '{}')"#,
                        title.replace("'", "''"),
                        default.replace("'", "''")
                    );
                    
                    let input_output = {
                        #[cfg(target_os = "windows")]
                        {
                            use std::os::windows::process::CommandExt;
                            const CREATE_NO_WINDOW: u32 = 0x08000000;
                            Command::new("powershell")
                                .args(&["-NoProfile", "-Command", &input_script])
                                .creation_flags(CREATE_NO_WINDOW)
                                .output()
                                .ok()
                        }
                        #[cfg(not(target_os = "windows"))]
                        {
                            Command::new("powershell")
                                .args(&["-NoProfile", "-Command", &input_script])
                                .output()
                                .ok()
                        }
                    };
                    
                    if let Some(output) = input_output {
                        let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
                        if result.is_empty() && !default.is_empty() {
                            return NavigationResult::Next(default.to_string());
                        } else {
                            return NavigationResult::Next(result);
                        }
                    }
                }
                _ => {}
            }
        }
        
        NavigationResult::Cancel
    }
    
    /// Prompt for text input
    #[cfg(target_os = "windows")]
    fn prompt_input(&self, title: &str, message: &str) -> Option<String> {
        use std::process::Command;
        
        // Use PowerShell to show input dialog
        let script = format!(
            r#"Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.Interaction]::InputBox('{}', '{}')"#,
            message.replace("'", "''"),
            title.replace("'", "''")
        );
        
        let output = {
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                Command::new("powershell")
                    .args(&["-NoProfile", "-Command", &script])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output()
                    .ok()?
            }
            #[cfg(not(target_os = "windows"))]
            {
                Command::new("powershell")
                    .args(&["-NoProfile", "-Command", &script])
                    .output()
                    .ok()?
            }
        };
        
        if output.status.success() {
            let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if result.is_empty() {
                None
            } else {
                Some(result)
            }
        } else {
            None
        }
    }
    
    /// Prompt for text input with default value
    #[cfg(target_os = "windows")]
    fn prompt_input_with_default(&self, title: &str, message: &str, default: &str) -> Option<String> {
        use std::process::Command;
        
        let script = format!(
            r#"Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.Interaction]::InputBox('{}', '{}', '{}')"#,
            message.replace("'", "''"),
            title.replace("'", "''"),
            default.replace("'", "''")
        );
        
        let output = {
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                Command::new("powershell")
                    .args(&["-NoProfile", "-Command", &script])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output()
                    .ok()?
            }
            #[cfg(not(target_os = "windows"))]
            {
                Command::new("powershell")
                    .args(&["-NoProfile", "-Command", &script])
                    .output()
                    .ok()?
            }
        };
        
        if output.status.success() {
            let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if result.is_empty() {
                Some(default.to_string())
            } else {
                Some(result)
            }
        } else {
            None
        }
    }
    
    /// Convert PowerShell newline syntax to actual newlines for rfd dialogs
    #[cfg(target_os = "windows")]
    fn ps_to_newline(text: &str) -> String {
        text.replace("$([char]13)$([char]10)", "\n")
    }
    
    /// Show error message
    #[cfg(target_os = "windows")]
    fn show_error(&self, title: &str, message: &str) {
        let clean_message = Self::ps_to_newline(message);
        error!("❌ {}: {}", title, clean_message);
        RfdMessageDialog::new()
            .set_level(MessageLevel::Error)
            .set_title(title)
            .set_description(&clean_message)
            .set_buttons(rfd::MessageButtons::Ok)
            .show();
    }
    
    /// Show success message
    #[cfg(target_os = "windows")]
    fn show_success(&self, title: &str, message: &str) {
        let clean_message = Self::ps_to_newline(message);
        info!("✅ {}: {}", title, clean_message);
        RfdMessageDialog::new()
            .set_level(MessageLevel::Info)
            .set_title(title)
            .set_description(&clean_message)
            .set_buttons(rfd::MessageButtons::Ok)
            .show();
    }
    
    /// Show info message
    #[cfg(target_os = "windows")]
    fn show_info(&self, title: &str, message: &str) {
        let clean_message = Self::ps_to_newline(message);
        info!("ℹ️ {}: {}", title, clean_message);
        RfdMessageDialog::new()
            .set_level(MessageLevel::Info)
            .set_title(title)
            .set_description(&clean_message)
            .set_buttons(rfd::MessageButtons::Ok)
            .show();
    }
    
    /// Get current employee info
    pub fn get_current_info(&self) -> Option<EmployeeInfo> {
        self.current_info.read().clone()
    }
}

// Non-Windows stub implementations
#[cfg(not(target_os = "windows"))]
impl GuiState {
    pub fn show_setup_dialog(&self) -> Result<EmployeeInfo> {
        unimplemented!("GUI is only supported on Windows")
    }
    
    pub fn show_settings_dialog(&self) -> Result<()> {
        unimplemented!("GUI is only supported on Windows")
    }
    
    pub fn show_about_dialog(&self) {
        unimplemented!("GUI is only supported on Windows")
    }
}
