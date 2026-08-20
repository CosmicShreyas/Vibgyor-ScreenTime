' ScreenTime Monitoring Client - Hidden Launcher
' This VBScript launches the monitoring client without showing a console window
' Use this if the executable still shows a window

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Get the directory where this script is located
strScriptPath = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Path to the executable
strExePath = strScriptPath & "\monitoring-client.exe"

' Check if executable exists
If Not objFSO.FileExists(strExePath) Then
    MsgBox "Error: ScreenTime Monitoring not found!" & vbCrLf & vbCrLf & _
           "Expected location: " & strExePath, vbCritical, "ScreenTime Monitoring"
    WScript.Quit 1
End If

' Launch the executable hidden (0 = hidden window)
' Set working directory to the script's directory
objShell.CurrentDirectory = strScriptPath
objShell.Run """" & strExePath & """", 0, False

' Exit the script
WScript.Quit 0
