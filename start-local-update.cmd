@echo off
rem Starts the local auto-rebuild in the background and puts itself into the Windows Startup folder.
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
> "%STARTUP%\hoormand-local-update.cmd" echo @echo off
>> "%STARTUP%\hoormand-local-update.cmd" echo start "" /min powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0local-update.ps1"
start "" /min powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0local-update.ps1"
echo Local auto-update started.
