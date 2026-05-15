import React from 'react';
import type { Lang } from '@/lib/i18n';
import { getT } from '@/lib/i18n';

interface LandingScreenProps {
  onDoctor: () => void;
  onPatient: () => void;
  lang: Lang;
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 99999,
    background: '#080c0f',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    overflowY: 'auto',
  },
  inner: {
    width: '100%',
    maxWidth: 480,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 24,
  },
  logoBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  logoText: {
    fontSize: 36,
    fontWeight: 800,
    letterSpacing: '-1px',
    color: '#e8f5e9',
    margin: 0,
  },
  logoAccent: {
    color: 'var(--c-green, #4caf50)',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 12px',
    background: 'rgba(76,175,80,0.12)',
    border: '1px solid rgba(76,175,80,0.35)',
    borderRadius: 20,
    color: 'var(--c-green, #4caf50)',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
  },
  subtitle: {
    textAlign: 'center' as const,
    color: 'rgba(200,220,200,0.7)',
    fontSize: 13,
    lineHeight: 1.5,
    margin: 0,
    maxWidth: 360,
  },
  cardsContainer: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  cardBase: {
    width: '100%',
    padding: '20px 22px',
    borderRadius: 12,
    border: '2px solid',
    background: 'rgba(255,255,255,0.04)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 16,
    transition: 'background 0.18s, border-color 0.18s, transform 0.12s',
    textAlign: 'left' as const,
    outline: 'none',
    appearance: 'none' as const,
    fontFamily: 'inherit',
  },
  doctorCard: {
    borderColor: 'rgba(76,175,80,0.4)',
  },
  patientCard: {
    borderColor: 'rgba(33,150,243,0.4)',
  },
  cardIcon: {
    fontSize: 32,
    lineHeight: 1,
    flexShrink: 0,
    marginTop: 2,
  },
  cardContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#e8f5e9',
    margin: 0,
  },
  cardSub: {
    fontSize: 12,
    color: 'rgba(200,220,200,0.65)',
    margin: 0,
    lineHeight: 1.5,
  },
  disclaimer: {
    fontSize: 11,
    color: 'rgba(200,220,200,0.45)',
    textAlign: 'center' as const,
    margin: 0,
    lineHeight: 1.6,
  },
};

export const LandingScreen: React.FC<LandingScreenProps> = ({ onDoctor, onPatient, lang }) => {
  const t = getT(lang);
  const isRTL = lang === 'ar';

  const [doctorHover, setDoctorHover] = React.useState(false);
  const [patientHover, setPatientHover] = React.useState(false);

  return (
    <div style={{ ...styles.overlay, direction: isRTL ? 'rtl' : 'ltr' }}>
      <div style={styles.inner}>
        {/* Logo */}
        <div style={styles.logoBlock}>
          <h1 style={styles.logoText}>
            Cobb<span style={styles.logoAccent}>AI</span>
          </h1>
          <span style={styles.badge}>{t.aiChip}</span>
        </div>

        {/* Subtitle */}
        <p style={styles.subtitle}>{t.lsSub}</p>

        {/* Role cards */}
        <div style={styles.cardsContainer}>
          {/* Doctor card */}
          <button
            style={{
              ...styles.cardBase,
              ...styles.doctorCard,
              ...(doctorHover
                ? {
                    borderColor: 'rgba(76,175,80,0.85)',
                    background: 'rgba(76,175,80,0.08)',
                    transform: 'translateY(-1px)',
                  }
                : {}),
            }}
            onClick={onDoctor}
            onMouseEnter={() => setDoctorHover(true)}
            onMouseLeave={() => setDoctorHover(false)}
            onFocus={() => setDoctorHover(true)}
            onBlur={() => setDoctorHover(false)}
          >
            <span style={styles.cardIcon}>🏥</span>
            <div style={styles.cardContent}>
              <p style={{ ...styles.cardTitle, color: doctorHover ? 'var(--c-green, #4caf50)' : '#e8f5e9' }}>
                {t.lsDocTitle}
              </p>
              <p style={styles.cardSub}>{t.lsDocSub}</p>
            </div>
          </button>

          {/* Patient card */}
          <button
            style={{
              ...styles.cardBase,
              ...styles.patientCard,
              ...(patientHover
                ? {
                    borderColor: 'rgba(33,150,243,0.85)',
                    background: 'rgba(33,150,243,0.08)',
                    transform: 'translateY(-1px)',
                  }
                : {}),
            }}
            onClick={onPatient}
            onMouseEnter={() => setPatientHover(true)}
            onMouseLeave={() => setPatientHover(false)}
            onFocus={() => setPatientHover(true)}
            onBlur={() => setPatientHover(false)}
          >
            <span style={styles.cardIcon}>👤</span>
            <div style={styles.cardContent}>
              <p style={{ ...styles.cardTitle, color: patientHover ? 'var(--c-blue, #2196f3)' : '#e8f5e9' }}>
                {t.lsPatTitle}
              </p>
              <p style={styles.cardSub}>{t.lsPatSub}</p>
            </div>
          </button>
        </div>

        {/* Disclaimer */}
        <p style={styles.disclaimer}>{t.lsDisc}</p>
      </div>
    </div>
  );
};

export default LandingScreen;
