#  Real-time WebRTC VLM Multi-Object Detection

AI-powered real-time object detection system with WebRTC video streaming ## 
 Architecture & Docker Components

This system consists of two main ## 🔧 Docker Commands

### **Complete System (Frontend + Backend)**
```bash
# Start both services
docker-compose up -d

# View logs from both services
docker-compose logs -f

# Stop both services
docker-compose down

# Rebuild and restart
docker-compose up --build -d
```

### **Individual Service Management**
```bash
# Frontend only
docker-compose up frontend -d
docker-compose logs frontend -f

# Backend only  
docker-compose up backend -d
docker-compose logs backend -f

# Restart specific service
docker-compose restart frontend
docker-compose restart backend
```

### **Development & Debugging**
```bash
# View container status
docker-compose ps

# Execute commands inside containers
docker-compose exec frontend /bin/sh
docker-compose exec backend /bin/bash

# View resource usage
docker stats admybrand-frontend-1 admybrand-backend-1

# Clean up everything
docker-compose down -v --rmi all
```

---

##  System Requirementsker services:

### **Frontend Service (React + WebRTC Signaling)**
- **Container**: `admybrand-frontend`
- **Technology**: React.js + Express.js + Socket.IO
- **Ports**: 
  - `3000` - HTTP server
  - `3443` - HTTPS server (main access)
- **Features**:
  - WebRTC signaling server
  - Mobile camera interface
  - Desktop detection dashboard
  - Real-time video streaming
  - QR code generation for phone connection

### **Backend Service (AI Object Detection)**
- **Container**: `admybrand-backend`
- **Technology**: Python + FastAPI + YOLO
- **Ports**: 
  - `8080` - REST API server
- **Features**:
  - YOLO-based object detection
  - 80+ object classes recognition
  - Real-time frame processing
  - Confidence scoring
  - Bounding box generation

---

##  Docker Configuration

### **docker-compose.yml Structure**
```yaml
services:
  frontend:
    build: ./frontend-react
    ports: ["3000:3000", "3443:3443"]
    environment:
      - HOST_IP=auto-detected
      - BACKEND_URL=http://backend:8080
    depends_on: [backend]
    
  backend:
    build: ./server
    ports: ["8080:8080"]
    environment:
      - HOST_IP=auto-detected
      - PYTHONUNBUFFERED=1
```

### **Frontend Dockerfile**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000 3443
CMD ["node", "server.js"]
```

### **Backend Dockerfile**
```dockerfile
FROM python:3.9-slim
WORKDIR /app
RUN apt-get update && apt-get install -y libgl1 libglib2.0-0
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

---m phone to browser.

##  One-Command Start
     
     docker-compose up -d --build

### **Windows:**
```powershell
.\start.ps1
```

### **Linux/macOS:**
```bash
./start.sh
```

That's it!  The system will:
- ✅ Auto-detect your IP address
- ✅ Start all services (Frontend + AI Backend)
- ✅ Generate QR codes for easy phone connection
- ✅ Display all access URLs

---

##  Connect Your Phone

After starting, you'll see output like this:

```
 SUCCESS! System is running!
===============================================
  Desktop Client: https://192.168.1.100:3443
  Mobile Client:  https://192.168.1.100:3443/phone
  Backend API:    http://192.168.1.100:8080
===============================================
```

### **Option 1: QR Code (Recommended)**
1. Open the desktop client: `https://[YOUR_IP]:3443`
2. **Scan the QR code** displayed on screen with your phone
3. Phone will automatically open the mobile client

### **Option 2: Short URL**
1. On your phone, type the mobile URL: `https://[YOUR_IP]:3443/phone`
2. Or share the link via message/email to your phone

### **Option 3: WiFi Auto-Discovery**
1. Make sure your phone is on the **same WiFi network**
2. The system automatically detects devices on your network
3. Open any browser on your phone and navigate to the mobile URL

---

##  Mode Selection

### **Server Mode (Default) - Full AI Processing**
```bash
# Default mode - uses Python backend with YOLO
./start.sh
```
- ✅ Full YOLO object detection
- ✅ 80+ object classes
- ✅ High accuracy detection
- ✅ Server-side AI processing
- ⚠️ Requires Docker and more resources

### **WASM Mode - Client-Side Processing**
```bash
# Lightweight mode - uses WebAssembly in browser
./start.sh --wasm
```
- ✅ No server setup required
- ✅ Runs entirely in browser
- ✅ Faster startup
- ✅ Lower resource usage
- ⚠️ Limited object detection capabilities

