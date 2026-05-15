/**
 * lineGeometry.test.ts
 *
 * Unit tests for all geometric utilities.
 * These run in Node via Vitest — no browser required.
 */

import { describe, it, expect } from 'vitest';
import {
  cobbAngleFromLines,
  cobbAngleFromSlopes,
  validateCobbConsistency,
  isValidNormLine,
  lineInclinationDeg,
  lineMidpoint,
  extendLine,
  computeLetterbox,
  clamp,
} from '@/lib/lineGeometry';
import type { NormLine } from '@/types';

// ── Helpers ───────────────────────────────────────────────────

/** Horizontal line at given y */
function hLine(y: number, x1 = 0, x2 = 1): NormLine {
  return { x1, y1: y, x2, y2: y };
}

/** Line tilted by angleDeg from horizontal */
function tiltedLine(y: number, angleDeg: number): NormLine {
  const t = (angleDeg * Math.PI) / 180;
  return { x1: 0, y1: y, x2: 1, y2: y + Math.tan(t) };
}

// ── isValidNormLine ───────────────────────────────────────────

describe('isValidNormLine', () => {
  it('accepts a valid line', () => {
    expect(isValidNormLine({ x1:0.1, y1:0.2, x2:0.9, y2:0.3 })).toBe(true);
  });
  it('rejects zero-length line', () => {
    expect(isValidNormLine({ x1:0.5, y1:0.5, x2:0.5, y2:0.5 })).toBe(false);
  });
  it('rejects null', () => {
    expect(isValidNormLine(null)).toBe(false);
  });
  it('rejects missing fields', () => {
    expect(isValidNormLine({ x1:0.1, y1:0.2 })).toBe(false);
  });
  it('rejects out-of-range coords', () => {
    expect(isValidNormLine({ x1:-0.5, y1:0, x2:0.5, y2:0 })).toBe(false);
  });
  it('rejects NaN', () => {
    expect(isValidNormLine({ x1:NaN, y1:0, x2:0.5, y2:0 })).toBe(false);
  });
});

// ── cobbAngleFromLines ────────────────────────────────────────

describe('cobbAngleFromLines — basic correctness', () => {
  it('two horizontal lines → Cobb = 0°', () => {
    expect(cobbAngleFromLines(hLine(0.2), hLine(0.7))).toBeCloseTo(0, 1);
  });

  it('upper horizontal, lower tilted 20° → Cobb ≈ 20°', () => {
    expect(cobbAngleFromLines(hLine(0.2), tiltedLine(0.7, 20))).toBeCloseTo(20, 0);
  });

  it('symmetric tilt of 15° each → Cobb ≈ 30°', () => {
    expect(cobbAngleFromLines(tiltedLine(0.2, -15), tiltedLine(0.7, 15))).toBeCloseTo(30, 0);
  });

  it('perpendicular lines → Cobb = 90°', () => {
    const vertLine: NormLine = { x1:0.5, y1:0, x2:0.5, y2:1 };
    expect(cobbAngleFromLines(hLine(0.5), vertLine)).toBeCloseTo(90, 1);
  });

  it('mild 5° → Cobb ≈ 5°', () => {
    expect(cobbAngleFromLines(hLine(0.2), tiltedLine(0.7, 5))).toBeCloseTo(5, 0);
  });

  it('severe 55° → Cobb ≈ 55°', () => {
    expect(cobbAngleFromLines(hLine(0.2), tiltedLine(0.7, 55))).toBeCloseTo(55, 0);
  });
});

describe('cobbAngleFromLines — normalisation (always 0–90°)', () => {
  const cases = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 89];
  cases.forEach(a => {
    it(`${a}° input → result in [0, 90]`, () => {
      const r = cobbAngleFromLines(hLine(0.2), tiltedLine(0.7, a));
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(90);
    });
  });
});

describe('cobbAngleFromLines — direction independence', () => {
  const ul: NormLine = { x1:0.2, y1:0.2, x2:0.8, y2:0.22 };
  const ll: NormLine = { x1:0.2, y1:0.7, x2:0.8, y2:0.65 };
  const forward = cobbAngleFromLines(ul, ll);

  it('reversing upper endpoint gives same result', () => {
    const ulRev: NormLine = { x1:ul.x2, y1:ul.y2, x2:ul.x1, y2:ul.y1 };
    expect(cobbAngleFromLines(ulRev, ll)).toBeCloseTo(forward, 1);
  });

  it('reversing lower endpoint gives same result', () => {
    const llRev: NormLine = { x1:ll.x2, y1:ll.y2, x2:ll.x1, y2:ll.y1 };
    expect(cobbAngleFromLines(ul, llRev)).toBeCloseTo(forward, 1);
  });

  it('reversing both endpoints gives same result', () => {
    const ulRev: NormLine = { x1:ul.x2, y1:ul.y2, x2:ul.x1, y2:ul.y1 };
    const llRev: NormLine = { x1:ll.x2, y1:ll.y2, x2:ll.x1, y2:ll.y1 };
    expect(cobbAngleFromLines(ulRev, llRev)).toBeCloseTo(forward, 1);
  });
});

