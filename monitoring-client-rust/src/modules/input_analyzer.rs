//! Input analyzer — privacy-safe capture of raw input *patterns*.
//!
//! Installs Windows low-level hooks (WH_KEYBOARD_LL / WH_MOUSE_LL) and records,
//! per event, only:
//!   - a monotonic timestamp
//!   - the event class (key / move / click / scroll)
//!   - for mouse moves, the (dx, dy) pixel delta and absolute position
//!
//! It NEVER records which key was pressed — no keylogging. The recorded samples
//! feed `GenuinenessScorer` to distinguish a real person from an auto-clicker,
//! mouse jiggler, or macro.
//!
//! The hooks run on a dedicated thread with its own Windows message pump (required
//! for low-level hooks to fire). If the hooks cannot be installed (permissions,
//! RDP, session 0), the analyzer degrades gracefully: `is_active()` returns false
//! and callers fall back to `GetLastInputInfo`-only behavior.

use parking_lot::Mutex;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tracing::{info, warn};

/// Class of an input event (no key identity is ever stored).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventKind {
    Key,
    MouseMove,
    MouseClick,
    Scroll,
}

/// A single recorded input sample. Timestamps are milliseconds since the
/// analyzer's start (monotonic).
#[derive(Debug, Clone, Copy)]
pub struct InputEvent {
    pub t_ms: u64,
    pub kind: EventKind,
    /// Absolute cursor x/y for mouse events (0 for key events).
    pub x: i32,
    pub y: i32,
    /// Movement delta for MouseMove (0 otherwise).
    pub dx: i32,
    pub dy: i32,
}

/// Ring buffer of recent input events, shared with the hook thread.
struct SharedBuffer {
    events: VecDeque<InputEvent>,
    last_mouse_pos: Option<(i32, i32)>,
    start: Instant,
}

impl SharedBuffer {
    fn new() -> Self {
        Self {
            events: VecDeque::with_capacity(8192),
            last_mouse_pos: None,
            start: Instant::now(),
        }
    }

    fn push(&mut self, kind: EventKind, x: i32, y: i32) {
        let t_ms = self.start.elapsed().as_millis() as u64;
        let (dx, dy) = if kind == EventKind::MouseMove {
            match self.last_mouse_pos {
                Some((px, py)) => (x - px, y - py),
                None => (0, 0),
            }
        } else {
            (0, 0)
        };
        if kind == EventKind::MouseMove {
            self.last_mouse_pos = Some((x, y));
        }
        self.events.push_back(InputEvent {
            t_ms,
            kind,
            x,
            y,
            dx,
            dy,
        });
        // Cap the buffer: keep the most recent ~8k events (a few minutes of heavy use).
        while self.events.len() > 8192 {
            self.events.pop_front();
        }
    }

    /// Events in the last `window_ms`, oldest first.
    fn recent(&self, window_ms: u64) -> Vec<InputEvent> {
        let now_ms = self.start.elapsed().as_millis() as u64;
        let cutoff = now_ms.saturating_sub(window_ms);
        self.events
            .iter()
            .filter(|e| e.t_ms >= cutoff)
            .copied()
            .collect()
    }
}

// Global buffer the C hook callbacks write into. Low-level hook procs are plain
// `extern "system"` functions and cannot carry state, so a process-global is the
// standard pattern. Guarded by a mutex; only one analyzer runs per process.
static GLOBAL_BUFFER: Mutex<Option<Arc<Mutex<SharedBuffer>>>> = Mutex::new(None);

/// Public handle to the analyzer.
pub struct InputAnalyzer {
    buffer: Arc<Mutex<SharedBuffer>>,
    active: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
}

impl std::fmt::Debug for InputAnalyzer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("InputAnalyzer")
            .field("active", &self.active.load(Ordering::Relaxed))
            .field("running", &self.running.load(Ordering::Relaxed))
            .finish()
    }
}

impl InputAnalyzer {
    pub fn new() -> Self {
        Self {
            buffer: Arc::new(Mutex::new(SharedBuffer::new())),
            active: Arc::new(AtomicBool::new(false)),
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    /// True if the low-level hooks installed and events are flowing.
    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::Relaxed)
    }

    /// Snapshot of events in the last `window_ms` for the scorer.
    pub fn snapshot(&self, window_ms: u64) -> Vec<InputEvent> {
        self.buffer.lock().recent(window_ms)
    }

    /// Start the hook thread. Idempotent.
    pub fn start(&self) {
        if self.running.swap(true, Ordering::SeqCst) {
            return;
        }
        // Publish our buffer to the global slot for the hook procs.
        *GLOBAL_BUFFER.lock() = Some(Arc::clone(&self.buffer));

        let active = Arc::clone(&self.active);
        let running = Arc::clone(&self.running);

        std::thread::spawn(move || {
            #[cfg(target_os = "windows")]
            {
                run_hook_thread(active, running);
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = &active;
                let _ = &running;
                warn!("InputAnalyzer: low-level hooks only supported on Windows; genuineness detection disabled");
            }
        });
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        self.active.store(false, Ordering::SeqCst);
        *GLOBAL_BUFFER.lock() = None;
    }
}

