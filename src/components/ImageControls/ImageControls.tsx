import React, { useState, useEffect } from 'react';
import type { Lang } from '@/lib/i18n';
import { getT } from '@/lib/i18n';

interface ImageControlsProps {
  lang: Lang;
  onBrightnessChange: (v: number) => void;
  onContrastChange: (v: number) => void;
  onOpacityChange: (v: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onToggleOverlay: () => void;
  onToggleVertebraLabels: () => void;
  onToggleApexLabel: () => void;
  onAutoEnhance: () => void;
  onReset: () => void;
  onExportPNG: () => void;
  showOverlay: boolean;
  showVertebraLabels: boolean;
  showApexLabel: boolean;
  // Fix #1+#2: Controlled values from store so reset/auto-enhance sync sliders
  brightnessValue?: number;
  contrastValue?: number;
  opacityValue?: number;
  zoomValue?: number;
}

export const ImageControls: React.FC<ImageControlsProps> = ({
  lang,
  onBrightnessChange,
  onContrastChange,
  onOpacityChange,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onToggleOverlay,
  onToggleVertebraLabels,
  onToggleApexLabel,
  onAutoEnhance,
  onReset,
  onExportPNG,
  showOverlay,
  showVertebraLabels,
  showApexLabel,
  brightnessValue,
  contrastValue,
  opacityValue,
  zoomValue,
}) => {
  const t = getT(lang);
  const isRTL = lang === 'ar';

  // Initialize from controlled props; sync when store changes externally
  const [brightness, setBrightness] = useState<number>(brightnessValue ?? 0);
  const [contrast,   setContrast]   = useState<number>(contrastValue   ?? 100);
  const [opacity,    setOpacity]    = useState<number>(opacityValue    ?? 100);

  useEffect(() => { setBrightness(brightnessValue ?? 0);   }, [brightnessValue]);
  useEffect(() => { setContrast(contrastValue     ?? 100); }, [contrastValue]);
  useEffect(() => { setOpacity(opacityValue       ?? 100); }, [opacityValue]);

  const handleBrightness = (v: number) => {
    setBrightness(v);
    onBrightnessChange(v);
  };

  const handleContrast = (v: number) => {
    setContrast(v);
    onContrastChange(v);
  };

  const handleOpacity = (v: number) => {
    setOpacity(v);
    onOpacityChange(v);
  };

  const handleReset = () => {
    setBrightness(0);
    setContrast(100);
    setOpacity(100);
    onReset();
  };

  const containerStyle: React.CSSProperties = {
    background: 'var(--c-bg2, #0f1a14)',
    border: '1px solid var(--c-border, rgba(76,175,80,0.2))',
    borderRadius: 10,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    direction: isRTL ? 'rtl' : 'ltr',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--c-muted, rgba(200,220,200,0.65))',
    minWidth: 90,
    flexShrink: 0,
  };

