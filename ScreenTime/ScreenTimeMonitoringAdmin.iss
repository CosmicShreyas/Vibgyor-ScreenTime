[Setup]
AppName=ScreenTime Monitoring
AppVersion=1.0
; NOTE: install dir + scheduled-task name kept as "VibgyorSeek*" internal
; identifiers so already-installed clients and the client's TASK_NAME keep
; matching. Only the user-visible AppName/group are rebranded.
DefaultDirName={commonpf}\VibgyorSeekMonitoring
DefaultGroupName=ScreenTime Monitoring
OutputDir=.
OutputBaseFilename=ScreenTimeSetupAdmin
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin

[Files]
Source: "monitoring-client.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "ScreenTime Watchdog.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "ScreenTimeMonitoring_Hidden.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: ".env"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{app}\logs"; Permissions: everyone-full

[Run]
; Clear a stale deliberate-stop marker before installing/restarting recovery.
Filename: "{app}\monitoring-client.exe"; Parameters: "--clear-stop"; Flags: runhidden waituntilterminated; StatusMsg: "Preparing monitoring client..."

; Add Windows Defender exclusions BEFORE creating the task
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""Add-MpPreference -ExclusionPath '{app}' -Force"""; Flags: runhidden; StatusMsg: "Adding antivirus exclusion..."

; Also exclude the executable specifically
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""Add-MpPreference -ExclusionProcess 'VibgyorSeekMonitoring.exe' -Force"""; Flags: runhidden; StatusMsg: "Adding antivirus exclusion..."

; Create a Windows-owned recovery task. The release executable is windowless,
; so Task Scheduler can own the real process directly and observe failures.
Filename: "{sys}\schtasks.exe"; Parameters: "/create /tn ""VibgyorSeek Monitoring"" /xml ""{tmp}\task.xml"" /f"; Flags: runhidden waituntilterminated; StatusMsg: "Creating scheduled task..."

; Start the task immediately
Filename: "{sys}\schtasks.exe"; Parameters: "/run /tn ""VibgyorSeek Monitoring"""; Flags: runhidden waituntilterminated; StatusMsg: "Starting monitoring client..."

[UninstallRun]
; Signal a clean, watchdog-aware stop FIRST so the self-reviving watchdog (a
; separate process, not part of the scheduled task) won't relaunch the agent
; after we end the task below. Writes the durable stop marker both poll.
Filename: "{app}\monitoring-client.exe"; Parameters: "--stop"; Flags: runhidden waituntilterminated; RunOnceId: "SignalStop"
; Give the watchdog one poll cycle (~5s) to see the marker and self-exit.
Filename: "{sys}\timeout.exe"; Parameters: "/T 7 /NOBREAK"; Flags: runhidden; RunOnceId: "AwaitStop"

; Stop the task if running
Filename: "{sys}\schtasks.exe"; Parameters: "/end /tn ""VibgyorSeek Monitoring"""; Flags: runhidden; RunOnceId: "StopTask"

; Force-kill any lingering agent/watchdog instances (won't revive: marker set).
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM monitoring-client.exe /T"; Flags: runhidden; RunOnceId: "KillProcess"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM ""ScreenTime Watchdog.exe"" /T"; Flags: runhidden; RunOnceId: "KillWatchdog"

; Remove scheduled task
Filename: "{sys}\schtasks.exe"; Parameters: "/delete /tn ""VibgyorSeek Monitoring"" /f"; Flags: runhidden; RunOnceId: "RemoveTask"

; Remove Windows Defender exclusions
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""Remove-MpPreference -ExclusionPath '{app}' -Force"""; Flags: runhidden; RunOnceId: "RemoveExclusion1"

Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""Remove-MpPreference -ExclusionProcess 'VibgyorSeekMonitoring.exe' -Force"""; Flags: runhidden; RunOnceId: "RemoveExclusion2"

[Code]
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  // Check if task already exists and remove it
  Exec(ExpandConstant('{sys}\schtasks.exe'), '/end /tn "VibgyorSeek Monitoring"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{sys}\schtasks.exe'), '/delete /tn "VibgyorSeek Monitoring" /f', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  TaskXML: AnsiString;
  XMLFile: String;
  ExePath: String;
begin
  if CurStep = ssInstall then
  begin
    // The minute repetition recovers even if every same-image process is ended
    // together; RestartOnFailure handles abnormal exits observed by Scheduler.
    XMLFile := ExpandConstant('{tmp}\task.xml');
    ExePath := ExpandConstant('{app}\monitoring-client.exe');
    
    TaskXML := '<?xml version="1.0" encoding="UTF-16"?>' + #13#10 +
               '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">' + #13#10 +
               '  <RegistrationInfo>' + #13#10 +
               '    <Description>ScreenTime Employee Monitoring Client</Description>' + #13#10 +
               '    <Author>ScreenTime</Author>' + #13#10 +
               '  </RegistrationInfo>' + #13#10 +
               '  <Triggers>' + #13#10 +
               '    <LogonTrigger>' + #13#10 +
               '      <Enabled>true</Enabled>' + #13#10 +
               '      <Repetition>' + #13#10 +
               '        <Interval>PT1M</Interval>' + #13#10 +
               '        <StopAtDurationEnd>false</StopAtDurationEnd>' + #13#10 +
               '      </Repetition>' + #13#10 +
               '    </LogonTrigger>' + #13#10 +
               '  </Triggers>' + #13#10 +
               '  <Principals>' + #13#10 +
               '    <Principal id="Author">' + #13#10 +
               '      <LogonType>InteractiveToken</LogonType>' + #13#10 +
               '      <RunLevel>HighestAvailable</RunLevel>' + #13#10 +
               '    </Principal>' + #13#10 +
               '  </Principals>' + #13#10 +
               '  <Settings>' + #13#10 +
               '    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>' + #13#10 +
               '    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>' + #13#10 +
               '    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>' + #13#10 +
               '    <AllowHardTerminate>true</AllowHardTerminate>' + #13#10 +
               '    <StartWhenAvailable>true</StartWhenAvailable>' + #13#10 +
               '    <RestartOnFailure>' + #13#10 +
               '      <Interval>PT1M</Interval>' + #13#10 +
               '      <Count>999</Count>' + #13#10 +
               '    </RestartOnFailure>' + #13#10 +
               '    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>' + #13#10 +
               '    <IdleSettings>' + #13#10 +
               '      <StopOnIdleEnd>false</StopOnIdleEnd>' + #13#10 +
               '      <RestartOnIdle>false</RestartOnIdle>' + #13#10 +
               '    </IdleSettings>' + #13#10 +
               '    <AllowStartOnDemand>true</AllowStartOnDemand>' + #13#10 +
               '    <Enabled>true</Enabled>' + #13#10 +
               '    <Hidden>true</Hidden>' + #13#10 +
               '    <RunOnlyIfIdle>false</RunOnlyIfIdle>' + #13#10 +
               '    <WakeToRun>false</WakeToRun>' + #13#10 +
               '    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>' + #13#10 +
               '    <Priority>7</Priority>' + #13#10 +
               '  </Settings>' + #13#10 +
               '  <Actions Context="Author">' + #13#10 +
               '    <Exec>' + #13#10 +
               '      <Command>' + ExePath + '</Command>' + #13#10 +
               '      <Arguments>--scheduled</Arguments>' + #13#10 +
               '      <WorkingDirectory>' + ExpandConstant('{app}') + '</WorkingDirectory>' + #13#10 +
               '    </Exec>' + #13#10 +
               '  </Actions>' + #13#10 +
               '</Task>';
    
    SaveStringToFile(XMLFile, TaskXML, False);
  end;
end;
