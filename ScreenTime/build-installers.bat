@echo off
REM ============================================================================
REM  Build the ScreenTime installers (Admin + User) WITHOUT running them.
REM
REM  Double-clicking a .iss opens the Inno Setup IDE, and pressing "Run" (F9)
REM  compiles AND launches the installer immediately -- which looks like the
REM  setup "just ran" and no installer was saved. This script instead calls the
REM  command-line compiler (ISCC.exe), which only COMPILES. The resulting
REM  installers are written next to this file (OutputDir=. in each .iss):
REM        ScreenTimeSetupAdmin.exe
REM        ScreenTimeSetupUser.exe
REM
REM  Just double-click THIS .bat (not the .iss files).
REM ============================================================================

setlocal
cd /d "%~dp0"

REM Locate the Inno Setup command-line compiler.
set "ISCC=D:\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" (
    echo [ERROR] Could not find ISCC.exe ^(Inno Setup command-line compiler^).
    echo         Edit this script and set ISCC to its full path.
    pause
    exit /b 1
)

echo Using compiler: "%ISCC%"
echo.

echo === Compiling Admin installer ===
"%ISCC%" "ScreenTimeMonitoringAdmin.iss"
if errorlevel 1 goto :failed

echo.
echo === Compiling User installer ===
"%ISCC%" "ScreenTimeMonitoringUser.iss"
if errorlevel 1 goto :failed

echo.
echo === DONE ===
echo Installers written to this folder:
echo   %~dp0ScreenTimeSetupAdmin.exe
echo   %~dp0ScreenTimeSetupUser.exe
echo.
pause
exit /b 0

:failed
echo.
echo [ERROR] Compilation failed. See the messages above.
pause
exit /b 1
