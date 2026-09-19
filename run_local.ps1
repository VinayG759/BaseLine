# Start Baseline on this laptop: the backend on port 8000 and the page on port 5500.
# Both listen on the Wi-Fi too, so a phone on the same network can open the printed phone link.
#
#   powershell -ExecutionPolicy Bypass -File .\run_local.ps1
#
# Settings (AWS table and bucket, model provider, OpenRouter key) come from backend\.env.
# Press Ctrl+C to stop the backend; the page server stops with it.

$root = $PSScriptRoot
$envFile = Join-Path $root "backend\.env"
if (-not (Test-Path $envFile)) { Write-Error "backend\.env not found"; exit 1 }

# Load KEY=VALUE lines from .env into this session (comments and blank lines skipped; values never printed).
foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
    Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2]
  }
}

$python = Join-Path $root "backend\.venv\Scripts\python.exe"
$web = Start-Process $python -ArgumentList "-m", "http.server", "5500" -WorkingDirectory (Join-Path $root "web") -PassThru -WindowStyle Hidden
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -like "Wi-Fi*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
Write-Host "Page:    http://localhost:5500/login.html"
if ($ip) { Write-Host "Phone:   http://${ip}:5500/login.html  (same Wi-Fi)" }
Write-Host "Backend: http://localhost:8000  (provider: $env:MODEL_PROVIDER)"
try {
  Push-Location (Join-Path $root "backend")
  & $python -m uvicorn app:app --host 0.0.0.0 --port 8000
} finally {
  Pop-Location
  Stop-Process -Id $web.Id -Force -ErrorAction SilentlyContinue
}
