import { io, Socket } from 'socket.io-client';

// Configuration - will be loaded from server
let config = {
  apiUrl: 'http://localhost:8080',
  socketUrl: window.location.origin,
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ]
};

// Variables
let peerConnection: RTCPeerConnection | null = null;
let detectionInterval: NodeJS.Timeout | null = null;
let isDetecting = false;
let isConnecting = false;
let isPhoneConnected = false;
let isVideoReady = false;

// Real-time performance metrics
let performanceMetrics = {
  // Latency metrics
  latencyMedian: 0,
  latencyP95: 0,
  serverLatency: 0,
  networkLatency: 0,
  latencyHistory: [] as number[],
  
  // Processing metrics
  processedFps: 0,
  successRate: 0,
  totalProcessed: 0,
  totalSuccessful: 0,
  
  // Network bandwidth
  uplink: 0,
  downlink: 0,
  
  // Legacy metrics for calculations
  detectionCount: 0,
  detectionStartTime: 0,
  avgDetectionTime: 0,
  lastDetectionTime: 0,
  fps: 0,
  
  // Network metrics
  bytesReceived: 0,
  bytesSent: 0,
  packetsReceived: 0,
  packetsLost: 0,
  jitter: 0,
  rtt: 0,
  
  // Video metrics
  videoWidth: 0,
  videoHeight: 0,
  frameRate: 0,
  
  // Device metrics
  cpuUsage: 0,
  memoryUsage: 0,
  batteryLevel: 0,
  networkType: 'unknown',
  
  // Session tracking
  sessionStartTime: Date.now(),
  connectionQuality: 'EXCELLENT',
  overallStatus: 'STANDBY'
};

let performanceInterval: NodeJS.Timeout | null = null;
let ipMonitoringInterval: NodeJS.Timeout | null = null;
let currentConfig: any = null;

// Load configuration from server
async function loadConfig(): Promise<void> {
  try {
    const response = await fetch('/api/config');
    const serverConfig = await response.json();
    config.apiUrl = serverConfig.apiUrl;
    
    // Check for IP changes
    if (currentConfig && currentConfig.hostIp !== serverConfig.hostIp) {
      console.log(`🔄 IP changed detected: ${currentConfig.hostIp} → ${serverConfig.hostIp}`);
      handleIPChange(serverConfig);
    }
    
    currentConfig = serverConfig;
    console.log('Loaded configuration:', serverConfig);
  } catch (error) {
    console.warn('Failed to load server configuration, using defaults:', error);
  }
}

// Handle IP change
function handleIPChange(newConfig: any) {
  console.log('🔄 Handling IP change...');
  
  // Update displayed current IP
  const currentIPElement = document.getElementById('currentIP');
  if (currentIPElement) {
    currentIPElement.textContent = newConfig.hostIp;
  }
  
  // Update real IP URL
  const realIPUrlElement = document.getElementById('realIPUrl') as HTMLInputElement;
  if (realIPUrlElement) {
    realIPUrlElement.value = `https://${newConfig.hostIp}:3443/phone`;
  }
  
  // Regenerate QR code with new IP
  generateQRCodeWithNewIP(newConfig.hostIp);
  
  // Show notification
  updateStatus(`📡 Network changed! New IP: ${newConfig.hostIp}. QR code updated automatically.`);
  
  console.log(`✅ IP change handled successfully: ${newConfig.hostIp}`);
}

// Generate QR code with new IP
function generateQRCodeWithNewIP(hostIP: string) {
  const phoneURL = `https://${hostIP}:3443/phone`;
  console.log(`🔄 Regenerating QR code for: ${phoneURL}`);
  
  // Trigger QR code regeneration (the existing generateQRCode function will be called)
  setTimeout(() => {
    (window as any).generateQRCode?.();
  }, 100);
}

// Start dynamic IP monitoring
function startDynamicIPMonitoring() {
  console.log('🔄 Starting dynamic IP monitoring...');
  
  // Check for IP changes every 15 seconds
  ipMonitoringInterval = setInterval(async () => {
    await loadConfig();
  }, 15000);
}

