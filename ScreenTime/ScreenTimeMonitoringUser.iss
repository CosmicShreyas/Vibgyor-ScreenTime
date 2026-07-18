[Setup]
AppName=ScreenTime Monitoring
AppVersion=1.0
; NOTE: install dir + HKCU Run value name kept as "VibgyorSeek*" internal
; identifiers so already-installed clients keep matching. Only user-visible
; strings (AppName/group/description) are rebranded.
DefaultDirName={userdocs}\VibgyorSeekMonitoring
DefaultGroupName=ScreenTime Monitoring
OutputDir=.
OutputBaseFilename=ScreenTimeSetupUser
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest

[Files]
Source: "monitoring-client.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "ScreenTimeMonitoring_Hidden.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: ".env"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{app}\logs"

[Registry]
; Start automatically for the current user at sign-in without admin rights
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
    ValueType: string; ValueName: "VibgyorSeek Monitoring"; \
    ValueData: """{sys}\wscript.exe"" ""{app}\ScreenTimeMonitoring_Hidden.vbs"""; \
    Flags: uninsdeletevalue

[Run]
; Start app immediately after install using the same hidden launcher used for startup
Filename: "{sys}\wscript.exe"; Parameters: """{app}\ScreenTimeMonitoring_Hidden.vbs"""; \
    Description: "Starting ScreenTime Monitoring..."; Flags: nowait postinstall skipifsilent runhidden

[UninstallRun]
; 1) Signal a clean, watchdog-aware stop FIRST. This writes the durable stop
;    marker that both the agent and its self-reviving watchdog poll, so neither
;    will relaunch after we kill them below. Wait for it to be processed.
Filename: "{app}\monitoring-client.exe"; Parameters: "--stop"; Flags: runhidden waituntilterminated; RunOnceId: "SignalStop"
; 2) Give the watchdog one poll cycle (~5s) to see the marker and self-exit.
Filename: "{sys}\timeout.exe"; Parameters: "/T 7 /NOBREAK"; Flags: runhidden; RunOnceId: "AwaitStop"
; 3) Force-kill any remaining instances as a fallback (won't revive: marker set).
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM monitoring-client.exe /T"; Flags: runhidden; RunOnceId: "KillProcess"
