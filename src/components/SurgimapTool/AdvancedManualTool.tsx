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
    lastX:   0,
    lastY:   0,
    cobb:    null as number | null,
  });
  const [cobb, setCobb]     = useState<number | null>(null);
  const [ptCount, setPtCount] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);

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
      ctx.save();
      ctx.beginPath(); ctx.arc(pc.x, pc.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = col + '33'; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
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
    }

    // Zoom indicator
    ctx.save();
    ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`${Math.round(zoom * 100)}%`, cssW - 8, cssH - 6);
    ctx.restore();

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

  const handleClick = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // left click only
    e.preventDefault();
    const st = stateRef.current;
    if (st.points.length >= 4) return;
    const cp = getCanvasPos(e);
    const ip = cvs2img(cp.x, cp.y);
    // Clamp to image bounds
    ip.x = Math.max(0, Math.min(naturalW, ip.x));
    ip.y = Math.max(0, Math.min(naturalH, ip.y));
    st.points = [...st.points, ip];
    setPtCount(st.points.length);

    if (st.points.length === 4) {
      const [p1, p2, p3, p4] = st.points;
      const angle = calculateCobbAngle(p1, p2, p3, p4);
      st.cobb = angle;
      setCobb(angle);
      onCobbMeasured?.(angle, st.points);
    }
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
    if (e.button !== 2) return; // right click = pan
    e.preventDefault();
    stateRef.current.isPanning = true;
    const cp = getCanvasPos(e);
    stateRef.current.lastX = cp.x;
    stateRef.current.lastY = cp.y;
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    const st = stateRef.current;
    if (!st.isPanning) return;
    const cp = getCanvasPos(e);
    st.panX += cp.x - st.lastX;
    st.panY += cp.y - st.lastY;
    st.lastX = cp.x; st.lastY = cp.y;
    draw();
  };
  const handleMouseUp     = () => { stateRef.current.isPanning = false; };
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
      // Single touch — start potential pan if 4 points already placed
      const st = stateRef.current;
      st.isPanning = true;
      const cp = getTouchCanvasPos(e.touches[0]);
      st.lastX = cp.x; st.lastY = cp.y;
      lastPinchDist.current = null;
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

    if (e.changedTouches.length === 1 && e.touches.length === 0) {
      // Tap lifted — place a point ONLY if finger didn't move much (≤ 10px)
      const touch = e.changedTouches[0];
      const cp    = getTouchCanvasPos(touch);
      const moved = Math.hypot(cp.x - st.lastX, cp.y - st.lastY);
      if (moved < 10 && st.points.length < 4 && lastPinchDist.current === null) {
        const ip = cvs2img(cp.x, cp.y);
        ip.x = Math.max(0, Math.min(naturalW, ip.x));
        ip.y = Math.max(0, Math.min(naturalH, ip.y));
        st.points = [...st.points, ip];
        setPtCount(st.points.length);
        if (st.points.length === 4) {
          const [p1, p2, p3, p4] = st.points;
          const angle = calculateCobbAngle(p1, p2, p3, p4);
          st.cobb = angle; setCobb(angle);
          onCobbMeasured?.(angle, st.points);
        }
        draw();
      }
    }
    if (e.touches.length < 2) lastPinchDist.current = null;
    if (e.touches.length === 0) st.isPanning = false;
  };

  const handleTouchCancel = () => {
    const st = stateRef.current;
    st.isPanning = false;
    lastPinchDist.current = null;
  };

  // Fix 2 (Memory Leak): keydown handler via stable ref.
  // Previously: useCallback([draw]) → draw changes → handleKeyDown changes →
  // useEffect([handleKeyDown]) re-fires → remove+add each render → n listeners.
  // Fix: register ONE stable wrapper on mount; it calls the latest logic via ref.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyHandlerRef.current = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        stateRef.current.points = []; stateRef.current.cobb = null;
        setPtCount(0); setCobb(null); draw();
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
    stateRef.current.points = []; stateRef.current.cobb = null;
    setPtCount(0); setCobb(null); draw();
  };
  const resetZoom = () => {
    stateRef.current.zoom = 1; stateRef.current.panX = 0; stateRef.current.panY = 0; draw();
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
      <div style={{ flex:1, position:'relative', background:'#000', overflow:'hidden', cursor: stateRef.current.isPanning ? 'grabbing' : ptCount < 4 ? 'crosshair' : 'default' }}>
        <canvas
          ref={canvasRef}
          style={{
            display: 'block', width: '100%', height: '100%',
            touchAction: 'none', // HATA 2 FIX: prevents page scroll on touch
          }}
          onClick={handleClick}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
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
