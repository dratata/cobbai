import React, { useState, useRef } from 'react';
import type { Lang } from '@/lib/i18n';
import type { Translations } from '@/lib/i18n';
import type { SpineAnalysisResult, FootAnalysisResult } from '@/types';
import { preprocessXray } from '@/lib/imagePreprocessing';
import { safeParseSpineResult, safeParseFootResult } from '@/lib/validateAIResponse';

interface ComparisonPanelProps {
  modality: 'spine' | 'foot';
  currentSpine?: SpineAnalysisResult | null;
  currentFoot?: FootAnalysisResult | null;
  lang: Lang;
  t: Translations;
  consentGiven: boolean;
  patientAge: string;
  patientGender: string;
}

export const ComparisonPanel: React.FC<ComparisonPanelProps> = ({
  modality, currentSpine, currentFoot, lang, t, consentGiven, patientAge, patientGender
}) => {
  const [prevB64, setPrevB64]   = useState<string|null>(null);
  const [prevMime, setPrevMime] = useState('image/jpeg');
  const [prevSrc, setPrevSrc]   = useState<string|null>(null);
  const [prevRes, setPrevRes]   = useState<SpineAnalysisResult|FootAnalysisResult|null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    const src = await new Promise<string>((res,rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target!.result as string);
      r.onerror = rej;
      r.readAsDataURL(f);
    });
    const processed = await preprocessXray(src, { resize:true, histogramStretch:false });
    setPrevB64(processed.base64);
    setPrevMime(processed.mimeType);
    setPrevSrc(src);
    setPrevRes(null);
    setError(null);
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
      } else {
        setPrevRes(safeParseFootResult(raw));
      }
    } catch(e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const getCurrCobb  = () => currentSpine?.curves?.[0]?.cobb_angle ?? null;
  const getPrevCobb  = () => modality==='spine' ? (prevRes as SpineAnalysisResult|null)?.curves?.[0]?.cobb_angle ?? null : null;
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
                  ↺ Değiştir
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
            <div style={{ color:'#4a5a6a', fontSize:13, textAlign:'center' }}>Önce ana panelden analiz yapın</div>
          )}
        </div>
      </div>

      {/* Comparison result */}
      {diff !== null && curr !== null && prev !== null && (
        <div style={{ marginTop:12, background:'#0e1419', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:'1.25rem' }}>
          <div style={{ fontSize:10, letterSpacing:'1.5px', color:'#7a8fa0', fontWeight:700, marginBottom:12 }}>{t.compTitle}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            <CompCell lbl={lang==='tr'?'ÖNCEKİ':'PREVIOUS'} val={`${prev}°`} col="#f0a045"/>
            <CompCell lbl={lang==='tr'?'GÜNCEL':'CURRENT'}  val={`${curr}°`} col={modality==='spine'?'#00c853':'#2196f3'}/>
            <CompCell lbl={lang==='tr'?'FARK':'CHANGE'}
              val={(diff>0?'+':'')+diff.toFixed(1)+'°'}
              col={diffCol}
              sub={diff>0?(lang==='tr'?'Artış':'Increase'):(diff<0?(lang==='tr'?'Azalış':'Decrease'):(lang==='tr'?'Değişim yok':'No change'))}/>
          </div>
          <div style={{ marginTop:12, fontSize:14, color:'#7a8fa0', padding:'10px 14px', background:'rgba(255,255,255,.04)', borderRadius:8, lineHeight:1.6 }}>
            {Math.abs(diff) >= 5
              ? `⚠️ ${Math.abs(diff).toFixed(1)}° değişim tespit edildi. FTR Uzman Hekimine başvurun.`
              : `✅ ${Math.abs(diff).toFixed(1)}° fark klinik olarak kabul edilebilir aralıkta.`}
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
