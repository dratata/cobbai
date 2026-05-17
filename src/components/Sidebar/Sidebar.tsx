import React from 'react';
import type { Lang } from '@/lib/i18n';

interface SidebarProps {
  modality: 'spine' | 'foot';
  lang: Lang;
  onSwitchModality: (m: 'spine' | 'foot') => void;
  labels: {
    dl1:string; dl2:string; dl3:string; dl4:string; dl5:string;
    dn1:string;ds1:string;dn2:string;ds2:string;
    dn3:string;ds3:string;dn4:string;ds4:string;
    dn5:string;ds5:string;dn6:string;ds6:string;
    dn7:string;ds7:string;dn8:string;ds8:string;
    dnVal:string;dsVal:string;
  };
  exLang: string;
  open: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  modality, lang, onSwitchModality, labels, exLang, open, onClose,
}) => {
  const isSpine = modality === 'spine';
  const isFoot  = modality === 'foot';

  const handleModality = (m: 'spine' | 'foot') => {
    onSwitchModality(m);
    onClose(); // close drawer on mobile after selection
  };

  return (
    <>
      {/* Dim overlay — only visible on mobile when drawer is open */}
      <div
        className={`cobb-sidebar-overlay${open ? ' cobb-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div className={`cobb-sidebar${open ? ' cobb-open' : ''}`} style={{
        width: 210, minWidth: 210,
        background: '#090e12',
        borderInlineEnd: '1px solid rgba(255,255,255,.08)',
        padding: '12px 0',
        position: 'fixed',
        top: 60,
        insetInlineStart: 0,
        height: 'calc(100vh - 60px)',
        overflowY: 'auto',
        zIndex: 50,
      }}>
        {/* Mobile close button */}
        <button
          className="cobb-hamburger"
          onClick={onClose}
          aria-label="Kapat"
          style={{
            position: 'absolute', top: 10, insetInlineEnd: 10,
            background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 6, color: '#7a8fa0', fontSize: 18,
            width: 32, height: 32, cursor: 'pointer',
            alignItems: 'center', justifyContent: 'center',
          }}
        >✕</button>

        {/* X-RAY ANALYSIS */}
        <Section>
          <Label>{labels.dl1}</Label>
          <NavBtn active={isSpine} activeClass="spine" onClick={() => handleModality('spine')} icon="🦴" name={labels.dn1} sub={labels.ds1} />
          <NavBtn active={isFoot}  activeClass="foot"  onClick={() => handleModality('foot')}  icon="🦶" name={labels.dn2} sub={labels.ds2} />
        </Section>

        {/* EXERCISES */}
        <Section>
          <Label>{labels.dl2}</Label>
          <NavLink href={`/exercises/scoliosis-exercises.html?lang=${exLang}`} icon="🧘" name={labels.dn3} sub={labels.ds3} onClick={onClose} />
          <NavLink href={`/exercises/flatfoot-exercises.html?lang=${exLang}`}  icon="👟" name={labels.dn4} sub={labels.ds4} onClick={onClose} />
        </Section>

        {/* FOR DOCTORS */}
        <Section>
          <Label>{labels.dl3}</Label>
          <NavLink href="/info-scoliosis.html" icon="🩺" name={labels.dn5} sub={labels.ds5} onClick={onClose} />
          <NavLink href="/info-flatfoot.html"  icon="🩺" name={labels.dn6} sub={labels.ds6} onClick={onClose} />
        </Section>

        {/* FOR PATIENTS */}
        <Section>
          <Label>{labels.dl4}</Label>
          <NavLink href="/info-scoliosis-patient.html" icon="👤" name={labels.dn7} sub={labels.ds7} onClick={onClose} />
          <NavLink href="/info-flatfoot-patient.html"  icon="👤" name={labels.dn8} sub={labels.ds8} onClick={onClose} />
        </Section>

        {/* VALIDATION */}
        <Section>
          <Label>{labels.dl5}</Label>
          <NavLink href="/validation.html" icon="📊" name={labels.dnVal} sub={labels.dsVal} onClick={onClose} />
          <NavLink href="/tests.html" icon="🧪" name={lang==='tr'?'Unit Testler':lang==='ar'?'اختبارات الوحدة':'Unit Tests'} sub="Cobb · geometry" onClick={onClose} />
        </Section>
      </div>
    </>
  );
};

/* ── Sub-components ─────────────────────────────────────────── */

const Section: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ padding:'4px 0', borderTop:'1px solid rgba(255,255,255,.06)', marginTop:4, paddingTop:4 }}>
    {children}
  </div>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ display:'block', fontSize:9, letterSpacing:'1.3px', color:'#4a5a6a', padding:'6px 16px 3px', fontWeight:700 }}>
    {children}
  </span>
);

interface NavBtnProps {
  active: boolean; activeClass: 'spine'|'foot';
  onClick: () => void;
  icon: string; name: string; sub: string;
}
const NavBtn: React.FC<NavBtnProps> = ({ active, activeClass, onClick, icon, name, sub }) => {
  const col = activeClass === 'spine' ? '#00c853' : '#2196f3';
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:10, padding:'11px 16px',
      fontSize:14, width:'100%', textAlign:'start', border:'none',
      borderInlineStart: active ? `3px solid ${col}` : '3px solid transparent',
      background: active ? (activeClass==='spine'?'rgba(0,200,83,.1)':'rgba(33,150,243,.1)') : 'none',
      color: active ? col : '#7a8fa0',
      cursor:'pointer', fontFamily:'inherit',
      transition:'background .12s, color .12s',
    }}
    onMouseEnter={e=>{if(!active){e.currentTarget.style.background='#111820';e.currentTarget.style.color='#eef2f7';}}}
    onMouseLeave={e=>{if(!active){e.currentTarget.style.background='none';e.currentTarget.style.color='#7a8fa0';}}}
    >
      <span style={{ fontSize:18, flexShrink:0, width:22, textAlign:'center' }}>{icon}</span>
      <div style={{ flex:1 }}>
        <span style={{ fontWeight:600, fontSize:14, display:'block' }}>{name}</span>
        <span style={{ fontSize:11, color: active ? col+'aa' : '#4a5a6a', marginTop:1, display:'block' }}>{sub}</span>
      </div>
    </button>
  );
};

interface NavLinkProps { href:string; icon:string; name:string; sub:string; onClick?: () => void; }
const NavLink: React.FC<NavLinkProps> = ({ href, icon, name, sub, onClick }) => (
  <a href={href} target="_blank" rel="noreferrer" onClick={onClick} style={{
    display:'flex', alignItems:'center', gap:10, padding:'11px 16px',
    fontSize:14, color:'#7a8fa0', textDecoration:'none',
    borderInlineStart:'3px solid transparent', transition:'background .12s, color .12s',
  }}
  onMouseEnter={e=>{e.currentTarget.style.background='#111820';e.currentTarget.style.color='#eef2f7';}}
  onMouseLeave={e=>{e.currentTarget.style.background='none';e.currentTarget.style.color='#7a8fa0';}}
  >
    <span style={{ fontSize:18, flexShrink:0, width:22, textAlign:'center' }}>{icon}</span>
    <div style={{ flex:1 }}>
      <span style={{ fontWeight:600, fontSize:14, display:'block' }}>{name}</span>
      <span style={{ fontSize:11, color:'#4a5a6a', marginTop:1, display:'block' }}>{sub}</span>
    </div>
    <span style={{ fontSize:12, color:'#4a5a6a' }}>↗</span>
  </a>
);

export default Sidebar;
