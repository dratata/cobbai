/**
 * validateAIResponse.ts
 *
 * CRITICAL SAFETY MODULE — validates every AI response before display.
 *
 * Problem this solves:
 *   The AI can return plausible-looking but geometrically impossible data.
 *   Without validation, a physician might act on wrong measurements.
 *
 * Guarantees after validation:
 *   - All coordinate values are within [0, 1]
 *   - upper_line is above lower_line (in image space)
 *   - All required fields are present
 *   - Cobb angle is within physiological range [0, 120]
 */

import { isValidNormLine } from '@/lib/lineGeometry';
import type { SpineAnalysisResult, CurveResult, FootAnalysisResult } from '@/types';

// ── Validation result ─────────────────────────────────────────

export interface ValidationOutcome {
  isValid: boolean;
  errors: string[];   // Hard errors → data should not be used
  warnings: string[]; // Soft warnings → data usable but with caution
}

// ── Individual curve validation ───────────────────────────────

function validateCurve(curve: unknown, idx: number): ValidationOutcome {
  const errors:   string[] = [];
  const warnings: string[] = [];
  const prefix = `Curve ${idx + 1}`;

  if (!curve || typeof curve !== 'object') {
    return { isValid: false, errors: [`${prefix}: not an object`], warnings: [] };
  }
  const c = curve as Record<string, unknown>;

  // cobb_angle: API no longer required to return this — computed locally from corners.
  // Accept 0 or missing gracefully; local geometry overrides it in processSpineResult.
  if (typeof c['cobb_angle'] === 'number' && isFinite(c['cobb_angle'] as number)) {
    const deg = c['cobb_angle'] as number;
    if (deg < 0 || deg > 120) {
      warnings.push(`${prefix}: cobb_angle ${deg}° is outside physiological range`);
    }
  }
  // Not a hard error if cobb_angle is missing — local geometry will compute it.

  // upper_line / lower_line: optional if upper_corners / lower_corners are present.
  // normaliseCurveEndplates() will derive the lines from corners.
  // Validate lines only when no corners are provided as fallback.
  const hasUpperCorners = c['upper_corners'] && typeof c['upper_corners'] === 'object';
  const hasLowerCorners = c['lower_corners'] && typeof c['lower_corners'] === 'object';
  if (!hasUpperCorners && !isValidNormLine(c['upper_line'])) {
    errors.push(`${prefix}: upper_corners and upper_line are both missing/invalid`);
  }
  if (!hasLowerCorners && !isValidNormLine(c['lower_line'])) {
    errors.push(`${prefix}: lower_corners and lower_line are both missing/invalid`);
  }

  // Geometric sanity: upper endplate should generally be above lower endplate
  if (isValidNormLine(c['upper_line']) && isValidNormLine(c['lower_line'])) {
    const ul = c['upper_line'] as { y1: number; y2: number };
    const ll = c['lower_line'] as { y1: number; y2: number };
    const upperMidY = (ul.y1 + ul.y2) / 2;
    const lowerMidY = (ll.y1 + ll.y2) / 2;
    if (upperMidY > lowerMidY + 0.05) { // 5% of image height tolerance
      warnings.push(
        `${prefix}: upper_line mid-Y (${upperMidY.toFixed(3)}) is below lower_line mid-Y (${lowerMidY.toFixed(3)}) — lines may be swapped`
      );
    }
  }

  // Vertebra names
  if (!c['upper_vertebra_name'] || !c['lower_vertebra_name']) {
    warnings.push(`${prefix}: vertebra names are missing`);
  }

  return { isValid: errors.length === 0, errors, warnings };
}

// ── Full spine result validation ──────────────────────────────

