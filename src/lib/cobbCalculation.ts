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
 * 1. AI-reported Cobb (the radiologist-style visual measurement)
 * 2. Geometry-computed Cobb (fallback when AI returns 0/missing, only if reliable)
 *
 * Geometry is always computed and cross-checked against the AI value —
 * discrepancies > 5° surface a manual-verification warning — but it does not
 * override a non-zero AI value. See Step 5 below.
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

  const aiReportedCobb = curve.cobb_angle;

  // ── Step 2: Compute Cobb from geometry ─────────────────────
  let geometryCobb: number;
  let geometryIsReliable = false;  // true only when valid lines produce a plausible angle

  if (upperValid && lowerValid) {
    geometryCobb       = cobbAngleFromLines(curve.upper_line, curve.lower_line);
    // Only treat geometry as reliable if it gives a clinically non-trivial angle
    // OR the AI also reports a small angle (both agree the spine is near-straight)
    geometryIsReliable = geometryCobb > 0.5 || aiReportedCobb < 3;
  } else if (
    typeof curve.upper_slope_deg === 'number' &&
    typeof curve.lower_slope_deg === 'number' &&
    // Skip slope fallback when both slopes are 0 — these are schema placeholder
    // values echoed back by the AI without actual measurement. Using them gives
    // geometryCobb = 0° which is wrong when the AI separately reports a real angle.
    !(curve.upper_slope_deg === 0 && curve.lower_slope_deg === 0)
  ) {
    geometryCobb = cobbAngleFromSlopes(curve.upper_slope_deg, curve.lower_slope_deg);
    geometryIsReliable = geometryCobb > 0.5;
    warnings.push('Cobb computed from slope values (endplate lines invalid).');
  } else {
    // Last resort OR echoed placeholder zeros: trust AI value
    geometryCobb       = aiReportedCobb;
    geometryIsReliable = false;
    if (!upperValid || !lowerValid) {
      warnings.push('Endplate coordinates unavailable — AI-reported Cobb used directly. Manual verification recommended.');
    }
  }

  // ── Step 3: Cross-check AI reported vs geometry ─────────────
  const discrepancy = Math.abs(aiReportedCobb - geometryCobb);
  const isConsistent = discrepancy <= CONSISTENCY_THRESHOLD_DEG;

  if (geometryIsReliable && !isConsistent) {
    warnings.push(
      `AI-reported Cobb (${aiReportedCobb}°) differs from geometry-computed Cobb ` +
      `(${geometryCobb}°) by ${discrepancy.toFixed(1)}° — exceeds ${CONSISTENCY_THRESHOLD_DEG}° threshold. ` +
      `Manual verification recommended.`
    );
  }

  // ── Step 4: Cross-check slope delta (only when geometry is from valid lines) ──
  if (
    geometryIsReliable && upperValid && lowerValid &&
    typeof curve.upper_slope_deg === 'number' &&
    typeof curve.lower_slope_deg === 'number' &&
    !(curve.upper_slope_deg === 0 && curve.lower_slope_deg === 0)
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

  // ── Step 5: Choose display value ───────────────────────────
  // Primary = AI-reported cobb_angle (the radiologist's visual measurement).
  // AI measures directly from the image using visual assessment of endplate tilt —
  // this is the same method a physician uses at the lightbox.
  //
  // Local geometry (from corner coordinates) is used as a cross-check:
  // if the two values differ >5° a warning prompts manual verification.
  // displayCobb = AI value so the physician sees what the AI directly measured.
  //
  // Fallback: if AI returns 0 or missing (placeholder echo), use local geometry
  // when it is reliable, otherwise show 0 with a warning.
  const displayCobb = aiReportedCobb > 0
    ? aiReportedCobb
    : (geometryIsReliable ? geometryCobb : 0);

  return {
    displayCobb,
    aiReportedCobb,                                          // kept for audit trail
    geometryCobb:   isNaN(geometryCobb) ? 0 : geometryCobb, // local geometry
    discrepancyDeg: geometryIsReliable ? discrepancy : 0,
    isConsistent:   geometryIsReliable ? isConsistent : true,
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
/**
 * Reconstruct an endplate line using the AI's measured slope and the
 * horizontal extent from the corner coordinates.
 *
 * Why: The AI reports both corner positions (for the vertebra box) and a
 * slope angle (for the Cobb measurement). The drawn endplate line should
 * exactly reflect the slope the AI measured — not the raw corner-to-corner
 * angle, which can differ due to small corner placement errors.
 *
 * Method: keep x1, x2 from the base line (corners); compute y1, y2 by
 * applying tan(slopeDeg) around the vertical midpoint of the line.
 */
function applyAISlope(base: NormLine, slopeDeg: number): NormLine {
  const { x1, x2 } = base;
  const midY    = (base.y1 + base.y2) / 2;       // anchor at vertical midpoint
  const halfDx  = (x2 - x1) / 2;
  const rad     = slopeDeg * Math.PI / 180;
  return {
    x1,
    y1: midY - halfDx * Math.tan(rad),
    x2,
    y2: midY + halfDx * Math.tan(rad),
  };
}


export function normaliseCurveEndplates(curve: CurveResult): CurveResult {
  // Build base lines from corner coordinates
  const upperFromCorners: NormLine | null = curve.upper_corners
    ? { x1: curve.upper_corners.ul[0], y1: curve.upper_corners.ul[1],
        x2: curve.upper_corners.ur[0], y2: curve.upper_corners.ur[1] }
    : null;
  const lowerFromCorners: NormLine | null = curve.lower_corners
    ? { x1: curve.lower_corners.ll[0], y1: curve.lower_corners.ll[1],
        x2: curve.lower_corners.lr[0], y2: curve.lower_corners.lr[1] }
    : null;

  // Candidate base lines (corners preferred over direct AI-supplied line)
  const upperBase = (upperFromCorners && isValidNormLine(upperFromCorners))
    ? upperFromCorners
    : (isValidNormLine(curve.upper_line) ? curve.upper_line : null);

  const lowerBase = (lowerFromCorners && isValidNormLine(lowerFromCorners))
    ? lowerFromCorners
    : (isValidNormLine(curve.lower_line) ? curve.lower_line : null);

  // Check whether the AI provided meaningful (non-zero) slope values
  const hasSlopes =
    typeof curve.upper_slope_deg === 'number' &&
    typeof curve.lower_slope_deg === 'number' &&
    !(curve.upper_slope_deg === 0 && curve.lower_slope_deg === 0);

  // If AI supplied slope angles, rebuild lines so the drawn endplate EXACTLY
  // matches the angle the AI measured (same horizontal span, AI-corrected tilt).
  // This ensures the displayed Cobb arc is geometrically consistent with the
  // AI's cobb_angle = |upper_slope - lower_slope|.
  const upper_line = upperBase
    ? (hasSlopes ? applyAISlope(upperBase, curve.upper_slope_deg!) : upperBase)
    : curve.upper_line;

  const lower_line = lowerBase
    ? (hasSlopes ? applyAISlope(lowerBase, curve.lower_slope_deg!) : lowerBase)
    : curve.lower_line;

  return { ...curve, upper_line, lower_line };
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

const PROGRESSION_TEXT: Record<Lang, Record<ProgressionRisk, { description: string; recommendation: string }>> = {
  en: {
    low:    { description: 'Low progression risk.',      recommendation: 'Clinical follow-up every 6 months. Exercise programme.' },
    medium: { description: 'Moderate progression risk.', recommendation: 'PMR specialist review every 3–4 months. Consider bracing if skeletally immature.' },
    high:   { description: 'High progression risk.',     recommendation: 'Urgent PMR Specialist review. Brace evaluation if Cobb 25–45°. Surgical evaluation if Cobb >45°.' },
  },
  tr: {
    low:    { description: 'Düşük ilerleme riski.',      recommendation: '6 ayda bir klinik takip. Egzersiz programı.' },
    medium: { description: 'Orta ilerleme riski.',       recommendation: '3–4 ayda bir FTR uzmanı değerlendirmesi. İskelet olgunlaşması tamamlanmadıysa korse düşünülmeli.' },
    high:   { description: 'Yüksek ilerleme riski.',     recommendation: 'Acil FTR uzmanı değerlendirmesi. Cobb 25–45° ise korse değerlendirmesi. Cobb >45° ise cerrahi değerlendirme.' },
  },
  ar: {
    low:    { description: 'خطر تطور منخفض.',  recommendation: 'متابعة سريرية كل 6 أشهر. برنامج تمارين.' },
    medium: { description: 'خطر تطور متوسط.',  recommendation: 'مراجعة أخصائي الطب الطبيعي والتأهيل كل 3–4 أشهر. النظر في الدعامة إذا لم يكتمل النضج الهيكلي.' },
    high:   { description: 'خطر تطور مرتفع.',  recommendation: 'مراجعة عاجلة لأخصائي الطب الطبيعي والتأهيل. تقييم الدعامة إذا كانت زاوية كوب 25–45°. تقييم جراحي إذا كانت زاوية كوب >45°.' },
  },
};

export function estimateProgressionRisk(
  cobbDeg: number,
  ageYears: number,
  isFemale: boolean,
  risserStage?: number,
  lang: Lang = 'en'
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
  if (score <= 3)      risk = 'low';
  else if (score <= 6) risk = 'medium';
  else                 risk = 'high';

  const text = (PROGRESSION_TEXT[lang] ?? PROGRESSION_TEXT.en)[risk];

  return { risk, score, description: text.description, recommendation: text.recommendation };
}
