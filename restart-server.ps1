# PowerShell script to restart the server on port 5000

Write-Host "Finding process on port 5000..." -ForegroundColor Yellow

# Find the process ID using port 5000
$process = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -First 1

if ($process) {
    Write-Host "Found process with PID: $process" -ForegroundColor Green
    Write-Host "Stopping process..." -ForegroundColor Yellow
    Stop-Process -Id $process -Force
    Write-Host "Process stopped successfully!" -ForegroundColor Green
    Start-Sleep -Seconds 2
} else {
    Write-Host "No process found on port 5000" -ForegroundColor Cyan
}

Write-Host "Building project..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -eq 0) {
    Write-Host "Build successful!" -ForegroundColor Green
    Write-Host "Starting server..." -ForegroundColor Yellow
    npm start
} else {
    Write-Host "Build failed!" -ForegroundColor Red
}
