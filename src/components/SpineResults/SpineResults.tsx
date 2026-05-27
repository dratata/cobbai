import React from 'react';
import type { ProcessedSpineResult } from '@/lib/cobbCalculation';
import type { SpineAnalysisResult } from '@/types';
import type { Translations, Lang } from '@/lib/i18n';
import { estimateProgressionRisk } from '@/lib/cobbCalculation';

interface SpineResultsProps {
  processed: ProcessedSpineResult;
  raw: SpineAnalysisResult;
  lang: Lang;
  t: Translations;
  patientAge: string;
  patientGender: string;
  risserStage?: string;
  notes: string;
  onNotesChange: (v: string) => void;
  /** Called with curveIndex to start editing that specific curve */
  onEditLines: (curveIndex: number) => void;
}

const SEV_BG:  Record<string,string> = { normal:'rgba(0,214,143,.1)',   mild:'rgba(240,160,69,.1)',  moderate:'rgba(240,120,50,.1)', severe:'rgba(224,85,85,.1)' };
const SEV_COL: Record<string,string> = { normal:'#00d68f',              mild:'#f0a045',             moderate:'#f07832',            severe:'#e05555' };
const PAL = ['#00c853','#e53935','#2196f3'];

export const SpineResults: React.FC<SpineResultsProps> = ({
  processed, raw, lang, t, patientAge, patientGender, risserStage, notes, onNotesChange, onEditLines
}) => {
  const cf   = raw.measurement_confidence ?? 'medium';
  const cfCol = { high:'#00c853', medium:'#f0a045', low:'#e05555' }[cf] ?? '#f0a045';
  const ts   = new Date().toLocaleString();

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>

      {/* Confidence + timestamp header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:6 }}>
        <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 11px', borderRadius:20, border:`1px solid ${cfCol}44`, background:`${cfCol}11`, fontSize:12, color:cfCol }}>
          <span style={{ width:7, height:7, borderRadius:'50%', background:cfCol, display:'inline-block' }}/>
          {t.conf[cf] ?? cf}
        </span>
        <span style={{ fontSize:11, color:'#4a5a6a', fontFamily:'monospace' }}>🕐 {ts}</span>
      </div>

      {/* Image quality banner */}
      {raw.image_quality && raw.image_quality !== 'good' && (
        <div style={{ padding:'10px 14px', borderRadius:8, background: raw.image_quality==='poor'?'rgba(240,160,69,.1)':'rgba(224,85,85,.1)', border:`1px solid ${raw.image_quality==='poor'?'#f0a045':'#e05555'}55`, fontSize:13, color: raw.image_quality==='poor'?'#f0a045':'#e05555', lineHeight:1.5 }}>
          <strong>⚠️ {raw.image_quality==='poor'
            ?(lang==='ar'?'جودة منخفضة':lang==='en'?'Low quality':'Düşük kalite')
            :(lang==='ar'?'جودة غير مقبولة':lang==='en'?'Unacceptable quality':'Kabul edilemez kalite')
          }</strong>: {lang==='ar'?'يرجى التحقق يدوياً.':lang==='en'?'Please verify manually.':'Lütfen manuel doğrulayın.'}
        </div>
      )}

      {/* Pedicle method notice */}
      {raw.measurement_method === 'pedicle' && (
        <div style={{ padding:'6px 12px', borderRadius:7, background:'rgba(240,160,69,.08)', border:'1px solid rgba(240,160,69,.3)', fontSize:12, color:'#f0a045' }}>
          📐 {lang==='ar'?'تم استخدام طريقة السويقة (الصفائح النهائية غير مرئية)':lang==='en'?'Pedicle reference method used (endplates not visible)':'Pedikül referans yöntemi kullanıldı (endplate görüntülenemiyor)'}
        </div>
      )}

      {/* Validation warnings */}
      {processed.allWarnings.filter(w => w.includes('differ') || w.includes('invalid')).map((w,i) => (
        <div key={i} style={{ padding:'6px 10px', borderRadius:6, background:'rgba(224,85,85,.06)', border:'1px solid rgba(224,85,85,.25)', fontSize:11, color:'#e05555' }}>⚠ {w}</div>
      ))}

      {/* AI warnings from response */}
      {(raw.warnings ?? []).map((w,i) => (
        <div key={i} style={{ padding:'5px 10px', borderRadius:6, background:'rgba(240,160,69,.07)', border:'1px solid rgba(240,160,69,.25)', fontSize:11, color:'#f0a045' }}>⚠ {w}</div>
      ))}

      {/* Curve cards — each has its own "Edit" button */}
      {processed.processedCurves.map((c, i) => {
        const col  = PAL[i % PAL.length];
        const isL  = c.convexity_direction === 'left';
        const lbl  = i===0 ? t.curveP : t.curveS;
        const apex = c.apical_vertebra_name ? ` · Apex: ${c.apical_vertebra_name}${c.rotation_grade&&c.rotation_grade!=='0'?' (Rot.'+c.rotation_grade+')':''}` : '';
        return (
          <div key={i} style={{ borderLeft:`4px solid ${col}`, borderRadius:9, padding:'13px', background:`${col}0a`, border:`1px solid ${col}33`, borderLeftColor:col }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:9, flexWrap:'wrap', gap:6 }}>
              <span style={{ fontSize:10, letterSpacing:'.8px', fontWeight:700, color:col }}>
                {lbl} · {(c.curve_location??'').toUpperCase()}{apex}
              </span>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ padding:'3px 12px', borderRadius:20, fontSize:11, fontWeight:700, background:SEV_BG[c.severity], color:SEV_COL[c.severity] }}>
                  {t.sevS[c.severity] ?? c.severity}
                </span>
                {/* Per-curve edit button */}
                <button onClick={() => onEditLines(i)}
                  title={lang==='ar'?'تعديل خطوط الصفائح النهائية لهذا الانحناء':lang==='en'?'Edit endplate lines for this curve':'Bu eğrinin endplate çizgilerini düzenle'}
                  style={{ padding:'3px 8px', background:'rgba(255,255,255,.05)', border:`1px solid ${col}55`, borderRadius:6, color:col, fontSize:11, cursor:'pointer', fontWeight:700 }}>
                  ✏️
                </button>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
              <Metric val={`${c.cobb_angle}°`} lbl={t.cobb} col={col} />
              <Metric val={isL ? t.dL : t.dR} sub={t.conv} lbl="" col={col} />
              <Metric val={`${c.upper_vertebra_name??'?'}↓${c.lower_vertebra_name??'?'}`} lbl={t.vert} col="#eef2f7" small />
            </div>

            {/* Geometry cross-check row — only shown when local geometry is available */}
            {c.validation && c.validation.geometryCobb > 0.5 && (
              <div style={{ marginTop:6, paddingTop:6, borderTop:'1px solid rgba(255,255,255,.06)', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', fontSize:11 }}>
                <span style={{ color:'#4a5a6a', fontFamily:'monospace' }}>
                  {lang==='ar'?'التحقق الهندسي:':lang==='en'?'Geometry check:':'Geometri doğrulama:'} <span style={{ color: col }}>{c.validation.geometryCobb}°</span>
                </span>
                {!c.validation.isConsistent && c.validation.discrepancyDeg > 5 && (
                  <span style={{ padding:'1px 7px', borderRadius:10, background:'rgba(240,160,69,.1)', border:'1px solid rgba(240,160,69,.3)', color:'#f0a045', fontWeight:700 }}>
                    ⚠ Δ{c.validation.discrepancyDeg.toFixed(1)}° — {lang==='ar'?'تحقق من الإحداثيات':lang==='en'?'Check coordinates':'Koordinatları kontrol edin'}
                  </span>
                )}
              </div>
            )}

            {c.manually_corrected && (
              <div style={{ marginTop:8, fontSize:11, color:'#f0a045' }}>
                ✎ {lang==='ar'?'صحَّحه الطبيب':lang==='en'?'Corrected by physician':'Hekim tarafından düzeltildi'}
              </div>
            )}
          </div>
        );
      })}

      {/* Coronal balance */}
      {raw.coronal_balance && raw.coronal_balance !== 'balanced' && (
        <div style={{ padding:'6px 12px', borderRadius:7, background:'rgba(240,160,69,.08)', border:'1px solid rgba(240,160,69,.25)', fontSize:13, color:'#f0a045' }}>
          ⚖️ {lang==='ar'?'تم اكتشاف عدم توازن إكليلي (انحراف خط شاقول C7)':lang==='en'?'Coronal imbalance detected (C7 plumb line deviation)':'Koronal dengesizlik tespit edildi (C7 plumb hattı sapması)'}
        </div>
      )}

      {/* Description */}
      {processed.overallDescription && (
        <div style={{ background:'#141c23', border:'1px solid rgba(255,255,255,.08)', borderRadius:8, padding:'11px 13px', fontSize:14, color:'#7a8fa0', lineHeight:1.7 }}>
          {processed.overallDescription}
        </div>
      )}

      {/* Growth prediction */}
      <GrowthPrediction raw={raw} patientAge={patientAge} patientGender={patientGender} risser={risserStage} lang={lang} t={t} />

      {/* Recommendations */}
      {(processed.ageBasedRecommendation || processed.treatmentPlan || processed.followupPlan) && (
        <RecSection processed={processed} t={t} />
      )}

      {/* Risser staging */}
      <RisserBox t={t} />

      {/* Doctor notes */}
      <div>
        <div style={{ fontSize:10, letterSpacing:'1px', color:'#7a8fa0', fontWeight:700, marginBottom:6 }}>{t.notes}</div>
        <textarea
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          placeholder={t.notesPlaceholder}
          rows={3}
          style={{ width:'100%', background:'#141c23', border:'1px solid rgba(255,255,255,.12)', borderRadius:8, padding:10, color:'#eef2f7', fontSize:14, fontFamily:'inherit', resize:'vertical', outline:'none', lineHeight:1.6 }}
        />
      </div>

      {/* Edit lines button */}
      <button onClick={() => onEditLines(0)} style={{ width:'100%', padding:9, background:'rgba(0,200,83,.08)', border:'1px solid rgba(0,200,83,.3)', borderRadius:8, color:'#00c853', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
        {t.editLines}
      </button>

      {/* Disclaimer */}
      <div style={{ marginTop:8, borderLeft:'2px solid rgba(240,160,69,.35)', padding:'7px 12px', fontSize:13, color:'#7a8fa0' }}>
        {t.disc}
      </div>
    </div>
  );
};

