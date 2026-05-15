/**
 * App.tsx — CobbAI v2
 * Full clinical workflow with all features from the legacy app.
 */

import React, { Suspense, lazy, useEffect, useRef, useCallback, useState } from 'react';
import { useMeasurementStore, selectCanAnalyze } from '@/store/measurementStore';
import { processSpineResult } from '@/lib/cobbCalculation';
import { safeParseSpineResult, safeParseFootResult } from '@/lib/validateAIResponse';
import { analyseImageQuality, preprocessXray } from '@/lib/imagePreprocessing';
import { hashBase64, getCachedResult, setCachedResult, clearAllCache, clearTrackingHistory, clearAllLocalData } from '@/lib/imageCache';
import { getT } from '@/lib/i18n';
import type { AnalyzeSpineRequest, SpineAnalysisResult } from '@/types';

// ── Lazy-loaded heavy components ──────────────────────────────
const CobbOverlay           = lazy(() => import('@/components/CobbOverlay/CobbOverlay'));
const ManualCorrectionPanel = lazy(() => import('@/components/ManualCorrectionPanel/ManualCorrectionPanel'));
const SpineResults          = lazy(() => import('@/components/SpineResults/SpineResults'));
const FootResults           = lazy(() => import('@/components/FootResults/FootResults'));
const ReportModal           = lazy(() => import('@/components/ReportModal/ReportModal'));
const ComparisonPanel       = lazy(() => import('@/components/ComparisonPanel/ComparisonPanel'));
const TrackingPanel         = lazy(() => import('@/components/TrackingPanel/TrackingPanel'));
const SurgimapLitePanel     = lazy(() => import('@/components/SurgimapLitePanel/SurgimapLitePanel'));

// ── Eagerly-loaded small components ──────────────────────────
import { Sidebar }       from '@/components/Sidebar/Sidebar';
import { LandingScreen } from '@/components/LandingScreen/LandingScreen';
// ConsentModal available if needed: import { ConsentModal } from '@/components/ConsentModal/ConsentModal';
import { PatientBar }    from '@/components/PatientBar/PatientBar';
import { ImageControls } from '@/components/ImageControls/ImageControls';


