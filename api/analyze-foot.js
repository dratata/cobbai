export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = (process.env.GEMINI_API_KEY_FOOT || process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured.' });

  let body = req.body;
  if (!body || typeof body === 'string') {
    try {
      const raw = typeof body === 'string' ? body : await getRawBody(req);
      body = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'Invalid request body.' });
    }
  }

  const { imageBase64, mimeType, patientAge, patientGender, lang = 'en' } = body || {};
  if (!imageBase64 || !mimeType) return res.status(400).json({ error: 'Missing fields.' });
  if (typeof imageBase64 === 'string' && imageBase64.length > 12_000_000) {
    return res.status(413).json({ error: 'Image too large. Please resize to under 8 MB before uploading.' });
  }

  const isTR = lang === 'tr';

  const prompt = isTR
    ? `Sen deneyimli bir kas-iskelet radyologusun. Bu yuk tasimali lateral ayak rontgenini pes planus acisindan analiz et.
${patientAge ? 'Hasta yasi: ' + patientAge : ''} ${patientGender ? 'Cinsiyet: ' + patientGender : ''}

OLCUMLER:
1. Meary acisi: talus uzun ekseni ile 1. metatars ekseni arasi. Normal 0-4 derece. Plantar=duz taban.
2. Kalkaneal pitch: kalkanusun alt yuzeyi ile yatay arasi. Normal 17-32 derece.
3. Talar deklinasyon: talus ekseni ile yatay arasi. Normal 17-21 derece.
4. Koordinat: sol-ust(0,0) sag-alt(1,1).
5. Siddeti: normal 0-4, hafif 4-15, orta 15-30, siddetli>30 derece Meary acisi.
6. overall_description, age_based_recommendation, treatment_plan, followup_plan, imaging_indications, orthotic_recommendations alanlarini MUTLAKA detayli Turkce doldur.

Asagidaki JSON semasinа tam uy, baska hicbir sey yazma:`
    : `You are an expert musculoskeletal radiologist. Analyze this weight-bearing lateral foot X-ray for pes planus.
${patientAge ? 'Patient age: ' + patientAge : ''} ${patientGender ? 'Gender: ' + patientGender : ''}

MEASUREMENTS:
1. Meary angle: talus longitudinal axis vs 1st metatarsal axis. Normal 0-4 degrees. Plantar=flatfoot.
2. Calcaneal pitch: inferior calcaneal surface vs horizontal. Normal 17-32 degrees.
3. Talar declination: talus axis vs horizontal. Normal 17-21 degrees.
4. Coordinates: top-left(0,0) bottom-right(1,1).
5. Severity: normal 0-4, mild 4-15, moderate 15-30, severe>30 degrees Meary angle.
6. MUST fill overall_description, age_based_recommendation, treatment_plan, followup_plan, imaging_indications, orthotic_recommendations with detailed English text.

Follow this exact JSON schema, write nothing else:`;

  const schema = {
    is_valid_xray: true,
    foot_side: "right",
    measurement_confidence: "high",
    meary_angle: 12.5,
    meary_direction: "plantar",
    calcaneal_pitch: 15.0,
    talar_declination: 24.0,
    severity: "mild",
    severity_label: isTR ? "Hafif Pes Planus" : "Mild Flatfoot",
    flexibility: "flexible",
    talus_line: { x1: 0.35, y1: 0.38, x2: 0.62, y2: 0.52 },
    metatarsal_line: { x1: 0.58, y1: 0.50, x2: 0.88, y2: 0.57 },
    calcaneus_line: { x1: 0.16, y1: 0.74, x2: 0.42, y2: 0.70 },
    overall_description: isTR ? "Klinik deger." : "Clinical assessment.",
    age_based_recommendation: isTR ? "Oner." : "Recommendation.",
    treatment_plan: isTR ? "Tedavi." : "Plan.",
    followup_plan: isTR ? "Takip." : "Followup.",
    imaging_indications: isTR ? "Tetkik." : "Imaging.",
    orthotic_recommendations: isTR ? "Ortez." : "Orthotics."
  };

  const invalidSchema = {
    is_valid_xray: false,
    foot_side: "unknown",
    measurement_confidence: "low",
    meary_angle: -1,
    meary_direction: "neutral",
    calcaneal_pitch: -1,
    talar_declination: -1,
    severity: "invalid",
    severity_label: isTR ? "Gecersiz" : "Invalid",
    flexibility: "unknown",
    talus_line: { x1: 0.3, y1: 0.4, x2: 0.6, y2: 0.4 },
    metatarsal_line: { x1: 0.55, y1: 0.4, x2: 0.88, y2: 0.44 },
    calcaneus_line: { x1: 0.15, y1: 0.72, x2: 0.42, y2: 0.70 },
    overall_description: isTR ? "Gecerli lateral ayak rontgeni degil." : "Not a valid lateral foot X-ray.",
    age_based_recommendation: "",
    treatment_plan: "",
    followup_plan: "",
    imaging_indications: "",
    orthotic_recommendations: ""
  };

  const fullPrompt = prompt + '\nOutput ONLY this JSON:\n' + JSON.stringify(schema) +
    '\n' + (isTR ? 'Geçerli ayak röntgeni değilse:' : 'If not a foot X-ray:') + '\n' + JSON.stringify(invalidSchema);

  const model  = (process.env.GEMINI_MODEL || 'gemini-2.5-pro').trim();
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const reqBody = {
    contents: [{ parts: [
      { inline_data: { mime_type: mimeType, data: imageBase64 } },
      { text: fullPrompt }
    ]}],
    generationConfig: {
      temperature: 0.05,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  async function callGemini() {
    return fetch(apiUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(reqBody) });
  }

  try {
    let r = await callGemini();
    let d = await r.json();

    // Fix #9: Same as analyze-spine — return 429 immediately, no sleep (Vercel timeout risk)
    if (!r.ok) {
      const msg = d?.error?.message || '';
      const busy = r.status === 429 || r.status === 503
        || msg.includes('high demand') || msg.includes('overloaded') || msg.includes('quota');
      if (busy) {
        return res.status(429).json({ error: 'Sunucu şu an çok yoğun, lütfen 5 saniye sonra tekrar deneyin.', retryAfter: 5 });
      }
      return res.status(r.status).json({ error: msg || 'Gemini error: ' + r.status });
    }

    const finishReason = d?.candidates?.[0]?.finishReason;
    // Join all parts — plain JS, no TypeScript types in .js files
    const raw = ((d?.candidates?.[0]?.content?.parts || [])
      .map(p => p?.text || '')
      .join('') || '').trim();
    if (!raw) return res.status(500).json({ error: 'Empty AI response. Please try again.' });

    const parsed = recoverJSON(raw, finishReason);
    if (parsed.error) return res.status(500).json({ error: parsed.error });
    return res.status(200).json(parsed.result);
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}

// Same sanitizeJSON + recoverJSON as analyze-spine.js
function sanitizeJSON(str) {
  let result = ''; let inString = false; let escaped = false;
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
  try { return { result: JSON.parse(raw) }; } catch {}
  let clean = raw.replace(/^```json\s*/im,'').replace(/^```\s*/im,'').replace(/```\s*$/im,'').trim();
  try { return { result: JSON.parse(clean) }; } catch {}
  const sanitized = sanitizeJSON(clean);
  try { return { result: JSON.parse(sanitized) }; } catch {}
  const s = sanitized.indexOf('{'); if (s === -1) return { error: 'No JSON in response. Try again.' };
  const e = sanitized.lastIndexOf('}');
  if (e !== -1) {
    let candidate = sanitized.slice(s, e+1).replace(/,(\s*[}\]])/g,'$1');
    try { return { result: JSON.parse(candidate) }; } catch {}
    let fixed = candidate;
    if ((fixed.match(/"/g)||[]).length % 2 !== 0) fixed += '"';
    const ab=(fixed.match(/\[/g)||[]).length-(fixed.match(/\]/g)||[]).length;
    const ob=(fixed.match(/\{/g)||[]).length-(fixed.match(/\}/g)||[]).length;
    for(let i=0;i<ab;i++) fixed+=']'; for(let i=0;i<ob;i++) fixed+='}';
    try { return { result: JSON.parse(fixed) }; } catch {}
  }
  return { error: 'AI response could not be parsed. Please try again. ('+finishReason+')' };
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => { d += c; });
    req.on('end', () => resolve(d));
    req.on('error', reject);
  });
}
