/**
 * coordinateTransform.test.ts
 *
 * Regression tests for DPR-aware coordinate transforms in:
 *   - ManualCorrectionPanel (getPos → findHandle → updateHandle pipeline)
 *   - CobbOverlay (normToCanvas / computeLetterbox in CSS pixel space)
 *
 * Core scenario: on a 2× Retina display the canvas backing store is
 * 2× the CSS dimensions. All interaction must work in CSS logical pixels.
 */

import { describe, it, expect } from 'vitest';
import { computeLetterbox, normToCanvas, canvasToNorm } from '@/lib/lineGeometry';

// ── computeLetterbox ──────────────────────────────────────────────

describe('computeLetterbox — CSS pixel space', () => {

  it('portrait image fills container width → no horizontal letterbox', () => {
    const reg = computeLetterbox(400, 800, 400, 800);
    expect(reg.ox).toBe(0);
    expect(reg.oy).toBe(0);
    expect(reg.rw).toBe(400);
    expect(reg.rh).toBe(800);
  });

  it('wide image in tall container → letterbox bars top and bottom', () => {
    const reg = computeLetterbox(1600, 400, 800, 800);
    // Image aspect 4:1, container 1:1 → fills width, bars vertically
    expect(reg.ox).toBe(0);
    expect(reg.rw).toBe(800);
    expect(reg.rh).toBe(200);
    expect(reg.oy).toBe(300); // (800 - 200) / 2
  });

  it('tall image in wide container → letterbox bars left and right', () => {
    const reg = computeLetterbox(400, 1600, 800, 800);
    // Image aspect 1:4, container 1:1 → fills height, bars horizontally
    expect(reg.oy).toBe(0);
    expect(reg.rh).toBe(800);
    expect(reg.rw).toBe(200);
    expect(reg.ox).toBe(300); // (800 - 200) / 2
  });

});

// ── DPR-invariant pointer mapping ────────────────────────────────

describe('DPR-invariant coordinate pipeline', () => {

  /**
   * Simulates the post-fix ManualCorrectionPanel pipeline:
   *   1. getPos() returns CSS logical px (no DPR multiplication)
   *   2. findHandle() uses computeLetterbox with CSS dims
   *   3. normToCanvas() returns CSS px handle positions
   *   4. Comparison is in CSS pixel space
   *
   * At dpr=2: canvas backing = 1000×2000, CSS display = 500×1000.
   * A pointer at CSS (250, 500) — the midpoint — must map to norm (0.5, 0.5).
   */
  it('maps CSS pointer midpoint to norm 0.5/0.5 at dpr=2 (portrait image fills container)', () => {
    const cssW = 500, cssH = 1000;
    // physW = cssW * 2 = 1000, physH = cssH * 2 = 2000 (backing store)
    // Image exactly fills container (no letterbox)
    const reg = computeLetterbox(500, 1000, cssW, cssH);

    // Pointer at CSS midpoint
    const pointerCssX = 250, pointerCssY = 500;
    const norm = canvasToNorm(pointerCssX, pointerCssY, reg);

    expect(norm.x).toBeCloseTo(0.5, 4);
    expect(norm.y).toBeCloseTo(0.5, 4);
  });

  it('maps CSS pointer midpoint to norm 0.5/0.5 at dpr=3 (very high density)', () => {
    const cssW = 400, cssH = 800;
    const reg = computeLetterbox(400, 800, cssW, cssH);

    const norm = canvasToNorm(200, 400, reg);
    expect(norm.x).toBeCloseTo(0.5, 4);
    expect(norm.y).toBeCloseTo(0.5, 4);
  });

  it('normToCanvas(0.5, 0.5) lands at CSS midpoint (not physical midpoint)', () => {
    const cssW = 600, cssH = 900;
    const reg = computeLetterbox(400, 600, cssW, cssH);
    // Aspect ratio matches (4:6 = 400:600), container 600×900 — fills exactly
    const pt = normToCanvas(0.5, 0.5, reg);
    expect(pt.x).toBeCloseTo(300, 1); // cssW / 2
    expect(pt.y).toBeCloseTo(450, 1); // cssH / 2
  });

  it('normToCanvas → canvasToNorm round-trip preserves coords', () => {
    const cssW = 480, cssH = 720;
    const reg = computeLetterbox(800, 1200, cssW, cssH);
    const testPoints = [
      { x: 0.1, y: 0.2 },
      { x: 0.5, y: 0.5 },
      { x: 0.8, y: 0.9 },
      { x: 0,   y: 0   },
      { x: 1,   y: 1   },
    ];
    testPoints.forEach(({ x, y }) => {
      const pt   = normToCanvas(x, y, reg);
      const back = canvasToNorm(pt.x, pt.y, reg);
      expect(back.x).toBeCloseTo(x, 4);
      expect(back.y).toBeCloseTo(y, 4);
    });
  });

  it('CSS pointer coords do NOT scale by dpr before entering the pipeline', () => {
    // Before fix: getPos multiplied by (cvs.width / rect.width) = dpr = 2
    // After fix: getPos returns (clientX - rect.left) directly
    const cssW = 500, cssH = 1000;
    const reg = computeLetterbox(500, 1000, cssW, cssH);

    // Correct CSS pointer at (100, 200)
    const cssPt = { cx: 100, cy: 200 };
    const norm  = canvasToNorm(cssPt.cx, cssPt.cy, reg);

    // With dpr multiplication this would give (200, 400) → norm (0.4, 0.4) WRONG
    const wrongPt = { cx: 100 * 2, cy: 200 * 2 };
    const wrongNorm = canvasToNorm(wrongPt.cx, wrongPt.cy, reg);

    // Correct result: 100/500 = 0.2, 200/1000 = 0.2
    expect(norm.x).toBeCloseTo(0.2, 4);
    expect(norm.y).toBeCloseTo(0.2, 4);

    // Incorrect (pre-fix) result would be 0.4
    expect(wrongNorm.x).toBeCloseTo(0.4, 4);

    // Verify they are different — confirming the fix matters
    expect(norm.x).not.toBeCloseTo(wrongNorm.x, 4);
  });

});

