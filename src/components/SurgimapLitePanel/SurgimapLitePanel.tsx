import React from 'react';
import type { ProcessedSpineResult } from '@/lib/cobbCalculation';
import { lineInclinationDeg } from '@/lib/lineGeometry';
import type { Lang } from '@/lib/i18n';

interface Props {
  processed: ProcessedSpineResult;
  onEditCurve: (curveIndex: number) => void;
  lang?: Lang;
  /** Image width/height — endplate coords are normalised, so the displayed
   *  inclination must be de-distorted to pixel-true degrees. Defaults to 1. */
  aspect?: number;
}

const row: React.CSSProperties = { display:'grid', gridTemplateColumns:'1.2fr .8fr .8fr .9fr', gap:8, alignItems:'center', fontSize:12 };
const cell: React.CSSProperties = { background:'#101820', border:'1px solid rgba(255,255,255,.08)', borderRadius:7, padding:'7px 8px', color:'#b0bec5' };

const L = {
  title:       { tr:'LOKAL GEOMETRİ ANALİZİ', en:'LOCAL GEOMETRY ANALYSIS', ar:'تحليل الهندسة المحلية' },
  subtitle:    { tr:'Ek API kullanmadan vertebra etiketleri, endplate eğimleri ve hızlı düzeltme.',
                 en:'Vertebra labels, endplate inclinations and quick correction — no extra API call.',
                 ar:'تسميات الفقرات وميلان الصفائح النهائية والتصحيح السريع — بدون استدعاء API إضافي.' },
  consistent:  { tr:'Geometri tutarlı', en:'Geometry consistent', ar:'الهندسة متسقة' },
  verify:      { tr:'Manuel doğrula',   en:'Verify manually',     ar:'تحقق يدوياً' },
  hdrCurve:    { tr:'Eğri / vertebra',  en:'Curve / vertebra',    ar:'المنحنى / الفقرة' },
  hdrCobb:     { tr:'Cobb',             en:'Cobb',                ar:'كوب' },
  hdrSlope:    { tr:'Endplate eğimi',   en:'Endplate inclination',ar:'ميل الصفيحة النهائية' },
  hdrAction:   { tr:'İşlem',            en:'Action',              ar:'إجراء' },
  upper:       { tr:'Üst',              en:'Upper',               ar:'العلوي' },
  lower:       { tr:'Alt',              en:'Lower',               ar:'السفلي' },
  editBtn:     { tr:'Endplate düzelt',  en:'Edit endplate',       ar:'تحرير الصفيحة' },
  coronal:     { tr:'Koronal denge',    en:'Coronal balance',     ar:'التوازن التاجي' },
  balanced:    { tr:'Dengeli',          en:'Balanced',            ar:'متوازن' },
  leftShift:   { tr:'Sola kaymış',      en:'Left shift',          ar:'انحراف يساري' },
  rightShift:  { tr:'Sağa kaymış',      en:'Right shift',         ar:'انحراف يميني' },
  sagittal:    { tr:'Sagittal modül',   en:'Sagittal module',     ar:'الوحدة السهمية' },
  sagittalVal: { tr:'Lateral grafiyle manuel TK/LL/SVA',
                 en:'Manual TK/LL/SVA with lateral X-ray',
                 ar:'TK/LL/SVA يدوياً مع الأشعة الجانبية' },
  dicom:       { tr:'DICOM',            en:'DICOM',               ar:'DICOM' },
  dicomVal:    { tr:'Mevcut: JPG/PNG · DICOM ileri modül',
                 en:'Current: JPG/PNG · DICOM advanced module',
                 ar:'الحالي: JPG/PNG · وحدة DICOM المتقدمة' },
} as const;

type LKey = keyof typeof L;
function t(key: LKey, lang: Lang): string { return L[key][lang] ?? L[key]['en']; }

export const SurgimapLitePanel: React.FC<Props> = ({ processed, onEditCurve, lang = 'tr', aspect = 1 }) => {
  if (!processed.processedCurves.length) return null;
  const isRTL = lang === 'ar';
  return (
    <div style={{ marginTop:10, background:'rgba(0,200,83,.035)', border:'1px solid rgba(0,200,83,.16)', borderRadius:10, padding:12, direction: isRTL ? 'rtl' : 'ltr' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:10 }}>
        <div>
          <div style={{ fontSize:10, letterSpacing:'1px', color:'#00c853', fontWeight:800 }}>{t('title', lang)}</div>
          <div style={{ fontSize:12, color:'#7a8fa0', marginTop:3 }}>{t('subtitle', lang)}</div>
        </div>
        <div style={{ fontSize:11, color: processed.isReliable ? '#00c853' : '#f0a045', border:`1px solid ${processed.isReliable ? '#00c85344' : '#f0a04555'}`, borderRadius:20, padding:'4px 9px', flexShrink:0 }}>
          {processed.isReliable ? t('consistent', lang) : t('verify', lang)}
        </div>
      </div>

      <div style={{ ...row, color:'#7a8fa0', fontWeight:700, marginBottom:6 }}>
        <div>{t('hdrCurve', lang)}</div><div>{t('hdrCobb', lang)}</div><div>{t('hdrSlope', lang)}</div><div>{t('hdrAction', lang)}</div>
      </div>
      {processed.processedCurves.map((c, i) => {
        const u = lineInclinationDeg(c.upper_line, aspect);
        const l = lineInclinationDeg(c.lower_line, aspect);
        return (
          <div key={i} style={{ ...row, marginBottom:6 }}>
            <div style={cell}>#{i+1} · <span style={{ color:'#00e5ff' }}>{c.upper_vertebra_name || '?'}</span> → <span style={{ color:'#ff4fd8' }}>{c.lower_vertebra_name || '?'}</span>{c.apical_vertebra_name ? <span style={{ color:'#ffd166' }}> · Apex {c.apical_vertebra_name}</span> : null}</div>
            <div style={{ ...cell, color:'#00c853', fontWeight:800 }}>{c.cobb_angle}°</div>
            <div style={cell}>{t('upper', lang)} {Number.isFinite(u) ? u.toFixed(1) : '?'}° · {t('lower', lang)} {Number.isFinite(l) ? l.toFixed(1) : '?'}°</div>
            <button onClick={() => onEditCurve(i)} style={{ ...cell, cursor:'pointer', color:'#00c853', fontWeight:800, fontFamily:'inherit' }}>{t('editBtn', lang)}</button>
          </div>
        );
      })}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:7, marginTop:8 }}>
        <Mini title={t('coronal', lang)}  value={t(processed.raw.coronal_balance === 'left_shift' ? 'leftShift' : processed.raw.coronal_balance === 'right_shift' ? 'rightShift' : 'balanced', lang)} />
        <Mini title={t('sagittal', lang)} value={t('sagittalVal', lang)} />
        <Mini title={t('dicom', lang)}    value={t('dicomVal', lang)} />
      </div>
    </div>
  );
};

const Mini: React.FC<{title:string; value:string}> = ({ title, value }) => (
  <div style={{ background:'#101820', border:'1px solid rgba(255,255,255,.08)', borderRadius:8, padding:9 }}>
    <div style={{ fontSize:10, color:'#7a8fa0', fontWeight:700, marginBottom:4 }}>{title}</div>
    <div style={{ fontSize:12, color:'#d7e4ea', lineHeight:1.35 }}>{value}</div>
  </div>
);

export default SurgimapLitePanel;
