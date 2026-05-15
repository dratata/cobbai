/**
 * spineMath.ts — Local deterministic spine measurement engine
 * Zero API cost. Used by AdvancedManualTool for offline Cobb measurement.
 */

export interface Point { x: number; y: number; }

/**
 * Calculate Cobb angle from 4 points defining 2 endplate lines.
 * p1-p2: upper endplate line (left to right)
 * p3-p4: lower endplate line (left to right)
 * Returns angle in degrees [0, 90].
 */
export function calculateCobbAngle(p1: Point, p2: Point, p3: Point, p4: Point): number {
  const dx1 = p2.x - p1.x, dy1 = p2.y - p1.y;
  const dx2 = p4.x - p3.x, dy2 = p4.y - p3.y;
  if (Math.hypot(dx1, dy1) < 1e-9 || Math.hypot(dx2, dy2) < 1e-9) return 0;
  // Use perpendicular intersection method (Cobb 1948 gold standard)
  const a1 = Math.atan2(dy1, dx1) + Math.PI / 2;
  const a2 = Math.atan2(dy2, dx2) + Math.PI / 2;
  let angle = Math.abs(a1 - a2) * 180 / Math.PI;
  if (angle > 180) angle = 360 - angle;
  if (angle > 90)  angle = 180 - angle;
  return Math.round(angle * 10) / 10;
}

/** Slope-based variant (Maeda 2023) */
export function calculateCobbFromSlopes(upperSlopeDeg: number, lowerSlopeDeg: number): number {
  let diff = Math.abs(upperSlopeDeg - lowerSlopeDeg);
  if (diff > 180) diff = 360 - diff;
  if (diff > 90)  diff = 180 - diff;
  return Math.round(diff * 10) / 10;
}

/** Classify Cobb angle severity (SRS standard) */
export function classifyCobbSeverity(deg: number): 'normal' | 'mild' | 'moderate' | 'severe' {
  if (deg < 10)  return 'normal';
  if (deg < 25)  return 'mild';
  if (deg < 45)  return 'moderate';
  return 'severe';
}

/** Euclidean distance between two points */
export function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
