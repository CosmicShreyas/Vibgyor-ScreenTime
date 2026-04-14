@echo off
echo ========================================
echo Testing Console Window Fix
echo ========================================
echo.

echo Step 1: Checking if main.rs has the attribute...
findstr /C:"windows_subsystem" src\main.rs >nul
if errorlevel 1 (
    echo ERROR: windows_subsystem attribute not found in main.rs
    echo Please ensure this line is at the top of main.rs:
    echo #![windows_subsystem = "windows"]
    pause
    exit /b 1
) else (
    echo OK: windows_subsystem attribute found
)

echo.
echo Step 2: Cleaning old builds...
cargo clean >nul 2>&1
echo OK: Clean complete

echo.
echo Step 3: Building release version...
cargo build --release
if errorlevel 1 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo Build Complete!
echo ========================================
echo.
echo Now test the executable:
echo   target\release\monitoring-client.exe
echo.
echo Expected behavior:
echo   - NO console window
echo   - GUI dialog appears
echo   - System tray icon appears
echo.
echo Press any key to launch the test...
pause >nul

echo.
echo Launching monitoring-client.exe...
echo (Check that NO console window appears!)
echo.
start "" "target\release\monitoring-client.exe"

echo.
echo Did you see:
echo   1. NO console window?
echo   2. GUI dialog appeared?
echo   3. System tray icon appeared?
echo.
echo If YES to all: SUCCESS! Console is hidden.
echo If NO: Check CONSOLE_HIDDEN_FINAL.md for troubleshooting.
echo.
pause
