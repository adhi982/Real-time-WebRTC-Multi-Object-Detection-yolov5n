#!/bin/bash
# Benchmark script for WebRTC VLM Multi-Object Detection
# Real-time metrics collection script

set -e

# Default values
DURATION=30
MODE="server"
OUTPUT_FILE="metrics.json"
API_URL="http://localhost:8080"
FRONTEND_URL="http://localhost:3000"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --duration)
      DURATION="$2"
      shift 2
      ;;
    --mode)
      MODE="$2"
      shift 2
      ;;
    --output)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    --api-url)
      API_URL="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo "Options:"
      echo "  --duration SECONDS    Duration of benchmark (default: 30)"
      echo "  --mode MODE          Benchmark mode: server|e2e (default: server)"
      echo "  --output FILE        Output JSON file (default: metrics.json)"
      echo "  --api-url URL        Backend API URL (default: http://localhost:8080)"
      echo "  -h, --help           Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option $1"
      exit 1
      ;;
  esac
done

echo "🚀 Starting WebRTC VLM Benchmark"
echo "Duration: ${DURATION}s | Mode: ${MODE} | Output: ${OUTPUT_FILE}"
echo "API URL: ${API_URL}"
echo "----------------------------------------"

# Create results directory
RESULTS_DIR="$(dirname "$OUTPUT_FILE")"
mkdir -p "$RESULTS_DIR"

# Temporary files for metrics collection
LATENCY_FILE=$(mktemp)
SUCCESS_FILE=$(mktemp)
BANDWIDTH_FILE=$(mktemp)

# Cleanup function
cleanup() {
  echo "🧹 Cleaning up temporary files..."
  rm -f "$LATENCY_FILE" "$SUCCESS_FILE" "$BANDWIDTH_FILE"
}
trap cleanup EXIT

# Check if backend is running
echo "🔍 Checking backend availability..."
if ! curl -s "$API_URL" > /dev/null; then
  echo "❌ Backend not available at $API_URL"
  echo "Please start the backend with: docker-compose up -d"
  exit 1
fi
echo "✅ Backend is running"

# Function to test server-only performance
run_server_benchmark() {
  echo "🖥️ Running server-only benchmark..."
  
  # Create a simple test image (base64 encoded 1x1 pixel)
  TEST_IMAGE_B64="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wA="
  
  local start_time=$(date +%s.%N)
  local end_time=$start_time
  local target_end_time=$(echo "$start_time + $DURATION" | bc)
  local request_count=0
  local success_count=0
  local total_latency=0
  local latencies=()
  
  echo "⏱️ Running for ${DURATION} seconds..."
  
  while (( $(echo "$end_time < $target_end_time" | bc -l) )); do
    local req_start=$(date +%s.%N)
    
    # Make detection request
    local response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST "$API_URL/detect" \
      -H "Content-Type: application/json" \
      -d "{\"image\":\"$TEST_IMAGE_B64\",\"queries\":[\"person\",\"car\",\"book\",\"laptop\"]}")
    
    local req_end=$(date +%s.%N)
    local latency=$(echo "($req_end - $req_start) * 1000" | bc)
    
    # Parse response
    local body=$(echo "$response" | grep -v "HTTPSTATUS")
    local status=$(echo "$response" | grep "HTTPSTATUS" | cut -d: -f2)
    
    request_count=$((request_count + 1))
    
    if [[ "$status" == "200" ]] && echo "$body" | grep -q "detections"; then
      success_count=$((success_count + 1))
      latencies+=("$latency")
      total_latency=$(echo "$total_latency + $latency" | bc)
    fi
    
    # Brief pause to avoid overwhelming the server
    sleep 0.01
    
    end_time=$(date +%s.%N)
    
    # Progress indicator
    if (( request_count % 10 == 0 )); then
      local elapsed=$(echo "$end_time - $start_time" | bc)
      echo -n "📊 Progress: ${request_count} requests in ${elapsed}s... "
      echo ""
    fi
  done
  
  # Calculate statistics
  local actual_duration=$(echo "$end_time - $start_time" | bc)
  local fps=$(echo "scale=2; $request_count / $actual_duration" | bc)
  local success_rate=$(echo "scale=2; $success_count * 100 / $request_count" | bc)
  local avg_latency=$(echo "scale=2; $total_latency / $success_count" | bc)
  
  # Calculate percentiles
  local sorted_latencies=($(printf '%s\n' "${latencies[@]}" | sort -n))
  local p95_index=$(echo "($success_count * 95 / 100)" | bc)
  local median_index=$(echo "$success_count / 2" | bc)
  
  local p95_latency=${sorted_latencies[$p95_index]}
  local median_latency=${sorted_latencies[$median_index]}
  
  # Generate metrics JSON
  cat > "$OUTPUT_FILE" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")",
  "benchmark_mode": "server",
  "duration_seconds": $actual_duration,
  "total_requests": $request_count,
  "successful_requests": $success_count,
  "success_rate_percent": $success_rate,
  "requests_per_second": $fps,
  "latency_ms": {
    "median": $median_latency,
    "p95": $p95_latency,
    "average": $avg_latency,
    "samples": $success_count
  },
  "server_latency_ms": {
    "median": $median_latency,
    "p95": $p95_latency,
    "average": $avg_latency
  },
  "processed_fps": $fps,
  "notes": "Server-only benchmark using synthetic 1x1 test image"
}
EOF

  echo "✅ Server benchmark completed!"
  echo "📈 Results:"
  echo "   • Total requests: $request_count"
  echo "   • Successful: $success_count (${success_rate}%)"
  echo "   • Requests/sec: $fps"
  echo "   • Median latency: ${median_latency}ms"
  echo "   • P95 latency: ${p95_latency}ms"
}

