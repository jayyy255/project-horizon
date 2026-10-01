"""
FastAPI Microservice for Screen Perception & Set-of-Marks (SoM) Grounding
Provides HTTP endpoints for the Agent Coordinator to call inspect_viewport().
"""

import io
import base64
import time
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from detector import UIElementDetector
from som_visualizer import SoMVisualizer

app = FastAPI(
    title="Project Horizon Perception Microservice",
    version="1.0.0",
    description="OmniParser UI Element Detection and Set-of-Marks Grounding Service",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

detector = UIElementDetector()
visualizer = SoMVisualizer()


class Base64ParseRequest(BaseModel):
    image_base64: str


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "horizon-perception-service",
        "backend": "CPU/DirectML",
        "timestamp": time.time(),
    }


@app.post("/api/parse_som")
def parse_som(request: Base64ParseRequest):
    """
    Parses a screen crop, runs OmniParser UI detection, overlays SoM badges,
    and returns a JSON lookup table with annotated image.
    """
    start_time = time.perf_counter()

    try:
        b64_str = request.image_base64
        if not b64_str or len(b64_str.strip()) < 16:
            raise ValueError(f"Received empty or truncated base64 string ({len(b64_str or '')} chars)")
        if "," in b64_str:
            b64_str = b64_str.split(",", 1)[1]
        b64_str = b64_str.strip().replace("\n", "").replace("\r", "").replace(" ", "+")
        raw_data = base64.b64decode(b64_str)
        if len(raw_data) < 16:
            raise ValueError(f"Decoded byte buffer is too short ({len(raw_data)} bytes). Expected valid image binary.")
        # Check magic bytes for PNG (\x89PNG) or JPEG (\xff\xd8\xff) or BMP (BM)
        if not (raw_data.startswith(b'\x89PNG') or raw_data.startswith(b'\xff\xd8\xff') or raw_data.startswith(b'BM')):
            first_bytes = raw_data[:8].hex()
            print(f"[parse_som] Warning: unrecognized image magic bytes: {first_bytes}")
        image = Image.open(io.BytesIO(raw_data))
        if image.mode != "RGB":
            image = image.convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image data: {str(e)}")

    # 1. Detect UI Elements
    elements = detector.detect_elements(image)

    # 2. Render Set-of-Marks Badges
    annotated_img, lookup_table = visualizer.render_badges(image, elements)

    # 3. Encode annotated image back to base64
    buffer = io.BytesIO()
    annotated_img.save(buffer, format="PNG")
    annotated_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

    duration_ms = (time.perf_counter() - start_time) * 1000

    return {
        "status": "success",
        "elements": lookup_table,
        "element_count": len(lookup_table),
        "annotated_image_base64": annotated_b64,
        "latency_ms": round(duration_ms, 2),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=4200)
