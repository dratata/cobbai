import { create } from 'zustand';
import type {
  LoadedImage, SpineAnalysisResult, FootAnalysisResult,
  CorrectionState, MeasurementSession, AppModality, AppLanguage, ImageQualityReport,
} from '@/types';
import type { ProcessedSpineResult } from '@/lib/cobbCalculation';
import type { ValidationOutcome } from '@/lib/validateAIResponse';

export interface ImageControls {
  brightness:          number;   // [-80, +80]
  contrast:            number;   // [50, 200]
  overlayOpacity:      number;   // [0, 100]
  zoom:                number;   // [0.5, 4.0]
  showOverlay:         boolean;
  /** Show inferred intermediate vertebra labels (T6, T7 …) on overlay */
  showVertebraLabels:  boolean;
  /** Show apical vertebra diamond ◇ on overlay */
  showApexLabel:       boolean;
}

export const DEFAULT_CONTROLS: ImageControls = {
  brightness: 0, contrast: 100, overlayOpacity: 100, zoom: 1.0,
  showOverlay: true,
  showVertebraLabels: true,  // ON by default — T6/T7/T8 labels appear without API calls
  showApexLabel: true,
};

export interface AppState {
  /* ── Domain ───────────────────────────────── */
  modality:         AppModality;
  language:         AppLanguage;
  consentGiven:     boolean;
  onboardingDone:   boolean;

  /* ── Image ────────────────────────────────── */
  loadedImage:       LoadedImage | null;
  qualityReport:     ImageQualityReport | null;
  isPreprocessing:   boolean;

  /* ── Analysis ─────────────────────────────── */
  isAnalyzing:       boolean;
  spineResult:       SpineAnalysisResult | null;
  processedSpine:    ProcessedSpineResult | null;
  footResult:        FootAnalysisResult | null;
  validationOutcome: ValidationOutcome | null;
  analyzeError:      string | null;
  patientAge:        string;
  patientGender:     string;
  risserStage:       string;

  /* ── Manual correction ────────────────────── */
  correction:        CorrectionState | null;
  showCorrection:    boolean;

  /* ── Image controls ───────────────────────── */
  controls:          ImageControls;

  /* ── UI panels ────────────────────────────── */
  showReport:        boolean;
  showComparison:    boolean;
  showHistory:       boolean;

  /* ── Doctor notes ─────────────────────────── */
  doctorNotes:       string;

  /* ── History sessions ─────────────────────── */
  history:           MeasurementSession[];

  /* ── Theme ────────────────────────────────── */
  lightMode:         boolean;

  /* ── Actions ──────────────────────────────── */
  setModality:       (m: AppModality) => void;
  setLanguage:       (l: AppLanguage) => void;
  setConsent:        (v: boolean) => void;
  setOnboardingDone: (v: boolean) => void;

  setLoadedImage:    (img: LoadedImage | null) => void;
  setQualityReport:  (r: ImageQualityReport | null) => void;
  setPreprocessing:  (v: boolean) => void;

  setAnalyzing:      (v: boolean) => void;
  setSpineResult:    (r: SpineAnalysisResult | null, p: ProcessedSpineResult | null, o: ValidationOutcome | null) => void;
  setFootResult:     (r: FootAnalysisResult | null) => void;
  setAnalyzeError:   (e: string | null) => void;
  setPatient:        (age: string, gender: string, risser?: string) => void;

  setCorrection:     (c: CorrectionState | null) => void;
  setShowCorrection: (v: boolean) => void;

  setControls:       (c: Partial<ImageControls>) => void;
  resetControls:     () => void;

  setShowReport:     (v: boolean) => void;
  setShowComparison: (v: boolean) => void;
  setShowHistory:    (v: boolean) => void;

  setDoctorNotes:    (n: string) => void;
  addToHistory:      (s: MeasurementSession) => void;

  toggleTheme:       () => void;

  resetImage:        () => void;
  resetAll:          () => void;
}

