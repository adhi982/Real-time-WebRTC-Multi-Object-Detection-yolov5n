import asyncio
import json
import logging
import os
import uuid
import base64
import io
import socket
import subprocess
from pathlib import Path

import cv2
import numpy as np
import requests
import qrcode
from fastapi import FastAPI, HTTPException, Form, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from aiortc import MediaStreamTrack, RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaRelay

# For YOLO
from PIL import Image
import torch
from ultralytics import YOLO

# --- Configuration ---
ROOT = Path(__file__).parent
YOLO_MODEL = "yolov5n.pt"  # YOLOv5 nano quantized for fastest inference
PORT = 8080

# --- FastAPI Setup ---
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Global variables ---
pcs = set()
relay = MediaRelay()

# --- Helper Functions ---
def get_local_ip():
    """Get the Windows host machine's IP address (not Docker container IP)"""
    try:
        # Method 1: Check for HOST_IP environment variable (set by docker-compose)
        host_ip = os.getenv('HOST_IP')
        if host_ip:
            print(f"Using HOST_IP from environment: {host_ip}")
            return host_ip
        
        # Method 2: For Docker, try to get host IP by connecting to external service
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(2)
        try:
            s.connect(('8.8.8.8', 80))
            container_ip = s.getsockname()[0]
            print(f"Container IP: {container_ip}")
            
            # If we're in Docker (172.x.x.x), use fallback
            if container_ip.startswith('172.'):
                print("Detected Docker container, using fallback IP")
                return "10.71.252.230"  # Your current network IP as fallback
            
            return container_ip
        finally:
            s.close()
        
        # Method 3: Try hostname resolution fallback
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        if not local_ip.startswith('127.'):
            print(f"Hostname resolution IP: {local_ip}")
            return local_ip
        
        return "localhost"
    except Exception as e:
        print(f"Error getting local IP: {e}")
        return "localhost"

def generate_qr_code(url: str) -> bytes:
    """Generate QR code for the given URL"""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Convert to bytes
    img_buffer = io.BytesIO()
    img.save(img_buffer, format='PNG')
    img_buffer.seek(0)
    return img_buffer.getvalue()

# --- YOLO Model Loading ---
model = None

def load_yolo_model():
    global model
    print(f"Loading YOLO model: {YOLO_MODEL}...")
    # YOLOv5n will be automatically downloaded from Ultralytics
    model = YOLO(YOLO_MODEL)
    print("YOLO model loaded successfully")
    print(f"Model device: {model.device}")
    print(f"Model names: {list(model.names.values())}")

# --- WebRTC Video Processing ---
class VideoTransformTrack(MediaStreamTrack):
    """
    A video stream track that passes through frames without modification.
    Detection is now handled via API calls from the frontend.
    """
    kind = "video"

    def __init__(self, track, transform):
        super().__init__()
        self.track = track
        self.transform = transform

    async def recv(self):
        frame = await self.track.recv()
        # Simply pass through the frame - detection is handled via API
        return frame

# --- API Models ---
class OfferModel(BaseModel):
    sdp: str
    type: str
    
class DetectionRequest(BaseModel):
    image: str
    queries: list[str] = ["person", "car", "bicycle", "motorcycle", "bus", "truck", "dog", "cat", "laptop", "phone", "book", "chair", "table", "cup", "bottle","Pen"]

# --- API Endpoints ---
@app.on_event("startup")
async def startup_event():
    load_yolo_model()
    print("\n" + "="*50)
    print("WebRTC YOLO Object Detection Server is running!")
    print(f"API is available at: http://localhost:{PORT}")
    print("="*50 + "\n")

@app.get("/")
async def get_root():
    return {"message": "WebRTC VLM Object Detection Server"}

