@echo off
REM Build script for VibgyorSeek Monitoring Client (Rust)

echo ========================================
echo VibgyorSeek Monitoring Client - Build
echo ========================================
echo.

REM Check if Rust is installed
where cargo >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Rust/Cargo not found!
    echo Please install Rust from https://rustup.rs/
    pause
    exit /b 1
)

echo Rust version:
cargo --version
echo.

REM Parse command line arguments
set BUILD_TYPE=release
if "%1"=="debug" set BUILD_TYPE=debug
if "%1"=="dev" set BUILD_TYPE=debug

echo Build type: %BUILD_TYPE%
echo.

REM Clean previous build (optional)
if "%2"=="clean" (
    echo Cleaning previous build...
    cargo clean
    echo.
)

REM Build the project
echo Building monitoring client...
echo.

if "%BUILD_TYPE%"=="debug" (
    cargo build
    set EXE_PATH=target\debug\monitoring-client.exe
) else (
    cargo build --release
    set EXE_PATH=target\release\monitoring-client.exe
)

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================
    echo BUILD FAILED!
    echo ========================================
    pause
    exit /b 1
)

echo.
echo ========================================
echo BUILD SUCCESSFUL!
echo ========================================
echo.
echo Executable: %EXE_PATH%
echo.

REM Show file size
if exist "%EXE_PATH%" (
    echo File size:
    dir "%EXE_PATH%" | find ".exe"
    echo.
)

REM Ask if user wants to run
set /p RUN="Run the application now? (y/n): "
if /i "%RUN%"=="y" (
    echo.
    echo Starting monitoring client...
    echo.
    start "" "%EXE_PATH%"
)

echo.
echo Build complete!
pause
