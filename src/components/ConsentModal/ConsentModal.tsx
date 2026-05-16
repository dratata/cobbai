import React from 'react';
import type { Lang } from '@/lib/i18n';
import { getT } from '@/lib/i18n';

interface ConsentModalProps {
  open: boolean;
  lang: Lang;
  onAccept: () => void;
  onClose: () => void;
}

export const ConsentModal: React.FC<ConsentModalProps> = ({ open, lang, onAccept, onClose }) => {
  const t = getT(lang);
  const isRTL = lang === 'ar';

  // Hata 3 fix: lock body scroll when open + Escape key close
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', handler);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: isRTL ? 'rtl' : 'ltr',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '90vh',
          background: 'var(--c-bg2, #0f1a14)',
          border: '1px solid var(--c-border, rgba(76,175,80,0.25))',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-modal-title"
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--c-border, rgba(76,175,80,0.2))',
            flexShrink: 0,
          }}
        >
          <h2
            id="consent-modal-title"
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--c-text, #e8f5e9)',
              letterSpacing: '0.3px',
            }}
          >
            {t.modalTitle}
          </h2>
          <button
            onClick={onClose}
            aria-label={t.modalClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--c-muted, rgba(200,220,200,0.6))',
              fontSize: 20,
              lineHeight: 1,
              padding: '4px 6px',
              borderRadius: 6,
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-text, #e8f5e9)';
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-muted, rgba(200,220,200,0.6))';
              (e.currentTarget as HTMLButtonElement).style.background = 'none';
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            color: 'var(--c-text, #e8f5e9)',
            fontSize: 13,
            lineHeight: 1.7,
          }}
          dangerouslySetInnerHTML={{ __html: t.kvBody }}
        />

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: '14px 20px',
            borderTop: '1px solid var(--c-border, rgba(76,175,80,0.2))',
            flexShrink: 0,
            justifyContent: isRTL ? 'flex-start' : 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: '1px solid var(--c-border, rgba(76,175,80,0.3))',
              background: 'transparent',
              color: 'var(--c-muted, rgba(200,220,200,0.7))',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(200,220,200,0.5)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-text, #e8f5e9)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-border, rgba(76,175,80,0.3))';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-muted, rgba(200,220,200,0.7))';
            }}
          >
            {t.modalClose}
          </button>
          <button
            onClick={onAccept}
            style={{
              padding: '8px 22px',
              borderRadius: 8,
              border: '1px solid var(--c-green, #4caf50)',
              background: 'var(--c-green, #4caf50)',
              color: '#000',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'inherit',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '0.85';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '1';
            }}
          >
            {t.modalAccept}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConsentModal;