# Function to run end-to-end benchmark (would require browser automation)
run_e2e_benchmark() {
  echo "🌐 End-to-end benchmark mode"
  echo "⚠️ E2E mode requires manual operation:"
  echo "   1. Open $FRONTEND_URL in your browser"
  echo "   2. Connect your phone and start detection"
  echo "   3. Let it run for ${DURATION} seconds"
  echo "   4. Use the 'Export metrics.json' button in the UI"
  echo ""
  echo "For automated E2E testing, consider using Selenium or Playwright"
  
  # Create placeholder metrics file
  cat > "$OUTPUT_FILE" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")",
  "benchmark_mode": "e2e",
  "duration_seconds": $DURATION,
  "note": "Please use the frontend interface for E2E metrics collection",
  "frontend_url": "$FRONTEND_URL",
  "instructions": [
    "1. Open $FRONTEND_URL",
    "2. Connect phone camera",
    "3. Start detection",
    "4. Run for ${DURATION}s",
    "5. Export metrics.json from UI"
  ]
}
EOF
}

# Run benchmark based on mode
case $MODE in
  server)
    run_server_benchmark
    ;;
  e2e)
    run_e2e_benchmark
    ;;
  *)
    echo "❌ Unknown mode: $MODE"
    echo "Available modes: server, e2e"
    exit 1
    ;;
esac

echo ""
echo "📊 Metrics saved to: $OUTPUT_FILE"
echo "🎉 Benchmark completed successfully!"

# Display JSON if file is small enough
if [[ -f "$OUTPUT_FILE" ]] && [[ $(wc -c < "$OUTPUT_FILE") -lt 2048 ]]; then
  echo ""
  echo "📋 Results summary:"
  cat "$OUTPUT_FILE" | jq . 2>/dev/null || cat "$OUTPUT_FILE"
