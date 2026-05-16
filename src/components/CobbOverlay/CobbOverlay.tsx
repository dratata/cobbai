/**
 * CobbOverlay.tsx
 *
 * Renders the clinical measurement overlay on the X-ray canvas.
 *
 * Draws per Cobb 1948 + Caesarendra 2022 + Maeda 2023 standards:
 *   - Vertebral body 4-corner outlines (Maeda 2023)
 *   - Superior/inferior endplate lines (Cobb 1948)
 *   - Endplate tick marks
 *   - Perpendicular bisectors (dashed)
 *   - Angle arc + Cobb° label
 *   - Apical vertebra diamond (◇)
 *   - "UPPER END / LOWER END" vertebra labels
 *   - Coronal imbalance indicator
 *
 * Props:
 *   result       — processed spine result (validated Cobb values)
 *   naturalW/H   — original image dimensions (for letterbox computation)
 *   overlayOpacity — [0,100]
 */

import React, { useRef, useEffect, useCallback } from 'react';
import {
  normToCanvas,
  computeLetterbox,
  perpendicularBisector,
  lineIntersection,
  extendLine,
} from '@/lib/lineGeometry';
import type { ProcessedSpineResult } from '@/lib/cobbCalculation';
import type { NormPoint } from '@/types';
import { getSpineLevelLabels } from '@/lib/vertebraLabeling'; // Fix #5

// ── Colour palette ────────────────────────────────────────────

const CURVE_COLOURS = ['#00c853', '#e53935', '#2196f3', '#ff9f43'];

// Clinical colour coding — upper/lower end vertebra visual differentiation
const UPPER_END_COLOUR = '#00e5ff';   // cyan   — superior end vertebra
const LOWER_END_COLOUR = '#ff4fd8';   // magenta — inferior end vertebra
const APEX_COLOUR      = '#ffd166';   // yellow — apical vertebra

// ── Canvas drawing primitives ─────────────────────────────────

function drawLine(
  ctx: CanvasRenderingContext2D,
  col: string, lw: number,
  p1: NormPoint, p2: NormPoint,
  dash: number[] = []
) {
  ctx.save();
  ctx.strokeStyle  = col;
  ctx.lineWidth    = lw;
  ctx.lineCap      = 'round';
  ctx.shadowColor  = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur   = 4;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.restore();
}

function drawDot(ctx: CanvasRenderingContext2D, col: string, p: NormPoint, r = 4) {
  ctx.save();
  ctx.fillStyle   = col;
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur  = 3;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTick(ctx: CanvasRenderingContext2D, col: string, lw: number, from: NormPoint, to: NormPoint, len: number) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / d, ny = dx / d;
  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 3;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(from.x + nx * len / 2, from.y + ny * len / 2);
  ctx.lineTo(from.x - nx * len / 2, from.y - ny * len / 2);
  ctx.stroke();
  ctx.restore();
}

