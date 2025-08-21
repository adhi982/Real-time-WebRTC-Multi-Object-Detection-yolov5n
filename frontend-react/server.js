const express = require('express');
const http = require('http');
const https = require('https');
const selfsigned = require('selfsigned');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors());

// Function to get real IP address (prefer HOST_IP from environment)
function getRealIPAddress() {
  // First priority: Use HOST_IP environment variable (from docker-compose)
  if (process.env.HOST_IP && process.env.HOST_IP !== 'not-set') {
    console.log(`🔧 Using HOST_IP from environment: ${process.env.HOST_IP}`);
    return process.env.HOST_IP;
  }
  
  // Fallback: Try to detect from network interfaces (for non-Docker environments)
  const interfaces = os.networkInterfaces();
  
  // Priority order: Ethernet, WiFi, then others
  const priorityInterfaces = ['Ethernet', 'Wi-Fi', 'WiFi', 'wlan0', 'eth0'];
  
  // First try priority interfaces
  for (const interfaceName of priorityInterfaces) {
    if (interfaces[interfaceName]) {
      for (const interfaceInfo of interfaces[interfaceName]) {
        if (interfaceInfo.family === 'IPv4' && !interfaceInfo.internal) {
          console.log(` Detected IP from ${interfaceName}: ${interfaceInfo.address}`);
          return interfaceInfo.address;
        }
      }
    }
  }
  
  // If no priority interface found, check all interfaces
  for (const interfaceName in interfaces) {
    for (const interfaceInfo of interfaces[interfaceName]) {
      if (interfaceInfo.family === 'IPv4' && !interfaceInfo.internal) {
        console.log(` Detected IP from ${interfaceName}: ${interfaceInfo.address}`);
        return interfaceInfo.address;
      }
    }
  }
  
  console.log(` Using fallback IP: 10.71.252.230`);
  return '10.71.252.230'; // fallback to your current IP
}

// Dynamic IP detection variables
let currentDetectedIP = getRealIPAddress();
let lastIPCheck = 0;
const IP_CHECK_INTERVAL = 10000; // Check every 10 seconds

// Function to check and update IP dynamically
function checkAndUpdateIP() {
  const now = Date.now();
  if (now - lastIPCheck < IP_CHECK_INTERVAL) {
    return currentDetectedIP;
  }
  
  const newIP = getRealIPAddress();
  if (newIP !== currentDetectedIP) {
    console.log(` IP changed from ${currentDetectedIP} to ${newIP}`);
    currentDetectedIP = newIP;
    
    // Broadcast IP change to all connected clients
    if (global.socketIO) {
      global.socketIO.emit('ip-changed', { newIP: newIP });
      console.log(` Broadcasted IP change to all clients: ${newIP}`);
    }
  }
  
  lastIPCheck = now;
  return currentDetectedIP;
}

// Docker environment configuration
// Keep localhost functionality intact while adding dynamic IP detection
const HOST_IP = process.env.HOST_IP || currentDetectedIP;
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:8080';

console.log(` Detected current IP address: ${currentDetectedIP}`);
console.log(` Using HOST_IP: ${HOST_IP}`);
console.log(` Dynamic IP monitoring enabled`);

// Serve static files from the React build directory
app.use(express.static(path.join(__dirname, 'build')));

// API endpoint to provide configuration to frontend with dynamic IP
app.get('/api/config', (req, res) => {
  // Get current IP dynamically
  const CURRENT_IP = checkAndUpdateIP();
  
  // For browser access, use localhost instead of Docker internal hostname (keep existing)
  const BROWSER_BACKEND_URL = 'http://localhost:8080';
  
  res.json({
    apiUrl: BROWSER_BACKEND_URL, // Keep localhost for browser access
    hostIp: CURRENT_IP, // Use dynamic IP for QR codes and phone access
    dockerHostIp: HOST_IP,
    environment: process.env.NODE_ENV || 'development',
    detectedInterfaces: Object.keys(os.networkInterfaces()),
    detectedIP: CURRENT_IP,
    certificateIP: CURRENT_IP,
    lastIPCheck: new Date().toISOString(),
    dynamicIPEnabled: true
  });
});

// Handle specific routes for the React app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.get('/phone', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.get('/phone.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Catch all handler: serve React app for any other route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Generate self-signed certificate with the current dynamic IP
const CERTIFICATE_IP = checkAndUpdateIP(); // Use dynamic IP for certificate
const attrs = [{ name: 'commonName', value: CERTIFICATE_IP }];
const pems = selfsigned.generate(attrs, { days: 365 });

console.log(` Certificate generated for current IP: ${CERTIFICATE_IP}`);

// Create HTTP server
const server = http.createServer(app);

// Create HTTPS server
const httpsServer = https.createServer({
  key: pems.private,
  cert: pems.cert
}, app);