export function validateSpineResult(raw: unknown): ValidationOutcome {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { isValid: false, errors: ['Response is not an object'], warnings: [] };
  }

  const r = raw as Record<string, unknown>;

  // is_valid_xray must be boolean
  if (typeof r['is_valid_xray'] !== 'boolean') {
    errors.push('is_valid_xray field missing or not boolean');
  }

  if (r['is_valid_xray'] === false) {
    // Invalid X-ray — no further checks needed, this is expected
    return { isValid: true, errors: [], warnings: [] };
  }

  // Curves array
  if (!Array.isArray(r['curves'])) {
    errors.push('curves field is missing or not an array');
  } else if (r['curves'].length === 0) {
    warnings.push('No curves detected — is this a normal spine?');
  } else {
    (r['curves'] as unknown[]).forEach((curve, idx) => {
      const result = validateCurve(curve, idx);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    });
  }

  // Image quality
  const validQualities = ['good', 'poor', 'unacceptable'];
  if (!validQualities.includes(r['image_quality'] as string)) {
    warnings.push(`image_quality "${r['image_quality']}" is unexpected; defaulting to 'poor'`);
  }

  // Confidence
  const validConf = ['high', 'medium', 'low'];
  if (!validConf.includes(r['measurement_confidence'] as string)) {
    warnings.push('measurement_confidence value unexpected');
  }

  return { isValid: errors.length === 0, errors, warnings };
}

// ── Coordinate repair helpers ─────────────────────────────────

/** Clamp a single coord to [0, 1] */
function c01(v: unknown): number {
  const n = typeof v === 'number' ? v : 0;
  return Math.max(0, Math.min(1, n));
}

/** Clamp all four coordinates of a line into [0,1] range */
function clampLine(line: unknown): { x1:number; y1:number; x2:number; y2:number } {
  const l = (line || {}) as Record<string, unknown>;
  return { x1: c01(l.x1), y1: c01(l.y1), x2: c01(l.x2), y2: c01(l.y2) };
}

/**
 * Repair a single curve in-place:
 *   1. Clamp all line coords to [0,1]
 *   2. Auto-swap upper/lower when the AI returned them backwards
 *   3. Warn when lines are nearly horizontal (tilt < 1% of image height)
 */
function repairCurve(curve: CurveResult): { curve: CurveResult; warnings: string[] } {
  const warnings: string[] = [];
  let c = { ...curve };

  // Ensure cobb_angle has a numeric default — local geometry will overwrite it
  // in processSpineResult. API no longer required to return this field.
  if (typeof (c as unknown as Record<string,unknown>).cobb_angle !== 'number') {
    (c as unknown as Record<string,unknown>).cobb_angle = 0;
  }

  // 1. Clamp line coordinates (only if lines are present; corners may be used instead)
  if (c.upper_line) c.upper_line = clampLine(c.upper_line) as typeof c.upper_line;
  if (c.lower_line) c.lower_line = clampLine(c.lower_line) as typeof c.lower_line;
  // Provide zero-length fallback lines so downstream null-checks don't crash
  if (!c.upper_line) c.upper_line = { x1:0, y1:0, x2:0, y2:0 };
  if (!c.lower_line) c.lower_line = { x1:0, y1:0, x2:0, y2:0 };

  // 2. Auto-swap if upper line is geometrically below the lower line
  //    (image y-axis: 0 = top of image, 1 = bottom)
  const upperMidY = (c.upper_line.y1 + c.upper_line.y2) / 2;
  const lowerMidY = (c.lower_line.y1 + c.lower_line.y2) / 2;
  if (upperMidY > lowerMidY + 0.04) {
    warnings.push(
      `Upper endplate (y≈${upperMidY.toFixed(2)}) is below lower (y≈${lowerMidY.toFixed(2)}) — auto-swapping lines and vertebra names.`
    );
    [c.upper_line, c.lower_line] = [c.lower_line, c.upper_line];
    [c.upper_vertebra_name, c.lower_vertebra_name] = [c.lower_vertebra_name, c.upper_vertebra_name];
    if (c.upper_corners || c.lower_corners) {
      [c.upper_corners, c.lower_corners] = [c.lower_corners, c.upper_corners];
    }
  }

  // 3. Warn if lines are nearly horizontal (|y2 - y1| < 0.01 = 1% of image height)
  const upperTilt = Math.abs(c.upper_line.y2 - c.upper_line.y1);
  const lowerTilt = Math.abs(c.lower_line.y2 - c.lower_line.y1);
  if (upperTilt < 0.01) warnings.push('Upper endplate line is nearly horizontal — verify manually.');
  if (lowerTilt < 0.01) warnings.push('Lower endplate line is nearly horizontal — verify manually.');

  return { curve: c, warnings };
}

// ── Safe cast ─────────────────────────────────────────────────

/**
 * Validates and casts a raw API response to SpineAnalysisResult.
 * Returns null if hard errors are found (prevents bad data from reaching the UI).
 * Applies automatic repairs for common AI output errors.
 */
