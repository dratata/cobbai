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

function drawLabelBox(
  ctx: CanvasRenderingContext2D,
  text: string, col: string, x: number, y: number,
  fontSize: number, align: 'left' | 'right' | 'center' = 'center'
) {
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
  // Clamp to canvas bounds for better readability
  const cbx = Math.max(4, Math.min(ctx.canvas.width  - bw - 4, bx));
  const by  = Math.max(4, Math.min(ctx.canvas.height - bh - 4, y - bh / 2));
  const cx  = align === 'right' ? cbx + bw - pad : align === 'center' ? cbx + bw / 2 : cbx + pad;
  const cy  = by + bh / 2;
  // Background box with border
  ctx.fillStyle   = 'rgba(2,6,10,0.92)';
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth   = 1;
  if (ctx.roundRect) ctx.roundRect(cbx, by, bw, bh, 5);
  else ctx.rect(cbx, by, bw, bh);
  ctx.fill(); ctx.stroke();
  // Text: dark outline first for contrast on any background
  ctx.lineWidth   = Math.max(2, fontSize * 0.16);
  ctx.strokeStyle = 'rgba(0,0,0,0.95)';
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
  ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 5;
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, fontSize * 0.18);
  ctx.strokeStyle = stroke; ctx.fillStyle = fill; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath();
  ctx.fill(); ctx.stroke(); ctx.restore();
  const cx2 = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy2 = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  drawLabelBox(ctx, label, stroke, cx2, cy2, fontSize, 'center');
}

// ── Component ─────────────────────────────────────────────────

interface CobbOverlayProps {
  result:          ProcessedSpineResult;
  naturalW:        number;
  naturalH:        number;
  overlayOpacity?: number;
  lang?:           'en' | 'tr' | 'ar';
  style?:          React.CSSProperties;
  className?:      string;
  id?:             string;
}

