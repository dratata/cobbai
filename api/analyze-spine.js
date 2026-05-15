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

  const isTR = lang === 'tr', isAR = lang === 'ar';

  // Measurement-only schema — NO long text fields (prevents literal newline JSON errors)
  const measureSchema = buildMeasureSchema(isTR, isAR);
  const invalidSchema  = buildInvalidSchema(isTR, isAR);

  const prompt = buildPrompt(lang, patientAge, patientGender)
    + '\nOutput ONLY this JSON (no extra text, no markdown):\n'
    + JSON.stringify(measureSchema)
    + '\nIf not a valid spine X-ray:\n'
    + JSON.stringify(invalidSchema);

  const reqBody = {
    contents: [{ parts: [
      { inline_data: { mime_type: mimeType, data: imageBase64 } },
      { text: prompt }
    ]}],
    generationConfig: {
      temperature:      0.05,
      maxOutputTokens:  3072,          // reduced — no clinical text
      responseMimeType: 'application/json',
      thinkingConfig:   { thinkingBudget: 0 }
    }
  };
  const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;

  async function callGemini() {
    return fetch(apiUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(reqBody) });
  }

  try {
    let r = await callGemini();
    let d = await r.json();

    // One retry on overload
    if (!r.ok) {
      const msg = d?.error?.message || '';
      const busy = r.status === 429 || r.status === 503 || msg.includes('high demand') || msg.includes('overloaded');
      if (busy) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        r = await callGemini(); d = await r.json();
        if (!r.ok) return res.status(r.status).json({ error: d?.error?.message || 'Server busy. Please try again.' });
      } else {
        return res.status(r.status).json({ error: msg || 'Gemini error: ' + r.status });
      }
    }

    const finishReason = d?.candidates?.[0]?.finishReason;
    // Join all parts — plain JS (no TypeScript types in .js files!)
    const raw = ((d?.candidates?.[0]?.content?.parts || [])
      .map(p => p?.text || '')
      .join('') || '').trim();
    if (!raw) return res.status(500).json({ error: 'Empty response from AI. Please try again.' });

    const parsed = recoverJSON(raw, finishReason);
    if (parsed.error) return res.status(500).json({ error: parsed.error });
    return res.status(200).json(parsed.result);

  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
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
// MEASUREMENT-ONLY. No clinical text = no literal newlines = no JSON errors.
// Clinical recommendations are generated locally in clinicalRules.ts.

