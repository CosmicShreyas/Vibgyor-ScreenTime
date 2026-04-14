//! Build script for VibgyorSeek Monitoring Client
//! 
//! This configures Windows-specific settings to ensure the application
//! runs without a console window.

fn main() {
    // Only apply Windows-specific configuration on Windows targets
    #[cfg(target_os = "windows")]
    {
        // Configure Windows resource file
        let mut res = winres::WindowsResource::new();
        
        // Set application metadata
        res.set_icon("icon.ico") // Optional: add an icon if you have one
            .set("FileDescription", "VibgyorSeek Monitoring Client")
            .set("ProductName", "VibgyorSeek Monitoring")
            .set("CompanyName", "VibgyorSeek")
            .set("LegalCopyright", "Copyright © 2024 VibgyorSeek");
        
        // Compile the resource file
        // This will fail gracefully if icon.ico doesn't exist
        let _ = res.compile();
    }
    
    // Tell Cargo to rerun this script if build.rs changes
    println!("cargo:rerun-if-changed=build.rs");
}
