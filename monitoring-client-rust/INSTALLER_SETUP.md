# Installer Setup for Rust Client

## Overview

Now that the Rust client uses `windows_subsystem = "windows"` in release builds, you need to update your installer configuration.

## Key Changes

### 1. Console Window Management
The Rust application now handles console hiding internally:
- Debug builds: Console visible (for development)
- Release builds: Console hidden automatically

### 2. Installer Configuration

You should create an Inno Setup script for the Rust client. Here's the recommended configuration:

## Inno Setup Script Template

Create `monitoring-client-rust/VibgyorSeekMonitoring_Rust.iss`:

```iss
[Setup]
AppName=VibgyorSeek Monitoring Client (Rust)
AppVersion=1.0.0
DefaultDirName={autopf}\VibgyorSeek
DefaultGroupName=VibgyorSeek
OutputDir=installer
OutputBaseFilename=VibgyorSeekMonitoring_Setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64

[Files]
; Main executable (release build)
Source: "target\release\monitoring-client.exe"; DestDir: "{app}"; Flags: ignoreversion

; Configuration files
Source: ".env"; DestDir: "{app}"; Flags: ignoreversion
Source: "info.json.example"; DestDir: "{app}"; DestName: "info.json"; Flags: onlyifdoesntexist

; Create logs directory
[Dirs]
Name: "{app}\logs"; Permissions: users-modify

[Run]
; Run the application after installation
; NO runhidden flag needed - console is already hidden in release build!
Filename: "{app}\monitoring-client.exe"; Description: "Start VibgyorSeek Monitoring"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Stop the application before uninstalling
Filename: "taskkill"; Parameters: "/F /IM monitoring-client.exe"; Flags: runhidden; RunOnceId: "StopMonitoring"

[Code]
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  // Stop any running instance before installation
  Exec('taskkill', '/F /IM monitoring-client.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := True;
end;
```

## Important Notes

### ✅ DO Use
- `Flags: nowait` - Allows installer to complete while app runs
- `Flags: postinstall` - Runs after installation completes
- `Flags: skipifsilent` - Skips if silent install

### ❌ DON'T Use
- `Flags: runhidden` - NOT needed, console already hidden
- VBS wrapper scripts - NOT needed anymore
- Special hiding mechanisms - NOT needed

## Build Process

### Step 1: Build Release Version
```bash
cd monitoring-client-rust
cargo build --release
```

This creates `target/release/monitoring-client.exe` with:
- Console window hidden
- GUI dialogs working
- System tray working
- All features enabled

### Step 2: Compile Installer
```bash
# Using Inno Setup Compiler
iscc VibgyorSeekMonitoring_Rust.iss
```

This creates `installer/VibgyorSeekMonitoring_Setup.exe`

### Step 3: Test Installer
1. Run the installer on a test machine
2. Verify NO console window appears
3. Verify GUI dialogs work (setup, settings, about)
4. Verify system tray icon appears
5. Check logs are being written to `logs/log.txt`

## Comparison: Old vs New Approach

### Old Approach (Python Client)
```iss
[Run]
Filename: "{app}\VibgyorSeekMonitoring_Hidden.vbs"; Flags: runhidden
```
- Needed VBS wrapper
- Needed `runhidden` flag
- Complex setup
- Hard to debug

### New Approach (Rust Client)
```iss
[Run]
Filename: "{app}\monitoring-client.exe"; Flags: nowait
```
- No wrapper needed
- No `runhidden` needed
- Simple and clean
- Easy to debug

## Task Scheduler Integration

If you want to auto-start with Task Scheduler:

```iss
[Run]
Filename: "schtasks"; Parameters: "/Create /TN ""VibgyorSeek Monitoring"" /TR ""{app}\monitoring-client.exe"" /SC ONLOGON /RL HIGHEST /F"; Flags: runhidden

[UninstallRun]
Filename: "schtasks"; Parameters: "/Delete /TN ""VibgyorSeek Monitoring"" /F"; Flags: runhidden
```

## NSSM Service Integration

If you want to install as a Windows service:

```iss
[Run]
Filename: "{app}\nssm.exe"; Parameters: "install VibgyorSeekMonitoring ""{app}\monitoring-client.exe"""; Flags: runhidden
Filename: "{app}\nssm.exe"; Parameters: "start VibgyorSeekMonitoring"; Flags: runhidden

[UninstallRun]
Filename: "{app}\nssm.exe"; Parameters: "stop VibgyorSeekMonitoring"; Flags: runhidden
Filename: "{app}\nssm.exe"; Parameters: "remove VibgyorSeekMonitoring confirm"; Flags: runhidden
```

## Testing Checklist

### Pre-Installation
- [ ] Build release version: `cargo build --release`
- [ ] Test exe manually: `target/release/monitoring-client.exe`
- [ ] Verify no console window
- [ ] Verify GUI dialogs work
- [ ] Verify system tray works

### Installer Creation
- [ ] Compile ISS script
- [ ] Installer exe created successfully
- [ ] Installer size is reasonable

### Installation Testing
- [ ] Run installer on clean test machine
- [ ] Installation completes successfully
- [ ] Application starts automatically (if postinstall)
- [ ] No console window visible
- [ ] GUI dialogs appear correctly
- [ ] System tray icon appears
- [ ] Logs are being written

### Uninstallation Testing
- [ ] Run uninstaller
- [ ] Application stops properly
- [ ] Files are removed
- [ ] Task/Service is removed (if applicable)
- [ ] No leftover processes

## Troubleshooting

### Console Window Still Appears
**Cause:** Built with debug instead of release
**Fix:** 
```bash
cargo build --release  # Not just 'cargo build'
```

### GUI Dialogs Don't Show
**Cause:** Using `runhidden` flag in ISS
**Fix:** Remove `runhidden` from the `[Run]` section

### Application Doesn't Start
**Cause:** Missing dependencies or wrong path
**Fix:** 
- Check .env file is present
- Check info.json is present
- Check logs/log.txt for errors

### Installer Fails to Build
**Cause:** Wrong paths in ISS file
**Fix:** Verify all `Source:` paths exist

## Advanced Configuration

### Custom Installation Directory
```iss
[Setup]
DefaultDirName={autopf}\VibgyorSeek
DisableDirPage=no  ; Allow user to choose directory
```

### Silent Installation
```bash
# Install silently
VibgyorSeekMonitoring_Setup.exe /SILENT

# Install very silently (no progress)
VibgyorSeekMonitoring_Setup.exe /VERYSILENT
```

### Unattended Installation
```iss
[Setup]
DisableWelcomePage=yes
DisableFinishedPage=yes
```

## Summary

| Feature | Old (Python) | New (Rust) |
|---------|-------------|------------|
| Console Hiding | VBS wrapper + runhidden | Built-in windows_subsystem |
| Complexity | High | Low |
| Debugging | Difficult | Easy |
| GUI Dialogs | Work | Work |
| System Tray | Work | Work |
| Maintenance | Complex | Simple |

**Bottom Line:** The Rust client with `windows_subsystem = "windows"` is much cleaner and more professional than the old VBS wrapper approach. Just build with `--release` and your installer will work perfectly!
