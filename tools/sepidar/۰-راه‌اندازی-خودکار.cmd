@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on this computer. It is a free helper program this tool needs.
  choice /m "Install it now (needs internet, takes a minute)"
  if errorlevel 2 (
    echo Install it from nodejs.org and run this file again.
    pause
    exit /b 1
  )
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo Done. Close this window and double-click this file again.
  pause
  exit /b 0
)
node sepidar-sync.mjs setup
pause
