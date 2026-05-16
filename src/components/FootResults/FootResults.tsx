import React from 'react';
import type { FootAnalysisResult } from '@/types';
import type { Lang } from '@/lib/i18n';
import { getT } from '@/lib/i18n';

interface FootResultsProps {
  result: FootAnalysisResult;
  lang: Lang;
}

function severityColor(s: string): string {
  switch (s) {
    case 'normal': return 'var(--c-green, #4caf50)';
    case 'mild': return 'var(--c-blue, #2196f3)';
    case 'moderate': return 'var(--c-orange, #ff9800)';
    case 'severe': return 'var(--c-red, #f44336)';
    default: return 'var(--c-muted, rgba(200,220,200,0.6))';
  }
}

export const FootResults: React.FC<FootResultsProps> = ({ result, lang }) => {
  const t = getT(lang);
  const isRTL = lang === 'ar';

  const color = severityColor(result.severity);
  const severityLabel = t.sevF[result.severity] ?? result.severity;
  const flexLabel = t.flex[result.flexibility] ?? result.flexibility;

  const sectionTitle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '1px',
    color: 'var(--c-muted, rgba(200,220,200,0.6))',
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 0,
  };

  const card: React.CSSProperties = {
    background: 'var(--c-bg2, #0f1a14)',
    border: '1px solid var(--c-border, rgba(76,175,80,0.2))',
    borderRadius: 10,
    padding: '14px 16px',
    marginBottom: 12,
  };

  const descBox: React.CSSProperties = {
    background: 'rgba(76,175,80,0.05)',
    border: '1px solid rgba(76,175,80,0.15)',
    borderRadius: 8,
    padding: '12px 14px',
    fontSize: 13,
    lineHeight: 1.65,
    color: 'var(--c-text, #e8f5e9)',
    marginBottom: 12,
  };

  const metricCard: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--c-border, rgba(76,175,80,0.18))',
    borderRadius: 8,
    padding: '10px 12px',
    textAlign: 'center',
    flex: 1,
    minWidth: 0,
  };

  const recRow: React.CSSProperties = {
    borderBottom: '1px solid var(--c-border, rgba(76,175,80,0.12))',
    paddingBottom: 10,
    marginBottom: 10,
  };

  const recLabel: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.5px',
    color: 'var(--c-muted, rgba(200,220,200,0.6))',
    textTransform: 'uppercase',
    marginBottom: 4,
  };

  const recText: React.CSSProperties = {
    fontSize: 13,
    lineHeight: 1.6,
    color: 'var(--c-text, #e8f5e9)',
    margin: 0,
  };

  // Reference table rows
  const refRows = [
    { range: '≤ 4°', sev: t.fr1, desc: t.fd1, color: 'var(--c-green, #4caf50)' },
    { range: '4–15°', sev: t.fr2, desc: t.fd2, color: 'var(--c-blue, #2196f3)' },
    { range: '15–30°', sev: t.fr3, desc: t.fd3, color: 'var(--c-orange, #ff9800)' },
    { range: '> 30°', sev: t.fr4, desc: t.fd4, color: 'var(--c-red, #f44336)' },
  ];

  return (
    <div style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      {/* Severity + flexibility header */}
      <div style={{ ...card, borderColor: color, borderLeftWidth: isRTL ? 1 : 3, borderRightWidth: isRTL ? 3 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          {/* Severity pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                padding: '4px 14px',
                borderRadius: 20,
                border: `1px solid ${color}`,
                background: `${color}22`,
                color,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.3px',
              }}
            >
              {severityLabel}
            </span>
            <span
              style={{
                padding: '3px 10px',
                borderRadius: 20,
                border: '1px solid rgba(200,220,200,0.2)',
                background: 'rgba(200,220,200,0.05)',
                color: 'var(--c-muted, rgba(200,220,200,0.7))',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {flexLabel}
            </span>
          </div>

          {/* Confidence */}
          <span
            style={{
              fontSize: 11,
              color: 'var(--c-muted, rgba(200,220,200,0.55))',
              fontWeight: 600,
            }}
          >
            {t.conf[result.measurement_confidence] ?? result.measurement_confidence}
          </span>
        </div>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {/* Meary */}
        <div style={metricCard}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', color: 'var(--c-muted, rgba(200,220,200,0.6))', textTransform: 'uppercase', marginBottom: 4 }}>
            {t.flM}°
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>
            {result.meary_angle != null ? result.meary_angle.toFixed(1) : 'N/A'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--c-muted, rgba(200,220,200,0.45))', marginTop: 2 }}>
            {result.meary_direction}
          </div>
        </div>

        {/* Calcaneal pitch */}
        <div style={metricCard}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', color: 'var(--c-muted, rgba(200,220,200,0.6))', textTransform: 'uppercase', marginBottom: 4 }}>
            {t.flC}°
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-text, #e8f5e9)', lineHeight: 1 }}>
            {result.calcaneal_pitch != null ? result.calcaneal_pitch.toFixed(1) : 'N/A'}
          </div>
        </div>

        {/* Talar declination */}
        <div style={metricCard}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', color: 'var(--c-muted, rgba(200,220,200,0.6))', textTransform: 'uppercase', marginBottom: 4 }}>
            {t.flT}°
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-text, #e8f5e9)', lineHeight: 1 }}>
            {result.talar_declination != null ? result.talar_declination.toFixed(1) : 'N/A'}
          </div>
        </div>
      </div>

      {/* Description */}
      {result.overall_description && (
        <div style={descBox}>
          {result.overall_description}
        </div>
      )}

      {/* Recommendations */}
      <div style={card}>
        <p style={sectionTitle}>{t.recTitle}</p>

        {result.age_based_recommendation && (
          <div style={recRow}>
            <div style={recLabel}>{t.rt1}</div>
            <p style={recText}>{result.age_based_recommendation}</p>
          </div>
        )}

        {result.treatment_plan && (
          <div style={recRow}>
            <div style={recLabel}>{t.rt2}</div>
            <p style={recText}>{result.treatment_plan}</p>
          </div>
        )}

        {result.followup_plan && (
          <div style={{ ...recRow, borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
            <div style={recLabel}>{t.rt3}</div>
            <p style={recText}>{result.followup_plan}</p>
          </div>
        )}
      </div>

      {/* Orthotic recommendations */}
      {result.orthotic_recommendations && (
        <div style={card}>
          <p style={sectionTitle}>{t.orthoTitle}</p>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: 'var(--c-text, #e8f5e9)' }}>
            {result.orthotic_recommendations}
          </p>
        </div>
      )}

      {/* Imaging indications */}
      {result.imaging_indications && (
        <div style={card}>
          <p style={sectionTitle}>{t.imgTitle}</p>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: 'var(--c-text, #e8f5e9)' }}>
            {result.imaging_indications}
          </p>
        </div>
      )}

      {/* Reference table */}
      <div style={card}>
        <p style={sectionTitle}>{t.refTitle}</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <tbody>
            {refRows.map((row) => (
              <tr
                key={row.range}
                style={{
                  borderBottom: '1px solid var(--c-border, rgba(76,175,80,0.12))',
                  background:
                    'transparent',
                }}
              >
                <td style={{ padding: '6px 8px', color: row.color, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {row.range}
                </td>
                <td style={{ padding: '6px 8px', fontWeight: 700, color: row.color }}>
                  {row.sev}
                </td>
                <td style={{ padding: '6px 8px', color: 'var(--c-muted, rgba(200,220,200,0.7))' }}>
                  {row.desc}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Disclaimer */}
      <p
        style={{
          fontSize: 11,
          color: 'var(--c-muted, rgba(200,220,200,0.45))',
          lineHeight: 1.6,
          borderTop: '1px solid var(--c-border, rgba(76,175,80,0.12))',
          paddingTop: 10,
          margin: 0,
        }}
        dangerouslySetInnerHTML={{ __html: t.discFinal }}
      />
    </div>
  );
};

export default FootResults;
