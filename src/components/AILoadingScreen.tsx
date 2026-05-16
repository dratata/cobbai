// src/components/AILoadingScreen.tsx
import React from 'react';

interface AILoadingScreenProps {
  lang?: string;
}

const AILoadingScreen: React.FC<AILoadingScreenProps> = ({ lang = 'tr' }) => {
  const title = lang === 'ar' ? 'جارٍ تحليل الذكاء الاصطناعي'
    : lang === 'en' ? 'AI ANALYSIS IN PROGRESS'
    : 'AI ANALİZİ YÜKLENİYOR';

  const sub = lang === 'ar'
    ? 'يتم تقسيم العمود الفقري وحساب زوايا كوب… يرجى الانتظار.'
    : lang === 'en'
    ? 'Spine segmentation and Cobb angle calculation in progress… Please wait.'
    : 'Omurga segmentasyonu yapılıyor ve Cobb açıları hesaplanıyor… Lütfen bekleyin.';

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(10,15,19,0.88)',
      backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      zIndex: 50, borderRadius: '10px',
    }}>
      {/* Dual-ring spinner */}
      <div style={{ position: 'relative', width: 80, height: 80, marginBottom: 20 }}>
        <div className="_ai-ring _ai-ring-green" />
        <div className="_ai-ring _ai-ring-blue" />
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)', fontSize: 24,
        }}>🤖</div>
      </div>

      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '1.5px', color: '#00c853' }}>
        {title}
      </h3>
      <p style={{ fontSize: 12, color: '#7a8fa0', marginTop: 8, maxWidth: '80%', textAlign: 'center', lineHeight: 1.6 }}>
        {sub}
      </p>

      <style>{`
        ._ai-ring {
          box-sizing: border-box;
          display: block;
          position: absolute;
          border-radius: 50%;
        }
        ._ai-ring-green {
          width: 80px; height: 80px;
          border: 4px solid transparent;
          border-top-color: #00c853;
          animation: _ai-spin 1.1s cubic-bezier(.5,0,.5,1) infinite;
        }
        ._ai-ring-blue {
          width: 58px; height: 58px;
          top: 11px; left: 11px;
          border: 4px solid transparent;
          border-bottom-color: #2196f3;
          animation: _ai-spin 1.1s cubic-bezier(.5,0,.5,1) infinite reverse;
        }
        @keyframes _ai-spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default AILoadingScreen;
