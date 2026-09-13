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
