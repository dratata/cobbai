// src/components/CobbAILogo.tsx
import React from 'react';

interface LogoProps {
  width?: number;
  height?: number;
}

const CobbAILogo: React.FC<LogoProps> = ({ width = 40, height = 40 }) => (
  <svg width={width} height={height} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" rx="22" fill="#0a0f13" />
    <rect x="2" y="2" width="96" height="96" rx="20" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
    <path d="M 35 25 Q 60 45 45 65 T 65 85" stroke="#2196f3" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.6" />
    <path d="M 45 20 Q 70 40 55 60 T 75 80" stroke="#00c853" strokeWidth="6" strokeLinecap="round" fill="none" />
    <circle cx="45" cy="20" r="5" fill="#00c853" />
    <circle cx="58" cy="48" r="4" fill="#00c853" />
    <circle cx="55" cy="60" r="5" fill="#2196f3" />
    <circle cx="75" cy="80" r="6" fill="#00c853" />
    <circle cx="35" cy="25" r="4" fill="#2196f3" />
    <circle cx="45" cy="20" r="10" fill="#00c853" opacity="0.3" />
    <circle cx="75" cy="80" r="12" fill="#00c853" opacity="0.3" />
  </svg>
);

export default CobbAILogo;
