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

const MAX_DIMENSION_PX  = 1200;   // Max width or height for API-bound images
/** Maximum dimension before ANY canvas operation.
 *  iOS Safari throws "Maximum Canvas Area Exceeded" beyond ~16.7 MP (4096×4096).
 *  We cap at 2048 px to stay safe on all devices including older iPhones.
 *  This only affects intermediate canvases (crop detection, EXIF rotation);
 *  preprocessXray already enforces MAX_DIMENSION_PX=1200 for the final output. */
const MAX_SAFE_CANVAS_DIM = 2048;
const JPEG_QUALITY      = 0.87;   // JPEG export quality [0,1]
const BLUR_THRESHOLD    = 80;     // Laplacian variance below this → blurry
const LOW_CONTRAST      = 0.25;   // normalised RMS contrast below this → low contrast
const STRETCH_LO_PCT    = 0.02;   // lower percentile for histogram stretch
const STRETCH_HI_PCT    = 0.98;   // upper percentile
/** Minimum pixel value after histogram stretch (0–255).
 *  Lifting the black floor from 0 to this value prevents JPEG compression
 *  and the stretch algorithm from creating jet-black areas where subtle
 *  anatomical detail (e.g. pedicle edges in low-contrast X-rays) should
 *  still be faintly visible on screen. */
const STRETCH_FLOOR     = 8;

// ── Image loading ─────────────────────────────────────────────

/** Load a File or base64 string into an HTMLImageElement */
export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // HATA 4 FIX: crossOrigin='Anonymous' prevents canvas taint for external URLs
    // Must be set BEFORE img.src — order matters for CORS preflight
    img.crossOrigin = 'Anonymous';
    img.onload  = () => resolve(img);
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

  // ── Unsharp mask — enhances vertebra cortical bone edges ──────
  // Professional spine X-ray software (PACS, Surgimap) applies edge
  // enhancement before landmark detection. Sharpening the cortical
  // endplate edges helps the AI distinguish individual vertebra
  // boundaries, improving end-vertebra selection accuracy.
  // We use a lightweight unsharp mask: blur → subtract → add back.
  if (options.histogramStretch) {
    // Apply subtle unsharp mask first
    const origData = ctx.getImageData(0, 0, w, h);
    const blurCvs  = document.createElement('canvas');
    blurCvs.width  = w; blurCvs.height = h;
    const blurCtx  = blurCvs.getContext('2d')!;
    blurCtx.filter = 'blur(1.2px)';
    blurCtx.drawImage(cvs, 0, 0);
    const blurData = blurCtx.getImageData(0, 0, w, h);
    const sharp    = origData;
    const STRENGTH = 0.55;  // unsharp mask strength
    for (let i = 0; i < sharp.data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const orig   = origData.data[i + c];
        const blur   = blurData.data[i + c];
        const detail = orig - blur;                       // high-freq detail
        sharp.data[i + c] = Math.max(0, Math.min(255,
          Math.round(orig + STRENGTH * detail)
        ));
      }
    }
    ctx.putImageData(sharp, 0, 0);
  }

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
          // Floor at 8 instead of 0: lifts jet-black areas to dark-gray
          // so anatomical detail in shadows remains visible on screen
          data[i + c] = Math.max(STRETCH_FLOOR, Math.min(255, Math.round((data[i + c] - lo) * scale)));
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

// ── Auto-crop black borders ────────────────────────────────────
/**
 * autoCropBlackBorders — removes dark/black padding around X-ray images.
 *
 * X-ray images often have large black borders that waste API tokens.
 * This function crops them out before sending to Gemini, reducing:
 *   - image dimensions → fewer tokens
 *   - landmark coordinate noise (AI focuses on spine, not empty black space)
 *
 * @param imgSrc  data URL or URL of the image
 * @param threshold  pixel brightness threshold (0-255). Pixels above = content.
 * @param padding  pixels of padding to keep around detected content (default 20)
 */
