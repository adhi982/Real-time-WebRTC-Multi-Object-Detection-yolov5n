#!/usr/bin/env pwsh
# WebRTC VLM Multi-Object Detection - Enhanced Start Script
param(
    [string]$Mode = "server",           # server, wasm
    [switch]$UpdateIP,                  # Update IP only
    [switch]$Status,                    # Show status
    [switch]$Help                       # Show help
)

# Help text
if ($Help) {
    Write-Host " WebRTC VLM Multi-Object Detection - Start Script" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\start.ps1                    # Start in server mode"
    Write-Host "  .\start.ps1 -Mode wasm         # Start in WASM mode"
    Write-Host "  .\start.ps1 -UpdateIP          # Update IP and restart"
    Write-Host "  .\start.ps1 -Status            # Show current status"
    Write-Host "  .\start.ps1 -Help              # Show this help"
    Write-Host ""
    Write-Host "Modes:" -ForegroundColor Yellow
    Write-Host "  server - Full AI processing with YOLO backend"
    Write-Host "  wasm   - Lightweight browser-only processing"
    exit 0
}

Write-Host " WebRTC VLM Multi-Object Detection System" -ForegroundColor Cyan
Write-Host "Mode: $Mode" -ForegroundColor Yellow
Write-Host "===============================================" -ForegroundColor Cyan

# Status check
if ($Status) {
    $containerStatus = docker-compose ps 2>$null
    if ($containerStatus -match "Up") {
        Write-Host " System is running" -ForegroundColor Green
        docker-compose ps
    } else {
        Write-Host " System is not running" -ForegroundColor Red
    }
    exit 0
}

# Check if Docker is installed
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host " Docker is not installed. Please install Docker first." -ForegroundColor Red
    exit 1
}

# Check if Docker Compose is installed
if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    Write-Host " Docker Compose is not installed. Please install Docker Compose first." -ForegroundColor Red
    exit 1
}

# Auto-detect current IP address
Write-Host " Detecting network IP address..." -ForegroundColor Yellow

$currentIP = $null
if ($IsWindows -or $env:OS -eq "Windows_NT") {
    # Windows IP detection
    $currentIP = (Get-NetAdapter | Where-Object {$_.Name -like "*Wi-Fi*" -and $_.Status -eq "Up"} | Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike "169.254.*"}).IPAddress
    if (-not $currentIP) {
        $currentIP = (Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp | Where-Object {$_.InterfaceAlias -notlike "*Loopback*"} | Select-Object -First 1).IPAddress
    }
} else {
    # Linux/macOS IP detection
    try {
        $currentIP = (hostname -I 2>$null).Split()[0]
        if (-not $currentIP) {
            $currentIP = (ip route get 8.8.8.8 2>$null | grep -oP 'src \K\S+')
        }
    } catch {
        $currentIP = "localhost"
    }
}

if (-not $currentIP) {
    $currentIP = "localhost"
}

Write-Host " Detected IP: $currentIP" -ForegroundColor Green

# Update docker-compose.yml with detected IP
if ($currentIP -ne "localhost") {
    Write-Host " Updating docker-compose.yml with IP: $currentIP" -ForegroundColor Yellow
    
    $dockerCompose = Get-Content "docker-compose.yml" -Raw
    $updatedCompose = $dockerCompose -replace "HOST_IP=.*", "HOST_IP=$currentIP"
    $updatedCompose | Set-Content "docker-compose.yml"
}

# Build and start the containers
Write-Host " Building and starting Docker containers..." -ForegroundColor Cyan
docker-compose down 2>$null
docker-compose up --build -d

# Wait for containers to be ready
Write-Host " Waiting for containers to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Check container status
$containerStatus = docker-compose ps --format "table {{.Name}}\t{{.Status}}"
if ($containerStatus -match "Up") {
    Write-Host ""
    Write-Host " SUCCESS! System is running!" -ForegroundColor Green
    Write-Host "===============================================" -ForegroundColor Cyan
    Write-Host "  Desktop Client: https://$currentIP:3443" -ForegroundColor Cyan
    Write-Host " Mobile Client:  https://$currentIP:3443/phone" -ForegroundColor Cyan
    Write-Host " Backend API:    http://$currentIP:8080" -ForegroundColor Cyan
    Write-Host ""
    Write-Host " PHONE CONNECTION:" -ForegroundColor Yellow
    Write-Host "   1. Open desktop client to see QR code" -ForegroundColor White
    Write-Host "   2. Scan QR code with your phone camera" -ForegroundColor White
    Write-Host "   3. Or manually visit: https://$currentIP:3443/phone" -ForegroundColor White
    Write-Host ""
    Write-Host " Available Commands:" -ForegroundColor Yellow
    Write-Host "   • View logs:     docker-compose logs -f" -ForegroundColor White
    Write-Host "   • Stop system:   docker-compose down" -ForegroundColor White
    Write-Host "   • Update IP:     .\start.ps1 -UpdateIP" -ForegroundColor White
    Write-Host "   • Switch mode:   .\start.ps1 -Mode wasm" -ForegroundColor White
    Write-Host "===============================================" -ForegroundColor Cyan
} else {
    Write-Host " Failed to start containers. Check logs with: docker-compose logs" -ForegroundColor Red
    exit 1
}
