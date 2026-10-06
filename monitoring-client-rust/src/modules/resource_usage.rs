//! Lightweight endpoint resource telemetry. It is collected once per minute
//! using normal user-level OS APIs; no elevation or driver access is required.

use serde::{Deserialize, Serialize};
use sysinfo::{Disks, System, MINIMUM_CPU_UPDATE_INTERVAL};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceUsage {
    pub sampled_at: String,
    pub cpu_percent: f32,
    pub memory_used_bytes: u64,
    pub memory_total_bytes: u64,
    pub disk_used_bytes: u64,
    pub disk_total_bytes: u64,
}

/// One intentionally infrequent system-wide sample. CPU needs two reads to
/// produce a rate, hence the short sysinfo-required wait inside the sampler.
pub fn collect() -> ResourceUsage {
    let mut system = System::new_all();
    system.refresh_cpu_usage();
    std::thread::sleep(MINIMUM_CPU_UPDATE_INTERVAL);
    system.refresh_cpu_usage();
    system.refresh_memory();
    let disks = Disks::new_with_refreshed_list();
    let (disk_total_bytes, disk_used_bytes) = disks.list().iter().fold((0_u64, 0_u64), |(total, used), disk| {
        (total.saturating_add(disk.total_space()), used.saturating_add(disk.total_space().saturating_sub(disk.available_space())))
    });
    ResourceUsage {
        sampled_at: chrono::Utc::now().to_rfc3339(),
        cpu_percent: system.global_cpu_info().cpu_usage(),
        memory_used_bytes: system.used_memory(),
        memory_total_bytes: system.total_memory(),
        disk_used_bytes,
        disk_total_bytes,
    }
}