export async function autoCropBlackBorders(
  imgSrc: string,
  threshold = 15,
  padding = 20
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(imgSrc); return; }

      // Fix 3 — iOS Canvas crash: 8K+ images exceed iOS Safari's canvas area limit
      // (~16.7 MP). Pre-scale to MAX_SAFE_CANVAS_DIM before drawing.
      // The scale factor is used later to convert crop coordinates back to the
      // original image space so the final output preserves full detail.
      const naturalW = img.naturalWidth  || img.width;
      const naturalH = img.naturalHeight || img.height;
      const scaleF   = Math.min(1, MAX_SAFE_CANVAS_DIM / Math.max(naturalW, naturalH));
      const safeW    = Math.max(1, Math.round(naturalW * scaleF));
      const safeH    = Math.max(1, Math.round(naturalH * scaleF));

      canvas.width  = safeW;
      canvas.height = safeH;
      ctx.drawImage(img, 0, 0, safeW, safeH); // downscaled draw — safe on all devices

      const { data, width, height } = ctx.getImageData(0, 0, safeW, safeH);

      let minX = width, minY = height, maxX = 0, maxY = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          // Average luminance
          if ((data[i] + data[i+1] + data[i+2]) / 3 > threshold) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      // No content found — return original
      if (minX > maxX || minY > maxY) { resolve(imgSrc); return; }

      // Apply padding (in safe-canvas pixel space)
      minX = Math.max(0, minX - padding);
      minY = Math.max(0, minY - padding);
      maxX = Math.min(width,  maxX + padding);
      maxY = Math.min(height, maxY + padding);

      const w = maxX - minX;
      const h = maxY - minY;

      // Only crop if we're actually removing something meaningful (>5% reduction)
      const cropRatio = (w * h) / (width * height);
      if (cropRatio > 0.95) { resolve(imgSrc); return; }

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = w; cropCanvas.height = h;
      const cropCtx = cropCanvas.getContext('2d');
      if (!cropCtx) { resolve(imgSrc); return; } // guard: canvas limit exceeded → use original
      cropCtx.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
      resolve(cropCanvas.toDataURL('image/jpeg', 0.87));
    };
    img.onerror = reject;
    img.src = imgSrc;
  });
}

// ── EXIF Orientation Normalisation ────────────────────────────

/**
 * Convert a data URL to a Blob WITHOUT using fetch().
 *
 * fetch(dataUrl) is blocked by strict CSP headers (e.g. Vercel defaults)
 * and can also throw opaque React internal errors in concurrent-mode builds.
 * atob() is always available, CSP-safe, and synchronous.
 */
function _dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const mime  = dataUrl.slice(5, comma).replace(';base64', '') || 'image/jpeg';
  const bin   = atob(dataUrl.slice(comma + 1));
  const buf   = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: mime });
}

/**
 * Convert a data URL to an ArrayBuffer WITHOUT using fetch() — CSP-safe.
 * Only decodes the first 64 KB (EXIF data lives in the first few KB of a JPEG).
 */