/* ── Sub-components ─────────────────────────────────────────── */

const Metric: React.FC<{ val:string; lbl:string; sub?:string; col:string; small?:boolean }> = ({ val, lbl, sub, col, small }) => (
  <div style={{ background:'#141c23', borderRadius:8, padding:9, textAlign:'center' }}>
    <div style={{ fontSize: small?12:21, fontWeight:small?500:300, color:col, lineHeight:1 }}>{val}</div>
    {sub && <div style={{ fontSize:10, color:col+'aa', marginTop:2 }}>{sub}</div>}
    {lbl && <div style={{ fontSize:11, color:'#7a8fa0', marginTop:2 }}>{lbl}</div>}
  </div>
);

const GrowthPrediction: React.FC<{ raw:SpineAnalysisResult; patientAge:string; patientGender:string; risser?:string; lang:Lang; t:Translations }> = ({ raw, patientAge, patientGender, risser, lang, t }) => {
  if (!raw.curves?.length) return null;
  const cobb = raw.curves[0]?.cobb_angle;
  const age  = parseFloat(patientAge);
  if (!cobb || isNaN(age)) return null;
  const isFemale = patientGender?.toLowerCase().includes('female') || patientGender === 'Kadın';
  const risserN  = risser ? parseInt(risser) : undefined;
  const pred = estimateProgressionRisk(cobb, age, isFemale, risserN);
  const col  = { low:'#00c853', medium:'#f0a045', high:'#e05555' }[pred.risk];
  const riskLbl = lang==='ar'
    ? { low:'خطر منخفض', medium:'خطر متوسط', high:'خطر مرتفع' }[pred.risk]
    : lang==='en'
    ? { low:'Low Risk', medium:'Moderate Risk', high:'High Risk' }[pred.risk]
    : { low:'Düşük Risk', medium:'Orta Risk', high:'Yüksek Risk' }[pred.risk];
  const citation = lang==='ar'
    ? 'Lonstein & Carlson (1992) · استناداً إلى العمر والجنس والمرحلة وزاوية كوب'
    : lang==='en'
    ? 'Lonstein & Carlson (1992) · Based on age, sex, stage and Cobb angle'
    : 'Lonstein & Carlson (1992) · Yaş, cinsiyet, evre ve Cobb açısı baz alındı';
  return (
    <div style={{ background:`${col}08`, border:`1px solid ${col}22`, borderRadius:12, padding:14 }}>
      <div style={{ fontSize:10, letterSpacing:'1px', color:'#7a8fa0', fontWeight:700, marginBottom:8 }}>{t.growthTitle}</div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
        <div style={{ width:10, height:10, borderRadius:'50%', background:col, flexShrink:0 }}/>
        <span style={{ fontSize:15, color:col, fontWeight:600 }}>{riskLbl}</span>
      </div>
      <div style={{ fontSize:14, color:'#b0bec5', lineHeight:1.6 }}>{pred.recommendation}</div>
      <div style={{ fontSize:11, color:'#4a5a6a', marginTop:6 }}>{citation}</div>
    </div>
  );
};

