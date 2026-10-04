@echo off
rem Opens the Hoormand installer panel (needs Node.js). The page runs only on this computer.
cd /d "%~dp0installer"
if not exist node_modules ( echo Installing the panel's libraries, one time only... & call npm install --no-audit --no-fund )
start "" http://127.0.0.1:7077
node server.js || pause
