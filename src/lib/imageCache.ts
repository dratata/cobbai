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
const MAX_ENTRIES = 20; // safety limit

/** Lightweight hash of a base64 string (not cryptographic — for dedup only) */
export async function hashBase64(b64: string): Promise<string> {
  // Use first 4KB + last 4KB + length for a fast discriminator
  const sample = b64.slice(0, 4096) + b64.slice(-4096) + b64.length.toString();
  if (typeof crypto?.subtle?.digest === 'function') {
    const buf = new TextEncoder().encode(sample);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback: simple djb2 hash
  let h = 5381;
  for (let i = 0; i < sample.length; i++) h = ((h << 5) + h) ^ sample.charCodeAt(i);
  return (h >>> 0).toString(16);
}

function cacheKey(hash: string, modality: string, lang: string): string {
  return CACHE_KEY_PREFIX + hash + '_' + modality + '_' + lang;
}

export function getCachedResult<T>(hash: string, modality: string, lang: string): T | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(hash, modality, lang));
    if (!raw) return null;
    const entry = JSON.parse(raw) as { result: T; ts: number };
    // Expire after 30 minutes (same session)
    if (Date.now() - entry.ts > 30 * 60 * 1000) {
      sessionStorage.removeItem(cacheKey(hash, modality, lang));
      return null;
    }
    return entry.result;
  } catch { return null; }
}

export function setCachedResult<T>(hash: string, modality: string, lang: string, result: T): void {
  try {
    // Evict oldest entries if over limit
    const keys = Object.keys(sessionStorage).filter(k => k.startsWith(CACHE_KEY_PREFIX));
    if (keys.length >= MAX_ENTRIES) {
      // Remove the oldest (lowest ts)
      const sorted = keys.map(k => {
        try { return { k, ts: (JSON.parse(sessionStorage.getItem(k)!) as { ts: number }).ts }; }
        catch { return { k, ts: 0 }; }
      }).sort((a, b) => a.ts - b.ts);
      sessionStorage.removeItem(sorted[0].k);
    }
    sessionStorage.setItem(
      cacheKey(hash, modality, lang),
      JSON.stringify({ result, ts: Date.now() })
    );
  } catch { /* ignore quota errors */ }
}

export function clearAllCache(): void {
  Object.keys(sessionStorage)
    .filter(k => k.startsWith(CACHE_KEY_PREFIX))
    .forEach(k => sessionStorage.removeItem(k));
}

export function clearTrackingHistory(): void {
  ['cobbai_track_spine', 'cobbai_track_foot'].forEach(k => localStorage.removeItem(k));
}

export function clearAllLocalData(): void {
  // Clear tracking
  clearTrackingHistory();
  // Clear cache
  clearAllCache();
  // Clear session role
  sessionStorage.removeItem('cobbai_role');
  sessionStorage.removeItem('cobbai_onboard');
  // Keep language preference
}
