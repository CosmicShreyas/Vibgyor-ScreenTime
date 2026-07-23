//! Idle-reason prompt.
//!
//! When the user returns from a long idle stretch, optionally ask them to explain
//! what they were doing. The exact response is stored in a shared slot and attached to
//! the next data payload as
//! `idle_reason`. Monitoring continues on its background workers while the
//! prompt remains open, but the prompt itself cannot be dismissed until a
//! non-empty reason has been submitted.

use parking_lot::RwLock;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tracing::{debug, info};

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
        if let Some(reason) = show_prompt(idle_minutes) {
            info!("🏷️  Idle reason captured: {}", reason);
            *slot.write() = Some(reason);
        } else {
            debug!("Idle reason prompt dismissed");
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
