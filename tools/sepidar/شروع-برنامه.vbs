' Opens the Hoormand - Sepidar page in the browser (no black window).
' If a file named node.exe sits in this folder it is used, so nothing has to be installed on the computer.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
node = "node"
If fso.FileExists(folder & "\node.exe") Then
  node = """" & folder & "\node.exe"""
ElseIf sh.Run("cmd /c where node", 0, True) <> 0 Then
  MsgBox "Node.js was not found. Put node.exe in this folder (copy it from C:\Program Files\nodejs) or install Node.js from nodejs.org, then open this file again.", 48, "Hoormand"
  WScript.Quit
End If
sh.Run "cmd /c cd /d """ & folder & """ && " & node & " sepidar-sync.mjs ui", 0, False