describe('cobbAngleFromLines — edge cases', () => {
  it('zero-length upper line → NaN', () => {
    const zero: NormLine = { x1:0.5, y1:0.5, x2:0.5, y2:0.5 };
    expect(isNaN(cobbAngleFromLines(zero, hLine(0.7)))).toBe(true);
  });

  it('near-parallel lines (0.1° apart) → Cobb ≈ 0°', () => {
    const r = cobbAngleFromLines(tiltedLine(0.2, 0.05), tiltedLine(0.7, 0.15));
    expect(r).toBeCloseTo(0.1, 0);
  });

  it('near-vertical lines (steep scoliosis) → in [0, 90]', () => {
    const steep: NormLine = { x1:0.5, y1:0, x2:0.52, y2:1 };
    const other: NormLine = { x1:0.5, y1:0.5, x2:0.48, y2:1.3 };
    const r = cobbAngleFromLines(steep, other);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(90);
  });

  it('very small 2° angle detected accurately', () => {
    expect(cobbAngleFromLines(hLine(0.2), tiltedLine(0.7, 2))).toBeCloseTo(2, 0);
  });

  it('noisy coordinates (±0.01 jitter) still within 2° of true value', () => {
    const trueCobb = cobbAngleFromLines(hLine(0.2), tiltedLine(0.7, 25));
    const noisyUpper: NormLine = { x1:0.01, y1:0.201, x2:0.99, y2:0.199 };
    const noisyLower: NormLine = tiltedLine(0.7 + 0.008, 24.7);
    const noisyCobb = cobbAngleFromLines(noisyUpper, noisyLower);
    expect(Math.abs(noisyCobb - trueCobb)).toBeLessThan(2);
  });
});

// ── cobbAngleFromSlopes ───────────────────────────────────────

describe('cobbAngleFromSlopes', () => {
  it('-8° and +20° → 28°', () => expect(cobbAngleFromSlopes(-8, 20)).toBeCloseTo(28, 1));
  it('0° and +15° → 15°',  () => expect(cobbAngleFromSlopes(0, 15)).toBeCloseTo(15, 1));
  it('+5° and -5° → 10°',  () => expect(cobbAngleFromSlopes(5, -5)).toBeCloseTo(10, 1));
  it('symmetric: (-20, 8) === (-8, 20)', () =>
    expect(cobbAngleFromSlopes(-20, 8)).toBeCloseTo(cobbAngleFromSlopes(-8, 20), 1));
  it('result always ≤ 90°', () =>
    expect(cobbAngleFromSlopes(-50, 50)).toBeLessThanOrEqual(90));
});

// ── validateCobbConsistency ───────────────────────────────────

describe('validateCobbConsistency', () => {
  it('consistent: AI says 25, geometry computes ~25', () => {
    const result = validateCobbConsistency(25, hLine(0.2), tiltedLine(0.7, 25));
    expect(result.consistent).toBe(true);
    expect(result.discrepancy).toBeLessThan(2);
  });

  it('inconsistent: AI says 45, geometry computes ~25', () => {
    const result = validateCobbConsistency(45, hLine(0.2), tiltedLine(0.7, 25));
    expect(result.consistent).toBe(false);
    expect(result.discrepancy).toBeGreaterThan(10);
  });
});

// ── lineInclinationDeg ────────────────────────────────────────

describe('lineInclinationDeg', () => {
  it('horizontal → 0°',   () => expect(lineInclinationDeg(hLine(0.5))).toBeCloseTo(0, 1));
  it('20° tilt → 20°',    () => expect(lineInclinationDeg(tiltedLine(0.3, 20))).toBeCloseTo(20, 0));
  it('zero-length → NaN', () => expect(isNaN(lineInclinationDeg({ x1:0.5,y1:0.5,x2:0.5,y2:0.5 }))).toBe(true));
});

// ── lineMidpoint ──────────────────────────────────────────────

describe('lineMidpoint', () => {
  it('midpoint of horizontal line', () => {
    const m = lineMidpoint({ x1:0.1, y1:0.5, x2:0.9, y2:0.5 });
    expect(m.x).toBeCloseTo(0.5, 5);
    expect(m.y).toBeCloseTo(0.5, 5);
  });
});

// ── extendLine ────────────────────────────────────────────────

describe('extendLine', () => {
  it('extended line is longer than original', () => {
    const orig: NormLine = { x1:0.2, y1:0.5, x2:0.8, y2:0.5 };
    const ext  = extendLine(orig, 0.2);
    const origLen = Math.hypot(orig.x2 - orig.x1, orig.y2 - orig.y1);
    const extLen  = Math.hypot(ext.x2 - ext.x1, ext.y2 - ext.y1);
    expect(extLen).toBeGreaterThan(origLen);
  });
});

// ── computeLetterbox ──────────────────────────────────────────

describe('computeLetterbox', () => {
  it('landscape image on square canvas — pillarboxed', () => {
    const r = computeLetterbox(800, 400, 500, 500);
    expect(r.oy).toBeGreaterThan(0);   // vertical offset (pillarbox)
    expect(r.rw).toBeCloseTo(500, 0);
    expect(r.rh).toBeCloseTo(250, 0);
  });

  it('portrait image on landscape canvas — letterboxed', () => {
    const r = computeLetterbox(400, 800, 800, 500);
    expect(r.ox).toBeGreaterThan(0);   // horizontal offset
  });

  it('same aspect → no offset', () => {
    const r = computeLetterbox(400, 400, 300, 300);
    expect(r.ox).toBeCloseTo(0, 5);
    expect(r.oy).toBeCloseTo(0, 5);
    expect(r.rw).toBeCloseTo(300, 0);
    expect(r.rh).toBeCloseTo(300, 0);
  });
});

// ── clamp ─────────────────────────────────────────────────────

describe('clamp', () => {
  it('clamps below min', () => expect(clamp(-5, 0, 1)).toBe(0));
  it('clamps above max', () => expect(clamp(2,  0, 1)).toBe(1));
  it('passes through valid', () => expect(clamp(0.5, 0, 1)).toBe(0.5));
});
