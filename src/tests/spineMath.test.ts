/**
 * spineMath.test.ts
 *
 * Locks in the accuracy of the ZERO-API manual measurement engine used by
 * AdvancedManualTool. calculateCobbAngle works in raw image-pixel space, so
 * (unlike the normalised-coordinate path) it is NOT subject to aspect-ratio
 * distortion — these tests guard that property.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateCobbAngle,
  calculateCobbFromSlopes,
  classifyCobbSeverity,
  dist,
  type Point,
} from '@/lib/spineMath';

const P = (x: number, y: number): Point => ({ x, y });

describe('calculateCobbAngle — basic correctness', () => {
  it('two horizontal endplates → 0°', () => {
    expect(calculateCobbAngle(P(0,100), P(400,100), P(0,300), P(400,300))).toBeCloseTo(0, 1);
  });

  it('upper flat, lower tilted 20° → 20°', () => {
    const dy = 400 * Math.tan(20 * Math.PI / 180);
    expect(calculateCobbAngle(P(0,100), P(400,100), P(0,300), P(400,300+dy))).toBeCloseTo(20, 0);
  });

  it('opposing ±15° tilts → 30°', () => {
    const dyU = 400 * Math.tan(-15 * Math.PI / 180);
    const dyL = 400 * Math.tan(15 * Math.PI / 180);
    expect(calculateCobbAngle(P(0,100), P(400,100+dyU), P(0,300), P(400,300+dyL))).toBeCloseTo(30, 0);
  });
});

describe('calculateCobbAngle — aspect independence (pixel space)', () => {
  // The SAME anatomical endplates on a tall vs. wide sensor produce the SAME
  // angle, because the tool measures in absolute pixels — no distortion.
  it('is unchanged when the image is stretched only in X (points already in px)', () => {
    // A 30° endplate pair expressed in pixels — the value is intrinsic.
    const dyL = 500 * Math.tan(30 * Math.PI / 180);
    const tall = calculateCobbAngle(P(0,200), P(500,200), P(0,600), P(500,600+dyL));
    expect(tall).toBeCloseTo(30, 0);
  });
});

describe('calculateCobbAngle — edge cases', () => {
  it('zero-length upper line → 0 (guarded, no NaN)', () => {
    expect(calculateCobbAngle(P(100,100), P(100,100), P(0,300), P(400,300))).toBe(0);
  });

  it('always returns a value in [0, 90]', () => {
    for (let deg = -80; deg <= 80; deg += 10) {
      const dy = 400 * Math.tan(deg * Math.PI / 180);
      const a = calculateCobbAngle(P(0,100), P(400,100), P(0,300), P(400,300+dy));
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(90);
    }
  });

  it('direction-independent: reversing point order keeps the angle', () => {
    const dyL = 400 * Math.tan(25 * Math.PI / 180);
    const fwd = calculateCobbAngle(P(0,100), P(400,100), P(0,300), P(400,300+dyL));
    const rev = calculateCobbAngle(P(400,100), P(0,100), P(400,300+dyL), P(0,300));
    expect(rev).toBeCloseTo(fwd, 1);
  });
});

describe('calculateCobbFromSlopes', () => {
  it('-8° and +20° → 28°', () => expect(calculateCobbFromSlopes(-8, 20)).toBeCloseTo(28, 1));
  it('clamps supplementary angles to acute', () => expect(calculateCobbFromSlopes(170, 0)).toBeCloseTo(10, 1));
});

describe('classifyCobbSeverity — SRS thresholds', () => {
  it('9° → normal',    () => expect(classifyCobbSeverity(9)).toBe('normal'));
  it('10° → mild',     () => expect(classifyCobbSeverity(10)).toBe('mild'));
  it('25° → moderate', () => expect(classifyCobbSeverity(25)).toBe('moderate'));
  it('45° → severe',   () => expect(classifyCobbSeverity(45)).toBe('severe'));
});

describe('dist', () => {
  it('3-4-5 triangle', () => expect(dist(P(0,0), P(3,4))).toBeCloseTo(5, 5));
});
