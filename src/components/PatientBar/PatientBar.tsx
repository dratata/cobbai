import React from 'react';
import type { Lang } from '@/lib/i18n';
import { getT } from '@/lib/i18n';

interface PatientBarProps {
  lang: Lang;
  age: string;
  gender: string;
  onAgeChange: (v: string) => void;
  onGenderChange: (v: string) => void;
}

export const PatientBar: React.FC<PatientBarProps> = ({
  lang,
  age,
  gender,
  onAgeChange,
  onGenderChange,
}) => {
  const t = getT(lang);
  const isRTL = lang === 'ar';

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--c-border, rgba(76,175,80,0.25))',
    borderRadius: 8,
    color: 'var(--c-text, #e8f5e9)',
    fontSize: 13,
    padding: '6px 10px',
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 0.15s',
    minWidth: 0,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.8px',
    color: 'var(--c-muted, rgba(200,220,200,0.6))',
    textTransform: 'uppercase',
    display: 'block',
    marginBottom: 3,
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: 'var(--c-bg2, #0f1a14)',
        border: '1px solid var(--c-border, rgba(76,175,80,0.2))',
        borderRadius: 10,
        padding: '10px 16px',
        flexWrap: 'wrap',
        direction: isRTL ? 'rtl' : 'ltr',
      }}
    >
      {/* HASTA label */}
      <span
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '1px',
          color: 'var(--c-green, #4caf50)',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        {t.pLbl}
      </span>

      {/* Divider */}
      <div
        style={{
          width: 1,
          height: 28,
          background: 'var(--c-border, rgba(76,175,80,0.2))',
          flexShrink: 0,
        }}
      />

      {/* Age input */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <label style={labelStyle} htmlFor="patient-age">
          {t.pAge}
        </label>
        <input
          id="patient-age"
          type="number"
          min={1}
          max={120}
          value={age}
          onChange={(e) => onAgeChange(e.target.value)}
          placeholder="—"
          style={{ ...inputStyle, width: 72 }}
          onFocus={(e) => {
            (e.target as HTMLInputElement).style.borderColor = 'var(--c-green, #4caf50)';
          }}
          onBlur={(e) => {
            (e.target as HTMLInputElement).style.borderColor =
              'var(--c-border, rgba(76,175,80,0.25))';
          }}
        />
      </div>

      {/* Gender select */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <label style={labelStyle} htmlFor="patient-gender">
          {t.pGen}
        </label>
        <select
          id="patient-gender"
          value={gender}
          onChange={(e) => onGenderChange(e.target.value)}
          style={{ ...inputStyle, width: 140, cursor: 'pointer' }}
          onFocus={(e) => {
            (e.target as HTMLSelectElement).style.borderColor = 'var(--c-green, #4caf50)';
          }}
          onBlur={(e) => {
            (e.target as HTMLSelectElement).style.borderColor =
              'var(--c-border, rgba(76,175,80,0.25))';
          }}
        >
          <option value="">{t.opt0}</option>
          <option value="female">{t.opt1}</option>
          <option value="male">{t.opt2}</option>
        </select>
      </div>
    </div>
  );
};

export default PatientBar;
