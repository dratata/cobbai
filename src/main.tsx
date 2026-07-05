import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWA service worker — enables offline caching + installability.
// (manifest.json + icons are built and deployed, but were never wired up
// from this entry point; index.legacy.html registered it but that page
// isn't served as the app root — see vercel.json's rewrite to /index.html.)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