// Export configuration loader for external use
export const initializeConfig = loadConfig;

// Connect to signaling server
export async function connectSignalingServer(): Promise<Socket> {
  await loadConfig();
  
  return new Promise((resolve, reject) => {
    const socket = io(config.socketUrl, {
      reconnectionDelayMax: 10000,
      reconnectionAttempts: 10,
      timeout: 20000,
      autoConnect: true
    });

    socket.on('connect', () => {
      console.log('Connected to signaling server');
      socket.emit('register-role', { role: 'browser' });
      updateStatus('Connected to signaling server');
      
      // Start dynamic IP monitoring after connection
      startDynamicIPMonitoring();
      
      resolve(socket);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from signaling server');
      updateStatus('Disconnected from signaling server');
      
      // Stop IP monitoring when disconnected
      if (ipMonitoringInterval) {
        clearInterval(ipMonitoringInterval);
        ipMonitoringInterval = null;
      }
    });

    socket.on('connect_error', (error: any) => {
      console.error('Connection error:', error);
      updateStatus('Connection error');
      reject(error);
    });

    // Listen for IP change broadcasts from server
    socket.on('ip-changed', (data: { newIP: string }) => {
      console.log(`📡 Server notified IP change: ${data.newIP}`);
      handleIPChange({ hostIp: data.newIP });
    });
  });
}

// Setup WebRTC - CLEAN SIMPLE VERSION
export function setupWebRTC(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement, socket: Socket) {
  console.log('🎥 Setting up clean WebRTC system');
  
  // Store references globally
  (window as any).remoteVideo = videoElement;
  (window as any).overlay = canvasElement;
  (window as any).socket = socket;
  
  // Initialize peer connection
  setupPeerConnection(videoElement, socket);
  
  // Setup WebRTC signaling listeners
  setupWebRTCSignaling(videoElement, socket);
  
  // Setup button handlers
  setupButtonHandlers(socket);
  
  // Generate QR code
  generateQRCode();
}

function setupPeerConnection(videoElement: HTMLVideoElement, socket: Socket) {
  peerConnection = new RTCPeerConnection({
    iceServers: config.iceServers
  });

  // Handle remote stream - SIMPLE APPROACH
  peerConnection.ontrack = (event) => {
    console.log('🎥 Received remote track from phone');
    
    const [remoteStream] = event.streams;
    if (videoElement && remoteStream) {
      console.log('🎥 Setting video srcObject directly');
      videoElement.srcObject = remoteStream;
      videoElement.muted = true;
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      
      // Force play
      videoElement.play().then(() => {
        console.log('🎥 Video playing successfully');
        isPhoneConnected = true;
        isVideoReady = true;
        performanceMetrics.overallStatus = 'CONNECTED';
        updateStatus('📹 Phone connected! Video ready for detection');
        updateButtonStates();
      }).catch(e => {
        console.error('🎥 Video play failed:', e);
        performanceMetrics.overallStatus = 'ERROR';
        updateStatus('❌ Video play failed: ' + e.message);
      });
    }
  };

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('Sending ICE candidate to phone');
      socket.emit('ice-candidate', event.candidate);
    }
  };

  // Handle connection state changes
  peerConnection.onconnectionstatechange = () => {
    console.log('Connection state:', peerConnection?.connectionState);
    
    if (peerConnection?.connectionState === 'connected') {
      isPhoneConnected = true;
      performanceMetrics.overallStatus = 'CONNECTING';
      updateStatus('📱 Phone connected - waiting for video stream...');
      updateButtonStates();
    } else if (peerConnection?.connectionState === 'disconnected' || peerConnection?.connectionState === 'failed') {
      isPhoneConnected = false;
      isVideoReady = false;
      performanceMetrics.overallStatus = 'DISCONNECTED';
      updateStatus(`Connection: ${peerConnection?.connectionState}`);
      updateButtonStates();
    } else {
      updateStatus(`Connection: ${peerConnection?.connectionState}`);
    }
  };
}

