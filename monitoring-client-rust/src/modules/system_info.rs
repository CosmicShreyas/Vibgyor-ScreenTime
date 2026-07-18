//! System Information Module
//!
//! Collects system information on first run

use crate::modules::error::Result;
use serde::{Deserialize, Serialize};
use sysinfo::{Disks, System};
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    /// Operating system name
    pub os_name: String,

    /// OS version
    pub os_version: String,

    /// Computer/hostname
    pub hostname: String,

    /// CPU model
    pub cpu_model: String,

    /// Number of CPU cores
    pub cpu_cores: usize,

    /// Total RAM in GB
    pub total_ram_gb: f64,

    /// Total disk space in GB
    pub total_disk_gb: f64,

    /// System architecture (x86_64, etc.)
    pub architecture: String,
}

impl SystemInfo {
    /// Collect system information
    pub fn collect() -> Result<Self> {
        info!("🖥️ Collecting system information...");

        let mut sys = System::new_all();
        sys.refresh_all();

        // Get OS info
        let os_name = System::name().unwrap_or_else(|| "Unknown".to_string());
        let os_version = System::os_version().unwrap_or_else(|| "Unknown".to_string());
        let hostname = System::host_name().unwrap_or_else(|| "Unknown".to_string());

        // Get CPU info
        let cpus = sys.cpus();
        let cpu_model = if !cpus.is_empty() {
            cpus[0].brand().to_string()
        } else {
            "Unknown".to_string()
        };
        let cpu_cores = cpus.len();

        // Get RAM info (convert from bytes to GB)
        let total_ram_gb = sys.total_memory() as f64 / 1024.0 / 1024.0 / 1024.0;

        // Get disk info (sum all disks, convert from bytes to GB)
        let disks = Disks::new_with_refreshed_list();
        let total_disk_gb: f64 = disks
            .list()
            .iter()
            .map(|disk| disk.total_space() as f64)
            .sum::<f64>()
            / 1024.0
            / 1024.0
            / 1024.0;

        // Get architecture
        let architecture = std::env::consts::ARCH.to_string();

        let system_info = SystemInfo {
            os_name,
            os_version,
            hostname,
            cpu_model,
            cpu_cores,
            total_ram_gb,
            total_disk_gb,
            architecture,
        };

        info!("✅ System information collected:");
        info!("  OS: {} {}", system_info.os_name, system_info.os_version);
        info!("  Hostname: {}", system_info.hostname);
        info!(
            "  CPU: {} ({} cores)",
            system_info.cpu_model, system_info.cpu_cores
        );
        info!("  RAM: {:.2} GB", system_info.total_ram_gb);
        info!("  Disk: {:.2} GB", system_info.total_disk_gb);
        info!("  Architecture: {}", system_info.architecture);

        Ok(system_info)
    }
}