### **Switching Modes**
```bash
# Switch to WASM mode
./start.sh --mode=wasm

# Switch back to server mode
./start.sh --mode=server

# Check current mode
./start.sh --status
```

---

##  WiFi Network Changes

When you change WiFi networks, your IP address changes. Simply run:

```powershell
# Windows
.\quick_ip_update.ps1

# Linux/macOS
./start.sh --update-ip
```

The system will:
-  Auto-detect new IP
-  Update all configurations
-  Restart services
-  Generate new QR codes

---

##  Quick Access Guide

| What you want to do | Command | URL |
|---------------------|---------|-----|
| **Start system** | `./start.sh` | Auto-detected |
| **Desktop detection** | Browser → | `https://[IP]:3443` |
| **Phone camera** | Phone → | `https://[IP]:3443/phone` |
| **API testing** | curl → | `http://[IP]:8080` |
| **Change WiFi** | `./quick_ip_update.ps1` | New URLs shown |
| **Stop system** | `docker-compose down` | - |
| **View logs** | `docker-compose logs -f` | - |

---

##  System Requirements

### **Minimum (WASM Mode):**
- Modern web browser (Chrome/Firefox/Safari)
- Smartphone with camera
- Same WiFi network

### **Full Features (Server Mode):**
- Docker & Docker Compose installed
- 2GB+ RAM available
- Modern web browser
- Smartphone with camera
- Same WiFi network

---

## Usage

1. On your smartphone, open `http://<your-computer-ip>:3000/phone`
2. Click "Start Camera" to enable camera access
3. Click "Connect" to establish a WebRTC connection
4. On your computer, open `http://localhost:3000`
5. Click "Connect" to receive the video stream
6. Click "Start Detection" to begin object detection
7. Adjust detection settings as needed:
   - Detection interval: How often frames are analyzed
   - Confidence threshold: Minimum confidence score for displaying detections
   - Objects to detect: Select which objects to look for
   - Add custom objects: Enter custom object queries for the VLM

##  Development

### **Project Structure**

```
📦 AdMyBrand/
├──  start.ps1                    # Windows start script
├──  start.sh                     # Linux/macOS start script  
├──  quick_ip_update.ps1          # Manual IP update
├──  docker-compose.yml           # Main Docker orchestration
├──  docker-compose-wasm.yml      # WASM-only mode
├──  .gitignore                   # Global gitignore
│
├── frontend-react/              # Frontend Service
│   ├──  Dockerfile               # Frontend container config
│   ├──  package.json             # Node.js dependencies
│   ├──  server.js                # Express + Socket.IO server
│   ├──  src/                     # React source code
│   │   ├── App.tsx                 # Main app component
│   │   ├── components/Phone.tsx    # Mobile interface
│   │   └── utils/mainLogic.ts      # WebRTC logic
│   ├──  public/                  # Static assets
│   │   ├── index.html              # Desktop client
│   │   └── phone.html              # Mobile client
│   └──  .gitignore               # Frontend-specific ignores
│
├──  server/                      # Backend Service  
│   ├──  Dockerfile               # Backend container config
│   ├──  requirements.txt         # Python dependencies
│   ├──  main.py                  # FastAPI + YOLO server
│   ├──  models/                  # AI model storage
│   └──  logs/                    # Server logs
│
└──  bench/                       # Benchmarking tools
    ├── run_bench.sh                # Performance testing
    └── run_bench.ps1               # Windows benchmarks
```

### **Frontend Service Details**
- **Framework**: React 18 + TypeScript
- **Server**: Express.js with HTTPS support
- **WebRTC**: Native WebRTC APIs + Socket.IO signaling
- **Features**: Camera access, video streaming, QR generation
- **Build**: `npm run build` creates optimized production bundle

### **Backend Service Details**  
- **Framework**: FastAPI with async support
- **AI Model**: YOLOv5 via Ultralytics
- **Processing**: Real-time frame analysis
- **API**: RESTful endpoints for object detection
- **Health Checks**: Built-in container health monitoring

### **Environment Variables**
```bash
# Frontend (.env)
NODE_ENV=production
HOST_IP=auto-detected    # Your network IP
BACKEND_URL=http://backend:8080

# Backend (.env)  
PYTHONUNBUFFERED=1
HOST_IP=auto-detected    # Your network IP
MODEL_CACHE_DIR=/app/models
```

##  Troubleshooting

### **Docker Issues**

**Container fails to start:**
```bash
# Check container logs
docker-compose logs frontend
docker-compose logs backend

# Check container status
docker-compose ps

# Rebuild containers
docker-compose down
docker-compose up --build -d
```