  const sliderStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 80,
    height: 4,
    accentColor: 'var(--c-green, #4caf50)',
    cursor: 'pointer',
  };

  const valueStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--c-green, #4caf50)',
    fontWeight: 700,
    minWidth: 32,
    textAlign: isRTL ? 'left' : 'right',
  };

  const btnStyle: React.CSSProperties = {
    padding: '6px 11px',
    borderRadius: 7,
    border: '1px solid var(--c-border, rgba(76,175,80,0.3))',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--c-text, #e8f5e9)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'inherit',
    transition: 'background 0.15s, border-color 0.15s',
    whiteSpace: 'nowrap',
  };

  const activeBtnStyle: React.CSSProperties = {
    ...btnStyle,
    background: 'rgba(76,175,80,0.15)',
    borderColor: 'var(--c-green, #4caf50)',
    color: 'var(--c-green, #4caf50)',
  };

  const hoverBtn = (e: React.MouseEvent<HTMLButtonElement>, active = false) => {
    const el = e.currentTarget;
    if (active) {
      el.style.background = 'rgba(76,175,80,0.25)';
    } else {
      el.style.background = 'rgba(255,255,255,0.08)';
      el.style.borderColor = 'rgba(76,175,80,0.5)';
    }
  };

  const unhoverBtn = (e: React.MouseEvent<HTMLButtonElement>, active = false) => {
    const el = e.currentTarget;
    if (active) {
      el.style.background = 'rgba(76,175,80,0.15)';
    } else {
      el.style.background = 'rgba(255,255,255,0.04)';
      el.style.borderColor = 'var(--c-border, rgba(76,175,80,0.3))';
    }
  };

  return (
    <div style={containerStyle}>
      {/* Brightness */}
      <div style={rowStyle}>
        <span style={labelStyle}>{t.ctrlBr}</span>
        <input
          type="range"
          min={-80}
          max={80}
          step={2}
          value={brightness}
          onChange={(e) => handleBrightness(Number(e.target.value))}
          style={sliderStyle}
        />
        <span style={valueStyle}>{brightness > 0 ? `+${brightness}` : brightness}</span>
      </div>

      {/* Contrast */}
      <div style={rowStyle}>
        <span style={labelStyle}>{t.ctrlCt}</span>
        <input
          type="range"
          min={50}
          max={200}
          step={5}
          value={contrast}
          onChange={(e) => handleContrast(Number(e.target.value))}
          style={sliderStyle}
        />
        <span style={valueStyle}>{contrast}%</span>
      </div>

      {/* Overlay opacity */}
      <div style={rowStyle}>
        <span style={labelStyle}>{t.ctrlOp}</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={opacity}
          onChange={(e) => handleOpacity(Number(e.target.value))}
          style={sliderStyle}
        />
        <span style={valueStyle}>{opacity}%</span>
      </div>

      {/* Button row */}
      <div style={{ ...rowStyle, flexWrap: 'wrap' }}>
        {/* Zoom controls */}
        <button
          style={btnStyle}
          onClick={onZoomOut}
          onMouseEnter={(e) => hoverBtn(e)}
          onMouseLeave={(e) => unhoverBtn(e)}
          title="Zoom out"
        >
          🔍−
        </button>
        <button
          style={btnStyle}
          onClick={onResetZoom}
          onMouseEnter={(e) => hoverBtn(e)}
          onMouseLeave={(e) => unhoverBtn(e)}
          title="Reset zoom"
        >
          1:1
        </button>
        <button
          style={btnStyle}
          onClick={onZoomIn}
          onMouseEnter={(e) => hoverBtn(e)}
          onMouseLeave={(e) => unhoverBtn(e)}
          title="Zoom in"
        >
          🔍+
        </button>
        {/* Fix #2: zoom percentage indicator */}
        <span style={{ fontSize: 11, color: 'var(--c-green, #4caf50)', fontWeight: 800, minWidth: 42, textAlign: 'center' }}>
          {Math.round((zoomValue ?? 1) * 100)}%
        </span>

        {/* Divider */}
        <div style={{ width: 1, height: 22, background: 'var(--c-border, rgba(76,175,80,0.2))', flexShrink: 0 }} />

        {/* Toggle overlay */}
        <button
          style={showOverlay ? activeBtnStyle : btnStyle}
          onClick={onToggleOverlay}
          onMouseEnter={(e) => hoverBtn(e, showOverlay)}
          onMouseLeave={(e) => unhoverBtn(e, showOverlay)}
          title={lang === 'tr' ? 'Overlay\'i göster/gizle' : 'Show/hide overlay'}
        >
          {t.ctrlBA}
        </button>

        {/* Toggle vertebra labels (intermediate: T6, T7…) */}
        <button
          style={showVertebraLabels ? activeBtnStyle : btnStyle}
          onClick={onToggleVertebraLabels}
          onMouseEnter={(e) => hoverBtn(e, showVertebraLabels)}
          onMouseLeave={(e) => unhoverBtn(e, showVertebraLabels)}
          title={lang === 'tr' ? 'Ara vertebra etiketleri (T6, T7…)' : 'Intermediate vertebra labels (T6, T7…)'}
        >
          T▪
        </button>

        {/* Toggle apex label */}
        <button
          style={showApexLabel ? activeBtnStyle : btnStyle}
          onClick={onToggleApexLabel}
          onMouseEnter={(e) => hoverBtn(e, showApexLabel)}
          onMouseLeave={(e) => unhoverBtn(e, showApexLabel)}
          title={lang === 'tr' ? 'Apeks vertebra etiketini göster/gizle' : 'Show/hide apex label'}
        >
          ◇
        </button>

        {/* Auto enhance */}
        <button
          style={btnStyle}
          onClick={onAutoEnhance}
          onMouseEnter={(e) => hoverBtn(e)}
          onMouseLeave={(e) => unhoverBtn(e)}
        >
          ✨ Auto
        </button>

        {/* Reset */}
        <button
          style={btnStyle}
          onClick={handleReset}
          onMouseEnter={(e) => hoverBtn(e)}
          onMouseLeave={(e) => unhoverBtn(e)}
        >
          {t.ctrlReset}
        </button>

        {/* Export PNG */}
        <button
          style={{ ...btnStyle, marginLeft: 'auto' }}
          onClick={onExportPNG}
          onMouseEnter={(e) => hoverBtn(e)}
          onMouseLeave={(e) => unhoverBtn(e)}
        >
          {t.ctrlPng}
        </button>
      </div>
    </div>
  );
};

export default ImageControls;