function buildPrompt(lang, age, gender) {
  const pa = age    ? (lang==='tr'?'Hasta yaşı: '+age  :lang==='ar'?'العمر: '+age  :'Age: '+age)    : '';
  const pg = gender ? (lang==='tr'?' | Cinsiyet: '+gender:lang==='ar'?' | الجنس: '+gender:' | Sex: '+gender) : '';

  if (lang === 'tr') return `Sen SRS/SOSORT 2024 omurga radyologusun. ${pa}${pg}

PROTOKOL (Caesarendra 2022 ICC=0.995 + Maeda 2023 ICC=0.973 + Cobb 1948):

1. Ayakta PA/AP tam omurga röntgeni mi? image_quality: good/poor/unacceptable

2. 17 VERTEBRA (T1-L5), 4 KÖŞE: ul=üst-sol, ur=üst-sağ, ll=alt-sol, lr=alt-sağ
   Koordinatlar: sol-üst=(0,0) sağ-alt=(1,1). Gerçek kemik yüzeyleri.

3. APEKS: Orta hattan en fazla lateral sapan vertebra.

4. UÇ VERTEBRALAR:
   Apeks üstü → üst kenar eğimi → MAX = superior uç
   Apeks altı → alt kenar eğimi → MAX = inferior uç
   <5° komşu fark → eleme

5. ENDPLATE HATLARI:
   upper_line: superior uç SUPERIOR endplate (x1,y1=ul | x2,y2=ur)
   lower_line: inferior uç INFERIOR endplate (x1,y1=ll | x2,y2=lr)
   upper_slope_deg / lower_slope_deg: eğim açıları
   cobb_angle = |upper_slope_deg - lower_slope_deg|

   KRİTİK: Çizgiler mutlaka EĞİK olmalı (|y2-y1| >= 0.02). cobb_angle ile slope farkı 3° içinde olmalı.

6. SINIF: thoracic/thoracolumbar/lumbar | normal<10|mild 10-24|moderate 25-44|severe>=45
   Nash-Moe: 0/I/II/III/IV | coronal_balance: balanced/left_shift/right_shift

7. warnings: kısa string listesi (max 5 kelime her biri). UZUN METİN YAZMA.`;

  if (lang === 'ar') return `أنت طبيب أشعة متخصص (SRS/SOSORT 2024). ${pa}${pg}

بروتوكول القياس (Caesarendra 2022 + Maeda 2023 + Cobb 1948):
1. صورة PA/AP واقفة. image_quality: good/poor/unacceptable
2. 17 فقرة × 4 زوايا. إحداثيات: (0,0)-(1,1).
3. فقرة الذروة: أكثر انحرافاً جانبياً.
4. الفقرات الطرفية: أقصى ميل فوق/تحت الذروة.
5. upper_line=صفيحة علوية | lower_line=صفيحة سفلية. cobb=|upper_slope-lower_slope|.
   مهم: الخطوط يجب أن تكون مائلة (|y2-y1|>=0.02). لا تكتب نصوصاً طويلة.
6. التصنيف والتوازن.
7. warnings: قائمة قصيرة.`;

  return `You are a spinal deformity radiologist (SRS/SOSORT 2024). ${pa}${pg}

MEASUREMENT-ONLY PROTOCOL (Caesarendra 2022 ICC=0.995 + Maeda 2023 ICC=0.973 + Cobb 1948):

1. Standing PA/AP full-spine X-ray? image_quality: good/poor/unacceptable

2. 17 VERTEBRAE (T1-L5), 4 CORNERS: ul=upper-left, ur=upper-right, ll=lower-left, lr=lower-right
   Coordinates: top-left=(0,0) bottom-right=(1,1). Actual bone surface positions.

3. APEX: Most laterally deviated vertebra.

4. END VERTEBRAE: above apex → max top-edge slope; below apex → max bottom-edge slope; filter <5°.

5. ENDPLATE LINES:
   upper_line: SUPERIOR endplate of superior end vertebra (x1,y1=ul | x2,y2=ur)
   lower_line: INFERIOR endplate of inferior end vertebra (x1,y1=ll | x2,y2=lr)
   upper_slope_deg / lower_slope_deg: inclination (right-down=+)
   cobb_angle = |upper_slope_deg - lower_slope_deg|

   CRITICAL: Lines MUST be tilted (|y2-y1| >= 0.02). cobb_angle MUST match slope delta within 3°.
   If endplates unclear → pedicle lines, set measurement_method="pedicle".

6. CLASSIFY: location thoracic/thoracolumbar/lumbar | severity normal<10/mild 10-24/moderate 25-44/severe>=45
   Nash-Moe rotation: 0/I/II/III/IV | coronal_balance: balanced/left_shift/right_shift

7. warnings: array of SHORT strings (max 5 words each). NO LONG TEXT. NO RECOMMENDATIONS.
   Example: ["image slightly rotated", "endplates partially obscured"]`;
}

// ─── Measurement-only schema (NO clinical text fields) ───────────────────
function buildMeasureSchema(isTR, isAR) {
  return {
    is_valid_xray: true,
    image_quality: 'good',
    view_type: 'PA',
    curve_type: 'single',
    measurement_confidence: 'high',
    measurement_method: 'endplate',
    vertebrae_detected: 17,
    curves: [{
      id: 1,
      cobb_angle: 28,
      curve_location: 'thoracic',
      convexity_direction: 'sag',
      upper_vertebra_name: 'T5',
      lower_vertebra_name: 'T12',
      apical_vertebra_name: 'T8',
      rotation_grade: 'I',
      // Corners show ACTUAL tilt (y coords differ to reflect endplate slope)
      upper_corners: { ul:[0.31,0.245], ur:[0.52,0.214], ll:[0.31,0.275], lr:[0.52,0.244] },
      lower_corners: { ul:[0.285,0.625], ur:[0.515,0.706], ll:[0.285,0.655], lr:[0.515,0.736] },
      upper_line: { x1:0.31, y1:0.245, x2:0.52, y2:0.214 },
      lower_line: { x1:0.285, y1:0.655, x2:0.515, y2:0.736 },
      upper_slope_deg: -8.5,
      lower_slope_deg: 19.5,
      apex_x: 0.60,
      apex_y: 0.44
    }],
    coronal_balance: 'balanced',
    warnings: []
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
