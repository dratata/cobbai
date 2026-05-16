// ============================================================
// CobbAI v2 — Clinical Type System
// All medical data types are defined here. No `any`.
// ============================================================

// ── Primitives ───────────────────────────────────────────────

/** Normalised image coordinate: top-left = (0,0), bottom-right = (1,1) */
export interface NormPoint { x: number; y: number }

/** Normalised endplate line */
export interface NormLine {
  x1: number; y1: number;
  x2: number; y2: number;
}

/** Four corners of a vertebral body in normalised coords */
export interface FourCorners {
  ul: readonly [number, number]; // upper-left
  ur: readonly [number, number]; // upper-right
  ll: readonly [number, number]; // lower-left
  lr: readonly [number, number]; // lower-right
}

// ── Enumerations ─────────────────────────────────────────────

export type SeverityLevel   = 'normal' | 'mild' | 'moderate' | 'severe';
export type CurveLocation   = 'cervical' | 'cervicothoracic' | 'thoracic' | 'thoracolumbar' | 'lumbar' | 'lumbosacral';
export type CurveType       = 'single' | 'double' | 'triple';
export type Convexity       = 'right' | 'left';           // canonical English; display layer handles i18n
export type RotationGrade   = '0' | 'I' | 'II' | 'III' | 'IV';  // Nash–Moe
export type Confidence      = 'high' | 'medium' | 'low';
export type ImageQuality    = 'good' | 'poor' | 'unacceptable';
export type ViewType        = 'PA' | 'AP' | 'unknown';
export type MeasurementMethod = 'endplate' | 'pedicle';
export type AppModality     = 'spine' | 'foot';
export type AppLanguage     = 'en' | 'tr' | 'ar';
export type CoronalBalance  = 'balanced' | 'left_shift' | 'right_shift';

// ── Per-curve measurement ─────────────────────────────────────

export interface CurveResult {
  readonly id: number;
  readonly label: string;

  /** Cobb angle reported by AI (degrees). Always validate against slope delta. */
  cobb_angle: number;

  /** ΔSlope cross-check: |upper_slope_deg – lower_slope_deg|. Must ≈ cobb_angle. */
  slope_delta_deg?: number;

  severity: SeverityLevel;
  curve_location: CurveLocation;

  /** Convexity in canonical English; UI layer translates */
  convexity_direction: Convexity;

  upper_vertebra_name: string;
  lower_vertebra_name: string;
  apical_vertebra_name?: string;
  rotation_grade?: RotationGrade;

  /** 4-corner detection per Caesarendra 2022 / AASCE standard */
  upper_corners?: FourCorners;
  lower_corners?: FourCorners;

  /** Endplate lines (used for rendering + cross-validation) */
  upper_line: NormLine;
  lower_line: NormLine;

  /** Inclination angles from 4-corner slope method (Maeda 2023) */
  upper_slope_deg?: number;
  lower_slope_deg?: number;

  /** Apical vertebra centroid in normalised coords */
  apex_x?: number;
  apex_y?: number;

  /** Set to true when a physician has manually corrected this curve */
  manually_corrected?: boolean;
  correction_timestamp?: string;
}

// ── Full analysis result ──────────────────────────────────────

export interface SpineAnalysisResult {
  is_valid_xray: boolean;
  image_quality: ImageQuality;
  view_type: ViewType;
  curve_type: CurveType;
  measurement_confidence: Confidence;
  measurement_method: MeasurementMethod;
  vertebrae_detected: number;
  curves: CurveResult[];
  coronal_balance: CoronalBalance;

  // Clinical text — now optional (generated locally in clinicalRules.ts)
  overall_description?:     string;
  age_based_recommendation?: string;
  treatment_plan?:          string;
  followup_plan?:           string;
  imaging_indications?:     string;

  // v3: short warnings array instead of long text fields
  warnings?: string[];

  _model?: string;
  _timestamp?: string;
}

// ── Manual correction ─────────────────────────────────────────

export interface EditableLine extends NormLine {}

export interface CorrectionState {
  isActive: boolean;
  curveIndex: number;
  upperLine: EditableLine;
  lowerLine: EditableLine;
  /** Live Cobb computed from current editable lines */
  liveCobb: number;
}

// ── History & sessions ────────────────────────────────────────

export interface MeasurementSession {
  id: string;
  timestamp: string;             // ISO-8601
  modality: AppModality;
  result: SpineAnalysisResult;
  patientAge?: string;
  patientGender?: string;
  notes?: string;
}

// ── Image state ───────────────────────────────────────────────

export interface LoadedImage {
  /** base64 string (after optional preprocessing) */
  base64: string;
  /** original base64 before any processing */
  originalBase64: string;
  mimeType: string;
  naturalWidth: number;
  naturalHeight: number;
  filename?: string;
}

// ── Image quality analysis (client-side) ─────────────────────

export interface ImageQualityReport {
  score: ImageQuality;
  issues: string[];
  meanLuminance: number;     // 0–255
  contrastRatio: number;     // 0–1
  blurVariance: number;      // Laplacian variance; higher = sharper
  isColour: boolean;
  histogramLow: number;      // 2nd percentile
  histogramHigh: number;     // 98th percentile
}

// ── Foot analysis (Meary angle) ───────────────────────────────

export interface FootAnalysisResult {
  is_valid_xray: boolean;
  foot_side: 'left' | 'right' | 'unknown';
  measurement_confidence: Confidence;
  meary_angle: number | null;
  meary_direction: 'plantar' | 'dorsal' | 'neutral';
  calcaneal_pitch: number | null;
  talar_declination: number | null;
  severity: SeverityLevel;
  flexibility: 'flexible' | 'rigid' | 'unknown';
  talus_line: NormLine;
  metatarsal_line: NormLine;
  calcaneus_line: NormLine;
  overall_description: string;
  age_based_recommendation: string;
  treatment_plan: string;
  followup_plan: string;
  imaging_indications: string;
  orthotic_recommendations: string;
}

// ── Validation (Phase 9) ──────────────────────────────────────

export interface ValidationCase {
  id: string;
  expertCobb: number;
  aiCobb: number;
  absError: number;
  withinFiveDegrees: boolean;
  curveLocation?: CurveLocation;
  imageQuality?: ImageQuality;
  notes?: string;
}

export interface ValidationMetrics {
  n: number;
  mae: number;                     // Mean Absolute Error
  rmse: number;                    // Root Mean Squared Error
  icc: number;                     // Intraclass Correlation Coefficient
  pearsonR: number;
  withinFivePercent: number;       // % cases within ±5°
  meanBias: number;                // Bland–Altman mean bias
  loa95Upper: number;              // Limits of agreement +1.96 SD
  loa95Lower: number;              // Limits of agreement -1.96 SD
}

// ── API request/response ──────────────────────────────────────

export interface AnalyzeSpineRequest {
  imageBase64: string;
  mimeType: string;
  patientAge?: string;
  patientGender?: string;
  lang?: AppLanguage;
}

export interface AnalyzeFootRequest extends AnalyzeSpineRequest {}

export interface APIError {
  error: string;
}