**Port conflicts:**
```bash
# Check what's using the ports
netstat -ano | findstr :3443    # Windows
lsof -i :3443                   # Linux/macOS

# Kill processes using ports
taskkill /PID <PID> /F          # Windows  
kill -9 <PID>                   # Linux/macOS
```

**IP detection issues:**
```bash
# Manual IP update
.\quick_ip_update.ps1           # Windows
./start.sh --update-ip          # Linux/macOS

# Check current IP in config
Get-Content docker-compose.yml | Select-String "HOST_IP"
```

### **Frontend Issues**

**Camera access denied:**
- Ensure HTTPS is used (`https://` not `http://`)
- Check browser permissions for camera access
- Try different browser (Chrome recommended)

**WebRTC connection fails:**
- Both devices must be on same WiFi network
- Check firewall settings
- Verify QR code shows correct IP address

**QR code not working:**
- Manually type the mobile URL: `https://[IP]:3443/phone`
- Ensure phone and computer are on same network
- Check if IP address changed (WiFi reconnection)

### **Backend Issues**

**AI detection not working:**
```bash
# Check backend health
curl http://localhost:8080
docker-compose logs backend

# Verify YOLO model download
docker-compose exec backend ls -la /app/models/
```

**Performance issues:**
```bash
# Monitor resource usage
docker stats

# Adjust detection settings in frontend
# - Increase detection interval
# - Lower video resolution
# - Reduce confidence threshold
```

### **Network Issues**

**Can't access from phone:**
1. Verify computer and phone on same WiFi
2. Check computer firewall (allow ports 3443, 8080)
3. Try IP address manually: `https://[COMPUTER_IP]:3443/phone`
4. Restart router if needed

**WiFi network changes:**
```bash
# Quick fix - update IP and restart
.\quick_ip_update.ps1           # Windows
./start.sh --update-ip          # Linux/macOS
```

### **Common Error Messages**

| Error | Solution |
|-------|----------|
| `Docker not found` | Install Docker Desktop |
| `Port already in use` | Stop conflicting services or change ports |
| `Permission denied` | Run with administrator/sudo privileges |
| `Container unhealthy` | Check logs: `docker-compose logs [service]` |
| `WebRTC failed` | Check network connectivity and firewall |
| `Camera not accessible` | Use HTTPS and grant browser permissions |

---

##  API Documentation

### **Backend API Endpoints**

**Health Check:**
```bash
GET http://localhost:8080/
Response: {"status": "healthy", "model": "yolov5"}
```

**Object Detection:**
```bash
POST http://localhost:8080/detect
Content-Type: multipart/form-data
Body: image file

Response: {
  "detections": [
    {
      "class": "person",
      "confidence": 0.85,
      "bbox": [x1, y1, x2, y2]
    }
  ],
  "processing_time": 0.045
}
```

**Available Object Classes:**
```bash
GET http://localhost:8080/classes
Response: {
  "classes": ["person", "bicycle", "car", "motorcycle", ...]
}
```

### **Frontend WebSocket Events**

**Join Room:**
```javascript
socket.emit('join-room', { 
  room: 'detection-room',
  role: 'desktop'  // or 'mobile'
});
```

**WebRTC Signaling:**
```javascript
// Offer/Answer/ICE candidate exchange
socket.emit('offer', { offer, room });
socket.emit('answer', { answer, room });  
socket.emit('ice-candidate', { candidate, room });
```

**IP Updates:**
```javascript
socket.on('ip-changed', (data) => {
  console.log('New IP:', data.newIP);
  // Update QR codes and URLs
});
```

---

##  Security & Production

### **HTTPS Configuration**
- Frontend automatically generates self-signed certificates
- For production, replace with valid SSL certificates
- Update certificate paths in `frontend-react/server.js`

### **Firewall Settings**
```bash
# Allow required ports
ufw allow 3443/tcp     # HTTPS frontend  
ufw allow 8080/tcp     # Backend API
ufw allow 3000/tcp     # HTTP frontend (optional)
```

### **Environment Security**
- Never commit `.env` files with real credentials
- Use Docker secrets for sensitive data
- Implement rate limiting for API endpoints
- Add authentication for production deployment

---

## Acknowledgments

- [WebRTC](https://webrtc.org/) for the real-time communication technology
- [Hugging Face Transformers](https://huggingface.co/docs/transformers/index) for the VLM models
- [Socket.IO](https://socket.io/) for the signaling server
