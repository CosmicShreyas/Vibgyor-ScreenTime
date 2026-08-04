//! Genuineness scorer — decides whether a window of input looks like a real
//! person or a cheat (auto-clicker, macro, mouse jiggler, one-key holder).
//!
//! Pure, deterministic, unit-testable: it takes a slice of `InputEvent` and
//! configuration, and returns a suspicion score (0-100) plus human-readable
//! reasons. `genuineness = 100 - suspicion`. Callers flag when suspicion reaches
//! the configured threshold.
//!
//! Design principle: legitimate work can look repetitive (data entry, scrolling,
//! CAD). No single signal should flag genuine work on its own except the most
//! blatant (a pure jiggler). The score is a weighted blend so corroborating
//! signals are needed for borderline cases.

use crate::modules::input_analyzer::{EventKind, InputEvent};

/// Tunable detection configuration (mirrors server/client config).
#[derive(Debug, Clone)]
pub struct DetectionConfig {
    pub enabled: bool,
    /// Sliding window length in seconds.
    pub window_seconds: u64,
    /// Suspicion score at/above which the window is flagged as fake.
    pub flag_threshold: u8,
    // Per-signal enables.
    pub detect_single_channel: bool, // mouse-only / keyboard-only
    pub detect_robotic: bool,        // near-constant intervals
    pub detect_repetitive_geometry: bool,
    pub detect_jiggle: bool,
    pub detect_no_foreground_change: bool,
    /// Pixels below which a mouse move counts as a "micro" move (jiggle).
    pub jiggle_max_px: i32,
}

impl Default for DetectionConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            window_seconds: 60,
            flag_threshold: 70,
            detect_single_channel: true,
            detect_robotic: true,
            detect_repetitive_geometry: true,
            detect_jiggle: true,
            detect_no_foreground_change: true,
            jiggle_max_px: 6,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Verdict {
    /// 0-100. Higher = more suspicious.
    pub suspicion: u8,
    /// 0-100. 100 - suspicion.
    pub genuineness: u8,
    /// True when suspicion >= flag_threshold.
    pub flagged: bool,
    /// Machine-readable reasons, e.g. "mouse_only", "robotic_intervals".
    pub reasons: Vec<String>,
}

/// Extra context the scorer can use beyond raw input.
#[derive(Debug, Clone, Copy, Default)]
pub struct ScoreContext {
    /// Did the foreground window change during the window?
    pub foreground_changed: bool,
}

