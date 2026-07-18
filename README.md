# ScreenTime — Employee Monitoring & Productivity Suite

ScreenTime is a full-stack employee monitoring and productivity-intelligence
platform. A lightweight Windows agent runs on each employee's machine and
streams activity to a central server, which powers a real-time "mission-control"
web dashboard for administrators — and a private self-view page for employees.

It goes well beyond basic time tracking: genuine-activity (anti-cheat) detection,
wellbeing/burnout analytics, tamper-resistant delivery, over-the-air auto-updates,
and privacy-conscious capture (browser **titles only**, never URLs; input
**counts only**, never keystroke content).

```
┌──────────────────────┐        HTTPS + WebSocket        ┌──────────────────────┐
│  monitoring-client    │  ── activity / screenshots ──▶  │   monitoring-server    │
│  (Rust, Windows agent)│  ◀── config / OTP / updates ──  │  (Node/Express/Mongo)  │
└──────────────────────┘                                 └───────────┬──────────┘
                                                                      │  REST + WS (/ws)
                                                          ┌───────────▼──────────┐
                                                          │  monitoring-dashboard  │
                                                          │  (React + Vite + TS)   │
                                                          └──────────────────────┘
```

---

## Table of Contents

- [Repository layout](#repository-layout)
- [Architecture & data flow](#architecture--data-flow)
- [The monitoring client (Rust / Windows)](#the-monitoring-client-rust--windows)
- [The server (Node / Express / MongoDB)](#the-server-node--express--mongodb)
- [The dashboard (React / Vite / TypeScript)](#the-dashboard-react--vite--typescript)
- [Privacy model](#privacy-model)
- [Getting started (development)](#getting-started-development)
- [Deployment & operations](#deployment--operations)
- [Releasing client updates (OTA)](#releasing-client-updates-ota)
- [Configuration reference](#configuration-reference)

---

## Repository layout

| Path | What it is |
|------|------------|
| `monitoring-client-rust/` | The Windows agent (Rust). Runs hidden on each employee PC. |
| `monitoring-server/` | The backend API + WebSocket + scheduled jobs (Node/TypeScript/Express/MongoDB). |
| `monitoring-dashboard/` | The admin web dashboard + employee self-view (React/Vite/TypeScript/Tailwind). |
| `ScreenTime/` | Distribution folder: Inno Setup installer scripts (`.iss`), the hidden launcher (`.vbs`), the shipped `.env`, and the built client `.exe`. Compiles into `ScreenTimeSetupAdmin.exe` / `ScreenTimeSetupUser.exe`. |
| `ScreenTime.zip` | Packaged distribution bundle. |

---

## Architecture & data flow

1. **Client → Server.** Each agent collects activity in intervals and `POST`s a
   JSON **payload** to `/api/monitoring/data` (Bearer token auth). A separate
   fast **heartbeat** hits `/api/monitoring/heartbeat` (~every 45s) so the server
   can detect offline machines within a minute, independent of the slower data
   interval. If the server is unreachable, payloads are persisted to a local
   SQLite queue and retried.
2. **Server storage.** The server upserts the employee, stores the activity log
   in MongoDB, saves any screenshot to disk (with a TTL), then broadcasts a
   `data_update` over WebSocket.
3. **Server → Dashboard.** The dashboard reads REST endpoints under `/api/*`
   (JWT-authenticated) and subscribes to the WebSocket at `/ws` for live refresh.
4. **Business timezone.** Clients send UTC instants; the server does **all**
   "day"/"shift"/report boundary math in a configurable business timezone
   (`APP_TIMEZONE`, default `Asia/Kolkata` / IST), and the dashboard renders times
   in the same zone regardless of the viewer's locale.

---

## The monitoring client (Rust / Windows)

A single windowless executable (`monitoring-client.exe`, `#![windows_subsystem = "windows"]`)
built with Tokio async, `parking_lot` locks, the `windows`/`winapi` crates,
`uiautomation` for browser inspection, `reqwest` (rustls TLS), `rusqlite` (bundled)
for the offline queue, and `image`/`screenshots` for capture. Panics unwind
(not abort) so a failure in one subsystem can be caught rather than killing the
whole agent.

### Core monitoring

- **Activity / idle tracking** — `GetLastInputInfo` polled at 2 Hz; WORK↔IDLE via
  `IDLE_THRESHOLD_SECONDS`; accumulates work/idle seconds per interval. No admin
  rights needed.
- **Application usage** — foreground app polled every `APP_USAGE_POLL_INTERVAL_SECONDS`;
  elapsed time is credited only to the active app (system processes filtered out).
- **Browser tab capture** — enumerates open tabs across Chrome, Edge, and Firefox
  via UI Automation. Classifies the browser by owning **process PID** so
  **Incognito / InPrivate / Private** windows are captured too. Captures **tab
  titles only — URLs are always stripped.** Only the active tab accrues time.
- **Screenshots** — interval-based (`SCREENSHOT_INTERVAL_MINUTES`), all monitors
  stitched into one image, JPEG-compressed at configurable `SCREENSHOT_QUALITY`,
  base64-encoded. Capture is wrapped in `catch_unwind` so a backend panic doesn't
  permanently stop screenshots.
- **Location** — coarse IP geolocation (city/state/country) with a 30-minute cache.
- **Delivery** — batched payload every `DATA_SEND_INTERVAL_MINUTES`; on failure,
  persisted to a SQLite FIFO queue (cap 1000, drops oldest) and retried every 60s
  with exponential backoff. System info (OS, CPU, RAM, disk, hostname) is sent
  once on first successful transmission.

### Genuine-activity engine (anti-cheat)

A deterministic scorer (`genuineness.rs`) fed by privacy-safe low-level input
hooks (`input_analyzer.rs` — records only event **class**, mouse deltas/positions,
and timestamps; **never** key identities). It produces a `suspicion` score
(0–100) and flags a window when it exceeds `GENUINE_FLAG_THRESHOLD`. Detected
patterns include:

- **Mouse-jiggler** — mouse movement with no clicks, especially tiny "micro-move"
  jiggle within a few pixels.
- **Auto-clicker / macro** — robotically regular inter-event intervals (low
  coefficient of variation), repetitive movement vectors, or many clicks landing
  on the same point.
- **Single-channel cheating** — mouse-only or keyboard-only activity is weighted
  as more/less suspicious accordingly.

Flagged time is counted as `suspected_fake_seconds` (treated as idle, subtracted
from work), with a running `genuineness_score` and deduplicated
`suspicion_reasons` attached to each payload. Per-interval **intensity metrics**
(keystrokes, mouse clicks, mouse distance, scroll events, and per-minute rates)
are also reported — again, counts only.

**Idle-reason prompt** — after an idle stretch longer than
`IDLE_REASON_PROMPT_MINUTES`, a non-blocking themed prompt asks the employee for
a reason (lunch, meeting, call, …); the answer rides along with the next payload.

### Resilience / anti-tamper

Legitimate corporate hardening (explicitly **not** rootkit/kernel techniques;
everything is removable by a normal admin uninstall):

- **Watchdog (mutual revival)** — a detached companion process relaunches the
  agent if it's killed; the agent respawns the watchdog if *it's* killed. A
  3-strike debounce and sleep/resume detection prevent spurious relaunches (this
  fixed a bug where waking from sleep could spawn a second instance).
- **Self-heal autostart** — recreates the logon autostart entry (HKCU `Run`
  value, or leaves the admin installer's Scheduled Task alone) if a user removes it.
- **Clock-jump detection** — flags large wall-vs-monotonic divergence.
- **Tamper signals** — `process_restarted`, `clock_jump_detected`,
  `relaunched_by_watchdog`, `autostart_restored`, `paused_seconds`,
  `server_unreachable_seconds` are reported to the server.
- **Single-instance mutex** — `Local\VibgyorSeekMonitoringClient` guarantees only
  one agent runs.

**Stopping the client** (a plain Task-Manager kill is just relaunched by the
watchdog): run `monitoring-client.exe --stop` (aliases: `/stop`, `--quit`,
`/quit`, `stop`). This writes durable stop markers that both the agent and the
watchdog poll, so everything exits cleanly. The tray **Stop Monitoring** item and
the uninstaller do the same.

> Note: several internal identifiers (the mutex name, scheduled-task name, HKCU
> value, install paths, OTA repo, auth token) intentionally retain the legacy
> `VibgyorSeek*` names so already-deployed clients keep working after the rebrand
> to ScreenTime. Only user-visible text was rebranded.

### GUI (themed, matches the dashboard)

All dialogs are custom **WPF** windows rendered via embedded PowerShell (STA) —
deep-navy mission-control theme, electric-blue/cyan accents, rounded corners
(no more "90s" native dialogs). Dynamic text is passed via environment variables
so employee names can't inject into the script.

- **Setup / Update wizard** — 4 steps: Name → Employee ID → Admin password →
  email OTP (verified against the server), with Back/Continue/Cancel navigation.
- **System tray** — the brand radar logo icon, and a themed right-click/left-click
  popup menu (replacing the native Win32 menu) with: **View Your Stats**,
  **Update Information**, **About**, **Pause / Resume Monitoring**, and
  **Stop Monitoring**.
- **View Your Stats** opens the employee's private self-view page in the default
  browser (`{dashboard origin}/self-view?usr=<base64 name>`).

### OTA auto-update

The agent updates itself from **GitHub Releases**. It compares its built-in
version (`Cargo.toml`) against the latest release **tag**; if newer, it downloads
the `.zip` asset, extracts the exe, and swaps itself via a batch script, then
relaunches. It checks **on startup** and **periodically**
(`OTA_CHECK_INTERVAL_MINUTES`, default 6h) so long-running agents update without
a reboot. The swap is watchdog-aware. See
[Releasing client updates](#releasing-client-updates-ota) and
`monitoring-client-rust/RELEASE_AND_UPDATE.md`.

---

## The server (Node / Express / MongoDB)

TypeScript on Express 4, MongoDB via Mongoose 8, `ws` for WebSocket, `node-cron`
for scheduled jobs, `nodemailer` (Gmail SMTP) for email, `bcrypt` + `jsonwebtoken`
for admin auth, `archiver` for screenshot ZIPs, `winston` logging, and `chokidar`
to hot-reload the `.env`. HTTP and WebSocket share one port (default **3000**;
WebSocket at `ws://<host>:<port>/ws`). Property-based tests use `jest` + `fast-check`.

### Authentication

- **Client ingest** (`/api/monitoring/*`, `/api/otp/*`) — a static Bearer token
  (`CLIENT_AUTH_TOKEN`) that must match the agent's `AUTH_TOKEN`.
- **Dashboard** (`/api/analytics/*`, `/api/screenshots/*`, etc.) — JWT. Admin
  logs in at `POST /api/auth/login` (bcrypt credentials from
  `dashboard-config.json`); token expires in 24h. Screenshot `<img>` requests may
  pass the JWT via `?token=`.
- **WebSocket** — connections must send `{type:'auth', token}` (JWT) or be closed.

### REST API (grouped)

| Group | Base | Highlights |
|-------|------|-----------|
| Auth | `/api/auth` | `POST /login` |
| Monitoring (client) | `/api/monitoring` | `POST /data` (ingest), `POST /heartbeat` |
| Employees | `/api/employees` | list, `/:name` detail, `/timeline/all`, `/:name/weekly-timeline`, `/:name/app-usage`, `/:name/browser-tab-usage`, `/timesheet/monthly`, `/by-id/activity` — most accept `startDate`/`endDate` |
| Analytics | `/api/analytics` | `/overview`, `/trend`, `/insights`, `/attendance/:name`, `/focus/:name`, `/alerts` (+ `/alerts/config`), wellbeing: `/wellbeing/focus/:name`, `/wellbeing/burnout`, `/wellbeing/anomalies`, `/wellbeing/team-pulse` |
| Screenshots | `/api/screenshots` | `/list` (date range + employee), `/:id` (JPEG), `DELETE /:id`, `/sync` |
| Screenshot archive | `/api/screenshot-archive` | `POST /create` (ZIP), `/expiring` |
| Client config | `/api/config`, `/api/client-env` | per-employee & global polling config, served `.env` |
| Server config | `/api/server-config` | read/write server `.env` (hot-reloads) |
| Dashboard config | `/api/dashboard-config` | admin credentials, restricted mode, admin emails, OTP unlock |
| Reports | `/api/reports`, `/api/eod-reports` | weekly report config + SMTP, per-employee end-of-day reports |
| Clients | `/api/connected-clients` | list, rename (migrates data), delete (cascades) |
| OTP | `/api/otp` | employee-info-update OTP (`/request`, `/verify`) |

### Analytics & intelligence

- **Productivity categorization** (`utils/productivity.ts`) — maps apps/domains to
  `productive | neutral | unproductive` (e.g. Excel/Teams/VS Code/Jira = productive;
  browsers/WhatsApp = neutral; YouTube/Netflix/games = unproductive). Score =
  `(productive + 0.5·neutral) / total × 100`. Overridable via `APP_CATEGORIES_JSON`.
- **Attendance** — per-day present/late/early with a 15-minute grace window; Sunday
  treated as non-working.
- **Alerts** — activity is evaluated against configurable thresholds
  (`alerts-config.json`): high idle, low productivity, offline-during-shift,
  unproductive-site overuse, suspected fake activity, and idle explanations.
  Dismissals persist; admins can optionally be emailed on alert.
- **Wellbeing** — Focus & Flow score (deep-work blocks), Burnout radar (0–100 risk
  from overwork/after-hours/weekend/no-break), Anomaly detection (today vs a
  14-day personal baseline), and Team pulse percentiles. Supportive, not punitive.
- **Insights** — deterministic, template-based natural-language summaries (no
  external LLM).

### Scheduled jobs (node-cron)

- **Cleanup** — daily at midnight: deletes screenshots past their TTL
  (`SCREENSHOT_TTL_DAYS`, default 30) from disk and DB.
- **Offline alerts** — every minute: flags clients whose `lastSeen` is older than
  60 minutes and emails admins once.
- **End-of-day reports** — daily at `EOD_REPORT_TIME`: emails per-employee day
  summaries.

### Email & OTP

Gmail SMTP (`SMTP_EMAIL` / `SMTP_APP_PASSWORD`) sends weekly team reports, EOD
reports, offline alerts, and test emails (rich HTML, rendered in the business
timezone). Two OTP flows exist: employee-info-update (6-digit, 10-min, 3 attempts)
and dashboard restricted-mode unlock (sent to admin emails).

### Data model (payload)

Each activity payload carries: interval start/end, `work_seconds` / `idle_seconds`,
the anti-cheat block (keystrokes, mouse clicks, mouse distance, scroll events,
per-minute rates, `suspected_fake_seconds`, `genuineness_score`,
`suspicion_reasons[]`), `applications[]`, `browser_tabs[]` (title-only), an
optional base64 `screenshot`, optional `idle_reason`, optional `location`, and an
optional `tamper` block. Mongo collections: `employees`, `activity_logs`,
`screenshots`, `connected_clients`, `client_configs`, `eod_report_configs`.

---

## The dashboard (React / Vite / TypeScript)

React 18 + Vite 5 + TypeScript, Tailwind 3, **Framer Motion** for animation,
**Recharts** for graphs, `axios`, `react-hot-toast`, `xlsx` (Excel export), and a
native WebSocket client. Self-hosted **Space Grotesk** (display) + **Inter** (body)
fonts. Reaches the backend via `/api` and the WebSocket at `/ws`.

### Design system — "mission-control"

Dark-first, OKLCH-based theme (deep navy + electric blue + cyan signal), with a
reusable UI kit in `components/ui/`: `Card` / `MotionCard`, `Stagger`, `StatTile`
(animated count-up), `PageShell`, `SectionHeader`, `LiveBadge` (pulsing dot),
`Skeleton`, and `Portal`. Shared motion variants (`motion.ts`), a `useCountUp`
hook, and a single-source-of-truth chart theme (`chartTheme.ts`) that resolves
CSS tokens into Recharts colors and re-resolves on theme change. Fully responsive,
light/dark aware, honors `prefers-reduced-motion`.

### Pages

| Route | Page | What it's for |
|-------|------|---------------|
| `/dashboard` | **Command Center** | Live ops hub — presence, work totals, app/browser usage, leaderboard, activity timeline. One global employee selector (incl. an **"All Employees"** aggregate) + date range drives the panels. |
| `/employees` | **Workforce** | Roster with live status, today's work/idle, last-seen, and a link into each profile. |
| `/employees/:name` | **Employee Details** | Deep profile over a date range: apps, tabs, activity chart, weekly timeline, productivity pie, website usage, anti-cheat/integrity summary, and recent screenshots with a lightbox. |
| `/analytics` | **Analytics** | Team trends over time — productivity trend chart, leaderboard, insights, CSV export. |
| `/wellbeing` | **Wellbeing & Focus** | Burnout radar, focus/flow quality, anomalies, and team benchmarks. |
| `/alerts` | **Alerts Center** | Paginated, filterable exception feed (idle, low productivity, offline, unproductive overuse, suspected fake activity); dismiss + CSV export. |
| `/screenshots` | **Evidence Vault** | Screenshot gallery filtered by employee + date range, full-screen lightbox with prev/next, and ZIP backup. |
| `/timesheets` | **Timesheets** | Monthly attendance/hours per employee, **Excel export**. |
| `/settings` | **Control Panel** | Tabbed config: client, server, dashboard, reports (+ SMTP), alert thresholds, connected clients. |
| `/self-view` | **Self-View** (public) | An employee's own stats — productivity, apps/tabs, timeline, wellbeing — opened from the tray, no admin login. |
| `/login` | **Login** | Branded admin sign-in. |

Protected routes sit behind a JWT `ProtectedRoute`; `/self-view` and `/login` are
public.

### Cross-cutting features

- **Global from–to date range filter** (`DateRangeFilter`) with Today / 7d / 30d
  presets; single-day ranges valid.
- **12-hour time** and durations standardized to **"00h 00m 00s"**
  (`utils/time.ts`), all in the business timezone.
- **Rich timeline hover tooltip** (`TimelineTooltip`) — first/last activity,
  productive/idle/offline hours, and the nearest-in-time screenshot thumbnail;
  shared between the Command Center and Employee Details timelines.
- **Real-time updates** via WebSocket (`employee_update`), with auto-reconnect.
- **Exports** — CSV (Dashboard/Analytics/Alerts) and Excel (Timesheets).
- **Command palette** (⌘K / Ctrl-K) for quick employee/page jump.
- **Restricted mode** — the Control Panel can be locked behind an email OTP.

---

## Privacy model

ScreenTime is designed to be defensible with employees:

- Browser capture is **titles only** — URLs are always stripped before leaving the
  machine.
- Input monitoring records **counts and rates only** (keystrokes-per-minute, click
  counts, mouse distance) — never which keys were pressed or any typed content.
- Employees can see their **own** data any time via the self-view page.
- The agent is standard, observable software — no kernel/rootkit techniques — and
  is fully removable via the uninstaller.

---

## Getting started (development)

### Prerequisites

- **Node.js** (LTS) + npm
- **MongoDB** (local or Atlas connection string)
- **Rust** (stable, MSVC toolchain) — only to build the client, on Windows
- **Inno Setup 6** — only to build the installers

### 1) Server

```bash
cd monitoring-server
npm install
# create .env (see monitoring-server/.env.example) — at minimum:
#   MONGODB_URI, CLIENT_AUTH_TOKEN, JWT_SECRET
npm run dev        # ts-node (hot dev)   |   npm run build && npm start  (prod)
```

Server listens on `PORT` (default 3000). Default admin login is `admin` / `admin123`
(stored/rotatable in `dashboard-config.json` — change it before production).

### 2) Dashboard

```bash
cd monitoring-dashboard
npm install
npm run dev        # Vite dev server (proxies /api and /ws to the server)
npm run build      # production build → dist/
```

### 3) Client

```bash
cd monitoring-client-rust
# create .env with at least SERVER_URL and AUTH_TOKEN (AUTH_TOKEN must equal the
# server's CLIENT_AUTH_TOKEN)
cargo run                # run for verification (windowless; logs to logs/log.txt)
cargo build --release    # → target/release/monitoring-client.exe
```

To stop a running agent cleanly: `monitoring-client.exe --stop`.

---

## Deployment & operations

1. **Server** — build (`npm run build`) and run `node dist/index.js` behind your
   process manager / reverse proxy. Point `MONGODB_URI` at your database and set a
   strong `JWT_SECRET` and `CLIENT_AUTH_TOKEN`.
2. **Dashboard** — `npm run build` and serve `dist/` (via the server, a static host,
   or a CDN). Ensure it can reach the API and `/ws`.
3. **Client** — the `ScreenTime/` folder contains the Inno Setup scripts and the
   shipped `.env`. Build the installers with **Inno Setup**:
   - Double-click `ScreenTime/build-installers.bat`, **or**
   - In the Inno Setup IDE use **Build → Compile** (Ctrl+F9) — *not* Run (F9),
     which compiles **and launches** the installer.
   This produces `ScreenTimeSetupAdmin.exe` (Scheduled Task, machine-wide) and
   `ScreenTimeSetupUser.exe` (HKCU autostart, no admin). Hand the appropriate one
   to employees; it installs the agent, adds an antivirus exclusion (admin build),
   and starts it hidden.

The shipped `ScreenTime/.env` must contain matching `SERVER_URL` + `AUTH_TOKEN`,
and the `OTA_*` keys for auto-update (see below).

---

## Releasing client updates (OTA)

Once agents are installed, you push updates through **GitHub Releases** — no need
to touch employee machines. Full details in
`monitoring-client-rust/RELEASE_AND_UPDATE.md`. Short version:

1. Bump `version` in `monitoring-client-rust/Cargo.toml` (must be higher than what
   clients run).
2. `cargo build --release`.
3. Zip the exe (`monitoring-client.zip` containing `monitoring-client.exe`).
4. Create a GitHub Release on the configured repo with tag `vX.Y.Z` (matching the
   Cargo version) and upload the zip. Publish (not a draft).

Running agents pick it up within `OTA_CHECK_INTERVAL_MINUTES`; freshly started
ones update immediately. If the repo is private, set `GITHUB_TOKEN` (Contents:read)
in the client `.env`.

---

## Configuration reference

### Client (`monitoring-client-rust/.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `SERVER_URL` | — (required) | Ingest endpoint, e.g. `https://host/api/monitoring/data` |
| `AUTH_TOKEN` | — (required) | Bearer token; must equal server `CLIENT_AUTH_TOKEN` |
| `DASHBOARD_URL` | (derived) | Web UI origin for the "View Your Stats" link; defaults to the origin of `SERVER_URL` |
| `SCREENSHOT_INTERVAL_MINUTES` | 10 | Screenshot cadence |
| `DATA_SEND_INTERVAL_MINUTES` | 10 | Payload cadence |
| `LOCATION_UPDATE_INTERVAL_MINUTES` | 30 | Geolocation cadence |
| `IDLE_THRESHOLD_SECONDS` | 300 | Inactivity → idle |
| `SCREENSHOT_QUALITY` | 75 | JPEG quality (1–100) |
| `APP_USAGE_POLL_INTERVAL_SECONDS` | 10 | Foreground-app poll (min 2) |
| `HEARTBEAT_INTERVAL_SECONDS` | 45 | Liveness ping (0 disables) |
| `IDLE_REASON_PROMPT_MINUTES` | 10 | Idle length that triggers the reason prompt (0 disables) |
| `GENUINE_DETECTION_ENABLED` | true | Anti-cheat engine on/off |
| `GENUINE_WINDOW_SECONDS` | 60 | Analysis window |
| `GENUINE_FLAG_THRESHOLD` | 70 | Suspicion score that flags a window |
| `OTA_ENABLED` | true | Auto-update on/off |
| `OTA_GITHUB_REPO_URL` | — | Releases repo |
| `OTA_CHECK_ON_STARTUP` | true | Check at launch |
| `OTA_CHECK_INTERVAL_MINUTES` | 360 | Periodic check interval |
| `OTA_RELEASE_ASSET_NAME` | (first .zip) | Pin a specific asset |
| `OTA_EXECUTABLE_NAME` | (first .exe) | Exe name inside the zip |
| `LOG_LEVEL` | INFO | Log verbosity |
| `ADMIN_PASSWORD` | admin123 | Verifies the setup wizard's password step (env-only) |
| `GITHUB_TOKEN` | — | Optional PAT for a private OTA repo (env-only) |

### Server (`monitoring-server/.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `MONGODB_URI` | — (required) | MongoDB connection string |
| `CLIENT_AUTH_TOKEN` | — (required) | Token clients must present |
| `JWT_SECRET` | — (required) | Signs dashboard JWTs |
| `PORT` | 3000 | HTTP + WebSocket port |
| `NODE_ENV` | development | |
| `SCREENSHOT_STORAGE_PATH` | `./screenshots` | Where screenshots are stored |
| `SCREENSHOT_TTL_DAYS` | 30 | Screenshot retention |
| `APP_TIMEZONE` | `Asia/Kolkata` | Business timezone for all day/shift math |
| `SHIFT_START_HOUR` / `SHIFT_END_HOUR` | 9 / 20 | Shift window |
| `SMTP_EMAIL` / `SMTP_APP_PASSWORD` | — | Gmail SMTP for email |
| `ADMIN_EMAIL` | — | Employee-info OTP recipient |
| `EOD_REPORT_TIME` | 00:00 | End-of-day report time |
| `LOG_LEVEL` | info | |
| `APP_CATEGORIES_JSON` | — | Override productivity categorization |

### Dashboard

Uses the Vite dev proxy for `/api` and `/ws` in development; in production it's
served alongside (or pointed at) the API host. Business timezone override:
`VITE_APP_TIMEZONE`.

---

*ScreenTime — built for accurate, genuine, privacy-conscious productivity insight.*
