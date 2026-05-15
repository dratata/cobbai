/**
 * cobbCalculation.ts
 *
 * High-level Cobb angle measurement engine.
 * Wraps lineGeometry primitives with clinical validation logic.
 *
 * Key safety guarantee: every measurement displayed to a physician
 * is cross-validated between AI-reported value and geometry-computed value.
 * Discrepancies > 5° trigger a warning.
 */

import {
  cobbAngleFromLines,
  cobbAngleFromSlopes,
  isValidNormLine,
} from '@/lib/lineGeometry';
import { getSpineRecs } from '@/lib/clinicalRules';
import type { CurveResult, NormLine, SpineAnalysisResult } from '@/types';
import type { Lang } from '@/lib/i18n';

// ── Constants ─────────────────────────────────────────────────

/** Max acceptable discrepancy between AI-reported Cobb and geometry-computed Cobb */
const CONSISTENCY_THRESHOLD_DEG = 5;

/** Max acceptable discrepancy between AI slope_delta and AI cobb_angle */
const SLOPE_CONSISTENCY_THRESHOLD_DEG = 5;

// ── Severity classification ───────────────────────────────────

export function classifyCobb(deg: number): CurveResult['severity'] {
  if (deg < 10)  return 'normal';
  if (deg < 25)  return 'mild';
  if (deg < 45)  return 'moderate';
  return 'severe';
}

// ── Validation result ─────────────────────────────────────────

export interface CobbValidationResult {
  /** Final Cobb angle to display (geometry-computed, not raw AI value) */
  displayCobb: number;

  /** Raw AI-reported value (for audit trail) */
  aiReportedCobb: number;

  /** Geometry-computed Cobb from upper_line + lower_line */
  geometryCobb: number;

  /** Discrepancy between AI-reported and geometry-computed */
  discrepancyDeg: number;

  /** Whether all checks passed */
  isConsistent: boolean;

  /** Human-readable warnings for the physician */
  warnings: string[];
}

/**
 * Validates and finalises the Cobb angle for a single curve.
 *
 * Priority order for the displayed value:
 * 1. Geometry-computed Cobb (most reliable — derived from coordinate math)
 * 2. AI-reported Cobb (fallback if coords are invalid)
 *
 * This function NEVER silently returns a wrong value.
 */
export function validateAndFinaliseCobb(curve: CurveResult): CobbValidationResult {
  const warnings: string[] = [];

  // ── Step 1: Validate coordinate lines ──────────────────────
  const upperValid = isValidNormLine(curve.upper_line);
  const lowerValid = isValidNormLine(curve.lower_line);

  if (!upperValid) warnings.push('Upper endplate line coordinates are invalid or out of range.');
  if (!lowerValid) warnings.push('Lower endplate line coordinates are invalid or out of range.');

  // ── Step 2: Compute Cobb from geometry ─────────────────────
  let geometryCobb: number;
  if (upperValid && lowerValid) {
    geometryCobb = cobbAngleFromLines(curve.upper_line, curve.lower_line);
  } else if (
    typeof curve.upper_slope_deg === 'number' &&
    typeof curve.lower_slope_deg === 'number'
  ) {
    // Fallback: use slope values if lines are bad
    geometryCobb = cobbAngleFromSlopes(curve.upper_slope_deg, curve.lower_slope_deg);
    warnings.push('Cobb computed from slope values (endplate lines invalid).');
  } else {
    // Last resort: trust AI value
    geometryCobb = curve.cobb_angle;
    warnings.push('Unable to independently verify Cobb angle — using AI-reported value.');
  }

  // ── Step 3: Cross-check AI reported vs geometry ─────────────
  const aiReportedCobb = curve.cobb_angle;
  const discrepancy    = Math.abs(aiReportedCobb - geometryCobb);
  const isConsistent   = discrepancy <= CONSISTENCY_THRESHOLD_DEG;

  if (!isConsistent) {
    warnings.push(
      `AI-reported Cobb (${aiReportedCobb}°) differs from geometry-computed Cobb ` +
      `(${geometryCobb}°) by ${discrepancy.toFixed(1)}° — exceeds ${CONSISTENCY_THRESHOLD_DEG}° threshold. ` +
      `Manual verification recommended.`
    );
  }

  // ── Step 4: Cross-check slope delta ──────────────────────────
  if (
    typeof curve.upper_slope_deg === 'number' &&
    typeof curve.lower_slope_deg === 'number'
  ) {
    const slopeDelta = cobbAngleFromSlopes(curve.upper_slope_deg, curve.lower_slope_deg);
    const slopeDisc  = Math.abs(geometryCobb - slopeDelta);
    if (slopeDisc > SLOPE_CONSISTENCY_THRESHOLD_DEG) {
      warnings.push(
        `Slope-delta method gives ${slopeDelta}° but geometry gives ${geometryCobb}°. ` +
        `Possible landmark inconsistency.`
      );
    }
  }

  // ── Step 5: Return ─────────────────────────────────────────
  // Always prefer geometry-computed value for display
  return {
    displayCobb:    isNaN(geometryCobb) ? aiReportedCobb : geometryCobb,
    aiReportedCobb,
    geometryCobb:   isNaN(geometryCobb) ? aiReportedCobb : geometryCobb,
    discrepancyDeg: discrepancy,
    isConsistent,
    warnings,
  };
}

