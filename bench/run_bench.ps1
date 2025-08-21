# PowerShell Benchmark script for WebRTC VLM Multi-Object Detection
# Real-time metrics collection script

param(
    [int]$Duration = 30,
    [string]$Mode = "server",
    [string]$Output = "metrics.json",
    [string]$ApiUrl = "http://localhost:8080",
    [switch]$Help
)

if ($Help) {
    Write-Host "Usage: .\run_bench.ps1 [OPTIONS]"
    Write-Host "Options:"
    Write-Host "  -Duration SECONDS    Duration of benchmark (default: 30)"
    Write-Host "  -Mode MODE          Benchmark mode: server|e2e (default: server)"
    Write-Host "  -Output FILE        Output JSON file (default: metrics.json)"
    Write-Host "  -ApiUrl URL         Backend API URL (default: http://localhost:8080)"
    Write-Host "  -Help               Show this help message"
    exit 0
}

Write-Host "🚀 Starting WebRTC VLM Benchmark" -ForegroundColor Green
Write-Host "Duration: ${Duration}s | Mode: ${Mode} | Output: ${Output}"
Write-Host "API URL: ${ApiUrl}"
Write-Host "----------------------------------------"

# Create results directory
$ResultsDir = Split-Path $Output -Parent
if ($ResultsDir -and !(Test-Path $ResultsDir)) {
    New-Item -ItemType Directory -Path $ResultsDir -Force | Out-Null
}

# Check if backend is running
Write-Host "🔍 Checking backend availability..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri $ApiUrl -Method GET -TimeoutSec 5
    Write-Host "✅ Backend is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Backend not available at $ApiUrl" -ForegroundColor Red
    Write-Host "Please start the backend with: docker-compose up -d"
    exit 1
}

