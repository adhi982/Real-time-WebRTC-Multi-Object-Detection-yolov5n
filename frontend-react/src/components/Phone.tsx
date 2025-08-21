import React, { useState, useRef, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

const Phone: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState('Ready to setup camera');
  const [zoomLevel, setZoomLevel] = useState(1.0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ];

  useEffect(() => {
    // Connect to signaling server
    const socket = io(window.location.origin);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('📱 Connected to signaling server');
      socket.emit('register-role', { role: 'phone' });
      setIsConnected(true);
      setStatus('Connected to server');
    });

    socket.on('disconnect', () => {
      console.log('📱 Disconnected from signaling server');
      setIsConnected(false);
      setStatus('Disconnected from server');
    });

    // Listen for answer from browser
    socket.on('answer', async (answer) => {
      console.log('📱 Received answer from browser');
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(answer);
          console.log('📱 Set remote description');
          setStatus('Connected to browser');
        }
      } catch (error) {
        console.error('📱 Error handling answer:', error);
        setStatus('Error connecting to browser');
      }
    });

    // Listen for ICE candidates from browser
    socket.on('ice-candidate', async (data) => {
      console.log('📱 Received ICE candidate from browser');
      try {
        if (peerConnectionRef.current && data.candidate) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
          console.log('📱 Added ICE candidate');
        }
      } catch (error) {
        console.error('📱 Error adding ICE candidate:', error);
      }
    });

    // Listen for IP changes from server
    socket.on('ip-changed', (data: { newIP: string }) => {
      console.log(`📱 Phone: IP changed to ${data.newIP}`);
      setStatus(`📡 Network changed to ${data.newIP}. You can continue using this connection.`);
      
      // If currently streaming, show a brief notification but don't disconnect
      if (isStreaming && hasCamera) {
        setTimeout(() => {
          setStatus('✅ Streaming to browser');
        }, 3000); // Show the IP change message for 3 seconds, then revert
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const setupCamera = async () => {
    try {
      setStatus('Requesting camera access...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use back camera if available
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 }
        },
        audio: false
      });

      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setHasCamera(true);
      setStatus('Camera ready - you can now connect to browser');
      console.log('📱 Camera setup complete');
      
      // Apply initial zoom if not default
      if (zoomLevel !== 1.0) {
        applyZoom(zoomLevel);
      }
      
    } catch (error) {
      console.error('📱 Camera setup failed:', error);
      setStatus('Camera access denied. Please use HTTPS and allow camera permissions.');
    }
  };

  const handleZoomIn = () => {
    const newZoom = Math.min(zoomLevel + 0.2, 3.0); // Max zoom 3x
    setZoomLevel(newZoom);
    applyZoom(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoomLevel - 0.2, 0.5); // Min zoom 0.5x
    setZoomLevel(newZoom);
    applyZoom(newZoom);
  };

  const applyZoom = async (zoom: number) => {
    if (streamRef.current && hasCamera) {
      try {
        const videoTrack = streamRef.current.getVideoTracks()[0];
        const capabilities = videoTrack.getCapabilities() as any;
        
        if (capabilities && capabilities.zoom) {
          await videoTrack.applyConstraints({
            advanced: [{ zoom: zoom } as any]
          });
          setStatus(`Camera zoom: ${zoom.toFixed(1)}x (hardware)`);
        } else {
          // Fallback: Apply CSS transform zoom to video element
          if (videoRef.current) {
            videoRef.current.style.transform = `scale(${1/zoom})`;
            videoRef.current.style.transformOrigin = 'center center';
          }
          setStatus(`Camera zoom: ${zoom.toFixed(1)}x (software)`);
        }
      } catch (error) {
        console.log('Hardware zoom not supported, using CSS transform');
        if (videoRef.current) {
          videoRef.current.style.transform = `scale(${1/zoom})`;
          videoRef.current.style.transformOrigin = 'center center';
        }
        setStatus(`Camera zoom: ${zoom.toFixed(1)}x (software)`);
      }
    }
  };

  const connectToBrowser = async () => {
    if (!hasCamera || !streamRef.current || !socketRef.current) {
      setStatus('Please setup camera first');
      return;
    }

    try {
      setStatus('Connecting to browser...');

      // Create peer connection
      const peerConnection = new RTCPeerConnection({ iceServers });
      peerConnectionRef.current = peerConnection;

      // Add stream to peer connection
      streamRef.current.getTracks().forEach(track => {
        if (streamRef.current) {
          peerConnection.addTrack(track, streamRef.current);
        }
      });

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          console.log('📱 Sending ICE candidate to browser');
          socketRef.current.emit('ice-candidate', event.candidate);
        }
      };

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log('📱 Connection state:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
          setIsStreaming(true);
          setStatus('✅ Streaming to browser');
        } else if (peerConnection.connectionState === 'failed') {
          setStatus('❌ Connection failed');
          setIsStreaming(false);
        }
      };

      // Create and send offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      
      socketRef.current.emit('offer', offer);
      console.log('📱 Sent offer to browser');
      setStatus('Offer sent - waiting for browser response...');

    } catch (error) {
      console.error('📱 Error connecting to browser:', error);
      setStatus('Error connecting to browser');
    }
  };

  const disconnect = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setHasCamera(false);
    setIsStreaming(false);
    setStatus('Disconnected');
  };

  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#f0f0f0',
      minHeight: '100vh'
    }}>
      <h1 style={{ color: '#333', textAlign: 'center' }}>📱 Phone Camera</h1>
      
      {/* Status */}
      <div style={{
        backgroundColor: isConnected ? '#d4edda' : '#f8d7da',
        color: isConnected ? '#155724' : '#721c24',
        padding: '10px',
        borderRadius: '5px',
        marginBottom: '20px',
        textAlign: 'center'
      }}>
        Status: {status}
      </div>

      {/* Video Preview */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            maxWidth: '400px',
            border: '2px solid #333',
            borderRadius: '10px',
            backgroundColor: '#000'
          }}
        />
      </div>

      {/* Control Buttons */}
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={setupCamera}
          disabled={hasCamera}
          style={{
            backgroundColor: hasCamera ? '#6c757d' : '#007bff',
            color: 'white',
            padding: '15px 25px',
            border: 'none',
            borderRadius: '5px',
            fontSize: '16px',
            margin: '5px',
            cursor: hasCamera ? 'not-allowed' : 'pointer'
          }}
        >
          📷 Setup Camera
        </button>

        <button
          onClick={connectToBrowser}
          disabled={!hasCamera || isStreaming}
          style={{
            backgroundColor: (!hasCamera || isStreaming) ? '#6c757d' : '#28a745',
            color: 'white',
            padding: '15px 25px',
            border: 'none',
            borderRadius: '5px',
            fontSize: '16px',
            margin: '5px',
            cursor: (!hasCamera || isStreaming) ? 'not-allowed' : 'pointer'
          }}
        >
          🔗 Connect to Browser
        </button>

        <button
          onClick={disconnect}
          disabled={!hasCamera && !isStreaming}
          style={{
            backgroundColor: (!hasCamera && !isStreaming) ? '#6c757d' : '#dc3545',
            color: 'white',
            padding: '15px 25px',
            border: 'none',
            borderRadius: '5px',
            fontSize: '16px',
            margin: '5px',
            cursor: (!hasCamera && !isStreaming) ? 'not-allowed' : 'pointer'
          }}
        >
          ❌ Disconnect
        </button>
      </div>

      {/* Zoom Controls */}
      {hasCamera && (
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <h3 style={{ color: '#333', marginBottom: '10px' }}>🔍 Camera Zoom Controls</h3>
          
          <div style={{ 
            backgroundColor: '#e9ecef',
            padding: '15px',
            borderRadius: '10px',
            marginBottom: '15px'
          }}>
            <div style={{ marginBottom: '10px', fontSize: '18px', fontWeight: 'bold' }}>
              Current Zoom: {zoomLevel.toFixed(1)}x
            </div>
            
            <button
              onClick={handleZoomOut}
              disabled={zoomLevel <= 0.5}
              style={{
                backgroundColor: zoomLevel <= 0.5 ? '#6c757d' : '#17a2b8',
                color: 'white',
                padding: '12px 20px',
                border: 'none',
                borderRadius: '5px',
                fontSize: '16px',
                margin: '5px',
                cursor: zoomLevel <= 0.5 ? 'not-allowed' : 'pointer'
              }}
            >
              🔍➖ Zoom Out
            </button>

            <button
              onClick={handleZoomIn}
              disabled={zoomLevel >= 3.0}
              style={{
                backgroundColor: zoomLevel >= 3.0 ? '#6c757d' : '#28a745',
                color: 'white',
                padding: '12px 20px',
                border: 'none',
                borderRadius: '5px',
                fontSize: '16px',
                margin: '5px',
                cursor: zoomLevel >= 3.0 ? 'not-allowed' : 'pointer'
              }}
            >
              🔍➕ Zoom In
            </button>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div style={{
        backgroundColor: '#fff3cd',
        color: '#856404',
        padding: '15px',
        borderRadius: '5px',
        marginTop: '20px'
      }}>
        <h3>Instructions:</h3>
        <ol>
          <li>Click "Setup Camera" to access your camera</li>
          <li>Wait for camera to be ready</li>
          <li>Click "Connect to Browser" to start streaming</li>
          <li>Your video will appear on the main browser page</li>
        </ol>
        <p><strong>Note:</strong> Make sure you're using HTTPS and have granted camera permissions.</p>
      </div>
    </div>
  );
};

export default Phone;
