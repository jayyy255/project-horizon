import { describe, it, expect } from 'vitest';
import { computeAABB, generateCatmullRomSVGPath } from '../math/aabb.js';

describe('TC-U-01: AABB Math and Bounding Box Padding', () => {
  it('computes exact bounding box with 12px padding around freehand points', () => {
    const points = [
      { x: 100, y: 100 },
      { x: 200, y: 150 },
      { x: 150, y: 300 },
      { x: 50, y: 200 },
    ];

    const bbox = computeAABB(points, 12);

    // minX = 50 -> paddedX = 38
    // minY = 100 -> paddedY = 88
    // maxX = 200 -> paddedMaxX = 212
    // maxY = 300 -> paddedMaxY = 312
    // w = 212 - 38 = 174
    // h = 312 - 88 = 224
    expect(bbox.x).toBe(38);
    expect(bbox.y).toBe(88);
    expect(bbox.w).toBe(174);
    expect(bbox.h).toBe(224);
  });

  it('handles edge points near (0, 0) without negative coordinates', () => {
    const points = [
      { x: 5, y: 8 },
      { x: 20, y: 25 },
    ];

    const bbox = computeAABB(points, 12);
    expect(bbox.x).toBe(0); // clamped to 0
    expect(bbox.y).toBe(0); // clamped to 0
    expect(bbox.w).toBe(32); // 20 + 12 = 32
    expect(bbox.h).toBe(37); // 25 + 12 = 37
  });

  it('clamps to screen bounds when provided', () => {
    const points = [
      { x: 1900, y: 1050 },
      { x: 1910, y: 1060 },
    ];

    const screen = { width: 1920, height: 1080 };
    const bbox = computeAABB(points, 12, screen);

    expect(bbox.x).toBe(1888);
    expect(bbox.y).toBe(1038);
    expect(bbox.x + bbox.w).toBeLessThanOrEqual(screen.width);
    expect(bbox.y + bbox.h).toBeLessThanOrEqual(screen.height);
  });

  it('guards against float overflow, NaN, and empty inputs', () => {
    expect(computeAABB([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    const invalidPts = [{ x: NaN, y: Infinity }, { x: 100, y: 200 }];
    const bbox = computeAABB(invalidPts, 12);
    expect(bbox.x).toBe(88);
    expect(bbox.y).toBe(188);
    expect(bbox.w).toBe(24);
    expect(bbox.h).toBe(24);
  });

  it('handles tiny selections (single point or 1px drag) with exactly 12px padding', () => {
    const singlePoint = [{ x: 500, y: 400 }];
    const bbox = computeAABB(singlePoint, 12);
    // minX = 500 -> 488, maxX = 500 -> 512, w = 24
    // minY = 400 -> 388, maxY = 400 -> 412, h = 24
    expect(bbox.x).toBe(488);
    expect(bbox.y).toBe(388);
    expect(bbox.w).toBe(24);
    expect(bbox.h).toBe(24);
  });

  it('clamps corner selections cleanly at (0, 0) and bottom-right', () => {
    const screen = { width: 1920, height: 1080 };

    // Top-left corner
    const topLeft = [{ x: 2, y: 4 }];
    const tlBbox = computeAABB(topLeft, 12, screen);
    expect(tlBbox.x).toBe(0); // 2 - 12 = -10 clamped to 0
    expect(tlBbox.y).toBe(0); // 4 - 12 = -8 clamped to 0
    expect(tlBbox.w).toBe(14); // 2 + 12 = 14
    expect(tlBbox.h).toBe(16); // 4 + 12 = 16

    // Bottom-right corner
    const bottomRight = [{ x: 1918, y: 1076 }];
    const brBbox = computeAABB(bottomRight, 12, screen);
    expect(brBbox.x).toBe(1906); // 1918 - 12 = 1906
    expect(brBbox.y).toBe(1064); // 1076 - 12 = 1064
    expect(brBbox.w).toBe(14); // clamped to 1920 (1920 - 1906 = 14)
    expect(brBbox.h).toBe(16); // clamped to 1080 (1080 - 1064 = 16)
  });

  it('clamps edge selections cleanly along display borders', () => {
    const screen = { width: 1920, height: 1080 };
    const rightEdge = [{ x: 1915, y: 500 }, { x: 1919, y: 550 }];
    const bbox = computeAABB(rightEdge, 12, screen);
    expect(bbox.x).toBe(1903);
    expect(bbox.x + bbox.w).toBe(1920); // exactly clamped at edge
    expect(bbox.w).toBe(17);
    expect(bbox.y).toBe(488);
    expect(bbox.h).toBe(74); // (550 - 500) + 24 = 74
  });

  it('supports multi-monitor geometry (monitor 1, monitor 2, and boundary crossing)', () => {
    // Dual monitor setup: Monitor 1 (0 to 1920), Monitor 2 (1920 to 3840) -> Virtual span: 3840 x 1080
    const dualScreen = { x: 0, y: 0, width: 3840, height: 1080 };

    // Monitor 1 only selection
    const m1Pts = [{ x: 200, y: 200 }, { x: 500, y: 400 }];
    const m1Bbox = computeAABB(m1Pts, 12, dualScreen);
    expect(m1Bbox.x).toBe(188);
    expect(m1Bbox.y).toBe(188);
    expect(m1Bbox.w).toBe(324);
    expect(m1Bbox.h).toBe(224);

    // Monitor 2 only selection
    const m2Pts = [{ x: 2100, y: 200 }, { x: 2400, y: 400 }];
    const m2Bbox = computeAABB(m2Pts, 12, dualScreen);
    expect(m2Bbox.x).toBe(2088);
    expect(m2Bbox.y).toBe(188);
    expect(m2Bbox.w).toBe(324);
    expect(m2Bbox.h).toBe(224);

    // Across monitor boundary selection (crosses x = 1920)
    const crossPts = [{ x: 1850, y: 300 }, { x: 2000, y: 500 }];
    const crossBbox = computeAABB(crossPts, 12, dualScreen);
    expect(crossBbox.x).toBe(1838); // spans from Monitor 1
    expect(crossBbox.x + crossBbox.w).toBe(2012); // into Monitor 2
    expect(crossBbox.w).toBe(174);
    expect(crossBbox.h).toBe(224);
  });

  it('supports multi-monitor coordinate transforms with negative origin offsets', () => {
    // Secondary monitor placed to the left: origin x = -1920, width = 3840
    const leftOffsetScreen = { x: -1920, y: 0, width: 3840, height: 1080 };

    const leftPts = [{ x: -1000, y: 200 }, { x: -800, y: 400 }];
    const bbox = computeAABB(leftPts, 12, leftOffsetScreen);
    expect(bbox.x).toBe(-1012); // exactly 12px outward padding
    expect(bbox.w).toBe(224);
    expect(bbox.y).toBe(188);
    expect(bbox.h).toBe(224);
  });

  it('generates valid Catmull-Rom SVG path strings', () => {
    const points = [
      { x: 68, y: 85 },
      { x: 390, y: 62 },
      { x: 410, y: 220 },
      { x: 110, y: 270 },
    ];

    const path = generateCatmullRomSVGPath(points, true);
    expect(path).toMatch(/^M \d+ \d+ C .+/);
    expect(path.endsWith('Z')).toBe(true);
  });
});
