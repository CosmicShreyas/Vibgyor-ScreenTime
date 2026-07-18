# Advanced Client: Genuine-Activity Engine + Resilience — Design

**Date:** 2026-07-16
**Component:** `monitoring-client-rust` (primary), `monitoring-server`, `monitoring-dashboard`

## Goal

Make the client detect fake/cheated activity (auto-clickers, mouse jigglers,
mouse-only or keyboard-only stretches, input with no real work) and treat it as
idle + flag it, using a tunable confidence score. Plus add intensity metrics,
idle-reason prompts, offline resilience, and a fast heartbeat with tamper signals.

Privacy rule (hard constraint): **never record which keys are pressed.** Only
counts, timing intervals, and mouse-movement geometry.

## Architecture

Today `ActivityTracker` polls `GetLastInputInfo()` — it only knows *seconds since
last input*, not the type or rhythm. That cannot distinguish a human from a bot.

Add a new **`InputAnalyzer`** module that installs Windows low-level hooks
(`WH_KEYBOARD_LL`, `WH_MOUSE_LL`) via the existing `winapi` dependency (no new
crate). The hook thread runs its own message pump and records, per event, only:
timestamp, event class (keydown / mousemove / mouseclick / scroll), and for mouse
moves the (dx, dy) delta. Key identities are discarded.

`GetLastInputInfo` polling stays as a cheap idle cross-check. Final state derives
from both:

```
InputAnalyzer (event stream) ─┐
                              ├─► GenuinenessScorer ─► verdict {genuine | suspect, confidence, reasons[]}
GetLastInputInfo (idle poll) ─┘
                                          │
ActivityTracker ──────────────────────────┴─► state: Work | Idle | SuspectedFake
```

- `Work` — genuine input within idle threshold.
- `Idle` — no input for idle threshold (unchanged).
- `SuspectedFake` — input present but scorer says not-genuine above the flag
  threshold. Counted as **idle** in work/idle totals, and reported with reasons.

If hooks fail to install (permissions/RDP/session 0), the analyzer degrades
gracefully: it disables scoring and the client behaves exactly as today
(`GetLastInputInfo` only). No crash, logged once.

## Detection signals (feed the confidence score)

Evaluated over a sliding window (default 60s, configurable). Each contributes to a
0–100 **suspicion** score; `100 - suspicion` is genuineness. Flag when suspicion ≥
`flagThreshold` (default 70). Signals:

1. **Mouse-only / keyboard-only** — one input class active, the other exactly zero
   for the whole window. (Keyboard-only is common for legit typing, so this alone
   is low-weight; mouse-only with no clicks is higher-weight.)
2. **Robotic regularity** — coefficient of variation of inter-event intervals is
   near zero (events arrive at near-identical spacing). Humans are irregular.
3. **Repetitive geometry** — mouse moves trace the same short vector repeatedly, or
   cursor cycles within a tiny bounding box (jiggler), or clicks land on the exact
   same coordinate repeatedly.
4. **Tiny-movement jiggle** — sustained micro-moves (< N px) with zero clicks and
   zero keystrokes.
5. **No foreground change** — during the window the active window title/process
   never changes AND no keystrokes occurred (pairs with app_monitor). Lower weight
   (legit reading exists), only meaningful combined with 1–4.

The score is a weighted sum; weights + window + thresholds are all config-driven.
"Balanced" defaults chosen so genuine data-entry / scrolling / CAD does not trip
the flag on any single signal — it needs corroborating signals.

## New reported data (payload additions)

`activity` payload gains (all privacy-safe counts/verdicts):
- `keystrokes` (count this interval), `mouse_clicks`, `mouse_distance_px`,
  `scroll_events`
- `keystrokes_per_min`, `mouse_activity_per_min` (intensity)
- `suspected_fake_seconds` (portion of interval judged fake)
- `genuineness_score` (0–100, interval average)
- `suspicion_reasons` (string[] e.g. `["mouse_only","robotic_intervals"]`)

New top-level payload fields:
- `heartbeat` events (separate fast endpoint, see below)
- `tamper` signals: `monitoring_paused_seconds`, `process_restarted` (bool since
  last send), `clock_jump_detected` (bool)