/// Score a window of input events.
///
/// Returns `None` when there is not enough input to judge (treated as "no
/// activity" by the caller, which handles the idle case separately).
pub fn score(events: &[InputEvent], cfg: &DetectionConfig, ctx: ScoreContext) -> Option<Verdict> {
    if !cfg.enabled {
        return None;
    }

    let keys = events.iter().filter(|e| e.kind == EventKind::Key).count();
    let clicks = events
        .iter()
        .filter(|e| e.kind == EventKind::MouseClick)
        .count();
    let moves: Vec<&InputEvent> = events
        .iter()
        .filter(|e| e.kind == EventKind::MouseMove)
        .collect();
    let scrolls = events
        .iter()
        .filter(|e| e.kind == EventKind::Scroll)
        .count();

    let total = keys + clicks + moves.len() + scrolls;
    // Need a minimum amount of input to make any judgement.
    if total < 8 {
        return None;
    }

    let mut suspicion: f64 = 0.0;
    let mut reasons: Vec<String> = Vec::new();

    // --- Signal 1: single-channel activity ---------------------------------
    // Mouse activity with zero keystrokes, or keystrokes with zero mouse.
    if cfg.detect_single_channel {
        let mouse_total = clicks + moves.len() + scrolls;
        if keys == 0 && mouse_total > 0 {
            // Mouse-only. Mouse-only WITH no clicks (pure movement) is the classic
            // jiggler signature — weight it higher than mouse-only-with-clicks.
            if clicks == 0 {
                suspicion += 35.0;
                reasons.push("mouse_move_only_no_clicks".into());
            } else {
                suspicion += 18.0;
                reasons.push("mouse_only".into());
            }
        } else if mouse_total == 0 && keys > 0 {
            // Keyboard-only is common for genuine typing — low weight, and only
            // meaningful if it's also robotic (handled by signal 2).
            suspicion += 8.0;
            reasons.push("keyboard_only".into());
        }
    }

    // --- Signal 2: robotic regularity --------------------------------------
    // Humans produce irregular inter-event intervals. A very low coefficient of
    // variation (std/mean) means near-perfectly-spaced events => automation.
    if cfg.detect_robotic {
        if let Some(cv) = interval_cv(events) {
            // cv near 0 => robotic. Humans are typically cv > 0.35.
            if cv < 0.08 {
                suspicion += 40.0;
                reasons.push("robotic_intervals".into());
            } else if cv < 0.18 {
                suspicion += 20.0;
                reasons.push("semi_regular_intervals".into());
            }
        }
    }

    // --- Signal 3: repetitive geometry -------------------------------------
    // Same movement vector repeated, or clicks on the same coordinate.
    if cfg.detect_repetitive_geometry {
        if moves.len() >= 6 {
            let rep = dominant_vector_ratio(&moves);
            if rep > 0.8 {
                suspicion += 25.0;
                reasons.push("repetitive_mouse_vector".into());
            }
        }
        if clicks >= 5 {
            let click_events: Vec<&InputEvent> = events
                .iter()
                .filter(|e| e.kind == EventKind::MouseClick)
                .collect();
            if same_point_ratio(&click_events) > 0.9 {
                suspicion += 25.0;
                reasons.push("clicks_same_point".into());
            }
        }
    }

    // --- Signal 4: tiny-movement jiggle ------------------------------------
    // Sustained micro-moves, no clicks, no keys => USB jiggler / jiggle script.
    if cfg.detect_jiggle && moves.len() >= 6 && clicks == 0 && keys == 0 {
        let micro = moves
            .iter()
            .filter(|m| m.dx.abs() <= cfg.jiggle_max_px && m.dy.abs() <= cfg.jiggle_max_px)
            .count();
        let ratio = micro as f64 / moves.len() as f64;
        if ratio > 0.85 {
            suspicion += 35.0;
            reasons.push("micro_movement_jiggle".into());
        }
    }

    // --- Signal 5: no foreground change (corroborating only) ---------------
    // Only meaningful alongside another signal — reading/watching is legitimate.
    if cfg.detect_no_foreground_change
        && !ctx.foreground_changed
        && keys == 0
        && !reasons.is_empty()
    {
        suspicion += 12.0;
        reasons.push("no_foreground_change".into());
    }

    let suspicion = suspicion.clamp(0.0, 100.0).round() as u8;
    let genuineness = 100u8.saturating_sub(suspicion);
    let flagged = suspicion >= cfg.flag_threshold;

    Some(Verdict {
        suspicion,
        genuineness,
        flagged,
        reasons: if flagged { reasons } else { Vec::new() },
    })
}

/// Coefficient of variation (std/mean) of inter-event intervals, or None if
/// there are too few events.
fn interval_cv(events: &[InputEvent]) -> Option<f64> {
    if events.len() < 5 {
        return None;
    }
    let mut intervals: Vec<f64> = Vec::with_capacity(events.len() - 1);
    for w in events.windows(2) {
        intervals.push((w[1].t_ms as f64 - w[0].t_ms as f64).max(0.0));
    }
    let mean = intervals.iter().sum::<f64>() / intervals.len() as f64;
    if mean <= 0.0 {
        return None;
    }
    let var = intervals.iter().map(|i| (i - mean).powi(2)).sum::<f64>() / intervals.len() as f64;
    Some(var.sqrt() / mean)
}

/// Fraction of mouse moves whose (dx,dy) vector equals the single most common
/// vector. High => the mouse repeats the same motion (macro/jiggler).
fn dominant_vector_ratio(moves: &[&InputEvent]) -> f64 {
    use std::collections::HashMap;
    let mut counts: HashMap<(i32, i32), usize> = HashMap::new();
    let mut considered = 0usize;
    for m in moves {
        if m.dx == 0 && m.dy == 0 {
            continue;
        }
        *counts.entry((m.dx, m.dy)).or_insert(0) += 1;
        considered += 1;
    }
    if considered == 0 {
        return 0.0;
    }
    let max = counts.values().copied().max().unwrap_or(0);
    max as f64 / considered as f64
}

