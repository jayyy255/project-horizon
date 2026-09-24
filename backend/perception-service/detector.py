"""
UI Element Detector (OmniParser & YOLOv8 ONNX + RapidOCR Integration)
Real local perception pipeline:
Image -> YOLOv8 ONNX Detection -> RapidOCR Text Extraction -> NMS / Fusion -> Set-of-Marks Tagging
"""

import os
import time
from typing import List, Tuple, Dict, Any, Optional
import numpy as np
from PIL import Image
import onnxruntime as ort
from rapidocr_onnxruntime import RapidOCR
from som_visualizer import TaggedElement


class UIElementDetector:
    def __init__(self, model_path: Optional[str] = None):
        if not model_path:
            # Default to backend/perception-service/models/yolov8n.onnx
            base_dir = os.path.dirname(os.path.abspath(__file__))
            model_path = os.path.join(base_dir, "models", "yolov8n.onnx")

        self.model_path = model_path
        self.providers = ["CPUExecutionProvider"]
        
        # Check for DirectML availability on Windows
        available = ort.get_available_providers()
        if "DmlExecutionProvider" in available:
            self.providers = ["DmlExecutionProvider", "CPUExecutionProvider"]

        print(f"[UIElementDetector] Loading YOLOv8 ONNX model from: {self.model_path}")
        print(f"[UIElementDetector] Using execution providers: {self.providers}")

        self.session = ort.InferenceSession(self.model_path, providers=self.providers)
        self.input_name = self.session.get_inputs()[0].name
        self.input_shape = self.session.get_inputs()[0].shape  # [1, 3, 640, 640]

        print(f"[UIElementDetector] Initializing RapidOCR ONNX engine...")
        self.ocr = RapidOCR()
        print(f"[UIElementDetector] Perception pipeline initialized successfully.")

    def preprocess_yolo(self, image: Image.Image) -> Tuple[np.ndarray, float, Tuple[int, int]]:
        """Letterbox resize to 640x640 for YOLOv8 ONNX inference."""
        orig_w, orig_h = image.size
        target_size = 640

        scale = min(target_size / orig_w, target_size / orig_h)
        new_w = int(orig_w * scale)
        new_h = int(orig_h * scale)

        resized = image.resize((new_w, new_h), Image.Resampling.BILINEAR)

        # Create padded 640x640 image
        pad_img = Image.new("RGB", (target_size, target_size), (114, 114, 114))
        pad_x = (target_size - new_w) // 2
        pad_y = (target_size - new_h) // 2
        pad_img.paste(resized, (pad_x, pad_y))

        # Normalize to [0, 1] float32 NCHW
        np_img = np.array(pad_img, dtype=np.float32) / 255.0
        np_img = np_img.transpose(2, 0, 1)  # HWC -> CHW
        input_tensor = np.expand_dims(np_img, axis=0)  # [1, 3, 640, 640]

        return input_tensor, scale, (pad_x, pad_y)

    def detect_elements(self, image: Image.Image, conf_threshold: float = 0.20, iou_threshold: float = 0.45) -> List[TaggedElement]:
        """
        Runs real YOLOv8 object detection combined with RapidOCR text extraction.
        Fuses detections, eliminates duplicates via NMS, and returns TaggedElement list.
        """
        orig_w, orig_h = image.size
        elements: List[TaggedElement] = []

        # 1. Real RapidOCR text detection and recognition
        np_cv = np.array(image.convert("RGB"))
        ocr_boxes: List[Dict[str, Any]] = []
        try:
            ocr_results, _ = self.ocr(np_cv)
            if ocr_results:
                for item in ocr_results:
                    box, text, score = item[0], item[1], float(item[2])
                    if score >= 0.4 and len(text.strip()) > 0:
                        xs = [pt[0] for pt in box]
                        ys = [pt[1] for pt in box]
                        xmin, xmax = int(min(xs)), int(max(xs))
                        ymin, ymax = int(min(ys)), int(max(ys))
                        ocr_boxes.append({
                            "coords": (max(0, ymin), max(0, xmin), min(orig_h, ymax), min(orig_w, xmax)),
                            "label": text.strip(),
                            "confidence": score,
                            "type": "text" if len(text) > 12 else "button"
                        })
        except Exception as e:
            print(f"[UIElementDetector] OCR warning: {e}")

        # 2. Real YOLOv8 ONNX object detection
        input_tensor, scale, (pad_x, pad_y) = self.preprocess_yolo(image)
        outputs = self.session.run(None, {self.input_name: input_tensor})
        # Output shape: [1, 84, 8400]
        raw_output = outputs[0][0]  # [84, 8400]
        # Transpose to [8400, 84] -> [x, y, w, h, class_probs...]
        predictions = raw_output.T

        boxes = []
        confidences = []
        class_ids = []

        for pred in predictions:
            scores = pred[4:]
            class_id = np.argmax(scores)
            confidence = scores[class_id]
            if confidence >= conf_threshold:
                cx, cy, w, h = pred[0], pred[1], pred[2], pred[3]
                # Unpad and scale back to original image
                x0 = (cx - w / 2 - pad_x) / scale
                y0 = (cy - h / 2 - pad_y) / scale
                x1 = (cx + w / 2 - pad_x) / scale
                y1 = (cy + h / 2 - pad_y) / scale

                x0 = max(0, min(orig_w - 1, int(x0)))
                y0 = max(0, min(orig_h - 1, int(y0)))
                x1 = max(x0 + 1, min(orig_w, int(x1)))
                y1 = max(y0 + 1, min(orig_h, int(y1)))

                boxes.append([x0, y0, x1 - x0, y1 - y0])
                confidences.append(float(confidence))
                class_ids.append(int(class_id))

        # 3. Apply Non-Maximum Suppression (NMS)
        import cv2
        indices = []
        if boxes:
            indices = cv2.dnn.NMSBoxes(boxes, confidences, conf_threshold, iou_threshold)

        yolo_candidates = []
        if len(indices) > 0:
            for idx in indices.flatten():
                x, y, w, h = boxes[idx]
                yolo_candidates.append({
                    "coords": (y, x, y + h, x + w),
                    "confidence": confidences[idx],
                    "type": "icon" if min(w, h) < 40 else "button",
                    "label": f"elem_{class_ids[idx]}"
                })

        # 4. Merge OCR detections with YOLO detections
        all_candidates = []
        # First priority: OCR detected elements (rich text labels)
        for ocr_elem in ocr_boxes:
            all_candidates.append(ocr_elem)

        # Second priority: YOLO detected UI shapes that don't heavily overlap OCR
        for y_elem in yolo_candidates:
            y_ymin, y_xmin, y_ymax, y_xmax = y_elem["coords"]
            overlap = False
            for o_elem in ocr_boxes:
                o_ymin, o_xmin, o_ymax, o_xmax = o_elem["coords"]
                # Compute IoU
                inter_xmin = max(y_xmin, o_xmin)
                inter_ymin = max(y_ymin, o_ymin)
                inter_xmax = min(y_xmax, o_xmax)
                inter_ymax = min(y_ymax, o_ymax)
                if inter_xmax > inter_xmin and inter_ymax > inter_ymin:
                    inter_area = (inter_xmax - inter_xmin) * (inter_ymax - inter_ymin)
                    y_area = (y_xmax - y_xmin) * (y_ymax - y_ymin)
                    if inter_area / (y_area + 1e-6) > 0.4:
                        overlap = True
                        break
            if not overlap:
                all_candidates.append(y_elem)

        # 5. Assign sequential tag IDs
        tag_id = 0
        # Sort candidates top-to-bottom, left-to-right
        all_candidates.sort(key=lambda c: (c["coords"][0] // 30, c["coords"][1]))

        for cand in all_candidates[:30]:  # Limit to top 30 key UI elements
            ymin, xmin, ymax, xmax = cand["coords"]
            elements.append(
                TaggedElement(
                    tag_id=tag_id,
                    coords=(ymin, xmin, ymax, xmax),
                    elem_type=cand.get("type", "button"),
                    label=cand.get("label", f"UI_Element_{tag_id}"),
                    confidence=cand.get("confidence", 0.90)
                )
            )
            tag_id += 1

        # Fallback if image was completely uniform/blank
        if not elements:
            cx, cy = orig_w // 2, orig_h // 2
            elements.append(
                TaggedElement(
                    tag_id=0,
                    coords=(cy - 20, cx - 60, cy + 20, cx + 60),
                    elem_type="button",
                    label="Center_Viewport",
                    confidence=0.99
                )
            )

        return elements