- `idle_reason` (optional, from the return-from-idle prompt)

## Features

### Intensity metrics
Derived directly from the analyzer's counters. Reported per interval and surfaced
on the dashboard employee detail (already has a productivity card — add an
"Effort" row: keystrokes/min, mouse/min).

### Idle-reason prompts
On returning from an idle stretch longer than `idleReasonPromptMinutes` (default
10, 0 = disabled), the client shows a small non-blocking dialog (reuse the
existing PowerShell/rfd GUI layer) offering quick tags: Break / Meeting / Call /
Lunch / Other. The tag attaches to the next payload's `idle_reason`. Dismissible;
never blocks monitoring.

### Local buffering + resilience
The queue manager already persists to SQLite. Harden it: on send failure, ensure
the payload is durably queued and retried with backoff; on startup, flush the
backlog. Add a **task supervisor**: each monitoring task (activity, screenshot,
data-send, heartbeat) is wrapped so a panic is caught and the task is respawned
(builds on the screenshot `catch_unwind` fix already in place; generalize it).

### Fast heartbeat + tamper signals
New lightweight heartbeat every `heartbeatIntervalSeconds` (default 45) to
`POST /api/monitoring/heartbeat` carrying `{ clientId, employeeName, timestamp,
state, paused }`. Server updates `lastSeen` from heartbeats too, so offline is
detected within ~1 min instead of a full data interval. Tamper signals: detect
process restart (no prior shutdown marker), clock jumps (monotonic vs wall-clock
divergence), and time spent paused; report on next data payload.

## Server changes

- `POST /api/monitoring/heartbeat` (client token) → updates `connected_clients`
  and `employees.lastSeen`.
- `activity_logs` schema gains the new optional numeric/string fields above.
- Ingest stores them; validation accepts them (all optional, backward-compatible).
- `getAllEmployeesWithSummary` / timeline: when an interval is `SuspectedFake`,
  its seconds are already counted as idle by the client, so server math is
  unchanged — but expose `genuineness_score` and `suspicion_reasons` on employee
  detail, and feed a new **alert type** `suspected_fake_activity` in
  `alerts.service.ts`.

## Dashboard changes

- Employee detail: "Effort & Genuineness" card — keystrokes/min, mouse/min,
  genuineness score, and any suspicion reasons for the day.
- Employees list / timeline: a small "⚠ suspicious" badge when today's
  genuineness is low.
- Alerts: surface `suspected_fake_activity`.
- Settings → new **"Integrity" section** (client config tab): enable/disable
  detection, per-signal toggles, window seconds, flag threshold, idle-reason
  prompt minutes, heartbeat interval.

## Config additions (client `.env` / server client-config, pushed via existing flow)

`GENUINE_DETECTION_ENABLED`, `GENUINE_WINDOW_SECONDS`, `GENUINE_FLAG_THRESHOLD`,
per-signal enables, `IDLE_REASON_PROMPT_MINUTES`, `HEARTBEAT_INTERVAL_SECONDS`.
All optional with balanced defaults; absence = current behavior (except heartbeat
on by default).

## Error handling & edge cases

- Hook install failure → degrade to `GetLastInputInfo`-only, log once, no flags.
- RDP / locked / session-0 → analyzer sees no events; treated as idle (correct).
- High-frequency games/CAD → regularity signal alone won't flag (needs corroboration).
- Clock changes → tamper signal, and all durations use monotonic `Instant` (already true).
- Backward compatibility → all new fields optional; older server tolerates unknowns; older client omits them.

## Testing

- Unit tests for `GenuinenessScorer`: synthetic event streams for each cheat
  pattern (perfect intervals, mouse-only, jiggle box, human-like jitter) assert
  expected verdicts and that human-like jitter is NOT flagged.
- Unit tests for intensity counters (counts map to rates correctly).
- Server: heartbeat endpoint updates lastSeen; ingest accepts new optional fields.
- Manual: run client with `cargo run`, verify normal use = genuine, a jiggler
  script = flagged idle.

## Out of scope (YAGNI)

- Screen-recording, webcam, or any biometric capture.
- Cross-platform hooks (Windows-only, matching current support).
- ML models — deterministic heuristics only.
