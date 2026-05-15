/**
 * lineGeometry.ts
 *
 * Pure geometric utilities for Cobb angle measurement.
 * All functions are stateless, deterministic, and unit-tested.
 *
 * References:
 *   Cobb JR (1948) — Outline for the study of scoliosis
 *   Caesarendra W et al. Diagnostics 2022;12:396 (ICC=0.995)
 *   Maeda Y et al. Scientific Reports 2023;13:14576 (ICC=0.973)
 */

import type { NormLine, NormPoint } from '@/types';

// ── Constants ─────────────────────────────────────────────────

const RAD_TO_DEG = 180 / Math.PI;
const EPSILON    = 1e-9;

// ── Basic vector operations ───────────────────────────────────

export function vectorLength(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

export function lineVector(line: NormLine): { dx: number; dy: number } {
  return { dx: line.x2 - line.x1, dy: line.y2 - line.y1 };
}

/** True if the line has non-zero length (both endpoints differ) */
export function isValidLine(line: NormLine): boolean {
  const { dx, dy } = lineVector(line);
  return vectorLength(dx, dy) > EPSILON;
}

/** Midpoint of a line segment */
export function lineMidpoint(line: NormLine): NormPoint {
  return { x: (line.x1 + line.x2) / 2, y: (line.y1 + line.y2) / 2 };
}

/** Inclination of a line in degrees from the horizontal.
 *  Positive = right end lower than left end.
 *  Returns NaN for zero-length lines.
 */
export function lineInclinationDeg(line: NormLine): number {
  const { dx, dy } = lineVector(line);
  if (vectorLength(dx, dy) < EPSILON) return NaN;
  return Math.atan2(dy, dx) * RAD_TO_DEG;
}

/** Unit normal (perpendicular) vector to a line, pointing upward */
export function lineNormal(line: NormLine): { nx: number; ny: number } {
  const { dx, dy } = lineVector(line);
  const len = vectorLength(dx, dy) || 1;
  // Rotate 90° counter-clockwise: (-dy, dx) → normalised
  return { nx: -dy / len, ny: dx / len };
}

// ── Intersection ──────────────────────────────────────────────

/** Returns the intersection point of two infinite lines, or null if parallel */
export function lineIntersection(
  a1: NormPoint, a2: NormPoint,
  b1: NormPoint, b2: NormPoint
): NormPoint | null {
  const dax = a2.x - a1.x, day = a2.y - a1.y;
  const dbx = b2.x - b1.x, dby = b2.y - b1.y;
  const cross = dax * dby - day * dbx;
  if (Math.abs(cross) < EPSILON) return null; // parallel or coincident
  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / cross;
  return { x: a1.x + t * dax, y: a1.y + t * day };
}

/** Perpendicular bisector of a line segment, returning two points `len` away from midpoint */
export function perpendicularBisector(
  line: NormLine,
  halfLen: number
): { p1: NormPoint; p2: NormPoint; mid: NormPoint } {
  const mid = lineMidpoint(line);
  const { nx, ny } = lineNormal(line);
  return {
    p1:  { x: mid.x + nx * halfLen, y: mid.y + ny * halfLen },
    p2:  { x: mid.x - nx * halfLen, y: mid.y - ny * halfLen },
    mid,
  };
}

/** Extend a line by factor `f` beyond each endpoint (0.2 = 20%) */
export function extendLine(
  line: NormLine,
  factor: number
): NormLine {
  const { dx, dy } = lineVector(line);
  return {
    x1: line.x1 - dx * factor, y1: line.y1 - dy * factor,
    x2: line.x2 + dx * factor, y2: line.y2 + dy * factor,
  };
}

// ── Cobb angle calculation ────────────────────────────────────

/**
 * Compute the Cobb angle (0–90°) between two endplate lines.
 *
 * Method: perpendicular-intersection (Cobb 1948 gold standard).
 * Always returns the acute angle regardless of line direction,
 * preventing the supplementary-angle error common in naive implementations.
 *
 * @param upperLine  Superior endplate of upper end vertebra
 * @param lowerLine  Inferior endplate of lower end vertebra
 * @returns Cobb angle in degrees [0, 90], or NaN if either line is degenerate
 */
export function cobbAngleFromLines(upperLine: NormLine, lowerLine: NormLine): number {
  if (!isValidLine(upperLine) || !isValidLine(lowerLine)) return NaN;

  // Compute inclinations (angle from horizontal)
  const a1 = Math.atan2(upperLine.y2 - upperLine.y1, upperLine.x2 - upperLine.x1);
  const a2 = Math.atan2(lowerLine.y2 - lowerLine.y1, lowerLine.x2 - lowerLine.x1);

  // Perpendicular directions
  const perp1 = a1 + Math.PI / 2;
  const perp2 = a2 + Math.PI / 2;

  let angle = Math.abs(perp1 - perp2) * RAD_TO_DEG;

  // Normalise to [0, 360)
  angle = ((angle % 360) + 360) % 360;
  // Take the acute angle: if > 180 use 360 - angle, then if > 90 use 180 - angle
  if (angle > 180) angle = 360 - angle;
  if (angle > 90)  angle = 180 - angle;

  return +angle.toFixed(1);
}

/**
 * Compute Cobb angle from two inclination angles (Maeda 2023 slope-delta method).
 * upperSlopeDeg: inclination of superior endplate of upper end vertebra (°)
 * lowerSlopeDeg: inclination of inferior endplate of lower end vertebra (°)
 */
export function cobbAngleFromSlopes(upperSlopeDeg: number, lowerSlopeDeg: number): number {
  let diff = Math.abs(upperSlopeDeg - lowerSlopeDeg);
  if (diff > 180) diff = 360 - diff;
  if (diff > 90)  diff = 180 - diff;
  return +diff.toFixed(1);
}

// ── AI result validation ──────────────────────────────────────

/**
 * Validates AI-reported Cobb angle against the geometric cross-check.
 * Returns true if the discrepancy is within the acceptable clinical threshold.
 *
 * Acceptable threshold: 5° (equal to inter-observer variability per Morrissy 1990)
 */
export function validateCobbConsistency(
  reportedCobb: number,
  upperLine: NormLine,
  lowerLine: NormLine,
  thresholdDeg = 5
): { consistent: boolean; computedCobb: number; discrepancy: number } {
  const computedCobb = cobbAngleFromLines(upperLine, lowerLine);
  const discrepancy  = Math.abs(reportedCobb - computedCobb);
  return {
    consistent:    discrepancy <= thresholdDeg,
    computedCobb,
    discrepancy,
  };
}

/**
 * Validates that a NormLine has all coordinates within [0, 1] and is non-degenerate.
 */
export function isValidNormLine(line: unknown): line is NormLine {
  if (!line || typeof line !== 'object') return false;
  const l = line as Record<string, unknown>;
  const coords = [l['x1'], l['y1'], l['x2'], l['y2']];
  if (coords.some(v => typeof v !== 'number' || !isFinite(v))) return false;
  if (coords.some(v => (v as number) < -0.05 || (v as number) > 1.05)) return false; // allow tiny float overshoot
  const asLine = line as NormLine;
  return isValidLine(asLine);
}

// ── Geometry helpers for canvas rendering ────────────────────

/** Convert normalised coordinate to canvas pixel, honouring letterbox offset */
export function normToCanvas(
  nx: number, ny: number,
  reg: { ox: number; oy: number; rw: number; rh: number }
): NormPoint {
  return { x: reg.ox + nx * reg.rw, y: reg.oy + ny * reg.rh };
}

/** Convert canvas pixel to normalised coordinate (clamped to [0,1]) */
export function canvasToNorm(
  cx: number, cy: number,
  reg: { ox: number; oy: number; rw: number; rh: number }
): NormPoint {
  return {
    x: Math.max(0, Math.min(1, (cx - reg.ox) / reg.rw)),
    y: Math.max(0, Math.min(1, (cy - reg.oy) / reg.rh)),
  };
}

/**
 * Compute the letterbox region in which an image is rendered on a canvas.
 * Handles object-fit:contain behaviour.
 */
export function computeLetterbox(
  imgW: number, imgH: number,
  canvasW: number, canvasH: number
): { ox: number; oy: number; rw: number; rh: number } {
  if (imgW <= 0 || imgH <= 0) return { ox: 0, oy: 0, rw: canvasW, rh: canvasH };
  const imgAspect    = imgW / imgH;
  const canvasAspect = canvasW / canvasH;
  let rw: number, rh: number, ox: number, oy: number;
  if (imgAspect > canvasAspect) {
    rw = canvasW; rh = canvasW / imgAspect;
    ox = 0; oy = (canvasH - rh) / 2;
  } else {
    rh = canvasH; rw = canvasH * imgAspect;
    ox = (canvasW - rw) / 2; oy = 0;
  }
  return { ox, oy, rw, rh };
}

/** Clamp a value to [min, max] */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
