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
Source: "ScreenTime Watchdog.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "ScreenTimeMonitoring_Hidden.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: ".env"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{app}\logs"

[Registry]
; Fallback logon start if Task Scheduler creation is blocked by local policy.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
    ValueType: string; ValueName: "VibgyorSeek Monitoring"; \
    ValueData: """{app}\monitoring-client.exe"" --scheduled"; \
    Flags: uninsdeletevalue

[Run]
Filename: "{app}\monitoring-client.exe"; Parameters: "--clear-stop"; Flags: runhidden waituntilterminated
Filename: "{sys}\schtasks.exe"; Parameters: "/create /tn ""VibgyorSeek Monitoring"" /xml ""{tmp}\task.xml"" /f"; Flags: runhidden waituntilterminated
Filename: "{sys}\schtasks.exe"; Parameters: "/run /tn ""VibgyorSeek Monitoring"""; Flags: runhidden waituntilterminated

[UninstallRun]
; 1) Signal a clean, watchdog-aware stop FIRST. This writes the durable stop
;    marker that both the agent and its self-reviving watchdog poll, so neither
;    will relaunch after we kill them below. Wait for it to be processed.
Filename: "{app}\monitoring-client.exe"; Parameters: "--stop"; Flags: runhidden waituntilterminated; RunOnceId: "SignalStop"
; 2) Give the watchdog one poll cycle (~5s) to see the marker and self-exit.
Filename: "{sys}\timeout.exe"; Parameters: "/T 7 /NOBREAK"; Flags: runhidden; RunOnceId: "AwaitStop"
; 3) Force-kill any remaining instances as a fallback (won't revive: marker set).
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM monitoring-client.exe /T"; Flags: runhidden; RunOnceId: "KillProcess"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM ""ScreenTime Watchdog.exe"" /T"; Flags: runhidden; RunOnceId: "KillWatchdog"
Filename: "{sys}\schtasks.exe"; Parameters: "/delete /tn ""VibgyorSeek Monitoring"" /f"; Flags: runhidden; RunOnceId: "RemoveTask"

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  TaskXML: AnsiString;
  XMLFile: String;
  ExePath: String;
begin
  if CurStep = ssInstall then
  begin
    XMLFile := ExpandConstant('{tmp}\task.xml');
    ExePath := ExpandConstant('{app}\monitoring-client.exe');
    TaskXML := '<?xml version="1.0" encoding="UTF-16"?>' + #13#10 +
      '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">' + #13#10 +
      '  <RegistrationInfo><Description>ScreenTime Employee Monitoring Client</Description><Author>ScreenTime</Author></RegistrationInfo>' + #13#10 +
      '  <Triggers><LogonTrigger><Enabled>true</Enabled><Repetition><Interval>PT1M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition></LogonTrigger></Triggers>' + #13#10 +
      '  <Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>' + #13#10 +
      '  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><Enabled>true</Enabled><Hidden>true</Hidden></Settings>' + #13#10 +
      '  <Actions Context="Author"><Exec><Command>' + ExePath + '</Command><Arguments>--scheduled</Arguments><WorkingDirectory>' + ExpandConstant('{app}') + '</WorkingDirectory></Exec></Actions>' + #13#10 +
      '</Task>';
    SaveStringToFile(XMLFile, TaskXML, False);
  end;
end;
