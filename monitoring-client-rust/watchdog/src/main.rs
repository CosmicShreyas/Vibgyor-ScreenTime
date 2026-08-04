//! ScreenTime's separately identifiable recovery watchdog.
//!
//! This process is intentionally visible in Task Manager as
//! `ScreenTime Watchdog.exe`. It performs no monitoring or data collection; it
//! only checks the supplied client PID and relaunches `monitoring-client.exe`
//! after a confirmed exit. The client's `--stop` signal remains the authorized
//! way for IT and the uninstaller to stop both processes.

#![windows_subsystem = "windows"]

use monitoring_client::modules::resilience;
use std::path::PathBuf;

fn argument_value(args: &[String], name: &str) -> Option<String> {
    args.windows(2)
        .find(|pair| pair[0].eq_ignore_ascii_case(name))
        .map(|pair| pair[1].clone())
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();

    if args.iter().any(|arg| arg.eq_ignore_ascii_case("--stop")) {
        let _ = resilience::request_stop();
        return;
    }

    if resilience::stop_requested() {
        return;
    }

    let watched_pid = argument_value(&args, "--watch")
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(0);
    let client_exe = argument_value(&args, "--client")
        .map(PathBuf::from)
        .or_else(|| {
            std::env::current_exe()
                .ok()
                .and_then(|path| path.parent().map(|parent| parent.join("monitoring-client.exe")))
        })
        .unwrap_or_else(|| PathBuf::from("monitoring-client.exe"));

    if watched_pid == 0 || !client_exe.is_file() {
        return;
    }

    resilience::run_watchdog_loop(client_exe, watched_pid);
}
