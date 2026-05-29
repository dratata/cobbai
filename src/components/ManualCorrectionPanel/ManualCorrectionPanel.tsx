/**
 * ManualCorrectionPanel.tsx
 *
 * Physician-facing manual correction tool.
 *
 * Renders a canvas where the AI-detected endplate lines can be:
 *   - Dragged by their endpoint handles
 *   - Reset to the original AI result
 *   - Saved as the corrected measurement
 *
 * Cobb angle recalculates live during drag.
 *
 * Supports mouse and touch (for tablet use in clinics).
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { computeLiveCobb } from '@/lib/cobbCalculation';
import {
  normToCanvas, canvasToNorm, computeLetterbox,
  extendLine, perpendicularBisector, lineIntersection,
} from '@/lib/lineGeometry';
import type { NormLine, NormPoint } from '@/types';
import type { ProcessedSpineResult } from '@/lib/cobbCalculation';

// ── Types ─────────────────────────────────────────────────────

type HandleKey = 'upper_p1' | 'upper_p2' | 'lower_p1' | 'lower_p2';

interface EditLines { upper: NormLine; lower: NormLine }

// ── Props ─────────────────────────────────────────────────────

interface ManualCorrectionPanelProps {
  processedResult:  ProcessedSpineResult;
  curveIndex?:      number;
  naturalW:         number;
  naturalH:         number;
  /** Fix #3: X-ray image source so the canvas shows the actual bones */
  imageSrc?:        string;
  onSave:           (correctedLines: { upper: NormLine; lower: NormLine; cobb: number }) => void;
  onCancel:         () => void;
  lang?:            'en' | 'tr' | 'ar';
}

const CURVE_COLOURS = ['#00c853', '#e53935'];
const HANDLE_RADIUS_RATIO = 0.042; // larger handles — easier to grab on touch/desktop

// ── Component ─────────────────────────────────────────────────

