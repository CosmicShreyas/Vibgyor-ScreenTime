// Module declarations for the monitoring client
// Each module will be implemented in separate files

// Core monitoring modules
pub mod activity_tracker;
pub mod app_monitor;
pub mod browser_monitor;
pub mod location_tracker;
pub mod screenshot;

// Genuine-activity (anti-cheat) detection
pub mod genuineness;
pub mod input_analyzer;

// Idle-reason prompt
pub mod idle_prompt;

// Resilience & anti-tamper (watchdog, self-heal auto-start, tamper signals)
pub mod resilience;

// Data management modules
pub mod config;
pub mod payload_builder;
pub mod queue_manager;

// Network communication modules
pub mod config_watcher;
pub mod http_transmitter;
pub mod retry_manager;
pub mod updater;

// Employee information
pub mod employee_info;
pub mod otp_client;
pub mod system_info;

// GUI and system tray
pub mod gui;
pub mod system_tray;

// Logging
pub mod logger;

// Utilities
pub mod error;
pub mod types;
