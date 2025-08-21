import React, { useEffect, useRef } from 'react';
import Phone from './components/Phone';
import { connectSignalingServer, setupWebRTC, exportMetrics } from './utils/mainLogic';
import './App.css';

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Check if this is the phone page
  const isPhonePage = window.location.pathname === '/phone' || window.location.search.includes('phone=true');

  useEffect(() => {
    if (!isPhonePage && videoRef.current && canvasRef.current) {
      initializeMainApp();
    }
  }, [isPhonePage]);

  const initializeMainApp = async () => {
    try {
      const socket = await connectSignalingServer();
      if (videoRef.current && canvasRef.current) {
        setupWebRTC(videoRef.current, canvasRef.current, socket);
      }
      
      // Generate QR code and phone URL manually since the original function uses DOM manipulation
      generateQRCodeAndURL();
    } catch (error) {
      console.error('Failed to initialize app:', error);
    }
  };

  const generateQRCodeAndURL = async () => {
    try {
      // Get real IP address from server
      const configResponse = await fetch('/api/config');
      const config = await configResponse.json();
      const realIP = config.hostIp || '192.168.1.167'; // fallback IP
      
      // Determine the current protocol and port
      const protocol = window.location.protocol; // http: or https:
      const isHTTPS = protocol === 'https:';
      const port = isHTTPS ? '3443' : '3000';
      
      // Create both localhost and real IP URLs
      const localhostUrl = `${window.location.origin}/phone`;
      const realIPUrl = `${protocol}//${realIP}:${port}/phone`;
      
      // Update phone URL elements
      const phoneUrlElement = document.getElementById('phoneUrl') as HTMLInputElement;
      const realIPUrlElement = document.getElementById('realIPUrl') as HTMLInputElement;
      
      if (phoneUrlElement) {
        phoneUrlElement.value = localhostUrl;
      }
      
      if (realIPUrlElement) {
        realIPUrlElement.value = realIPUrl;
      }
      
      // Generate QR code with real IP URL (for phone scanning)
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(realIPUrl)}`;
      const qrCodeElement = document.getElementById('qrCode') as HTMLImageElement;
      const copyUrlButton = document.getElementById('copyUrlButton');
      const qrLoading = document.getElementById('qrLoading');
      
      if (qrCodeElement && copyUrlButton && qrLoading) {
        qrCodeElement.src = qrApiUrl;
        qrCodeElement.style.display = 'block';
        copyUrlButton.style.display = 'block';
        qrLoading.style.display = 'none';
      }
      
      // Update IP display
      const ipDisplayElement = document.getElementById('currentIP');
      if (ipDisplayElement) {
        ipDisplayElement.textContent = realIP;
      }
      
    } catch (error) {
      console.error('Failed to get real IP, using fallback:', error);
      // Fallback to localhost
      const serverUrl = window.location.origin;
      const phoneUrlValue = `${serverUrl}/phone`;
      
      const phoneUrlElement = document.getElementById('phoneUrl') as HTMLInputElement;
      if (phoneUrlElement) {
        phoneUrlElement.value = phoneUrlValue;
      }
      
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(phoneUrlValue)}`;
      const qrCodeElement = document.getElementById('qrCode') as HTMLImageElement;
      const copyUrlButton = document.getElementById('copyUrlButton');
      const qrLoading = document.getElementById('qrLoading');
      
      if (qrCodeElement && copyUrlButton && qrLoading) {
        qrCodeElement.src = qrApiUrl;
        qrCodeElement.style.display = 'block';
        copyUrlButton.style.display = 'block';
        qrLoading.style.display = 'none';
      }
    }
  };

  const handleExportMetrics = () => {
    exportMetrics();
  };

  const handleCopyUrl = () => {
    const realIPUrlElement = document.getElementById('realIPUrl') as HTMLInputElement;
    if (realIPUrlElement) {
      navigator.clipboard.writeText(realIPUrlElement.value);
      // Show feedback
      const button = document.getElementById('copyUrlButton');
      if (button) {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
      }
    }
  };

  const handleCopyLocalUrl = () => {
    const phoneUrlElement = document.getElementById('phoneUrl') as HTMLInputElement;
    if (phoneUrlElement) {
      navigator.clipboard.writeText(phoneUrlElement.value);
      // Show feedback
      const button = document.getElementById('copyLocalUrlButton');
      if (button) {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
      }
    }
  };

  const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const display = e.target.nextElementSibling;
    if (display) {
      display.textContent = `${value}ms`;
    }
  };

  const handleConfidenceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const display = e.target.nextElementSibling;
    if (display) {
      display.textContent = value;
    }
  };

  // Render phone interface if on phone page
  if (isPhonePage) {
    return <Phone />;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Navigation */}
      <nav className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold bg-gradient-to-r">
                🔍 Real-time Object Detection
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-400">WebRTC + Vision AI</span>
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Video Feed Section */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700">
                <h2 className="text-xl font-semibold flex items-center">
                  📹 Live Video Feed
                  <span id="status" className="ml-4 text-sm text-yellow-400">Waiting for connection...</span>
                </h2>
              </div>
              
              <div className="relative bg-black aspect-video">
                <video
                  ref={videoRef}
                  id="remoteVideo"
                  className="w-full h-full object-contain"
                  autoPlay
                  playsInline
                  muted
                />
                <canvas
                  ref={canvasRef}
                  id="overlay"
                  className="absolute top-0 left-0 w-full h-full pointer-events-none"
                />
                
                {/* Center crosshair */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-8 h-8 border-2 border-white border-opacity-30 rounded-full"></div>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="mt-6 bg-gray-800 rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-semibold mb-4">🎮 Controls</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button
                  id="connectButton"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-medium transition-colors"
                >
                  Wait for Phone Connection
                </button>
                <button
                  id="startDetectionButton"
                  disabled
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors"
                >
                  Start Detection
                </button>
                <button
                  id="stopButton"
                  disabled
                  className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors"
                >
                  Stop Detection
                </button>
                <button
                  id="resetButton"
                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-3 rounded-lg font-medium transition-colors"
                >
                  Reset
                </button>
              </div>
            </div>

            {/*Performance Metrics */}
            <div className="mt-6 bg-gray-800 rounded-xl border border-red-500 p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-red-400">📊Performance Metrics</h3>
                <div className="flex gap-3">
                  <button
                    id="exportMetricsButton"
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    📥 Export JSON
                  </button>
                  <button
                    id="resetMetricsButton"
                    className="bg-orange-600 hover:bg-orange-700 text-black px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    🔄 Reset
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Latency Metrics */}
                <div className="bg-gray-700 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-blue-400 mb-3">⚡ Latency Metrics</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-300">Latency (median):</span>
                      <span id="latencyMedian" className="text-blue-300 font-mono">0.0ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">Latency (P95):</span>
                      <span id="latencyP95" className="text-blue-300 font-mono">0.0ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">Server Latency:</span>
                      <span id="serverLatency" className="text-blue-300 font-mono">0.0ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">Network Latency:</span>
                      <span id="networkLatency" className="text-blue-300 font-mono">0.0ms</span>
                    </div>
                  </div>
                </div>

                {/* Processing Performance */}
                <div className="bg-gray-700 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-green-400 mb-3">🔄 Processing Performance</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-300">Processed FPS:</span>
                      <span id="processedFps" className="text-green-300 font-mono">0.0</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">Success Rate:</span>
                      <span id="successRate" className="text-green-300 font-mono">0.0%</span>
                    </div>
                  </div>
                </div>

                {/* Network Bandwidth */}
                <div className="bg-gray-700 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-yellow-400 mb-3">🌐 Network Bandwidth</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-300">Uplink:</span>
                      <span id="uplink" className="text-yellow-300 font-mono">0.0 kbps</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">Downlink:</span>
                      <span id="downlink" className="text-yellow-300 font-mono">0.0 kbps</span>
                    </div>
                  </div>
                </div>

                {/* Performance Summary */}
                <div className="bg-gray-700 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-cyan-400 mb-3">⚡ Performance Summary</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-300">Overall Status:</span>
                      <span id="overallStatus" className="text-cyan-300 font-mono">STANDBY</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">Uptime:</span>
                      <span id="sessionUptime" className="text-cyan-300 font-mono">00:00</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">Quality:</span>
                      <span id="connectionQuality" className="text-cyan-300 font-mono">EXCELLENT</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Phone Connection */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                Phone Connection
              </h3>
              
              {/* Current IP Display */}
              <div className="mb-4 p-3 bg-gray-700 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-300">Current System IP:</div>
                  <div className="flex items-center">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-2" title="Dynamic IP monitoring active"></span>
                  </div>
                </div>
                <div className="text-lg font-mono text-blue-400" id="currentIP">
                  Detecting...
                </div>
              </div>
              
              <div className="space-y-4">
                {/* Real IP URL for Phone Scanning */}
                <div>
                  <label className="block text-sm font-medium text-green-400 mb-2">
                    Phone URL (Real IP - Use this for phone scanning):
                  </label>
                  <div className="flex">
                    <input
                      type="text"
                      id="realIPUrl"
                      readOnly
                      className="flex-1 bg-gray-700 border border-green-600 rounded-l-lg px-3 py-2 text-sm text-green-300"
                      defaultValue="Loading..."
                    />
                    <button
                      id="copyUrlButton"
                      onClick={handleCopyUrl}
                      className="bg-green-600 hover:bg-green-700 px-3 py-2 rounded-r-lg text-sm font-medium transition-colors"
                      style={{ display: 'none' }}
                    >
                      📋 Copy
                    </button>
                  </div>
                </div>
                
                
                <div className="text-center">
                  <div id="qrLoading" className="text-gray-400">
                    Generating QR Code...
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm text-green-400 font-medium">
                      Scan with Phone Camera:
                    </div>
                    <img
                      id="qrCode"
                      className="mx-auto rounded-lg border border-green-600"
                      style={{ display: 'none' }}
                      alt="QR Code for Phone Access"
                    />
                    <div className="text-xs text-gray-400">
                      QR Code contains Real IP URL for direct phone access
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Detection Settings */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-semibold mb-4">⚙️ Detection Settings</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Detection Interval (ms):
                  </label>
                  <input
                    type="range"
                    id="detectionInterval"
                    min="100"
                    max="2000"
                    defaultValue="500"
                    className="w-full"
                    onChange={handleIntervalChange}
                  />
                  <div className="text-sm text-gray-400 mt-1">500ms</div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Confidence Threshold:
                  </label>
                  <input
                    type="range"
                    id="confidenceThreshold"
                    min="0.1"
                    max="0.9"
                    step="0.1"
                    defaultValue="0.5"
                    className="w-full"
                    onChange={handleConfidenceChange}
                  />
                  <div className="text-sm text-gray-400 mt-1">0.5</div>
                </div>
              </div>
            </div>

            {/* Detection Results */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-semibold mb-4">🎯 Detection Results</h3>
              <div id="resultsList" className="space-y-2 text-sm">
                <div className="text-gray-400 text-center py-4">
                  No detections yet
                </div>
              </div>
            </div>
           </div>
        </div>
      </div>
    </div>
  );
}

export default App;
