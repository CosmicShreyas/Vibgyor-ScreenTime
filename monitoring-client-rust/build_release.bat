@echo off
echo ========================================
echo VibgyorSeek Monitoring - Clean Build
echo ========================================
echo.

echo Cleaning previous builds...
cargo clean
if errorlevel 1 (
    echo ERROR: Failed to clean previous builds
    pause
    exit /b 1
)

echo.
echo Building with console window HIDDEN...
cargo build --release
if errorlevel 1 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo Build completed successfully!
echo ========================================
echo.
echo Executable: target\release\monitoring-client.exe
echo.
echo Console window: HIDDEN (when launched properly)
echo GUI dialogs: VISIBLE
echo System tray: VISIBLE
echo.
echo IMPORTANT: To run without console window, use ONE of these methods:
echo   1. Double-click: start_monitoring.bat
echo   2. Double-click: start_hidden.vbs
echo   3. Double-click: target\release\monitoring-client.exe directly
echo.
echo DO NOT run from Command Prompt or PowerShell directly!
echo.
pause