// Fix #5: Small vertebra level label (T6, T7… inferred locally, no API)
// cssW/cssH are in logical pixels (canvas.width / dpr) — already in scaled context
function drawSmallLevelLabel(
  ctx: CanvasRenderingContext2D,
  text: string, col: string,
  x: number, y: number, fontSize: number,
  cssW?: number, cssH?: number
) {
  const dpr = window.devicePixelRatio || 1;
  const cW  = cssW ?? ctx.canvas.width  / dpr;
  const cH  = cssH ?? ctx.canvas.height / dpr;
  ctx.save();
  ctx.font = `800 ${fontSize}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const pad = Math.max(3, fontSize * 0.3);
  const tm  = ctx.measureText(text);
  const bx  = Math.max(4, Math.min(cW - tm.width - pad * 2 - 4, x));
  const by  = Math.max(4, Math.min(cH - fontSize - pad * 2 - 4, y - fontSize / 2 - pad));
  ctx.fillStyle   = 'rgba(4,12,20,0.65)';
  ctx.strokeStyle = col + '88'; ctx.lineWidth = 1;
  if (ctx.roundRect) ctx.roundRect(bx, by, tm.width + pad * 2, fontSize + pad * 2, 4);
  else               ctx.rect(bx, by, tm.width + pad * 2, fontSize + pad * 2);
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.strokeText(text, bx + pad, by + pad + fontSize / 2);
  ctx.fillStyle = col;
  ctx.fillText(text, bx + pad, by + pad + fontSize / 2);
  ctx.restore();
}

function drawLabelBox(
  ctx: CanvasRenderingContext2D,
  text: string, col: string, x: number, y: number,
  fontSize: number, align: 'left' | 'right' | 'center' = 'center',
  cssW?: number, cssH?: number
) {
  const dpr = window.devicePixelRatio || 1;
  const cW  = cssW ?? ctx.canvas.width  / dpr;
  const cH  = cssH ?? ctx.canvas.height / dpr;
  ctx.save();
  ctx.font = `bold ${fontSize}px ui-monospace, Consolas, monospace`;
  ctx.textAlign    = align;
  ctx.textBaseline = 'middle';
  ctx.shadowColor  = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur   = 5;
  const tm  = ctx.measureText(text);
  const pad = fontSize * 0.45;
  const bw  = tm.width + pad * 2;
  const bh  = fontSize + pad * 1.4;
  const bx  = align === 'right'  ? x - tm.width - pad * 2 :
               align === 'center' ? x - tm.width / 2 - pad : x - pad;
  // Clamp to canvas logical-pixel bounds
  const cbx = Math.max(4, Math.min(cW - bw - 4, bx));
  const by  = Math.max(4, Math.min(cH - bh - 4, y - bh / 2));
  const cx  = align === 'right' ? cbx + bw - pad : align === 'center' ? cbx + bw / 2 : cbx + pad;
  const cy  = by + bh / 2;
  // Background box — reduced opacity so the X-ray anatomy shows through labels
  ctx.fillStyle   = 'rgba(4,12,20,0.72)';
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth   = 1;
  if (ctx.roundRect) ctx.roundRect(cbx, by, bw, bh, 5);
  else ctx.rect(cbx, by, bw, bh);
  ctx.fill(); ctx.stroke();
  // Text: turn off shadow before text so it doesn't overwhelm the colored fill
  ctx.shadowBlur  = 0;
  ctx.shadowColor = 'transparent';
  // Dark stroke for contrast on any background, then colored fill on top
  ctx.lineWidth   = Math.max(1.5, fontSize * 0.12);
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = col;
  ctx.fillText(text, cx, cy);
  ctx.restore();
}

// ── Vertebra highlight box ────────────────────────────────────
function drawVertebraHighlight(
  ctx: CanvasRenderingContext2D,
  pts: NormPoint[], stroke: string, fill: string,
  label: string, fontSize: number
) {
  if (pts.length < 4) return;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, fontSize * 0.18);
  ctx.strokeStyle = stroke; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath();

  // ── Fill WITHOUT shadow ─────────────────────────────────────────────────
  // BUG FIX: previously ctx.shadowBlur=5 was active during ctx.fill().
  // Canvas shadow uses shadowOffsetX/Y=0, so the 85%-opaque black shadow
  // was drawn at the same position as the shape and bled THROUGH the
  // transparent fill (only 10% opacity) → vertebra boxes appeared solid black.
  // Fix: fill first with shadow disabled, then apply shadow only to the stroke.
  ctx.shadowBlur  = 0;
  ctx.shadowColor = 'transparent';
  ctx.fillStyle   = fill;
  ctx.fill();

  // Stroke with shadow for visibility
  ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 4;
  ctx.stroke();
  ctx.restore();
  const cx2 = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy2 = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  drawLabelBox(ctx, label, stroke, cx2, cy2, fontSize, 'center');
}

// ── Component ─────────────────────────────────────────────────

interface CobbOverlayProps {
  result:               ProcessedSpineResult;
  naturalW:             number;
  naturalH:             number;
  overlayOpacity?:      number;
  lang?:                'en' | 'tr' | 'ar';
  /** Show inferred intermediate vertebra labels (T6, T7…). Default: false */
  showVertebraLabels?:  boolean;
  /** Show apical vertebra ◇ marker. Default: true */
  showApexLabel?:       boolean;
  style?:               React.CSSProperties;
  className?:           string;
  id?:                  string;
}

// ── Label collision avoidance ──────────────────────────────────
interface LabelBox { x: number; y: number; w: number; h: number; }

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

function placeLabel(
  preferredX: number, preferredY: number,
  w: number, h: number,
  occupied: LabelBox[],
  canvasW: number, canvasH: number,
): LabelBox {
  const PAD = 10;
  const candidates: [number, number][] = [
    [preferredX,           preferredY],
    [preferredX + PAD,     preferredY - h - PAD],
    [preferredX + PAD,     preferredY + PAD],
    [preferredX - w - PAD, preferredY],
    [preferredX - w - PAD, preferredY - h - PAD],
  ];
  for (const [cx, cy] of candidates) {
    // Clamp within canvas
    const bx = Math.max(2, Math.min(canvasW - w - 2, cx));
    const by = Math.max(2, Math.min(canvasH - h - 2, cy));
    const box: LabelBox = { x: bx, y: by, w, h };
    if (!occupied.some(o => boxesOverlap(o, box))) {
      occupied.push(box);
      return box;
    }
  }
  // Fallback — place anyway at preferred (still clamp)
  const bx = Math.max(2, Math.min(canvasW - w - 2, preferredX));
  const by = Math.max(2, Math.min(canvasH - h - 2, preferredY));
  const box: LabelBox = { x: bx, y: by, w, h };
  occupied.push(box);
  return box;
}

export const CobbOverlay: React.FC<CobbOverlayProps> = ({
  result, naturalW, naturalH,
  overlayOpacity = 100,
  lang = 'en',
  showVertebraLabels = false,
  showApexLabel = true,
  style, className, id,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs || cvs.width === 0 || cvs.height === 0) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    // ── DPR scaling: draw in CSS (logical) pixels ──
    // cvs.width/height are physical pixels (set by syncSize × devicePixelRatio).
    // ctx.scale(dpr, dpr) lets all drawing code use CSS pixel coordinates
    // while the backing store renders at full physical resolution → sharp Retina.
    const dpr  = window.devicePixelRatio || 1;
    const cssW = cvs.width  / dpr;
    const cssH = cvs.height / dpr;
    if (cssW <= 0 || cssH <= 0) return;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const reg = computeLetterbox(naturalW, naturalH, cssW, cssH);

    // Label collision avoidance — accumulated across all curves in this draw pass
    const occupiedLabels: LabelBox[] = [];

    const curves = result.processedCurves;
    const lw     = Math.max(2.5, cssW * 0.004);
    const dotR   = Math.max(4, cssW * 0.008);

    curves.forEach((curve, i) => {
      const col = CURVE_COLOURS[i % CURVE_COLOURS.length];

      // ── 1. Vertebral body 4-corner outlines (Maeda 2023) ──
      const nameFontSize = Math.max(10, Math.round(cssW * 0.022));
      const upperName = curve.upper_vertebra_name || '';
      const lowerName = curve.lower_vertebra_name || '';
      const upperLabel = lang==='tr' ? `${upperName}·ÜST` : lang==='ar' ? `${upperName}·علوي` : `${upperName}·UPPER`;
      const lowerLabel = lang==='tr' ? `${lowerName}·ALT` : lang==='ar' ? `${lowerName}·سفلي` : `${lowerName}·LOWER`;

      // ── 1. Selected vertebral body highlights (upper=cyan, lower=magenta) ──
      (['upper_corners', 'lower_corners'] as const).forEach(key => {
        const corners = curve[key];
        if (!corners) return;
        const pts = [
          normToCanvas(corners.ul[0], corners.ul[1], reg),
          normToCanvas(corners.ur[0], corners.ur[1], reg),
          normToCanvas(corners.lr[0], corners.lr[1], reg),
          normToCanvas(corners.ll[0], corners.ll[1], reg),
        ];
        const isUpper = key === 'upper_corners';
        drawVertebraHighlight(
          ctx, pts,
          isUpper ? UPPER_END_COLOUR : LOWER_END_COLOUR,
          isUpper ? 'rgba(0,229,255,0.12)' : 'rgba(255,79,216,0.12)',
          isUpper ? upperLabel : lowerLabel,
          nameFontSize
        );
        pts.forEach(p => drawDot(ctx, isUpper ? UPPER_END_COLOUR : LOWER_END_COLOUR, p, 3));
      });

      // ── 2. Endplate lines (short extension to reduce drift) ──────────
      const ul = curve.upper_line, ll = curve.lower_line;
      const allCoords = [ul.x1,ul.y1,ul.x2,ul.y2,ll.x1,ll.y1,ll.x2,ll.y2];
      if (allCoords.some(v => v < -0.1 || v > 1.1)) return;
      // Reduced from 0.25 to 0.06 — less overshoot beyond vertebral body
      const eu = extendLine(ul, 0.06), el = extendLine(ll, 0.06);

      const u1 = normToCanvas(ul.x1, ul.y1, reg);
      const u2 = normToCanvas(ul.x2, ul.y2, reg);
      const l1 = normToCanvas(ll.x1, ll.y1, reg);
      const l2 = normToCanvas(ll.x2, ll.y2, reg);

      const eu1 = normToCanvas(eu.x1, eu.y1, reg);
      const eu2 = normToCanvas(eu.x2, eu.y2, reg);
      const el1 = normToCanvas(el.x1, el.y1, reg);
      const el2 = normToCanvas(el.x2, el.y2, reg);

      drawLine(ctx, UPPER_END_COLOUR, lw, eu1, eu2);
      drawLine(ctx, LOWER_END_COLOUR, lw, el1, el2);

      const tickLen = Math.max(cssH * 0.014, 9);
      drawTick(ctx, UPPER_END_COLOUR, lw, u1, u2, tickLen);
      drawTick(ctx, UPPER_END_COLOUR, lw, u2, u1, tickLen);
      drawTick(ctx, LOWER_END_COLOUR, lw, l1, l2, tickLen);
      drawTick(ctx, LOWER_END_COLOUR, lw, l2, l1, tickLen);

      drawDot(ctx, UPPER_END_COLOUR, u1, dotR); drawDot(ctx, UPPER_END_COLOUR, u2, dotR);
      drawDot(ctx, LOWER_END_COLOUR, l1, dotR); drawDot(ctx, LOWER_END_COLOUR, l2, dotR);

      // ── 3. Perpendicular bisectors + angle arc ────────────
      const halfLen = Math.max(cssH * 0.15, 40);
      const pU = perpendicularBisector(
        { x1: u1.x, y1: u1.y, x2: u2.x, y2: u2.y }, halfLen
      );
      const pL = perpendicularBisector(
        { x1: l1.x, y1: l1.y, x2: l2.x, y2: l2.y }, halfLen
      );

      drawLine(ctx, col + '77', 1.6, pU.p1, pU.p2, [8, 5]);
      drawLine(ctx, col + '77', 1.6, pL.p1, pL.p2, [8, 5]);

      const inter = lineIntersection(pU.p1, pU.p2, pL.p1, pL.p2);

      let labelX: number, labelY: number;

      // Only use intersection if it's within 3x canvas bounds (avoids extreme off-canvas)
      const onCanvas = (pt: { x: number; y: number }) =>
        pt.x > -cssW * 2 && pt.x < cssW * 3 &&
        pt.y > -cssH * 2 && pt.y < cssH * 3;

      if (inter && onCanvas(inter)) {
        drawDot(ctx, col, inter, dotR + 2);

        const a1  = Math.atan2(pU.mid.y - inter.y, pU.mid.x - inter.x);
        const a2  = Math.atan2(pL.mid.y - inter.y, pL.mid.x - inter.x);
        let diff  = a2 - a1;
        while (diff >  Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        const arcR = Math.max(cssH * 0.07, 22);

        // Filled arc wedge (semi-transparent)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(inter.x, inter.y);
        ctx.arc(inter.x, inter.y, arcR, a1, a1 + diff, diff < 0);
        ctx.closePath();
        ctx.fillStyle = col + '22'; ctx.fill();
        ctx.restore();

        // Arc stroke
        ctx.save();
        ctx.strokeStyle = col; ctx.lineWidth = 2.5;
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4; ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(inter.x, inter.y, arcR, a1, a1 + diff, diff < 0);
        ctx.stroke();
        ctx.restore();

        const ma = a1 + diff / 2;
        const labelDist = arcR + Math.max(cssW * 0.045, 24);
        labelX = inter.x + Math.cos(ma) * labelDist;
        labelY = inter.y + Math.sin(ma) * labelDist;
      } else {
        // Lines don't intersect on screen (mild curve)
        labelX = (u1.x + u2.x + l1.x + l2.x) / 4;
        labelY = (u1.y + u2.y + l1.y + l2.y) / 4;
      }

      // Cobb angle label
      const fs  = Math.max(15, Math.round(cssW * 0.038));
      drawLabelBox(ctx, `${curve.cobb_angle}°`, col, labelX, labelY, fs, 'center', cssW, cssH);

      // ── 4. Side labels with collision avoidance ────────────
      // Estimate box dimensions (monospace ~0.65× font width per char)
      const estW = (text: string, fs: number) => text.length * fs * 0.65 + fs * 0.9;
      const estH = (fs: number) => fs + fs * 0.7;

      const ulx = Math.min(u1.x, u2.x) - 6;
      const uly = (u1.y + u2.y) / 2;
      const upperBox = placeLabel(
        ulx - estW(upperLabel, nameFontSize), uly - estH(nameFontSize) / 2,
        estW(upperLabel, nameFontSize), estH(nameFontSize),
        occupiedLabels, cssW, cssH
      );
      drawLabelBox(ctx, upperLabel, UPPER_END_COLOUR,
        upperBox.x + upperBox.w, upperBox.y + upperBox.h / 2, nameFontSize, 'right');

      const llx = Math.min(l1.x, l2.x) - 6;
      const lly = (l1.y + l2.y) / 2;
      const lowerBox = placeLabel(
        llx - estW(lowerLabel, nameFontSize), lly - estH(nameFontSize) / 2,
        estW(lowerLabel, nameFontSize), estH(nameFontSize),
        occupiedLabels, cssW, cssH
      );
      drawLabelBox(ctx, lowerLabel, LOWER_END_COLOUR,
        lowerBox.x + lowerBox.w, lowerBox.y + lowerBox.h / 2, nameFontSize, 'right');

      // ── 5. Apical vertebra diamond ◇ (gated by showApexLabel) ──
      if (showApexLabel && curve.apex_x != null && curve.apex_y != null) {
        const ap   = normToCanvas(curve.apex_x, curve.apex_y, reg);
        const sz   = Math.max(cssW * 0.018, 8);
        ctx.save();
        ctx.strokeStyle = APEX_COLOUR; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ap.x, ap.y - sz);
        ctx.lineTo(ap.x + sz, ap.y);
        ctx.lineTo(ap.x, ap.y + sz);
        ctx.lineTo(ap.x - sz, ap.y);
        ctx.closePath();
        // Fill without shadow (same fix as drawVertebraHighlight)
        ctx.shadowBlur  = 0; ctx.shadowColor = 'transparent';
        ctx.fillStyle   = 'rgba(255,209,102,0.22)';
        ctx.fill();
        // Stroke with shadow
        ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 5;
        ctx.stroke();
        if (curve.apical_vertebra_name) {
          const afs = Math.max(9, Math.round(cssW * 0.022));
          const apText = `A:${curve.apical_vertebra_name}`;
          const apBox = placeLabel(
            ap.x - estW(apText, afs) / 2, ap.y - sz - afs * 1.4,
            estW(apText, afs), estH(afs),
            occupiedLabels, cssW, cssH
          );
          drawLabelBox(ctx, apText, APEX_COLOUR,
            apBox.x + apBox.w / 2, apBox.y + apBox.h / 2, afs, 'center', cssW, cssH);
        }
        ctx.restore();
      }

      // ── 6. Validation warning badge ───────────────────────
      if (!curve.validation.isConsistent) {
        const warnX = 10, warnY = 10 + i * 28;
        drawLabelBox(ctx,
          `⚠ Curve ${i + 1}: Δ${curve.validation.discrepancyDeg.toFixed(1)}° verify`,
          '#f0a045', warnX, warnY, 11, 'left', cssW, cssH
        );
      }

      // ── 7. Sequential vertebra labels (T5→T6→T7… local, no API) ──
      // Shown when showVertebraLabels is toggled ON.
      // Auto-suppression: if > 8 intermediate labels AND canvas is short (< 650 CSS px),
      // the labels would be illegibly crowded — skip them.
      if (showVertebraLabels) {
        const upperY = (curve.upper_line.y1 + curve.upper_line.y2) / 2;
        const lowerY = (curve.lower_line.y1 + curve.lower_line.y2) / 2;
        const inferredLabels = getSpineLevelLabels(
          curve.upper_vertebra_name, curve.lower_vertebra_name, upperY, lowerY
        );
        // Audit fix: suppress if too dense for the available height
        const tooDense = inferredLabels.length > 8 && cssH < 650;
        const hasLowConfidence = inferredLabels.some(lv => lv.confidence === 'low');

        if (!tooDense && inferredLabels.length >= 2 && inferredLabels.length <= 16) {
          const labelFont = Math.max(8, Math.round(cssW * 0.018));
          const sideX = Math.max(8, Math.min(cssW - 42, normToCanvas(0.03, 0, reg).x));
          inferredLabels.forEach(lv => {
            const p = normToCanvas(0.04, lv.normY, reg);
            const lvW = estW(lv.name, labelFont), lvH = estH(labelFont);
            const lvBox = placeLabel(sideX, p.y - lvH / 2, lvW, lvH, occupiedLabels, cssW, cssH);
            // Confidence-aware color: low-confidence labels appear more muted
            const lvCol = lv.isMeasured
              ? (lv.name === curve.upper_vertebra_name ? UPPER_END_COLOUR : LOWER_END_COLOUR)
              : lv.confidence === 'low'
                ? 'rgba(215,228,234,0.40)'
                : 'rgba(215,228,234,0.86)';
            drawSmallLevelLabel(ctx, lv.name, lvCol, lvBox.x, lvBox.y + lvH / 2, labelFont);
          });
          // Audit fix: show "Inferred labels — verify numbering" warning when confidence is low
          if (hasLowConfidence) {
            drawLabelBox(ctx, '⚠ Verify label numbering', '#f0a045', cssW / 2, cssH - 18, 10, 'center', cssW, cssH);
          }
        }
      }
    });

    // ── 8. Coronal balance ────────────────────────────────────
    if (result.raw.coronal_balance !== 'balanced') {
      drawLabelBox(ctx, '⚖ Coronal imbalance', '#f0a045', cssW - 14, 14, 11, 'right');
    }

    // Restore DPR transform
    ctx.restore();
  }, [result, naturalW, naturalH, lang, showVertebraLabels, showApexLabel]);

  // Redraw whenever result changes
  useEffect(() => {
    draw();
  }, [draw]);

  // Canvas pixel size = CSS displayed size (prevents scaling artifacts)
  // HATA 1 FIX: Robust resize handling for window resize + orientation change
  // Problem: with object-fit/zoom wrappers the parent div may not resize even
  //          when the *img* content area changes. We observe both.
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;

    const syncSize = () => {
      const dpr = window.devicePixelRatio || 1;
      // Walk up to find the nearest <img> sibling/descendant
      const img = cvs.parentElement?.querySelector('img') as HTMLImageElement | null;
      let cssW = 0, cssH = 0;
      if (img && img.offsetWidth > 0 && img.offsetHeight > 0) {
        cssW = img.offsetWidth;
        cssH = img.offsetHeight;
      } else {
        const rect = cvs.getBoundingClientRect();
        cssW = Math.round(rect.width);
        cssH = Math.round(rect.height);
      }
      if (cssW > 0 && cssH > 0) {
        // Set backing store to physical pixels for crisp Retina rendering.
        // Do NOT override cvs.style.width/height — React owns those via
        // style={{ width:'100%', height:'100%' }} and will fight us if we do.
        const physW = Math.round(cssW * dpr);
        const physH = Math.round(cssH * dpr);
        if (cvs.width !== physW || cvs.height !== physH) {
          cvs.width  = physW;
          cvs.height = physH;
        }
      }
      draw();
    };

    // 1. ResizeObserver on parent container
    const obs = new ResizeObserver(syncSize);
    obs.observe(cvs.parentElement || cvs);

    // 2. Also observe the <img> directly — catches object-fit layout changes
    const img = cvs.parentElement?.querySelector('img');
    if (img) obs.observe(img);

    // 3. window resize — catches orientation flip, browser zoom, devtools toggle
    window.addEventListener('resize', syncSize, { passive: true });

    requestAnimationFrame(syncSize);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', syncSize);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      id={id}
      className={className}
      style={{
        position:      'absolute',
        top: 0, left: 0,
        width:         '100%',
        height:        '100%',
        pointerEvents: 'none',
        opacity:       overlayOpacity / 100,
        ...style,
      }}
    />
  );
};

export default CobbOverlay;
