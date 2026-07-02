/**
 * AdvancedManualTool.tsx
 *
 * PACS-style pan/zoom manual Cobb angle measurement tool.
 * ZERO API COST — fully local, deterministic.
 *
 * Controls:
 *   Left-click  → place endplate point (up to 4)
 *   Scroll      → zoom in / out around cursor
 *   Right-drag  → pan image
 *   R key / Reset button → clear points
 *
 * Workflow:
 *   1. Click 2 points on upper endplate (left → right)
 *   2. Click 2 points on lower endplate (left → right)
 *   3. Cobb angle is computed and displayed immediately
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { calculateCobbAngle } from '@/lib/spineMath';
import type { Point } from '@/lib/spineMath';

interface AdvancedManualToolProps {
  imageSrc: string;
  naturalW: number;
  naturalH: number;
  lang?: string;
  /** Hata 1 fix: pass image filter values from store so canvas matches the viewer */
  brightness?: number;  // CSS brightness offset e.g. 18 → brightness(118%)
  contrast?: number;    // CSS contrast percent e.g. 145 → contrast(145%)
  onCobbMeasured?: (cobb: number, points: Point[]) => void;
  onClose?: () => void;
}

const POINT_COLOURS = ['#00e5ff', '#00e5ff', '#ff4fd8', '#ff4fd8'] as const;
// POINT_LABELS removed (unused)

// Magnifier loupe: magnification relative to the main view (always shows MORE
// detail than the canvas, whatever the current zoom) and its radius in CSS px.
const LOUPE_MAG = 4;
const LOUPE_R   = 74;