// ── Full-result processing ────────────────────────────────────

export interface ProcessedSpineResult {
  raw: SpineAnalysisResult;
  processedCurves: Array<CurveResult & { validation: CobbValidationResult }>;
  allWarnings: string[];
  isReliable: boolean;
  // Local clinical text (generated from clinicalRules.ts, not Gemini)
  overallDescription:     string;
  ageBasedRecommendation: string;
  treatmentPlan:          string;
  followupPlan:           string;
  imagingIndications:     string;
}

/**
 * GPT patch: normaliseCurveEndplates
 * When the AI returns 4-corner data, derive the endplate lines directly from
 * the superior corners (upper) and inferior corners (lower) instead of using
 * the AI-supplied slope metadata. This reduces endplate drift.
 */
export function normaliseCurveEndplates(curve: CurveResult): CurveResult {
  const upperFromCorners: NormLine | null = curve.upper_corners
    ? { x1: curve.upper_corners.ul[0], y1: curve.upper_corners.ul[1],
        x2: curve.upper_corners.ur[0], y2: curve.upper_corners.ur[1] }
    : null;
  const lowerFromCorners: NormLine | null = curve.lower_corners
    ? { x1: curve.lower_corners.ll[0], y1: curve.lower_corners.ll[1],
        x2: curve.lower_corners.lr[0], y2: curve.lower_corners.lr[1] }
    : null;
  return {
    ...curve,
    upper_line: (upperFromCorners && isValidNormLine(upperFromCorners))
      ? upperFromCorners : curve.upper_line,
    lower_line: (lowerFromCorners && isValidNormLine(lowerFromCorners))
      ? lowerFromCorners : curve.lower_line,
  };
}

/**
 * Process a raw AI response into a clinically validated result.
 * Geometry-computed Cobb is used for display (not raw AI value).
 * Clinical text is generated locally from clinicalRules.ts.
 */