export const useMeasurementStore = create<AppState>((set) => ({
  modality:         'spine',
  language:         (localStorage.getItem('cobbai_lang') as AppLanguage) ?? 'tr',
  consentGiven:     sessionStorage.getItem('cobbai_role') === 'doctor',
  onboardingDone:   !!localStorage.getItem('cobbai_onboard'),
  loadedImage:      null, qualityReport:    null, isPreprocessing:  false,
  isAnalyzing:      false,
  spineResult:      null, processedSpine:   null, footResult:       null,
  validationOutcome:null, analyzeError:     null,
  patientAge: '', patientGender: '', risserStage: '',
  correction: null, showCorrection: false,
  controls: { ...DEFAULT_CONTROLS },
  showReport: false, showComparison: false, showHistory: false,
  doctorNotes: '',
  history: [],
  lightMode: localStorage.getItem('cobbai_theme') === 'light',

  setModality: (m) => set({ modality:m, spineResult:null, processedSpine:null, footResult:null, correction:null, showCorrection:false }),
  setLanguage: (l) => { try { localStorage.setItem('cobbai_lang', l); } catch { /* quota */ } set({ language:l }); },
  setConsent:  (v) => set({ consentGiven:v }),
  setOnboardingDone: (v) => { if(v) { try { localStorage.setItem('cobbai_onboard','1'); } catch { /* quota */ } } set({ onboardingDone:v }); },

  setLoadedImage: (img) => set({
    loadedImage:img, spineResult:null, processedSpine:null, footResult:null,
    correction:null, showCorrection:false, analyzeError:null, qualityReport:null,
    doctorNotes:'', showReport:false, showComparison:false,
  }),
  setQualityReport:  (r) => set({ qualityReport:r }),
  setPreprocessing:  (v) => set({ isPreprocessing:v }),
  setAnalyzing:      (v) => set({ isAnalyzing:v }),

  setSpineResult: (r, p, o) => set({ spineResult:r, processedSpine:p, validationOutcome:o, analyzeError:null, correction:null, showCorrection:false }),
  setFootResult:  (r) => set({ footResult:r, analyzeError:null }),
  setAnalyzeError:(e) => set({ analyzeError:e, isAnalyzing:false }),
  setPatient:     (age, gender, risser) => set({ patientAge:age, patientGender:gender, risserStage:risser??'' }),

  setCorrection:     (c) => set({ correction:c }),
  setShowCorrection: (v) => set({ showCorrection:v }),

  setControls:    (c) => set(s => ({ controls:{ ...s.controls, ...c } })),
  resetControls:  () => set({ controls:{ ...DEFAULT_CONTROLS } }),

  setShowReport:     (v) => set({ showReport:v }),
  setShowComparison: (v) => set({ showComparison:v }),
  setShowHistory:    (v) => set({ showHistory:v }),

  setDoctorNotes:    (n) => set({ doctorNotes:n }),
  addToHistory:      (s) => set(st => ({ history:[s,...st.history].slice(0,10) })),

  toggleTheme: () => set(s => {
    const next = !s.lightMode;
    try { localStorage.setItem('cobbai_theme', next ? 'light' : 'dark'); } catch { /* quota */ }
    document.body.classList.toggle('light-mode', next);
    return { lightMode: next };
  }),

  resetImage: () => set({
    loadedImage:null, qualityReport:null,
    spineResult:null, processedSpine:null, footResult:null,
    correction:null, showCorrection:false, analyzeError:null,
    controls:{ ...DEFAULT_CONTROLS }, doctorNotes:'',
    showReport:false, showComparison:false,
  }),
  resetAll: () => set({
    loadedImage:null, qualityReport:null,
    spineResult:null, processedSpine:null, footResult:null,
    correction:null, showCorrection:false, analyzeError:null,
    controls:{ ...DEFAULT_CONTROLS }, doctorNotes:'',
    showReport:false, showComparison:false, showHistory:false,
    patientAge:'', patientGender:'', risserStage:'',
  }),
}));

export function selectCanAnalyze(s: AppState): boolean {
  return s.consentGiven && s.loadedImage !== null && !s.isAnalyzing;
}