// ── vertebraLabeling confidence ───────────────────────────────────

import { inferIntermediateVertebrae, getSpineLevelLabels } from '@/lib/vertebraLabeling';

describe('inferIntermediateVertebrae — confidence field (audit fix)', () => {

  it('anchor vertebrae have confidence=high', () => {
    const labels = inferIntermediateVertebrae('T5', 'T12', 0.2, 0.7);
    const anchors = labels.filter(l => l.isMeasured);
    expect(anchors.every(l => l.confidence === 'high')).toBe(true);
  });

  it('intermediate vertebrae have confidence=medium for short sequences', () => {
    const labels = inferIntermediateVertebrae('T5', 'T12', 0.2, 0.7);
    const inferred = labels.filter(l => l.isInferred);
    expect(inferred.length).toBeGreaterThan(0);
    expect(inferred.every(l => l.confidence === 'medium')).toBe(true);
  });

  it('labels have confidence=low when span > 12 vertebrae', () => {
    // T1 → L5 = 12+5 = 17 vertebrae span > 12
    const labels = inferIntermediateVertebrae('T1', 'L5', 0.1, 0.9);
    expect(labels.some(l => l.confidence === 'low')).toBe(true);
  });

  it('bad sequence returns low confidence anchors', () => {
    const labels = inferIntermediateVertebrae('', 'T12', 0.2, 0.7);
    expect(labels.every(l => l.confidence === 'low')).toBe(true);
  });

  it('inverted sequence (lower above upper) returns low confidence', () => {
    // T12 as upper, T5 as lower — wrong order
    const labels = inferIntermediateVertebrae('T12', 'T5', 0.2, 0.7);
    expect(labels.every(l => l.confidence === 'low')).toBe(true);
  });

  it('getSpineLevelLabels returns correct number of vertebrae', () => {
    // T5 to T12 = 8 vertebrae (T5, T6, T7, T8, T9, T10, T11, T12)
    const labels = getSpineLevelLabels('T5', 'T12', 0.2, 0.7);
    expect(labels.length).toBe(8);
    expect(labels[0].name).toBe('T5');
    expect(labels[labels.length - 1].name).toBe('T12');
  });

});
