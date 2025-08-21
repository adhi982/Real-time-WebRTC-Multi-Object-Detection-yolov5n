# Manual IP Update Script - WORKING VERSION

# Step 1: Get current Wi-Fi IP
$currentIP = (Get-NetAdapter | Where-Object {$_.Name -like "*Wi-Fi*" -and $_.Status -eq "Up"} | Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike "169.254.*"}).IPAddress

Write-Host "Current Wi-Fi IP: $currentIP" -ForegroundColor Green

# Step 2: Update docker-compose.yml
Write-Host "Updating docker-compose.yml..." -ForegroundColor Yellow

# Read the file
$content = Get-Content "docker-compose.yml"

# Replace all HOST_IP lines
$updatedContent = $content -replace "HOST_IP=.*", "HOST_IP=$currentIP"

# Write back to file
$updatedContent | Set-Content "docker-compose.yml"

# Step 3: Verify the update
Write-Host "Verification - Updated HOST_IP entries:" -ForegroundColor Cyan
Get-Content docker-compose.yml | Select-String "HOST_IP"

# Step 4: Restart containers
Write-Host "Stopping containers..." -ForegroundColor Yellow
docker-compose down

Write-Host "Starting containers with new IP..." -ForegroundColor Cyan
docker-compose up -d --build

Write-Host "" -ForegroundColor White
Write-Host "=== SYSTEM READY ===" -ForegroundColor Green
Write-Host "Desktop URL: https://$currentIP:3443" -ForegroundColor Cyan
Write-Host "Mobile URL:  https://$currentIP:3443/phone" -ForegroundColor Cyan
