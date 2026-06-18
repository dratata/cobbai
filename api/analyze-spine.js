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

  // Sanitize user-supplied fields before prompt injection
  const safeAge    = typeof patientAge    === 'string' ? patientAge.replace(/[^0-9.]/g, '').slice(0, 5)       : '';
  const safeGender = typeof patientGender === 'string' ? patientGender.replace(/[^a-zA-Z]/g, '').slice(0, 10) : '';

  const isTR = lang === 'tr', isAR = lang === 'ar';

  // Measurement-only schema — NO long text fields (prevents literal newline JSON errors)
  const measureSchema = buildMeasureSchema(isTR, isAR);
  const invalidSchema  = buildInvalidSchema(isTR, isAR);

  const prompt = buildPrompt(lang, safeAge, safeGender)
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
  // ── Fix 3: Hard timeout on the Gemini fetch ───────────────────────────────
  // Problem: Gemini occasionally stalls (no headers, no body) and the Vercel
  // function hits its max execution time, producing an opaque 504 gateway error.
  // An earlier 8 s timeout was too aggressive — multimodal (image) Gemini
  // calls routinely take longer than 8 s, causing frequent false-positive
  // timeouts. vercel.json now sets maxDuration:30 for this function, so the
  // abort timeout is raised to match, with slack for JSON parsing/response writing.
  const geminiCtrl    = new AbortController();
  let   clientClosed  = false;

  // Fix 1: detect client disconnect
  req.on('close', () => {
    clientClosed = true;
    geminiCtrl.abort(new Error('CLIENT_DISCONNECTED'));
  });

  // Fix 3: hard timeout — keep below vercel.json's maxDuration:30 for this function
  const GEMINI_TIMEOUT_MS = 28_000;
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
            ? 'Google AI zamanında yanıt vermedi. Lütfen tekrar deneyin.'
            : lang === 'ar'
            ? 'لم يستجب Google AI في الوقت المحدد. يرجى المحاولة مرة أخرى.'
            : 'Google AI did not respond in time. Please try again.',
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
Bu ayakta PA/AP omurga röntgenindeki TÜM skolyoz eğrilerini Cobb 1948 yöntemiyle ölç.

ADIM 1 — GÖRÜNTÜ KALİTESİ
  Ayakta PA/AP tam omurga? image_quality: good / poor / unacceptable

ADIM 2 — KOORDİNAT SİSTEMİ
  Sol-üst=(0.0, 0.0) | Sağ-alt=(1.0, 1.0). Vertebraları say: C1-7, T1-12 (kostalı), L1-5.

ADIM 3 — TÜM EĞRİLERİ BELİRLE
  Skolyozda genelde BİRDEN FAZLA eğri vardır:
    • PRİMER (majör) eğri — en büyük, yapısal eğri. Her zaman var.
    • SEKONDER (kompansatuar) eğri — ters yöne kıvrılır. Cobb ≥ 10° ise dahil et.
    • TERSİYER eğri — sadece belirgin ve ≥ 10° ise.
  "curves" dizisine HER eğri için bir nesne ekle (1-3 adet). Büyükten küçüğe sırala.

  HER EĞRİ İÇİN:
  (a) APEKS: Bu eğrinin orta çizgiden en fazla sapan vertebrası → apex_x, apex_y
  (b) ÜST UÇ: Apeks üstünde üst endplate eğimi bu eğriye en fazla giren vertebra
      upper_vertebra_name (örn "T5") + upper_corners (ul,ur üst kenar | ll,lr alt kenar)
  (c) ALT UÇ: Apeks altında alt endplate eğimi bu eğriye en fazla giren vertebra
      lower_vertebra_name (örn "T12") + lower_corners
  (d) upper_slope_deg, lower_slope_deg, cobb_angle = |upper_slope − lower_slope|
  (e) convexity_direction: right/left | curve_location: thoracic/thoracolumbar/lumbar

  KRİTİK: Köşeler GÖRÜNÜR BEYAZ KORTEKS kenarında olsun, vertebra ortasında DEĞİL.
  Komşu eğriler bir geçiş vertebrasını PAYLAŞIR.

ADIM 4 — GENEL
  coronal_balance: balanced/left_shift/right_shift | curve_type: single/double/triple`;

  if (lang === 'ar') return `أنت طبيب أشعة متخصص (SRS/SOSORT 2024). ${pa}${pg}
قِس كل انحناءات الجنف في صورة العمود الفقري هذه بطريقة Cobb 1948.

1. image_quality: good/poor/unacceptable
2. إحداثيات: (0,0) أعلى يسار، (1,1) أسفل يمين
3. حدد كل الانحناءات (1-3): الأساسي + الثانوي (إذا ≥10°). لكل انحناء أضف كائناً في "curves":
   - الذروة (apex_x,y) + الفقرة العلوية (upper_vertebra_name, upper_corners)
     + الفقرة السفلية (lower_vertebra_name, lower_corners)
   - upper_slope_deg, lower_slope_deg, cobb_angle = |upper-lower|
   - convexity_direction, curve_location
   ضع الزوايا على حافة العظم القشري المرئية.