export const AdvancedManualTool: React.FC<AdvancedManualToolProps> = ({
  imageSrc, naturalW, naturalH, lang = 'en',
  brightness = 0, contrast = 100,
  onCobbMeasured, onClose
}) => {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const imgRef     = useRef<HTMLImageElement | null>(null);
  const stateRef   = useRef({
    zoom:    1.0,
    panX:    0,           // pan in canvas-pixel space
    panY:    0,
    points:  [] as Point[], // image-space points [0, naturalW/H]
    isPanning: false,
    draggingIdx: null as number | null, // index of point being dragged (refine)
    downX:   0,           // pointer-down position (click-vs-drag discrimination)
    downY:   0,
    lastX:   0,
    lastY:   0,
    cobb:    null as number | null,
    // Magnifier loupe target (image-space coord + pointer CSS x for side-flip),
    // or null when the loupe is hidden.
    loupe:   null as null | { ix: number; iy: number; cssX: number },
  });
  const [cobb, setCobb]     = useState<number | null>(null);
  const [ptCount, setPtCount] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null); // point under cursor
  const [loupeOn, setLoupeOn] = useState(true);   // magnifier toggle (UI state)
  const loupeOnRef = useRef(true);                // mirror for draw() (no re-render)

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => { imgRef.current = img; setImgLoaded(true); };
    img.src = imageSrc;
  }, [imageSrc]);

  // ── Coordinate transforms ─────────────────────────────────────
  // All positions are in CSS (logical) pixels. DPR handled by ctx.scale in draw().

  // CSS canvas pixels → image pixels
  const cvs2img = useCallback((cx: number, cy: number): Point => {
    const { zoom, panX, panY } = stateRef.current;
    const cvs = canvasRef.current!;
    const dpr  = window.devicePixelRatio || 1;
    const cssW = cvs.width / dpr, cssH = cvs.height / dpr;
    const imgW = naturalW * zoom, imgH = naturalH * zoom;
    const originX = (cssW - imgW) / 2 + panX;
    const originY = (cssH - imgH) / 2 + panY;
    return { x: (cx - originX) / zoom, y: (cy - originY) / zoom };
  }, [naturalW, naturalH]);

  // image pixels → CSS canvas pixels
  const img2cvs = useCallback((ix: number, iy: number): Point => {
    const { zoom, panX, panY } = stateRef.current;
    const cvs = canvasRef.current!;
    const dpr  = window.devicePixelRatio || 1;
    const cssW = cvs.width / dpr, cssH = cvs.height / dpr;
    const imgW = naturalW * zoom, imgH = naturalH * zoom;
    const originX = (cssW - imgW) / 2 + panX;
    const originY = (cssH - imgH) / 2 + panY;
    return { x: originX + ix * zoom, y: originY + iy * zoom };
  }, [naturalW, naturalH]);

  // Set/clear the loupe target from a CSS-pixel pointer position.
  const setLoupe = useCallback((cssX: number, cssY: number, active: boolean) => {
    const st = stateRef.current;
    if (!active || !loupeOnRef.current) { st.loupe = null; return; }
    const ip = cvs2img(cssX, cssY);
    st.loupe = { ix: ip.x, iy: ip.y, cssX };
  }, [cvs2img]);

  // Hit-test: index of an existing point within grab radius of a CSS-px pos.
  // Grab radius scales down with zoom-out so it stays ~14 screen px. Iterates
  // last-to-first so the most recently drawn (topmost) point wins on overlap.
  const hitTestPoint = useCallback((cssX: number, cssY: number): number | null => {
    const pts = stateRef.current.points;
    const grab = 14; // screen px
    for (let i = pts.length - 1; i >= 0; i--) {
      const pc = img2cvs(pts[i].x, pts[i].y);
      if (Math.hypot(pc.x - cssX, pc.y - cssY) <= grab) return i;
    }
    return null;
  }, [img2cvs]);

  // Recompute Cobb from the 4 points and push it out (live during drag).
  const recomputeCobb = useCallback(() => {
    const st = stateRef.current;
    if (st.points.length === 4) {
      const [p1, p2, p3, p4] = st.points;
      const angle = calculateCobbAngle(p1, p2, p3, p4);
      st.cobb = angle;
      setCobb(angle);
      onCobbMeasured?.(angle, st.points);
    }
  }, [onCobbMeasured]);

  // ── Draw ──────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const cvs = canvasRef.current;
    const img = imgRef.current;
    if (!cvs || !img) return;
    const ctx = cvs.getContext('2d')!;
    const { zoom, panX, panY, points } = stateRef.current;

    // ── Retina/HiDPI fix: draw in CSS (logical) pixel space ──────
    // cvs.width/height are physical pixels; scale context so all draw calls
    // use CSS pixel coordinates — keeps lines sharp on high-DPI displays.
    const dpr  = window.devicePixelRatio || 1;
    const cssW = cvs.width  / dpr;
    const cssH = cvs.height / dpr;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    // Draw image — Hata 1 fix: apply brightness/contrast so canvas matches the viewer
    ctx.save();
    const imgW = naturalW * zoom, imgH = naturalH * zoom;
    const originX = (cssW - imgW) / 2 + panX;
    const originY = (cssH - imgH) / 2 + panY;
    const bVal = 100 + brightness;  // e.g. brightness offset 18 → brightness(118%)
    const cVal = contrast;          // e.g. 145 → contrast(145%)
    ctx.filter = `brightness(${bVal}%) contrast(${cVal}%)`;
    ctx.drawImage(img, originX, originY, imgW, imgH);
    ctx.filter = 'none';  // reset so overlays are not affected
    ctx.restore();

    // Draw endplate lines
    if (points.length >= 2) {
      const p1c = img2cvs(points[0].x, points[0].y);
      const p2c = img2cvs(points[1].x, points[1].y);
      ctx.save();
      ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 2.5; ctx.setLineDash([]);
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.moveTo(p1c.x, p1c.y); ctx.lineTo(p2c.x, p2c.y); ctx.stroke();
      ctx.restore();
    }
    if (points.length >= 4) {
      const p3c = img2cvs(points[2].x, points[2].y);
      const p4c = img2cvs(points[3].x, points[3].y);
      ctx.save();
      ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 2.5; ctx.setLineDash([]);
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.moveTo(p3c.x, p3c.y); ctx.lineTo(p4c.x, p4c.y); ctx.stroke();
      ctx.restore();
    }

    // Draw points
    points.forEach((p, i) => {
      const pc = img2cvs(p.x, p.y);
      const col = POINT_COLOURS[i % POINT_COLOURS.length];
      const active = i === stateRef.current.draggingIdx; // enlarge while refining
      const r = active ? 10 : 7;
      ctx.save();
      ctx.beginPath(); ctx.arc(pc.x, pc.y, r, 0, Math.PI * 2);
      ctx.fillStyle = col + (active ? '55' : '33'); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = active ? 3 : 2.5;
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 6;
      ctx.stroke();
      // Cross
      ctx.beginPath();
      ctx.moveTo(pc.x - 5, pc.y); ctx.lineTo(pc.x + 5, pc.y);
      ctx.moveTo(pc.x, pc.y - 5); ctx.lineTo(pc.x, pc.y + 5);
      ctx.stroke();
      ctx.restore();
      // Label
      ctx.save();
      ctx.font = 'bold 10px ui-monospace,monospace'; ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,1)'; ctx.shadowBlur = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 2; ctx.strokeText(`${i+1}`, pc.x, pc.y - 10);
      ctx.fillStyle = col; ctx.fillText(`${i+1}`, pc.x, pc.y - 10);
      ctx.restore();
    });

    // Draw Cobb angle if measured
    const cobbVal = stateRef.current.cobb;
    if (cobbVal !== null && points.length === 4) {
      const cx = img2cvs((points[0].x + points[1].x + points[2].x + points[3].x) / 4,
                         (points[0].y + points[1].y + points[2].y + points[3].y) / 4);
      ctx.save();
      ctx.font = 'bold 28px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,1)'; ctx.shadowBlur = 8;
      const label = `${cobbVal}°`;
      const tm = ctx.measureText(label); const pad = 14;
      ctx.fillStyle = 'rgba(2,6,10,0.92)';
      ctx.strokeStyle = '#00c853'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx.x - tm.width/2 - pad, cx.y - 22, tm.width + pad*2, 44, 8);
      else ctx.rect(cx.x - tm.width/2 - pad, cx.y - 22, tm.width + pad*2, 44);
      ctx.fill(); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText(label, cx.x, cx.y);
      ctx.fillStyle = '#00c853'; ctx.fillText(label, cx.x, cx.y);
      ctx.restore();
    }

    // Instructions overlay (when < 4 points)
    if (points.length < 4) {
      const instrLines = lang === 'tr' ? [
        ['Sol tık', points.length === 0 ? '→ Üst endplate SOL noktası (P1)' : points.length === 1 ? '→ Üst endplate SAĞ noktası (P2)' : points.length === 2 ? '→ Alt endplate SOL noktası (P3)' : '→ Alt endplate SAĞ noktası (P4)'],
        ['Scroll', '→ Yakınlaştır / Uzaklaştır'],
        ['Sağ-sürükle', '→ Kaydır'],
      ] : [
        ['Left-click', points.length === 0 ? '→ Upper endplate LEFT point (P1)' : points.length === 1 ? '→ Upper endplate RIGHT point (P2)' : points.length === 2 ? '→ Lower endplate LEFT point (P3)' : '→ Lower endplate RIGHT point (P4)'],
        ['Scroll', '→ Zoom in / out'],
        ['Right-drag', '→ Pan image'],
      ];
      ctx.save();
      ctx.fillStyle = 'rgba(2,6,10,0.85)';
      ctx.fillRect(8, cssH - 80, 280, 72);
      instrLines.forEach(([key, val], j) => {
        ctx.font = `bold 11px ui-monospace,monospace`; ctx.textAlign = 'left';
        ctx.fillStyle = '#00c853'; ctx.fillText(key, 16, cssH - 60 + j * 22);
        ctx.font = '11px ui-monospace,monospace';
        ctx.fillStyle = '#b0bec5'; ctx.fillText(val, 80, cssH - 60 + j * 22);
      });
      ctx.restore();
    } else {
      // All 4 points placed — hint that they can be dragged to fine-tune.
      const hint = lang === 'tr' ? '⤢ Noktaları sürükleyerek ince ayar yapın'
                 : lang === 'ar' ? '⤢ اسحب النقاط للضبط الدقيق'
                 : '⤢ Drag points to fine-tune';
      ctx.save();
      ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(2,6,10,0.85)';
      const tw = ctx.measureText(hint).width;
      ctx.fillRect(8, cssH - 30, tw + 20, 22);
      ctx.fillStyle = '#7fe0a8'; ctx.fillText(hint, 16, cssH - 15);
      ctx.restore();
    }

    // Zoom indicator
    ctx.save();
    ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`${Math.round(zoom * 100)}%`, cssW - 8, cssH - 6);
    ctx.restore();

    // ── Magnifier loupe ─────────────────────────────────────────
    // Sub-pixel endplate placement is the dominant manual-measurement error,
    // so while placing/refining a point we show a circular magnified inset of
    // the image around it, with a crosshair marking the exact landing point.
    const lp = stateRef.current.loupe;
    if (lp) {
      const R = LOUPE_R;
      const margin = 12;
      // Sit the loupe on the side opposite the pointer so it never hides the point.
      const cx = lp.cssX > cssW / 2 ? R + margin : cssW - R - margin;
      const cy = R + margin;
      // Source window (image px): LOUPE_MAG× more magnified than the main view.
      const srcHalf = R / (LOUPE_MAG * zoom);

      ctx.save();
      // Circular clip
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#000'; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      // Magnified image (browser clips src to image bounds proportionally, so the
      // crosshair stays aligned with (ix,iy) even at the image edge).
      ctx.filter = `brightness(${bVal}%) contrast(${cVal}%)`;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        img,
        lp.ix - srcHalf, lp.iy - srcHalf, srcHalf * 2, srcHalf * 2,
        cx - R, cy - R, R * 2, R * 2
      );
      ctx.filter = 'none';
      // Crosshair at exact placement point (loupe centre)
      ctx.strokeStyle = 'rgba(0,229,255,0.9)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
      ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
      // Border ring + magnification label
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,200,83,0.85)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = 'bold 10px ui-monospace,monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(2,6,10,0.9)';
      ctx.fillRect(cx - 18, cy + R - 7, 36, 14);
      ctx.fillStyle = '#7fe0a8';
      ctx.fillText(`${(LOUPE_MAG * zoom).toFixed(1)}×`, cx, cy + R + 3);
      ctx.restore();
    }

    // Restore DPR scale transform
    ctx.restore();
  }, [img2cvs, lang, naturalW, naturalH]);

  // Redraw on image load
  useEffect(() => { if (imgLoaded) draw(); }, [imgLoaded, draw]);

  // ── Mouse events ──────────────────────────────────────────────

  // Returns position in CSS (logical) pixels — DPR scaling is handled by ctx.scale() in draw()
  const getCanvasPos = (e: React.MouseEvent | React.WheelEvent): Point => {
    const cvs = canvasRef.current!;
    const rect = cvs.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // Placement now happens on mouse-UP (click discrimination), so a drag that
  // refines an existing point is never mistaken for a new placement.
  const placePointAt = (cssX: number, cssY: number) => {
    const st = stateRef.current;
    if (st.points.length >= 4) return;
    const ip = cvs2img(cssX, cssY);
    ip.x = Math.max(0, Math.min(naturalW, ip.x));
    ip.y = Math.max(0, Math.min(naturalH, ip.y));
    st.points = [...st.points, ip];
    setPtCount(st.points.length);
    recomputeCobb();
    draw();
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const st   = stateRef.current;
    const cp   = getCanvasPos(e);   // CSS px
    const cvs  = canvasRef.current!;
    const dpr  = window.devicePixelRatio || 1;
    const cssW = cvs.width / dpr, cssH = cvs.height / dpr;
    const imgW = naturalW * st.zoom, imgH = naturalH * st.zoom;
    const originX = (cssW - imgW) / 2 + st.panX;
    const originY = (cssH - imgH) / 2 + st.panY;
    const mouseImgX = (cp.x - originX) / st.zoom;
    const mouseImgY = (cp.y - originY) / st.zoom;

    const delta   = e.deltaY > 0 ? 0.85 : 1.18;
    const newZoom = Math.max(0.5, Math.min(10, st.zoom * delta));
    // Adjust pan so zoom pivots on mouse position
    st.panX = cp.x - (cssW - naturalW * newZoom) / 2 - mouseImgX * newZoom;
    st.panY = cp.y - (cssH - naturalH * newZoom) / 2 - mouseImgY * newZoom;
    st.zoom = newZoom;
    draw();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const st = stateRef.current;
    const cp = getCanvasPos(e);
    st.downX = cp.x; st.downY = cp.y;
    st.lastX = cp.x; st.lastY = cp.y;

    if (e.button === 2) { // right click = pan
      e.preventDefault();
      st.isPanning = true;
      return;
    }
    if (e.button === 0) {
      // Left button on an existing point → start refining (drag) it.
      const hit = hitTestPoint(cp.x, cp.y);
      if (hit !== null) {
        e.preventDefault();
        st.draggingIdx = hit;
        setLoupe(cp.x, cp.y, true);
        draw();
      }
    }
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    const st = stateRef.current;
    const cp = getCanvasPos(e);

    // Dragging a point to refine its position → live Cobb recompute.
    if (st.draggingIdx !== null) {
      const ip = cvs2img(cp.x, cp.y);
      ip.x = Math.max(0, Math.min(naturalW, ip.x));
      ip.y = Math.max(0, Math.min(naturalH, ip.y));
      st.points = st.points.map((p, i) => i === st.draggingIdx ? ip : p);
      setLoupe(cp.x, cp.y, true);
      recomputeCobb();
      draw();
      return;
    }
    if (st.isPanning) {
      st.panX += cp.x - st.lastX;
      st.panY += cp.y - st.lastY;
      st.lastX = cp.x; st.lastY = cp.y;
      draw();
      return;
    }
    // Idle hover — highlight a grabbable point (cursor feedback) and show the
    // loupe while placing (points < 4) or hovering a grabbable point.
    const hovered = st.points.length ? hitTestPoint(cp.x, cp.y) : null;
    setHoverIdx(prev => prev === hovered ? prev : hovered);
    const active = st.points.length < 4 || hovered !== null;
    const hadLoupe = st.loupe !== null;
    setLoupe(cp.x, cp.y, active);
    if (st.loupe || hadLoupe) draw();
  };
  const handleMouseUp = (e: React.MouseEvent) => {
    const st = stateRef.current;
    const wasDragging = st.draggingIdx !== null;
    const wasPanning  = st.isPanning;
    st.draggingIdx = null;
    st.isPanning = false;
    st.loupe = null;
    if (wasDragging || wasPanning) { draw(); return; }
    if (e.button !== 0) return;
    // A left click that didn't move much → place a new point.
    const cp = getCanvasPos(e);
    if (Math.hypot(cp.x - st.downX, cp.y - st.downY) < 6) {
      placePointAt(cp.x, cp.y);
    }
  };
  // Leaving the canvas cancels any in-progress drag/pan WITHOUT placing a point
  // (placement must be an explicit click, never a stale mouse-leave).
  const handleMouseLeave = () => {
    stateRef.current.draggingIdx = null;
    stateRef.current.isPanning = false;
    stateRef.current.loupe = null;
    setHoverIdx(null);
    draw();
  };
  const handleContextMenu = (e: React.MouseEvent) => e.preventDefault();

  // ── HATA 2 FIX: Mobile touch support ──────────────────────────
  // touch-action:'none' on canvas (below) stops page scroll.
  // Single touch → place point (like left-click).
  // Two-finger pinch → zoom around midpoint.
  // One-finger drag (after 4 pts placed) → pan.

  const getTouchCanvasPos = (touch: React.Touch): Point => {
    const cvs = canvasRef.current!;
    const rect = cvs.getBoundingClientRect();
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  };

  // Ref to track the last distance between two fingers (for pinch)
  const lastPinchDist = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const st = stateRef.current;
      const cp = getTouchCanvasPos(e.touches[0]);
      st.downX = cp.x; st.downY = cp.y;
      st.lastX = cp.x; st.lastY = cp.y;
      lastPinchDist.current = null;
      // Finger down on an existing point → refine it (drag); else pan.
      const hit = st.points.length ? hitTestPoint(cp.x, cp.y) : null;
      if (hit !== null) {
        st.draggingIdx = hit;
        st.isPanning = false;
        setLoupe(cp.x, cp.y, true);
        draw();
      } else {
        st.draggingIdx = null;
        st.isPanning = true;
      }
    } else if (e.touches.length === 2) {
      // Two fingers — prepare for pinch
      stateRef.current.isPanning = false;
      lastPinchDist.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const st = stateRef.current;
    const cvs = canvasRef.current!;

    if (e.touches.length === 2 && lastPinchDist.current !== null) {
      // ── Pinch-to-zoom ──────────────────────────────────────
      const newDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = newDist / lastPinchDist.current;
      lastPinchDist.current = newDist;

      // Midpoint of the two fingers in CSS (logical) px
      const rect = cvs.getBoundingClientRect();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

      const dpr  = window.devicePixelRatio || 1;
      const cssW = cvs.width / dpr, cssH = cvs.height / dpr;
      const imgW = naturalW * st.zoom, imgH = naturalH * st.zoom;
      const originX = (cssW - imgW) / 2 + st.panX;
      const originY = (cssH - imgH) / 2 + st.panY;
      const imgPtX = (midX - originX) / st.zoom;
      const imgPtY = (midY - originY) / st.zoom;

      const newZoom = Math.max(0.5, Math.min(10, st.zoom * scale));
      st.panX = midX - (cssW - naturalW * newZoom) / 2 - imgPtX * newZoom;
      st.panY = midY - (cssH - naturalH * newZoom) / 2 - imgPtY * newZoom;
      st.zoom = newZoom;
      draw();

    } else if (e.touches.length === 1 && st.draggingIdx !== null) {
      // ── Single-finger point refine (drag) ──────────────────
      const cp = getTouchCanvasPos(e.touches[0]);
      const ip = cvs2img(cp.x, cp.y);
      ip.x = Math.max(0, Math.min(naturalW, ip.x));
      ip.y = Math.max(0, Math.min(naturalH, ip.y));
      st.points = st.points.map((p, i) => i === st.draggingIdx ? ip : p);
      st.lastX = cp.x; st.lastY = cp.y;
      setLoupe(cp.x, cp.y, true);
      recomputeCobb();
      draw();
    } else if (e.touches.length === 1 && st.isPanning) {
      // ── Single-finger pan ──────────────────────────────────
      const cp = getTouchCanvasPos(e.touches[0]);
      st.panX += cp.x - st.lastX;
      st.panY += cp.y - st.lastY;
      st.lastX = cp.x; st.lastY = cp.y;
      draw();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    const st = stateRef.current;
    const wasDragging = st.draggingIdx !== null;

    if (!wasDragging && e.changedTouches.length === 1 && e.touches.length === 0) {
      // Tap lifted (no point was being refined) — place a point ONLY if the
      // finger stayed near where it went down (≤ 10px) and didn't grab a point.
      const touch = e.changedTouches[0];
      const cp    = getTouchCanvasPos(touch);
      const moved = Math.hypot(cp.x - st.downX, cp.y - st.downY);
      if (moved < 10 && st.points.length < 4 && lastPinchDist.current === null) {
        const ip = cvs2img(cp.x, cp.y);
        ip.x = Math.max(0, Math.min(naturalW, ip.x));
        ip.y = Math.max(0, Math.min(naturalH, ip.y));
        st.points = [...st.points, ip];
        setPtCount(st.points.length);
        recomputeCobb();
        draw();
      }
    }
    if (e.touches.length < 2) lastPinchDist.current = null;
    if (e.touches.length === 0) { st.isPanning = false; st.draggingIdx = null; st.loupe = null; draw(); }
  };

  const handleTouchCancel = () => {
    const st = stateRef.current;
    st.isPanning = false;
    st.draggingIdx = null;
    st.loupe = null;
    lastPinchDist.current = null;
    draw();
  };

  // Fix 2 (Memory Leak): keydown handler via stable ref.
  // Previously: useCallback([draw]) → draw changes → handleKeyDown changes →
  // useEffect([handleKeyDown]) re-fires → remove+add each render → n listeners.
  // Fix: register ONE stable wrapper on mount; it calls the latest logic via ref.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyHandlerRef.current = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        const st = stateRef.current;
        st.points = []; st.cobb = null; st.draggingIdx = null;
        setPtCount(0); setCobb(null); setHoverIdx(null); draw();
      }
    };
  }); // Run every render to keep ref current — no dep array needed
  useEffect(() => {
    const handler = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // Register ONCE — cleanup on unmount only

  // Size canvas to parent — backing store uses physical pixels for crisp rendering on Retina
  useEffect(() => {
    const cvs = canvasRef.current; if (!cvs) return;
    const fit = () => {
      const parent = cvs.parentElement; if (!parent) return;
      const dpr  = window.devicePixelRatio || 1;
      const cssW = parent.clientWidth;
      const cssH = parent.clientHeight;
      // Physical backing store
      cvs.width  = Math.round(cssW * dpr);
      cvs.height = Math.round(cssH * dpr);
      // CSS display size stays at logical pixels
      cvs.style.width  = cssW + 'px';
      cvs.style.height = cssH + 'px';
      draw();
    };
    fit();
    const obs = new ResizeObserver(fit);
    obs.observe(cvs.parentElement || cvs);
    return () => obs.disconnect();
  }, [draw]);

  const resetPoints = () => {
    const st = stateRef.current;
    st.points = []; st.cobb = null; st.draggingIdx = null;
    setPtCount(0); setCobb(null); setHoverIdx(null); draw();
  };
  const resetZoom = () => {
    stateRef.current.zoom = 1; stateRef.current.panX = 0; stateRef.current.panY = 0; draw();
  };
  const toggleLoupe = () => {
    const next = !loupeOnRef.current;
    loupeOnRef.current = next;
    setLoupeOn(next);
    if (!next) stateRef.current.loupe = null;  // hide any active loupe immediately
    draw();
  };

  const phaseLabel = lang === 'tr'
    ? ['Üst endplate SOL noktası', 'Üst endplate SAĞ noktası', 'Alt endplate SOL noktası', 'Alt endplate SAĞ noktası']
    : lang === 'ar'
    ? ['الصفيحة العلوية — اليسار', 'الصفيحة العلوية — اليمين', 'الصفيحة السفلية — اليسار', 'الصفيحة السفلية — اليمين']
    : ['Upper endplate LEFT', 'Upper endplate RIGHT', 'Lower endplate LEFT', 'Lower endplate RIGHT'];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:0, height:'100%' }}>

      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'#0a1419', borderBottom:'1px solid rgba(255,255,255,.1)', flexShrink:0, flexWrap:'wrap' }}>
        <span style={{ fontSize:11, letterSpacing:'1px', color:'#00c853', fontWeight:800 }}>
          ✏️ {lang==='tr'?'MANUEL COBB':lang==='ar'?'كوب يدوي':'MANUAL COBB'} — {lang==='tr'?'SIFIR API':lang==='ar'?'بدون API':'ZERO API'}
        </span>
        <div style={{ flex:1 }}/>

        {/* Phase indicator */}
        {ptCount < 4 && (
          <span style={{ fontSize:12, color:'#7a8fa0', padding:'3px 10px', border:'1px solid rgba(255,255,255,.1)', borderRadius:20 }}>
            {ptCount + 1}/4 · {phaseLabel[ptCount]}
          </span>
        )}

        {/* Cobb result */}
        {cobb !== null && (
          <span style={{ fontSize:18, fontWeight:800, color:'#00c853', padding:'2px 14px', background:'rgba(0,200,83,.12)', border:'1px solid rgba(0,200,83,.35)', borderRadius:20 }}>
            Cobb: {cobb}°
          </span>
        )}

        <button onClick={resetPoints} style={tbtn}>{lang==='tr'?'↺ Sıfırla':lang==='ar'?'↺ إعادة':'↺ Reset'} (R)</button>
        <button onClick={resetZoom}   style={tbtn}>⊡ 100%</button>
        <button
          onClick={toggleLoupe}
          style={{ ...tbtn, ...(loupeOn ? { color:'#00c853', borderColor:'rgba(0,200,83,.4)' } : {}) }}
          title={lang==='tr'?'Büyüteç':lang==='ar'?'العدسة المكبرة':'Magnifier'}
        >🔎 {loupeOn ? (lang==='tr'?'Açık':lang==='ar'?'مفعّل':'On') : (lang==='tr'?'Kapalı':lang==='ar'?'معطّل':'Off')}</button>
        {onClose && <button onClick={onClose} style={{ ...tbtn, color:'#e05555', borderColor:'rgba(224,85,85,.35)' }}>✕</button>}
      </div>

      {/* Point status */}
      <div style={{ display:'flex', gap:6, padding:'6px 12px', background:'rgba(0,0,0,.3)', flexShrink:0 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 8px', borderRadius:20, background: ptCount > i ? (i<2?'rgba(0,229,255,.12)':'rgba(255,79,216,.12)') : 'rgba(255,255,255,.04)', border:`1px solid ${ptCount > i ? (i<2 ? '#00e5ff' : '#ff4fd8') : 'rgba(255,255,255,.1)'}`, fontSize:11, color: ptCount > i ? (i<2?'#00e5ff':'#ff4fd8') : '#4a5a6a' }}>
            <span style={{ fontWeight:800 }}>{i+1}</span>
            <span>{phaseLabel[i]}</span>
            {ptCount > i && <span>✓</span>}
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div style={{ flex:1, position:'relative', background:'#000', overflow:'hidden', cursor: stateRef.current.draggingIdx !== null ? 'grabbing' : hoverIdx !== null ? 'grab' : ptCount < 4 ? 'crosshair' : 'default' }}>
        <canvas
          ref={canvasRef}
          style={{
            display: 'block', width: '100%', height: '100%',
            touchAction: 'none', // HATA 2 FIX: prevents page scroll on touch
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onContextMenu={handleContextMenu}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
        />
        {!imgLoaded && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', color:'#7a8fa0', fontSize:14 }}>
            {lang==='ar'?'جارٍ تحميل الصورة...':lang==='en'?'Loading image...':'Görüntü yükleniyor...'}
          </div>
        )}
      </div>
    </div>
  );
};

const tbtn: React.CSSProperties = {
  padding:'5px 12px', background:'transparent', border:'1px solid rgba(255,255,255,.15)',
  borderRadius:7, color:'#7a8fa0', fontSize:12, cursor:'pointer', fontFamily:'inherit', fontWeight:700,
};

export default AdvancedManualTool;