fi
    echo "Success - Latency: ${LATENCY}s"
    
    # Extract number of detections
    NUM_DETECTIONS=$(echo $RESPONSE | grep -o '"detections":\[.*\]' | grep -o '\[.*\]' | grep -o ',' | wc -l)
    NUM_DETECTIONS=$((NUM_DETECTIONS + 1))
    
    # Update statistics
    TOTAL_LATENCY=$(echo "$TOTAL_LATENCY + $LATENCY" | bc)
    
    if (( $(echo "$LATENCY > $MAX_LATENCY" | bc -l) )); then
      MAX_LATENCY=$LATENCY
    fi
    
    if (( $(echo "$LATENCY < $MIN_LATENCY" | bc -l) )); then
      MIN_LATENCY=$LATENCY
    fi
    
    SUCCESSFUL_REQUESTS=$((SUCCESSFUL_REQUESTS + 1))
    
    # Save detailed results
    echo "Test $iteration: Latency=${LATENCY}s, Detections=$NUM_DETECTIONS" >> "$RESULTS_DIR/detailed_results.txt"
  else
    echo "Failed - Error: $RESPONSE"
    echo "Test $iteration: Failed - Error: $RESPONSE" >> "$RESULTS_DIR/detailed_results.txt"
  fi
}

# Check if the API is available
echo "Checking if the backend API is available..."
if ! curl -s "$API_URL" > /dev/null; then
  echo "Error: Backend API is not available at $API_URL"
  echo "Make sure the system is running before running benchmarks."
  exit 1
fi

# Download test images if they don't exist
TEST_IMAGES_DIR="test_images"
mkdir -p $TEST_IMAGES_DIR

if [ ! -f "$TEST_IMAGES_DIR/street.jpg" ]; then
  echo "Downloading test images..."
  curl -s -o "$TEST_IMAGES_DIR/street.jpg" "https://source.unsplash.com/random/1280x720/?street"
  curl -s -o "$TEST_IMAGES_DIR/people.jpg" "https://source.unsplash.com/random/1280x720/?people"
  curl -s -o "$TEST_IMAGES_DIR/animals.jpg" "https://source.unsplash.com/random/1280x720/?animals"
fi

# Run benchmark tests
echo "Starting benchmark with $TEST_ITERATIONS iterations for each image..."
echo "" > "$RESULTS_DIR/detailed_results.txt"

for image in "$TEST_IMAGES_DIR"/*.jpg; do
  IMAGE_NAME=$(basename "$image")
  echo "Testing with image: $IMAGE_NAME"
  echo "Image: $IMAGE_NAME" >> "$RESULTS_DIR/detailed_results.txt"
  
  for i in $(seq 1 $TEST_ITERATIONS); do
    test_detection $i "$image"
  done
  
  echo "" >> "$RESULTS_DIR/detailed_results.txt"
done

# Calculate average latency
if [ $SUCCESSFUL_REQUESTS -gt 0 ]; then
  AVG_LATENCY=$(echo "scale=3; $TOTAL_LATENCY / $SUCCESSFUL_REQUESTS" | bc)
else
  AVG_LATENCY="N/A"
  MIN_LATENCY="N/A"
  MAX_LATENCY="N/A"
fi

# Display summary
echo ""
echo "Benchmark Summary:"
echo "=================="
echo "Total Requests: $((TEST_ITERATIONS * 3))"
echo "Successful Requests: $SUCCESSFUL_REQUESTS"
echo "Failed Requests: $((TEST_ITERATIONS * 3 - SUCCESSFUL_REQUESTS))"
echo "Average Latency: ${AVG_LATENCY}s"
echo "Minimum Latency: ${MIN_LATENCY}s"
echo "Maximum Latency: ${MAX_LATENCY}s"

# Save summary to file
echo "Benchmark Summary:" > "$RESULTS_DIR/summary.txt"
echo "=================" >> "$RESULTS_DIR/summary.txt"
echo "Total Requests: $((TEST_ITERATIONS * 3))" >> "$RESULTS_DIR/summary.txt"
echo "Successful Requests: $SUCCESSFUL_REQUESTS" >> "$RESULTS_DIR/summary.txt"
echo "Failed Requests: $((TEST_ITERATIONS * 3 - SUCCESSFUL_REQUESTS))" >> "$RESULTS_DIR/summary.txt"
echo "Average Latency: ${AVG_LATENCY}s" >> "$RESULTS_DIR/summary.txt"
echo "Minimum Latency: ${MIN_LATENCY}s" >> "$RESULTS_DIR/summary.txt"
echo "Maximum Latency: ${MAX_LATENCY}s" >> "$RESULTS_DIR/summary.txt"

echo "Benchmark complete! Results saved in $RESULTS_DIR/"
