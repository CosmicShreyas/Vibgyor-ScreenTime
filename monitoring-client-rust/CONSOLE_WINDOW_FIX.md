# Console Window Fix - Complete Solution

## Problem
The monitoring client was showing a console window repeatedly, even though it's configured as a Windows GUI application.

## Root Cause
The console window appears when:
1. The application is launched from a Command Prompt or PowerShell window
2. The application is started using certain batch file commands
3. The Windows subsystem is not properly configured during build

## Solution Implemented

### 1. Proper Windows Subsystem Configuration

**File: `src/main.rs`**
- Added `#![windows_subsystem = "windows"]` directive at the top
- Removed problematic stdout/stderr redirection code

**File: `Cargo.toml`**
- Added `winres` build dependency for Windows resource compilation
- Configured package metadata for Windows

**File: `build.rs` (NEW)**
- Created build script to properly configure Windows resources
- Sets application metadata and icon

### 2. Hidden Launcher Scripts

**File: `start_hidden.vbs` (NEW)**
- VBScript that launches the executable with window hidden
- Most reliable method to prevent console window

**File: `start_monitoring.bat` (NEW)**
- Batch file that uses the VBScript launcher
- Provides a simple double-click interface

## How to Use

### Method 1: VBScript Launcher (RECOMMENDED)
```
Double-click: start_hidden.vbs
```
This is the most reliable method and will NEVER show a console window.

### Method 2: Batch File Launcher
```
Double-click: start_monitoring.bat
```
This uses the VBScript internally, so it's also reliable.

### Method 3: Direct Executable
```
Double-click: target\release\monitoring-client.exe
```
This should work after rebuilding with the new configuration.

## Rebuild Instructions

1. Clean previous builds:
   ```batch
   cargo clean
   ```

2. Rebuild the application:
   ```batch
   cargo build --release
   ```
   OR use the provided script:
   ```batch
   build_release.bat
   ```

3. Test the application:
   ```batch
   start_hidden.vbs
   ```

## What NOT to Do

❌ **DO NOT** run from Command Prompt:
```batch
target\release\monitoring-client.exe
```

❌ **DO NOT** use `start` command in batch files:
```batch
start "" "target\release\monitoring-client.exe"
```

❌ **DO NOT** run from PowerShell directly:
```powershell
.\target\release\monitoring-client.exe
```

## Verification

After launching with `start_hidden.vbs`, you should see:
- ✅ NO console window
- ✅ System tray icon appears
- ✅ GUI dialogs work (setup, settings, etc.)
- ✅ Logging to `logs/log.txt` works

## Troubleshooting

### Console window still appears
1. Make sure you rebuilt after the changes:
   ```batch
   cargo clean
   cargo build --release
   ```

2. Use the VBScript launcher:
   ```
   Double-click: start_hidden.vbs
   ```

3. Check that `#![windows_subsystem = "windows"]` is at the top of `src/main.rs`

### Application doesn't start
1. Check the log file: `logs/log.txt`
2. Verify the executable exists: `target\release\monitoring-client.exe`
3. Try running once from Command Prompt to see error messages:
   ```batch
   target\release\monitoring-client.exe
   ```
   (This will show console, but you can see errors)

### System tray icon doesn't appear
1. Check Windows notification area settings
2. Look for the VibgyorSeek icon in the hidden icons area
3. Check logs for system tray initialization errors

## Technical Details

### Windows Subsystem Types
- **Console**: `#![windows_subsystem = "console"]` - Shows console window
- **Windows**: `#![windows_subsystem = "windows"]` - No console window (GUI app)

### VBScript Window Styles
- `0` = Hidden
- `1` = Normal
- `2` = Minimized
- `3` = Maximized

### Build Process
1. `build.rs` runs during compilation
2. `winres` embeds Windows resources into the executable
3. Rust compiler applies `windows_subsystem` attribute
4. Final executable is configured as a GUI application

## For Deployment

When deploying to end users, include:
1. `monitoring-client.exe` (from `target\release\`)
2. `start_hidden.vbs` (launcher script)
3. `start_monitoring.bat` (optional, user-friendly launcher)
4. `.env` file (configuration)
5. `info.json` (if pre-configured)

Create a shortcut to `start_hidden.vbs` and place it in:
- Desktop
- Startup folder (for auto-start)
- Start Menu

## Auto-Start Configuration

To make the application start automatically on Windows login:

1. Create a shortcut to `start_hidden.vbs`
2. Press `Win + R`, type `shell:startup`, press Enter
3. Copy the shortcut to the Startup folder

OR use Task Scheduler (more reliable):
1. Open Task Scheduler
2. Create Basic Task
3. Trigger: At log on
4. Action: Start a program
5. Program: `wscript.exe`
6. Arguments: `"C:\path\to\start_hidden.vbs"`

## Summary

The console window issue is now fixed with multiple layers:
1. ✅ Proper Windows subsystem configuration in code
2. ✅ Build script for Windows resources
3. ✅ VBScript launcher for guaranteed hidden execution
4. ✅ Updated build instructions

Use `start_hidden.vbs` for the most reliable, console-free experience!
