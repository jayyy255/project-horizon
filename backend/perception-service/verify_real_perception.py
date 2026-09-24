"""
Phase 0 Step 0.3: REAL PERCEPTION VERIFICATION SCRIPT
Runs real YOLOv8 ONNX object detection and RapidOCR text recognition
against an actual screenshot of the user's real Windows desktop / VS Code.
Outputs JSON lookup table and renders tagged Set-of-Marks image.
"""

import os
import sys
import json
import time

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from PIL import Image
from detector import UIElementDetector
from som_visualizer import SoMVisualizer

def run_real_perception_verification():
    print("================================================================")
    print("[STEP 0.3] REAL PERCEPTION PIPELINE VERIFICATION")
    print("================================================================\n")

    screenshot_path = "C:/Users/Jay/.gemini/antigravity-ide/brain/5e251f9b-fb89-4476-914d-f189f4203a41/step4a_actual_desktop_capture.png"
    if not os.path.exists(screenshot_path):
        # Fallback to local screenshot if not found
        screenshot_path = os.path.abspath("../../step4a_actual_desktop_capture.png")

    print(f"Loading real Windows desktop screenshot: {screenshot_path}")
    image = Image.open(screenshot_path)
    print(f"Screenshot dimensions: {image.size[0]}x{image.size[1]} ({image.format or 'PNG'})")

    print("\nInitializing real perception pipeline (YOLOv8 ONNX + RapidOCR)...")
    init_start = time.perf_counter()
    detector = UIElementDetector()
    visualizer = SoMVisualizer()
    init_duration = (time.perf_counter() - init_start) * 1000
    print(f"✓ Detector & OCR engine loaded in {init_duration:.2f} ms")

    print("\nRunning inference on real desktop screenshot...")
    inf_start = time.perf_counter()
    elements = detector.detect_elements(image)
    inf_duration = (time.perf_counter() - inf_start) * 1000
    print(f"✓ Real inference completed in {inf_duration:.2f} ms")
    print(f"✓ Total interactable UI elements detected: {len(elements)}")

    print("\nRendering Set-of-Marks badges [0], [1], [2]... on real elements...")
    annotated_img, lookup_table = visualizer.render_badges(image, elements)

    # Save output tagged images
    artifact_out = "C:/Users/Jay/.gemini/antigravity-ide/brain/5e251f9b-fb89-4476-914d-f189f4203a41/phase0_real_som_tagged_screenshot.png"
    local_out = os.path.abspath("phase0_real_som_tagged_screenshot.png")
    annotated_img.save(artifact_out)
    annotated_img.save(local_out)
    print(f"✓ Tagged screenshot saved to artifact directory: {artifact_out}")
    print(f"✓ Tagged screenshot saved locally: {local_out}")

    print("\n================================================================")
    print("📊 REAL PERCEPTION DETECTION RESULTS (JSON LOOKUP TABLE):")
    print(json.dumps(lookup_table[:10], indent=2))
    if len(lookup_table) > 10:
        print(f"... and {len(lookup_table) - 10} more detected elements.")
    print("================================================================\n")

    return lookup_table

if __name__ == "__main__":
    run_real_perception_verification()
