# Start Baseline on this laptop: the backend on http://localhost:8000 and the page on http://localhost:5500
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
Write-Host "Page:    http://localhost:5500/login.html"
Write-Host "Backend: http://localhost:8000  (provider: $env:MODEL_PROVIDER)"
try {
  Push-Location (Join-Path $root "backend")
  & $python -m uvicorn app:app --port 8000
} finally {
  Pop-Location
  Stop-Process -Id $web.Id -Force -ErrorAction SilentlyContinue
}
