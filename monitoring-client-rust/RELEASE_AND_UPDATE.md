# ScreenTime Client — Releasing Updates (OTA)

The installed clients auto-update themselves from **GitHub Releases**. You push a
new release; every client picks it up (on next startup, and within the polling
interval while running) and swaps itself with no manual action on the employee's
machine.

## How it works

The client compares its **built-in version** (`version` in `Cargo.toml`) against
the **tag of the latest GitHub release** in the configured repo. If the release
tag is newer, it downloads the release's `.zip`, extracts `monitoring-client.exe`,
and replaces itself, then relaunches on the new version.

- **On startup** — always checks first (`OTA_CHECK_ON_STARTUP=true`).
- **While running** — checks every `OTA_CHECK_INTERVAL_MINUTES` (default 360 = 6h).
  This is what catches updates without needing a reboot.
- The swap is **watchdog-aware**: the client signals its watchdog to stand down
  before exiting so it isn't relaunched on the old version mid-swap; the fresh
  instance clears the stop signal and spawns a new watchdog.

Config lives in the client's `.env` (see `ScreenTime/.env`):

```
OTA_ENABLED=true
OTA_GITHUB_REPO_URL=https://github.com/CosmicShreyas/Vibgyor-Screentime
OTA_CHECK_ON_STARTUP=true
OTA_CHECK_INTERVAL_MINUTES=360
OTA_RELEASE_ASSET_NAME=            # optional: pin an exact .zip name
OTA_EXECUTABLE_NAME=monitoring-client.exe
```

## Releasing a new version — step by step

1. **Bump the version** in `monitoring-client-rust/Cargo.toml`:
   ```toml
   version = "1.0.1"   # must be higher than what clients currently run
   ```
   Version compare is numeric per dotted segment (`1.0.10 > 1.0.9`). A leading
   `v` on the tag is fine.

2. **Build the release exe:**
   ```
   cd monitoring-client-rust
   cargo build --release
   ```
   Output: `target/release/monitoring-client.exe`

3. **Zip the exe** (the release asset must be a `.zip` containing the exe named
   `monitoring-client.exe`):
   ```
   # from target/release
   powershell Compress-Archive -Path monitoring-client.exe -DestinationPath monitoring-client.zip -Force
   ```

4. **Create a GitHub Release** on `CosmicShreyas/Vibgyor-Screentime`:
   - Tag: `v1.0.1` (match the Cargo.toml version).
   - Upload `monitoring-client.zip` as a release asset.
   - Publish (not a draft — drafts are ignored. Prereleases are used but warned).

5. Done. Running clients update within `OTA_CHECK_INTERVAL_MINUTES`; newly
   started ones update immediately.

## Private repo?

If `Vibgyor-Screentime` is private, the client needs a token to read releases.
Set `GITHUB_TOKEN=<a fine-grained PAT with Contents:read>` in the client `.env`
(or the machine environment). For a public repo, no token is needed.

## Notes / gotchas

- **Bump Cargo.toml every release** — if the version isn't higher than what
  clients run, they consider themselves up to date and skip the download.
- The tag drives the comparison; keep tag and Cargo.toml version in sync.
- Rollback = publish a new release with a *higher* version containing the older
  build (you can't downgrade by lowering the tag; clients only move forward).
- First-time install still uses the Inno Setup installers in `ScreenTime/`
  (`ScreenTimeSetupAdmin`/`ScreenTimeSetupUser`, built from the `.iss` files).
  OTA only handles updates after that.
