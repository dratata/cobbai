/**
 * build-copy.mjs
 * Vercel deploy öncesi static dosyaları dist/ klasörüne kopyalar.
 * "npm run build" tarafından otomatik çalıştırılır.
 */

import { copyFileSync, mkdirSync, cpSync, existsSync } from 'fs';

// Kopyalanacak HTML sayfaları
const htmlFiles = [
  'patients.html',
  'validation.html',
  'tests.html',
  'info-scoliosis.html',
  'info-flatfoot.html',
  'info-scoliosis-patient.html',
  'info-flatfoot-patient.html',
  'index.legacy.html',
];

// Kopyalanacak tekil dosyalar (favicon, manifest, vs.)
const staticFiles = [
  'favicon.ico',
  'favicon.svg',
  'favicon-64.png',
  'icon-192.png',
  'icon-512.png',
  'manifest.json',
  'sw.js',
  'ads.txt',
];

// Kopyalanacak klasörler
const dirs = ['exercises'];

let copied = 0;

htmlFiles.forEach(f => {
  if (existsSync(f)) { copyFileSync(f, `dist/${f}`); copied++; }
  else console.warn(`  skip (not found): ${f}`);
});

staticFiles.forEach(f => {
  if (existsSync(f)) { copyFileSync(f, `dist/${f}`); copied++; }
});

dirs.forEach(dir => {
  if (existsSync(dir)) {
    mkdirSync(`dist/${dir}`, { recursive: true });
    cpSync(dir, `dist/${dir}`, { recursive: true });
    copied++;
    console.log(`  ✓ ${dir}/ klasörü kopyalandı`);
  }
});

console.log(`✓ ${copied} dosya/klasör dist/ klasörüne kopyalandı`);
