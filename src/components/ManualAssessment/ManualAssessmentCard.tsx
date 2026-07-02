/**
 * ManualAssessmentCard.tsx
 *
 * Turns a manually measured Cobb angle into a COMPLETE clinical assessment
 * with ZERO API cost. Severity, description, treatment and follow-up text are
 * all produced by the local deterministic engine (clinicalRules.ts) — no
 * Gemini call. The measurement can be saved into the same tracking timeline
 * the AI flow uses, so the manual path is a first-class, offline alternative.
 */

import React, { useState } from 'react';
import { classifyCobb } from '@/lib/cobbCalculation';
import { getSpineRecs, type CurveLocation } from '@/lib/clinicalRules';
import { saveTrackEntry } from '@/lib/imageCache';
import { getT, type Lang } from '@/lib/i18n';

interface Props {
  cobb: number;
  lang: Lang;
  patientAge?: string;
  patientGender?: string;
  risserStage?: string;
}

const SEV_COLOURS: Record<string, string> = {
  normal: '#00d68f', mild: '#f0a045', moderate: '#f07832', severe: '#e05555',
};

const LOCATIONS: CurveLocation[] = ['thoracic', 'thoracolumbar', 'lumbar'];

export const ManualAssessmentCard: React.FC<Props> = ({
  cobb, lang, patientAge, patientGender, risserStage,
}) => {
  const t = getT(lang);
  const isRTL = lang === 'ar';
  const [location, setLocation] = useState<CurveLocation>('thoracic');
  const [saved, setSaved] = useState(false);

  const severity = classifyCobb(cobb);
  const sevColour = SEV_COLOURS[severity] ?? '#7a8fa0';
  const sevLabel  = t.sevS[severity] ?? severity;

  // Fully local, deterministic clinical text — no API tokens spent.
  const recs = getSpineRecs(cobb, location, lang, patientAge, patientGender, risserStage);

  const locLabel = (loc: CurveLocation): string => {
    if (loc === 'thoracic')      return lang==='tr'?'Torakal':lang==='ar'?'صدري':'Thoracic';
    if (loc === 'thoracolumbar') return lang==='tr'?'Torakolomber':lang==='ar'?'صدري قطني':'Thoracolumbar';
    if (loc === 'lumbar')        return lang==='tr'?'Lomber':lang==='ar'?'قطني':'Lumbar';
    return String(loc);
  };

  const onSave = () => {
    saveTrackEntry('spine', {
      date: new Date().toISOString(),
      cobb,
      source: 'manual',
      ts: Date.now(),
    });
    setSaved(true);
  };

  const heading = lang==='tr' ? 'Yerel Değerlendirme (API yok)'
                : lang==='ar' ? 'التقييم المحلي (بدون API)'
                : 'Local Assessment (no API)';
  const locHeading = lang==='tr'?'Eğri konumu':lang==='ar'?'موقع المنحنى':'Curve location';
  const savedTxt = lang==='tr'?'✓ Geçmişe kaydedildi':lang==='ar'?'✓ حُفظ في السجل':'✓ Saved to history';
  const saveTxt  = lang==='tr'?'⭳ Geçmişe kaydet':lang==='ar'?'⭳ حفظ في السجل':'⭳ Save to history';

  return (
    <div style={{ marginTop:10, background:'rgba(0,200,83,.035)', border:'1px solid rgba(0,200,83,.16)', borderRadius:10, padding:12, direction: isRTL ? 'rtl':'ltr' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:10, flexWrap:'wrap' }}>
        <div style={{ fontSize:10, letterSpacing:'1px', color:'#00c853', fontWeight:800 }}>{heading}</div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:22, fontWeight:800, color:'#00c853' }}>{cobb}°</span>
          <span style={{ fontSize:12, fontWeight:700, color: sevColour, border:`1px solid ${sevColour}66`, borderRadius:20, padding:'3px 10px' }}>{sevLabel}</span>
        </div>
      </div>

      {/* Curve location selector — drives the local recommendation engine */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
        <span style={{ fontSize:12, color:'#7a8fa0' }}>{locHeading}:</span>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {LOCATIONS.map(loc => (
            <button key={loc} onClick={() => { setLocation(loc); }}
              style={{ fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                background: location===loc ? 'rgba(0,200,83,.18)' : 'transparent',
                color: location===loc ? '#00c853' : '#7a8fa0',
                border:`1px solid ${location===loc ? '#00c853' : 'rgba(255,255,255,.15)'}`,
                borderRadius:20, padding:'3px 10px' }}>
              {locLabel(loc)}
            </button>
          ))}
        </div>
      </div>

      {recs.overallDescription && (
        <p style={{ fontSize:13, color:'#b0bec5', lineHeight:1.6, margin:'0 0 8px' }}>{recs.overallDescription}</p>
      )}
      {recs.treatmentPlan && (
        <div style={{ fontSize:13, color:'#b0bec5', lineHeight:1.6, marginBottom:8, whiteSpace:'pre-line' }}>
          <strong style={{ color:'#d7e4ea' }}>{t.rt2}:</strong> {recs.treatmentPlan}
        </div>
      )}
      {recs.followupPlan && (
        <div style={{ fontSize:13, color:'#b0bec5', lineHeight:1.6, marginBottom:10, whiteSpace:'pre-line' }}>
          <strong style={{ color:'#d7e4ea' }}>{t.rt3}:</strong> {recs.followupPlan}
        </div>
      )}

      <button onClick={onSave} disabled={saved}
        style={{ fontSize:12, fontWeight:700, cursor: saved?'default':'pointer', fontFamily:'inherit',
          background: saved ? 'rgba(0,200,83,.12)' : 'rgba(0,200,83,.2)', color:'#00c853',
          border:'1px solid #00c85355', borderRadius:8, padding:'6px 14px' }}>
        {saved ? savedTxt : saveTxt}
      </button>
    </div>
  );
};

export default ManualAssessmentCard;