export function processSpineResult(
  raw: SpineAnalysisResult,
  lang: Lang = 'en',
  patientAge?: string,
  patientGender?: string,
  risserStage?: string
): ProcessedSpineResult {
  const allWarnings: string[] = [];
  let isReliable = raw.is_valid_xray;

  if (raw.image_quality === 'unacceptable') {
    allWarnings.push('Image quality unacceptable — measurement may be unreliable.');
    isReliable = false;
  } else if (raw.image_quality === 'poor') {
    allWarnings.push('Image quality poor — please verify measurement manually.');
  }

  if (raw.measurement_confidence === 'low') {
    allWarnings.push('AI confidence is low — manual verification required.');
  }

  // GPT patch: derive endplate lines from 4-corner data when available (reduces drift)
  const processedCurves = (raw.curves || []).map(rawCurve => {
    const curve = normaliseCurveEndplates(rawCurve);
    const validation = validateAndFinaliseCobb(curve);

    // Update display value to geometry-computed (safer than raw AI)
    const corrected: CurveResult = {
      ...curve,
      cobb_angle:  validation.displayCobb,
      severity:    classifyCobb(validation.displayCobb),
      slope_delta_deg: Math.abs(
        (curve.upper_slope_deg ?? 0) - (curve.lower_slope_deg ?? 0)
      ),
    };

    allWarnings.push(...validation.warnings);
    if (!validation.isConsistent) isReliable = false;

    return { ...corrected, validation };
  });

  // Generate clinical text locally (no API tokens)
  const primaryCobb   = processedCurves[0]?.cobb_angle ?? 0;
  const primaryLoc    = processedCurves[0]?.curve_location ?? 'thoracic';
  const localRecs = primaryCobb > 0
    ? getSpineRecs(primaryCobb, primaryLoc, lang, patientAge, patientGender, risserStage)
    : { overallDescription: '', ageBasedRecommendation: '', treatmentPlan: '', followupPlan: '', imagingIndications: '' };

  // Also include AI-generated text as fallback if local is empty and AI provided it
  return {
    raw, processedCurves, allWarnings, isReliable,
    overallDescription:     localRecs.overallDescription     || raw.overall_description     || '',
    ageBasedRecommendation: localRecs.ageBasedRecommendation || raw.age_based_recommendation || '',
    treatmentPlan:          localRecs.treatmentPlan          || raw.treatment_plan           || '',
    followupPlan:           localRecs.followupPlan           || raw.followup_plan            || '',
    imagingIndications:     localRecs.imagingIndications     || raw.imaging_indications      || '',
  };
}

// ── Manual correction ─────────────────────────────────────────

/**
 * Compute live Cobb angle from manually adjusted endplate lines.
 * Used in the drag-correction workflow.
 */
export function computeLiveCobb(upperLine: NormLine, lowerLine: NormLine): number {
  // No bounds check here: this is called on every drag frame.
  // Coordinates come from canvasToNorm() which already clamps to [0,1].
  // We only guard against zero-length (degenerate) lines.
  const result = cobbAngleFromLines(upperLine, lowerLine);
  return isNaN(result) ? 0 : result;
}

// ── Growth progression (Lonstein & Carlson 1992) ──────────────

export type ProgressionRisk = 'low' | 'medium' | 'high';

export interface GrowthPrediction {
  risk: ProgressionRisk;
  score: number;
  description: string;
  recommendation: string;
}

export function estimateProgressionRisk(
  cobbDeg: number,
  ageYears: number,
  isFemale: boolean,
  risserStage?: number
): GrowthPrediction {
  let score = 0;

  if (cobbDeg >= 40) score += 6;
  else if (cobbDeg >= 30) score += 4;
  else if (cobbDeg >= 20) score += 2;

  if (isFemale) score += 2;

  if (ageYears < 12)  score += 3;
  else if (ageYears < 15) score += 2;

  if (risserStage != null) {
    if (risserStage <= 1) score += 3;
    else if (risserStage === 2) score += 2;
    else if (risserStage >= 3) score -= 1;
  }

  let risk: ProgressionRisk;
  let description: string;
  let recommendation: string;

  if (score <= 3) {
    risk = 'low';
    description = 'Low progression risk.';
    recommendation = 'Clinical follow-up every 6 months. Exercise programme.';
  } else if (score <= 6) {
    risk = 'medium';
    description = 'Moderate progression risk.';
    recommendation = 'PMR specialist review every 3–4 months. Consider bracing if skeletally immature.';
  } else {
    risk = 'high';
    description = 'High progression risk.';
    recommendation = 'Urgent PMR Specialist review. Brace evaluation if Cobb 25–45°. Surgical evaluation if Cobb >45°.';
  }

  return { risk, score, description, recommendation };
}
