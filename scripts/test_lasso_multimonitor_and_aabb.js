const { computeAABB, generateCatmullRomSVGPath } = require('../backend/agent-service/dist/backend/agent-service/src/math/aabb.js');
const assert = require('assert');

console.log('=== MULTI-MONITOR & AABB GEOMETRY TEST SUITE ===');

// 1. Normal Selection
console.log('\n[Test 1: Normal Selection]');
const normalPts = [
  { x: 200, y: 150 },
  { x: 600, y: 180 },
  { x: 550, y: 450 },
  { x: 180, y: 400 }
];
// minX: 180, maxX: 600 -> padded: 168 to 612 -> w: 444 (420 + 24)
// minY: 150, maxY: 450 -> padded: 138 to 462 -> h: 324 (300 + 24)
const normalBbox = computeAABB(normalPts, 12, { width: 1920, height: 1080 });
console.log('  Normal Bbox:', normalBbox);
assert.strictEqual(normalBbox.x, 168);
assert.strictEqual(normalBbox.y, 138);
assert.strictEqual(normalBbox.w, 444);
assert.strictEqual(normalBbox.h, 324);
console.log('  -> PASS: Exactly 12px padding on all 4 sides (w = unpadded + 24, h = unpadded + 24)');

// 2. Tiny Selection (1px movement or click point)
console.log('\n[Test 2: Tiny Selection]');
const tinyPts = [{ x: 300, y: 250 }, { x: 301, y: 251 }];
const tinyBbox = computeAABB(tinyPts, 12, { width: 1920, height: 1080 });
console.log('  Tiny Bbox:', tinyBbox);
// minX: 300 -> 288, maxX: 301 -> 313 -> w: 25
// minY: 250 -> 238, maxY: 251 -> 263 -> h: 25
assert.strictEqual(tinyBbox.x, 288);
assert.strictEqual(tinyBbox.y, 238);
assert.strictEqual(tinyBbox.w, 25);
assert.strictEqual(tinyBbox.h, 25);
console.log('  -> PASS: Exactly 12px outward padding around tiny selection');

// 3. Edge Selection (Right & Bottom Edges)
console.log('\n[Test 3: Edge Selection]');
const rightEdgePts = [{ x: 1910, y: 300 }, { x: 1918, y: 500 }];
const edgeBbox = computeAABB(rightEdgePts, 12, { width: 1920, height: 1080 });
console.log('  Right Edge Bbox:', edgeBbox);
// minX: 1910 - 12 = 1898
// maxX: 1918 + 12 = 1930 -> clamped to 1920 -> w: 1920 - 1898 = 22
assert.strictEqual(edgeBbox.x, 1898);
assert.strictEqual(edgeBbox.w, 22);
assert.strictEqual(edgeBbox.x + edgeBbox.w, 1920);
console.log('  -> PASS: Clamped cleanly to right display edge (1920)');

// 4. Corner Selections (Top-Left & Bottom-Right)
console.log('\n[Test 4: Corner Selections]');
// Top-Left corner at (0, 0)
const tlPts = [{ x: 3, y: 5 }];
const tlBbox = computeAABB(tlPts, 12, { width: 1920, height: 1080 });
console.log('  Top-Left Corner Bbox:', tlBbox);
// minX: 3 - 12 = -9 -> clamped to 0
// minY: 5 - 12 = -7 -> clamped to 0
// maxX: 3 + 12 = 15 -> w: 15
// maxY: 5 + 12 = 17 -> h: 17
assert.strictEqual(tlBbox.x, 0);
assert.strictEqual(tlBbox.y, 0);
assert.strictEqual(tlBbox.w, 15);
assert.strictEqual(tlBbox.h, 17);

