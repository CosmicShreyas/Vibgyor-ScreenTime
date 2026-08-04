//! Build script for ScreenTime Monitoring Client
//! 
//! This configures Windows-specific settings to ensure the application
//! runs without a console window.

fn main() {
    // Only apply Windows-specific configuration on Windows targets
    #[cfg(target_os = "windows")]
    {
        use std::path::Path;

        // Configure Windows resource file
        let mut res = winres::WindowsResource::new();

        // Set application metadata
        res.set("FileDescription", "ScreenTime Monitoring Client")
            .set("ProductName", "ScreenTime Monitoring")
            .set("CompanyName", "ScreenTime")
            .set("OriginalFilename", "monitoring-client.exe")
            .set("LegalCopyright", "Copyright © 2024 ScreenTime");

        // A missing optional icon must not prevent the version and product
        // metadata from being embedded in the executable.
        if Path::new("icon.ico").is_file() {
            res.set_icon("icon.ico");
        }

        // Compile the resource file
        res.compile()
            .expect("failed to compile ScreenTime Windows resources");

        // This package exposes both a library and a binary. Cargo otherwise
        // applies the native resource library to the Rust library target and
        // the linker can discard its symbol-free VERSIONINFO object before it
        // reaches the executable. Force that resource into the client binary.
        let resource_file = Path::new(&std::env::var("OUT_DIR").expect("OUT_DIR is missing"))
            .join("resource.lib");
        println!(
            "cargo:rustc-link-arg-bin=monitoring-client={}",
            resource_file.display()
        );
    }

    // Tell Cargo to rerun this script if build.rs changes
    println!("cargo:rerun-if-changed=build.rs");
}
