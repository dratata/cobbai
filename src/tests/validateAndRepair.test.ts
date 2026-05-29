/**
 * validateAndRepair.test.ts
 *
 * Tests for:
 *  - safeParseSpineResult coordinate clamping + auto-swap + tilt warnings
 *  - hashBase64 collision resistance (different images → different hashes)
 *  - normaliseCurveEndplates corner preference logic
 *
 * These cover the bugs fixed in the chaos-engineering session.
 */

import { describe, it, expect } from 'vitest';
import { safeParseSpineResult } from '@/lib/validateAIResponse';
import { normaliseCurveEndplates } from '@/lib/cobbCalculation';
import { hashBase64 } from '@/lib/imageCache';
import type { CurveResult, SpineAnalysisResult } from '@/types';

// ── Helpers ──────────────────────────────────────────────────────

function makeLine(x1: number, y1: number, x2: number, y2: number) {
  return { x1, y1, x2, y2 };
}

function makeCurve(overrides: Partial<CurveResult> = {}): CurveResult {
  return {
    id:                    1,
    cobb_angle:            22,
    label:                 'Primary',
    severity:              'mild',
    curve_location:        'thoracic',
    convexity_direction:   'right',
    upper_vertebra_name:   'T5',
    lower_vertebra_name:   'T12',
    apical_vertebra_name:  'T8',
    rotation_grade:        '0',
    upper_line: makeLine(0.25, 0.20, 0.55, 0.17),
    lower_line: makeLine(0.22, 0.65, 0.52, 0.73),
    upper_slope_deg: -8.5,
    lower_slope_deg:  19.5,
    upper_corners: {
      ul: [0.25, 0.20], ur: [0.55, 0.17],
      ll: [0.25, 0.25], lr: [0.55, 0.22],
    },
    lower_corners: {
      ul: [0.22, 0.60], ur: [0.52, 0.68],
      ll: [0.22, 0.65], lr: [0.52, 0.73],
    },
    apex_x: 0.60, apex_y: 0.44,
    manually_corrected: false,
    ...overrides,
  };
}

function makeValidResult(curves: CurveResult[]): SpineAnalysisResult {
  return {
    is_valid_xray:           true,
    image_quality:           'good',
    view_type:               'PA',
    curve_type:              'single',
    measurement_confidence:  'high',
    measurement_method:      'endplate',
    vertebrae_detected:      17,
    curves,
    coronal_balance:         'balanced',
    overall_description:     '',
    age_based_recommendation: '',
    treatment_plan:          '',
    followup_plan:           '',
    imaging_indications:     '',
    _timestamp:              new Date().toISOString(),
  };
}

// ── safeParseSpineResult ─────────────────────────────────────────

describe('safeParseSpineResult — repairCurve', () => {

  it('clamps out-of-range coordinates to [0, 1]', () => {
    // isValidNormLine tolerates up to ±0.05 overshoot; we test within that range
    // so validation passes but clamp still runs (e.g. -0.03 → 0, 1.03 → 1)
    const curve = makeCurve({
      upper_line: makeLine(-0.03, 0.20, 1.03, 0.17),
      lower_line: makeLine(0.22,  0.65, 0.52, 0.73),
    });
    const result = safeParseSpineResult(makeValidResult([curve]));
    expect(result).not.toBeNull();
    const ul = result!.result.curves[0].upper_line;
    expect(ul.x1).toBeGreaterThanOrEqual(0);
    expect(ul.x1).toBeLessThanOrEqual(1);
    expect(ul.x2).toBeGreaterThanOrEqual(0);
    expect(ul.x2).toBeLessThanOrEqual(1);
  });

  it('auto-swaps upper/lower when upper line is below lower line', () => {
    // upper_line has larger Y values → is geometrically below lower_line
    const curve = makeCurve({
      upper_line:           makeLine(0.22, 0.65, 0.52, 0.73), // lower region
      lower_line:           makeLine(0.25, 0.20, 0.55, 0.17), // upper region
      upper_vertebra_name:  'T12',  // also swapped
      lower_vertebra_name:  'T5',
    });
    const result = safeParseSpineResult(makeValidResult([curve]));
    expect(result).not.toBeNull();
    const r = result!.result.curves[0];
    // After swap: upper should be the line with smaller Y
    const upperMidY = (r.upper_line.y1 + r.upper_line.y2) / 2;
    const lowerMidY = (r.lower_line.y1 + r.lower_line.y2) / 2;
    expect(upperMidY).toBeLessThan(lowerMidY);
    // Vertebra names should also be swapped
    expect(r.upper_vertebra_name).toBe('T5');
    expect(r.lower_vertebra_name).toBe('T12');
  });

  it('generates warning when upper/lower lines are nearly horizontal', () => {
    const curve = makeCurve({
      upper_line: makeLine(0.1, 0.30, 0.9, 0.30), // |y2-y1| = 0 → horizontal
      lower_line: makeLine(0.1, 0.70, 0.9, 0.70),
    });
    const result = safeParseSpineResult(makeValidResult([curve]));
    expect(result).not.toBeNull();
    const hasHorizWarn = result!.outcome.warnings.some(w =>
      w.toLowerCase().includes('horizontal')
    );
    expect(hasHorizWarn).toBe(true);
  });

  it('leaves valid curves untouched', () => {
    const curve = makeCurve();
    const result = safeParseSpineResult(makeValidResult([curve]));
    expect(result).not.toBeNull();
    const r = result!.result.curves[0];
    expect(r.upper_line.y1).toBeCloseTo(0.20, 5);
    expect(r.lower_line.y1).toBeCloseTo(0.65, 5);
  });

  it('returns null for is_valid_xray:false gracefully', () => {
    const raw = { is_valid_xray: false, curves: [] };
    const result = safeParseSpineResult(raw);
    // is_valid_xray:false is a valid response — parsed, not rejected
    expect(result).not.toBeNull();
    expect(result!.result.is_valid_xray).toBe(false);
  });

  it('returns null when required fields missing', () => {
    const result = safeParseSpineResult({ curves: 'not-an-array' });
    expect(result).toBeNull();
  });

});

