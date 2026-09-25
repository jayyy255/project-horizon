export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ScreenDimensions {
  width: number;
  height: number;
  x?: number; // Origin offset for multi-monitor setups (default: 0)
  y?: number; // Origin offset for multi-monitor setups (default: 0)
}

/**
 * Computes the Axis-Aligned Bounding Box (AABB) enclosing freehand lasso points
 * with exactly 12px outward padding per Project Horizon §3.1 before clamping to monitor bounds.
 */
export function computeAABB(
  points: Point[],
  padding = 12,
  screenLimit?: ScreenDimensions
): BoundingBox {
  if (!points || points.length === 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pt of points) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
      continue;
    }
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  if (minX === Infinity || minY === Infinity) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  // Exactly 12px outward padding before clamping
  const paddedMinX = Math.floor(minX - padding);
  const paddedMinY = Math.floor(minY - padding);
  const paddedMaxX = Math.ceil(maxX + padding);
  const paddedMaxY = Math.ceil(maxY + padding);

  const boundMinX = screenLimit?.x ?? 0;
  const boundMinY = screenLimit?.y ?? 0;

  if (screenLimit) {
    const boundMaxX = boundMinX + screenLimit.width;
    const boundMaxY = boundMinY + screenLimit.height;

    const clampedX = Math.max(boundMinX, paddedMinX);
    const clampedY = Math.max(boundMinY, paddedMinY);
    const clampedMaxX = Math.min(boundMaxX, paddedMaxX);
    const clampedMaxY = Math.min(boundMaxY, paddedMaxY);

    const w = Math.max(0, clampedMaxX - clampedX);
    const h = Math.max(0, clampedMaxY - clampedY);

    return {
      x: clampedX,
      y: clampedY,
      w,
      h,
    };
  }

  // Clamped to non-negative by default when no screenLimit specified
  const clampedX = Math.max(boundMinX, paddedMinX);
  const clampedY = Math.max(boundMinY, paddedMinY);
  const w = Math.max(0, paddedMaxX - clampedX);
  const h = Math.max(0, paddedMaxY - clampedY);

  return {
    x: clampedX,
    y: clampedY,
    w,
    h,
  };
}

/**
 * Evaluates a 2D Catmull-Rom spline point between p1 and p2 with control points p0 and p3.
 */
export function catmullRomPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const t2 = t * t;
  const t3 = t2 * t;

  const x =
    0.5 *
    (2 * p1.x +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);

  const y =
    0.5 *
    (2 * p1.y +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

  return { x, y };
}

/**
 * Generates smooth SVG path string from arbitrary freehand lasso points using Catmull-Rom interpolation.
 */
export function generateCatmullRomSVGPath(points: Point[], closed = true): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  const pts = closed ? [...points, points[0], points[1]] : points;

  for (let i = 0; i < pts.length - 3; i++) {
    const p0 = i === 0 ? pts[0] : pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  if (closed) d += ' Z';
  return d;
}
