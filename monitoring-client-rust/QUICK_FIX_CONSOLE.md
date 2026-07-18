# Quick Fix: Console Window Issue

## The Problem
Console window keeps appearing when running the monitoring client.

## The Solution (3 Steps)

### Step 1: Rebuild the Application
```batch
rebuild_no_console.bat
```
OR manually:
```batch
cargo clean
cargo build --release
```

### Step 2: Stop Running the Wrong Way
❌ **STOP doing this:**
- Running from Command Prompt
- Running from PowerShell
- Using `start` command in batch files

### Step 3: Run the Right Way
✅ **START doing this:**

**Option A (BEST):** Double-click this file:
```
start_hidden.vbs
```

**Option B:** Double-click this file:
```
start_monitoring.bat
```

**Option C:** Double-click the executable directly:
```
target\release\monitoring-client.exe
```

## That's It!

After rebuilding and using the VBScript launcher, you will:
- ✅ See NO console window
- ✅ See system tray icon
- ✅ See GUI dialogs when needed
- ✅ Have logging working in `logs/log.txt`

## Still Having Issues?

1. Make sure you rebuilt: `rebuild_no_console.bat`
2. Use the VBScript: `start_hidden.vbs`
3. Check the detailed guide: `CONSOLE_WINDOW_FIX.md`

## For Auto-Start on Windows Login

1. Create a shortcut to `start_hidden.vbs`
2. Press `Win + R`, type `shell:startup`, press Enter
3. Copy the shortcut there

Done! 🎉