// Bottom-Right corner at (1920, 1080)
const brPts = [{ x: 1917, y: 1077 }];
const brBbox = computeAABB(brPts, 12, { width: 1920, height: 1080 });
console.log('  Bottom-Right Corner Bbox:', brBbox);
assert.strictEqual(brBbox.x, 1905); // 1917 - 12 = 1905
assert.strictEqual(brBbox.y, 1065); // 1077 - 12 = 1065
assert.strictEqual(brBbox.x + brBbox.w, 1920); // clamped to 1920
assert.strictEqual(brBbox.y + brBbox.h, 1080); // clamped to 1080
console.log('  -> PASS: Clamped cleanly at both (0, 0) and (1920, 1080) corners');

// 5. Multi-Monitor Setup
console.log('\n[Test 5: Multi-Monitor Geometry & Coordinate Transforms]');
// Dual display configuration:
// Monitor 1: (0, 0) 1920x1080
// Monitor 2: (1920, 0) 1920x1080
// Virtual Span: (0, 0) 3840x1080
const virtualDesktop = { x: 0, y: 0, width: 3840, height: 1080 };

// 5a. Monitor 1 only selection
const m1Pts = [{ x: 100, y: 100 }, { x: 800, y: 600 }];
const m1Bbox = computeAABB(m1Pts, 12, virtualDesktop);
console.log('  Monitor 1 Only Bbox:', m1Bbox);
assert.strictEqual(m1Bbox.x, 88);
assert.strictEqual(m1Bbox.w, 724);
assert.ok(m1Bbox.x + m1Bbox.w < 1920, 'Selection must remain strictly on monitor 1');

// 5b. Monitor 2 only selection
const m2Pts = [{ x: 2200, y: 100 }, { x: 3000, y: 600 }];
const m2Bbox = computeAABB(m2Pts, 12, virtualDesktop);
console.log('  Monitor 2 Only Bbox:', m2Bbox);
assert.strictEqual(m2Bbox.x, 2188);
assert.strictEqual(m2Bbox.w, 824);
assert.ok(m2Bbox.x >= 1920, 'Selection must remain strictly on monitor 2');

// 5c. Across Monitor Boundary Selection (crosses x = 1920 seamlessly)
const crossPts = [{ x: 1800, y: 200 }, { x: 2100, y: 500 }];
const crossBbox = computeAABB(crossPts, 12, virtualDesktop);
console.log('  Across Monitor Boundary Bbox:', crossBbox);
assert.strictEqual(crossBbox.x, 1788); // in monitor 1
assert.strictEqual(crossBbox.x + crossBbox.w, 2112); // into monitor 2
assert.strictEqual(crossBbox.w, 324); // (2100 - 1800) + 24 = 324
assert.ok(crossBbox.x < 1920 && (crossBbox.x + crossBbox.w) > 1920, 'Bbox must span across the 1920 boundary');

// 5d. Coordinate transforms with negative origin offset (Monitor 2 at left: x = -1920)
const leftOffsetVirtual = { x: -1920, y: 0, width: 3840, height: 1080 };
const leftMonitorPts = [{ x: -800, y: 100 }, { x: -200, y: 400 }];
const leftBbox = computeAABB(leftMonitorPts, 12, leftOffsetVirtual);
console.log('  Negative Origin Monitor Bbox:', leftBbox);
assert.strictEqual(leftBbox.x, -812);
assert.strictEqual(leftBbox.w, 624);
assert.strictEqual(leftBbox.y, 88);
assert.strictEqual(leftBbox.h, 324);

console.log('  -> PASS: Multi-monitor coordinate transforms verified seamlessly across all monitors');

// 6. Catmull-Rom Smooth Path Generation
console.log('\n[Test 6: Catmull-Rom Smoothing]');
const path = generateCatmullRomSVGPath(normalPts, true);
assert.ok(path.startsWith('M 200 150'));
assert.ok(path.includes(' C '));
assert.ok(path.endsWith(' Z'));
console.log(`  SVG Path: ${path.substring(0, 50)}...`);
console.log('  -> PASS: Valid Catmull-Rom spline path generated');

console.log('\n============================================================');
console.log('ALL AABB & MULTI-MONITOR GEOMETRY TESTS PASSED (100% SUCCESS)');
console.log('============================================================\n');
