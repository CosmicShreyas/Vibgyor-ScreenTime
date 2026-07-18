' VibgyorSeek Monitoring Client - Hidden Launcher
' This VBScript launches the monitoring client without showing a console window

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Get the directory where this script is located
strScriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Path to the monitoring client executable
strExePath = strScriptDir & "\target\release\monitoring-client.exe"

' Check if the executable exists
If Not objFSO.FileExists(strExePath) Then
    MsgBox "Error: monitoring-client.exe not found at:" & vbCrLf & strExePath, vbCritical, "VibgyorSeek Monitoring"
    WScript.Quit 1
End If

' Launch the executable with window hidden (0 = hidden, 1 = normal, 2 = minimized)
' The False parameter means "don't wait for the program to finish"
objShell.Run """" & strExePath & """", 0, False

' Exit the script
WScript.Quit 0