function setupWebRTCSignaling(videoElement: HTMLVideoElement, socket: Socket) {
  // Remove any existing listeners to prevent duplicates
  socket.off('offer');
  socket.off('ice-candidate');
  
  // Listen for offer from phone
  socket.on('offer', async (offer) => {
    console.log('📱 Received offer from phone');
    try {
      if (!peerConnection) {
        setupPeerConnection(videoElement, socket);
      }
      
      await peerConnection?.setRemoteDescription(offer);
      const answer = await peerConnection?.createAnswer();
      await peerConnection?.setLocalDescription(answer);
      
      socket.emit('answer', answer);
      console.log('✅ Sent answer to phone');
      updateStatus('Answering phone connection - waiting for video...');
      updateButtonStates();
    } catch (error) {
      console.error('❌ Error handling offer:', error);
      updateStatus('Error connecting to phone');
    }
  });

  // Listen for ICE candidates from phone
  socket.on('ice-candidate', async (data) => {
    console.log('📱 Received ICE candidate from phone');
    try {
      if (peerConnection && data) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data));
        console.log('✅ Added ICE candidate');
      }
    } catch (error) {
      console.error('❌ Error adding ICE candidate:', error);
    }
  });
}

function updateStatus(message: string) {
  const statusElement = document.getElementById('status');
  if (statusElement) {
    statusElement.textContent = message;
  }
  console.log('Status:', message);
}

function updateButtonStates() {
  const connectButton = document.getElementById('connectButton') as HTMLButtonElement;
  const startDetectionButton = document.getElementById('startDetectionButton') as HTMLButtonElement;
  const stopButton = document.getElementById('stopButton') as HTMLButtonElement;
  const resetButton = document.getElementById('resetButton') as HTMLButtonElement;
  
  if (connectButton) {
    if (isVideoReady) {
      connectButton.textContent = '✅ Phone Connected';
      connectButton.disabled = true;
      connectButton.style.backgroundColor = '#28a745';
    } else if (isConnecting) {
      connectButton.textContent = '⏳ Waiting for Phone...';
      connectButton.disabled = true;
      connectButton.style.backgroundColor = '#ffc107';
    } else {
      connectButton.textContent = '📱 Wait for Phone Connection';
      connectButton.disabled = false;
      connectButton.style.backgroundColor = '#007bff';
    }
  }
  
  if (startDetectionButton) {
    startDetectionButton.disabled = !isVideoReady || isDetecting;
  }
  
  if (stopButton) {
    stopButton.disabled = !isDetecting;
  }
  
  if (resetButton) {
    resetButton.disabled = false;
  }
}

function waitForPhoneConnection() {
  if (isConnecting || isVideoReady) return;
  
  isConnecting = true;
  updateStatus('📱 Waiting for phone to connect... Please scan QR code or open phone URL.');
  updateButtonStates();
}

