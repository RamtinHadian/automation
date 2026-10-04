# Keeps the two local stacks (the main one on :8080 and the demo on :8095) on the newest committed version.
# Every 5 seconds (the demo first, so it is ready sooner): when HEAD is different from the commit a stack was last built from, that stack is rebuilt.
# Start it with start-local-update.cmd (it also installs itself in the Windows Startup folder).
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
$stacks = @(
  @{ Name = 'autodemo'; Args = @('compose', '-p', 'autodemo', '--env-file', 'demo.env', 'up', '-d', '--build') },
  @{ Name = 'automation'; Args = @('compose', 'up', '-d', '--build') }
)
while ($true) {
  try {
    $head = (git rev-parse HEAD 2>$null)
    if ($head) {
      foreach ($s in $stacks) {
        $marker = Join-Path $PSScriptRoot (".built-local-" + $s.Name)
        $built = if (Test-Path $marker) { (Get-Content $marker -Raw).Trim() } else { '' }
        # only touch a stack that is already running (the user may have stopped it on purpose)
        $running = (docker ps --filter "label=com.docker.compose.project=$($s.Name)" --format '{{.Names}}' 2>$null)
        if ($running -and $built -ne $head) {
          Write-Host "$(Get-Date -Format s) rebuilding $($s.Name) -> $($head.Substring(0, 7))"
          & docker @($s.Args) 2>&1 | Out-Null
          if ($LASTEXITCODE -eq 0) { Set-Content -Path $marker -Value $head -Encoding ascii }
        }
      }
    }
  } catch { Write-Host $_ }
  Start-Sleep -Seconds 5
}
