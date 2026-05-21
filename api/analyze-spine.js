// analyze-spine.js
// Methodology: Cobb 1948 + Caesarendra et al. Diagnostics 2022;12:396
//              + Maeda et al. Scientific Reports 2023;13:14576
//              + AASCE MICCAI 2019 (68-landmark standard)
//
// v3: Measurement-only schema — clinical recommendations moved to local rules.
//     Fewer tokens, less hallucination risk, faster response.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured.' });

  let body = req.body;
  if (!body || typeof body === 'string') {
    try {
      const raw = typeof body === 'string' ? body : await getRawBody(req);
      body = JSON.parse(raw);
    } catch { return res.status(400).json({ error: 'Invalid request body.' }); }
  }

  const { imageBase64, mimeType, patientAge, patientGender, lang = 'en' } = body || {};
  if (!imageBase64 || !mimeType) return res.status(400).json({ error: 'Missing fields.' });
  // Body size guard — prevent multi-megabyte payloads from stalling the function
  if (typeof imageBase64 === 'string' && imageBase64.length > 12_000_000) {
    return res.status(413).json({ error: 'Image too large. Please resize to under 8 MB before uploading.' });
  }

  const isTR = lang === 'tr', isAR = lang === 'ar';

  // Measurement-only schema — NO long text fields (prevents literal newline JSON errors)
  const measureSchema = buildMeasureSchema(isTR, isAR);
  const invalidSchema  = buildInvalidSchema(isTR, isAR);

  const prompt = buildPrompt(lang, patientAge, patientGender)
    + '\n\n⚠ CRITICAL INSTRUCTION: The JSON schema below shows field NAMES and TYPES only.'
    + ' All numeric values (coordinates, angles, counts) are ZERO PLACEHOLDERS.'
    + ' You MUST replace every 0.0 coordinate with the actual measured value from the X-ray image.'
    + ' Do NOT return 0.0 or any placeholder value in your answer.'
    + ' Returning the placeholder coordinates will produce a clinically wrong result.\n'
    + '\nOutput ONLY this JSON (no extra text, no markdown):\n'
    + JSON.stringify(measureSchema)
    + '\nIf not a valid spine X-ray:\n'
    + JSON.stringify(invalidSchema);

  // Model selection: GEMINI_MODEL env var → 'gemini-3.5-pro' default.
  // Pro has significantly better spatial reasoning for landmark localisation;
  // Flash is kept as fallback for high-traffic / rate-limited scenarios.
  // Set GEMINI_MODEL=gemini-3.5-flash in Vercel env to revert if needed.
  // Default: gemini-3.5-flash (fast, cheap, good for routine cases).
  // For difficult/low-confidence cases set GEMINI_MODEL=gemini-3.5-pro in Vercel env
  // or use the "High-accuracy re-analysis" button which the UI can trigger separately.
  const model  = (process.env.GEMINI_MODEL || 'gemini-3.5-flash').trim();
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const reqBody = {
    contents: [{ parts: [
      { inline_data: { mime_type: mimeType, data: imageBase64 } },
      { text: prompt }
    ]}],
    generationConfig: {
      temperature:      0.05,
      maxOutputTokens:  3072,          // reduced — no clinical text
      responseMimeType: 'application/json',
      // thinkingBudget: 0 caused the model to echo schema placeholder coordinates
      // without actually analysing the image spatial layout.
      // 1024 thinking tokens lets the model reason about vertebra positions before
      // committing to coordinates — dramatically reduces coordinate hallucination.
      // thinkingBudget: 1024 caused 429 rate-limit errors on the free tier —
      // thinking tokens count against the same quota as output tokens and
      // exhaust the RPM limit much faster. Back to 0 (standard Flash speed).
      thinkingConfig:   { thinkingBudget: 0 }
    }
  };

  // ── Fix 1: Server-side abort when client disconnects ─────────────────────
  // Problem: abortRef.current?.abort() on the client cancels the TCP connection
  // to Vercel, but Vercel's function keeps running and Gemini keeps generating
  // tokens — wasting API cost. The function then tries to write a response to
  // a closed socket (silent error) but the tokens are already burned.
  //
  // Fix: AbortController shared between the client-close listener and the
  // Gemini fetch. When the client disconnects, req emits 'close' and we abort
  // the in-flight Gemini request before it generates any more tokens.
  //
  // ── Fix 3: Hard 8-second timeout on the Gemini fetch ─────────────────────
  // Problem: Gemini occasionally stalls (no headers, no body) and the Vercel
  // function hits its max execution time, producing an opaque 504 gateway error.
  //
  // Fix: the same AbortController is armed with an 8-second timeout. If Gemini
  // doesn't respond within 8 s we abort and return a clean 504 message.
  // Vercel Hobby limit is 10 s; 8 s gives us 2 s of slack for JSON parsing.
  const geminiCtrl    = new AbortController();
  let   clientClosed  = false;

  // Fix 1: detect client disconnect
  req.on('close', () => {
    clientClosed = true;
    geminiCtrl.abort(new Error('CLIENT_DISCONNECTED'));
  });

  // Fix 3: 8 s hard timeout
  const GEMINI_TIMEOUT_MS = 8_000;
  const timeoutId = setTimeout(
    () => geminiCtrl.abort(new Error('GEMINI_TIMEOUT')),
    GEMINI_TIMEOUT_MS
  );

  async function callGemini() {
    return fetch(apiUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(reqBody),
      signal:  geminiCtrl.signal,  // ← propagates both abort signals to Gemini
    });
  }

  try {
    let r = await callGemini();
    clearTimeout(timeoutId); // ← cancel the 8-s timer now that we have a response

    // Safe JSON parse — Gemini occasionally returns non-JSON on errors
    let d;
    try { d = await r.json(); }
    catch { return res.status(502).json({ error: 'Gemini returned non-JSON response. Try again.' }); }

    // Return 429 immediately on overload (no sleep — Vercel timeout risk)
    if (!r.ok) {
      const msg = d?.error?.message || '';
      const busy = r.status === 429 || r.status === 503
        || msg.includes('high demand') || msg.includes('overloaded') || msg.includes('quota');
      if (busy) {
        const busyMsg = lang === 'tr'
          ? 'Sunucu şu an çok yoğun, lütfen 5 saniye sonra tekrar deneyin.'
          : lang === 'ar'
          ? 'الخادم مشغول جداً، يرجى المحاولة مرة أخرى بعد 5 ثوانٍ.'
          : 'Server is busy, please try again in 5 seconds.';
        return res.status(429).json({ error: busyMsg, retryAfter: 5 });
      }
      return res.status(r.status).json({ error: msg || 'Gemini error: ' + r.status });
    }

    const finishReason = d?.candidates?.[0]?.finishReason;
    const raw = ((d?.candidates?.[0]?.content?.parts || [])
      .map(p => p?.text || '')
      .join('') || '').trim();
    if (!raw) return res.status(500).json({ error: 'Empty response from AI. Please try again.' });

    const parsed = recoverJSON(raw, finishReason);
    if (parsed.error) return res.status(500).json({ error: parsed.error });
    return res.status(200).json(parsed.result);

  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      if (clientClosed) {
        // Fix 1: client already disconnected — nothing to respond to, exit silently
        return;
      }
      // Fix 3: timed out waiting for Gemini — return a clean error
      if (!res.headersSent) {
        return res.status(504).json({
          error: lang === 'tr'
            ? 'Google AI 8 saniye içinde yanıt vermedi. Lütfen tekrar deneyin.'
            : lang === 'ar'
            ? 'لم يستجب Google AI خلال 8 ثوانٍ. يرجى المحاولة مرة أخرى.'
            : 'Google AI did not respond within 8 seconds. Please try again.',
        });
      }
      return;
    }
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Server error: ' + err.message });
    }
  }
}