4. coronal_balance, curve_type: single/double/triple`;

  return `You are an expert radiologist specializing in spinal deformity (SRS/SOSORT 2024). ${pa}${pg}
Measure ALL scoliotic curves from this standing PA/AP spine X-ray using the Cobb 1948 method.

─── IMAGE COORDINATES ───────────────────────────────────────────────────────
Origin (0,0) = TOP-LEFT of image. (1,1) = BOTTOM-RIGHT. All coordinates in [0,1].

─── STEP 1: IMAGE QUALITY ───────────────────────────────────────────────────
Is this a valid standing PA/AP full-spine X-ray?
image_quality: good / poor / unacceptable

─── STEP 2: LOCATE THE SPINE ───────────────────────────────────────────────
The spine runs vertically near the center. Count vertebrae from top:
  C1-C7 (cervical, 7), T1-T12 (thoracic, 12, with rib attachments), L1-L5 (lumbar, 5, larger).

─── STEP 3: IDENTIFY ALL CURVES ─────────────────────────────────────────────
Scoliosis often has MORE THAN ONE curve:
  • PRIMARY (major) curve — the largest, most structural curve. Always present.
  • SECONDARY (compensatory) curve — bends the OPPOSITE direction, above or below
    the primary. Include it if its Cobb angle is ≥ 10°.
  • TERTIARY curve — only if clearly present and ≥ 10°.
Return one object in the "curves" array for EACH curve (1 to 3 objects).
Order them by size: largest Cobb angle first.

─── FOR EACH CURVE, DO THE FOLLOWING ────────────────────────────────────────

  (a) APEX — the vertebra of THIS curve most laterally displaced from the
      midline. Set apex_x, apex_y to its center.

  (b) SUPERIOR END VERTEBRA — scanning up from the apex, the highest vertebra
      whose SUPERIOR (top) endplate tilts maximally INTO this curve.
      upper_vertebra_name: e.g. "T5"
      upper_corners: 4 corners of THIS vertebra on the cortical bone edge:
        ul=[x,y] top-left   ur=[x,y] top-right
        ll=[x,y] bottom-left lr=[x,y] bottom-right
      (ul/ur Y-values < ll/lr Y-values)

  (c) INFERIOR END VERTEBRA — scanning down from the apex, the lowest vertebra
      whose INFERIOR (bottom) endplate tilts maximally INTO this curve.
      lower_vertebra_name: e.g. "T12"
      lower_corners: same 4-corner format on cortical bone.

  (d) SLOPES + COBB:
      upper_slope_deg: tilt of the superior end vertebra's TOP endplate
                       (right-down = positive, right-up = negative)
      lower_slope_deg: tilt of the inferior end vertebra's BOTTOM endplate
      cobb_angle: |upper_slope_deg − lower_slope_deg| (1 decimal)

  (e) convexity_direction: right / left (side the curve bulges toward)
      curve_location: thoracic / thoracolumbar / lumbar

CRITICAL: Place ALL corners on the visible WHITE cortical bone edge — never the
center of the vertebral body. Adjacent curves SHARE a transitional vertebra: the
inferior end vertebra of the upper curve is usually the superior end vertebra of
the curve below it.

─── STEP 4: OVERALL ─────────────────────────────────────────────────────────
coronal_balance: balanced / left_shift / right_shift
curve_type: single (1 curve) / double (2) / triple (3)`;
}

// ─── Schema ──────────────────────────────────────────────────────────────
// ⚠ ALL NUMERIC VALUES ARE ZERO PLACEHOLDERS.
//   Replace every 0.0 with actual measurements from the X-ray image.
//   "curves" is an ARRAY: return 1 object per curve (1-3), largest Cobb first.
function buildMeasureSchema(isTR, isAR) {
  const curveTemplate = {
    upper_vertebra_name: 'T0',   // real name, e.g. "T5"
    lower_vertebra_name: 'T0',   // real name, e.g. "T12"
    apical_vertebra_name: 'T0',  // real name, e.g. "T9"
    convexity_direction: 'right',
    curve_location: 'thoracic',
    upper_corners: { ul:[0.0,0.0], ur:[0.0,0.0], ll:[0.0,0.0], lr:[0.0,0.0] },
    lower_corners: { ul:[0.0,0.0], ur:[0.0,0.0], ll:[0.0,0.0], lr:[0.0,0.0] },
    upper_slope_deg: 0,   // endplate slope in degrees (right-down = positive)
    lower_slope_deg: 0,
    cobb_angle: 0,        // |upper_slope_deg − lower_slope_deg|
    apex_x: 0.0,
    apex_y: 0.0
  };
  return {
    is_valid_xray: true,
    image_quality: 'good',
    view_type: 'PA',
    curve_type: 'single',          // single / double / triple
    measurement_confidence: 'high',
    // Return one entry PER CURVE found (1-3). Example shows the structure for one.
    curves: [curveTemplate],
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