function Run-ServerBenchmark {
    Write-Host "Server-only benchmark..." -ForegroundColor Cyan
    
    # Create a simple test image (minimal JPEG)
    $testImageB64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAQABAAD//gA7Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcgSlBFRyB2NjIpLCBxdWFsaXR5ID0gOTAK/9sAQwADAgIDAgIDAwMDBAMDBAUIBQUEBAUKBwcGCAwKDAwLCgsLDQ4SEA0OEQ4LCxAWEBETFBUVFQwPFxgWFBgSFBUU/9sAQwEDBAQFBAUJBQUJFA0LDRQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8A/fyiiigAooooA//Z"
    
    $startTime = Get-Date
    $targetEndTime = $startTime.AddSeconds($Duration)
    $requestCount = 0
    $successCount = 0
    $latencies = @()
    
    Write-Host "⏱️ Running for ${Duration} seconds..." -ForegroundColor Yellow
    
    while ((Get-Date) -lt $targetEndTime) {
        $reqStart = Get-Date
        
        try {
            # Prepare request body
            $body = @{
                image = $testImageB64
                queries = @("person", "car", "book", "laptop")
            } | ConvertTo-Json -Depth 3
            
            # Make detection request
            $response = Invoke-WebRequest -Uri "$ApiUrl/detect" -Method POST `
                -ContentType "application/json" -Body $body -TimeoutSec 10
            
            $reqEnd = Get-Date
            $latency = ($reqEnd - $reqStart).TotalMilliseconds
            
            $requestCount++
            
            if ($response.StatusCode -eq 200) {
                $responseData = $response.Content | ConvertFrom-Json
                if ($responseData.detections) {
                    $successCount++
                    $latencies += $latency
                }
            }
        } catch {
            $requestCount++
            Write-Host "Request failed: $($_.Exception.Message)" -ForegroundColor Red
        }
        
        # Brief pause to avoid overwhelming the server
        Start-Sleep -Milliseconds 10
        
        # Progress indicator
        if ($requestCount % 10 -eq 0) {
            $elapsed = ((Get-Date) - $startTime).TotalSeconds
            Write-Host "📊 Progress: $requestCount requests in ${elapsed}s..." -ForegroundColor Gray
        }
    }
    
    # Calculate statistics
    $actualDuration = ((Get-Date) - $startTime).TotalSeconds
    $fps = [math]::Round($requestCount / $actualDuration, 2)
    $successRate = if ($requestCount -gt 0) { [math]::Round($successCount * 100 / $requestCount, 2) } else { 0 }
    
    # Calculate percentiles
    $sortedLatencies = $latencies | Sort-Object
    $medianLatency = if ($sortedLatencies.Count -gt 0) {
        $midIndex = [math]::Floor($sortedLatencies.Count / 2)
        $sortedLatencies[$midIndex]
    } else { 0 }
    
    $p95Index = [math]::Floor($sortedLatencies.Count * 0.95)
    $p95Latency = if ($sortedLatencies.Count -gt 0 -and $p95Index -lt $sortedLatencies.Count) {
        $sortedLatencies[$p95Index]
    } else { 0 }
    
    $avgLatency = if ($latencies.Count -gt 0) {
        [math]::Round(($latencies | Measure-Object -Average).Average, 2)
    } else { 0 }
    
    # Generate metrics JSON
    $metricsData = @{
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        benchmark_mode = "server"
        duration_seconds = [math]::Round($actualDuration, 2)
        total_requests = $requestCount
        successful_requests = $successCount
        success_rate_percent = $successRate
        requests_per_second = $fps
        latency_ms = @{
            median = [math]::Round($medianLatency, 1)
            p95 = [math]::Round($p95Latency, 1)
            average = $avgLatency
            samples = $latencies.Count
        }
        server_latency_ms = @{
            median = [math]::Round($medianLatency, 1)
            p95 = [math]::Round($p95Latency, 1)
            average = $avgLatency
        }
        processed_fps = $fps
        notes = "Server-only benchmark using synthetic 1x1 test image"
    }
    
    $metricsData | ConvertTo-Json -Depth 4 | Out-File -FilePath $Output -Encoding UTF8
    
    Write-Host "✅ Server benchmark completed!" -ForegroundColor Green
    Write-Host "Results:" -ForegroundColor Cyan
    Write-Host "   - Total requests: $requestCount"
    Write-Host "   - Successful: $successCount ($successRate%)"
    Write-Host "   - Requests/sec: $fps"
    Write-Host "   - Median latency: ${medianLatency}ms"
    Write-Host "   - P95 latency: ${p95Latency}ms"
}

function Run-E2EBenchmark {
    Write-Host "🌐 End-to-end benchmark mode" -ForegroundColor Cyan
    Write-Host "⚠️ E2E mode requires manual operation:" -ForegroundColor Yellow
    Write-Host "   1. Open http://localhost:3000 in your browser"
    Write-Host "   2. Connect your phone and start detection"
    Write-Host "   3. Let it run for ${Duration} seconds"
    Write-Host "   4. Use the 'Export metrics.json' button in the UI"
    Write-Host ""
    Write-Host "For automated E2E testing, consider using Selenium or Playwright"
    
    # Create placeholder metrics file
    $metricsData = @{
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        benchmark_mode = "e2e"
        duration_seconds = $Duration
        note = "Please use the frontend interface for E2E metrics collection"
        frontend_url = "http://localhost:3000"
        instructions = @(
            "1. Open http://localhost:3000",
            "2. Connect phone camera",
            "3. Start detection",
            "4. Run for ${Duration}s",
            "5. Export metrics.json from UI"
        )
    }
    
    $metricsData | ConvertTo-Json -Depth 4 | Out-File -FilePath $Output -Encoding UTF8
}

# Run benchmark based on mode
switch ($Mode.ToLower()) {
    "server" {
        Run-ServerBenchmark
    }
    "e2e" {
        Run-E2EBenchmark
    }
    default {
        Write-Host "❌ Unknown mode: $Mode" -ForegroundColor Red
        Write-Host "Available modes: server, e2e"
        exit 1
    }
}

Write-Host ""
Write-Host "Metrics saved to: $Output" -ForegroundColor Green
Write-Host "Benchmark completed successfully!" -ForegroundColor Green

# Display JSON results summary
if (Test-Path $Output) {
    $fileSize = (Get-Item $Output).Length
    if ($fileSize -lt 2048) {
        Write-Host ""
        Write-Host "Results summary:" -ForegroundColor Cyan
        Get-Content $Output | ConvertFrom-Json | ConvertTo-Json -Depth 4
    }
}
