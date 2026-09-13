import time
import base64
import io
import pytest
from PIL import Image, ImageDraw
from som_visualizer import SoMVisualizer, TaggedElement
from fastapi.testclient import TestClient
from server import app


def test_tc_u_03_som_visualizer():
    """
    TC-U-03: SoM Visualizer
    Input: 800x600 synthetic PNG, 3 icons
    Pass Criteria: Correctly placed badges, Map length = 3, strictly in-bounds.
    """
    # Create 800x600 synthetic test image
    img = Image.new("RGB", (800, 600), color=(14, 17, 23))
    draw = ImageDraw.Draw(img)

    # 3 distinct icons/buttons
    # Icon 0: (ymin=50, xmin=50, ymax=100, xmax=100)
    # Icon 1: (ymin=200, xmin=300, ymax=260, xmax=420)
    # Icon 2: (ymin=450, xmin=600, ymax=520, xmax=720)
    test_elements = [
        TaggedElement(0, (50, 50, 100, 100), elem_type="icon", label="Terminal"),
        TaggedElement(1, (200, 300, 260, 420), elem_type="button", label="Build"),
        TaggedElement(2, (450, 600, 520, 720), elem_type="button", label="Deploy"),
    ]

    visualizer = SoMVisualizer()
    annotated, lookup_table = visualizer.render_badges(img, test_elements)

    # 1. Map length must equal 3
    assert len(lookup_table) == 3, f"Expected 3 items in lookup table, got {len(lookup_table)}"

    # 2. All coordinates must be strictly in-bounds (0 <= x <= 800, 0 <= y <= 600)
    for item in lookup_table:
        ymin, xmin, ymax, xmax = item["coords"]
        cx, cy = item["center"]
        w, h = item["size"]

        assert 0 <= xmin < xmax <= 800, f"X coordinates out of bounds: [{xmin}, {xmax}]"
        assert 0 <= ymin < ymax <= 600, f"Y coordinates out of bounds: [{ymin}, {ymax}]"
        assert xmin <= cx <= xmax, f"Center X {cx} not within [{xmin}, {xmax}]"
        assert ymin <= cy <= ymax, f"Center Y {cy} not within [{ymin}, {ymax}]"
        assert w > 0 and h > 0, "Dimensions must be positive"

    # Verify image dimensions preserved
    assert annotated.size == (800, 600)


def test_tc_i_02_parse_som_api():
    """
    TC-I-02: parse_som HTTP JSON-RPC endpoint
    Pass Criteria: Valid tagged-element JSON, 0 errors, duration <= 1000ms
    """
    client = TestClient(app)

    # Create synthetic test image and encode to base64
    img = Image.new("RGB", (800, 600), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    # Draw high contrast widgets
    draw.rectangle([50, 50, 200, 100], fill=(0, 85, 160))
    draw.rectangle([250, 50, 400, 100], fill=(67, 139, 196))
    draw.rectangle([450, 50, 600, 100], fill=(18, 40, 75))

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    b64_str = base64.b64encode(buffer.getvalue()).decode("utf-8")

    start_time = time.perf_counter()
    response = client.post("/api/parse_som", json={"image_base64": b64_str})
    elapsed_ms = (time.perf_counter() - start_time) * 1000

    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "success"
    assert "elements" in data
    assert len(data["elements"]) > 0
    assert "annotated_image_base64" in data
    assert elapsed_ms <= 1000, f"Latency {elapsed_ms}ms exceeded 1000ms SLA"
    print(f"[TC-I-02 Benchmark] parse_som latency: {elapsed_ms:.2f}ms (<=1000ms SLA)")