// ── Helpers ───────────────────────────────────────────────────
const Spinner: React.FC<{ label?: string }> = ({ label }) => (
  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, padding:'2rem', color:'#7a8fa0', fontSize:14 }}>
    <div style={{ width:36, height:36, border:'3px solid rgba(0,200,83,.2)', borderTopColor:'#00c853', borderRadius:'50%', animation:'_spin .75s linear infinite' }} />
    {label ?? 'Yükleniyor...'}
    <style>{`@keyframes _spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

// ── Main App ──────────────────────────────────────────────────
const App: React.FC = () => {
  const store           = useMeasurementStore();
  const canAnalyze      = useMeasurementStore(selectCanAnalyze);
  const t               = getT(store.language);
  const fileRef         = useRef<HTMLInputElement>(null);
  const imgRef          = useRef<HTMLImageElement>(null);
  const abortRef        = useRef<AbortController | null>(null);
  const analyzingRef    = useRef(false);            // debounce guard
  const [selectedCurveIdx, setSelectedCurveIdx] = useState(0);
  const [showPrivacy, setShowPrivacy]           = useState(false);

  // Apply light mode on mount
  useEffect(() => {
    document.body.classList.toggle('light-mode', store.lightMode);
    document.documentElement.lang  = store.language;
    document.documentElement.dir   = store.language === 'ar' ? 'rtl' : 'ltr';
  }, [store.lightMode, store.language]);

  // ── File upload ──────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { store.setAnalyzeError('Lütfen bir görüntü dosyası yükleyin (JPEG veya PNG).'); return; }
    store.setPreprocessing(true);
    try {
      const src = await new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = e => res(e.target!.result as string); r.onerror = rej; r.readAsDataURL(file);
      });
      const img = new Image(); img.src = src; await new Promise(r => { img.onload = r; });
      const quality = await analyseImageQuality(img);
      store.setQualityReport(quality);
      const { base64, mimeType, width, height } = await preprocessXray(src, { resize:true, histogramStretch: quality.score !== 'good' });
      store.setLoadedImage({ base64, originalBase64: src.split(',')[1]??src, mimeType, naturalWidth:width, naturalHeight:height, filename:file.name });
    } finally { store.setPreprocessing(false); }
  }, [store]);

  // ── Analysis with caching + debounce ─────────────────────────
  const runAnalysis = useCallback(async (forceRefresh = false) => {
    if (!canAnalyze || !store.loadedImage) return;
    if (analyzingRef.current) return;  // debounce
    analyzingRef.current = true;

    store.setAnalyzing(true); store.setAnalyzeError(null);

    // Abort previous request if still pending
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const ep = store.modality === 'spine' ? '/api/analyze-spine' : '/api/analyze-foot';

    try {
      // ── Check cache first ──────────────────────────────────
      if (!forceRefresh) {
        const hash = await hashBase64(store.loadedImage.base64);
        const cached = getCachedResult<SpineAnalysisResult>(hash, store.modality, store.language);
        if (cached) {
          if (store.modality === 'spine') {
            const parsed = safeParseSpineResult(cached);
            if (parsed) {
              store.setSpineResult(parsed.result, processSpineResult(parsed.result, store.language, store.patientAge, store.patientGender, store.risserStage), parsed.outcome);
              store.setAnalyzing(false); analyzingRef.current = false;
              return;
            }
          }
        }
      }

      // ── Call API ───────────────────────────────────────────
      const timer = setTimeout(() => controller.abort(), 90_000);
      const payload: AnalyzeSpineRequest = {
        imageBase64: store.loadedImage.base64,
        mimeType:    store.loadedImage.mimeType,
        patientAge:  store.patientAge,
        patientGender: store.patientGender,
        lang:        store.language,
      };
      const resp = await fetch(ep, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload), signal: controller.signal,
      });
      clearTimeout(timer);
      const rawJson = await resp.json();
      if (!resp.ok) {
        store.setAnalyzeError((rawJson as { error?:string }).error ?? 'Hata: ' + resp.status);
        return;
      }

      if (store.modality === 'spine') {
        const parsed = safeParseSpineResult(rawJson);
        if (!parsed) { store.setAnalyzeError('AI yanıtı geçersiz koordinatlar içeriyor. Lütfen tekrar deneyin.'); return; }
        // Cache result
        const hash = await hashBase64(store.loadedImage.base64);
        setCachedResult(hash, store.modality, store.language, parsed.result);
        store.setSpineResult(
          parsed.result,
          processSpineResult(parsed.result, store.language, store.patientAge, store.patientGender, store.risserStage),
          parsed.outcome
        );
        store.addToHistory({ id: Date.now().toString(), timestamp: new Date().toISOString(), modality:'spine', result: parsed.result, patientAge: store.patientAge, patientGender: store.patientGender });
      } else {
        const foot = safeParseFootResult(rawJson);
        const hash = await hashBase64(store.loadedImage.base64);
        if (foot) setCachedResult(hash, store.modality, store.language, foot);
        store.setFootResult(foot);
      }
    } catch(e) {
      const err = e as Error;
      if (err.name !== 'AbortError') {
        store.setAnalyzeError(err.name==='AbortError' ? 'Bağlantı zaman aşımına uğradı. Lütfen tekrar deneyin.' : err.message);
      }
    } finally {
      store.setAnalyzing(false);
      analyzingRef.current = false;
    }
  }, [canAnalyze, store]);

  // ── Canvas overlay export ──────────────────────────────────
  const exportPNG = useCallback(() => {
    const img = imgRef.current;
    if (!img?.src || img.src === window.location.href) return;
    const cvs = document.createElement('canvas');
    cvs.width = img.naturalWidth || img.offsetWidth;
    cvs.height = img.naturalHeight || img.offsetHeight;
    const ctx = cvs.getContext('2d')!;
    ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
    const overlay = document.querySelector('#overlay-canvas') as HTMLCanvasElement | null;
    if (overlay && store.controls.showOverlay) ctx.drawImage(overlay, 0, 0, cvs.width, cvs.height);
    const stripH = Math.round(cvs.height * 0.05);
    ctx.fillStyle = 'rgba(0,0,0,0.82)'; ctx.fillRect(0, cvs.height - stripH, cvs.width, stripH);
    ctx.fillStyle = '#00c853'; ctx.font = `bold ${Math.round(stripH*0.38)}px monospace`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const cobb = store.spineResult?.curves?.[0]?.cobb_angle;
    ctx.fillText(`  ⚕ CobbAI${cobb!=null?' | Cobb: '+cobb+'°':''} | ${new Date().toLocaleDateString('tr-TR')} | cobbai.vercel.app`, 0, cvs.height - stripH/2);
    const a = document.createElement('a'); a.download = 'cobbai-' + new Date().toISOString().slice(0,10) + '.png'; a.href = cvs.toDataURL('image/png'); a.click();
  }, [store]);

  // ── Image filter string ────────────────────────────────────
  const imgFilter = `brightness(${100 + store.controls.brightness}%) contrast(${store.controls.contrast}%)`;

  // ── Derived labels (language aware) ─────────────────────────
  const sidebarLabels = {
    dl1:t.dl1,dl2:t.dl2,dl3:t.dl3,dl4:t.dl4,dl5:t.dl5,
    dn1:t.dn1,ds1:t.ds1,dn2:t.dn2,ds2:t.ds2,
    dn3:t.dn3,ds3:t.ds3,dn4:t.dn4,ds4:t.ds4,
    dn5:t.dn5,ds5:t.ds5,dn6:t.dn6,ds6:t.ds6,
    dn7:t.dn7,ds7:t.ds7,dn8:t.dn8,ds8:t.ds8,
    dnVal:t.dnVal,dsVal:t.dsVal,
  };

  const showResult  = !!(store.spineResult || store.footResult);
  const hasSpine    = store.modality === 'spine' && !!store.processedSpine;
  const hasFoot     = store.modality === 'foot'  && !!store.footResult;

  // ── Render ────────────────────────────────────────────────────
  return (
    <>
      {/* Landing screen — every session */}
      {!store.consentGiven && (
        <LandingScreen
          lang={store.language}
          onDoctor={() => { store.setConsent(true); sessionStorage.setItem('cobbai_role','doctor'); }}
          onPatient={() => { window.location.href = '/patients.html'; }}
        />
      )}

      {/* KVKK consent modal */}
      {/* ConsentModal opened via kvkk-link click — wired via state if needed */}

      {/* Main layout */}
      <div style={{ minHeight:'100vh', background:'var(--c-bg)' }}>

        {/* ── Nav ─────────────────────────────────────────────── */}
        <nav style={{ background:'#0a0f13', borderBottom:'1px solid rgba(255,255,255,.1)', padding:'0 1rem', height:60, display:'flex', alignItems:'center', gap:12, position:'sticky', top:0, zIndex:100, backdropFilter:'blur(8px)' }}>
          <div style={{ width:32, height:32, border:'2px solid #00c853', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🦴</div>
          <span style={{ fontSize:18, fontWeight:800 }}>CobbAI</span>
          <span style={{ fontSize:11, padding:'2px 8px', background:'rgba(0,200,83,.1)', border:'1px solid rgba(0,200,83,.25)', borderRadius:20, color:'#00c853' }}>{t.aiChip}</span>
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6 }}>
            {(['tr','en','ar'] as const).map(l => (
              <button key={l} onClick={() => store.setLanguage(l)} style={{ padding:'5px 12px', border: store.language===l ? '2px solid #00c853' : '2px solid rgba(255,255,255,.15)', borderRadius:20, background:'transparent', color: store.language===l ? '#00c853' : '#7a8fa0', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                {l.toUpperCase()}
              </button>
            ))}
            <button onClick={store.toggleTheme} style={{ width:34, height:34, border:'1px solid rgba(255,255,255,.15)', borderRadius:8, background:'transparent', color:'#7a8fa0', fontSize:16, cursor:'pointer' }}>
              {store.lightMode ? '☀️' : '🌙'}
            </button>
          </div>
        </nav>

        {store.consentGiven && (
          <>
            {/* ── Sidebar ───────────────────────────────────────── */}
            <Sidebar
              modality={store.modality}
              lang={store.language}
              labels={sidebarLabels}
              exLang={store.language}
              onSwitchModality={m => { store.setModality(m); }}
            />

            {/* ── Page content ──────────────────────────────────── */}
            <div style={{ marginLeft: 210, minWidth:0 }}>

              {/* Hero */}
              <section style={{ maxWidth:'100%', padding:'1.75rem 1rem 1rem', display:'flex', alignItems:'center', gap:'1.5rem' }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:'.7rem', flexWrap:'wrap' }}>
                    <span style={{ display:'inline-block', padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:700, color:'#00c853', background:'rgba(0,200,83,.1)', border:'1px solid rgba(0,200,83,.3)', boxShadow:'0 0 16px rgba(0,200,83,.12)' }}>{t.badge}</span>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:'rgba(0,200,83,.08)', border:'1px solid rgba(0,200,83,.2)', color:'#00c853', letterSpacing:'.5px' }}>
                      <span style={{ width:6, height:6, borderRadius:'50%', background:'#00c853', boxShadow:'0 0 6px #00c853', animation:'_pulse 2s ease infinite' }}/>
                      {t.aiChip}
                    </span>
                    <style>{`@keyframes _pulse{0%,100%{opacity:.6}50%{opacity:1}}`}</style>
                  </div>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:'1.2px', color:'#00c853', opacity:.75, marginBottom:4 }}>{t.forDoctors}</div>
                  <h1 style={{ fontSize:'clamp(1.8rem,4.5vw,2.6rem)', fontWeight:700, lineHeight:1.2, marginBottom:'.5rem' }}
                    dangerouslySetInnerHTML={{ __html: store.modality==='spine' ? t.titleS : t.titleF }}/>
                  <p style={{ fontSize:17, color:'#7a8fa0', maxWidth:560 }}>{store.modality==='spine' ? t.subS : t.subF}</p>
                  <p style={{ fontSize:13, color:'#4a5a6a', maxWidth:560, marginTop:8, borderTop:'1px solid rgba(255,255,255,.06)', paddingTop:8 }}>{t.tagline}</p>
                </div>
              </section>

              {/* Patient bar */}
              <PatientBar
                lang={store.language}
                age={store.patientAge} gender={store.patientGender}
                onAgeChange={v => store.setPatient(v, store.patientGender)}
                onGenderChange={v => store.setPatient(store.patientAge, v)}
              />

              {/* KVKK consent bar */}
              <div style={{ maxWidth:'100%', margin:'.6rem 0 0', padding:'0 1rem' }}>
                <div style={{ background:'#0e1419', border:'1px solid rgba(255,255,255,.15)', borderRadius:8, padding:'14px 16px', display:'flex', alignItems:'flex-start', gap:12 }}>
                  <button
                    onClick={() => {
                      const isChecked = localStorage.getItem('cobbai_kvkk')==='1';
                      if(!isChecked){ localStorage.setItem('cobbai_kvkk','1'); } else { localStorage.removeItem('cobbai_kvkk'); }
                    }}
                    id="kvkk-btn"
                    style={{ width:30, height:30, minWidth:30, border:'2px solid rgba(255,255,255,.2)', borderRadius:6, background: localStorage.getItem('cobbai_kvkk')==='1'?'#00c853':'#050a0d', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:800, color: localStorage.getItem('cobbai_kvkk')==='1'?'#000':'transparent', flexShrink:0 }}
                  >✓</button>
                  <div style={{ fontSize:14, color:'#7a8fa0', lineHeight:1.6, flex:1 }}>
                    {t.kvPre}
                    <span style={{ color:'#00c853', cursor:'pointer', textDecoration:'underline', fontWeight:600 }} onClick={() => store.setShowReport(true)}>{t.kvLink}</span>
                    {t.kvPost}
                  </div>
                </div>
              </div>

              {/* Tool grid */}
              <div style={{ maxWidth:'100%', margin:'.75rem 0 0', padding:'0 1rem', display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>

                {/* ── Upload panel ──────────────────────────────── */}
                <div style={{ background:'#0e1419', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:'1.5rem', minHeight:520, display:'flex', flexDirection:'column', transition:'border-color .2s, box-shadow .2s' }}>
                  <div style={{ fontSize:10, letterSpacing:'1.5px', color:'#7a8fa0', fontWeight:700, marginBottom:'1rem', display:'flex', alignItems:'center', gap:6 }}>
                    {store.modality==='spine' ? t.upLblS : t.upLblF}
                    <span style={{ flex:1, height:1, background:'rgba(255,255,255,.12)' }}/>
                  </div>

                  {!store.loadedImage ? (
                    <div
                      onDrop={e => { e.preventDefault(); const f=e.dataTransfer.files[0]; if(f) handleFile(f); }}
                      onDragOver={e => e.preventDefault()}
                      onClick={() => fileRef.current?.click()}
                      style={{ flex:1, border:'2px dashed rgba(255,255,255,.2)', borderRadius:10, minHeight:420, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, cursor:'pointer', padding:'1.5rem', transition:'border-color .2s' }}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor=store.modality==='spine'?'#00c853':'#2196f3';}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,.2)';}}
                    >
                      <div style={{ fontSize:26, opacity:.5 }}>{store.modality==='spine' ? t.uIcoS : t.uIcoF}</div>
                      <div style={{ fontSize:18, fontWeight:500 }}>{store.isPreprocessing ? 'İşleniyor...' : (store.modality==='spine' ? t.uTitleS : t.uTitleF)}</div>
                      <div style={{ fontSize:14, color:'#7a8fa0', textAlign:'center', lineHeight:1.5 }}>{store.modality==='spine' ? t.uHintS : t.uHintF}</div>
                      <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => { const f=e.target.files?.[0]; if(f) handleFile(f); }}/>
                    </div>
                  ) : (
                    <div style={{ position:'relative', background:'#000', borderRadius:10, overflow:'hidden', lineHeight:0 }}>
                      <img
                        ref={imgRef}
                        src={`data:${store.loadedImage.mimeType};base64,${store.loadedImage.base64}`}
                        alt="X-ray" id="main-xray-img"
                        style={{ width:'100%', display:'block', maxHeight:440, objectFit:'contain', background:'#000', filter: imgFilter }}
                      />
                      {/* Canvas overlay */}
                      {store.processedSpine && store.controls.showOverlay && (
                        <Suspense fallback={null}>
                          <CobbOverlay
                            id="overlay-canvas"
                            result={store.processedSpine}
                            naturalW={store.loadedImage.naturalWidth}
                            naturalH={store.loadedImage.naturalHeight}
                            overlayOpacity={store.controls.overlayOpacity}
                            lang={store.language}
                            style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none' }}
                          />
                        </Suspense>
                      )}
                      <button onClick={() => store.resetImage()} style={{ position:'absolute', top:8, right:8, background:'rgba(0,0,0,.75)', color:'#fff', border:'1px solid rgba(255,255,255,.25)', borderRadius:6, padding:'6px 12px', fontSize:13, cursor:'pointer' }}>
                        {t.changBtn}
                      </button>
                      {/* Quality hint */}
                      {store.qualityReport && store.qualityReport.score !== 'good' && (
                        <div style={{ position:'absolute', bottom:8, left:8, fontSize:12, padding:'4px 8px', background:'rgba(0,0,0,.8)', borderRadius:4, color: store.qualityReport.score==='poor'?'#f0a045':'#e05555' }}>
                          ⚠️ {store.qualityReport.score==='poor'?'Kalite yetersiz':'Kalite kabul edilemez'}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Legend */}
                  {showResult && (
                    <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:8, padding:'9px 13px', background:'#141c23', borderRadius:7, fontSize:12 }}>
                      {[{col:'#00c853',lbl:t.leg1},{col:'#e53935',lbl:t.leg2},
                        ...(store.modality==='foot'?[{col:'#2196f3',lbl:t.leg3},{col:'#ff9f43',lbl:t.leg4}]:[])]
                        .map((l,i)=>(
                          <span key={i} style={{ display:'flex', alignItems:'center', gap:6, color:'#7a8fa0' }}>
                            <span style={{ width:18, height:3, borderRadius:2, background:l.col, display:'inline-block' }}/>
                            {l.lbl}
                          </span>
                        ))}
                    </div>
                  )}

                  {/* Image controls */}
                  {store.loadedImage && (
                    <ImageControls
                      lang={store.language}
                      showOverlay={store.controls.showOverlay}
                      onBrightnessChange={v => store.setControls({ brightness:v })}
                      onContrastChange={v   => store.setControls({ contrast:v })}
                      onOpacityChange={v    => store.setControls({ overlayOpacity:v })}
                      onZoomIn={()  => store.setControls({ zoom: Math.min(4, store.controls.zoom+0.2) })}
                      onZoomOut={() => store.setControls({ zoom: Math.max(0.5, store.controls.zoom-0.2) })}
                      onResetZoom={() => store.setControls({ zoom:1 })}
                      onToggleOverlay={() => store.setControls({ showOverlay:!store.controls.showOverlay })}
                      onAutoEnhance={() => { /* auto-enhance is applied on upload */ }}
                      onReset={store.resetControls}
                      onExportPNG={exportPNG}
                    />
                  )}

                  {/* Analyze buttons */}
                  {store.loadedImage && !store.showCorrection && (
                    <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:'.85rem' }}>
                      {/* Main analyze button */}
                      <button
                        onClick={() => runAnalysis(false)}
                        disabled={!canAnalyze || store.isAnalyzing}
                        style={{
                          padding:'17px', fontSize:18, fontWeight:700, border:'none', borderRadius:10,
                          cursor: canAnalyze && !store.isAnalyzing ? 'pointer' : 'not-allowed',
                          fontFamily:'inherit', minHeight:54, display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                          background: store.isAnalyzing ? '#0a2a18' : canAnalyze ? '#00c853' : '#1a2e26',
                          color: store.isAnalyzing ? '#00c853' : canAnalyze ? '#000' : '#7a8fa0',
                          transition: 'all .15s',
                        }}
                      >
                        {store.isAnalyzing ? (
                          <>
                            <div style={{ width:20, height:20, border:'3px solid rgba(0,200,83,.2)', borderTopColor:'#00c853', borderRadius:'50%', animation:'_spin .75s linear infinite', flexShrink:0 }}/>
                            {t.loadTxt}
                          </>
                        ) : (store.modality==='spine' ? t.abtnS : t.abtnF)}
                      </button>
                      {/* Re-analyze button (bypasses cache) — only shown when result exists */}
                      {(store.spineResult || store.footResult) && !store.isAnalyzing && (
                        <button onClick={() => runAnalysis(true)}
                          style={{ padding:'8px', background:'transparent', border:'1px solid rgba(255,255,255,.12)', borderRadius:8, color:'#7a8fa0', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
                          🔄 {store.language==='tr'?'AI ile Yeniden Analiz Et':store.language==='ar'?'إعادة التحليل':'Re-analyze with AI'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Result panel ──────────────────────────────── */}
                <div style={{ background:'#0e1419', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:'1.5rem', minHeight:520, display:'flex', flexDirection:'column' }}>
                  <div style={{ fontSize:10, letterSpacing:'1.5px', color:'#7a8fa0', fontWeight:700, marginBottom:'1rem', display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
                    <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                      {t.resLbl}
                      <span style={{ flex:1, height:1, background:'rgba(255,255,255,.12)', display:'inline-block', width:40 }}/>
                    </span>
                    {showResult && (
                      <div style={{ display:'flex', gap:5 }}>
                        <IcoBtn title="PDF Rapor" onClick={() => store.setShowReport(true)}>📋</IcoBtn>
                        <IcoBtn title="Geçmiş" onClick={() => store.setShowHistory(!store.showHistory)}>🕐</IcoBtn>
                        <IcoBtn title="Karşılaştır" onClick={() => store.setShowComparison(!store.showComparison)}>🔄</IcoBtn>
                        {hasSpine && <IcoBtn title="Endplate Düzenle" onClick={() => store.setShowCorrection(true)}>✏️</IcoBtn>}
                      </div>
                    )}
                  </div>

                  {store.isAnalyzing && <Spinner label={t.loadTxt} />}

                  {store.analyzeError && (
                    <div style={{ padding:'1rem', background:'rgba(224,85,85,.08)', border:'1px solid rgba(224,85,85,.3)', borderRadius:8, color:'#e05555', fontSize:14, lineHeight:1.6, marginBottom:8 }}>
                      ⚠ {store.analyzeError}
                      <br/><button onClick={() => runAnalysis(true)} style={{ marginTop:12, padding:'8px 20px', background:'#00c853', color:'#000', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>🔄 {store.language==='tr'?'Tekrar Dene':'Try Again'}</button>
                    </div>
                  )}

                  {!store.isAnalyzing && !showResult && !store.analyzeError && (
                    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, color:'#4a5a6a', fontSize:14 }}>
                      <svg width="52" height="52" viewBox="0 0 52 52" fill="none" style={{ opacity:.3 }}><rect x="16" y="4" width="20" height="44" rx="3" stroke="currentColor" strokeWidth="1.5"/><line x1="26" y1="4" x2="26" y2="48" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 3"/><path d="M22 15 Q26 20 30 15" stroke="currentColor" strokeWidth="1.5" fill="none"/><path d="M19 26 Q26 33 33 26" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
                      {t.emptyMsg}
                    </div>
                  )}

                  {/* Manual correction panel — curveIndex-aware */}
                  {store.showCorrection && store.processedSpine && store.loadedImage && (
                    <Suspense fallback={<Spinner />}>
                      <ManualCorrectionPanel
                        processedResult={store.processedSpine}
                        curveIndex={selectedCurveIdx}
                        naturalW={store.loadedImage.naturalWidth}
                        naturalH={store.loadedImage.naturalHeight}
                        lang={store.language}
                        onSave={({ upper, lower, cobb }) => {
                          if (!store.spineResult) return;
                          const idx = selectedCurveIdx;
                          const updated = {
                            ...store.spineResult,
                            curves: store.spineResult.curves.map((c, i) =>
                              i === idx
                                ? { ...c, upper_line:upper, lower_line:lower, cobb_angle:cobb, manually_corrected:true, correction_timestamp: new Date().toISOString() }
                                : c  // other curves unchanged
                            ),
                          };
                          store.setSpineResult(updated, processSpineResult(updated, store.language, store.patientAge, store.patientGender, store.risserStage), store.validationOutcome);
                          store.setShowCorrection(false);
                        }}
                        onCancel={() => store.setShowCorrection(false)}
                      />
                    </Suspense>
                  )}

                  {/* Spine results */}
                  {hasSpine && !store.showCorrection && (
                    <Suspense fallback={<Spinner />}>
                      <SpineResults
                        processed={store.processedSpine!}
                        raw={store.spineResult!}
                        t={t}
                        patientAge={store.patientAge}
                        patientGender={store.patientGender}
                        risserStage={store.risserStage}
                        notes={store.doctorNotes}
                        onNotesChange={store.setDoctorNotes}
                        onEditLines={(curveIdx) => { setSelectedCurveIdx(curveIdx); store.setShowCorrection(true); }}
                      />
                    </Suspense>
                  )}

                  {/* Surgimap-Lite clinical panel — spine only, no extra API */}
                  {hasSpine && !store.showCorrection && store.processedSpine && (
                    <Suspense fallback={null}>
                      <SurgimapLitePanel
                        processed={store.processedSpine}
                        onEditCurve={(idx) => { setSelectedCurveIdx(idx); store.setShowCorrection(true); }}
                      />
                    </Suspense>
                  )}

                  {/* Foot results */}
                  {hasFoot && (
                    <Suspense fallback={<Spinner />}>
                      <FootResults result={store.footResult!} lang={store.language} />
                    </Suspense>
                  )}
                </div>
              </div>

              {/* Comparison panel */}
              {store.showComparison && (
                <div style={{ maxWidth:'100%', margin:'.75rem 0 0', padding:'0 1rem' }}>
                  <div style={{ background:'#0e1419', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:'1.25rem' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                      <h2 style={{ fontSize:18, fontWeight:700 }}>🔄 {store.language==='tr'?'Önceki X-Ray ile Karşılaştırma':store.language==='ar'?'المقارنة مع الأشعة السابقة':'Previous X-Ray Comparison'}</h2>
                      <button onClick={() => store.setShowComparison(false)} style={{ background:'none', border:'none', color:'#7a8fa0', fontSize:18, cursor:'pointer' }}>✕</button>
                    </div>
                    <Suspense fallback={<Spinner />}>
                      <ComparisonPanel
                        modality={store.modality}
                        currentSpine={store.spineResult}
                        currentFoot={store.footResult}
                        lang={store.language} t={t}
                        consentGiven={store.consentGiven}
                        patientAge={store.patientAge}
                        patientGender={store.patientGender}
                      />
                    </Suspense>
                  </div>
                </div>
              )}

              {/* Tracking panel */}
              {store.showHistory && (
                <div style={{ maxWidth:'100%', margin:'.75rem 0 0', padding:'0 1rem' }}>
                  <div style={{ background:'#0e1419', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:'1.25rem' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                      <h2 style={{ fontSize:18, fontWeight:700 }}>📈 {store.language==='tr'?'Hasta Takibi':store.language==='ar'?'متابعة المريض':'Patient Tracking'}</h2>
                      <button onClick={() => store.setShowHistory(false)} style={{ background:'none', border:'none', color:'#7a8fa0', fontSize:18, cursor:'pointer' }}>✕</button>
                    </div>
                    <Suspense fallback={<Spinner />}>
                      <TrackingPanel modality={store.modality} lang={store.language} />
                    </Suspense>
                  </div>
                </div>
              )}

              {/* Exercise links */}
              <div style={{ maxWidth:'100%', margin:'.75rem 0 0', padding:'0 1rem 2.5rem', display:'flex', gap:8, flexWrap:'wrap' }}>
                {[
                  { href:`/exercises/scoliosis-exercises.html?lang=${store.language}`, ico:'🧘', title:t.es1, sub:t.es2 },
                  { href:`/exercises/flatfoot-exercises.html?lang=${store.language}`,  ico:'👟', title:t.ef1, sub:t.ef2 },
                ].map((l,i) => (
                  <a key={i} href={l.href} target="_blank" rel="noreferrer" style={{ flex:1, minWidth:200, background:'#0e1419', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:'15px 16px', textDecoration:'none', display:'flex', alignItems:'center', gap:12, transition:'border-color .2s' }}
                    onMouseEnter={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,.3)')}
                    onMouseLeave={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,.12)')}>
                    <span style={{ fontSize:24 }}>{l.ico}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:15, fontWeight:600, color:'#eef2f7', marginBottom:2 }}>{l.title}</div>
                      <div style={{ fontSize:13, color:'#7a8fa0' }}>{l.sub}</div>
                    </div>
                    <span style={{ color:'#7a8fa0', fontSize:18 }}>→</span>
                  </a>
                ))}
              </div>

              {/* Footer + Privacy Controls */}
              <footer style={{ borderTop:'1px solid rgba(255,255,255,.08)', padding:'1.25rem 1rem', textAlign:'center' }}>
                <p style={{ fontSize:13, color:'#7a8fa0', marginBottom:8 }}>{t.footerTxt}</p>
                <div style={{ display:'flex', justifyContent:'center', gap:8, flexWrap:'wrap' }}>
                  <button onClick={() => setShowPrivacy(!showPrivacy)} style={{ padding:'4px 10px', background:'transparent', border:'1px solid rgba(255,255,255,.1)', borderRadius:20, color:'#4a5a6a', fontSize:11, cursor:'pointer' }}>
                    🔒 {store.language==='tr'?'Gizlilik':store.language==='ar'?'الخصوصية':'Privacy'}
                  </button>
                  <button onClick={() => { clearAllCache(); alert(store.language==='tr'?'AI önbelleği temizlendi.':'AI cache cleared.'); }} style={{ padding:'4px 10px', background:'transparent', border:'1px solid rgba(255,255,255,.1)', borderRadius:20, color:'#4a5a6a', fontSize:11, cursor:'pointer' }}>
                    🗑 {store.language==='tr'?'AI Önbelleğini Temizle':'Clear AI Cache'}
                  </button>
                  <button onClick={() => { clearTrackingHistory(); alert(store.language==='tr'?'Takip geçmişi silindi.':'History cleared.'); }} style={{ padding:'4px 10px', background:'transparent', border:'1px solid rgba(255,255,255,.1)', borderRadius:20, color:'#4a5a6a', fontSize:11, cursor:'pointer' }}>
                    🗑 {store.language==='tr'?'Geçmişi Sil':'Clear History'}
                  </button>
                  <button onClick={() => { if(window.confirm(store.language==='tr'?'Tüm yerel veriler silinecek. Emin misiniz?':'Delete all local data?')){ clearAllLocalData(); window.location.reload(); }}} style={{ padding:'4px 10px', background:'transparent', border:'1px solid rgba(224,85,85,.3)', borderRadius:20, color:'#e05555', fontSize:11, cursor:'pointer' }}>
                    ⚠ {store.language==='tr'?'Tüm Verileri Sil':'Delete All Data'}
                  </button>
                </div>
                {showPrivacy && (
                  <div style={{ marginTop:12, padding:'12px 16px', background:'rgba(0,200,83,.05)', border:'1px solid rgba(0,200,83,.2)', borderRadius:8, fontSize:12, color:'#7a8fa0', textAlign:'left', lineHeight:1.7 }}>
                    <strong style={{ color:'#00c853' }}>🔒 {store.language==='tr'?'Veri Gizliliği':'Data Privacy'}</strong><br/>
                    {store.language==='tr'
                      ? '• Yüklenen görüntüler sunucularımızda kalıcı olarak saklanmaz.\n• Analiz sonuçları oturum süresince (sekme kapanana kadar) tarayıcı önbelleğinde tutulur.\n• Takip geçmişi yalnızca bu cihazın yerel deposunda saklanır.\n• Görüntüler yalnızca anlık analiz için Google Gemini API\'ye iletilir.'
                      : '• Uploaded images are NOT permanently stored on our servers.\n• Analysis results are cached in your browser for this session only (cleared on tab close).\n• Tracking history is stored locally on this device only.\n• Images are transmitted to Google Gemini API solely for real-time analysis.'}
                  </div>
                )}
              </footer>
            </div>
          </>
        )}
      </div>

      {/* Report modal */}
      <Suspense fallback={null}>
        <ReportModal
          open={store.showReport}
          onClose={() => store.setShowReport(false)}
          modality={store.modality}
          spineResult={store.spineResult}
          footResult={store.footResult}
          patientAge={store.patientAge}
          patientGender={store.patientGender}
          notes={store.doctorNotes}
          t={t}
        />
      </Suspense>
    </>
  );
};

const IcoBtn: React.FC<{ title:string; onClick:()=>void; children:React.ReactNode }> = ({ title, onClick, children }) => (
  <button title={title} onClick={onClick} style={{ background:'none', border:'1px solid rgba(255,255,255,.15)', borderRadius:6, color:'#7a8fa0', padding:'3px 8px', fontSize:13, cursor:'pointer' }}>
    {children}
  </button>
);

export default App;