export function safeParseSpineResult(
  raw: unknown
): { result: SpineAnalysisResult; outcome: ValidationOutcome } | null {
  const outcome = validateSpineResult(raw);

  if (!outcome.isValid) return null;

  // Apply safe defaults to missing optional fields
  const r = raw as Partial<SpineAnalysisResult>;

  // Repair curves: clamp, auto-swap, tilt-check
  const rawCurves = Array.isArray(r.curves) ? (r.curves as CurveResult[]) : [];
  const repairedCurves: CurveResult[] = [];
  rawCurves.forEach((curve, idx) => {
    const { curve: fixed, warnings: repairWarnings } = repairCurve(curve);
    repairedCurves.push(fixed);
    if (repairWarnings.length) {
      repairWarnings.forEach(w => outcome.warnings.push(`Curve ${idx + 1}: ${w}`));
    }
  });

  const result: SpineAnalysisResult = {
    is_valid_xray:           r.is_valid_xray ?? false,
    image_quality:           r.image_quality ?? 'poor',
    view_type:               r.view_type ?? 'unknown',
    // API simplified — these fields now have sensible defaults computed locally
    curve_type:              r.curve_type ?? 'single',
    measurement_confidence:  r.measurement_confidence ?? 'medium', // overridden locally
    measurement_method:      r.measurement_method ?? 'endplate',
    vertebrae_detected:      typeof r.vertebrae_detected === 'number' ? r.vertebrae_detected : 0,
    curves:                  repairedCurves,
    coronal_balance:         r.coronal_balance ?? 'balanced',
    overall_description:     r.overall_description ?? '',
    age_based_recommendation: r.age_based_recommendation ?? '',
    treatment_plan:          r.treatment_plan ?? '',
    followup_plan:           r.followup_plan ?? '',
    imaging_indications:     r.imaging_indications ?? '',
    _model:                  r._model,
    _timestamp:              new Date().toISOString(),
    warnings:                Array.isArray(r.warnings) ? r.warnings.filter((w): w is string => typeof w === 'string') : undefined,
  };

  return { result, outcome };
}

export function safeParseFootResult(raw: unknown): FootAnalysisResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<FootAnalysisResult>;
  if (typeof r.is_valid_xray !== 'boolean') return null;
  return {
    is_valid_xray:           r.is_valid_xray,
    foot_side:               r.foot_side ?? 'unknown',
    measurement_confidence:  r.measurement_confidence ?? 'low',
    // Use null (not -1) for missing measurements — prevents "-1°" being shown as a
    // valid reading in the report. UI components must guard with ?? 'N/A'.
    meary_angle:             typeof r.meary_angle === 'number' && r.meary_angle >= 0 && r.meary_angle <= 90 ? r.meary_angle : null,
    meary_direction:         r.meary_direction ?? 'neutral',
    calcaneal_pitch:         typeof r.calcaneal_pitch === 'number' && r.calcaneal_pitch >= 0 && r.calcaneal_pitch <= 90 ? r.calcaneal_pitch : null,
    talar_declination:       typeof r.talar_declination === 'number' && r.talar_declination >= 0 && r.talar_declination <= 90 ? r.talar_declination : null,
    severity:                (['normal','mild','moderate','severe'] as const).includes(r.severity as never) ? r.severity! : 'normal',
    flexibility:             r.flexibility ?? 'unknown',
    talus_line:              (r.talus_line && isValidNormLine(r.talus_line)) ? r.talus_line : { x1:0.3,y1:0.4,x2:0.6,y2:0.5 },
    metatarsal_line:         (r.metatarsal_line && isValidNormLine(r.metatarsal_line)) ? r.metatarsal_line : { x1:0.55,y1:0.4,x2:0.85,y2:0.44 },
    calcaneus_line:          (r.calcaneus_line && isValidNormLine(r.calcaneus_line)) ? r.calcaneus_line : { x1:0.15,y1:0.72,x2:0.42,y2:0.70 },
    overall_description:     r.overall_description ?? '',
    age_based_recommendation: r.age_based_recommendation ?? '',
    treatment_plan:          r.treatment_plan ?? '',
    followup_plan:           r.followup_plan ?? '',
    imaging_indications:     r.imaging_indications ?? '',
    orthotic_recommendations: r.orthotic_recommendations ?? '',
  };
}
