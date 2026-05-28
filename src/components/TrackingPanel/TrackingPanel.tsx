import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Lang } from '@/lib/i18n';
import { getT } from '@/lib/i18n';
import type { TrackEntry } from '@/lib/imageCache';

interface TrackingPanelProps {
  modality: 'spine' | 'foot';
  lang: Lang;
}

const STORAGE_KEYS: Record<'spine' | 'foot', string> = {
  spine: 'cobbai_track_spine',
  foot: 'cobbai_track_foot',
};

function loadEntries(key: string): TrackEntry[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    try {
      return JSON.parse(atob(raw)) as TrackEntry[];
    } catch {
      return JSON.parse(raw) as TrackEntry[];
    }
  } catch {
    return [];
  }
}

function clearEntries(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ITP */ }
}

function severityFromValue(modality: 'spine' | 'foot', value: number): { label: string; color: string } {
  if (modality === 'spine') {
    if (value < 10) return { label: 'Normal', color: 'var(--c-green, #4caf50)' };
    if (value < 25) return { label: 'Mild', color: 'var(--c-blue, #2196f3)' };
    if (value < 40) return { label: 'Moderate', color: 'var(--c-orange, #ff9800)' };
    return { label: 'Severe', color: 'var(--c-red, #f44336)' };
  } else {
    if (value <= 4) return { label: 'Normal', color: 'var(--c-green, #4caf50)' };
    if (value <= 15) return { label: 'Mild', color: 'var(--c-blue, #2196f3)' };
    if (value <= 30) return { label: 'Moderate', color: 'var(--c-orange, #ff9800)' };
    return { label: 'Severe', color: 'var(--c-red, #f44336)' };
  }
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

const CANVAS_H = 120;
const CANVAS_PADDING = { top: 16, right: 16, bottom: 24, left: 36 };

export const TrackingPanel: React.FC<TrackingPanelProps> = ({ modality, lang }) => {
  const t = getT(lang);
  const isRTL = lang === 'ar';
  const storageKey = STORAGE_KEYS[modality];

  const [entries, setEntries] = useState<TrackEntry[]>(() => loadEntries(storageKey));
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const reload = useCallback(() => {
    setEntries(loadEntries(storageKey));
  }, [storageKey]);

  useEffect(() => {
    reload();
  }, [modality, reload]);

  const handleClear = () => {
    clearEntries(storageKey);
    setEntries([]);
  };

  // Get primary value from entry
  const getValue = (e: TrackEntry): number | undefined =>
    modality === 'spine' ? e.cobb : e.meary;

  // Sorted ascending by timestamp
  const sorted = [...entries].sort((a, b) => a.ts - b.ts);
  const values = sorted.map((e) => getValue(e)).filter((v): v is number => v !== undefined);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || values.length < 2) return;
    if (canvas.offsetWidth === 0) return; // not yet laid out — avoid Infinity coords

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = CANVAS_H;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const { top, right, bottom, left } = CANVAS_PADDING;
    const chartW = W - left - right;
    const chartH = H - top - bottom;

    const minV = Math.min(...values) * 0.9;
    const maxV = Math.max(...values) * 1.1 || 1;

    const toX = (i: number) => left + (i / (values.length - 1)) * chartW;
    const toY = (v: number) => top + chartH - ((v - minV) / (maxV - minV)) * chartH;

    // Background
    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(76,175,80,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + chartW, y);
      ctx.stroke();
    }

    // Y axis labels
    ctx.fillStyle = 'rgba(200,220,200,0.45)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 2; i++) {
      const v = minV + ((maxV - minV) / 2) * i;
      const y = top + chartH - ((v - minV) / (maxV - minV)) * chartH;
      ctx.fillText(v.toFixed(0), left - 4, y + 3);
    }

    // Line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(76,175,80,0.55)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    values.forEach((v, i) => {
      const x = toX(i);
      const y = toY(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill under line
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = toX(i);
      const y = toY(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(toX(values.length - 1), top + chartH);
    ctx.lineTo(toX(0), top + chartH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(76,175,80,0.07)';
    ctx.fill();

    // Dots + labels for first and last
    values.forEach((v, i) => {
      const x = toX(i);
      const y = toY(v);
      const isEndpoint = i === 0 || i === values.length - 1;

      ctx.beginPath();
      ctx.arc(x, y, isEndpoint ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = isEndpoint ? '#4caf50' : 'rgba(76,175,80,0.7)';
      ctx.fill();

      if (isEndpoint) {
        ctx.fillStyle = '#4caf50';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = i === 0 ? 'left' : 'right';
        ctx.fillText(`${v.toFixed(1)}°`, x + (i === 0 ? 6 : -6), y - 6);
      }
    });

    // X axis: first and last date labels
    ctx.fillStyle = 'rgba(200,220,200,0.4)';
    ctx.font = '9px system-ui, sans-serif';
    if (sorted.length > 0) {
      ctx.textAlign = 'left';
      ctx.fillText(formatDate(sorted[0].date), left, H - 4);
      if (sorted.length > 1) {
        ctx.textAlign = 'right';
        ctx.fillText(formatDate(sorted[sorted.length - 1].date), left + chartW, H - 4);
      }
    }
  }, [values, sorted]);

  const cardStyle: React.CSSProperties = {
    background: 'var(--c-bg2, #0f1a14)',
    border: '1px solid var(--c-border, rgba(76,175,80,0.2))',
    borderRadius: 10,
    padding: '14px 16px',
    direction: isRTL ? 'rtl' : 'ltr',
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '1px',
    color: 'var(--c-muted, rgba(200,220,200,0.6))',
    textTransform: 'uppercase',
    margin: '0 0 12px 0',
  };

  // Trend summary
  let trendEl: React.ReactNode = null;
  if (values.length >= 2) {
    const first = values[0];
    const last = values[values.length - 1];
    const diff = last - first;
    const pct = first !== 0 ? ((diff / first) * 100).toFixed(1) : '—';
    const trendColor = diff > 0 ? 'var(--c-red, #f44336)' : diff < 0 ? 'var(--c-green, #4caf50)' : 'var(--c-muted, rgba(200,220,200,0.6))';
    const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
    trendEl = (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 8,
          padding: '6px 10px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--c-border, rgba(76,175,80,0.15))',
          borderRadius: 7,
        }}
      >
        <span style={{ fontSize: 18, color: trendColor, lineHeight: 1 }}>{arrow}</span>
        <span style={{ fontSize: 12, color: trendColor, fontWeight: 700 }}>
          {diff > 0 ? '+' : ''}{diff.toFixed(1)}° ({pct}%)
        </span>
        <span style={{ fontSize: 11, color: 'var(--c-muted, rgba(200,220,200,0.55))' }}>
          {first.toFixed(1)}° → {last.toFixed(1)}°
        </span>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <p style={sectionTitle}>{t.histTitle}</p>
        {entries.length > 0 && (
          <button
            onClick={handleClear}
            style={{
              background: 'none',
              border: '1px solid rgba(244,67,54,0.35)',
              color: 'rgba(244,67,54,0.7)',
              borderRadius: 6,
              padding: '3px 9px',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'border-color 0.15s, color 0.15s',
              letterSpacing: '0.3px',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(244,67,54,0.7)';
              (e.currentTarget as HTMLButtonElement).style.color = '#f44336';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(244,67,54,0.35)';
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(244,67,54,0.7)';
            }}
          >
            ✕ Clear
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--c-muted, rgba(200,220,200,0.45))', textAlign: 'center', margin: '20px 0' }}>
          {t.emptyMsg}
        </p>
      ) : (
        <>
          {/* Canvas chart */}
          {values.length >= 2 && (
            <div style={{ marginBottom: 12 }}>
              <canvas
                ref={canvasRef}
                style={{ width: '100%', height: CANVAS_H, display: 'block', borderRadius: 6, background: 'rgba(0,0,0,0.15)' }}
                height={CANVAS_H}
              />
              {trendEl}
            </div>
          )}

          {/* Timeline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...entries]
              .sort((a, b) => b.ts - a.ts)
              .map((entry, idx) => {
                const val = getValue(entry);
                const sev = val !== undefined ? severityFromValue(modality, val) : null;
                return (
                  <div
                    key={`${entry.ts}-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      background: 'rgba(255,255,255,0.025)',
                      border: '1px solid var(--c-border, rgba(76,175,80,0.12))',
                      borderRadius: 8,
                    }}
                  >
                    {/* Colored dot */}
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: sev?.color ?? 'var(--c-muted, rgba(200,220,200,0.4))',
                        flexShrink: 0,
                      }}
                    />

                    {/* Date */}
                    <span style={{ fontSize: 11, color: 'var(--c-muted, rgba(200,220,200,0.55))', minWidth: 90, flexShrink: 0 }}>
                      {formatDate(entry.date)}
                    </span>

                    {/* Value */}
                    {val !== undefined && (
                      <span style={{ fontSize: 15, fontWeight: 800, color: sev?.color ?? 'var(--c-text, #e8f5e9)', minWidth: 52 }}>
                        {val.toFixed(1)}°
                      </span>
                    )}

                    {/* Severity label */}
                    {sev && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: sev.color,
                          padding: '2px 7px',
                          border: `1px solid ${sev.color}44`,
                          borderRadius: 10,
                          background: `${sev.color}11`,
                        }}
                      >
                        {sev.label}
                      </span>
                    )}

                    {/* Source badge */}
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.5px',
                        color: 'var(--c-muted, rgba(200,220,200,0.4))',
                        textTransform: 'uppercase',
                      }}
                    >
                      {entry.source}
                    </span>
                  </div>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
};

export default TrackingPanel;
