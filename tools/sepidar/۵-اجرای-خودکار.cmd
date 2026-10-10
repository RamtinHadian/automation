@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Install it from nodejs.org first. & pause & exit /b 1)
node sepidar-sync.mjs watch --apply
pause
