# ScreenTime Client — Installation Guide

This guide is for the person deploying the **ScreenTime monitoring client** onto
employees' Windows laptops/PCs. Follow it on **each machine** you're setting up.

It takes about **2–3 minutes per machine**. You do **not** need to be a developer.

---

## What you'll need before you start

- A **Windows 10 or 11** PC (the machine you're installing on).
- An internet connection on that machine.
- The **employee's full name** and their **Employee ID** (as your organization
  assigns them).
- Access to the **admin email inbox** that receives one-time passwords (OTP) —
  the last setup step emails a code there that you must enter. If you're not the
  admin, keep them reachable (phone/chat) during setup so they can read you the code.

> There are two installers in the download: a **User** setup (no admin rights
> needed — recommended for most machines) and an **Admin** setup (needs
> administrator rights, installs more robustly for shared/managed machines).
> **This guide uses the User setup.** See [Admin vs User](#admin-vs-user-which-one) at the end.

---

## Step 1 — Download the latest release from GitHub

1. Open this link in a browser **on the machine you're installing on**:

   **👉 https://github.com/CosmicShreyas/Vibgyor-Screentime/releases/latest**

   This always points to the newest release.

2. On the release page, scroll down to the **“Assets”** section.

3. Click **`ScreenTime.zip`** to download it. It will save to your **Downloads**
   folder.

> If you only see source-code links and no `ScreenTime.zip`, ask your
> administrator — the release asset may not be published yet.

---

## Step 2 — Extract the ZIP

1. Open your **Downloads** folder and find **`ScreenTime.zip`**.
2. **Right-click** it → **Extract All…** → **Extract**.
3. You'll get a folder named **`ScreenTime`** containing several files. The one
   you need is **`ScreenTimeSetupUser.exe`**.

> ⚠️ Don't run the setup from *inside* the ZIP preview window — always **extract
> first**, then run it from the extracted folder.

---

## Step 3 — Run the User setup

1. In the extracted **`ScreenTime`** folder, **double-click `ScreenTimeSetupUser.exe`**.

2. **If Windows SmartScreen shows a blue “Windows protected your PC” box:**
   click **More info** → **Run anyway**. (This appears because the installer is
   newly published; it is safe.)

3. The installer window opens. Click **Next / Install** through the prompts and
   let it finish. It installs quietly — there's nothing to configure here.

4. When it finishes, the monitoring client **starts automatically** and the
   **first-time setup wizard** appears (see Step 4). If it doesn't pop up within
   a few seconds, see [Troubleshooting](#troubleshooting).

---

## Step 4 — Complete the first-time setup wizard

A small dark **ScreenTime** window appears with a 4-step wizard. Work through it:

| Step | What it asks | What to enter |
|------|--------------|---------------|
| **1 / 4** | **Full name** | The employee's full name (e.g. `Priya Sharma`). |
| **2 / 4** | **Employee ID** | The employee's ID as your org assigns it (e.g. `EMP-1024`). |
| **3 / 4** | **Admin password** | The ScreenTime admin password (get it from your administrator). |
| **4 / 4** | **OTP code** | After step 3, a **one-time code is emailed to the admin inbox**. Enter that 6-digit code here. |

- Use **Continue** to advance and **Back** to fix a previous step.
- After the OTP is verified, you'll see a **“Setup Complete”** confirmation.
  The window closes and monitoring begins immediately.

> The admin password and OTP are a safeguard so a client can only be registered
> by someone authorized — an employee can't quietly point it elsewhere.

That's it — the machine is now set up. ✅

---

## Step 5 — Verify it's running

The client runs **silently in the background** (there's no big app window — that's
by design). To confirm it's working:

- **System tray:** look at the bottom-right of the taskbar (click the **^**
  “show hidden icons” arrow). You should see the **ScreenTime radar icon**.
  **Right-click it** → a themed menu appears with **View Your Stats**,
  **Update Information**, **About**, **Pause/Resume**, and **Stop Monitoring**.
- **Dashboard:** within a minute or two, the employee should appear as **online**
  on the ScreenTime admin dashboard, and their activity should start showing up.

If both look good, you're done on this machine. Repeat Steps 1–5 on the next one
(you can reuse the same downloaded/extracted `ScreenTime` folder — no need to
re-download for each machine).

---

## What the client does after install (so you can answer questions)

Once set up, the ScreenTime client runs quietly and:

- **Starts automatically** every time the employee signs in (it re-launches
  itself on login).
- **Tracks activity** — active vs idle time, which applications are in use, and
  **browser tab titles** (Chrome/Edge/Firefox, including private/incognito
  windows). It captures **titles only — never the web addresses/URLs**.
- **Takes periodic screenshots** of the screen at a set interval.
- **Detects genuine activity (anti-cheat)** — it can tell real work from tricks
  like mouse-jigglers or auto-clickers, and flags that time instead of counting
  it as work. It only ever records **counts** (e.g. keystrokes-per-minute), never
  what keys were actually typed.
- **Records rough location** (city/state/country) from the network, not GPS.
- **Sends a heartbeat** every ~45 seconds so the dashboard knows the machine is
  online; if the network drops, data is stored locally and sent later.
- **Updates itself automatically** from GitHub Releases — when a newer version is
  published, installed clients upgrade on their own (no reinstall needed).
- **Keeps itself running** — a small companion "watchdog" restarts it if it's
  closed, and it re-adds its own startup entry if removed. This is standard
  monitoring behavior, not a virus.

### Privacy, in plain terms
- Browser **titles only**, no URLs.
- Keyboard/mouse **counts only**, never actual keystrokes or typed content.
- Employees can view **their own** stats anytime via the tray → **View Your Stats**.
- It's ordinary software and can be fully removed by an administrator (see below).

---

## Managing the client after install

Do these from the **system-tray icon → right-click menu**:

- **View Your Stats** — opens the employee's personal dashboard in the browser
  (their own numbers only).
- **Update Information** — re-run the Name/ID setup (asks for the admin password
  + OTP again).
- **Pause / Resume Monitoring** — temporarily stop/resume tracking.
- **Stop Monitoring** — cleanly stop the client (the proper way to stop it —
  see the note below).

### Stopping the client (important)
Simply “ending the task” in Task Manager **won't work** — the watchdog just
restarts it. To stop it properly, use **tray → Stop Monitoring**, or run this in
a Command Prompt:

```
"%USERPROFILE%\Documents\VibgyorSeekMonitoring\monitoring-client.exe" --stop
```

(For the Admin install, the path is under `C:\Program Files\VibgyorSeekMonitoring\`.)

### Uninstalling
Go to **Windows Settings → Apps → Installed apps → ScreenTime Monitoring →
Uninstall**. The uninstaller stops the client (and its watchdog) and removes the
autostart entry cleanly.

---

## Troubleshooting

| Problem | What to do |
|---------|-----------|
| **Setup wizard didn't appear after install** | Give it ~10 seconds. If still nothing, sign out and back in (it starts at login), or find the ScreenTime tray icon, right-click → **Update Information** to run setup. |
| **SmartScreen / “unknown publisher” warning** | Click **More info → Run anyway**. It's expected for a freshly published build. |
| **Antivirus blocked it** | The **Admin** setup auto-adds a Windows Defender exclusion; the User setup does not. If AV quarantines it, add an exclusion for the install folder, or use the Admin setup. |
| **“Invalid password” at step 3** | You entered the wrong admin password — confirm it with your administrator. |
| **No OTP email arrived (step 4)** | Check the admin inbox's spam folder; confirm the admin email is configured on the server. You can press **Back** then **Continue** to trigger a new code. |
| **Employee not showing on the dashboard** | Confirm the machine has internet, wait 1–2 minutes, and check the tray icon is present. The client queues data offline and sends it once reconnected. |
| **It says already running / two won't install** | Only one client runs per machine by design. If a previous install exists, uninstall it first (Settings → Apps). |

---

## Admin vs User — which one?

Both are in the `ScreenTime` folder. Pick one per machine:

| | **ScreenTimeSetupUser.exe** (recommended) | **ScreenTimeSetupAdmin.exe** |
|---|---|---|
| Admin rights needed | ❌ No | ✅ Yes (right-click → **Run as administrator**) |
| Starts at login via | Current-user startup entry | Windows **Scheduled Task** (more robust) |
| Antivirus exclusion added | No | ✅ Yes, automatically |
| Best for | Most laptops, quick rollout | Shared/managed PCs, or where AV is aggressive |

The setup wizard (Step 4) and everything after it are **identical** for both.

---

*ScreenTime — accurate, genuine, privacy-conscious productivity insight.*
