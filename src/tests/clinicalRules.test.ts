/**
 * clinicalRules.test.ts
 *
 * Guards the deterministic (zero-API) clinical recommendation engine:
 *  - a < 10° curve must never be described as "scoliosis" (defined as ≥ 10°)
 *  - the Arabic description must translate the location enum, never echo it raw
 *  - foot recommendations are generated locally and merged over AI fallbacks
 */

import { describe, it, expect } from 'vitest';
import { getSpineRecs, applyLocalFootRecs, classifyMeary } from '@/lib/clinicalRules';
import type { FootAnalysisResult } from '@/types';

// ── Spine: normal (< 10°) must not be called scoliosis ────────────

describe('getSpineRecs — a normal curve is not scoliosis', () => {
  it('EN: 6° does not say "scoliosis", flags normal limits', () => {
    const r = getSpineRecs(6, 'thoracic', 'en');
    expect(r.overallDescription.toLowerCase()).not.toContain('scoliosis with');
    expect(r.overallDescription.toLowerCase()).toContain('within normal limits');
  });
  it('AR: 6° is not labelled as scoliosis (جنف طبيعي), flags normal limits', () => {
    const r = getSpineRecs(6, 'thoracic', 'ar');
    // The old bug produced "جنف طبيعي بزاوية…" (labelling a normal spine as
    // "normal scoliosis"). The corrected text states normal limits instead —
    // it may still reference "the scoliosis threshold" (عتبة الجنف), which is fine.
    expect(r.overallDescription).not.toContain('جنف طبيعي');
    expect(r.overallDescription).not.toContain('جنف طبيعي بزاوية');
    expect(r.overallDescription).toContain('الحدود الطبيعية');
  });
  it('EN: 30° IS labelled scoliosis (moderate)', () => {
    const r = getSpineRecs(30, 'lumbar', 'en');
    expect(r.overallDescription.toLowerCase()).toContain('scoliosis');
  });
});

// ── Spine: Arabic must translate the location enum ────────────────

describe('getSpineRecs — Arabic translates the location', () => {
  it('does not leak the raw English "thoracic" into Arabic text', () => {
    const r = getSpineRecs(30, 'thoracic', 'ar');
    expect(r.overallDescription).not.toContain('thoracic');
    expect(r.overallDescription).toContain('الصدرية');
  });
  it('translates lumbar', () => {
    const r = getSpineRecs(30, 'lumbar', 'ar');
    expect(r.overallDescription).not.toContain('lumbar');
    expect(r.overallDescription).toContain('القطنية');
  });
});

// ── Foot: local recommendations merged over AI fallback ───────────

function makeFoot(over: Partial<FootAnalysisResult> = {}): FootAnalysisResult {
  return {
    is_valid_xray: true, foot_side: 'left', measurement_confidence: 'high',
    meary_angle: 22, meary_direction: 'plantar', calcaneal_pitch: 12,
    talar_declination: 30, severity: 'moderate', flexibility: 'flexible',
    talus_line: { x1:0.3,y1:0.4,x2:0.6,y2:0.5 },
    metatarsal_line: { x1:0.55,y1:0.4,x2:0.85,y2:0.44 },
    calcaneus_line: { x1:0.15,y1:0.72,x2:0.42,y2:0.70 },
    overall_description: 'AI DESC', age_based_recommendation: '',
    treatment_plan: 'AI TREAT', followup_plan: '', imaging_indications: '',
    orthotic_recommendations: '',
    ...over,
  };
}

describe('classifyMeary — matches the reference table boundaries', () => {
  it('≤4° → normal',    () => { expect(classifyMeary(0)).toBe('normal'); expect(classifyMeary(4)).toBe('normal'); });
  it('4–15° → mild',    () => { expect(classifyMeary(5)).toBe('mild'); expect(classifyMeary(15)).toBe('mild'); });
  it('15–30° → moderate', () => { expect(classifyMeary(16)).toBe('moderate'); expect(classifyMeary(30)).toBe('moderate'); });
  it('>30° → severe',   () => expect(classifyMeary(31)).toBe('severe'));
});

describe('applyLocalFootRecs', () => {
  it('reclassifies severity from the measured Meary angle', () => {
    // AI claims "mild" but the measured angle is 25° → must become moderate.
    const merged = applyLocalFootRecs(makeFoot({ meary_angle: 25, severity: 'mild' }), 'en');
    expect(merged.severity).toBe('moderate');
  });
  it('keeps AI severity when no Meary angle was measured', () => {
    const merged = applyLocalFootRecs(makeFoot({ meary_angle: null, severity: 'severe' }), 'en');
    expect(merged.severity).toBe('severe');
  });

  it('overrides AI treatment text with local deterministic recs', () => {
    const merged = applyLocalFootRecs(makeFoot(), 'en');
    expect(merged.treatment_plan).not.toBe('AI TREAT');
    expect(merged.treatment_plan.length).toBeGreaterThan(0);
    expect(merged.followup_plan.length).toBeGreaterThan(0);
    expect(merged.orthotic_recommendations.length).toBeGreaterThan(0);
  });

  it('uses the local description (quoting the Meary angle) when present', () => {
    const merged = applyLocalFootRecs(makeFoot({ meary_angle: 22 }), 'en');
    expect(merged.overall_description).toContain('22');
    expect(merged.overall_description).not.toBe('AI DESC');
  });

  it('keeps the AI description when no Meary angle is available', () => {
    const merged = applyLocalFootRecs(makeFoot({ meary_angle: null }), 'en');
    expect(merged.overall_description).toBe('AI DESC');
  });

  it('is localised (Turkish severity text present)', () => {
    const merged = applyLocalFootRecs(makeFoot(), 'tr');
    expect(merged.treatment_plan).toMatch(/fizyoterapi|UCBL|ortez/i);
  });
});
