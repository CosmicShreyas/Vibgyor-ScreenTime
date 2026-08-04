@echo off
echo ========================================
echo Console Window Fix - Build and Test
echo ========================================
echo.

echo Step 1: Cleaning...
cargo clean
echo.

echo Step 2: Building release (this may take a few minutes)...
cargo build --release
if errorlevel 1 (
    echo.
    echo ERROR: Build failed!
    echo Check the error messages above.
    pause
    exit /b 1
)

echo.
echo ========================================
echo Build SUCCESS!
echo ========================================
echo.
echo Executable: target\release\monitoring-client.exe
echo.
echo Now testing...
echo.
echo IMPORTANT: Watch for console window!
echo   - If NO console appears: SUCCESS!
echo   - If console appears: Something is still wrong
echo.
pause

echo Launching...
start "" "target\release\monitoring-client.exe"

echo.
echo Did you see a console window? (Y/N)
set /p answer=
if /i "%answer%"=="N" (
    echo.
    echo ========================================
    echo SUCCESS! Console is hidden!
    echo ========================================
    echo.
    echo The fix is working. You can now:
    echo 1. Build the installer
    echo 2. Deploy to users
    echo.
) else (
    echo.
    echo ========================================
    echo Console still appears
    echo ========================================
    echo.
    echo Please check:
    echo 1. Did you build RELEASE version?
    echo 2. Are you running the right exe?
    echo 3. Check FINAL_CONSOLE_FIX.md for details
    echo.
)

pause