export const ManualCorrectionPanel: React.FC<ManualCorrectionPanelProps> = ({
  processedResult, curveIndex = 0,
  naturalW, naturalH,
  imageSrc,
  onSave, onCancel, lang = 'en',
}) => {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const xrayImgRef = useRef<HTMLImageElement | null>(null); // Fix #3: loaded X-ray
  const curve      = processedResult.processedCurves[curveIndex];
  const col        = CURVE_COLOURS[curveIndex % CURVE_COLOURS.length];

  // Fix #3: Load X-ray image once so it can be drawn as canvas background.
  // Uses refs (not captured state) to avoid stale-closure issues.
  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.onload = () => {
      xrayImgRef.current = img;
      // redrawRef always points to the latest redraw (updated after useCallback below)
      redrawRef.current(linesRef.current, activeRef.current, hoveredRef.current);
    };
    img.src = imageSrc;
  }, [imageSrc]); // eslint-disable-line react-hooks/exhaustive-deps

  const [lines, setLines]   = useState<EditLines>(() => ({
    upper: { ...curve.upper_line },
    lower: { ...curve.lower_line },
  }));
  const [liveCobb, setLiveCobb]      = useState<number>(curve.cobb_angle);
  const [activeHandle, setActive]    = useState<HandleKey | null>(null);
  const [hoveredHandle, setHovered]  = useState<HandleKey | null>(null);

  const linesRef   = useRef(lines);
  linesRef.current = lines;
  // Refs so async callbacks (image onload) always have the current handle state
  // (avoids stale closure when handles are moved before the image finishes loading)
  const activeRef  = useRef<HandleKey | null>(null);
  const hoveredRef = useRef<HandleKey | null>(null);
  activeRef.current  = activeHandle;
  hoveredRef.current = hoveredHandle;
  // ref to redraw — allows image-load callback to call the latest redraw without
  // capturing a stale closure or declaring it before the useCallback below
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const redrawRef  = useRef<(...args: any[]) => void>(() => {});

  // ── Drawing ───────────────────────────────────────────────

  const redraw = useCallback((currentLines: EditLines, active: HandleKey | null, hovered: HandleKey | null) => {
    const cvs = canvasRef.current;
    if (!cvs || cvs.width === 0 || cvs.height === 0) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    // DPR-aware: draw in CSS (logical) pixel space
    const dpr  = window.devicePixelRatio || 1;
    const cssW = cvs.width  / dpr;
    const cssH = cvs.height / dpr;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);
    const reg  = computeLetterbox(naturalW, naturalH, cssW, cssH);
    const lw   = Math.max(2.5, cssW * 0.004);
    const hR   = Math.max(12, cssW * HANDLE_RADIUS_RATIO);

    // Fix #3: Draw X-ray background so clinician can see the bones while correcting
    if (xrayImgRef.current) {
      ctx.drawImage(xrayImgRef.current, reg.ox, reg.oy, reg.rw, reg.rh);
    } else {
      // Fallback: dark background with grid hint (use CSS dims — we're in scaled ctx)
      ctx.fillStyle = '#0a0e12';
      ctx.fillRect(0, 0, cssW, cssH);
    }

    // Draw original AI lines (faded dashed reference)
    const origCurve = processedResult.processedCurves[curveIndex];
    if (origCurve) {
      const ouExt = extendLine(origCurve.upper_line, 0.2);
      const olExt = extendLine(origCurve.lower_line, 0.2);
      const ou1 = normToCanvas(ouExt.x1, ouExt.y1, reg);
      const ou2 = normToCanvas(ouExt.x2, ouExt.y2, reg);
      const ol1 = normToCanvas(olExt.x1, olExt.y1, reg);
      const ol2 = normToCanvas(olExt.x2, olExt.y2, reg);
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(ou1.x, ou1.y); ctx.lineTo(ou2.x, ou2.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ol1.x, ol1.y); ctx.lineTo(ol2.x, ol2.y); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    }

    // Draw editable lines (extended, solid)
    const { upper, lower } = currentLines;
    const euExt = extendLine(upper, 0.22);
    const elExt = extendLine(lower, 0.22);
    const u1 = normToCanvas(upper.x1, upper.y1, reg);
    const u2 = normToCanvas(upper.x2, upper.y2, reg);
    const l1 = normToCanvas(lower.x1, lower.y1, reg);
    const l2 = normToCanvas(lower.x2, lower.y2, reg);
    const eu1 = normToCanvas(euExt.x1, euExt.y1, reg);
    const eu2 = normToCanvas(euExt.x2, euExt.y2, reg);
    const el1 = normToCanvas(elExt.x1, elExt.y1, reg);
    const el2 = normToCanvas(elExt.x2, elExt.y2, reg);

    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(eu1.x, eu1.y); ctx.lineTo(eu2.x, eu2.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(el1.x, el1.y); ctx.lineTo(el2.x, el2.y); ctx.stroke();
    ctx.restore();

    // Perpendiculars — use CSS dims (cssH), not physical cvs.height
    const halfLen = Math.max(cssH * 0.14, 36);
    const pU = perpendicularBisector({ x1:u1.x, y1:u1.y, x2:u2.x, y2:u2.y }, halfLen);
    const pL = perpendicularBisector({ x1:l1.x, y1:l1.y, x2:l2.x, y2:l2.y }, halfLen);
    ctx.save();
    ctx.strokeStyle = col + '77'; ctx.lineWidth = 1.5; ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.moveTo(pU.p1.x, pU.p1.y); ctx.lineTo(pU.p2.x, pU.p2.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pL.p1.x, pL.p1.y); ctx.lineTo(pL.p2.x, pL.p2.y); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();

    // Angle arc + live Cobb label
    const inter = lineIntersection(pU.p1, pU.p2, pL.p1, pL.p2);
    let labelX = (u1.x + u2.x + l1.x + l2.x) / 4;
    let labelY = (u1.y + u2.y + l1.y + l2.y) / 4;

    if (inter) {
      const a1  = Math.atan2(pU.mid.y - inter.y, pU.mid.x - inter.x);
      const a2  = Math.atan2(pL.mid.y - inter.y, pL.mid.x - inter.x);
      let diff  = a2 - a1;
      while (diff >  Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const arcR = Math.max(cssH * 0.07, 20);
      ctx.save();
      ctx.beginPath(); ctx.moveTo(inter.x, inter.y);
      ctx.arc(inter.x, inter.y, arcR, a1, a1 + diff, diff < 0);
      ctx.closePath(); ctx.fillStyle = col + '22'; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(inter.x, inter.y, arcR, a1, a1 + diff, diff < 0); ctx.stroke();
      ctx.restore();
      const ma = a1 + diff / 2;
      labelX = inter.x + Math.cos(ma) * (arcR + 22);
      labelY = inter.y + Math.sin(ma) * (arcR + 22);
    }

    const fs = Math.max(14, Math.round(cssW * 0.038));
    const cobb = computeLiveCobb(upper, lower);
    ctx.save();
    ctx.font = `bold ${fs}px ui-monospace,monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tm = ctx.measureText(`${cobb}°`), pad = 9;
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    if (ctx.roundRect) ctx.roundRect(labelX-tm.width/2-pad, labelY-fs/2-pad*0.6, tm.width+pad*2, fs+pad*1.2, 6);
    else ctx.rect(labelX-tm.width/2-pad, labelY-fs/2-pad*0.6, tm.width+pad*2, fs+pad*1.2);
    ctx.fill(); ctx.fillStyle = col; ctx.shadowColor='rgba(0,0,0,0.9)'; ctx.shadowBlur=5;
    ctx.fillText(`${cobb}°`, labelX, labelY);
    ctx.restore();

    // Handles
    const handles: Record<HandleKey, NormPoint> = {
      upper_p1: u1, upper_p2: u2, lower_p1: l1, lower_p2: l2,
    };
    (Object.entries(handles) as [HandleKey, NormPoint][]).forEach(([key, pt]) => {
      const isActive  = key === active;
      const isHovered = key === hovered;
      ctx.save();
      // Outer glow — much more visible for active/hovered state
      if (isActive) {
        ctx.shadowColor = col; ctx.shadowBlur = 18;
      } else if (isHovered) {
        ctx.shadowColor = col; ctx.shadowBlur = 10;
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 6;
      }
      ctx.beginPath(); ctx.arc(pt.x, pt.y, hR, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? col : isHovered ? col + '66' : 'rgba(0,0,0,0.75)';
      ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = isActive ? 3.5 : 2.5;
      ctx.stroke();
      // Crosshair inside handle
      ctx.shadowBlur = 0;
      const s = hR * 0.42;
      ctx.strokeStyle = isActive ? '#000' : col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pt.x - s, pt.y); ctx.lineTo(pt.x + s, pt.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pt.x, pt.y - s); ctx.lineTo(pt.x, pt.y + s); ctx.stroke();
      ctx.restore();
    });
    // Restore DPR transform
    ctx.restore();
  }, [naturalW, naturalH, col, curveIndex, processedResult]);

  // Keep redrawRef pointing to the latest redraw so async callbacks can use it
  useEffect(() => { redrawRef.current = redraw; }, [redraw]);

  useEffect(() => {
    const cobb = computeLiveCobb(lines.upper, lines.lower);
    setLiveCobb(cobb);
    redraw(lines, activeHandle, hoveredHandle);
  }, [lines, activeHandle, hoveredHandle, redraw]);

  // Fix #4: ResizeObserver — canvas backing store scaled by devicePixelRatio for
  // sharp rendering on Retina/HiDPI screens. CSS display size stays at logical px.
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const parent = cvs.parentElement;
    if (!parent) return;
    const syncSize = () => {
      const dpr  = window.devicePixelRatio || 1;
      const cssW = parent.clientWidth || 600;
      const cssH = naturalW > 0 && naturalH > 0
        ? Math.max(240, Math.round(cssW * naturalH / naturalW))
        : Math.max(240, Math.round(cssW * 1.5));
      const physW = Math.round(cssW * dpr);
      const physH = Math.round(cssH * dpr);
      if (cvs.width !== physW || cvs.height !== physH) {
        cvs.width        = physW;
        cvs.height       = physH;
        cvs.style.width  = cssW + 'px';
        cvs.style.height = cssH + 'px';
        redraw(linesRef.current, activeRef.current, hoveredRef.current);
      }
    };
    const obs = new ResizeObserver(syncSize);
    obs.observe(parent);
    const rafId = requestAnimationFrame(syncSize);
    return () => { cancelAnimationFrame(rafId); obs.disconnect(); };
  }, [naturalW, naturalH, redraw]);

  // ── Mouse / touch coordinate helpers ─────────────────────────
  //
  // Coordinate system UNIFICATION (audit fix):
  //   • redraw() draws in CSS logical pixel space (via ctx.scale(dpr,dpr))
  //   • getPos() must return CSS logical pixels — NOT physical pixels.
  //     Previously it multiplied by (cvs.width / rect.width) = dpr, giving
  //     physical pixels, while redraw worked in CSS pixels → mismatch on HiDPI.
  //   • findHandle() and updateHandle() must also use the CSS letterbox region.
  //
  // With this fix all three functions share the same coordinate system and
  // handle hit-testing works correctly on Retina/HiDPI screens.

  /** CSS (logical) pixel dimensions of the canvas at current layout. */
  const getCanvasCssDims = () => {
    const cvs  = canvasRef.current!;
    const rect = cvs.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    return {
      cssW: rect.width  || cvs.width  / dpr,
      cssH: rect.height || cvs.height / dpr,
    };
  };

  /** Returns pointer position in CSS (logical) pixels — no DPR scaling. */
  const getPos = (e: React.MouseEvent | React.TouchEvent): { cx: number; cy: number } => {
    const cvs  = canvasRef.current!;
    const rect = cvs.getBoundingClientRect();
    const cl   = 'touches' in e ? e.touches[0] : e;
    return { cx: cl.clientX - rect.left, cy: cl.clientY - rect.top };
  };

  const findHandle = (cx: number, cy: number): HandleKey | null => {
    const { cssW, cssH } = getCanvasCssDims();
    const reg = computeLetterbox(naturalW, naturalH, cssW, cssH);
    // Hit radius uses CSS dimensions to match the drawn handle size in redraw()
    const hR  = Math.max(12, cssW * HANDLE_RADIUS_RATIO) * 1.5;
    const { upper, lower } = linesRef.current;
    const handles: Record<HandleKey, NormPoint> = {
      upper_p1: normToCanvas(upper.x1, upper.y1, reg),
      upper_p2: normToCanvas(upper.x2, upper.y2, reg),
      lower_p1: normToCanvas(lower.x1, lower.y1, reg),
      lower_p2: normToCanvas(lower.x2, lower.y2, reg),
    };
    let best: HandleKey | null = null, bestD = Infinity;
    (Object.entries(handles) as [HandleKey, NormPoint][]).forEach(([key, pt]) => {
      const d = Math.hypot(cx - pt.x, cy - pt.y);
      if (d < hR && d < bestD) { bestD = d; best = key; }
    });
    return best;
  };

  const updateHandle = (key: HandleKey, cx: number, cy: number) => {
    const { cssW, cssH } = getCanvasCssDims();
    const reg = computeLetterbox(naturalW, naturalH, cssW, cssH);
    const n   = canvasToNorm(cx, cy, reg);
    setLines(prev => {
      const next = { upper: { ...prev.upper }, lower: { ...prev.lower } };
      if (key === 'upper_p1') { next.upper.x1 = n.x; next.upper.y1 = n.y; }
      if (key === 'upper_p2') { next.upper.x2 = n.x; next.upper.y2 = n.y; }
      if (key === 'lower_p1') { next.lower.x1 = n.x; next.lower.y1 = n.y; }
      if (key === 'lower_p2') { next.lower.x2 = n.x; next.lower.y2 = n.y; }
      return next;
    });
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const { cx, cy } = getPos(e);
    const h = findHandle(cx, cy);
    if (h) { setActive(h); e.preventDefault(); }
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const { cx, cy } = getPos(e);
    if (activeHandle) { updateHandle(activeHandle, cx, cy); }
    else setHovered(findHandle(cx, cy));
  };
  const onMouseUp = () => setActive(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const { cx, cy } = getPos(e); const h = findHandle(cx, cy);
    if (h) { setActive(h); e.preventDefault(); }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!activeHandle) return;
    e.preventDefault(); const { cx, cy } = getPos(e); updateHandle(activeHandle, cx, cy);
  };

  const handleSave = () => {
    const cobb = computeLiveCobb(lines.upper, lines.lower);
    onSave({ upper: lines.upper, lower: lines.lower, cobb });
  };

  const handleReset = () => {
    setLines({ upper: { ...curve.upper_line }, lower: { ...curve.lower_line } });
    setActive(null);
  };

  const t = {
    en: {
      title:'Edit Endplate Lines', sub:'Drag ○ handles to correct endplate position',
      aiRef:'AI original (dashed)', liveCobb:'Live Cobb',
      save:'💾 Save Corrected', reset:'↺ Reset to AI', cancel:'✕ Cancel',
      guide:'1) Drag cyan ○ handles on upper endplate  2) Drag magenta ○ handles on lower endplate  3) Verify live Cobb  4) Save',
    },
    tr: {
      title:'Endplate Çizgilerini Düzenle', sub:'○ noktalarını sürükleyerek endplate konumunu düzeltin',
      aiRef:'AI orijinal (kesik)', liveCobb:'Canlı Cobb',
      save:'💾 Kaydet', reset:'↺ AI\'ya Dön', cancel:'✕ İptal',
      guide:'1) Siyan ○ üst endplate uçlarını sürükle  2) Magenta ○ alt endplate uçlarını sürükle  3) Canlı Cobb\'u kontrol et  4) Kaydet',
    },
    ar: {
      title:'تحرير خطوط الصفيحة', sub:'اسحب ○ لتصحيح الموضع',
      aiRef:'AI الأصلي (متقطع)', liveCobb:'كوب مباشر',
      save:'💾 حفظ', reset:'↺ إعادة', cancel:'✕ إلغاء',
      guide:'١) اسحب ○ السماوية للصفيحة العلوية  ٢) اسحب ○ الوردية للصفيحة السفلية  ٣) تحقق من قيمة كوب  ٤) احفظ',
    },
  }[lang];

  return (
    <div style={{ background:'#0a1a0f', border:'1px solid rgba(0,200,83,.3)', borderRadius:12, padding:14 }}>
      {/* Surgimap-style banner: AI suggested these positions — physician verifies */}
      <div style={{ fontSize:12, fontWeight:700, color:'#00e5ff', background:'rgba(0,229,255,.07)', border:'1px solid rgba(0,229,255,.25)', borderRadius:7, padding:'8px 12px', marginBottom:10, display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:16 }}>🔬</span>
        <span>
          {lang === 'tr'
            ? 'AI endplate önerisi — Tutamaçları sürükleyerek doğru pozisyona getirin, sonra Kaydet.'
            : lang === 'ar'
            ? 'اقتراح AI للصفيحة — اسحب المقابض إلى الموضع الصحيح ثم احفظ.'
            : 'AI endplate suggestion — Drag the handles to the correct position, then Save.'}
        </span>
      </div>
      {/* Step guide */}
      <div style={{ fontSize:10, color:'#5a7a6a', background:'rgba(0,0,0,.25)', borderRadius:5, padding:'5px 9px', marginBottom:10, lineHeight:1.5 }}>
        {t.guide}
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <div>
          <div style={{ fontSize:11, letterSpacing:'1px', color:'#00c853', fontWeight:700 }}>{t.title}</div>
          <div style={{ fontSize:12, color:'#7a8fa0', marginTop:2 }}>{t.sub}</div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:10, color:'#7a8fa0' }}>{t.liveCobb}</div>
          <div style={{ fontSize:32, fontWeight:200, color:'#00c853', lineHeight:1 }}>{liveCobb}°</div>
        </div>
      </div>

      <div style={{ position:'relative', background:'#000', borderRadius:8, overflow:'hidden', cursor: activeHandle ? 'grabbing' : hoveredHandle ? 'grab' : 'crosshair' }}>
        <canvas
          ref={canvasRef}
          style={{ display:'block', width:'100%', height:'auto' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onMouseUp}
          onTouchCancel={onMouseUp}
        />
      </div>

      <div style={{ display:'flex', gap:8, marginTop:10 }}>
        <button onClick={handleSave}  style={btnStyle('#00c853')}>{t.save}</button>
        <button onClick={handleReset} style={btnStyle('#f0a045')}>{t.reset}</button>
        <button onClick={onCancel}    style={btnStyle('#e05555')}>{t.cancel}</button>
      </div>
    </div>
  );
};

function btnStyle(col: string): React.CSSProperties {
  return {
    flex: 1, padding: '9px 6px',
    background: col + '18', border: `1px solid ${col}55`,
    borderRadius: 8, color: col, fontSize: 13, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  };
}

export default ManualCorrectionPanel;
