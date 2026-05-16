import React, { useRef, useEffect } from 'react';
import type { SpineAnalysisResult, FootAnalysisResult } from '@/types';
import type { Translations } from '@/lib/i18n';

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  modality: 'spine' | 'foot';
  spineResult?: SpineAnalysisResult | null;
  footResult?: FootAnalysisResult | null;
  patientAge: string;
  patientGender: string;
  notes: string;
  t: Translations;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  open, onClose, modality, spineResult, footResult, patientAge, patientGender, notes, t
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  if (!open) return null;

  const date = new Date().toLocaleDateString('tr-TR', { year:'numeric', month:'long', day:'numeric' });
  const time = new Date().toLocaleTimeString('tr-TR');

  const handlePrint = () => {
    const content = contentRef.current?.innerHTML ?? '';
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>CobbAI Rapor</title><style>
      body{margin:24px;font-family:Georgia,serif;color:#111;font-size:13px;line-height:1.6}
      h1{font-size:20px;margin-bottom:4px} h2{font-size:15px;margin:16px 0 6px;border-bottom:1px solid #ccc;padding-bottom:4px}
      table{width:100%;border-collapse:collapse;margin:8px 0;font-size:12px}
      th{background:#f0f0f0;padding:6px 10px;text-align:left;font-weight:700}
      td{padding:6px 10px;border-bottom:1px solid #eee}
      .pill{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700}
      .disclaimer{font-size:11px;color:#666;border-top:1px solid #ccc;margin-top:16px;padding-top:8px}
      @media print{body{margin:12px}}
    </style></head><body>${content}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  const buildSpineReport = () => {
    if (!spineResult) return '';
    const curves = spineResult.curves ?? [];
    return `
      <h1>📋 CobbAI — Skolyoz Klinik Raporu</h1>
      <p style="color:#555;font-size:12px">${date} · ${time} · cobbai.vercel.app</p>
      <h2>Hasta Bilgileri</h2>
      <table>
        <tr><th>Yaş</th><td>${patientAge||'—'}</td><th>Cinsiyet</th><td>${patientGender||'—'}</td></tr>
        <tr><th>Görüntü Kalitesi</th><td>${spineResult.image_quality}</td><th>Güven</th><td>${spineResult.measurement_confidence}</td></tr>
        <tr><th>Vertebra Sayısı</th><td>${spineResult.vertebrae_detected}</td><th>Görüş</th><td>${spineResult.view_type}</td></tr>
      </table>
      <h2>Ölçüm Sonuçları</h2>
      <table>
        <tr><th>#</th><th>Eğrilik</th><th>Cobb Açısı</th><th>Şiddet</th><th>Konum</th><th>Üst Vertebra</th><th>Alt Vertebra</th><th>Apeks</th></tr>
        ${curves.map((c,i) => `
          <tr>
            <td>${i+1}</td>
            <td>${c.label}</td>
            <td><strong>${c.cobb_angle}°</strong></td>
            <td><span class="pill" style="background:${sevBg(c.severity)};color:${sevCol(c.severity)}">${c.severity}</span></td>
            <td>${c.curve_location}</td>
            <td>${c.upper_vertebra_name||'—'}</td>
            <td>${c.lower_vertebra_name||'—'}</td>
            <td>${c.apical_vertebra_name||'—'}</td>
          </tr>`).join('')}
      </table>
      <h2>Klinik Değerlendirme</h2>
      <p>${spineResult.overall_description||'—'}</p>
      <h2>Yaşa Göre Öneri</h2>
      <p>${(spineResult.age_based_recommendation||'—').replace(/\n/g,'<br>')}</p>
      <h2>Tedavi Planı</h2>
      <p>${(spineResult.treatment_plan||'—').replace(/\n/g,'<br>')}</p>
      <h2>Takip Programı</h2>
      <p>${spineResult.followup_plan||'—'}</p>
      ${spineResult.imaging_indications && spineResult.imaging_indications!=='None' ? `<h2>Ek Tetkik Endikasyonları</h2><p>${spineResult.imaging_indications}</p>` : ''}
      ${notes ? `<h2>Hekim Notu</h2><p>${notes}</p>` : ''}
      <div class="disclaimer">
        ⚕ Bu rapor CobbAI yapay zeka analizi ile oluşturulmuştur. Tıbbi tanı yerine geçmez.
        Kesin tanı ve tedavi için lisanslı FTR Uzman Hekimine başvurunuz.
      </div>
    `;
  };

  const buildFootReport = () => {
    if (!footResult) return '';
    return `
      <h1>📋 CobbAI — Pes Planus Klinik Raporu</h1>
      <p style="color:#555;font-size:12px">${date} · ${time} · cobbai.vercel.app</p>
      <h2>Hasta Bilgileri</h2>
      <table>
        <tr><th>Yaş</th><td>${patientAge||'—'}</td><th>Cinsiyet</th><td>${patientGender||'—'}</td></tr>
        <tr><th>Ayak</th><td>${footResult.foot_side}</td><th>Güven</th><td>${footResult.measurement_confidence}</td></tr>
      </table>
      <h2>Ölçüm Sonuçları</h2>
      <table>
        <tr><th>Meary Açısı</th><td><strong>${footResult.meary_angle}°</strong></td><th>Yön</th><td>${footResult.meary_direction}</td></tr>
        <tr><th>Kalkaneal Pitch</th><td>${footResult.calcaneal_pitch}°</td><th>Talar Deklinasyon</th><td>${footResult.talar_declination}°</td></tr>
        <tr><th>Şiddet</th><td>${footResult.severity}</td><th>Esneklik</th><td>${footResult.flexibility}</td></tr>
      </table>
      <h2>Klinik Değerlendirme</h2>
      <p>${footResult.overall_description||'—'}</p>
      <h2>Tedavi Planı</h2>
      <p>${(footResult.treatment_plan||'—').replace(/\n/g,'<br>')}</p>
      ${footResult.orthotic_recommendations ? `<h2>Ortez Önerileri</h2><p>${footResult.orthotic_recommendations}</p>` : ''}
      ${notes ? `<h2>Hekim Notu</h2><p>${notes}</p>` : ''}
      <div class="disclaimer">⚕ Bu rapor CobbAI yapay zeka analizi ile oluşturulmuştur. Tıbbi tanı yerine geçmez.</div>
    `;
  };

  const html = modality === 'spine' ? buildSpineReport() : buildFootReport();

  // Hata 3 fix: lock body scroll + ensure z-index > sticky nav (100)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div style={{ position:'fixed', inset:0, zIndex:10000, background:'rgba(0,0,0,.88)', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'1rem', overflowY:'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#0e1419', border:'1px solid rgba(255,255,255,.15)', borderRadius:14, maxWidth:700, width:'100%', margin:'2rem auto' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid rgba(255,255,255,.08)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:18, fontWeight:600 }}>{t.reportTitle}</span>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={handlePrint} style={{ padding:'7px 14px', background:'#00c853', color:'#000', border:'none', borderRadius:7, fontSize:13, fontWeight:700, cursor:'pointer' }}>
              {t.printBtn}
            </button>
            <button onClick={onClose} style={{ width:32, height:32, border:'1px solid rgba(255,255,255,.15)', borderRadius:6, background:'transparent', color:'#7a8fa0', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
          </div>
        </div>
        <div ref={contentRef} style={{ padding:24, fontSize:14, color:'#b0bec5', lineHeight:1.7 }}
          dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
};

function sevBg(s: string) { return {normal:'rgba(0,214,143,.15)',mild:'rgba(240,160,69,.15)',moderate:'rgba(240,120,50,.15)',severe:'rgba(224,85,85,.15)'}[s]??'rgba(120,130,140,.15)'; }
function sevCol(s: string) { return {normal:'#00d68f',mild:'#f0a045',moderate:'#f07832',severe:'#e05555'}[s]??'#7a8fa0'; }

export default ReportModal;
