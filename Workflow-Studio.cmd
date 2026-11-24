@echo off
chcp 65001 >nul
title Hoormand Workflow Studio
cd /d "%~dp0server"
echo.
echo  Sakhte Gardeshkar (Workflow Studio) is starting...
echo  A browser page will open. Close this window to stop it.
echo.
go run ./cmd/wfpack studio
pause
