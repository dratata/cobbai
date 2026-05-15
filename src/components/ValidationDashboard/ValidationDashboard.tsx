/**
 * ValidationDashboard.tsx
 * Real scientific validation: import CSV → MAE, RMSE, ICC, Bland-Altman chart.
 */
import React, { useState, useRef, useEffect } from 'react';
import { calculateMetrics, getBlandAltmanPoints, parseValidationCSV } from '@/lib/validationMetrics';
import type { ValidationCase, ValidationMetrics } from '@/lib/validationMetrics';

interface Props { lang?: string }

export const ValidationDashboard: React.FC<Props> = ({ lang: _lang = 'en' }) => {
  const [cases, setCases]     = useState<ValidationCase[]>([]);
  const [metrics, setMetrics] = useState<ValidationMetrics | null>(null);
  const [error, setError]     = useState('');
  const baRef = useRef<HTMLCanvasElement>(null);

  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = parseValidationCSV(ev.target!.result as string);
        if (parsed.length === 0) { setError('CSV could not be parsed. Expected columns: id, expertCobb, aiCobb'); return; }
        setCases(parsed);
        setMetrics(calculateMetrics(parsed));
        setError('');
      } catch { setError('CSV parse error.'); }
    };
    reader.readAsText(f);
  };

  // Draw Bland-Altman plot on canvas
  useEffect(() => {
    const cvs = baRef.current; if (!cvs || !metrics || cases.length === 0) return;
    const ctx = cvs.getContext('2d'); if (!ctx) return;
    const W = cvs.width = cvs.offsetWidth, H = cvs.height = 280;
    ctx.clearRect(0, 0, W, H);
    const pts = getBlandAltmanPoints(cases);
    const means = pts.map(p => p.mean), diffs = pts.map(p => p.diff);
    const minX = Math.min(...means) - 3, maxX = Math.max(...means) + 3;
    const minY = Math.min(...diffs, metrics.loa95Lower) - 3;
    const maxY = Math.max(...diffs, metrics.loa95Upper) + 3;
    const pad = { l:50, r:20, t:20, b:40 };
    const sx = (x: number) => pad.l + (x - minX) / (maxX - minX) * (W - pad.l - pad.r);
    const sy = (y: number) => H - pad.b - (y - minY) / (maxY - minY) * (H - pad.t - pad.b);

    // Background
    ctx.fillStyle = '#0e1419'; ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1; ctx.setLineDash([3,3]);
    for (let i = 0; i <= 5; i++) {
      const y = H - pad.b - i / 5 * (H - pad.t - pad.b);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      const yv = minY + i / 5 * (maxY - minY);
      ctx.fillStyle='#7a8fa0'; ctx.font='10px monospace'; ctx.textAlign='right';
      ctx.fillText(yv.toFixed(1), pad.l-4, y+3);
    }
    ctx.setLineDash([]);

    // Reference lines
    const drawHLine = (y: number, col: string, label: string, dash: number[]) => {
      const cy = sy(y);
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(pad.l, cy); ctx.lineTo(W - pad.r, cy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`${label} ${y.toFixed(1)}°`, W - pad.r - 60, cy - 3);
    };
    drawHLine(metrics.meanBias,  '#00c853', 'Bias', []);
    drawHLine(metrics.loa95Upper,'#f0a045', '+1.96SD', [5,3]);
    drawHLine(metrics.loa95Lower,'#f0a045', '-1.96SD', [5,3]);
    drawHLine(0, 'rgba(255,255,255,0.3)', '', [3,3]);

    // Data points
    pts.forEach(p => {
      const inLoa = p.diff >= metrics!.loa95Lower && p.diff <= metrics!.loa95Upper;
      ctx.beginPath(); ctx.arc(sx(p.mean), sy(p.diff), 4.5, 0, Math.PI*2);
      ctx.fillStyle = inLoa ? '#00c853' : '#e05555';
      ctx.shadowColor = inLoa ? '#00c853' : '#e05555'; ctx.shadowBlur = 6;
      ctx.fill(); ctx.shadowBlur = 0;
    });

    // Axes labels
    ctx.fillStyle = '#7a8fa0'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
    ctx.fillText('Mean (Expert + AI) / 2 °', W / 2, H - 8);
    ctx.save(); ctx.translate(14, H / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('Expert - AI °', 0, 0); ctx.restore();
    ctx.fillStyle = '#eef2f7'; ctx.font = 'bold 12px monospace';
    ctx.fillText('Bland-Altman Plot', W / 2, 16);
  }, [cases, metrics]);

  const fmt = (n: number, dec = 2) => isNaN(n) ? '-' : n.toFixed(dec);
  const MetRow: React.FC<{label:string; value:string; sub?:string; ok?:boolean}> = ({label,value,sub,ok}) => (
    <div style={{display:'flex',justifyContent:'space-between',padding:'8px 12px',borderBottom:'1px solid rgba(255,255,255,.06)',alignItems:'center'}}>
      <div><div style={{fontSize:13,color:'#eef2f7'}}>{label}</div>{sub&&<div style={{fontSize:11,color:'#7a8fa0'}}>{sub}</div>}</div>
      <div style={{fontSize:18,fontWeight:700,color:ok===undefined?'#00c853':ok?'#00c853':'#f0a045'}}>{value}</div>
    </div>
  );

  return (
    <div style={{padding:'1.5rem 1rem',maxWidth:900,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <div>
          <h2 style={{fontSize:22,fontWeight:700}}>Clinical Validation Dashboard</h2>
          <p style={{fontSize:13,color:'#7a8fa0',marginTop:4}}>
            Import a CSV file with expert vs AI Cobb angle measurements.
            Columns: <code style={{color:'#00c853'}}>id, expertCobb, aiCobb</code> (optional: curveType, imageQuality, notes)
          </p>
        </div>
        <label style={{marginLeft:'auto',padding:'9px 18px',background:'rgba(0,200,83,.12)',border:'1px solid rgba(0,200,83,.35)',borderRadius:8,color:'#00c853',fontSize:13,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>
          Import CSV
          <input type="file" accept=".csv" onChange={handleCSV} style={{display:'none'}}/>
        </label>
      </div>

      {error && <div style={{padding:'10px 14px',background:'rgba(224,85,85,.1)',border:'1px solid rgba(224,85,85,.3)',borderRadius:8,color:'#e05555',marginBottom:16}}>{error}</div>}

      {!metrics && (
        <div style={{padding:'3rem',textAlign:'center',color:'#4a5a6a',fontSize:14,border:'2px dashed rgba(255,255,255,.1)',borderRadius:12}}>
          <div style={{fontSize:48,marginBottom:12}}>&#128203;</div>
          Import a CSV to compute MAE, RMSE, ICC and Bland-Altman analysis.<br/>
          <span style={{fontSize:12,marginTop:8,display:'block'}}>
            Example CSV: <code>id,expertCobb,aiCobb</code><br/>case_01,28.5,26.2<br/>case_02,42.1,40.8
          </span>
        </div>
      )}

      {metrics && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          {/* Metrics card */}
          <div style={{background:'#0e1419',border:'1px solid rgba(255,255,255,.1)',borderRadius:12,overflow:'hidden'}}>
            <div style={{padding:'12px 16px',borderBottom:'1px solid rgba(255,255,255,.08)',fontSize:10,letterSpacing:'1px',color:'#00c853',fontWeight:800}}>
              MEASUREMENT METRICS &mdash; {metrics.n} cases
            </div>
            <MetRow label="MAE (Mean Absolute Error)" value={`${fmt(metrics.mae)}°`} sub="Lower is better. Clinical threshold: <5°" ok={metrics.mae < 5} />
            <MetRow label="RMSE" value={`${fmt(metrics.rmse)}°`} />
            <MetRow label="ICC (2,1)" value={fmt(metrics.icc)} sub="≥0.90 = excellent reliability" ok={metrics.icc >= 0.9} />
            <MetRow label="Pearson r" value={fmt(metrics.pearsonR)} ok={metrics.pearsonR >= 0.95} />
            <MetRow label="Within ±5°" value={`${fmt(metrics.within5deg, 1)}%`} sub="Target: ≥90%" ok={metrics.within5deg >= 90} />
            <MetRow label="Within ±10°" value={`${fmt(metrics.within10deg, 1)}%`} />
            <MetRow label="Bland-Altman Bias" value={`${fmt(metrics.meanBias, 2)}°`} sub="Expert − AI" />
            <MetRow label="95% LoA" value={`${fmt(metrics.loa95Lower,1)}° to ${fmt(metrics.loa95Upper,1)}°`} />
          </div>

          {/* Bland-Altman chart */}
          <div style={{background:'#0e1419',border:'1px solid rgba(255,255,255,.1)',borderRadius:12,overflow:'hidden'}}>
            <canvas ref={baRef} style={{width:'100%',height:280,display:'block'}}/>
          </div>

          {/* Case table */}
          <div style={{gridColumn:'1/-1',background:'#0e1419',border:'1px solid rgba(255,255,255,.1)',borderRadius:12,overflow:'auto',maxHeight:320}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{background:'#141c23'}}>
                  {['Case ID','Expert Cobb°','AI Cobb°','Abs Error°','Status','Notes'].map(h=>(
                    <th key={h} style={{padding:'9px 12px',textAlign:'left',fontSize:11,letterSpacing:'1px',color:'#7a8fa0',fontWeight:700,whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cases.map((c,i) => {
                  const err = Math.abs(c.expertCobb - c.aiCobb);
                  return (
                    <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,.05)'}}>
                      <td style={{padding:'7px 12px',color:'#eef2f7'}}>{c.id}</td>
                      <td style={{padding:'7px 12px',color:'#eef2f7',fontWeight:700}}>{c.expertCobb}&deg;</td>
                      <td style={{padding:'7px 12px',color:'#eef2f7',fontWeight:700}}>{c.aiCobb}&deg;</td>
                      <td style={{padding:'7px 12px',color:err<=5?'#00c853':err<=10?'#f0a045':'#e05555',fontWeight:700}}>{err.toFixed(1)}&deg;</td>
                      <td style={{padding:'7px 12px'}}>
                        <span style={{padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:700,background:err<=5?'rgba(0,200,83,.1)':'rgba(224,85,85,.1)',color:err<=5?'#00c853':'#e05555'}}>
                          {err<=5?'OK':'Review'}
                        </span>
                      </td>
                      <td style={{padding:'7px 12px',color:'#7a8fa0',fontSize:12}}>{c.notes||'—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ValidationDashboard;
