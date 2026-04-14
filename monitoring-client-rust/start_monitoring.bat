@echo off
REM VibgyorSeek Monitoring Client - Launcher
REM This batch file launches the monitoring client without showing a console window

REM Check if the VBScript launcher exists
if not exist "%~dp0start_hidden.vbs" (
    echo ERROR: start_hidden.vbs not found!
    pause
    exit /b 1
)

REM Launch using VBScript (this will hide the console window)
wscript.exe "%~dp0start_hidden.vbs"

REM Exit immediately (don't wait)
exit /b 0