// Set up Socket.IO for both HTTP and HTTPS servers
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const ioHttps = new Server(httpsServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Store Socket.IO servers globally for IP change broadcasting
global.socketIO = ioHttps; // Use HTTPS server for main broadcasting
global.socketIOHttp = io; // Keep HTTP server reference too

// Socket.IO connection handling variables
let activeOfferSocket = null;
let activeAnswerSocket = null;
let sessionTimeout = null;
let mainPageSocket = null;
let phoneSocket = null;

// Function to handle socket connections (shared between HTTP and HTTPS)
function handleSocketConnection(socket, io, serverType) {
  console.log(`User connected to ${serverType}: ${socket.id}`);
  
  // Clear any existing session timeout when someone connects
  if (sessionTimeout) {
    clearTimeout(sessionTimeout);
    sessionTimeout = null;
  }
  
  // Handle role registration
  socket.on('register-role', (role) => {
    console.log(`Socket ${socket.id} on ${serverType} registered as: ${role}`);
    if (role === 'main') {
      if (mainPageSocket && mainPageSocket !== socket.id) {
        console.log(`Main page role conflict: existing ${mainPageSocket}, new ${socket.id}`);
      }
      mainPageSocket = socket.id;
      console.log(`Main page socket set to: ${mainPageSocket}`);
    } else if (role === 'phone') {
      if (phoneSocket && phoneSocket !== socket.id) {
        console.log(`Phone role conflict: existing ${phoneSocket}, new ${socket.id}`);
      }
      phoneSocket = socket.id;
      console.log(`Phone socket set to: ${phoneSocket}`);
    }
    
    // Send current status back
    socket.emit('role-registered', {
      role: role,
      mainPageSocket: mainPageSocket,
      phoneSocket: phoneSocket
    });
  });
  
  // Handle signaling with role-based routing and fallback
  socket.on('offer', (data) => {
    console.log('Received offer from:', socket.id);
    
    // If we have role information, use it
    if (mainPageSocket && socket.id !== mainPageSocket) {
      console.log('Sending offer to main page:', mainPageSocket);
      io.to(mainPageSocket).emit('offer', data);
      phoneSocket = socket.id; // Ensure phone socket is set
      activeOfferSocket = socket.id;
    } 
    // Fallback: if no roles yet, auto-assign and broadcast
    else if (!mainPageSocket && !phoneSocket) {
      console.log('No roles assigned yet, broadcasting offer and setting phone role');
      phoneSocket = socket.id;
      activeOfferSocket = socket.id;
      socket.broadcast.emit('offer', data);
    }
    // If we have a phone but no main page, broadcast
    else if (!mainPageSocket) {
      console.log('No main page connected, broadcasting offer');
      phoneSocket = socket.id;
      activeOfferSocket = socket.id;
      socket.broadcast.emit('offer', data);
    }
    else {
      console.log('Duplicate offer or session conflict');
      socket.emit('session-busy');
    }
  });

  socket.on('answer', (data) => {
    console.log('Received answer from:', socket.id);
    
    // If we have role information, use it
    if (phoneSocket && socket.id !== phoneSocket) {
      console.log('Sending answer to phone:', phoneSocket);
      io.to(phoneSocket).emit('answer', data);
      mainPageSocket = socket.id; // Ensure main page socket is set
      activeAnswerSocket = socket.id;
    }
    // Fallback: auto-assign roles based on who's answering
    else if (phoneSocket && !mainPageSocket) {
      console.log('Setting main page role and sending answer to phone');
      mainPageSocket = socket.id;
      activeAnswerSocket = socket.id;
      io.to(phoneSocket).emit('answer', data);
    }
    else {
      console.log('No phone to send answer to or duplicate answer');
      socket.emit('session-busy');
    }
  });

  socket.on('ice-candidate', (data) => {
    console.log('Relaying ICE candidate from:', socket.id);
    
    // Send ICE candidates to the other party based on roles
    if (socket.id === mainPageSocket && phoneSocket) {
      console.log('Sending ICE candidate from main to phone:', phoneSocket);
      io.to(phoneSocket).emit('ice-candidate', data);
    } else if (socket.id === phoneSocket && mainPageSocket) {
      console.log('Sending ICE candidate from phone to main:', mainPageSocket);
      io.to(mainPageSocket).emit('ice-candidate', data);
    } else {
      // Fallback to broadcast if roles not clear yet
      console.log('Broadcasting ICE candidate (roles not clear)');
      socket.broadcast.emit('ice-candidate', data);
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected from ${serverType}: ${socket.id}`);
    
    // Check if this was one of our role sockets
    if (mainPageSocket === socket.id) {
      console.log('Main page disconnected, clearing');
      mainPageSocket = null;
      activeAnswerSocket = null;
    }
    
    if (phoneSocket === socket.id) {
      console.log('Phone disconnected, clearing');
      phoneSocket = null;
      activeOfferSocket = null;
    }
    
    // Set a timeout to clear session state after a delay
    sessionTimeout = setTimeout(() => {
      console.log('Session timeout reached, notifying remaining clients');
      activeOfferSocket = null;
      activeAnswerSocket = null;
      mainPageSocket = null;
      phoneSocket = null;
      socket.broadcast.emit('session-reset');
    }, 3000); // 3 second delay
  });
}

// Set up HTTP Socket.IO connections
io.on('connection', (socket) => {
  handleSocketConnection(socket, io, 'HTTP');
});

// Set up HTTPS Socket.IO connections
ioHttps.on('connection', (socket) => {
  handleSocketConnection(socket, ioHttps, 'HTTPS');
});

// Start servers
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

server.listen(PORT, () => {
  console.log(`HTTP Server running on port ${PORT}`);
});

httpsServer.listen(HTTPS_PORT, () => {
  console.log(`HTTPS Server running on port ${HTTPS_PORT}`);
  console.log(`HTTPS URL: https://${CERTIFICATE_IP}:${HTTPS_PORT}`);
  console.log(` Phone URL: https://${CERTIFICATE_IP}:${HTTPS_PORT}/phone`);
  
  // Start dynamic IP monitoring
  console.log(` Starting dynamic IP monitoring every ${IP_CHECK_INTERVAL/1000} seconds`);
  setInterval(() => {
    checkAndUpdateIP(); // This will broadcast changes automatically
  }, IP_CHECK_INTERVAL);
});
