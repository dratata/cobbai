/**
 * cobbCalculation.test.ts
 *
 * Integration tests for the clinical Cobb engine:
 * validateAndFinaliseCobb, processSpineResult, estimateProgressionRisk.
 */

import { describe, it, expect } from 'vitest';
import {
  validateAndFinaliseCobb,
  processSpineResult,
  classifyCobb,
  estimateProgressionRisk,
  computeLiveCobb,
} from '@/lib/cobbCalculation';
import type { CurveResult, SpineAnalysisResult, NormLine } from '@/types';

// ── Helpers ───────────────────────────────────────────────────

function hLine(y: number): NormLine { return { x1:0.1, y1:y, x2:0.9, y2:y }; }
function tLine(y: number, deg: number): NormLine {
  const t = deg * Math.PI / 180;
  return { x1:0.1, y1:y, x2:0.9, y2: y + 0.8 * Math.tan(t) };
}

function makeCurve(override: Partial<CurveResult> = {}): CurveResult {
  return {
    id: 1, label: 'Primary',
    cobb_angle: 28, severity: 'mild',
    curve_location: 'thoracic', convexity_direction: 'right',
    upper_vertebra_name: 'T5', lower_vertebra_name: 'T12',
    upper_line: tLine(0.2, -8),
    lower_line: tLine(0.65, 20),
    upper_slope_deg: -8,
    lower_slope_deg: 20,
    ...override,
  };
}

function makeResult(curves: CurveResult[]): SpineAnalysisResult {
  return {
    is_valid_xray: true, image_quality: 'good', view_type: 'PA',
    curve_type: 'single', measurement_confidence: 'high',
    measurement_method: 'endplate', vertebrae_detected: 17,
    curves, coronal_balance: 'balanced',
    overall_description: '', age_based_recommendation: '',
    treatment_plan: '', followup_plan: '', imaging_indications: '',
  };
}

// ── classifyCobb ──────────────────────────────────────────────

describe('classifyCobb', () => {
  it('9°  → normal',   () => expect(classifyCobb(9)).toBe('normal'));
  it('10° → mild',     () => expect(classifyCobb(10)).toBe('mild'));
  it('24° → mild',     () => expect(classifyCobb(24)).toBe('mild'));
  it('25° → moderate', () => expect(classifyCobb(25)).toBe('moderate'));
  it('44° → moderate', () => expect(classifyCobb(44)).toBe('moderate'));
  it('45° → severe',   () => expect(classifyCobb(45)).toBe('severe'));
  it('70° → severe',   () => expect(classifyCobb(70)).toBe('severe'));
});

// ── validateAndFinaliseCobb ───────────────────────────────────

describe('validateAndFinaliseCobb — consistent result', () => {
  it('geometry matches AI → no warnings, isConsistent = true', () => {
    const r = validateAndFinaliseCobb(makeCurve({ cobb_angle: 28 }));
    expect(r.isConsistent).toBe(true);
    expect(r.warnings.filter(w => w.includes('differ'))).toHaveLength(0);
  });

  it('geometry-computed Cobb is used as displayCobb', () => {
    const r = validateAndFinaliseCobb(makeCurve());
    // Lines compute to ~28°, AI says 28° → display should be ~28
    expect(r.displayCobb).toBeGreaterThan(20);
    expect(r.displayCobb).toBeLessThan(40);
  });
});

describe('validateAndFinaliseCobb — inconsistent result', () => {
  it('AI says 45° but lines compute ~28° → isConsistent = false + warning', () => {
    const r = validateAndFinaliseCobb(makeCurve({ cobb_angle: 45 }));
    expect(r.isConsistent).toBe(false);
    expect(r.warnings.some(w => w.includes('differ'))).toBe(true);
  });

  it('still returns a displayCobb (the geometry value)', () => {
    const r = validateAndFinaliseCobb(makeCurve({ cobb_angle: 70 }));
    expect(r.displayCobb).toBeLessThan(40); // geometry says ~28
  });
});

