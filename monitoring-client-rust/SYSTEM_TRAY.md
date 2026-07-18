# System Tray Functionality

## Overview

The monitoring client runs in the system tray with a context menu accessible via right-click.

## Features

### System Tray Icon
- **Location**: Windows system tray (notification area)
- **Icon**: Blue square with white "V" logo
- **Tooltip**: "VibgyorSeek Monitoring - Right-click for menu"

### Context Menu (Right-Click)

The system tray icon provides a right-click context menu with the following options:

#### ⚙️ Settings
- Opens the employee information settings dialog
- Allows updating employee name and ID
- Requires admin password verification
- Requires OTP verification (sent to admin email)
- Changes are immediately synced to the server

#### ℹ️ About
- Shows information about the monitoring client
- Displays current employee name and ID
- Shows client version and status

#### ⏸️ Pause Monitoring
- Temporarily pauses all monitoring activities
- Stops screenshot capture
- Stops data transmission
- Stops location updates
- Activity tracking continues but data is not sent
- Useful for breaks or when you need privacy

#### ▶️ Resume Monitoring
- Resumes all monitoring activities
- Restarts screenshot capture
- Restarts data transmission
- Restarts location updates
- Returns to normal monitoring mode

## Usage

1. **Locate the Icon**: Look for the VibgyorSeek icon in your system tray (bottom-right corner of Windows taskbar)

2. **Access Menu**: Right-click on the icon to open the context menu

3. **Select Option**: Click on any menu item to perform the action

4. **Pause/Resume**: Click "Pause Monitoring" to temporarily stop monitoring, click "Resume Monitoring" to continue

## Pause/Resume Behavior

### When Paused
- ⏸️ Screenshot capture is skipped
- ⏸️ Data transmission is skipped
- ⏸️ Location updates are skipped
- ✅ Application remains running
- ✅ System tray icon remains visible
- ✅ Settings and About dialogs still work

### When Resumed
- ▶️ All monitoring activities restart immediately
- ▶️ Next scheduled screenshot will be captured
- ▶️ Next scheduled data transmission will occur
- ▶️ Location will be updated on next interval

## Technical Details

### Implementation
- **Library**: `trayicon` crate for Windows system tray integration
- **Event Loop**: Processes Windows messages to keep tray responsive
- **Thread Safety**: Uses Arc and RwLock for thread-safe callbacks
- **Event Processing**: Checks for menu events every 100ms in main loop
- **Pause State**: Shared atomic boolean flag checked by all monitoring tasks

### Event Flow
1. User right-clicks tray icon
2. Windows displays context menu
3. User clicks menu item
4. Event is sent through channel
5. Main loop processes event
6. Callback function is executed
7. Action is performed (show dialog, pause/resume, etc.)

## Troubleshooting

### Icon Not Appearing
- Check if the application is running
- Look in the hidden icons area (click the up arrow in system tray)
- Restart the application

### Menu Not Responding
- Ensure the application is not frozen
- Check the logs for errors
- Try restarting the application

### Settings Dialog Not Showing
- Verify admin password is configured in server `.env`
- Check network connectivity to server
- Review application logs for errors

### Pause Not Working
- Check the logs to confirm pause was triggered
- Verify monitoring tasks are checking the pause flag
- Try resume and pause again

## Keyboard Shortcuts

While the system tray is the primary interface, you can also:
- Press `Ctrl+C` in the console window to stop the application (if running in console mode)

## Notes

- The system tray icon remains visible as long as the application is running
- Pausing monitoring does not stop the application - it only pauses data collection
- All menu actions are logged for troubleshooting purposes
- Pause state is not persisted - monitoring resumes automatically on application restart
