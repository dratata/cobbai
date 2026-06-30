/**
 * validationMetrics.ts
 * Scientific validation metrics for AI vs expert Cobb angle comparison.
 * Implements: MAE, RMSE, ICC(2,1), Pearson r, Bland-Altman analysis.
 */

export interface ValidationCase {
  id: string;
  expertCobb: number;
  aiCobb: number;
  curveType?: string;
  imageQuality?: string;
  notes?: string;
}

export interface ValidationMetrics {
  n: number;
  mae:              number;   // Mean Absolute Error
  rmse:             number;   // Root Mean Squared Error
  icc:              number;   // ICC(2,1) — two-way mixed, absolute agreement
  pearsonR:         number;   // Pearson correlation coefficient
  within5deg:       number;   // % of cases within ±5°
  within10deg:      number;   // % within ±10°
  meanBias:         number;   // Bland-Altman mean bias (expert - AI)
  loa95Upper:       number;   // +1.96 SD limit of agreement
  loa95Lower:       number;   // -1.96 SD limit of agreement
  sdDiff:           number;   // SD of differences
}

export interface BlandAltmanPoint { mean: number; diff: number; id: string; }

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function sd(arr: number[], mu?: number): number {
  if (arr.length < 2) return 0; // sample SD is undefined for n<2 — guard against NaN propagating into loa95/ms_e
  const m = mu ?? mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

export function calculateMetrics(cases: ValidationCase[]): ValidationMetrics {
  const n = cases.length;
  if (n === 0) return { n:0, mae:0, rmse:0, icc:0, pearsonR:0, within5deg:0, within10deg:0, meanBias:0, loa95Upper:0, loa95Lower:0, sdDiff:0 };
  // n=1: sample SD/ICC/Pearson r are statistically undefined (division by n-1=0).
  // Return the well-defined point statistics (MAE/RMSE/bias/within-X%) and zero
  // out the rest rather than letting NaN/Infinity leak into the dashboard charts.
  if (n === 1) {
    const d = cases[0].expertCobb - cases[0].aiCobb;
    const absD = Math.abs(d);
    return {
      n: 1, mae: absD, rmse: absD, icc: 0, pearsonR: 0,
      within5deg: absD <= 5 ? 100 : 0, within10deg: absD <= 10 ? 100 : 0,
      meanBias: d, loa95Upper: d, loa95Lower: d, sdDiff: 0,
    };
  }

  const experts = cases.map(c => c.expertCobb);
  const ais     = cases.map(c => c.aiCobb);
  const diffs   = cases.map(c => c.expertCobb - c.aiCobb);
  const absDiff = diffs.map(Math.abs);

  const mae  = mean(absDiff);
  const rmse = Math.sqrt(mean(diffs.map(d => d ** 2)));

  // Bland-Altman
  const meanBias  = mean(diffs);
  const sdDiff2   = sd(diffs, meanBias);
  const loa95Upper = meanBias + 1.96 * sdDiff2;
  const loa95Lower = meanBias - 1.96 * sdDiff2;

  // Pearson r
  const mE = mean(experts), mA = mean(ais);
  const num    = cases.reduce((s, c) => s + (c.expertCobb - mE) * (c.aiCobb - mA), 0);
  const denomE = Math.sqrt(cases.reduce((s, c) => s + (c.expertCobb - mE) ** 2, 0));
  const denomA = Math.sqrt(cases.reduce((s, c) => s + (c.aiCobb - mA) ** 2, 0));
  const pearsonR = denomE * denomA > 0 ? num / (denomE * denomA) : 0;

  // ICC(2,1) — two-way mixed, absolute agreement
  const grandMean = mean([...experts, ...ais]);
  const ms_r = cases.reduce((s, c) => s + ((c.expertCobb + c.aiCobb) / 2 - grandMean) ** 2, 0) * 2 / (n - 1);
  const ms_c = n * ((mE - grandMean) ** 2 + (mA - grandMean) ** 2) / (2 - 1);
  const ss_e = cases.reduce((s, c) => s + (c.expertCobb - mE - c.aiCobb + mA) ** 2, 0);
  const ms_e = ss_e / ((n - 1) * 1);
  const icc  = ms_e > 0 ? (ms_r - ms_e) / (ms_r + ms_e + 2 * (ms_c - ms_e) / n) : 0;

  const within5deg  = cases.filter(c => Math.abs(c.expertCobb - c.aiCobb) <= 5).length / n * 100;
  const within10deg = cases.filter(c => Math.abs(c.expertCobb - c.aiCobb) <= 10).length / n * 100;

  return { n, mae, rmse, icc: Math.max(-1, Math.min(1, icc)), pearsonR, within5deg, within10deg, meanBias, loa95Upper, loa95Lower, sdDiff: sdDiff2 };
}

export function getBlandAltmanPoints(cases: ValidationCase[]): BlandAltmanPoint[] {
  return cases.map(c => ({ mean: (c.expertCobb + c.aiCobb) / 2, diff: c.expertCobb - c.aiCobb, id: c.id }));
}

/** Parse CSV text into ValidationCase[]. Expected columns: id,expertCobb,aiCobb[,curveType,imageQuality,notes] */
export function parseValidationCSV(csv: string): ValidationCase[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(',').map(h => h.trim());
  const idIdx     = header.findIndex(h => h.includes('id'));
  const expIdx    = header.findIndex(h => h.includes('expert') || h.includes('manual'));
  const aiIdx     = header.findIndex(h => h.includes('ai') || h.includes('auto'));
  const curveIdx  = header.findIndex(h => h.includes('curvetype') || h.includes('curve_type') || h.includes('curve'));
  const qualIdx   = header.findIndex(h => h.includes('imagequality') || h.includes('image_quality') || h.includes('quality'));
  const notesIdx  = header.findIndex(h => h.includes('notes') || h.includes('note'));
  if (expIdx < 0 || aiIdx < 0) return [];
  const result: ValidationCase[] = [];
  lines.slice(1).forEach((line, i) => {
    const cols = line.split(',').map(c => c.trim());
    const expRaw = cols[expIdx];
    const aiRaw  = cols[aiIdx];
    // A 0° Cobb angle is a valid (normal-spine) measurement, not a missing value —
    // skip the row only if BOTH raw cells are absent/blank, so it isn't
    // indistinguishable from a fully blank/unparsable line.
    if ((expRaw === undefined || expRaw === '') && (aiRaw === undefined || aiRaw === '')) return;
    result.push({
      id:           idIdx >= 0 ? (cols[idIdx] || `case_${i+1}`) : `case_${i+1}`,
      expertCobb:   parseFloat(expRaw) || 0,
      aiCobb:       parseFloat(aiRaw)  || 0,
      curveType:    curveIdx >= 0 ? (cols[curveIdx] || '') : '',
      imageQuality: qualIdx  >= 0 ? (cols[qualIdx]  || '') : '',
      notes:        notesIdx >= 0 ? (cols[notesIdx] || '') : '',
    });
  });
  return result;
}
