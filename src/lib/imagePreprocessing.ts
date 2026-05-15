/**
 * imagePreprocessing.ts
 *
 * Client-side image quality analysis and preprocessing for X-ray images.
 * All operations run in the browser via Canvas 2D API.
 *
 * Phases implemented:
 *   Phase 7  — Image quality detection (blur, contrast, grayscale check)
 *   Phase 7  — Histogram-stretch contrast enhancement
 *   Phase 13 — Image compression before API call
 */

import type { ImageQualityReport } from '@/types';

// ── Constants ─────────────────────────────────────────────────

const MAX_DIMENSION_PX  = 1200;   // Max width or height before compressing
const JPEG_QUALITY      = 0.87;   // JPEG export quality [0,1]
const BLUR_THRESHOLD    = 80;     // Laplacian variance below this → blurry
const LOW_CONTRAST      = 0.25;   // normalised RMS contrast below this → low contrast
const STRETCH_LO_PCT    = 0.02;   // lower percentile for histogram stretch
const STRETCH_HI_PCT    = 0.98;   // upper percentile

// ── Image loading ─────────────────────────────────────────────

/** Load a File or base64 string into an HTMLImageElement */
export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/** Convert a File to a base64 data URL */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Sampling ──────────────────────────────────────────────────

/** Draw an image onto a temporary canvas and return the pixel data */
function sampleImageData(
  img: HTMLImageElement,
  targetW = 256, targetH = 256
): ImageData {
  const cvs = document.createElement('canvas');
  cvs.width  = targetW;
  cvs.height = targetH;
  const ctx = cvs.getContext('2d')!;
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return ctx.getImageData(0, 0, targetW, targetH);
}

// ── Luminance histogram ───────────────────────────────────────

function buildLuminanceHistogram(data: Uint8ClampedArray): Uint32Array {
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[lum]++;
  }
  return hist;
}

function percentileFromHistogram(hist: Uint32Array, pct: number): number {
  const total = hist.reduce((a, b) => a + b, 0);
  let cum = 0;
  for (let v = 0; v < 256; v++) {
    cum += hist[v];
    if (cum / total >= pct) return v;
  }
  return 255;
}

// ── Blur detection (Laplacian variance) ──────────────────────

/**
 * Estimates image sharpness via the variance of the Laplacian.
 * Higher value = sharper image. Below BLUR_THRESHOLD likely blurry.
 */
function computeBlurVariance(id: ImageData): number {
  const { data, width, height } = id;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4;
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const lap =
        -gray[idx - width - 1] - gray[idx - width] - gray[idx - width + 1]
        - gray[idx - 1]         + 8 * gray[idx]     - gray[idx + 1]
        - gray[idx + width - 1] - gray[idx + width] - gray[idx + width + 1];
      sum += lap; sum2 += lap * lap; n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return (sum2 / n) - mean * mean;
}

// ── Colour detection ──────────────────────────────────────────

function isColourImage(data: Uint8ClampedArray): boolean {
  let maxChannelDiff = 0;
  for (let i = 0; i < Math.min(data.length, 10000 * 4); i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const d = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    if (d > maxChannelDiff) maxChannelDiff = d;
    if (maxChannelDiff > 30) return true;
  }
  return false;
}

// ── Quality analysis ──────────────────────────────────────────

