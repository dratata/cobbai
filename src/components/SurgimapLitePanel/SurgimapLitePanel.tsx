import React from 'react';
import type { ProcessedSpineResult } from '@/lib/cobbCalculation';
import { lineInclinationDeg } from '@/lib/lineGeometry';

interface Props {
  processed: ProcessedSpineResult;
  onEditCurve: (curveIndex: number) => void;
}

const row: React.CSSProperties = { display:'grid', gridTemplateColumns:'1.2fr .8fr .8fr .9fr', gap:8, alignItems:'center', fontSize:12 };
const cell: React.CSSProperties = { background:'#101820', border:'1px solid rgba(255,255,255,.08)', borderRadius:7, padding:'7px 8px', color:'#b0bec5' };

export const SurgimapLitePanel: React.FC<Props> = ({ processed, onEditCurve }) => {
  if (!processed.processedCurves.length) return null;
  return (
    <div style={{ marginTop:10, background:'rgba(0,200,83,.035)', border:'1px solid rgba(0,200,83,.16)', borderRadius:10, padding:12 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:10 }}>
        <div>
          <div style={{ fontSize:10, letterSpacing:'1px', color:'#00c853', fontWeight:800 }}>SURGIMAP-LITE · LOCAL WORKFLOW</div>
          <div style={{ fontSize:12, color:'#7a8fa0', marginTop:3 }}>Ek API kullanmadan vertebra etiketleri, endplate eğimleri ve hızlı düzeltme.</div>
        </div>
        <div style={{ fontSize:11, color: processed.isReliable ? '#00c853' : '#f0a045', border:`1px solid ${processed.isReliable ? '#00c85344' : '#f0a04555'}`, borderRadius:20, padding:'4px 9px' }}>
          {processed.isReliable ? 'Geometri tutarlı' : 'Manuel doğrula'}
        </div>
      </div>

      <div style={{ ...row, color:'#7a8fa0', fontWeight:700, marginBottom:6 }}>
        <div>Eğri / vertebra</div><div>Cobb</div><div>Endplate eğimi</div><div>İşlem</div>
      </div>
      {processed.processedCurves.map((c, i) => {
        const u = lineInclinationDeg(c.upper_line);
        const l = lineInclinationDeg(c.lower_line);
        return (
          <div key={i} style={{ ...row, marginBottom:6 }}>
            <div style={cell}>#{i+1} · <span style={{ color:'#00e5ff' }}>{c.upper_vertebra_name || '?'}</span> → <span style={{ color:'#ff4fd8' }}>{c.lower_vertebra_name || '?'}</span>{c.apical_vertebra_name ? <span style={{ color:'#ffd166' }}> · Apex {c.apical_vertebra_name}</span> : null}</div>
            <div style={{ ...cell, color:'#00c853', fontWeight:800 }}>{c.cobb_angle}°</div>
            <div style={cell}>Üst {Number.isFinite(u) ? u.toFixed(1) : '?'}° · Alt {Number.isFinite(l) ? l.toFixed(1) : '?'}°</div>
            <button onClick={() => onEditCurve(i)} style={{ ...cell, cursor:'pointer', color:'#00c853', fontWeight:800, fontFamily:'inherit' }}>Endplate düzelt</button>
          </div>
        );
      })}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:7, marginTop:8 }}>
        <Mini title="Koronal denge" value={processed.raw.coronal_balance || 'balanced'} />
        <Mini title="Sagittal modül" value="Lateral grafiyle manuel TK/LL/SVA" />
        <Mini title="DICOM" value="Mevcut: JPG/PNG · DICOM ileri modül" />
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
