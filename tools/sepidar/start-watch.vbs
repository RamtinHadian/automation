' Starts the program that keeps Hoormand and Sepidar linked, hidden and independent of any window (it goes on after every window is closed).
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
node = "node"
If fso.FileExists(folder & "
ode.exe") Then node = """" & folder & "
ode.exe"""
sh.Run "cmd /c cd /d """ & folder & """ && " & node & " sepidar-sync.mjs watch --apply >> sepidar.log 2>&1", 0, False
