/**
 * App.tsx — CobbAI v2
 * Full clinical workflow with all features from the legacy app.
 */

import React, { lazy, useEffect, useRef, useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMeasurementStore, selectCanAnalyze } from '@/store/measurementStore';
import { processSpineResult } from '@/lib/cobbCalculation';
import { safeParseSpineResult, safeParseFootResult } from '@/lib/validateAIResponse';
import { analyseImageQuality, preprocessXray, autoCropBlackBorders, normalizeExifOrientation } from '@/lib/imagePreprocessing';
import { hashBase64, getCachedResult, setCachedResult, saveTrackEntry, clearAllCache, clearTrackingHistory, clearAllLocalData } from '@/lib/imageCache';
import { getT } from '@/lib/i18n';
import { SafeSuspense } from '@/components/ErrorBoundary/ErrorBoundary';
import CobbAILogo    from '@/components/CobbAILogo';
import AILoadingScreen from '@/components/AILoadingScreen';
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
const AdvancedManualTool    = lazy(() => import('@/components/SurgimapTool/AdvancedManualTool'));
const ValidationDashboard   = lazy(() => import('@/components/ValidationDashboard/ValidationDashboard'));

// ── Eagerly-loaded small components ──────────────────────────
import { Sidebar }       from '@/components/Sidebar/Sidebar';
import { LandingScreen } from '@/components/LandingScreen/LandingScreen';
import { ConsentModal }  from '@/components/ConsentModal/ConsentModal';
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
  // ── Zustand granular selectors (Re-render optimisation) ────────
  // Problem: `useMeasurementStore()` without a selector subscribes to ALL
  // store changes and re-renders App.tsx on every state mutation — including
  // rapid changes like `isAnalyzing`, `controls.zoom`, etc.
  //
  // Fix strategy:
  //  • Frequent UI-critical booleans → individual selectors (stable refs)
  //  • Grouped theme/locale → useShallow so only language/theme changes trigger
  //  • Broad `store` kept only for rarely-changing data (patient info, results)
  //    that the JSX tree needs for conditional rendering
  const { lightMode, language } = useMeasurementStore(
    useShallow(s => ({ lightMode: s.lightMode, language: s.language }))
  );
  // These change often during analysis — separate subscriptions avoid
  // cascading re-renders through the whole component tree.
  const isAnalyzing  = useMeasurementStore(s => s.isAnalyzing);
  const isPreproc    = useMeasurementStore(s => s.isPreprocessing);
  const controls     = useMeasurementStore(useShallow(s => s.controls));

  // Explicit selector excludes `controls`, `isAnalyzing`, `isPreprocessing`
  // (already subscribed above) so rapid changes to those don't cause an
  // extra App.tsx re-render through this subscription.
  const store = useMeasurementStore(useShallow(s => ({
    analyzeError:      s.analyzeError,
    consentGiven:      s.consentGiven,
    doctorNotes:       s.doctorNotes,
    footResult:        s.footResult,
    language:          s.language,
    lightMode:         s.lightMode,
    loadedImage:       s.loadedImage,
    modality:          s.modality,
    patientAge:        s.patientAge,
    patientGender:     s.patientGender,
    processedSpine:    s.processedSpine,
    qualityReport:     s.qualityReport,
    risserStage:       s.risserStage,
    showComparison:    s.showComparison,
    showCorrection:    s.showCorrection,
    showHistory:       s.showHistory,
    showReport:        s.showReport,
    spineResult:       s.spineResult,
    validationOutcome: s.validationOutcome,
    addToHistory:      s.addToHistory,
    resetControls:     s.resetControls,
    resetImage:        s.resetImage,
    setAnalyzeError:   s.setAnalyzeError,
    setAnalyzing:      s.setAnalyzing,
    setConsent:        s.setConsent,
    setControls:       s.setControls,
    setDoctorNotes:    s.setDoctorNotes,
    setFootResult:     s.setFootResult,
    setLanguage:       s.setLanguage,
    setLoadedImage:    s.setLoadedImage,
    setModality:       s.setModality,
    setPatient:        s.setPatient,
    setPreprocessing:  s.setPreprocessing,
    setQualityReport:  s.setQualityReport,
    setShowComparison: s.setShowComparison,
    setShowCorrection: s.setShowCorrection,
    setShowHistory:    s.setShowHistory,
    setShowReport:     s.setShowReport,
    setSpineResult:    s.setSpineResult,
    toggleTheme:       s.toggleTheme,
  })));
  const canAnalyze = useMeasurementStore(selectCanAnalyze);
  const t          = getT(language);

  const fileRef         = useRef<HTMLInputElement>(null);
  const imgRef          = useRef<HTMLImageElement>(null);
  const abortRef        = useRef<AbortController | null>(null);
  const analyzingRef    = useRef(false);
  // Fix 2 (Memory Leak): keep a ref to handleFile so the global drop listener
  // can be registered ONCE (empty dep array) and always call the latest version.
  // Previously the effect depended on [handleFile] which re-registers on every
  // store update, causing listener pile-up after many renders.
  const handleFileRef   = useRef<(f: File) => void>(() => {});
  // Fix 3 (Race Condition): unique symbol per analysis run; guards catch/finally
  const analysisIdRef   = useRef<symbol | null>(null);
  // 429 retry counter — reset to 0 on each user-initiated analysis
  const retryCountRef   = useRef(0);
  const MAX_AUTO_RETRIES = 3;

  const [selectedCurveIdx, setSelectedCurveIdx]   = useState(0);
  const [showPrivacy, setShowPrivacy]             = useState(false);
  const [isManualMode, setIsManualMode]           = useState(false);
  const [manualCobb, setManualCobb]               = useState<number | null>(null);
  const [showValidation, setShowValidation]       = useState(false);
  const [analyzeBtnPressed, setAnalyzeBtnPressed] = useState(false);
  const [uiToast, setUiToast]                     = useState<string | null>(null);
  // Rate limiting (#27): 10-second client-side cooldown after each analysis.
  // Prevents rapid-fire clicking that would burn API tokens.
  const [cooldownSec, setCooldownSec] = useState(0);
  const cooldownRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  // GPT patch: KVKK React state (localStorage stays in sync)
  const [kvkkAccepted, setKvkkAccepted] = useState(() => { try { return localStorage.getItem('cobbai_kvkk') === '1'; } catch { return false; } });
  const [sidebarOpen, setSidebarOpen]   = useState(false);

  // Cleanup cooldown interval on unmount
  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  // Clear stale cache entries on mount — ensures old hash-collision results
  // (e.g. always "27.8°") are not served from a previous session.
  useEffect(() => {
    const CACHE_VERSION = 'v4'; // bump when cache format/hash changes
    try {
      if (sessionStorage.getItem('cobbai_cache_ver') !== CACHE_VERSION) {
        Object.keys(sessionStorage)
          .filter(k => k.startsWith('cobbai_cache_'))
          .forEach(k => sessionStorage.removeItem(k));
        sessionStorage.setItem('cobbai_cache_ver', CACHE_VERSION);
      }
    } catch { /* iOS Safari private browsing */ }
  }, []);

  useEffect(() => {
    document.body.classList.toggle('light-mode', lightMode);
    document.documentElement.lang = language;
    document.documentElement.dir  = language === 'ar' ? 'rtl' : 'ltr';
  }, [lightMode, language]);

  // ── File upload ──────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      const lang = useMeasurementStore.getState().language;
      store.setAnalyzeError(
        lang === 'tr' ? 'Lütfen bir görüntü dosyası yükleyin (JPEG veya PNG).' :
        lang === 'ar' ? 'يرجى تحميل ملف صورة (JPEG أو PNG).' :
        'Please upload an image file (JPEG or PNG).'
      );
      return;
    }
    store.setPreprocessing(true);

    // Fix 2 — Base64 DOM bloat: use URL.createObjectURL() instead of FileReader.
    //
    // FileReader.readAsDataURL() converts a 5 MB JPEG to a ~7 MB base64 string
    // that lives in the JS heap for the entire session. URL.createObjectURL()
    // creates a tiny reference string (≈60 chars); the actual file bytes stay
    // as a native Blob managed by the browser — no heap inflation.
    //
    // All downstream functions (normalizeExifOrientation, autoCropBlackBorders,
    // preprocessXray) accept both data: URLs and blob: URLs because they
    // ultimately call `new Image(); img.src = url` or createImageBitmap(blob).
    //
    // We revoke the blob URL in the finally block so the browser can release
    // its internal Blob store reference once processing is complete.
    const blobUrl = URL.createObjectURL(file);

    try {
      const img = new Image();
      img.src   = blobUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload  = () => resolve();
        img.onerror = () => reject(
          new Error(
            store.language === 'tr'
              ? 'Görüntü okunamadı — dosya bozuk veya desteklenmeyen format (JPEG/PNG bekleniyor).'
              : store.language === 'ar'
              ? 'تعذّر قراءة الصورة — الملف تالف أو غير مدعوم.'
              : 'Image could not be decoded — file may be corrupt or unsupported (JPEG/PNG expected).'
          )
        );
      });
      const quality = await analyseImageQuality(img);

      // EXIF correction: normalizeExifOrientation now accepts blob: URLs (modern
      // path uses createImageBitmap from a fetched same-origin Blob; legacy
      // fallback fetches first 64 KB for EXIF byte parsing).
      const exifSrc    = await normalizeExifOrientation(blobUrl);

      // autoCrop and preprocessXray both accept any img-loadable URL
      const croppedSrc = await autoCropBlackBorders(exifSrc, 15, 20);

      const { base64, mimeType, width, height } = await preprocessXray(
        croppedSrc,
        { resize: true, histogramStretch: quality.score !== 'good' }
      );

      // originalBase64 no longer stored — it was the full 7 MB raw base64 that
      // sat in the store for the entire session. The processed base64 (max 1200 px,
      // typically 100–300 KB) is all that's needed for API calls and display.
      store.setLoadedImage({ base64, originalBase64: '', mimeType, naturalWidth:width, naturalHeight:height, filename:file.name });
      store.setQualityReport(quality);
      setIsManualMode(false); setManualCobb(null);
      setSelectedCurveIdx(0);
      store.setShowCorrection(false);
      store.setShowComparison(false);
      store.setShowHistory(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      store.setAnalyzeError(
        store.language === 'tr' ? 'Görüntü işlenirken bir hata oluştu: ' + msg :
        store.language === 'ar' ? 'حدث خطأ أثناء معالجة الصورة: ' + msg :
        'An error occurred while processing the image: ' + msg
      );
    } finally {
      store.setPreprocessing(false);
      // Always revoke — releases the browser's Blob store reference
      URL.revokeObjectURL(blobUrl);
    }
  }, [store]);

  // Fix 2: Keep handleFileRef pointing to the latest handleFile closure.
  // This MUST be at component level — hooks cannot be called inside callbacks.
  // (Previously was accidentally placed inside handleFile's try block → React error #321)
  useEffect(() => { handleFileRef.current = handleFile; }, [handleFile]);

  // Global drag-drop: registered ONCE on mount (empty dep array).
  // Uses handleFileRef so it always calls the latest handleFile without
  // re-registering listeners on every render — prevents event listener pile-up.
  useEffect(() => {
    const stop = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    const onDrop = (e: DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (!e.dataTransfer?.files?.length) return;          // DOM drag, not a file
      if (useMeasurementStore.getState().loadedImage) return; // image already loaded
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) handleFileRef.current(file);
    };
    window.addEventListener('dragover', stop);
    window.addEventListener('drop',     onDrop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop',     onDrop);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally empty

  // ── Analysis with caching + debounce ─────────────────────────
  const runAnalysis = useCallback(async (forceRefresh = false, _isAutoRetry = false) => {
    if (!canAnalyze || !store.loadedImage) return;
    if (analyzingRef.current) return;  // debounce
    analyzingRef.current = true;

    // Reset retry counter on user-initiated (non-auto-retry) calls
    if (!_isAutoRetry) retryCountRef.current = 0;

    // Fix 3 (Race Condition): unique token for this analysis run.
    // If the user loads a new image and triggers a 2nd analysis before the 1st
    // finishes, analysisIdRef is updated to the new token. The old analysis's
    // catch/finally blocks check their token against the ref and bail out if
    // they're no longer the "active" run — preventing them from calling
    // setAnalyzing(false) or setAnalyzeError() over the new analysis's state.
    const analysisId = Symbol('analysis');
    analysisIdRef.current = analysisId;

    store.setAnalyzing(true); store.setAnalyzeError(null);

    // Abort previous request if still pending
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const ep = store.modality === 'spine' ? '/api/analyze-spine' : '/api/analyze-foot';

    try {
      // ── Check cache first ──────────────────────────────────
      // Fix 2: pass patientAge + patientGender to cache key so that changing
      // demographics after upload correctly re-triggers the API call instead of
      // returning the stale cached result that used the old demographics.
      if (!forceRefresh) {
        const hash = await hashBase64(store.loadedImage.base64);
        const cached = getCachedResult<SpineAnalysisResult>(
          hash, store.modality, store.language,
          store.patientAge, store.patientGender
        );
        if (cached) {
          if (store.modality === 'spine') {
            const parsed = safeParseSpineResult(cached);
            if (parsed) {
              if (analysisIdRef.current !== analysisId) return; // race guard
              store.setSpineResult(parsed.result, processSpineResult(parsed.result, store.language, store.patientAge, store.patientGender, store.risserStage), parsed.outcome);
              store.setAnalyzing(false); analyzingRef.current = false;
              return;
            }
          } else if (store.modality === 'foot') {
            // Previously missing: foot results were cached but never read back
            const foot = safeParseFootResult(cached);
            if (foot) {
              if (analysisIdRef.current !== analysisId) return; // race guard
              store.setFootResult(foot);
              store.setAnalyzing(false); analyzingRef.current = false;
              return;
            }
          }
        }
      }

      // ── Call API ───────────────────────────────────────────
      // FIX: timer must stay active until the body is fully read, not just until
      // headers arrive. A server can send headers immediately but delay the body
      // (streaming / chunked response), leaving the app hung indefinitely.
      // clearTimeout is now called AFTER resp.text() resolves.
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
      // Guard: sunucu bazen JSON değil düz metin döndürebilir (502, 504, cold-start hataları)
      let rawJson: unknown;
      const rawText = await resp.text();
      clearTimeout(timer); // cleared AFTER body read — covers streaming body hangs
      try {
        rawJson = JSON.parse(rawText);
      } catch {
        const preview = rawText.slice(0, 120).replace(/\n/g, ' ');
        store.setAnalyzeError(
          store.language === 'tr'
            ? (resp.ok ? `Sunucu geçersiz yanıt döndürdü: ${preview}` : `Sunucu hatası (${resp.status}): ${preview}`)
            : store.language === 'ar'
            ? (resp.ok ? `استجابة غير صالحة من الخادم: ${preview}` : `خطأ في الخادم (${resp.status}): ${preview}`)
            : (resp.ok ? `Invalid server response: ${preview}` : `Server error (${resp.status}): ${preview}`)
        );
        return;
      }
      if (!resp.ok) {
        const errData = rawJson as { error?: string; retryAfter?: number };
        if (resp.status === 429) {
          const wait = errData.retryAfter ?? 5;
          retryCountRef.current += 1;
          if (retryCountRef.current > MAX_AUTO_RETRIES) {
            store.setAnalyzeError(
              store.language === 'tr'
                ? `Sunucu aşırı yoğun. Lütfen birkaç dakika bekleyip tekrar deneyin.`
                : store.language === 'ar'
                ? `الخادم مرهق. انتظر بضع دقائق وحاول مجدداً.`
                : `Server is overloaded. Please wait a few minutes and try again.`
            );
            return;
          }
          // Auto-retry: show countdown, release debounce, then automatically re-trigger.
          store.setAnalyzeError(
            store.language === 'tr'
              ? `⏳ Sunucu yoğun. ${wait} saniye içinde otomatik tekrar deneniyor… (${retryCountRef.current}/${MAX_AUTO_RETRIES})`
              : store.language === 'ar'
              ? `⏳ الخادم مشغول. إعادة المحاولة خلال ${wait} ثوانٍ… (${retryCountRef.current}/${MAX_AUTO_RETRIES})`
              : `⏳ Server busy. Auto-retrying in ${wait} seconds… (${retryCountRef.current}/${MAX_AUTO_RETRIES})`
          );
          setTimeout(() => {
            if (analysisIdRef.current === analysisId) {
              analyzingRef.current = false;
              store.setAnalyzeError(null);
              runAnalysis(forceRefresh, true);
            }
          }, wait * 1000);
          return;
        }
        store.setAnalyzeError(errData.error ?? (
          store.language === 'tr' ? `Sunucu hatası: ${resp.status}` :
          store.language === 'ar' ? `خطأ في الخادم: ${resp.status}` :
          `Server error: ${resp.status}`
        ));
        return;
      }

      // Race condition guard: if a newer analysis started while we were waiting
      // for the API response, discard this result instead of overwriting fresh state.
      if (analysisIdRef.current !== analysisId) return;

      if (store.modality === 'spine') {
        const parsed = safeParseSpineResult(rawJson);
        if (!parsed) {
          store.setAnalyzeError(
            store.language === 'tr' ? 'AI yanıtı geçersiz koordinatlar içeriyor. Lütfen tekrar deneyin.' :
            store.language === 'ar' ? 'استجابة الذكاء الاصطناعي تحتوي على إحداثيات غير صالحة. يرجى المحاولة مرة أخرى.' :
            'AI response contains invalid coordinates. Please try again.'
          );
          return;
        }
        try {
          const hash = await hashBase64(store.loadedImage.base64);
          setCachedResult(hash, store.modality, store.language, parsed.result,
                          store.patientAge, store.patientGender);
        } catch (qe) {
          console.warn('[CobbAI] localStorage quota exceeded — result not cached', qe);
        }
        store.setSpineResult(
          parsed.result,
          processSpineResult(parsed.result, store.language, store.patientAge, store.patientGender, store.risserStage),
          parsed.outcome
        );
        store.addToHistory({ id: Date.now().toString(), timestamp: new Date().toISOString(), modality:'spine', result: parsed.result, patientAge: store.patientAge, patientGender: store.patientGender });
        // Save to persistent tracking history
        const primaryCobb = parsed.result.curves?.[0]?.cobb_angle;
        if (primaryCobb != null) {
          saveTrackEntry('spine', { date: new Date().toISOString(), cobb: primaryCobb, source: 'ai', ts: Date.now() });
        }
      } else {
        const foot = safeParseFootResult(rawJson);
        if (!foot) {
          store.setAnalyzeError(
          store.language === 'tr' ? 'Ayak analizi sonucu geçersiz. Lütfen tekrar deneyin.' :
          store.language === 'ar' ? 'نتيجة تحليل القدم غير صالحة. يرجى المحاولة مرة أخرى.' :
          'Foot analysis result is invalid. Please try again.'
        );
          return;
        }
        try {
          const hash = await hashBase64(store.loadedImage.base64);
          setCachedResult(hash, store.modality, store.language, foot,
                          store.patientAge, store.patientGender);
        } catch (qe) {
          console.warn('[CobbAI] localStorage quota exceeded — foot result not cached', qe);
        }
        store.setFootResult(foot);
        // Save to persistent tracking history
        if (foot.meary_angle != null) {
          saveTrackEntry('foot', { date: new Date().toISOString(), meary: foot.meary_angle, source: 'ai', ts: Date.now() });
        }
      }
    } catch(e) {
      const err = e as Error;
      // Fix 3 guard: skip if a newer analysis has taken over
      if (analysisIdRef.current !== analysisId) return;
      if (err.name !== 'AbortError') {
        store.setAnalyzeError(err.message || (
        store.language === 'tr' ? 'Bağlantı zaman aşımına uğradı. Lütfen tekrar deneyin.' :
        store.language === 'ar' ? 'انتهت مهلة الاتصال. يرجى المحاولة مرة أخرى.' :
        'Connection timed out. Please try again.'
      ));
      }
    } finally {
      // Fix 3 guard: only reset UI state if THIS run is still the active one
      if (analysisIdRef.current === analysisId) {
        store.setAnalyzing(false);
        analyzingRef.current = false;
      }
    }
  }, [canAnalyze, store]);

  // ── Analyze button wrapper — press feedback + rate limiting ──
  const COOLDOWN_SECS = 10;
  const handleAnalyzeClick = useCallback(async (force = false) => {
    if (isAnalyzing || cooldownSec > 0) return;
    setAnalyzeBtnPressed(true);
    const pressTimer = setTimeout(() => setAnalyzeBtnPressed(false), 800);
    await runAnalysis(force);
    clearTimeout(pressTimer);
    setAnalyzeBtnPressed(false);
    // Start cooldown so the user can't spam the API
    setCooldownSec(COOLDOWN_SECS);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldownSec(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current!); cooldownRef.current = null; return 0; }
        return prev - 1;
      });
    }, 1000);
  }, [isAnalyzing, cooldownSec, runAnalysis]);

  // ── Canvas overlay export — HATA 2 FIX ────────────────────────
  // Problem: overlay canvas uses CSS object-fit:contain scaling.
  // Drawing it at naturalWidth×naturalHeight causes misaligned lines.
  // Fix: scale the overlay proportionally so lines land on the correct bones.
  const exportPNG = useCallback(() => {
    const img = imgRef.current;
    if (!img?.src || img.src === window.location.href) return;

    const natW = img.naturalWidth  || img.offsetWidth;
    const natH = img.naturalHeight || img.offsetHeight;

    const cvs = document.createElement('canvas');
    cvs.width  = natW;
    cvs.height = natH;
    const ctx = cvs.getContext('2d')!;
    ctx.drawImage(img, 0, 0, natW, natH);

    // HATA 2: Scale overlay from its CSS-rendered size to natural image size
    const overlay = document.querySelector('#overlay-canvas') as HTMLCanvasElement | null;
    if (overlay && controls.showOverlay && overlay.width > 0 && overlay.height > 0) {
      // overlay.width/height = CSS-rendered px via ResizeObserver
      // We need to draw it scaled to fill natW×natH
      ctx.drawImage(overlay, 0, 0, overlay.width, overlay.height, 0, 0, natW, natH);
    }

    // Branding strip
    const stripH = Math.round(natH * 0.05);
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(0, natH - stripH, natW, stripH);
    ctx.fillStyle = '#00c853';
    ctx.font = `bold ${Math.round(stripH * 0.38)}px monospace`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const cobb = store.spineResult?.curves?.[0]?.cobb_angle;
    ctx.fillText(
      `  ⚕ CobbAI${cobb != null && isFinite(cobb) ? ' | Cobb: ' + cobb + '°' : ''} | ${new Date().toLocaleDateString('tr-TR')} | cobbai.vercel.app`,
      0, natH - stripH / 2
    );

    // HATA 4 FIX: toDataURL() throws SecurityError if canvas is tainted by
    // cross-origin image (dragged from another browser tab).
    let dataUrl: string;
    try {
      dataUrl = cvs.toDataURL('image/png');
    } catch (e) {
      store.setAnalyzeError(
        store.language === 'tr'
          ? '⚠️ Bu görüntü güvenlik politikaları nedeniyle dışa aktarılamıyor. Görüntüyü önce bilgisayarınıza indirip yükleyin.'
          : store.language === 'ar'
          ? '⚠️ لا يمكن تصدير هذه الصورة لأسباب أمنية. يرجى تنزيل الصورة أولاً ثم تحميلها.'
          : '⚠️ This image cannot be exported due to security policies. Please download the image first, then upload it.'
      );
      return;
    }
    const a = document.createElement('a');
    a.download = 'cobbai-' + new Date().toISOString().slice(0, 10) + '.png';
    a.href = dataUrl;
    a.click();
  }, [store, controls]);

  // ── Image filter string — uses granular `controls` selector ──
  const imgFilter = `brightness(${100 + controls.brightness}%) contrast(${controls.contrast}%)`;

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
          onDoctor={() => { store.setConsent(true); try { sessionStorage.setItem('cobbai_role','doctor'); } catch { /* ITP */ } }}
          onPatient={() => { window.location.href = '/patients.html'; }}
        />
      )}

      {/* Toast notification — auto-dismiss after 2 s */}
      {uiToast && (
        <div style={{
          position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)',
          zIndex:99999, background:'#0f2518', border:'1px solid #00c853',
          borderRadius:10, padding:'10px 22px', fontSize:14, fontWeight:600,
          color:'#00c853', boxShadow:'0 8px 32px rgba(0,0,0,.5)',
          animation:'_fadeIn .2s ease', whiteSpace:'nowrap',
          pointerEvents:'none',
        }}>
          {uiToast}
        </div>
      )}
      <style>{`@keyframes _fadeIn{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%)}}`}</style>

      {/* KVKK consent modal — opens when user clicks the privacy link */}
      <ConsentModal
        open={showPrivacy}
        lang={store.language}
        onAccept={() => {
          setKvkkAccepted(true);
          try { localStorage.setItem('cobbai_kvkk', '1'); } catch { /* quota */ }
          setShowPrivacy(false);
        }}
        onClose={() => setShowPrivacy(false)}
      />

      {/* Main layout */}
      {/* minHeight fallback: 100vh for old browsers, 100dvh for iOS Safari
          (dvh = Dynamic Viewport Height, accounts for collapsible URL bar) */}
      <div style={{ minHeight:'100dvh', background:'var(--c-bg)' }}>

        {/* ── Nav ─────────────────────────────────────────────── */}
        <nav style={{ background:'#0a0f13', borderBottom:'1px solid rgba(255,255,255,.1)', padding:'0 .75rem', height:60, display:'flex', alignItems:'center', gap:8, position:'sticky', top:0, zIndex:100, backdropFilter:'blur(8px)' }}>
          {/* Hamburger — only visible on mobile via CSS */}
          {store.consentGiven && (
            <button
              className="cobb-hamburger"
              onClick={() => setSidebarOpen(o => !o)}
              aria-label="Menü"
              style={{ width:36, height:36, border:'1px solid rgba(255,255,255,.15)', borderRadius:8, background:'transparent', color:'#7a8fa0', fontSize:20, cursor:'pointer', flexShrink:0, alignItems:'center', justifyContent:'center' }}
            >☰</button>
          )}
          <CobbAILogo width={30} height={30} />
          <span style={{ fontSize:17, fontWeight:800 }}>CobbAI</span>
          <span className="cobb-aichip" style={{ fontSize:11, padding:'2px 8px', background:'rgba(0,200,83,.1)', border:'1px solid rgba(0,200,83,.25)', borderRadius:20, color:'#00c853' }}>{t.aiChip}</span>
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:4 }}>
            {(['tr','en','ar'] as const).map(l => (
              <button key={l} onClick={() => store.setLanguage(l)} style={{ padding:'4px 9px', border: store.language===l ? '2px solid #00c853' : '2px solid rgba(255,255,255,.15)', borderRadius:20, background:'transparent', color: store.language===l ? '#00c853' : '#7a8fa0', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                {l.toUpperCase()}
              </button>
            ))}
            <button onClick={store.toggleTheme} style={{ width:32, height:32, border:'1px solid rgba(255,255,255,.15)', borderRadius:8, background:'transparent', color:'#7a8fa0', fontSize:15, cursor:'pointer' }}>
              {store.lightMode ? '☀️' : '🌙'}
            </button>
          </div>
        </nav>

        {store.consentGiven && (
          <>
            {/* ── Sidebar (desktop: always visible · mobile: hamburger drawer) ── */}
            <Sidebar
              modality={store.modality}
              lang={store.language}
              labels={sidebarLabels}
              exLang={store.language}
              onSwitchModality={m => { store.setModality(m); }}
              open={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
            />

            {/* ── Mobile modality tab bar — hidden on desktop via CSS ── */}
            <div className="cobb-mobile-tabs" style={{ gap:8, padding:'8px 12px', background:'#090e12', borderBottom:'1px solid rgba(255,255,255,.08)', position:'sticky', top:60, zIndex:49 }}>
              {(['spine','foot'] as const).map(m => {
                const active = store.modality === m;
                const col = m === 'spine' ? '#00c853' : '#2196f3';
                return (
                  <button key={m} onClick={() => store.setModality(m)} style={{
                    flex:1, padding:'9px 8px', border:`1px solid ${active ? col : 'rgba(255,255,255,.12)'}`,
                    borderRadius:8, background: active ? `${col}18` : 'transparent',
                    color: active ? col : '#7a8fa0', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                  }}>
                    {m === 'spine' ? `🦴 ${sidebarLabels.dn1}` : `🦶 ${sidebarLabels.dn2}`}
                  </button>
                );
              })}
            </div>

            {/* ── Page content ──────────────────────────────────── */}
            {/* cobb-content class: margin-inline-start 210px desktop, 0 mobile via CSS */}
            <div className="cobb-content" style={{ minWidth:0 }}>

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
                  {/* GPT patch: KVKK checkbox — React state (not raw localStorage read in render) */}
                  <button
                    onClick={() => {
                      const next = !kvkkAccepted;
                      setKvkkAccepted(next);
                      try {
                        if (next) localStorage.setItem('cobbai_kvkk', '1');
                        else      localStorage.removeItem('cobbai_kvkk');
                      } catch { /* quota */ }
                    }}
                    id="kvkk-btn"
                    style={{ width:30, height:30, minWidth:30, border:'2px solid rgba(255,255,255,.2)', borderRadius:6,
                      background: kvkkAccepted ? '#00c853' : '#050a0d', cursor:'pointer',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:18, fontWeight:800,
                      color: kvkkAccepted ? '#000' : 'transparent', flexShrink:0 }}
                  >✓</button>
                  <div style={{ fontSize:14, color:'#7a8fa0', lineHeight:1.6, flex:1 }}>
                    {t.kvPre}
                    {/* GPT patch: KVKK link opens privacy/KVKK modal correctly */}
                    <span style={{ color:'#00c853', cursor:'pointer', textDecoration:'underline', fontWeight:600 }}
                      onClick={() => setShowPrivacy(true)}>{t.kvLink}</span>
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
                      <div style={{ fontSize:18, fontWeight:500 }}>{isPreproc ? 'İşleniyor...' : (store.modality==='spine' ? t.uTitleS : t.uTitleF)}</div>
                      <div style={{ fontSize:14, color:'#7a8fa0', textAlign:'center', lineHeight:1.5 }}>{store.modality==='spine' ? t.uHintS : t.uHintF}</div>
                      <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => { const f=e.target.files?.[0]; if(f) handleFile(f); }}/>
                    </div>
                  ) : (
                    /* Image viewer — constrained height so tall portrait X-rays don't dominate */
                    <div style={{ position:'relative', background:'#0a0e12', borderRadius:10, overflow:'auto', lineHeight:0, maxHeight:'min(540px,62vh)' }}>
                      {/* AI Loading overlay — shown while analyzing */}
                      {isAnalyzing && <AILoadingScreen lang={store.language} modality={store.modality} />}

                      {/* ── Manual mode toggle button ── */}
                      <button
                        onClick={() => { setIsManualMode(m => !m); setManualCobb(null); }}
                        title={isManualMode ? (store.language==='tr'?'Normal moda dön':'Back to AI view') : (store.language==='tr'?'Manuel Cobb ölçümü (API yok)':'Manual Cobb tool (zero API)')}
                        style={{ position:'absolute', top:8, left:8, zIndex:10, background: isManualMode ? 'rgba(0,200,83,.25)' : 'rgba(0,0,0,.75)', color: isManualMode ? '#00c853' : '#fff', border: `1px solid ${isManualMode ? '#00c853' : 'rgba(255,255,255,.25)'}`, borderRadius:6, padding:'5px 10px', fontSize:12, cursor:'pointer', fontWeight:700 }}>
                        ✏️ {isManualMode ? 'Manual ON' : 'Manual'}
                      </button>

                      {/* ── Manual Cobb result badge ── */}
                      {isManualMode && manualCobb !== null && (
                        <div style={{ position:'absolute', top:8, left:110, zIndex:10, background:'rgba(0,0,0,.85)', border:'1px solid #00c853', borderRadius:6, padding:'5px 12px', fontSize:14, fontWeight:800, color:'#00c853' }}>
                          Manual Cobb: {manualCobb}°
                        </div>
                      )}

                      {/* ── AdvancedManualTool (zero-API) ── */}
                      {isManualMode ? (
                        <div style={{ width:'100%', height:480 }}>
                          <SafeSuspense fallback={<Spinner label="Yükleniyor..." />}>
                            <AdvancedManualTool
                              imageSrc={`data:${store.loadedImage.mimeType};base64,${store.loadedImage.base64}`}
                              naturalW={store.loadedImage.naturalWidth}
                              naturalH={store.loadedImage.naturalHeight}
                              lang={store.language}
                              brightness={controls.brightness}
                              contrast={controls.contrast}
                              onCobbMeasured={(cobb) => setManualCobb(cobb)}
                              onClose={() => setIsManualMode(false)}
                            />
                          </SafeSuspense>
                        </div>
                      ) : (
                        /* Zoom wrapper — width% changes zoom level; no minWidth so zoom-out works */
                        <div style={{
                          position:'relative',
                          width: `${controls.zoom * 100}%`,
                          margin:'0 auto',
                          transition:'width .18s ease',
                          lineHeight:0,
                        }}>
                          <img
                            ref={imgRef}
                            src={`data:${store.loadedImage.mimeType};base64,${store.loadedImage.base64}`}
                            alt="X-ray" id="main-xray-img"
                            draggable={false}
                            style={{ width:'100%', display:'block', background:'#111', filter: imgFilter, opacity: isAnalyzing ? 0.3 : 1, transition: 'opacity .2s', userSelect:'none' }}
                          />
                          {/* Canvas overlay — always same size as img wrapper → always aligned */}
                          {store.processedSpine && controls.showOverlay && (
                            <SafeSuspense fallback={null}>
                              <CobbOverlay
                                id="overlay-canvas"
                                result={store.processedSpine}
                                naturalW={store.loadedImage.naturalWidth}
                                naturalH={store.loadedImage.naturalHeight}
                                overlayOpacity={controls.overlayOpacity}
                                lang={store.language}
                                showVertebraLabels={controls.showVertebraLabels}
                                showApexLabel={controls.showApexLabel}
                                style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none' }}
                              />
                            </SafeSuspense>
                          )}
                          {/* Zoom indicator */}
                          {controls.zoom !== 1 && (
                            <div style={{ position:'absolute', bottom:8, right:8, fontSize:12, padding:'4px 8px', background:'rgba(0,0,0,.82)', border:'1px solid rgba(255,255,255,.22)', borderRadius:4, color:'#00c853', zIndex:9 }}>
                              🔍 {Math.round(controls.zoom * 100)}%
                            </div>
                          )}
                        </div>
                      )}

                      <button
                        onClick={() => {
                          const msg = store.language === 'tr' ? 'Görüntüyü değiştirmek istiyor musunuz? Ölçüm sonuçları silinecek.' :
                                      store.language === 'ar' ? 'هل تريد تغيير الصورة؟ ستُحذف نتائج القياس.' :
                                      'Replace image? Measurement results will be cleared.';
                          if (!store.spineResult && !store.footResult) { store.resetImage(); return; }
                          if (window.confirm(msg)) store.resetImage();
                        }}
                        style={{ position:'absolute', top:8, right:8, background:'rgba(0,0,0,.75)', color:'#fff', border:'1px solid rgba(255,255,255,.25)', borderRadius:6, padding:'6px 12px', fontSize:13, cursor:'pointer' }}>
                        {t.changBtn}
                      </button>
                      {/* Quality hint */}
                      {store.qualityReport && store.qualityReport.score !== 'good' && (
                        <div style={{ position:'absolute', bottom:8, left:8, fontSize:12, padding:'4px 8px', background:'rgba(0,0,0,.8)', borderRadius:4, color: store.qualityReport.score==='poor'?'#f0a045':'#e05555' }}>
                          ⚠️ {store.qualityReport.score==='poor'
                            ? (store.language==='ar' ? 'جودة منخفضة' : store.language==='en' ? 'Poor quality' : 'Kalite yetersiz')
                            : (store.language==='ar' ? 'جودة غير مقبولة' : store.language==='en' ? 'Unacceptable quality' : 'Kalite kabul edilemez')}
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
                      showOverlay={controls.showOverlay}
                      // Fix #2: Pass controlled values so sliders sync with store
                      brightnessValue={controls.brightness}
                      contrastValue={controls.contrast}
                      opacityValue={controls.overlayOpacity}
                      zoomValue={controls.zoom}
                      onBrightnessChange={v => store.setControls({ brightness:v })}
                      onContrastChange={v   => store.setControls({ contrast:v })}
                      onOpacityChange={v    => store.setControls({ overlayOpacity:v })}
                      onZoomIn={()  => store.setControls({ zoom: Math.min(4, controls.zoom+0.2) })}
                      onZoomOut={() => store.setControls({ zoom: Math.max(0.5, controls.zoom-0.2) })}
                      onResetZoom={() => store.setControls({ zoom:1 })}
                      onToggleOverlay={() => store.setControls({ showOverlay:!controls.showOverlay })}
                      onToggleVertebraLabels={() => store.setControls({ showVertebraLabels:!controls.showVertebraLabels })}
                      onToggleApexLabel={() => store.setControls({ showApexLabel:!controls.showApexLabel })}
                      showVertebraLabels={controls.showVertebraLabels}
                      showApexLabel={controls.showApexLabel}
                      // Fix #1: Real auto-enhance based on qualityReport + toast notification
                      onAutoEnhance={() => {
                        const q = store.qualityReport;
                        const lowContrast = !q || q.contrastRatio < 0.18
                          || q.issues.some(i => i.toLowerCase().includes('contrast'));
                        const dark = q ? q.meanLuminance < 95 : false;
                        store.setControls({
                          brightness: dark ? 18 : 6,
                          contrast:   lowContrast ? 145 : 125,
                        });
                        const msg = store.language === 'tr'
                          ? `✨ Oto geliştirme uygulandı (parlaklık ${dark?18:6}, kontrast ${lowContrast?145:125}%)`
                          : store.language === 'ar'
                          ? `✨ تم تطبيق التحسين التلقائي (سطوع ${dark?18:6}, تباين ${lowContrast?145:125}%)`
                          : `✨ Auto enhancement applied (brightness ${dark?18:6}, contrast ${lowContrast?145:125}%)`;
                        setUiToast(msg);
                        setTimeout(() => setUiToast(null), 2000);
                      }}
                      onReset={store.resetControls}
                      onExportPNG={exportPNG}
                    />
                  )}

                  {/* Analyze buttons */}
                  {store.loadedImage && !store.showCorrection && (
                    <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:'.85rem' }}>
                      {/* Main analyze button — Fix #8: aria-busy + microcopy + shimmer */}
                      {/* KVKK gate warning */}
                      {!kvkkAccepted && (
                        <div style={{ padding:'8px 12px', background:'rgba(240,160,69,.08)', border:'1px solid rgba(240,160,69,.3)', borderRadius:8, color:'#f0a045', fontSize:13, marginBottom:4 }}>
                          ⚠️ {store.language==='tr' ? 'Analiz için KVKK/onam kutusunu işaretleyin.' : store.language==='ar' ? 'يرجى قبول الموافقة لبدء التحليل.' : 'Please accept the consent checkbox to start analysis.'}
                        </div>
                      )}
                      <button
                        onClick={() => handleAnalyzeClick(false)}
                        disabled={!canAnalyze || isAnalyzing || !kvkkAccepted || cooldownSec > 0}
                        aria-busy={isAnalyzing}
                        aria-label={isAnalyzing ? t.loadTxt : undefined}
                        style={{
                          padding:'17px', fontSize:18, fontWeight:700, border:'none', borderRadius:10,
                          cursor: canAnalyze && !isAnalyzing && kvkkAccepted && cooldownSec === 0 ? 'pointer' : 'not-allowed',
                          fontFamily:'inherit', minHeight:54, display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                          background: isAnalyzing ? '#0a2a18' : cooldownSec > 0 ? '#1a2414' : (canAnalyze && kvkkAccepted) ? '#00c853' : '#1a2e26',
                          color: isAnalyzing ? '#00c853' : cooldownSec > 0 ? '#4a7a4a' : (canAnalyze && kvkkAccepted) ? '#000' : '#7a8fa0',
                          transition: 'all .12s',
                          transform: analyzeBtnPressed && !isAnalyzing ? 'scale(0.96) translateY(2px)' : 'none',
                          boxShadow: isAnalyzing
                            ? '0 0 0 4px rgba(0,200,83,.12), 0 0 24px rgba(0,200,83,.18)'
                            : analyzeBtnPressed ? '0 2px 8px rgba(0,200,83,.12)' : (canAnalyze && kvkkAccepted && cooldownSec === 0) ? '0 8px 22px rgba(0,200,83,.18)' : 'none',
                          position: 'relative', overflow: 'hidden',
                        }}
                      >
                        {/* Shimmer strip during analysis */}
                        {isAnalyzing && (
                          <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg,transparent,rgba(0,200,83,.12),transparent)', backgroundSize:'200% 100%', animation:'_shimmer 1.4s ease infinite' }} />
                        )}
                        <style>{`@keyframes _shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
                        {isAnalyzing ? (
<>
                            <div style={{ width:20, height:20, border:'3px solid rgba(0,200,83,.2)', borderTopColor:'#00c853', borderRadius:'50%', animation:'_spin .75s linear infinite', flexShrink:0 }}/>
                            {store.language==='tr'?'Görüntü AI ile analiz ediliyor…':store.language==='ar'?'جارٍ التحليل…':'Analyzing with AI…'}
                          </>
                        ) : cooldownSec > 0
                          ? `⏳ ${cooldownSec}s`
                          : (store.modality==='spine' ? t.abtnS : t.abtnF)}
                      </button>
                      {/* Re-analyze button (bypasses cache) — only shown when result exists */}
                      {(store.spineResult || store.footResult) && !isAnalyzing && cooldownSec === 0 && (
                        <button onClick={() => handleAnalyzeClick(true)}
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
                        <IcoBtn title="Validation Dashboard" onClick={() => setShowValidation(v => !v)}>📊</IcoBtn>
                        <IcoBtn title="Karşılaştır" onClick={() => store.setShowComparison(!store.showComparison)}>🔄</IcoBtn>
                        {hasSpine && <IcoBtn title="Endplate Düzenle" onClick={() => store.setShowCorrection(true)}>✏️</IcoBtn>}
                      </div>
                    )}
                  </div>

                  {isAnalyzing && <Spinner label={t.loadTxt} />}

                  {store.analyzeError && (
                    <div style={{ padding:'1rem', background:'rgba(224,85,85,.08)', border:'1px solid rgba(224,85,85,.3)', borderRadius:8, color:'#e05555', fontSize:14, lineHeight:1.6, marginBottom:8 }}>
                      ⚠ {store.analyzeError}
                      <br/><button onClick={() => runAnalysis(true)} style={{ marginTop:12, padding:'8px 20px', background:'#00c853', color:'#000', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>🔄 {store.language==='tr'?'Tekrar Dene':store.language==='ar'?'حاول مجدداً':'Try Again'}</button>
                    </div>
                  )}

                  {!isAnalyzing && !showResult && !store.analyzeError && (
                    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, color:'#4a5a6a', fontSize:14 }}>
                      <svg width="52" height="52" viewBox="0 0 52 52" fill="none" style={{ opacity:.3 }}><rect x="16" y="4" width="20" height="44" rx="3" stroke="currentColor" strokeWidth="1.5"/><line x1="26" y1="4" x2="26" y2="48" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 3"/><path d="M22 15 Q26 20 30 15" stroke="currentColor" strokeWidth="1.5" fill="none"/><path d="M19 26 Q26 33 33 26" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
                      {t.emptyMsg}
                    </div>
                  )}

                  {/* Manual correction panel — curveIndex-aware */}
                  {store.showCorrection && store.processedSpine && store.loadedImage && (
                    <SafeSuspense fallback={<Spinner />}>
                      <ManualCorrectionPanel
                        processedResult={store.processedSpine}
                        curveIndex={selectedCurveIdx}
                        naturalW={store.loadedImage.naturalWidth}
                        naturalH={store.loadedImage.naturalHeight}
                        imageSrc={`data:${store.loadedImage.mimeType};base64,${store.loadedImage.base64}`}
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
                    </SafeSuspense>
                  )}

                  {/* Spine results */}
                  {hasSpine && !store.showCorrection && (
                    <SafeSuspense fallback={<Spinner />}>
                      <SpineResults
                        processed={store.processedSpine!}
                        raw={store.spineResult!}
                        lang={store.language}
                        t={t}
                        patientAge={store.patientAge}
                        patientGender={store.patientGender}
                        risserStage={store.risserStage}
                        notes={store.doctorNotes}
                        onNotesChange={store.setDoctorNotes}
                        onEditLines={(curveIdx) => { setSelectedCurveIdx(curveIdx); store.setShowCorrection(true); }}
                      />
                    </SafeSuspense>
                  )}

                  {/* Surgimap-Lite clinical panel — spine only, no extra API */}
                  {hasSpine && !store.showCorrection && store.processedSpine && (
                    <SafeSuspense fallback={null}>
                      <SurgimapLitePanel
                        processed={store.processedSpine}
                        lang={store.language}
                        onEditCurve={(idx) => { setSelectedCurveIdx(idx); store.setShowCorrection(true); }}
                      />
                    </SafeSuspense>
                  )}

                  {/* Foot results */}
                  {hasFoot && (
                    <SafeSuspense fallback={<Spinner />}>
                      <FootResults result={store.footResult!} lang={store.language} />
                    </SafeSuspense>
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
                    <SafeSuspense fallback={<Spinner />}>
                      <ComparisonPanel
                        modality={store.modality}
                        currentSpine={store.spineResult}
                        currentFoot={store.footResult}
                        lang={store.language} t={t}
                        consentGiven={store.consentGiven}
                        patientAge={store.patientAge}
                        patientGender={store.patientGender}
                      />
                    </SafeSuspense>
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
                    <SafeSuspense fallback={<Spinner />}>
                      <TrackingPanel modality={store.modality} lang={store.language} />
                    </SafeSuspense>
                  </div>
                </div>
              )}

              {/* Validation Dashboard */}
              {showValidation && (
                <div style={{ maxWidth:'100%', margin:'.75rem 0 0', padding:'0 1rem' }}>
                  <div style={{ background:'#0e1419', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, overflow:'hidden' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', borderBottom:'1px solid rgba(255,255,255,.08)' }}>
                      <span style={{ fontSize:16, fontWeight:700 }}>📊 Clinical Validation Dashboard</span>
                      <button onClick={() => setShowValidation(false)} style={{ background:'none', border:'none', color:'#7a8fa0', fontSize:18, cursor:'pointer' }}>✕</button>
                    </div>
                    <SafeSuspense fallback={<Spinner />}>
                      <ValidationDashboard lang={store.language} />
                    </SafeSuspense>
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
                  <button onClick={() => { clearTrackingHistory(); alert(store.language==='tr'?'Takip geçmişi silindi.':store.language==='ar'?'تم مسح سجل التتبع.':'History cleared.'); }} style={{ padding:'4px 10px', background:'transparent', border:'1px solid rgba(255,255,255,.1)', borderRadius:20, color:'#4a5a6a', fontSize:11, cursor:'pointer' }}>
                    🗑 {store.language==='tr'?'Geçmişi Sil':store.language==='ar'?'مسح السجل':'Clear History'}
                  </button>
                  <button onClick={() => { if(window.confirm(store.language==='tr'?'Tüm yerel veriler silinecek. Emin misiniz?':store.language==='ar'?'سيتم حذف جميع البيانات المحلية. هل أنت متأكد؟':'Delete all local data?')){ clearAllLocalData(); window.location.reload(); }}} style={{ padding:'4px 10px', background:'transparent', border:'1px solid rgba(224,85,85,.3)', borderRadius:20, color:'#e05555', fontSize:11, cursor:'pointer' }}>
                    ⚠ {store.language==='tr'?'Tüm Verileri Sil':store.language==='ar'?'حذف جميع البيانات':'Delete All Data'}
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
      <SafeSuspense fallback={null}>
        <ReportModal
          open={store.showReport}
          onClose={() => store.setShowReport(false)}
          modality={store.modality}
          spineResult={store.spineResult}
          footResult={store.footResult}
          patientAge={store.patientAge}
          patientGender={store.patientGender}
          notes={store.doctorNotes}
          lang={store.language}
          t={t}
        />
      </SafeSuspense>
    </>
  );
};

const IcoBtn: React.FC<{ title:string; onClick:()=>void; children:React.ReactNode }> = ({ title, onClick, children }) => (
  <button title={title} onClick={onClick} style={{ background:'none', border:'1px solid rgba(255,255,255,.15)', borderRadius:6, color:'#7a8fa0', padding:'3px 8px', fontSize:13, cursor:'pointer' }}>
    {children}
  </button>
);

export default App;
