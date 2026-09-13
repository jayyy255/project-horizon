"""
Set-of-Marks (SoM) Badge Visualizer
Renders distinct numbered badges ([0], [1], [2]...) over detected interactable UI elements.
Follows Project Horizon §3.3 & §7.9 (Celestial Cyan, Cobalt & Cosmic Ivory styling).
"""

from typing import List, Dict, Any, Tuple
from PIL import Image, ImageDraw, ImageFont


class TaggedElement:
    def __init__(
        self,
        tag_id: int,
        coords: Tuple[int, int, int, int],  # (ymin, xmin, ymax, xmax)
        elem_type: str = "button",
        label: str = "",
        confidence: float = 1.0,
    ):
        self.tag_id = tag_id
        self.coords = coords
        self.elem_type = elem_type
        self.label = label
        self.confidence = confidence

    @property
    def center(self) -> Tuple[int, int]:
        ymin, xmin, ymax, xmax = self.coords
        return ((xmin + xmax) // 2, (ymin + ymax) // 2)

    @property
    def size(self) -> Tuple[int, int]:
        ymin, xmin, ymax, xmax = self.coords
        return (xmax - xmin, ymax - ymin)

    def to_dict(self) -> Dict[str, Any]:
        ymin, xmin, ymax, xmax = self.coords
        w, h = self.size
        cx, cy = self.center
        return {
            "tag_id": self.tag_id,
            "coords": [ymin, xmin, ymax, xmax],
            "center": [cx, cy],
            "size": [w, h],
            "type": self.elem_type,
            "label": self.label,
            "confidence": round(self.confidence, 3),
        }


class SoMVisualizer:
    # Project Horizon Celestial & Cosmic Design Palette
    COLOR_BADGE_BG = (18, 40, 75)      # Deep Midnight Navy (#12284B)
    COLOR_BADGE_BORDER = (140, 193, 233) # Celestial Cyan (#8CC1E9)
    COLOR_BADGE_TEXT = (255, 248, 231)  # Cosmic Ivory (#FFF8E7)
    COLOR_BBOX_BORDER = (67, 139, 196)  # Cerulean Blue (#438BC4)

    def __init__(self, badge_padding: int = 4):
        self.badge_padding = badge_padding

    def render_badges(
        self,
        image: Image.Image,
        elements: List[TaggedElement]
    ) -> Tuple[Image.Image, List[Dict[str, Any]]]:
        """
        Draws bounding rectangles and numbered badges ([0], [1]...) over elements.
        Returns the annotated image and lookup table.
        """
        annotated = image.copy().convert("RGB")
        draw = ImageDraw.Draw(annotated)
        width, height = annotated.size

        lookup_table: List[Dict[str, Any]] = []

        for elem in elements:
            ymin, xmin, ymax, xmax = elem.coords

            # Coordinate sanity checks (TC-U-03 in-bounds requirement)
            xmin = max(0, min(xmin, width - 1))
            ymin = max(0, min(ymin, height - 1))
            xmax = max(xmin + 1, min(xmax, width))
            ymax = max(ymin + 1, min(ymax, height))

            # Draw bounding box
            draw.rectangle(
                [xmin, ymin, xmax, ymax],
                outline=self.COLOR_BBOX_BORDER,
                width=2
            )

            # Draw numbered badge at top-left of element
            badge_text = f"[{elem.tag_id}]"
            
            # Simple text bounding box estimate for default font
            badge_w = len(badge_text) * 8 + 8
            badge_h = 16

            bx1 = xmin
            by1 = max(0, ymin - badge_h)
            bx2 = min(width, bx1 + badge_w)
            by2 = by1 + badge_h

            # Draw badge background
            draw.rectangle([bx1, by1, bx2, by2], fill=self.COLOR_BADGE_BG, outline=self.COLOR_BADGE_BORDER)
            # Draw badge text
            draw.text((bx1 + 4, by1 + 2), badge_text, fill=self.COLOR_BADGE_TEXT)

            lookup_table.append(elem.to_dict())

        return annotated, lookup_table