@app.get("/network-info")
async def get_network_info():
    """Get network information for mobile access with both localhost and real IP options"""
    real_ip = get_local_ip()
    frontend_port_http = 3000  # HTTP Frontend port
    frontend_port_https = 3443  # HTTPS Frontend port
    
    return {
        "real_ip": real_ip,
        "localhost_ip": "localhost",
        # HTTP URLs (for localhost/desktop)
        "localhost_url": f"http://localhost:{frontend_port_http}",
        "localhost_phone_url": f"http://localhost:{frontend_port_http}/phone",
        # HTTPS URLs (for mobile access)
        "real_ip_url": f"https://{real_ip}:{frontend_port_https}",
        "real_ip_phone_url": f"https://{real_ip}:{frontend_port_https}/phone",
        # Backward compatibility
        "local_ip": real_ip,
        "frontend_url": f"https://{real_ip}:{frontend_port_https}",
        "phone_url": f"https://{real_ip}:{frontend_port_https}/phone"
    }

@app.get("/qr-code")
async def get_qr_code():
    """Generate QR code for phone interface access using HTTPS and real IP"""
    real_ip = get_local_ip()
    phone_url = f"https://{real_ip}:3443/phone"  # Use HTTPS for mobile camera access
    
    print(f"Generating QR code for: {phone_url}")
    qr_bytes = generate_qr_code(phone_url)
    
    return StreamingResponse(
        io.BytesIO(qr_bytes),
        media_type="image/png",
        headers={"Content-Disposition": "inline; filename=phone_qr.png"}
    )

@app.post("/offer")
async def offer(params: OfferModel):
    offer = RTCSessionDescription(sdp=params.sdp, type=params.type)
    
    pc = RTCPeerConnection()
    pcs.add(pc)
    
    @pc.on("connectionstatechange")
    async def on_connectionstatechange():
        print(f"Connection state is {pc.connectionState}")
        if pc.connectionState == "failed":
            await pc.close()
            pcs.discard(pc)
    
    # Handle incoming tracks
    @pc.on("track")
    def on_track(track):
        print(f"Track {track.kind} received")
        if track.kind == "video":
            pc.addTrack(VideoTransformTrack(relay.subscribe(track), transform="detect"))
    
    # Set remote description
    await pc.setRemoteDescription(offer)
    
    # Create answer
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    
    return {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}

@app.post("/detect")
async def detect_objects(detection: DetectionRequest):
    try:
        # Decode base64 image
        image_data = detection.image
        if "base64," in image_data:
            image_data = image_data.split("base64,")[1]
            
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        
        print(f"Processing image of size: {image.size}")
        
        # Convert PIL image to numpy array for YOLO
        img_array = np.array(image)
        
        # Run YOLO inference
        results = model(img_array, conf=0.25, iou=0.45)  # confidence and IoU thresholds
        
        # YOLO class names (COCO dataset)
        class_names = [
            'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
            'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
            'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
            'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
            'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
            'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
            'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake',
            'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop',
            'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
            'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
        ]
        
        # Get requested object queries
        requested_objects = detection.queries
        print(f"Requested objects: {requested_objects}")
        
        # Process YOLO results - Return ALL detections without filtering
        detections = []
        all_detected_objects = []  # For debugging
        
        for result in results:
            boxes = result.boxes
            if boxes is not None:
                for i, box in enumerate(boxes):
                    # Get class ID and confidence
                    class_id = int(box.cls[0])
                    confidence = float(box.conf[0])
                    class_name = class_names[class_id]
                    
                    all_detected_objects.append(f"{class_name}({confidence:.2f})")
                    
                    # Return ALL detections above a minimum confidence threshold
                    if confidence > 0.25:  # Lower threshold to see more detections
                        # Get bounding box coordinates (xyxy format)
                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                        
                        detection_item = {
                            "label": class_name,
                            "score": confidence,
                            "box": [x1, y1, x2, y2]
                        }
                        detections.append(detection_item)
        
        print(f"All detected objects: {all_detected_objects}")
        print(f"Returned detections (conf > 0.25): {len(detections)}")
        
        print(f"Final detections count: {len(detections)}")
        return {"detections": detections}
        
    except Exception as e:
        print(f"Detection error: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.on_event("shutdown")
async def shutdown_event():
    # Close all peer connections
    coros = [pc.close() for pc in pcs]
    await asyncio.gather(*coros)
    pcs.clear()

# --- Run the server ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
