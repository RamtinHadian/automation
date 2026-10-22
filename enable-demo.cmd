@echo off
rem Turns a Hoormand server into the public demo with the IT sample data (asks for the server's SSH login, needs Node.js).
chcp 65001 >nul
cd /d "%~dp0installer"
if not exist node_modules ( echo Installing the libraries, one time only... & call npm install --no-audit --no-fund )
node enable-demo.cjs
echo.
pause