// Real-time performance monitoring functions
async function collectRealTimeMetrics() {
  try {
    // Get WebRTC stats if connection exists
    if (peerConnection) {
      const stats = await peerConnection.getStats();
      
      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
          performanceMetrics.bytesReceived = report.bytesReceived || 0;
          performanceMetrics.packetsReceived = report.packetsReceived || 0;
          performanceMetrics.packetsLost = report.packetsLost || 0;
          performanceMetrics.jitter = report.jitter || 0;
          performanceMetrics.frameRate = report.framesPerSecond || 0;
        }
        
        if (report.type === 'remote-inbound-rtp' && report.mediaType === 'video') {
          performanceMetrics.rtt = report.roundTripTime || 0;
        }
      });
    }
    
    // Get video element metrics
    const video = (window as any).remoteVideo;
    if (video) {
      performanceMetrics.videoWidth = video.videoWidth || 0;
      performanceMetrics.videoHeight = video.videoHeight || 0;
    }
    
    // Calculate FPS for detection
    if (performanceMetrics.detectionStartTime > 0) {
      const elapsed = (Date.now() - performanceMetrics.detectionStartTime) / 1000;
      performanceMetrics.fps = elapsed > 0 ? performanceMetrics.detectionCount / elapsed : 0;
      performanceMetrics.processedFps = performanceMetrics.fps; // Update processed FPS
    }
    
    // Calculate success rate
    if (performanceMetrics.totalProcessed > 0) {
      performanceMetrics.successRate = (performanceMetrics.totalSuccessful / performanceMetrics.totalProcessed) * 100;
    }
    
    // Calculate latency metrics
    if (performanceMetrics.latencyHistory.length > 0) {
      const sortedLatencies = [...performanceMetrics.latencyHistory].sort((a, b) => a - b);
      const medianIndex = Math.floor(sortedLatencies.length / 2);
      performanceMetrics.latencyMedian = sortedLatencies[medianIndex] || 0;
      
      const p95Index = Math.floor(sortedLatencies.length * 0.95);
      performanceMetrics.latencyP95 = sortedLatencies[p95Index] || 0;
    }
    
    // Set network latency from RTT
    performanceMetrics.networkLatency = performanceMetrics.rtt * 1000;
    
    // Calculate bandwidth from WebRTC stats
    if (peerConnection) {
      const stats = await peerConnection.getStats();
      
      stats.forEach((report) => {
        if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
          // Calculate uplink bandwidth (bytes per second to kbps)
          if (report.bytesSent && report.timestamp) {
            performanceMetrics.uplink = (report.bytesSent * 8) / 1000; // Convert to kbps
          }
        }
        
        if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
          // Calculate downlink bandwidth
          if (report.bytesReceived && report.timestamp) {
            performanceMetrics.downlink = (report.bytesReceived * 8) / 1000; // Convert to kbps
          }
        }
      });
    }
    
    // Get device performance metrics
    if ((navigator as any).deviceMemory) {
      performanceMetrics.memoryUsage = (navigator as any).deviceMemory;
    }
    
    if ((navigator as any).getBattery) {
      const battery = await (navigator as any).getBattery();
      performanceMetrics.batteryLevel = Math.round(battery.level * 100);
    }
    
    if ((navigator as any).connection) {
      const connection = (navigator as any).connection;
      performanceMetrics.networkType = connection.effectiveType || 'unknown';
    }
    
    // Determine connection quality based on network metrics
    const lossRate = performanceMetrics.packetsReceived > 0 
      ? (performanceMetrics.packetsLost / performanceMetrics.packetsReceived * 100)
      : 0;
    const rttMs = performanceMetrics.rtt * 1000;
    
    if (lossRate > 5 || rttMs > 500) {
      performanceMetrics.connectionQuality = 'POOR';
    } else if (lossRate > 1 || rttMs > 200) {
      performanceMetrics.connectionQuality = 'FAIR';
    } else if (lossRate > 0.1 || rttMs > 100) {
      performanceMetrics.connectionQuality = 'GOOD';
    } else {
      performanceMetrics.connectionQuality = 'EXCELLENT';
    }
    
    // Update performance display
    updatePerformanceDisplay();
    
  } catch (error) {
    console.log('Performance metrics collection error:', error);
  }
}

