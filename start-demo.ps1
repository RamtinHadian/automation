# Starts the local demo (http://localhost:8095) and opens it in the browser.
# Double-click start-demo.cmd, or run:  powershell -ExecutionPolicy Bypass -File start-demo.ps1
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

# demo.env holds throw-away secrets for the demo only (it is not committed).
if (-not (Test-Path 'demo.env')) {
  # Fixed throw-away values: the database keeps the password it was first created with, so they must not change.
  @(
    'DB_PASSWORD=demo-db-pass',
    'JWT_SECRET=demo-jwt-secret-1234567890',
    'ADMIN_PASSWORD=demo-admin-pass',
    'PORT=8095',
    'DEMO=1',
    'DEMO_RESET_HOURS=48'
  ) | Set-Content -Encoding ascii 'demo.env'
  Write-Host 'Created demo.env'
}

# Start Docker Desktop when it is not running.
cmd /c "docker info >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Starting Docker Desktop...'
  Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep 5
    cmd /c "docker info >nul 2>&1"
    if ($LASTEXITCODE -eq 0) { break }
  }
}
cmd /c "docker info >nul 2>&1"
if ($LASTEXITCODE -ne 0) { Write-Host 'Docker did not start.'; exit 1 }

docker compose -p autodemo --env-file demo.env up -d --build
if ($LASTEXITCODE -ne 0) { Write-Host 'docker compose failed.'; exit 1 }
for ($i = 0; $i -lt 30; $i++) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 'http://localhost:8095/api/health'
    if ($r.StatusCode -eq 200) { break }
  } catch { Start-Sleep 2 }
}
Start-Process 'http://localhost:8095'
Write-Host 'Demo is open at http://localhost:8095'
