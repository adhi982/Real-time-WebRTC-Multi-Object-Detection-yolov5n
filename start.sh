#!/bin/bash
# WebRTC VLM Multi-Object Detection System - Enhanced Start Script

# Default values
MODE="server"
UPDATE_IP=false
SHOW_STATUS=false
SHOW_HELP=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --mode=*)
            MODE="${1#*=}"
            shift
            ;;
        --mode)
            MODE="$2"
            shift 2
            ;;
        --wasm)
            MODE="wasm"
            shift
            ;;
        --update-ip)
            UPDATE_IP=true
            shift
            ;;
        --status)
            SHOW_STATUS=true
            shift
            ;;
        --help|-h)
            SHOW_HELP=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Show help
if [ "$SHOW_HELP" = true ]; then
    echo " WebRTC VLM Multi-Object Detection - Start Script"
    echo ""
    echo "Usage:"
    echo "  ./start.sh                    # Start in server mode"
    echo "  ./start.sh --mode=wasm        # Start in WASM mode"
    echo "  ./start.sh --wasm             # Start in WASM mode (shorthand)"
    echo "  ./start.sh --update-ip        # Update IP and restart"
    echo "  ./start.sh --status           # Show current status"
    echo "  ./start.sh --help             # Show this help"
    echo ""
    echo "Modes:"
    echo "  server - Full AI processing with YOLO backend"
    echo "  wasm   - Lightweight browser-only processing"
    exit 0
fi

echo " Starting WebRTC VLM Multi-Object Detection System..."
echo "Mode: $MODE"
echo "=================================================="

# Show status
if [ "$SHOW_STATUS" = true ]; then
    if docker-compose ps 2>/dev/null | grep -q "Up"; then
        echo " System is running"
        docker-compose ps
    else
        echo " System is not running"
    fi
    exit 0
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo " Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Auto-detect current IP address
echo "Detecting network IP address..."
if command -v hostname &> /dev/null; then
    # Try to get IP on Linux/macOS
    CURRENT_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || hostname -i 2>/dev/null || echo "localhost")
    if [[ "$CURRENT_IP" == "localhost" ]] || [[ -z "$CURRENT_IP" ]]; then
        # Fallback method
        CURRENT_IP=$(ip route get 8.8.8.8 2>/dev/null | awk '{print $7; exit}' || echo "localhost")
    fi
else
    CURRENT_IP="localhost"
fi

echo "Detected IP: $CURRENT_IP"

# Update docker-compose.yml with detected IP
if [[ "$CURRENT_IP" != "localhost" ]]; then
    echo "Updating docker-compose.yml with IP: $CURRENT_IP"
    sed -i.bak "s/HOST_IP=.*/HOST_IP=$CURRENT_IP/g" docker-compose.yml
fi

# Build and start the containers
echo " Building and starting Docker containers..."
docker-compose down 2>/dev/null
docker-compose up --build -d

# Wait for containers to be ready
echo " Waiting for containers to start..."
sleep 5

# Check container status
if docker-compose ps | grep -q "Up"; then
    echo ""
    echo " SUCCESS! System is running!"
    echo "==============================================="
    echo "  Desktop Client: https://$CURRENT_IP:3443"
    echo "  Mobile Client:  https://$CURRENT_IP:3443/phone"
    echo "  Backend API:    http://$CURRENT_IP:8080"
    echo ""
    echo " PHONE CONNECTION:"
    echo "   1. Open desktop client to see QR code"
    echo "   2. Scan QR code with your phone camera"
    echo "   3. Or manually visit: https://$CURRENT_IP:3443/phone"
    echo ""
    echo " Available Commands:"
    echo "   • View logs:     docker-compose logs -f"
    echo "   • Stop system:   docker-compose down"
    echo "   • Update IP:     ./start.sh --update-ip"
    echo "   • Switch mode:   ./start.sh --mode=wasm"
    echo "==============================================="
else
    echo " Failed to start containers. Check logs with: docker-compose logs"
    exit 1
fi