// ─── JSON Recovery ────────────────────────────────────────────────────────
// The root cause of "JSON could not be recovered" with finishReason:STOP:
// Gemini occasionally emits literal newlines inside string values (invalid JSON).
// sanitizeJSON() fixes this by escaping them character-by-character.

function sanitizeJSON(str) {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (escaped) { result += c; escaped = false; continue; }
    if (c === '\\') { result += c; escaped = true; continue; }
    if (c === '"') { inString = !inString; result += c; continue; }
    if (inString) {
      if (c === '\n') { result += '\\n'; continue; }
      if (c === '\r') { result += '\\r'; continue; }
      if (c === '\t') { result += '\\t'; continue; }
    }
    result += c;
  }
  return result;
}

function recoverJSON(raw, finishReason) {
  // Level 0: try raw directly (responseMimeType:json should give clean JSON)
  try { return { result: JSON.parse(raw) }; } catch {}

  // Level 1: strip ALL markdown fences (multi-line safe)
  let clean = raw
    .replace(/```json[\s\S]*?```/gi, s => s.replace(/```json\s*/i,'').replace(/```\s*$/,''))
    .replace(/^```[\w]*\s*/m, '')
    .replace(/\s*```$/m, '')
    .trim();
  // Extract only first { ... last } — ignore surrounding text
  const firstBrace = clean.indexOf('{');
  const lastBrace  = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.slice(firstBrace, lastBrace + 1);
  }
  try { return { result: JSON.parse(clean) }; } catch {}

  // Level 2: sanitize literal newlines in strings (main fix for STOP errors)
  const sanitized = sanitizeJSON(clean);
  try { return { result: JSON.parse(sanitized) }; } catch {}

  // Level 3: extract JSON object + remove trailing commas
  const s = sanitized.indexOf('{');
  if (s === -1) return { error: 'No JSON in response. Try again.' };
  const e = sanitized.lastIndexOf('}');
  if (e !== -1) {
    let candidate = sanitized.slice(s, e + 1);
    // Remove trailing commas before } or ]
    candidate = candidate.replace(/,(\s*[}\]])/g, '$1');
    try { return { result: JSON.parse(candidate) }; } catch {}

    // Level 4: close open brackets
    let fixed = candidate;
    if ((fixed.match(/"/g)||[]).length % 2 !== 0) fixed += '"';
    const ab = (fixed.match(/\[/g)||[]).length - (fixed.match(/\]/g)||[]).length;
    const ob = (fixed.match(/\{/g)||[]).length - (fixed.match(/\}/g)||[]).length;
    for(let i=0;i<ab;i++) fixed+=']';
    for(let i=0;i<ob;i++) fixed+='}';
    try { return { result: JSON.parse(fixed) }; } catch {}

    // Level 5: trim to last complete key-value pair
    const lastComma = fixed.lastIndexOf(',');
    if (lastComma > s + 10) {
      let trimmed = fixed.slice(0, lastComma);
      const ob2 = (trimmed.match(/\{/g)||[]).length - (trimmed.match(/\}/g)||[]).length;
      const ab2 = (trimmed.match(/\[/g)||[]).length - (trimmed.match(/\]/g)||[]).length;
      for(let i=0;i<ab2;i++) trimmed+=']';
      for(let i=0;i<ob2;i++) trimmed+='}';
      try { return { result: JSON.parse(trimmed) }; } catch {}
    }
  }

  return { error: 'AI response could not be parsed. Please try again. (finishReason: ' + (finishReason||'?') + ')' };
}

// ─── Prompt ───────────────────────────────────────────────────────────────
// LANDMARK-ONLY. The application computes all angles, severity, and clinical
// recommendations locally. The AI's only job: identify which vertebrae and
// WHERE their corners are.

function buildPrompt(lang, age, gender) {
  const pa = age    ? (lang==='tr'?'Hasta yaşı: '+age  :lang==='ar'?'العمر: '+age  :'Age: '+age)    : '';
  const pg = gender ? (lang==='tr'?' | Cinsiyet: '+gender:lang==='ar'?' | الجنس: '+gender:' | Sex: '+gender) : '';

  if (lang === 'tr') return `Sen SRS/SOSORT 2024 omurga radyologusun. ${pa}${pg}

COBB 1948 PROTOKOLÜ (Caesarendra 2022 ICC=0.995 + Maeda 2023 ICC=0.973):

ADIM 1 — GÖRÜNTÜ KALİTESİ
  Ayakta PA/AP tam omurga? image_quality: good / poor / unacceptable

ADIM 2 — KOORDİNAT SİSTEMİ
  Sol-üst=(0.0, 0.0) | Sağ-alt=(1.0, 1.0)

ADIM 3 — ÜÇ VERTEBRAYI BELİRLE
  A) APEKS: Orta çizgiden en fazla sapan vertebra → apex_x, apex_y
  B) ÜST UÇ: Apeks üstünde üst endplate eğimi komşulardan >=5° fazla olan
     upper_corners: ul, ur (üst endplate) + ll, lr (alt kenar) — GERÇEK KEMIK
  C) ALT UÇ: Apeks altında alt endplate eğimi komşulardan >=5° fazla olan
     lower_corners: ul, ur + ll, lr — GERÇEK KEMIK

ADIM 4 — COBB AÇISI HESAPLA
  Üst uç vertebranın üst endplate eğimi = upper_slope_deg
  Alt uç vertebranın alt endplate eğimi = lower_slope_deg
  cobb_angle = |upper_slope_deg − lower_slope_deg| (tam sayıya yuvarla)

ADIM 5 — GENEL
  convexity_direction: right/left | curve_location: thoracic/thoracolumbar/lumbar
  coronal_balance: balanced/left_shift/right_shift`;

  if (lang === 'ar') return `أنت طبيب أشعة متخصص (SRS/SOSORT 2024). ${pa}${pg}

بروتوكول Cobb 1948:
1. image_quality: good/poor/unacceptable
2. إحداثيات: (0,0) أعلى يسار، (1,1) أسفل يمين
3. حدد: الذروة (apex_x,y) + الفقرة العلوية (upper_corners) + السفلية (lower_corners)
4. upper_slope_deg, lower_slope_deg, cobb_angle = |upper-lower|
5. convexity_direction, curve_location, coronal_balance`;

  return `You are a spinal deformity radiologist (SRS/SOSORT 2024). ${pa}${pg}

COBB 1948 MEASUREMENT PROTOCOL (Caesarendra 2022 ICC=0.995, Maeda 2023 ICC=0.973):

STEP 1 — IMAGE QUALITY
  Standing PA/AP full-spine X-ray? image_quality: good / poor / unacceptable

STEP 2 — COORDINATE SYSTEM
  Origin (0,0) = TOP-LEFT. (1,1) = BOTTOM-RIGHT. All values in [0,1].

STEP 3 — IDENTIFY 3 VERTEBRAE AND MARK THEIR CORNERS
  A) APEX — most laterally displaced vertebra → apex_x, apex_y (center)
  B) SUPERIOR END VERTEBRA — most cranial vertebra above apex whose SUPERIOR
     (top) endplate tilts ≥5° more than any vertebra above it.
     upper_corners: { ul, ur, ll, lr } — corners on ACTUAL BONE SURFACE
       ul/ur = top edge (superior endplate), ll/lr = bottom edge
  C) INFERIOR END VERTEBRA — most caudal vertebra below apex whose INFERIOR
     (bottom) endplate tilts ≥5° more than any vertebra below it.
     lower_corners: { ul, ur, ll, lr } — ul/ur = top edge, ll/lr = bottom edge

  CRITICAL: ul/ur of upper_corners must have SMALLER Y than ll/lr of lower_corners.
  Coordinates must be on the visible cortical bone, not the vertebral body center.

STEP 4 — MEASURE COBB ANGLE
  upper_slope_deg: inclination of superior end vertebra's TOP endplate (right-down = +)
  lower_slope_deg: inclination of inferior end vertebra's BOTTOM endplate (right-down = +)
  cobb_angle: |upper_slope_deg − lower_slope_deg| (round to nearest integer)

STEP 5 — CLASSIFY
  convexity_direction: right / left
  curve_location: thoracic / thoracolumbar / lumbar
  coronal_balance: balanced / left_shift / right_shift

STEP 1 — IMAGE QUALITY
  Is this a standing PA/AP full-spine X-ray?
  image_quality: good / poor / unacceptable

STEP 2 — COORDINATE SYSTEM
  Origin (0,0) = TOP-LEFT of image. (1,1) = BOTTOM-RIGHT. All values in [0,1].

STEP 3 — IDENTIFY AND MARK 3 VERTEBRAE

  A) APEX VERTEBRA — most laterally displaced from the mid-sagittal line.
     Set apex_x, apex_y to its center coordinates.

  B) SUPERIOR END VERTEBRA — most cranial vertebra in the curve whose SUPERIOR
     (top) endplate tilts ≥5° more than any vertebra above it in the curve.
     Provide upper_corners: the 4 corners of THIS vertebra:
       ul = [upper-left x, y]    ur = [upper-right x, y]
       ll = [lower-left x, y]    lr = [lower-right x, y]
     CRITICAL: ul/ur must be on the actual TOP bone edge of this vertebra.

  C) INFERIOR END VERTEBRA — most caudal vertebra in the curve whose INFERIOR
     (bottom) endplate tilts ≥5° more than any vertebra below it in the curve.
     Provide lower_corners: the 4 corners of THIS vertebra:
       ul = [upper-left x, y]    ur = [upper-right x, y]
       ll = [lower-left x, y]    lr = [lower-right x, y]
     CRITICAL: ll/lr must be on the actual BOTTOM bone edge of this vertebra.

  COORDINATE PRECISION: Place corners on the visible cortical bone surface.
  Superior end corners (ul/ur of upper_corners) MUST have smaller Y values than
  inferior end corners (ll/lr of lower_corners).

STEP 4 — CURVE CHARACTERISTICS
  convexity_direction: right / left
  curve_location: thoracic / thoracolumbar / lumbar
  coronal_balance: balanced / left_shift / right_shift`;
}

// ─── Schema ──────────────────────────────────────────────────────────────
// ⚠ ALL NUMERIC VALUES ARE ZERO PLACEHOLDERS.
//   Replace every 0.0 with actual measurements from the X-ray image.
function buildMeasureSchema(isTR, isAR) {
  return {
    is_valid_xray: true,
    image_quality: 'good',
    view_type: 'PA',
    curve_type: 'single',
    measurement_confidence: 'high',
    curves: [{
      upper_vertebra_name: 'T0',   // replace with real name, e.g. "T5"
      lower_vertebra_name: 'T0',   // replace with real name, e.g. "T12"
      apical_vertebra_name: 'T0',  // replace with real name, e.g. "T9"
      convexity_direction: 'right',
      curve_location: 'thoracic',
      upper_corners: { ul:[0.0,0.0], ur:[0.0,0.0], ll:[0.0,0.0], lr:[0.0,0.0] },
      lower_corners: { ul:[0.0,0.0], ur:[0.0,0.0], ll:[0.0,0.0], lr:[0.0,0.0] },
      upper_slope_deg: 0,   // endplate slope in degrees (right-down = positive)
      lower_slope_deg: 0,
      cobb_angle: 0,        // |upper_slope_deg − lower_slope_deg|
      apex_x: 0.0,
      apex_y: 0.0
    }],
    coronal_balance: 'balanced'
  };
}

function buildInvalidSchema(isTR, isAR) {
  return {
    is_valid_xray: false,
    image_quality: 'unacceptable',
    view_type: 'unknown',
    curve_type: 'single',
    measurement_confidence: 'low',
    measurement_method: 'endplate',
    vertebrae_detected: 0,
    curves: [],
    coronal_balance: 'unknown',
    warnings: [isTR ? 'Geçerli omurga röntgeni değil' : isAR ? 'ليست صورة صحيحة' : 'Not a valid spine X-ray']
  };
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let d = ''; req.on('data', c => { d += c; }); req.on('end', () => resolve(d)); req.on('error', reject);
  });
}