function updatePerformanceDisplay() {
  // Latency Metrics
  const latencyMedianElement = document.getElementById('latencyMedian');
  const latencyP95Element = document.getElementById('latencyP95');
  const serverLatencyElement = document.getElementById('serverLatency');
  const networkLatencyElement = document.getElementById('networkLatency');
  
  if (latencyMedianElement) {
    latencyMedianElement.textContent = `${performanceMetrics.latencyMedian.toFixed(1)}ms`;
  }
  
  if (latencyP95Element) {
    latencyP95Element.textContent = `${performanceMetrics.latencyP95.toFixed(1)}ms`;
  }
  
  if (serverLatencyElement) {
    serverLatencyElement.textContent = `${performanceMetrics.serverLatency.toFixed(1)}ms`;
  }
  
  if (networkLatencyElement) {
    networkLatencyElement.textContent = `${performanceMetrics.networkLatency.toFixed(1)}ms`;
  }
  
  // Processing Performance
  const processedFpsElement = document.getElementById('processedFps');
  const successRateElement = document.getElementById('successRate');
  
  if (processedFpsElement) {
    processedFpsElement.textContent = `${performanceMetrics.processedFps.toFixed(1)}`;
  }
  
  if (successRateElement) {
    successRateElement.textContent = `${performanceMetrics.successRate.toFixed(1)}%`;
  }
  
  // Network Bandwidth
  const uplinkElement = document.getElementById('uplink');
  const downlinkElement = document.getElementById('downlink');
  
  if (uplinkElement) {
    uplinkElement.textContent = `${performanceMetrics.uplink.toFixed(1)} kbps`;
  }
  
  if (downlinkElement) {
    downlinkElement.textContent = `${performanceMetrics.downlink.toFixed(1)} kbps`;
  }
  
  // Performance Summary
  const overallStatusElement = document.getElementById('overallStatus');
  const sessionUptimeElement = document.getElementById('sessionUptime');
  const connectionQualityElement = document.getElementById('connectionQuality');
  
  if (overallStatusElement) {
    overallStatusElement.textContent = performanceMetrics.overallStatus;
  }
  
  if (sessionUptimeElement) {
    const uptimeMs = Date.now() - performanceMetrics.sessionStartTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(uptimeSeconds / 60);
    const seconds = uptimeSeconds % 60;
    sessionUptimeElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  
  if (connectionQualityElement) {
    connectionQualityElement.textContent = performanceMetrics.connectionQuality;
  }
}

function startPerformanceMonitoring() {
  if (performanceInterval) {
    clearInterval(performanceInterval);
  }
  
  performanceMetrics.detectionStartTime = Date.now();
  performanceMetrics.detectionCount = 0;
  
  // Collect metrics every 500ms for real-time updates
  performanceInterval = setInterval(collectRealTimeMetrics, 500);
  
  console.log('🔥 Real-time performance monitoring started');
}

function stopPerformanceMonitoring() {
  if (performanceInterval) {
    clearInterval(performanceInterval);
    performanceInterval = null;
  }
  
  console.log('🔥 Performance monitoring stopped');
}

function setupButtonHandlers(socket: Socket) {
  const connectButton = document.getElementById('connectButton');
  const startDetectionButton = document.getElementById('startDetectionButton');
  const stopButton = document.getElementById('stopButton');
  const resetButton = document.getElementById('resetButton');
  const exportMetricsButton = document.getElementById('exportMetricsButton');
  const resetMetricsButton = document.getElementById('resetMetricsButton');
  
  if (connectButton) {
    connectButton.addEventListener('click', waitForPhoneConnection);
  }
  
  if (startDetectionButton) {
    startDetectionButton.addEventListener('click', startDetection);
  }
  
  if (stopButton) {
    stopButton.addEventListener('click', stopDetection);
  }
  
  if (resetButton) {
    resetButton.addEventListener('click', () => resetConnection(socket));
  }
  
  if (exportMetricsButton) {
    exportMetricsButton.addEventListener('click', exportMetricsToJSON);
  }
  
  if (resetMetricsButton) {
    resetMetricsButton.addEventListener('click', resetPerformanceMetrics);
  }
  
  // Initialize button states
  updateButtonStates();
}

function generateQRCode() {
  const serverUrl = window.location.origin;
  const phoneUrlValue = `${serverUrl}/phone`;
  const phoneUrlElement = document.getElementById('phoneUrl');
  const qrCodeElement = document.getElementById('qrCode');
  const copyUrlButton = document.getElementById('copyUrlButton');
  
  if (phoneUrlElement) {
    phoneUrlElement.textContent = phoneUrlValue;
  }
  
  if (qrCodeElement && copyUrlButton) {
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(phoneUrlValue)}`;
    (qrCodeElement as HTMLImageElement).src = qrApiUrl;
    qrCodeElement.style.display = 'block';
    copyUrlButton.style.display = 'block';
    
    const qrLoading = document.getElementById('qrLoading');
    if (qrLoading) {
      qrLoading.style.display = 'none';
    }
  }
}

function startDetection() {
  if (isDetecting || !isVideoReady) return;
  
  isDetecting = true;
  performanceMetrics.overallStatus = 'DETECTING';
  updateStatus('🔍 Object detection started');
  updateButtonStates();
  
  // Start performance monitoring
  startPerformanceMonitoring();
  
  const intervalMs = parseInt((document.getElementById('detectionInterval') as HTMLInputElement)?.value || '500');
  
  detectionInterval = setInterval(() => {
    captureAndDetect();
  }, intervalMs);
}

function stopDetection() {
  if (!isDetecting) return;
  
  isDetecting = false;
  performanceMetrics.overallStatus = isPhoneConnected ? 'CONNECTED' : 'STANDBY';
  
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
  }
  
  // Stop performance monitoring
  stopPerformanceMonitoring();
  
  updateStatus('🛑 Object detection stopped');
  updateButtonStates();
}

async function captureAndDetect() {
  const startTime = performance.now();
  
  const video = (window as any).remoteVideo;
  const canvas = (window as any).overlay;
  
  if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
    return;
  }
  
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = video.videoWidth;
  tempCanvas.height = video.videoHeight;
  const tempCtx = tempCanvas.getContext('2d');
  
  if (!tempCtx) return;
  
  tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
  
  try {
    // Convert canvas to base64 image
    const base64Image = tempCanvas.toDataURL('image/jpeg', 0.8);
    
    // Prepare JSON payload for backend
    const payload = {
      image: base64Image,
      queries: ["person", "car", "bicycle", "motorcycle", "bus", "truck", "dog", "cat", "laptop", "phone", "book", "chair", "table", "cup", "bottle"]
    };
    
    const response = await fetch(`${config.apiUrl}/detect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Calculate detection performance
    const detectionTime = performance.now() - startTime;
    performanceMetrics.lastDetectionTime = detectionTime;
    performanceMetrics.detectionCount++;
    performanceMetrics.totalProcessed++;
    
    // Add to latency history for statistical calculations
    performanceMetrics.latencyHistory.push(detectionTime);
    if (performanceMetrics.latencyHistory.length > 100) {
      performanceMetrics.latencyHistory.shift(); // Keep only last 100 measurements
    }
    
    // Set server latency (detection processing time)
    performanceMetrics.serverLatency = detectionTime;
    
    // Calculate average detection time
    if (performanceMetrics.detectionCount > 0) {
      performanceMetrics.avgDetectionTime = 
        (performanceMetrics.avgDetectionTime * (performanceMetrics.detectionCount - 1) + detectionTime) / 
        performanceMetrics.detectionCount;
    }
    
    // Backend returns { detections: [...] }, but frontend expects { objects: [...] }
    if (result.detections && result.detections.length > 0) {
      // Convert backend format to frontend format
      const objects = result.detections.map((detection: any) => ({
        class: detection.label,
        confidence: detection.score,
        bbox: detection.box
      }));
      
      performanceMetrics.totalSuccessful++; // Count successful detections
      drawDetections(objects);
      updateDetectionResults(objects);
    } else {
      clearDetections();
    }
    
  } catch (error) {
    console.error('Detection error:', error);
  }
}

