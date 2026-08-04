# Console Window Management Guide

## The Problem

You have a Rust application that:
- Runs as a background service (console-based)
- Shows GUI dialogs (PowerShell MessageBox/InputBox)
- Should NOT show a console window to users
- BUT you want to see console output during development

## The Solution

Use conditional compilation to hide the console window only in release builds:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
```

## How It Works

### Debug Builds (Development)
When you run `cargo run` or `cargo build`:
- `debug_assertions` is enabled
- Console window SHOWS
- You can see logs, errors, and debug output
- Perfect for development and testing

### Release Builds (Production)
When you run `cargo build --release`:
- `debug_assertions` is disabled
- Console window is HIDDEN
- GUI dialogs still work perfectly
- Users don't see any console window

## Why This Works

### The `windows_subsystem` Attribute
- `windows_subsystem = "windows"` tells Windows to create a GUI application (no console)
- `windows_subsystem = "console"` (default) creates a console application

### The `cfg_attr` Macro
- `cfg_attr(condition, attribute)` conditionally applies an attribute
- `not(debug_assertions)` means "when NOT in debug mode" (i.e., release mode)

### GUI Dialogs Still Work
- PowerShell MessageBox/InputBox are separate windows
- They don't depend on the console window
- They work perfectly even when console is hidden
- System tray icon also works independently

## Build Commands

### Development (Console Visible)
```bash
cargo run
# or
cargo build
```
- Console window shows
- See all logs and output
- Easy debugging

### Production (Console Hidden)
```bash
cargo build --release
```
- Console window hidden
- GUI dialogs work
- System tray works
- No console clutter for users

## Inno Setup Configuration

You can now remove the `runhidden` flag from your ISS file since the console is already hidden in release builds:

### Before (Problematic)
```iss
[Run]
Filename: "{app}\monitoring-client.exe"; Flags: runhidden nowait
```
- This hides EVERYTHING including GUI dialogs
- Users can't see setup dialogs

### After (Correct)
```iss
[Run]
Filename: "{app}\monitoring-client.exe"; Flags: nowait
```
- Console is already hidden (by windows_subsystem)
- GUI dialogs show up properly
- Perfect user experience

## Testing Checklist

### Debug Build Testing
- [ ] Run `cargo run`
- [ ] Console window appears
- [ ] Logs are visible in console
- [ ] GUI dialogs appear
- [ ] System tray icon appears
- [ ] Can see debug output

### Release Build Testing
- [ ] Run `cargo build --release`
- [ ] Run the exe from `target/release/`
- [ ] NO console window appears
- [ ] GUI dialogs appear correctly
- [ ] System tray icon appears
- [ ] Setup dialog works
- [ ] Settings dialog works
- [ ] About dialog works

### Installer Testing
- [ ] Build release version
- [ ] Create installer with Inno Setup
- [ ] Install on test machine
- [ ] Run installed application
- [ ] NO console window appears
- [ ] GUI dialogs work
- [ ] System tray works

## Common Issues

### Issue 1: Console Still Shows in Release
**Symptom:** Console window visible even in release build
**Cause:** Built with `cargo build` instead of `cargo build --release`
**Fix:** Always use `--release` flag for production builds

### Issue 2: GUI Dialogs Don't Show
**Symptom:** No dialogs appear, application seems frozen
**Cause:** Using `runhidden` flag in Inno Setup
**Fix:** Remove `runhidden` flag, rely on `windows_subsystem` instead

### Issue 3: Can't See Logs in Production
**Symptom:** No way to debug issues in production
**Solution:** Use file-based logging (already implemented in your app)
- Logs go to `logs/` directory
- Check `logs/log.txt` for output
- Logs work even with hidden console

### Issue 4: Need Console for Specific Testing
**Symptom:** Want to see console in release build temporarily
**Solution:** Build without release flag:
```bash
cargo build  # Console visible
cargo build --release  # Console hidden
```

## Architecture Benefits

### For Developers
- ✅ See console output during development
- ✅ Easy debugging with visible logs
- ✅ No need to check log files constantly
- ✅ Standard Rust development workflow

### For Users
- ✅ No console window clutter
- ✅ Professional appearance
- ✅ GUI dialogs work perfectly
- ✅ System tray integration
- ✅ Clean user experience

### For Deployment
- ✅ Single executable
- ✅ No special flags needed
- ✅ Works with Task Scheduler
- ✅ Works with NSSM service
- ✅ Works with Inno Setup installer

## Technical Details

### What `windows_subsystem = "windows"` Does
1. Sets the PE subsystem to `IMAGE_SUBSYSTEM_WINDOWS_GUI`
2. Windows doesn't allocate a console window
3. `stdout`/`stderr` go nowhere (use file logging instead)
4. Application runs without visible console
5. GUI APIs work normally

### What `debug_assertions` Means
- Enabled in debug builds (`cargo build`)
- Disabled in release builds (`cargo build --release`)
- Also controls `debug_assert!()` macros
- Standard Rust conditional compilation

### Logging Strategy
Since console is hidden in release:
```rust
// Your app already does this:
use tracing::{info, error, debug};

// Logs go to file, not console
info!("Application started");
error!("Error occurred: {}", e);
```

## Best Practices

### 1. Always Test Both Builds
```bash
# Test debug build
cargo run

# Test release build
cargo build --release
./target/release/monitoring-client.exe
```

### 2. Use File Logging
```rust
// Already implemented in your app
let file_appender = tracing_appender::rolling::daily("logs", "log.txt");
```

### 3. Installer Configuration
```iss
[Run]
; No runhidden needed - console already hidden
Filename: "{app}\monitoring-client.exe"; Flags: nowait
```

### 4. Service Configuration
```bash
# NSSM service - works perfectly
nssm install VibgyorSeekMonitoring "C:\Path\monitoring-client.exe"
```

### 5. Task Scheduler
```xml
<!-- Works without any special flags -->
<Exec>
  <Command>C:\Path\monitoring-client.exe</Command>
</Exec>
```

## Summary

| Build Type | Console Window | GUI Dialogs | Use Case |
|------------|---------------|-------------|----------|
| Debug (`cargo build`) | ✅ Visible | ✅ Work | Development |
| Release (`cargo build --release`) | ❌ Hidden | ✅ Work | Production |

**Key Point:** The `windows_subsystem` attribute is the RIGHT way to hide console windows in Windows applications. It's cleaner and more reliable than using `runhidden` flags or VBS wrappers.

## Migration Steps

If you're updating from the old approach:

1. ✅ Add `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` to main.rs
2. ✅ Remove `runhidden` from Inno Setup ISS file
3. ✅ Remove VBS wrapper scripts (if any)
4. ✅ Rebuild with `cargo build --release`
5. ✅ Test that GUI dialogs work
6. ✅ Test that console is hidden
7. ✅ Rebuild installer
8. ✅ Test installer on clean machine

Done! Your application now has professional console window management.