export async function analyseImageQuality(img: HTMLImageElement): Promise<ImageQualityReport> {
  const sampleId = sampleImageData(img, 256, 256);
  const { data }  = sampleId;

  const hist         = buildLuminanceHistogram(data);
  const total        = 256 * 256;
  const histLo       = percentileFromHistogram(hist, STRETCH_LO_PCT);
  const histHi       = percentileFromHistogram(hist, STRETCH_HI_PCT);

  // Mean luminance
  let sumLum = 0;
  for (let v = 0; v < 256; v++) sumLum += v * hist[v];
  const meanLuminance = sumLum / total;

  // Contrast ratio (normalised range)
  const contrastRatio = Math.max(0, (histHi - histLo) / 255);

  const blurVariance = computeBlurVariance(sampleId);
  const isColour     = isColourImage(data);

  const issues: string[] = [];

  if (isColour)            issues.push('Image appears to be in colour — spine X-rays should be greyscale.');
  if (blurVariance < BLUR_THRESHOLD) issues.push(`Image may be blurry (sharpness score: ${blurVariance.toFixed(0)}).`);
  if (contrastRatio < LOW_CONTRAST)  issues.push(`Low contrast (${(contrastRatio * 100).toFixed(0)}%) — difficult to identify endplates.`);
  if (meanLuminance < 30)            issues.push('Image is very dark — consider brightness adjustment before analysis.');
  if (meanLuminance > 225)           issues.push('Image is overexposed — landmarks may be washed out.');

  let score: ImageQualityReport['score'];
  if (issues.length === 0)                   score = 'good';
  else if (!isColour && issues.length <= 1)  score = 'poor';
  else                                       score = 'unacceptable';

  return { score, issues, meanLuminance, contrastRatio, blurVariance, isColour, histogramLow: histLo, histogramHigh: histHi };
}

// ── Preprocessing ─────────────────────────────────────────────

export interface PreprocessingResult {
  base64: string;
  mimeType: string;
  width: number;
  height: number;
  /** What was applied */
  operations: string[];
}

/**
 * Applies preprocessing to an X-ray image:
 * 1. Resize to MAX_DIMENSION_PX if needed
 * 2. Histogram stretch (2nd–98th percentile)
 * 3. JPEG export at JPEG_QUALITY
 *
 * This improves AI recognition on dark/flat films.
 */
export async function preprocessXray(
  imgSrc: string,
  options: { resize?: boolean; histogramStretch?: boolean } = { resize: true, histogramStretch: true }
): Promise<PreprocessingResult> {
  const img = await loadImageElement(imgSrc);
  const ops: string[] = [];

  // ── Compute target dimensions ───────────────────────────────
  let w = img.naturalWidth;
  let h = img.naturalHeight;

  if (options.resize && (w > MAX_DIMENSION_PX || h > MAX_DIMENSION_PX)) {
    const ratio = Math.min(MAX_DIMENSION_PX / w, MAX_DIMENSION_PX / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
    ops.push(`Resized to ${w}×${h}`);
  }

  // ── Draw onto working canvas ────────────────────────────────
  const cvs = document.createElement('canvas');
  cvs.width  = w;
  cvs.height = h;
  const ctx = cvs.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);

  // ── Histogram stretch ───────────────────────────────────────
  if (options.histogramStretch) {
    const id   = ctx.getImageData(0, 0, w, h);
    const data = id.data;
    const hist = buildLuminanceHistogram(data);
    const lo   = percentileFromHistogram(hist, STRETCH_LO_PCT);
    const hi   = percentileFromHistogram(hist, STRETCH_HI_PCT);

    if (hi > lo) {
      const scale = 255 / (hi - lo);
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          data[i + c] = Math.max(0, Math.min(255, Math.round((data[i + c] - lo) * scale)));
        }
      }
      ctx.putImageData(id, 0, 0);
      ops.push(`Histogram stretch [${lo}–${hi}]`);
    }
  }

  // ── Export ──────────────────────────────────────────────────
  const dataUrl = cvs.toDataURL('image/jpeg', JPEG_QUALITY);
  const base64  = dataUrl.split(',')[1];

  return { base64, mimeType: 'image/jpeg', width: w, height: h, operations: ops };
}

/**
 * Fast compression for sending to API (no preprocessing).
 * Only resizes and re-encodes as JPEG.
 */
export async function compressForAPI(imgSrc: string): Promise<PreprocessingResult> {
  return preprocessXray(imgSrc, { resize: true, histogramStretch: false });
}