function drawDetections(objects: any[]) {
  const video = (window as any).remoteVideo;
  const canvas = (window as any).overlay;
  
  if (!video || !canvas) return;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  // Get the actual displayed video dimensions (considering object-contain)
  const rect = video.getBoundingClientRect();
  const videoAspectRatio = video.videoWidth / video.videoHeight;
  const displayAspectRatio = rect.width / rect.height;
  
  let displayWidth, displayHeight, offsetX = 0, offsetY = 0;
  
  if (videoAspectRatio > displayAspectRatio) {
    // Video is wider than display area
    displayWidth = rect.width;
    displayHeight = rect.width / videoAspectRatio;
    offsetY = (rect.height - displayHeight) / 2;
  } else {
    // Video is taller than display area
    displayHeight = rect.height;
    displayWidth = rect.height * videoAspectRatio;
    offsetX = (rect.width - displayWidth) / 2;
  }
  
  // Set canvas size to match the container
  canvas.width = rect.width;
  canvas.height = rect.height;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;
  ctx.font = '16px Arial';
  ctx.fillStyle = '#00ff00';
  
  // Calculate scaling factors
  const scaleX = displayWidth / video.videoWidth;
  const scaleY = displayHeight / video.videoHeight;
  
  objects.forEach((obj: any) => {
    const [x1, y1, x2, y2] = obj.bbox;
    
    // Scale and offset the bounding box coordinates
    const scaledX1 = x1 * scaleX + offsetX;
    const scaledY1 = y1 * scaleY + offsetY;
    const scaledX2 = x2 * scaleX + offsetX;
    const scaledY2 = y2 * scaleY + offsetY;
    
    const width = scaledX2 - scaledX1;
    const height = scaledY2 - scaledY1;
    
    ctx.strokeRect(scaledX1, scaledY1, width, height);
    
    const label = `${obj.class} (${(obj.confidence * 100).toFixed(1)}%)`;
    const textMetrics = ctx.measureText(label);
    const textHeight = 20;
    
    ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
    ctx.fillRect(scaledX1, scaledY1 - textHeight, textMetrics.width + 10, textHeight);
    
    ctx.fillStyle = '#000000';
    ctx.fillText(label, scaledX1 + 5, scaledY1 - 5);
  });
}

