@echo off
echo ========================================
echo VibgyorSeek Monitoring - Console Fix
echo ========================================
echo.
echo This script will rebuild the application
echo with the console window fix applied.
echo.
pause

echo.
echo Step 1: Cleaning previous builds...
cargo clean
if errorlevel 1 (
    echo ERROR: Failed to clean
    pause
    exit /b 1
)
echo ✅ Clean complete

echo.
echo Step 2: Building with NO CONSOLE WINDOW...
cargo build --release
if errorlevel 1 (
    echo ERROR: Build failed
    pause
    exit /b 1
)
echo ✅ Build complete

echo.
echo ========================================
echo SUCCESS! Console window fix applied
echo ========================================
echo.
echo The application is now configured to run WITHOUT a console window.
echo.
echo To test, use ONE of these methods:
echo.
echo   1. Double-click: start_hidden.vbs (RECOMMENDED)
echo   2. Double-click: start_monitoring.bat
echo   3. Double-click: target\release\monitoring-client.exe
echo.
echo DO NOT run from Command Prompt or PowerShell!
echo.
echo For more information, see: CONSOLE_WINDOW_FIX.md
echo.
pause
