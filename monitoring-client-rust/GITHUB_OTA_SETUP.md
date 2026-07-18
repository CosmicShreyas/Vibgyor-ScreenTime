# GitHub OTA Setup

This client now supports startup-time OTA updates from GitHub Releases.

## How it works

1. On startup, the client checks `OTA_GITHUB_REPO_URL`.
2. It reads the latest GitHub Release from the GitHub API.
3. If the release tag is newer than the local client version, it downloads the release zip.
4. It extracts the client `.exe` from that zip.
5. It launches a small updater script, exits, replaces the current executable, and relaunches.

## Expected release format

Use a GitHub Release with:

- A semantic version tag like `v1.0.1` or `1.0.1`
- At least one `.zip` asset
- That zip containing the Windows client executable

Recommended names:

- Release asset: `monitoring-client-windows.zip`
- Executable inside zip: `monitoring-client.exe`

If your names differ, configure them in `.env`:

```env
OTA_RELEASE_ASSET_NAME=your-release-asset.zip
OTA_EXECUTABLE_NAME=your-client.exe
```

## Release steps

1. Update the version in [Cargo.toml](/d:/Projects/VibgyorSeek/monitoring-client-rust/Cargo.toml).
2. Build the app with `cargo build --release`.
3. Take `target\release\monitoring-client.exe`.
4. Put that exe inside a zip file.
5. Open `https://github.com/CosmicShreyas/Vibgyor-Screentime/releases`.
6. Create a new release with a tag like `v1.0.1`.
7. Upload the zip as the release asset.
8. Publish the release.

## Client config

The client now supports these `.env` keys:

```env
OTA_ENABLED=true
OTA_GITHUB_REPO_URL=https://github.com/CosmicShreyas/Vibgyor-Screentime
OTA_CHECK_ON_STARTUP=true
OTA_RELEASE_ASSET_NAME=
OTA_EXECUTABLE_NAME=monitoring-client.exe
```

## Notes

- OTA is currently applied on startup.
- If `OTA_RELEASE_ASSET_NAME` is blank, the first `.zip` asset from the latest release is used.
- If `OTA_EXECUTABLE_NAME` is blank, the first `.exe` inside the zip is used.
- If GitHub rate limits become an issue, set `GITHUB_TOKEN` on the client machine.
