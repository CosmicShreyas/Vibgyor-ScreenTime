//! Idle-reason prompt.
//!
//! When the user returns from a long idle stretch, ask them to explain what they
//! were doing. Providing a reason is MANDATORY: the themed window blocks
//! Cancel/Escape/close while empty, and if it is dismissed or killed by any
//! means, `prompt_async` re-opens it — it will not stop asking until a non-empty
//! reason is submitted. The response is stored in a shared slot and attached to
//! the next data payload as `idle_reason`. Monitoring continues on the
//! background workers while the prompt is open.

use parking_lot::RwLock;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;
use tracing::{debug, info, warn};

/// Shared slot holding the most recent idle reason, consumed by the payload
/// builder (read-and-clear).
pub type ReasonSlot = Arc<RwLock<Option<String>>>;

pub fn new_slot() -> ReasonSlot {
    Arc::new(RwLock::new(None))
}

/// Show the idle-reason prompt on a background thread and store the result.
/// Non-blocking: spawns its own thread so the caller (activity poll) is never
/// stalled by the modal.
pub fn prompt_async(slot: ReasonSlot, prompt_in_flight: Arc<AtomicBool>, idle_minutes: u64) {
    if prompt_in_flight.swap(true, Ordering::AcqRel) {
        debug!("Idle reason prompt already open; skipping duplicate request");
        return;
    }

    std::thread::spawn(move || {
        // The prompt is MANDATORY: the user must provide a reason. The WPF window
        // itself already blocks Cancel/Esc/X/Alt-F4 while empty, but that can be
        // defeated by killing the PowerShell process (Task Manager) or a launch
        // failure. So we re-ask in a loop here until a non-empty reason comes
        // back — if the window is closed/killed by any means, it simply reopens.
        //
        // A consecutive-failure backoff guards the one pathological case where
        // the themed surface can't launch at all (e.g. PowerShell missing): we
        // slow down instead of hammering a tight loop, but never silently give up.
        let mut consecutive_failures: u32 = 0;
        loop {
            match show_prompt(idle_minutes) {
                Some(reason) if !reason.trim().is_empty() => {
                    info!("🏷️  Idle reason captured: {}", reason);
                    *slot.write() = Some(reason);
                    break;
                }
                _ => {
                    consecutive_failures += 1;
                    warn!(
                        "Idle reason prompt closed without a reason (attempt {}); re-opening — a reason is mandatory",
                        consecutive_failures
                    );
                    // Backoff caps at ~10s so a broken WPF surface doesn't spin.
                    let delay = Duration::from_millis(500 * consecutive_failures.min(20) as u64);
                    std::thread::sleep(delay);
                }
            }
        }
        prompt_in_flight.store(false, Ordering::Release);
    });
}

/// Read and clear the current reason (called when building a payload).
pub fn take_reason(slot: &ReasonSlot) -> Option<String> {
    slot.write().take()
}

#[cfg(target_os = "windows")]
fn show_prompt(idle_minutes: u64) -> Option<String> {
    crate::modules::gui::GuiState::prompt_idle_reason(idle_minutes)
}

#[cfg(not(target_os = "windows"))]
fn show_prompt(_idle_minutes: u64) -> Option<String> {
    None
}
