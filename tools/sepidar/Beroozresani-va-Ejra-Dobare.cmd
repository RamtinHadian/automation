@echo off
cd /d "%~dp0"
title Hoormand - Sepidar program: update and start again
set "NODE=node"
if exist "%~dp0node.exe" set "NODE=%~dp0node.exe"
echo.
echo ===== Beroozresani-ye barnameh-ye Sepidar-e Hoormand =====
echo.
echo [1/3] Bastan-e barnameh-ye dar hal-e ejra ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*sepidar-sync.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
timeout /t 3 /nobreak >nul
echo.
echo [2/3] Gereftan-e file-haye taze az Hoormand ...
"%NODE%" sepidar-sync.mjs update
echo.
echo [3/3] Roshan kardan-e dobareh-ye barnameh ...
schtasks /Run /TN HoormandSepidarWatch >nul 2>nul
if errorlevel 1 start "" /b cmd /c ""%NODE%" sepidar-sync.mjs watch --apply >> sepidar.log 2>&1"
timeout /t 5 /nobreak >nul
echo.
echo Tamam shod. Hala dar Hoormand rooye neshan-e sabz-e "Sepidar" bala-ye safheh click konid;
echo bayad noskheh-ye barnameh neveshteh shodeh bashad.
echo Agar noskheh neveshteh nashod, chand daghigheh sabr konid va dobareh negah konid.
echo (Agar dar hamin panjareh khata-ye "update" didid, an khat ra baraye poshtibani befrestid.)
echo.
pause