describe('validateAndFinaliseCobb — invalid lines', () => {
  it('zero-length upper_line → warning generated', () => {
    const badLine: NormLine = { x1:0.5, y1:0.5, x2:0.5, y2:0.5 };
    const r = validateAndFinaliseCobb(makeCurve({ upper_line: badLine }));
    expect(r.warnings.some(w => w.toLowerCase().includes('invalid'))).toBe(true);
  });

  it('out-of-range coords → warning generated', () => {
    const badLine: NormLine = { x1:-0.5, y1:0, x2:1.5, y2:0 };
    const r = validateAndFinaliseCobb(makeCurve({ upper_line: badLine }));
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('with slope fallback: bad lines but valid slopes → uses slopes', () => {
    const zero: NormLine = { x1:0.5, y1:0.5, x2:0.5, y2:0.5 };
    const r = validateAndFinaliseCobb(makeCurve({
      upper_line: zero, lower_line: zero,
      upper_slope_deg: -8, lower_slope_deg: 20,
    }));
    // Should use slope-based computation
    expect(r.displayCobb).toBeCloseTo(28, 0);
  });
});

// ── processSpineResult ────────────────────────────────────────

describe('processSpineResult', () => {
  it('good result → isReliable = true, no warnings', () => {
    const p = processSpineResult(makeResult([makeCurve()]));
    expect(p.isReliable).toBe(true);
    expect(p.allWarnings.filter(w => w.includes('differ'))).toHaveLength(0);
  });

  it('unacceptable image quality → isReliable = false', () => {
    const res = { ...makeResult([makeCurve()]), image_quality: 'unacceptable' as const };
    const p = processSpineResult(res);
    expect(p.isReliable).toBe(false);
    expect(p.allWarnings.some(w => w.includes('unacceptable'))).toBe(true);
  });

  it('low confidence → warning added', () => {
    const res = { ...makeResult([makeCurve()]), measurement_confidence: 'low' as const };
    const p = processSpineResult(res);
    expect(p.allWarnings.some(w => w.includes('low'))).toBe(true);
  });

  it('double curve → processes both', () => {
    const c2 = makeCurve({ id:2, label:'Secondary', curve_location:'lumbar' });
    const p = processSpineResult(makeResult([makeCurve(), c2]));
    expect(p.processedCurves).toHaveLength(2);
  });

  it('empty curves array → isReliable not affected by curves', () => {
    const p = processSpineResult({ ...makeResult([]), is_valid_xray: true });
    expect(p.processedCurves).toHaveLength(0);
  });
});

// ── computeLiveCobb ───────────────────────────────────────────

describe('computeLiveCobb (drag editor)', () => {
  it('valid lines → returns correct angle', () => {
    const c = computeLiveCobb(hLine(0.2), tLine(0.7, 30));
    expect(c).toBeCloseTo(30, 0);
  });

  it('zero-length line → returns 0 (no crash)', () => {
    const zero: NormLine = { x1:0.5, y1:0.5, x2:0.5, y2:0.5 };
    expect(computeLiveCobb(zero, hLine(0.7))).toBe(0);
  });
});

// ── estimateProgressionRisk ───────────────────────────────────

describe('estimateProgressionRisk', () => {
  it('young female, Risser 0, 35° → high', () => {
    const r = estimateProgressionRisk(35, 11, true, 0);
    expect(r.risk).toBe('high');
  });

  it('adult male, Risser 5, 15° → low', () => {
    const r = estimateProgressionRisk(15, 30, false, 5);
    expect(r.risk).toBe('low');
  });

  it('recommendation is a non-empty string', () => {
    const r = estimateProgressionRisk(25, 14, true, 1);
    expect(r.recommendation.length).toBeGreaterThan(5);
  });

  it('progression risk exists for all combinations', () => {
    (['low','medium','high'] as const).forEach(() => {
      const r = estimateProgressionRisk(20, 13, true, 2);
      expect(['low','medium','high']).toContain(r.risk);
    });
  });
});