// Now uses processedSpine (locally generated clinical text) — not raw AI text
const RecSection: React.FC<{ processed:ProcessedSpineResult; t:Translations }> = ({ processed, t }) => (
  <div>
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:'1rem', marginTop:'1.5rem' }}>
      <h2 style={{ fontSize:22, fontWeight:700 }}>{t.recTitle}</h2>
      <div style={{ flex:1, height:1, background:'rgba(255,255,255,.08)' }}/>
      <span style={{ fontSize:10, color:'#4a5a6a', padding:'2px 8px', border:'1px solid rgba(255,255,255,.08)', borderRadius:20 }}>📋 local rules</span>
    </div>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:2, background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.08)', borderRadius:12 }}>
      <RecCard ico="🏥" title={t.rt1} body={processed.ageBasedRecommendation} />
      <RecCard ico="💊" title={t.rt2} body={processed.treatmentPlan} />
      <RecCard ico="📅" title={t.rt3} body={processed.followupPlan} />
    </div>
    {processed.imagingIndications && processed.imagingIndications !== 'None' && (
      <div style={{ background:'#0e1419', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:15, marginTop:10 }}>
        <div style={{ fontSize:10, letterSpacing:'1px', color:'#00c853', marginBottom:10, fontWeight:700 }}>{t.imgTitle}</div>
        <div style={{ fontSize:14, color:'#7a8fa0', lineHeight:1.7 }}>{processed.imagingIndications}</div>
      </div>
    )}
    <div style={{ background:'rgba(240,160,69,.05)', border:'1px solid rgba(240,160,69,.18)', borderRadius:8, padding:'12px 15px', fontSize:13, color:'#7a8fa0', lineHeight:1.65, marginTop:10 }}
      dangerouslySetInnerHTML={{ __html: t.discFinal }} />
  </div>
);