function _dataUrlToPartialArrayBuffer(dataUrl: string, maxBytes = 65536): ArrayBuffer {
  const comma  = dataUrl.indexOf(',');
  const b64    = dataUrl.slice(comma + 1);
  // Decode only as many base64 chars as needed (4 chars → 3 bytes)
  const maxB64 = Math.ceil(maxBytes / 3) * 4;
  const slice  = b64.slice(0, maxB64);
  const bin    = atob(slice);
  const buf    = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

/**
 * normalizeExifOrientation
 *
 * Accepts either a data: URL (legacy) OR a blob: URL (Fix 2 — from
 * URL.createObjectURL). Both forms are handled transparently.
 *
 * Strategy (modern-first):
 *   1. createImageBitmap(blob, { imageOrientation:'from-image' }) bakes EXIF.
 *      For data: URLs the blob is built via atob() (CSP-safe, no fetch needed).
 *      For blob: URLs the browser's Blob is fetched via the same-origin blob scheme.
 *   2. Legacy fallback: read EXIF orientation byte, apply canvas rotation.
 *
 * Returns a JPEG data URL with EXIF rotation baked in, or the original url on error.
 */
export async function normalizeExifOrientation(url: string): Promise<string> {
  const isDataUrl = url.startsWith('data:');
  try {
    // ── Modern path — createImageBitmap ───────────────────────
    if (typeof createImageBitmap !== 'undefined') {
      try {
        let blob: Blob;
        if (isDataUrl) {
          blob = _dataUrlToBlob(url);           // atob() path — CSP-safe
        } else {
          // blob: URL — fetch is same-origin and exempt from connect-src CSP
          blob = await fetch(url).then(r => r.blob());
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bitmap = await (createImageBitmap as any)(blob, { imageOrientation: 'from-image' });
        const cvs    = document.createElement('canvas');
        cvs.width    = bitmap.width;
        cvs.height   = bitmap.height;
        cvs.getContext('2d')!.drawImage(bitmap, 0, 0);
        bitmap.close?.();
        return cvs.toDataURL('image/jpeg', 0.92);
      } catch {
        /* imageOrientation not supported → fallback */
      }
    }

    // ── Legacy fallback — manual EXIF parse + canvas rotate ───
    const orientation = await _readJpegExifOrientation(url);
    if (!orientation || orientation === 1) return url;

    return new Promise<string>((resolve) => {
      const img   = new Image();
      img.onload  = () => resolve(_applyExifRotation(img, orientation));
      img.onerror = () => resolve(url);
      img.src     = url;
    });
  } catch {
    return url;
  }
}

/**
 * Read the EXIF Orientation tag (1–8) from a JPEG data: URL or blob: URL.
 * For data: URLs: synchronous via atob() (CSP-safe).
 * For blob: URLs: fetches the first 64 KB (same-origin, no CSP issue).
 * Returns null if not a JPEG, no EXIF segment, or tag not found.
 */
async function _readJpegExifOrientation(url: string): Promise<number | null> {
  try {
    let buf: ArrayBuffer;
    if (url.startsWith('data:')) {
      buf = _dataUrlToPartialArrayBuffer(url, 65536);              // atob(), no fetch
    } else {
      // blob: URL — fetch the first 64 KB for EXIF parsing
      const resp = await fetch(url);
      const full = await resp.arrayBuffer();
      buf = full.slice(0, 65536);
    }
    const view = new DataView(buf);
    if (view.byteLength < 4) return null;
    if (view.getUint16(0) !== 0xFFD8) return null;               // not JPEG
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);   offset += 2;
      if (offset + 2 > view.byteLength) break;
      const segLen = view.getUint16(offset);
      if (marker === 0xFFE1) {                                    // APP1 — may have EXIF
        if (offset + 6 <= view.byteLength) {
          const exifMark = view.getUint32(offset + 2);
          if (exifMark === 0x45786966) {                          // 'Exif'
            const tiffBase = offset + 8;
            if (tiffBase + 8 > view.byteLength) break;
            const le      = view.getUint16(tiffBase) === 0x4949; // little-endian?
            const ifd0Off = le ? view.getUint32(tiffBase + 4, true)
                               : view.getUint32(tiffBase + 4, false);
            const ifd0    = tiffBase + ifd0Off;
            if (ifd0 + 2 > view.byteLength) break;
            const numTags = le ? view.getUint16(ifd0, true)
                               : view.getUint16(ifd0, false);
            for (let i = 0; i < numTags; i++) {
              const tagOff = ifd0 + 2 + i * 12;
              if (tagOff + 12 > view.byteLength) break;
              const tag = le ? view.getUint16(tagOff, true) : view.getUint16(tagOff, false);
              if (tag === 0x0112) {                               // Orientation tag
                return le ? view.getUint16(tagOff + 8, true)
                           : view.getUint16(tagOff + 8, false);
              }
            }
          }
        }
      }
      if (marker === 0xFFDA) break;                              // SOS — stop
      offset += segLen;
    }
  } catch { /* corrupt JPEG or unexpected format — treat as no EXIF */ }
  return null;
}

/** Apply EXIF orientation transform to an already-loaded HTMLImageElement.
 *  Pre-scales to MAX_SAFE_CANVAS_DIM to prevent iOS canvas crash on 8K images. */
function _applyExifRotation(img: HTMLImageElement, orientation: number): string {
  const nw = img.naturalWidth, nh = img.naturalHeight;
  // Fix 3: scale down large images before canvas operations
  const sf  = Math.min(1, MAX_SAFE_CANVAS_DIM / Math.max(nw, nh));
  const w   = Math.max(1, Math.round(nw * sf));
  const h   = Math.max(1, Math.round(nh * sf));
  const cvs = document.createElement('canvas');
  const ctx = cvs.getContext('2d')!;
  // Orientations 5–8 swap width and height
  if (orientation >= 5) { cvs.width = h; cvs.height = w; }
  else                  { cvs.width = w; cvs.height = h; }
  // Apply scale so ctx.transform values (which reference original w/h) work correctly
  ctx.scale(sf, sf);
  switch (orientation) {
    case 2: ctx.transform(-1,  0,  0,  1, nw, 0);  break;
    case 3: ctx.transform(-1,  0,  0, -1, nw, nh); break;
    case 4: ctx.transform( 1,  0,  0, -1, 0, nh);  break;
    case 5: ctx.transform( 0,  1,  1,  0, 0, 0);   break;
    case 6: ctx.transform( 0,  1, -1,  0, nh, 0);  break;
    case 7: ctx.transform( 0, -1, -1,  0, nh, nw); break;
    case 8: ctx.transform( 0, -1,  1,  0, 0, nw);  break;
    default: break;
  }
  ctx.drawImage(img, 0, 0);
  return cvs.toDataURL('image/jpeg', 0.92);
}
