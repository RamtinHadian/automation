@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Hoormand - Sepidar program: update and start again
set "NODE=node"
if exist "%~dp0node.exe" set "NODE=%~dp0node.exe"
echo.
echo ===== به‌روزرسانی برنامهٔ سپیدار هورمند =====
echo.
echo [1/3] بستن برنامهٔ در حال اجرا ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*sepidar-sync.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
timeout /t 3 /nobreak >nul
echo.
echo [2/3] گرفتن فایل‌های تازه از هورمند ...
"%NODE%" sepidar-sync.mjs update
echo.
echo [3/3] روشن کردن دوبارهٔ برنامه ...
if exist "%~dp0نگهبان.vbs" wscript "%~dp0نگهبان.vbs"
if not exist "%~dp0نگهبان.vbs" start "" /b cmd /c ""%NODE%" sepidar-sync.mjs watch --apply >> sepidar.log 2>&1"
timeout /t 5 /nobreak >nul
echo.
echo تمام شد. حالا در هورمند روی نشان سبز «سپیدار» بالای صفحه کلیک کنید؛ باید نسخهٔ برنامه نوشته شده باشد.
echo اگر نسخه نوشته نشد، چند دقیقه صبر کنید و دوباره نگاه کنید.
echo (اگر در همین پنجره خطای «بروزرسانی انجام نشد» دیدید، آن خط را برای پشتیبان بفرستید.)
echo.
pause