const RecCard: React.FC<{ ico:string; title:string; body:string }> = ({ ico, title, body }) => (
  <div style={{ background:'#0e1419', padding:'1.1rem' }}>
    <div style={{ fontSize:18, marginBottom:6 }}>{ico}</div>
    <div style={{ fontSize:10, letterSpacing:'1px', color:'#00c853', marginBottom:7, fontWeight:700 }}>{title}</div>
    <div style={{ fontSize:14, color:'#7a8fa0', lineHeight:1.65 }} dangerouslySetInnerHTML={{ __html: (body||'—').replace(/\n/g,'<br/>') }}/>
  </div>
);

const RisserBox: React.FC<{ t:Translations }> = ({ t }) => (
  <div style={{ background:'rgba(0,200,83,.04)', border:'1px solid rgba(0,200,83,.15)', borderRadius:12, padding:15, marginTop:10 }}>
    <div style={{ fontSize:10, letterSpacing:'1px', color:'#00c853', marginBottom:10, fontWeight:700 }}>{t.risserTitle}</div>
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
      <div>
        <strong style={{ color:'#eef2f7', display:'block', marginBottom:4, fontSize:14 }}>{t.risserH}</strong>
        <div style={{ fontSize:14, color:'#7a8fa0', lineHeight:1.7 }} dangerouslySetInnerHTML={{ __html: t.risserC }}/>
      </div>
      <div>
        <strong style={{ color:'#eef2f7', display:'block', marginBottom:4, fontSize:14 }}>{t.sandersH}</strong>
        <div style={{ fontSize:14, color:'#7a8fa0', lineHeight:1.7 }} dangerouslySetInnerHTML={{ __html: t.sandersC }}/>
      </div>
    </div>
  </div>
);

export default SpineResults;