/// Fraction of clicks landing on the single most common (x,y) point.
fn same_point_ratio(clicks: &[&InputEvent]) -> f64 {
    use std::collections::HashMap;
    let mut counts: HashMap<(i32, i32), usize> = HashMap::new();
    for c in clicks {
        *counts.entry((c.x, c.y)).or_insert(0) += 1;
    }
    let max = counts.values().copied().max().unwrap_or(0);
    if clicks.is_empty() {
        0.0
    } else {
        max as f64 / clicks.len() as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(t_ms: u64, kind: EventKind, x: i32, y: i32, dx: i32, dy: i32) -> InputEvent {
        InputEvent {
            t_ms,
            kind,
            x,
            y,
            dx,
            dy,
        }
    }

    fn cfg() -> DetectionConfig {
        DetectionConfig::default()
    }

    #[test]
    fn human_like_typing_and_mixed_input_is_genuine() {
        // Irregular intervals, mix of keys and mouse, varied movement.
        let mut events = Vec::new();
        let intervals = [120u64, 340, 90, 500, 210, 730, 160, 420, 280, 610, 95, 380];
        let mut t = 0u64;
        let mut x = 500;
        for (i, iv) in intervals.iter().enumerate() {
            t += iv;
            if i % 2 == 0 {
                events.push(ev(t, EventKind::Key, 0, 0, 0, 0));
            } else {
                x += (i as i32 * 7) % 23 + 3; // varied deltas
                events.push(ev(
                    t,
                    EventKind::MouseMove,
                    x,
                    400,
                    (i as i32 * 7) % 23 + 3,
                    2,
                ));
            }
        }
        let v = score(
            &events,
            &cfg(),
            ScoreContext {
                foreground_changed: true,
            },
        )
        .unwrap();
        assert!(
            !v.flagged,
            "genuine mixed input should not be flagged (suspicion={})",
            v.suspicion
        );
    }

    #[test]
    fn perfect_interval_autoclicker_is_flagged() {
        // Auto-clicker: identical 500ms spacing, same coordinate.
        let mut events = Vec::new();
        for i in 0..20u64 {
            events.push(ev(i * 500, EventKind::MouseClick, 800, 600, 0, 0));
        }
        let v = score(&events, &cfg(), ScoreContext::default()).unwrap();
        assert!(
            v.flagged,
            "auto-clicker should be flagged (suspicion={})",
            v.suspicion
        );
        assert!(v.reasons.iter().any(|r| r == "robotic_intervals"));
    }

    #[test]
    fn mouse_jiggler_is_flagged() {
        // Tiny cyclic movements, no clicks, no keys.
        let mut events = Vec::new();
        let mut t = 0u64;
        for i in 0..30 {
            t += 1000;
            let d = if i % 2 == 0 { 2 } else { -2 };
            events.push(ev(t, EventKind::MouseMove, 500 + d, 500, d, 0));
        }
        let v = score(
            &events,
            &cfg(),
            ScoreContext {
                foreground_changed: false,
            },
        )
        .unwrap();
        assert!(
            v.flagged,
            "jiggler should be flagged (suspicion={})",
            v.suspicion
        );
    }

    #[test]
    fn genuine_data_entry_typing_not_flagged() {
        // Fast but human typing: keyboard-only, irregular intervals. Should NOT flag.
        let mut events = Vec::new();
        let intervals = [
            90u64, 160, 70, 210, 120, 300, 85, 140, 190, 60, 250, 110, 175, 95,
        ];
        let mut t = 0u64;
        for iv in intervals {
            t += iv;
            events.push(ev(t, EventKind::Key, 0, 0, 0, 0));
        }
        let v = score(
            &events,
            &cfg(),
            ScoreContext {
                foreground_changed: true,
            },
        )
        .unwrap();
        assert!(
            !v.flagged,
            "human data entry should not be flagged (suspicion={})",
            v.suspicion
        );
    }

    #[test]
    fn too_little_input_returns_none() {
        let events = vec![
            ev(0, EventKind::Key, 0, 0, 0, 0),
            ev(100, EventKind::Key, 0, 0, 0, 0),
        ];
        assert!(score(&events, &cfg(), ScoreContext::default()).is_none());
    }

    #[test]
    fn disabled_returns_none() {
        let mut c = cfg();
        c.enabled = false;
        let events: Vec<InputEvent> = (0..20)
            .map(|i| ev(i * 500, EventKind::MouseClick, 1, 1, 0, 0))
            .collect();
        assert!(score(&events, &c, ScoreContext::default()).is_none());
    }
}
