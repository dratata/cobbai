/**
 * imageTransform.ts
 * Single source of truth for image coordinate transforms.
 * All overlays (CobbOverlay, ManualCorrectionPanel, exportPNG, AdvancedManualTool)
 * should use these functions so coordinate systems stay consistent.
 */

export interface ImageTransform {
  /** Original image dimensions */
  naturalW: number;
  naturalH: number;
  /** Canvas pixel dimensions */
  canvasW: number;
  canvasH: number;
  /** Letterbox offset and rendered size */
  ox: number;
  oy: number;
  rw: number;
  rh: number;
  /** Viewer zoom level [0.5, 10] */
  zoom: number;
  /** Pan offsets in canvas pixels */
  panX: number;
  panY: number;
}

/**
 * Compute the letterbox region (object-fit:contain behaviour).
 * ox, oy = top-left offset of image content within canvas.
 * rw, rh = rendered width/height of image content.
 */
export function computeImageTransform(
  naturalW: number,
  naturalH: number,
  canvasW: number,
  canvasH: number,
  zoom = 1,
  panX = 0,
  panY = 0,
): ImageTransform {
  if (naturalW <= 0 || naturalH <= 0) {
    return { naturalW, naturalH, canvasW, canvasH, ox: 0, oy: 0, rw: canvasW, rh: canvasH, zoom, panX, panY };
  }
  const imgAspect    = naturalW / naturalH;
  const canvasAspect = canvasW  / canvasH;
  let rw: number, rh: number, ox: number, oy: number;
  if (imgAspect > canvasAspect) {
    rw = canvasW;   rh = canvasW / imgAspect;
    ox = 0;         oy = (canvasH - rh) / 2;
  } else {
    rh = canvasH;   rw = canvasH * imgAspect;
    ox = (canvasW - rw) / 2; oy = 0;
  }
  return { naturalW, naturalH, canvasW, canvasH, ox, oy, rw, rh, zoom, panX, panY };
}

/** Normalised image coordinate [0,1] → canvas pixel */
export function normToCanvasPx(nx: number, ny: number, t: ImageTransform): { x: number; y: number } {
  return { x: t.ox + nx * t.rw, y: t.oy + ny * t.rh };
}

/** Canvas pixel → normalised image coordinate (clamped to [0,1]) */
export function canvasPxToNorm(cx: number, cy: number, t: ImageTransform): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(1, (cx - t.ox) / t.rw)),
    y: Math.max(0, Math.min(1, (cy - t.oy) / t.rh)),
  };
}

/** Clamp value to [min, max] */
export function clampVal(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
