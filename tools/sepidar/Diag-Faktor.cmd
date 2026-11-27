@echo off
cd /d "%~dp0"
title Hoormand - Sepidar: invoice diagnosis
set "NODE=node"
if exist "%~dp0node.exe" set "NODE=%~dp0node.exe"
echo Reading Sepidar (nothing is sent, nothing is changed) ...
echo.
"%NODE%" sepidar-sync.mjs invdiag > diag-faktor.txt 2>&1
type diag-faktor.txt
echo.
echo The same text is saved in diag-faktor.txt in this folder. Send that file.
pause