impl Default for InputAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for InputAnalyzer {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(target_os = "windows")]
fn run_hook_thread(active: Arc<AtomicBool>, running: Arc<AtomicBool>) {
    use std::ptr::null_mut;
    use winapi::shared::minwindef::{LPARAM, LRESULT, WPARAM};
    use winapi::um::winuser::{
        CallNextHookEx, DispatchMessageW, GetMessageW, PeekMessageW, SetWindowsHookExW,
        TranslateMessage, UnhookWindowsHookEx, KBDLLHOOKSTRUCT, MSG, MSLLHOOKSTRUCT, PM_REMOVE,
        WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_LBUTTONDOWN, WM_MBUTTONDOWN, WM_MOUSEMOVE,
        WM_MOUSEWHEEL, WM_QUIT, WM_RBUTTONDOWN, WM_SYSKEYDOWN,
    };

    unsafe {
        // Install both hooks. hmod = null is valid for LL hooks.
        let kb_hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), null_mut(), 0);
        let mouse_hook = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), null_mut(), 0);

        if kb_hook.is_null() && mouse_hook.is_null() {
            warn!("InputAnalyzer: failed to install any input hook; genuineness detection disabled (falling back to idle-only)");
            running.store(false, Ordering::SeqCst);
            return;
        }
        if kb_hook.is_null() {
            warn!("InputAnalyzer: keyboard hook failed; keyboard signals unavailable");
        }
        if mouse_hook.is_null() {
            warn!("InputAnalyzer: mouse hook failed; mouse signals unavailable");
        }

        active.store(true, Ordering::SeqCst);
        info!("🕵️  InputAnalyzer hooks installed (privacy-safe: no key identities recorded)");

        // Message pump: LL hooks only fire while this thread pumps messages.
        let mut msg: MSG = std::mem::zeroed();
        while running.load(Ordering::Relaxed) {
            // Non-blocking peek so we can observe the running flag and exit promptly.
            let got = PeekMessageW(&mut msg, null_mut(), 0, 0, PM_REMOVE);
            if got != 0 {
                if msg.message == WM_QUIT {
                    break;
                }
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            } else {
                std::thread::sleep(std::time::Duration::from_millis(15));
            }
        }

        if !kb_hook.is_null() {
            UnhookWindowsHookEx(kb_hook);
        }
        if !mouse_hook.is_null() {
            UnhookWindowsHookEx(mouse_hook);
        }
        active.store(false, Ordering::SeqCst);
        info!("🕵️  InputAnalyzer hooks removed");

        // Silence unused-import warnings on constants used only for matching below.
        let _ = (
            WM_KEYDOWN,
            WM_SYSKEYDOWN,
            WM_MOUSEMOVE,
            WM_LBUTTONDOWN,
            WM_RBUTTONDOWN,
            WM_MBUTTONDOWN,
            WM_MOUSEWHEEL,
            GetMessageW as usize,
        );
        let _: Option<unsafe extern "system" fn(i32, WPARAM, LPARAM) -> LRESULT> =
            Some(keyboard_proc);
        let _ = CallNextHookEx;
        let _ = std::mem::size_of::<KBDLLHOOKSTRUCT>();
        let _ = std::mem::size_of::<MSLLHOOKSTRUCT>();
    }
}

#[cfg(target_os = "windows")]
fn record(kind: EventKind, x: i32, y: i32) {
    // Fast path: clone the Arc out under a short lock, then push.
    let buf = { GLOBAL_BUFFER.lock().clone() };
    if let Some(buf) = buf {
        buf.lock().push(kind, x, y);
    }
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn keyboard_proc(
    code: i32,
    wparam: winapi::shared::minwindef::WPARAM,
    lparam: winapi::shared::minwindef::LPARAM,
) -> winapi::shared::minwindef::LRESULT {
    use winapi::um::winuser::{CallNextHookEx, HC_ACTION, WM_KEYDOWN, WM_SYSKEYDOWN};
    if code == HC_ACTION {
        let msg = wparam as u32;
        // Only count key-DOWN events. We deliberately do NOT read the vkCode /
        // key identity from lparam — only that *a* key was pressed.
        if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
            record(EventKind::Key, 0, 0);
        }
    }
    CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn mouse_proc(
    code: i32,
    wparam: winapi::shared::minwindef::WPARAM,
    lparam: winapi::shared::minwindef::LPARAM,
) -> winapi::shared::minwindef::LRESULT {
    use winapi::um::winuser::{
        CallNextHookEx, HC_ACTION, MSLLHOOKSTRUCT, WM_LBUTTONDOWN, WM_MBUTTONDOWN, WM_MOUSEMOVE,
        WM_MOUSEWHEEL, WM_RBUTTONDOWN,
    };
    if code == HC_ACTION {
        let msg = wparam as u32;
        let info = &*(lparam as *const MSLLHOOKSTRUCT);
        let x = info.pt.x;
        let y = info.pt.y;
        match msg {
            WM_MOUSEMOVE => record(EventKind::MouseMove, x, y),
            WM_LBUTTONDOWN | WM_RBUTTONDOWN | WM_MBUTTONDOWN => record(EventKind::MouseClick, x, y),
            WM_MOUSEWHEEL => record(EventKind::Scroll, x, y),
            _ => {}
        }
    }
    CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buffer_records_and_windows() {
        let mut b = SharedBuffer::new();
        b.push(EventKind::Key, 0, 0);
        b.push(EventKind::MouseMove, 100, 100);
        b.push(EventKind::MouseMove, 110, 100);
        let recent = b.recent(60_000);
        assert_eq!(recent.len(), 3);
        // Second move should have dx=10 relative to the first move.
        let moves: Vec<_> = recent
            .iter()
            .filter(|e| e.kind == EventKind::MouseMove)
            .collect();
        assert_eq!(moves[1].dx, 10);
        assert_eq!(moves[1].dy, 0);
    }

    #[test]
    fn buffer_caps_size() {
        let mut b = SharedBuffer::new();
        for _ in 0..9000 {
            b.push(EventKind::Key, 0, 0);
        }
        assert!(b.events.len() <= 8192);
    }
}