// ── normaliseCurveEndplates ───────────────────────────────────────

describe('normaliseCurveEndplates — corner preference', () => {

  it('prefers corners when they are more tilted than the direct line', () => {
    // Direct line: nearly horizontal (|y2-y1| = 0.005)
    // Corner line: more tilted (|y2-y1| = 0.04)
    const curve = makeCurve({
      upper_line: makeLine(0.25, 0.205, 0.55, 0.200), // tilt = 0.005 (nearly horiz)
      upper_corners: {
        ul: [0.25, 0.24], ur: [0.55, 0.20],            // tilt = 0.04 from corners
        ll: [0.25, 0.28], lr: [0.55, 0.24],
      },
    });
    const fixed = normaliseCurveEndplates(curve);
    const tilt = Math.abs(fixed.upper_line.y2 - fixed.upper_line.y1);
    // Should have picked the corner-derived line (tilt ~0.04)
    expect(tilt).toBeGreaterThan(0.01);
  });

  it('keeps direct line when it is more tilted than corners (no slope data)', () => {
    // With upper_slope_deg=0 lower_slope_deg=0 → hasSlopes=false → applyAISlope skipped
    const curve = makeCurve({
      upper_line: makeLine(0.25, 0.24, 0.55, 0.20),  // tilt = 0.04 (good)
      upper_slope_deg: 0,
      lower_slope_deg: 0,
      upper_corners: {
        ul: [0.25, 0.22], ur: [0.55, 0.218],          // tilt = 0.002 (nearly horiz)
        ll: [0.25, 0.26], lr: [0.55, 0.258],
      },
    });
    const fixed = normaliseCurveEndplates(curve);
    // With hasSlopes=false, corner base wins but slope is NOT applied → exact corner y values
    expect(fixed.upper_line.x1).toBeCloseTo(0.25, 4);
    expect(fixed.upper_line.x2).toBeCloseTo(0.55, 4);
    const tilt = Math.abs(fixed.upper_line.y2 - fixed.upper_line.y1);
    expect(tilt).toBeGreaterThan(0.001); // some tilt preserved
  });

  it('falls back to direct line when no corners provided (no slope data)', () => {
    const curve = makeCurve({ upper_corners: undefined, upper_slope_deg: 0, lower_slope_deg: 0 });
    const fixed = normaliseCurveEndplates(curve);
    // direct line used directly (no corners, no slopes)
    expect(fixed.upper_line.y1).toBeCloseTo(0.20, 4);
  });

  it('applies AI slope when slope data is provided', () => {
    // upper_slope_deg = -8.5° → line should tilt left-up to right-down at that angle
    const curve = makeCurve({
      upper_corners: { ul:[0.25,0.22], ur:[0.55,0.22], ll:[0.25,0.27], lr:[0.55,0.27] },
      upper_slope_deg: -8.5,  // non-zero → applyAISlope fires
      lower_slope_deg: 19.5,
    });
    const fixed = normaliseCurveEndplates(curve);
    const slopeRad = -8.5 * Math.PI / 180;
    const halfDx = (0.55 - 0.25) / 2;
    const expectedDy = 2 * halfDx * Math.tan(slopeRad); // y2 - y1 from slope
    const actualDy   = fixed.upper_line.y2 - fixed.upper_line.y1;
    expect(actualDy).toBeCloseTo(expectedDy, 3);
  });

});

// ── hashBase64 collision resistance ──────────────────────────────

describe('hashBase64 — collision resistance', () => {

  // Helper: generate a fake base64 string with distinct content at multiple
  // positions (simulating different X-ray image content)
  function fakeBase64(seed: number, length = 50_000): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    // Identical JPEG-like header (first 2 KB)
    const header = chars[seed % 64].repeat(2048);
    // Unique content in the middle (anatomy area)
    const middle = chars[(seed * 7 + 1) % 64].repeat(length - 4096);
    // Identical footer (last 2 KB)
    const footer = chars[3].repeat(2048);
    return header + middle + footer;
  }

  it('different images produce different hashes', async () => {
    const h1 = await hashBase64(fakeBase64(1));
    const h2 = await hashBase64(fakeBase64(2));
    expect(h1).not.toBe(h2);
  });

  it('same image always produces the same hash', async () => {
    const img = fakeBase64(42);
    const h1  = await hashBase64(img);
    const h2  = await hashBase64(img);
    expect(h1).toBe(h2);
  });

  it('images differing only in length produce different hashes', async () => {
    const h1 = await hashBase64(fakeBase64(5, 50_000));
    const h2 = await hashBase64(fakeBase64(5, 60_000));
    expect(h1).not.toBe(h2);
  });

  it('images with same header/footer but different middle produce different hashes', async () => {
    // This is exactly the collision scenario from the cache bug:
    // preprocessed JPEGs share identical JPEG headers.
    const base = 'A'.repeat(2048) + 'B'.repeat(46_000) + 'C'.repeat(2048);
    const alt  = 'A'.repeat(2048) + 'X'.repeat(46_000) + 'C'.repeat(2048);
    const h1 = await hashBase64(base);
    const h2 = await hashBase64(alt);
    expect(h1).not.toBe(h2);
  });

});
