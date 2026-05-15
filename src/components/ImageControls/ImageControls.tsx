import React, { useState } from 'react';
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
  onAutoEnhance: () => void;
  onReset: () => void;
  onExportPNG: () => void;
  showOverlay: boolean;
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
  onAutoEnhance,
  onReset,
  onExportPNG,
  showOverlay,
}) => {
  const t = getT(lang);
  const isRTL = lang === 'ar';

  const [brightness, setBrightness] = useState<number>(0);
  const [contrast, setContrast] = useState<number>(100);
  const [opacity, setOpacity] = useState<number>(100);

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

        {/* Divider */}
        <div style={{ width: 1, height: 22, background: 'var(--c-border, rgba(76,175,80,0.2))', flexShrink: 0 }} />

        {/* Toggle overlay */}
        <button
          style={showOverlay ? activeBtnStyle : btnStyle}
          onClick={onToggleOverlay}
          onMouseEnter={(e) => hoverBtn(e, showOverlay)}
          onMouseLeave={(e) => unhoverBtn(e, showOverlay)}
        >
          {t.ctrlBA}
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
