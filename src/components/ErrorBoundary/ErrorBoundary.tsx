/**
 * ErrorBoundary.tsx — HATA 4 fix
 * Wraps lazy-loaded Suspense components.
 * Prevents white-screen crashes when chunk loading fails (e.g., network loss).
 */
import React from 'react';

interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  State
> {
  constructor(props: ErrorBoundary['props']) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[CobbAI ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      let lang = 'tr';
      try { lang = localStorage.getItem('cobbai_lang') ?? 'tr'; } catch { /* ITP / private */ }
      const title  = lang === 'ar' ? '⚠ تعذّر تحميل المكوّن'       : lang === 'en' ? '⚠ Component failed to load'    : '⚠ Bileşen yüklenemedi';
      const unknown= lang === 'ar' ? 'خطأ غير معروف'                : lang === 'en' ? 'Unknown error'                 : 'Bilinmeyen hata';
      const retry  = lang === 'ar' ? '🔄 إعادة المحاولة'           : lang === 'en' ? '🔄 Retry'                      : '🔄 Tekrar dene';
      return (
        <div style={{
          padding: '1rem 1.5rem',
          background: 'rgba(224,85,85,.08)',
          border: '1px solid rgba(224,85,85,.3)',
          borderRadius: 10, color: '#e05555', fontSize: 14, lineHeight: 1.7,
        }}>
          <strong>{title}</strong>
          <p style={{ fontSize: 12, color: '#7a8fa0', marginTop: 6 }}>
            {this.state.error?.message ?? unknown}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 10, padding: '6px 16px', background: 'transparent',
              border: '1px solid #e05555', borderRadius: 6, color: '#e05555',
              fontSize: 12, cursor: 'pointer' }}
          >
            {retry}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Convenience wrapper: ErrorBoundary + Suspense + spinner */
export const SafeSuspense: React.FC<{
  children: React.ReactNode;
  fallback?: React.ReactNode;
}> = ({ children, fallback }) => (
  <ErrorBoundary>
    <React.Suspense fallback={fallback ?? <ChunkSpinner />}>
      {children}
    </React.Suspense>
  </ErrorBoundary>
);

const ChunkSpinner = () => {
  let lang = 'tr';
  try { lang = localStorage.getItem('cobbai_lang') ?? 'tr'; } catch { /* ITP */ }
  const label = lang === 'ar' ? 'جارٍ التحميل…' : lang === 'en' ? 'Loading…' : 'Yükleniyor…';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px', color:'#7a8fa0', fontSize:13 }}>
      <div style={{ width:16, height:16, border:'2px solid rgba(0,200,83,.2)', borderTopColor:'#00c853',
        borderRadius:'50%', animation:'_espin .7s linear infinite', flexShrink:0 }}/>
      {label}
      <style>{`@keyframes _espin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default ErrorBoundary;
