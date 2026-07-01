import React, { useState, useRef } from 'react';
import type { Lang } from '@/lib/i18n';
import type { Translations } from '@/lib/i18n';
import type { SpineAnalysisResult, FootAnalysisResult } from '@/types';
import { preprocessXray } from '@/lib/imagePreprocessing';
import { safeParseSpineResult, safeParseFootResult } from '@/lib/validateAIResponse';
import { processSpineResult, type ProcessedSpineResult } from '@/lib/cobbCalculation';

interface ComparisonPanelProps {
  modality: 'spine' | 'foot';
  currentSpine?: SpineAnalysisResult | null;
  currentProcessedSpine?: ProcessedSpineResult | null;
  currentFoot?: FootAnalysisResult | null;
  lang: Lang;
  t: Translations;
  consentGiven: boolean;
  patientAge: string;
  patientGender: string;
}

export const ComparisonPanel: React.FC<ComparisonPanelProps> = ({
  modality, currentSpine, currentProcessedSpine, currentFoot, lang, t, consentGiven, patientAge, patientGender
}) => {
  const [prevB64, setPrevB64]   = useState<string|null>(null);
  const [prevMime, setPrevMime] = useState('image/jpeg');
  const [prevSrc, setPrevSrc]   = useState<string|null>(null);
  const [prevRes, setPrevRes]         = useState<SpineAnalysisResult|FootAnalysisResult|null>(null);
  const [prevProcessed, setPrevProcessed] = useState<ProcessedSpineResult|null>(null);
  const [prevAspect, setPrevAspect] = useState(1);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    try {
      const src = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target!.result as string);
        r.onerror = () => rej(new Error('File could not be read'));
        r.readAsDataURL(f);
      });
      const processed = await preprocessXray(src, { resize:true, histogramStretch:false });
      setPrevB64(processed.base64);
      setPrevMime(processed.mimeType);
      setPrevAspect(processed.height > 0 ? processed.width / processed.height : 1);
      setPrevSrc(src);
      setPrevRes(null);
      setPrevProcessed(null);
      setError(null);
    } catch(e) { setError((e as Error).message); }
  };

  const analyze = async () => {
    if (!prevB64 || !consentGiven) return;
    setLoading(true); setError(null);
    try {
      const ep = modality === 'spine' ? '/api/analyze-spine' : '/api/analyze-foot';
      const resp = await fetch(ep, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ imageBase64:prevB64, mimeType:prevMime, patientAge, patientGender, lang })
      });
      const raw = await resp.json();
      if (!resp.ok) { setError(raw.error ?? 'Analysis failed'); return; }
      if (modality === 'spine') {
        const p = safeParseSpineResult(raw);
        setPrevRes(p?.result ?? null);
        // Use the same geometry-validated Cobb value as the live analysis flow
        // (App.tsx) and on-screen SpineResults.tsx — not the raw AI cobb_angle.
        setPrevProcessed(p ? processSpineResult(p.result, lang, patientAge, patientGender, undefined, prevAspect) : null);
      } else {
        setPrevRes(safeParseFootResult(raw));
      }
    } catch(e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const getCurrCobb  = () => currentProcessedSpine?.processedCurves?.[0]?.cobb_angle ?? currentSpine?.curves?.[0]?.cobb_angle ?? null;
  const getPrevCobb  = () => modality==='spine' ? (prevProcessed?.processedCurves?.[0]?.cobb_angle ?? null) : null;
  const getCurrMeary = () => (currentFoot as FootAnalysisResult|null)?.meary_angle ?? null;
  const getPrevMeary = () => modality==='foot' ? (prevRes as FootAnalysisResult|null)?.meary_angle ?? null : null;

  const curr = modality === 'spine' ? getCurrCobb() : getCurrMeary();
  const prev = modality === 'spine' ? getPrevCobb() : getPrevMeary();
  const diff = (curr != null && prev != null) ? (curr - prev) : null;

  const diffCol = diff == null ? '#7a8fa0' : diff > 0 ? '#e05555' : diff < 0 ? '#00c853' : '#7a8fa0';

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, alignItems:'start' }}>

        {/* Previous X-ray upload */}
        <div style={{ background:'#0e1419', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:'1.25rem', minHeight:300, display:'flex', flexDirection:'column' }}>
          <div style={{ fontSize:10, letterSpacing:'1.5px', color:'#7a8fa0', fontWeight:700, marginBottom:'1rem' }}>{t.prevXrayLbl}</div>
          {!prevSrc ? (
            <div
              onClick={() => fileRef.current?.click()}
              style={{ flex:1, border:'2px dashed rgba(255,255,255,.2)', borderRadius:10, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, cursor:'pointer', padding:'1.5rem', transition:'border-color .2s', minHeight:220 }}
              onMouseEnter={e=>(e.currentTarget.style.borderColor='#f0a045')}
              onMouseLeave={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,.2)')}
            >
              <div style={{ fontSize:24, opacity:.5 }}>📁</div>
              <div style={{ fontSize:15, fontWeight:500 }}>{t.prevUTitle}</div>
              <div style={{ fontSize:13, color:'#7a8fa0', textAlign:'center' }}>{t.prevUHint}</div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }}
                onChange={e => { const f=e.target.files?.[0]; if(f) handleFile(f); }} />
            </div>
          ) : (
            <>
              <div style={{ position:'relative', background:'#000', borderRadius:10, overflow:'hidden' }}>
                <img src={prevSrc} alt="Previous X-ray" style={{ width:'100%', display:'block', maxHeight:300, objectFit:'contain' }}/>
                <button onClick={() => { setPrevSrc(null); setPrevB64(null); setPrevRes(null); }}
                  style={{ position:'absolute', top:8, right:8, background:'rgba(0,0,0,.75)', color:'#fff', border:'1px solid rgba(255,255,255,.25)', borderRadius:6, padding:'5px 11px', fontSize:12, cursor:'pointer' }}>
                  {lang==='tr'?'↺ Değiştir':lang==='ar'?'↺ تغيير':'↺ Change'}
                </button>
              </div>
              {!prevRes && !loading && (
                <button onClick={analyze} style={{ marginTop:12, padding:'14px', background:'#f0a045', color:'#000', fontSize:15, fontWeight:700, border:'none', borderRadius:10, cursor:'pointer', fontFamily:'inherit' }}>
                  {t.prevAnalyzeBtn}
                </button>
              )}
              {loading && (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:16, color:'#7a8fa0', fontSize:13 }}>
                  <div style={{ width:20, height:20, border:'2px solid rgba(240,160,69,.2)', borderTopColor:'#f0a045', borderRadius:'50%', animation:'spin .75s linear infinite' }}/>
                  {t.prevLoadTxt}
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
              )}
              {error && <div style={{ marginTop:8, padding:'8px 12px', background:'rgba(224,85,85,.1)', border:'1px solid rgba(224,85,85,.3)', borderRadius:7, color:'#e05555', fontSize:13 }}>⚠ {error}</div>}
            </>
          )}
        </div>

        {/* Current result */}
        <div style={{ background:'#0e1419', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:'1.25rem', minHeight:300, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 }}>
          <div style={{ fontSize:10, letterSpacing:'1.5px', color:'#7a8fa0', fontWeight:700, alignSelf:'flex-start', marginBottom:8 }}>{t.currXrayLbl}</div>
          {curr != null ? (
            <>
              <div style={{ fontSize:72, fontWeight:200, lineHeight:1, color: modality==='spine'?'#00c853':'#2196f3' }}>{curr}°</div>
              <div style={{ fontSize:13, color:'#7a8fa0' }}>{modality==='spine'?'Cobb':'Meary'}</div>
            </>
          ) : (
            <div style={{ color:'#4a5a6a', fontSize:13, textAlign:'center' }}>
              {lang==='tr'?'Önce ana panelden analiz yapın':lang==='ar'?'قم بالتحليل من اللوحة الرئيسية أولاً':'Run analysis from the main panel first'}
            </div>
          )}
        </div>
      </div>

      {/* Comparison result */}
      {diff !== null && curr !== null && prev !== null && (
        <div style={{ marginTop:12, background:'#0e1419', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:'1.25rem' }}>
          <div style={{ fontSize:10, letterSpacing:'1.5px', color:'#7a8fa0', fontWeight:700, marginBottom:12 }}>{t.compTitle}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, direction: lang==='ar'?'rtl':'ltr' }}>
            <CompCell lbl={lang==='tr'?'ÖNCEKİ':lang==='ar'?'السابق':'PREVIOUS'} val={`${prev}°`} col="#f0a045"/>
            <CompCell lbl={lang==='tr'?'GÜNCEL':lang==='ar'?'الحالي':'CURRENT'}  val={`${curr}°`} col={modality==='spine'?'#00c853':'#2196f3'}/>
            <CompCell lbl={lang==='tr'?'FARK':lang==='ar'?'الفرق':'CHANGE'}
              val={(diff>0?'+':'')+diff.toFixed(1)+'°'}
              col={diffCol}
              sub={diff>0?(lang==='tr'?'Artış':lang==='ar'?'زيادة':'Increase'):(diff<0?(lang==='tr'?'Azalış':lang==='ar'?'انخفاض':'Decrease'):(lang==='tr'?'Değişim yok':lang==='ar'?'لا تغيير':'No change'))}/>
          </div>
          <div style={{ marginTop:12, fontSize:14, color:'#7a8fa0', padding:'10px 14px', background:'rgba(255,255,255,.04)', borderRadius:8, lineHeight:1.6 }}>
            {Math.abs(diff) >= 5
              ? `⚠️ ${lang==='tr'?`${Math.abs(diff).toFixed(1)}° değişim tespit edildi. FTR Uzman Hekimine başvurun.`:lang==='ar'?`تم اكتشاف تغيير ${Math.abs(diff).toFixed(1)}°. استشر طبيب العلاج الطبيعي.`:`${Math.abs(diff).toFixed(1)}° change detected. Consult your specialist.`}`
              : `✅ ${lang==='tr'?`${Math.abs(diff).toFixed(1)}° fark klinik olarak kabul edilebilir aralıkta.`:lang==='ar'?`فرق ${Math.abs(diff).toFixed(1)}° ضمن النطاق المقبول سريريًا.`:`${Math.abs(diff).toFixed(1)}° difference is within clinically acceptable range.`}`}
          </div>
        </div>
      )}
    </div>
  );
};

const CompCell: React.FC<{ lbl:string; val:string; col:string; sub?:string }> = ({ lbl, val, col, sub }) => (
  <div style={{ background:'#141c23', borderRadius:10, padding:'14px', textAlign:'center' }}>
    <div style={{ fontSize:10, letterSpacing:'1px', color:'#7a8fa0', marginBottom:6, fontWeight:700 }}>{lbl}</div>
    <div style={{ fontSize:34, fontWeight:200, lineHeight:1, color:col }}>{val}</div>
    {sub && <div style={{ fontSize:12, color:'#7a8fa0', marginTop:4 }}>{sub}</div>}
  </div>
);

export default ComparisonPanel;