function clearDetections() {
  const canvas = (window as any).overlay;
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}

function updateDetectionResults(objects: any[]) {
  const resultsList = document.getElementById('resultsList');
  if (!resultsList) return;
  
  resultsList.innerHTML = '';
  
  objects.forEach((obj: any) => {
    const div = document.createElement('div');
    div.className = 'result-item';
    div.innerHTML = `
      <strong>${obj.class}</strong>: ${(obj.confidence * 100).toFixed(1)}%
      <span class="bbox">[${obj.bbox.map((n: number) => n.toFixed(0)).join(', ')}]</span>
    `;
    resultsList.appendChild(div);
  });
}

function resetConnection(socket: Socket) {
  console.log('Resetting connection...');
  
  isConnecting = false;
  isDetecting = false;
  isPhoneConnected = false;
  isVideoReady = false;
  
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
  }
  
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  
  clearDetections();
  
  // Clear video
  const video = (window as any).remoteVideo;
  if (video) {
    video.srcObject = null;
  }
  
  updateStatus('🔄 Connection reset - ready to wait for phone');
  updateButtonStates();
  
  if (socket) {
    socket.emit('session-reset');
  }
}

// Export performance metrics to JSON file
function exportMetricsToJSON() {
  try {
    // Create comprehensive metrics export
    const exportData = {
      timestamp: new Date().toISOString(),
      sessionData: {
        sessionStartTime: new Date(performanceMetrics.sessionStartTime).toISOString(),
        sessionDuration: Date.now() - performanceMetrics.sessionStartTime,
        overallStatus: performanceMetrics.overallStatus,
        connectionQuality: performanceMetrics.connectionQuality
      },
      latencyMetrics: {
        latencyMedian: performanceMetrics.latencyMedian,
        latencyP95: performanceMetrics.latencyP95,
        serverLatency: performanceMetrics.serverLatency,
        networkLatency: performanceMetrics.networkLatency,
        latencyHistory: performanceMetrics.latencyHistory
      },
      processingMetrics: {
        processedFps: performanceMetrics.processedFps,
        successRate: performanceMetrics.successRate,
        totalProcessed: performanceMetrics.totalProcessed,
        totalSuccessful: performanceMetrics.totalSuccessful,
        avgDetectionTime: performanceMetrics.avgDetectionTime,
        lastDetectionTime: performanceMetrics.lastDetectionTime
      },
      networkMetrics: {
        uplink: performanceMetrics.uplink,
        downlink: performanceMetrics.downlink,
        bytesReceived: performanceMetrics.bytesReceived,
        bytesSent: performanceMetrics.bytesSent,
        packetsReceived: performanceMetrics.packetsReceived,
        packetsLost: performanceMetrics.packetsLost,
        jitter: performanceMetrics.jitter,
        rtt: performanceMetrics.rtt,
        networkType: performanceMetrics.networkType
      },
      videoMetrics: {
        videoWidth: performanceMetrics.videoWidth,
        videoHeight: performanceMetrics.videoHeight,
        frameRate: performanceMetrics.frameRate
      },
      deviceMetrics: {
        cpuUsage: performanceMetrics.cpuUsage,
        memoryUsage: performanceMetrics.memoryUsage,
        batteryLevel: performanceMetrics.batteryLevel
      }
    };

    // Create blob and download
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const a = document.createElement('a');
    a.href = url;
    a.download = `webrtc-performance-metrics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Clean up
    URL.revokeObjectURL(url);
    
    console.log('✅ Performance metrics exported successfully');
    updateStatus('📥 Performance metrics exported to JSON file');
    
  } catch (error) {
    console.error('❌ Export failed:', error);
    updateStatus('❌ Failed to export metrics: ' + (error as any).message);
  }
}

// Reset performance metrics
function resetPerformanceMetrics() {
  try {
    // Reset all metrics to initial values
    performanceMetrics.latencyMedian = 0;
    performanceMetrics.latencyP95 = 0;
    performanceMetrics.serverLatency = 0;
    performanceMetrics.networkLatency = 0;
    performanceMetrics.latencyHistory = [];
    
    performanceMetrics.processedFps = 0;
    performanceMetrics.successRate = 0;
    performanceMetrics.totalProcessed = 0;
    performanceMetrics.totalSuccessful = 0;
    
    performanceMetrics.uplink = 0;
    performanceMetrics.downlink = 0;
    
    performanceMetrics.detectionCount = 0;
    performanceMetrics.detectionStartTime = 0;
    performanceMetrics.avgDetectionTime = 0;
    performanceMetrics.lastDetectionTime = 0;
    performanceMetrics.fps = 0;
    
    performanceMetrics.bytesReceived = 0;
    performanceMetrics.bytesSent = 0;
    performanceMetrics.packetsReceived = 0;
    performanceMetrics.packetsLost = 0;
    performanceMetrics.jitter = 0;
    performanceMetrics.rtt = 0;
    
    performanceMetrics.videoWidth = 0;
    performanceMetrics.videoHeight = 0;
    performanceMetrics.frameRate = 0;
    
    performanceMetrics.cpuUsage = 0;
    performanceMetrics.memoryUsage = 0;
    performanceMetrics.batteryLevel = 0;
    performanceMetrics.networkType = 'unknown';
    
    // Reset session time but keep current status
    performanceMetrics.sessionStartTime = Date.now();
    performanceMetrics.connectionQuality = 'EXCELLENT';
    
    // Update display immediately
    updatePerformanceDisplay();
    
    console.log('🔄 Performance metrics reset successfully');
    updateStatus('🔄 Performance metrics have been reset');
    
  } catch (error) {
    console.error('❌ Reset failed:', error);
    updateStatus('❌ Failed to reset metrics: ' + (error as any).message);
  }
}

// Export metrics placeholder (keep for compatibility)
export function exportMetrics() {
  exportMetricsToJSON();
}
