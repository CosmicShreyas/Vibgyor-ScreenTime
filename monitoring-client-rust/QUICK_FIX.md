# Quick Fix for Console Window Issue

## TL;DR

Run these commands in order:

```bash
# 1. Go to rust client directory
cd monitoring-client-rust

# 2. Clean and build release
build_release.bat

# 3. Test the exe (should have NO console)
cd target\release
monitoring-client.exe

# 4. If that works, build installer (from root)
cd ..\..\..
iscc VibgyorSeekMonitoringUser.iss

# 5. Test installer
VibgyorSeekSetupUser.exe
```

## What to Expect

### ✅ Correct Behavior
- NO console window
- GUI dialogs appear
- System tray icon appears
- Logs go to `logs\log.txt`

### ❌ Wrong Behavior (Old Build)
- Console window shows
- Logs in console
- Looks unprofessional

## Files Changed

1. `monitoring-client-rust/src/main.rs` - Added `windows_subsystem` attribute
2. `monitoring-client-rust/build_release.bat` - New clean build script
3. `VibgyorSeekMonitoringUser.iss` - Updated to use Rust exe directly

## Key Points

- **Debug builds** (`cargo build`) → Console SHOWS (for development)
- **Release builds** (`cargo build --release`) → Console HIDDEN (for users)
- Always use `build_release.bat` for production builds
- No VBS wrapper needed anymore
- No `runhidden` flag needed anymore

## If It Still Shows Console

You're probably running the debug build. Check:

```bash
# Wrong exe (debug - shows console)
monitoring-client-rust\target\debug\monitoring-client.exe

# Right exe (release - hides console)
monitoring-client-rust\target\release\monitoring-client.exe
```

## Done!

That's it. The console window will be hidden in release builds, but GUI dialogs will work perfectly.