export const CobbOverlay: React.FC<CobbOverlayProps> = ({
  result, naturalW, naturalH,
  overlayOpacity = 100,
  lang = 'en',
  style, className, id,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, cvs.width, cvs.height);
    const reg = computeLetterbox(naturalW, naturalH, cvs.width, cvs.height);

    const curves = result.processedCurves;
    const lw     = Math.max(2.5, cvs.width * 0.004);
    const dotR   = Math.max(4, cvs.width * 0.008);

    curves.forEach((curve, i) => {
      const col = CURVE_COLOURS[i % CURVE_COLOURS.length];

      // ── 1. Vertebral body 4-corner outlines (Maeda 2023) ──
      const nameFontSize = Math.max(10, Math.round(cvs.width * 0.022));
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
          isUpper ? 'rgba(0,229,255,0.10)' : 'rgba(255,79,216,0.10)',
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

      const tickLen = Math.max(cvs.height * 0.014, 9);
      drawTick(ctx, UPPER_END_COLOUR, lw, u1, u2, tickLen);
      drawTick(ctx, UPPER_END_COLOUR, lw, u2, u1, tickLen);
      drawTick(ctx, LOWER_END_COLOUR, lw, l1, l2, tickLen);
      drawTick(ctx, LOWER_END_COLOUR, lw, l2, l1, tickLen);

      drawDot(ctx, UPPER_END_COLOUR, u1, dotR); drawDot(ctx, UPPER_END_COLOUR, u2, dotR);
      drawDot(ctx, LOWER_END_COLOUR, l1, dotR); drawDot(ctx, LOWER_END_COLOUR, l2, dotR);

      // ── 3. Perpendicular bisectors + angle arc ────────────
      const halfLen = Math.max(cvs.height * 0.15, 40);
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
        pt.x > -cvs.width * 2 && pt.x < cvs.width * 3 &&
        pt.y > -cvs.height * 2 && pt.y < cvs.height * 3;

      if (inter && onCanvas(inter)) {
        drawDot(ctx, col, inter, dotR + 2);

        const a1  = Math.atan2(pU.mid.y - inter.y, pU.mid.x - inter.x);
        const a2  = Math.atan2(pL.mid.y - inter.y, pL.mid.x - inter.x);
        let diff  = a2 - a1;
        while (diff >  Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        const arcR = Math.max(cvs.height * 0.07, 22);

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
        const labelDist = arcR + Math.max(cvs.width * 0.045, 24);
        labelX = inter.x + Math.cos(ma) * labelDist;
        labelY = inter.y + Math.sin(ma) * labelDist;
      } else {
        // Lines don't intersect on screen (mild curve)
        labelX = (u1.x + u2.x + l1.x + l2.x) / 4;
        labelY = (u1.y + u2.y + l1.y + l2.y) / 4;
      }

      // Cobb angle label
      const fs  = Math.max(15, Math.round(cvs.width * 0.038));
      drawLabelBox(ctx, `${curve.cobb_angle}°`, col, labelX, labelY, fs);

      // ── 4. Side labels (right edge — coloured per role) ────
      drawLabelBox(ctx, upperLabel, UPPER_END_COLOUR,
        Math.min(u1.x, u2.x) - 6, (u1.y + u2.y) / 2, nameFontSize, 'right');
      drawLabelBox(ctx, lowerLabel, LOWER_END_COLOUR,
        Math.min(l1.x, l2.x) - 6, (l1.y + l2.y) / 2, nameFontSize, 'right');

      // ── 5. Apical vertebra diamond ◇ ──────────────────────
      if (curve.apex_x != null && curve.apex_y != null) {
        const ap   = normToCanvas(curve.apex_x, curve.apex_y, reg);
        const sz   = Math.max(cvs.width * 0.018, 8);
        ctx.save();
        ctx.strokeStyle = APEX_COLOUR; ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 5;
        ctx.fillStyle   = 'rgba(255,209,102,0.22)';
        ctx.beginPath();
        ctx.moveTo(ap.x, ap.y - sz);
        ctx.lineTo(ap.x + sz, ap.y);
        ctx.lineTo(ap.x, ap.y + sz);
        ctx.lineTo(ap.x - sz, ap.y);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        if (curve.apical_vertebra_name) {
          const afs = Math.max(9, Math.round(cvs.width * 0.022));
          drawLabelBox(ctx, `A:${curve.apical_vertebra_name}`, APEX_COLOUR,
            ap.x, ap.y - sz - afs * 0.8, afs, 'center');
        }
        ctx.restore();
      }

      // ── 6. Validation warning badge ───────────────────────
      if (!curve.validation.isConsistent) {
        const warnX = 10, warnY = 10 + i * 28;
        drawLabelBox(ctx,
          `⚠ Curve ${i + 1}: Δ${curve.validation.discrepancyDeg.toFixed(1)}° verify`,
          '#f0a045', warnX, warnY, 11, 'left'
        );
      }
    });

    // ── 7. Coronal balance ────────────────────────────────────
    if (result.raw.coronal_balance !== 'balanced') {
      const bx = cvs.width - 14, by = 14;
      drawLabelBox(ctx, '⚖ Coronal imbalance', '#f0a045', bx, by, 11, 'right');
    }
  }, [result, naturalW, naturalH, lang]);

  // Redraw whenever result changes
  useEffect(() => {
    draw();
  }, [draw]);

  // Canvas pixel size = CSS displayed size (prevents scaling artifacts)
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const syncSize = () => {
      // Use the img element's rendered area, not the container
      const img = cvs.parentElement?.querySelector('img');
      if (img && img.offsetWidth > 0 && img.offsetHeight > 0) {
        cvs.width  = img.offsetWidth;
        cvs.height = img.offsetHeight;
      } else {
        // Fallback: canvas's own bounding rect
        const rect = cvs.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          cvs.width  = Math.round(rect.width);
          cvs.height = Math.round(rect.height);
        }
      }
      draw();
    };
    const obs = new ResizeObserver(syncSize);
    obs.observe(cvs.parentElement || cvs);
    // Also sync on next frame to catch initial render
    requestAnimationFrame(syncSize);
    return () => obs.disconnect();
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
