/**
 * imageCache.ts
 *
 * Client-side AI result caching by image hash + modality + lang.
 * Prevents duplicate API calls for the same image.
 * Stored in sessionStorage (cleared on tab close = no persistent patient data).
 *
 * Does NOT cache base64 images — only the AI measurement result.
 */

const CACHE_KEY_PREFIX = 'cobbai_cache_';
// Cache-format version sentinel (written by App.tsx on mount). It shares the
// CACHE_KEY_PREFIX, so it MUST be excluded from result-eviction/clearing — its
// value is a plain version string, not a JSON {result, ts} entry. Including it
// made eviction parse-fail (ts=0) and always evict the sentinel first, which
// triggered a spurious full-cache wipe on the next page load.
export const CACHE_VERSION_KEY = 'cobbai_cache_ver';

// ── Tracking history ──────────────────────────────────────────

export interface TrackEntry {
  date: string;   // ISO-8601
  cobb?: number;
  meary?: number;
  source: 'ai' | 'manual';
  ts: number;
  note?: string;
}

const TRACKING_KEYS = { spine: 'cobbai_track_spine', foot: 'cobbai_track_foot' } as const;
const MAX_TRACK_ENTRIES = 100;

function loadTrackEntries(modality: 'spine' | 'foot'): TrackEntry[] {
  try {
    const raw = localStorage.getItem(TRACKING_KEYS[modality]);
    if (!raw) return [];
    try { return JSON.parse(atob(raw)) as TrackEntry[]; }
    catch { return JSON.parse(raw) as TrackEntry[]; }
  } catch { return []; }
}

export function saveTrackEntry(modality: 'spine' | 'foot', entry: TrackEntry): void {
  try {
    const existing = loadTrackEntries(modality);
    const updated  = [...existing, entry].slice(-MAX_TRACK_ENTRIES);
    localStorage.setItem(TRACKING_KEYS[modality], btoa(JSON.stringify(updated)));
  } catch { /* quota or ITP */ }
}
const MAX_ENTRIES = 20; // safety limit

/** Lightweight hash of a base64 string (not cryptographic — for dedup only).
 *
 * IMPORTANT: Do NOT only sample first+last bytes!
 * Preprocessed JPEGs share identical headers (same quality=0.87 quantisation
 * tables) so first ~2 KB of base64 is identical across ALL images.
 * We sample 5 evenly-spaced 2 KB windows throughout the file so that
 * different X-ray anatomies produce different hashes. */
export async function hashBase64(b64: string): Promise<string> {
  const len = b64.length;
  const chunk = 2048;
  const sample =
    b64.slice(0, chunk) +
    b64.slice(Math.floor(len * 0.25), Math.floor(len * 0.25) + chunk) +
    b64.slice(Math.floor(len * 0.50), Math.floor(len * 0.50) + chunk) +
    b64.slice(Math.floor(len * 0.75), Math.floor(len * 0.75) + chunk) +
    b64.slice(-chunk) +
    len.toString();

  if (typeof crypto?.subtle?.digest === 'function') {
    const buf  = new TextEncoder().encode(sample);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).slice(0, 10).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback: djb2 over the full sample string
  let h = 5381;
  for (let i = 0; i < sample.length; i++) h = ((h << 5) + h) ^ sample.charCodeAt(i);
  return (h >>> 0).toString(16);
}

/**
 * Build the cache key.
 *
 * Fix 2 — patient demographics (age / gender) are now part of the key.
 *
 * Problem: the AI prompt includes patientAge and patientGender to tailor
 * age-based recommendations. If a doctor uploaded an image, got a result,
 * then corrected the age from "15" to "45" and hit Analyze again WITHOUT
 * force-refresh, the old cached result (with "15-year-old" recommendations)
 * was returned because the key only used the image hash + modality + lang.
 *
 * Fix: append age and gender (normalized to lower-case, trimmed) so that any
 * change in demographics produces a different key → new API call.
 */
function cacheKey(
  hash: string, modality: string, lang: string,
  age = '', gender = ''
): string {
  const ageKey    = age.trim().toLowerCase()    || 'noage';
  const genderKey = gender.trim().toLowerCase() || 'nogender';
  return `${CACHE_KEY_PREFIX}${hash}_${modality}_${lang}_${ageKey}_${genderKey}`;
}

export function getCachedResult<T>(
  hash: string, modality: string, lang: string,
  age?: string, gender?: string
): T | null {
  try {
    const key = cacheKey(hash, modality, lang, age, gender);
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { result: T; ts: number };
    // Expire after 30 minutes (same session)
    if (Date.now() - entry.ts > 30 * 60 * 1000) {
      sessionStorage.removeItem(key);
      return null;
    }
    return entry.result;
  } catch { return null; }
}

export function setCachedResult<T>(
  hash: string, modality: string, lang: string,
  result: T,
  age?: string, gender?: string
): void {
  try {
    // Evict oldest entries if over limit
    const keys = Object.keys(sessionStorage).filter(k => k.startsWith(CACHE_KEY_PREFIX) && k !== CACHE_VERSION_KEY);
    if (keys.length >= MAX_ENTRIES) {
      const sorted = keys.map(k => {
        try { return { k, ts: (JSON.parse(sessionStorage.getItem(k)!) as { ts: number }).ts }; }
        catch { return { k, ts: 0 }; }
      }).sort((a, b) => a.ts - b.ts);
      sessionStorage.removeItem(sorted[0].k);
    }
    sessionStorage.setItem(
      cacheKey(hash, modality, lang, age, gender),
      JSON.stringify({ result, ts: Date.now() })
    );
  } catch { /* ignore quota errors */ }
}

export function clearAllCache(): void {
  Object.keys(sessionStorage)
    .filter(k => k.startsWith(CACHE_KEY_PREFIX) && k !== CACHE_VERSION_KEY)
    .forEach(k => sessionStorage.removeItem(k));
}

export function clearTrackingHistory(): void {
  ['cobbai_track_spine', 'cobbai_track_foot'].forEach(k => {
    try { localStorage.removeItem(k); } catch { /* ITP */ }
  });
}

export function clearAllLocalData(): void {
  clearTrackingHistory();
  clearAllCache();
  try { sessionStorage.removeItem('cobbai_role'); } catch { /* ITP */ }
  // cobbai_onboard / cobbai_kvkk live in localStorage (not sessionStorage)
  try { localStorage.removeItem('cobbai_onboard'); } catch { /* ITP */ }
  try { localStorage.removeItem('cobbai_kvkk'); } catch { /* ITP */ }
}
