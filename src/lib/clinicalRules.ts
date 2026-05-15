/**
 * clinicalRules.ts
 *
 * Local, deterministic clinical recommendation engine.
 * REPLACES Gemini-generated clinical text — no API tokens spent.
 *
 * All recommendations use cautious wording per good clinical practice:
 * "consider", "refer to specialist", "clinical correlation required".
 *
 * References: SRS/SOSORT 2024, Lonstein & Carlson 1992, POSNA guidelines
 */

import type { Lang } from '@/lib/i18n';

export type SeverityLevel = 'normal' | 'mild' | 'moderate' | 'severe';
export type CurveLocation = 'thoracic' | 'thoracolumbar' | 'lumbar' | string;

export interface ClinicalRec {
  overallDescription:      string;
  ageBasedRecommendation:  string;
  treatmentPlan:           string;
  followupPlan:            string;
  imagingIndications:      string;
}

export interface FootClinicalRec {
  overallDescription:     string;
  treatmentPlan:          string;
  followupPlan:           string;
  imagingIndications:     string;
  orthoticRecommendation: string;
}

// ── Severity helpers ─────────────────────────────────────────

function classifyCobb(deg: number): SeverityLevel {
  if (deg < 10)  return 'normal';
  if (deg < 25)  return 'mild';
  if (deg < 45)  return 'moderate';
  return 'severe';
}

function isSkeletallyImmature(age: number, risser?: number): boolean {
  if (risser != null) return risser <= 2;
  return age < 16;
}

// ── Spine recommendations ─────────────────────────────────────

export function getSpineRecs(
  cobb: number,
  curveLocation: CurveLocation,
  lang: Lang,
  ageStr?: string,
  genderStr?: string,
  risserStr?: string
): ClinicalRec {
  const age    = ageStr    ? parseFloat(ageStr)    : NaN;
  const risser = risserStr ? parseInt(risserStr)   : undefined;
  const sev    = classifyCobb(cobb);
  const immature = !isNaN(age) && isSkeletallyImmature(age, risser);
  const isFemale = (genderStr || '').toLowerCase().includes('female') || genderStr === 'Kadın';

  if (lang === 'tr') return getSpineRecsTR(cobb, sev, curveLocation, age, immature, isFemale, risser);
  if (lang === 'ar') return getSpineRecsAR(cobb, sev, curveLocation, age, immature, isFemale, risser);
  return getSpineRecsEN(cobb, sev, curveLocation, age, immature, isFemale, risser);
}

function getSpineRecsEN(
  cobb: number, sev: SeverityLevel, loc: CurveLocation,
  _age: number, immature: boolean, _isFemale: boolean, risser?: number
): ClinicalRec {
  const loc_ = loc.charAt(0).toUpperCase() + loc.slice(1);

  const overallDescription =
    `${loc_} scoliosis with Cobb angle ${cobb}° (${sev}). ` +
    (immature ? `Patient is skeletally immature${risser != null ? ` (Risser ${risser})` : ''} — progressive risk elevated. ` : '') +
    `Clinical correlation with physical examination is required.`;

  let ageRec: string;
  if (sev === 'normal') {
    ageRec = 'Cobb angle <10°: within normal variation. Clinical monitoring is sufficient. Annual postural check recommended for growing patients.';
  } else if (sev === 'mild') {
    ageRec = 'Mild scoliosis (10–24°). Schroth-based physiotherapy exercise program recommended. ' +
      (immature ? 'Skeletal immaturity noted — consider more frequent follow-up (every 4–6 months). ' : '') +
      'Refer to PMR Specialist Physician for clinical assessment.';
  } else if (sev === 'moderate') {
    ageRec = 'Moderate scoliosis (25–44°). ' +
      (immature
        ? 'Patient is skeletally immature — consider brace (TLSO) evaluation by a PMR/spine specialist. Schroth physiotherapy alongside bracing is recommended.'
        : 'Schroth physiotherapy and follow-up recommended. Surgical consultation if progression documented.') +
      ' Refer to PMR Specialist Physician.';
  } else {
    ageRec = 'Severe scoliosis (≥45°). Surgical consultation should be considered. ' +
      'Refer to PMR Specialist Physician and spinal surgery team for evaluation. ' +
      'This is a decision-support tool — final clinical decisions rest with the treating clinician.';
  }

  const treatmentPlan =
    sev === 'normal' ? 'Clinical monitoring. Postural education. No active intervention required unless progression documented.' :
    sev === 'mild'   ? 'Schroth physiotherapy (consider BSPTS-certified physiotherapist). Core stabilization. Postural correction.' :
    sev === 'moderate'? (immature
      ? 'TLSO brace evaluation (target correction ≥50% in brace). Schroth physiotherapy alongside bracing. Compliance monitoring essential.'
      : 'Schroth physiotherapy. Serial radiographic follow-up. Surgical consultation if progression ≥5° per year.') :
      'Spinal surgical consultation. Discuss instrumented spinal fusion if indicated. Detailed imaging (MRI/CT) may be required.';

  const followupPlan =
    sev === 'normal'   ? 'Annual clinical review. Radiograph only if symptoms or visible asymmetry increases.' :
    sev === 'mild'     ? (immature ? 'Every 4–6 months during growth. Radiograph at each visit.' : 'Every 6–12 months. Radiograph annually.') :
    sev === 'moderate' ? 'Every 3–4 months. Serial radiographs. Assess brace correction if bracing initiated.' :
                         'Surgical team assessment. Frequency per surgeon recommendation.';

  const imagingIndications =
    cobb > 35 ? 'MRI of the entire spine recommended to exclude intraspinal pathology before surgical planning.' :
    cobb > 20 && immature ? 'Bending films may be considered for Lenke classification if surgical planning is anticipated.' :
    'Routine standing full-length PA radiograph at follow-up. Lateral view if sagittal parameters needed.';

  return { overallDescription, ageBasedRecommendation: ageRec, treatmentPlan, followupPlan, imagingIndications };
}

function getSpineRecsTR(
  cobb: number, sev: SeverityLevel, loc: CurveLocation,
  _age: number, immature: boolean, _isFemale: boolean, risser?: number
): ClinicalRec {
  const locTR = { thoracic:'Torasik', thoracolumbar:'Torakolomber', lumbar:'Lomber' }[loc] ?? loc;

  const overallDescription =
    `${locTR} bölgede ${cobb}° Cobb açılı ${sev==='normal'?'normal sınır':'skolyoz'} tespit edildi. ` +
    (immature ? `Kemik olgunlaşması tamamlanmamış (Risser ${risser ?? '?'}) — ilerleme riski yüksek. ` : '') +
    `Klinik korelasyon ve fizik muayene zorunludur.`;

  let ageRec: string;
  if (sev === 'normal') {
    ageRec = 'Cobb açısı <10°: klinik skolyoz tanım sınırı altında. Yıllık klinik takip yeterli.';
  } else if (sev === 'mild') {
    ageRec = `Hafif skolyoz (10–24°). Schroth egzersiz programı önerilir. ` +
      (immature ? 'Kemik olgunlaşması devam ettiğinden 4–6 ayda bir FTR Uzman Hekimi değerlendirmesi önerilir. ' : '') +
      'FTR Uzman Hekimine başvurunuz.';
  } else if (sev === 'moderate') {
    ageRec = `Orta şiddette skolyoz (25–44°). ` +
      (immature
        ? 'Kemik olgunlaşması devam etmekte — TLSO korse değerlendirmesi için FTR Uzman Hekimine başvurunuz. Korse ile eş zamanlı Schroth fizyoterapisi önerilir.'
        : 'Schroth fizyoterapisi ve yakın takip önerilir. Yıllık ≥5° ilerleme varsa cerrahi konsültasyon değerlendirilmeli.') +
      ' FTR Uzman Hekimine başvurunuz.';
  } else {
    ageRec = 'Şiddetli skolyoz (≥45°). Cerrahi konsültasyon değerlendirilmeli. FTR Uzman Hekimi ve omurga cerrahi ekibiyle görüşülmesi önerilir. Bu araç yalnızca karar desteği sağlar; tedavi kararı klinisyene aittir.';
  }

  const treatmentPlan =
    sev === 'normal'   ? 'Klinik takip. Postür eğitimi. İlerleme olmadıkça aktif müdahale gerekmez.' :
    sev === 'mild'     ? 'Schroth fizyoterapisi (tercihen BSPTS sertifikalı). Kor stabilizasyon egzersizleri. Postür düzeltme.' :
    sev === 'moderate' ? (immature
      ? 'TLSO korse değerlendirmesi (hedef: korse içinde ≥%50 düzelme). Korse ile eş zamanlı Schroth fizyoterapisi.'
      : 'Schroth fizyoterapisi. Seri radyolojik takip. Yıllık ≥5° ilerleme varsa cerrahi konsültasyon.') :
      'Omurga cerrahi konsültasyonu. Enstrümantasyonlu füzyon tartışılmalı. Preoperatif MRI/BT gerekebilir.';

  const followupPlan =
    sev === 'normal'   ? 'Yıllık klinik değerlendirme. Semptom/asimetri artışı yoksa direkt grafi gerekmez.' :
    sev === 'mild'     ? (immature ? 'Büyüme döneminde 4–6 ayda bir. Her kontrolde PA grafi.' : '6–12 ayda bir. Yıllık grafi.') :
    sev === 'moderate' ? '3–4 ayda bir. Seri grafi. Korse takibinde korse içi kontrol grafisi.' :
                         'Cerrahi ekip takvimine göre. Ameliyat öncesi tüm omurga görüntüleme.';

  const imagingIndications =
    cobb > 35 ? 'Cerrahi planlama öncesi tüm omurga MRI ile intraspinal patoloji ekarte edilmelidir.' :
    cobb > 20 && immature ? 'Lenke sınıflaması gerekirse eğilme grafileri planlanabilir.' :
    'Rutin ayakta PA omurga grafisi. Sagittal parametreler için lateral grafi eklenebilir.';

  return { overallDescription, ageBasedRecommendation: ageRec, treatmentPlan, followupPlan, imagingIndications };
}

function getSpineRecsAR(
  cobb: number, sev: SeverityLevel, loc: CurveLocation,
  _age: number, immature: boolean, _isFemale: boolean, risser?: number
): ClinicalRec {
  const sevAR = { normal:'طبيعي', mild:'خفيف', moderate:'متوسط', severe:'شديد' }[sev] ?? sev;

  const overallDescription = `جنف ${sevAR} بزاوية كوب ${cobb}° في المنطقة ${loc}. ` +
    (immature ? `المريض في مرحلة النمو (ريسر ${risser ?? '?'}) — خطر التقدم مرتفع. ` : '') +
    `التقييم السريري والفحص البدني ضروريان.`;

  const ageRec =
    sev === 'normal'   ? 'زاوية كوب <10°: ضمن الحدود الطبيعية. متابعة سنوية كافية.' :
    sev === 'mild'     ? `جنف خفيف (10-24°). تمارين شروث موصى بها. ${immature ? 'متابعة كل 4-6 أشهر نظراً للنمو. ' : ''}استشر أخصائي طب طبيعي وتأهيل.` :
    sev === 'moderate' ? `جنف متوسط (25-44°). ${immature ? 'تقييم دعامة TLSO مع استمرار النمو. ' : 'تمارين وعلاج طبيعي. '}استشر أخصائياً متخصصاً.` :
                         'جنف شديد (≥45°). استشارة جراحية ضرورية. قرار العلاج يعود للطبيب المعالج.';

  const treatmentPlan =
    sev === 'normal'   ? 'متابعة سريرية. تثقيف وقائي. لا تدخل نشط ما لم يتقدم الانحناء.' :
    sev === 'mild'     ? 'تمارين شروث (BSPTS). تقوية العضلات الأساسية.' :
    sev === 'moderate' ? (immature ? 'تقييم دعامة TLSO مع تمارين شروث.' : 'تمارين وعلاج طبيعي. استشارة جراحية عند التقدم.') :
                         'استشارة جراحية. إيماء بالاندماج إذا لزم. تصوير MRI/CT قبل الجراحة.';

  const followupPlan =
    sev === 'normal'   ? 'مراجعة سنوية.' :
    sev === 'mild'     ? (immature ? 'كل 4-6 أشهر خلال النمو.' : 'كل 6-12 شهراً.') :
    sev === 'moderate' ? 'كل 3-4 أشهر مع أشعة متسلسلة.' :
                         'وفق جدول الفريق الجراحي.';

  const imagingIndications =
    cobb > 35 ? 'MRI كامل للعمود الفقري للاستبعاد المبكر قبل الجراحة.' :
    'صورة PA واقفة للمتابعة الدورية.';

  return { overallDescription, ageBasedRecommendation: ageRec, treatmentPlan, followupPlan, imagingIndications };
}

// ── Foot recommendations ──────────────────────────────────────

export function getFootRecs(
  mearyAngle: number,
  severity: string,
  flexibility: string,
  lang: Lang,
  ageStr?: string
): FootClinicalRec {
  const age = ageStr ? parseFloat(ageStr) : NaN;
  const isChild = !isNaN(age) && age < 8;
  const isFlexible = flexibility === 'flexible';

  if (lang === 'tr') return getFootRecsTR(mearyAngle, severity, isFlexible, isChild, age);
  if (lang === 'ar') return getFootRecsAR(mearyAngle, severity, isFlexible, isChild, age);
  return getFootRecsEN(mearyAngle, severity, isFlexible, isChild, age);
}

function getFootRecsEN(meary: number, sev: string, flexible: boolean, isChild: boolean, _age: number): FootClinicalRec {
  const sev_ = sev.charAt(0).toUpperCase() + sev.slice(1);
  return {
    overallDescription: `${sev_} pes planus with Meary angle ${meary}°. ${flexible ? 'Flexible flatfoot — arch corrects on tiptoe.' : 'Rigid flatfoot — arch does not correct on tiptoe.'} ${isChild ? 'Under age 8, physiological flatfoot is common and often resolves spontaneously.' : ''} Clinical correlation required.`,
    treatmentPlan:
      sev === 'normal'   ? 'No intervention required. Appropriate footwear recommended.' :
      sev === 'mild'     ? 'Short Foot Exercise (SFE), tibialis posterior strengthening. OTC insoles may be considered.' :
      sev === 'moderate' ? (flexible ? 'Custom UCBL orthosis + SFE physiotherapy. Appropriate footwear.' : 'Semi-rigid UCBL. Physiotherapy. Surgical consultation if conservative treatment fails.') :
                           'Surgical consultation recommended. Custom AFO/UCBL. Detailed imaging for surgical planning.',
    followupPlan:
      sev === 'normal'   ? 'Annual review if symptomatic.' :
      sev === 'mild'     ? 'Follow-up every 6 months.' :
      sev === 'moderate' ? 'Follow-up every 3–4 months. Assess orthotic compliance.' :
                           'Per surgical team recommendation.',
    imagingIndications: meary > 20 ? 'Consider MRI/CT for surgical planning if conservative treatment fails.' : 'Routine weight-bearing lateral foot X-ray at follow-up.',
    orthoticRecommendation:
      sev === 'normal'   ? 'Standard footwear with medial arch support.' :
      sev === 'mild'     ? 'OTC arch support insoles (e.g., Superfeet). Firm heel counter.' :
      sev === 'moderate' ? 'Custom semi-rigid UCBL orthosis. Replace every 12–18 months in children.' :
                           'Custom AFO or UCBL. Consider foot surgery referral.',
  };
}

function getFootRecsTR(meary: number, sev: string, flexible: boolean, isChild: boolean, _age: number): FootClinicalRec {
  return {
    overallDescription: `Meary açısı ${meary}° — ${sev==='normal'?'normal kemer':sev+' pes planus'} tespit edildi. ${flexible?'Esnek tip: parmak ucunda kemer oluşuyor.':'Rijit tip: parmak ucunda kemer oluşmuyor.'} ${isChild?'8 yaş altı çocuklarda fizyolojik düz taban sık görülür ve çoğunlukla kendiliğinden düzelir.':''} Klinik korelasyon gereklidir.`,
    treatmentPlan:
      sev==='normal'   ? 'Müdahale gerekmez. Uygun ayakkabı önerilir.' :
      sev==='mild'     ? 'Kısa ayak egzersizi (SFE), tibialis posterior güçlendirme. Hazır tabanlık düşünülebilir.' :
      sev==='moderate' ? (flexible?'Özel UCBL ortezi + SFE fizyoterapisi. Uygun ayakkabı.':'Yarı sert UCBL. Fizyoterapi. Konservatif tedavi başarısız olursa cerrahi konsültasyon.') :
                         'Cerrahi konsültasyon önerilir. Özel AFO/UCBL. Cerrahi planlama için ileri görüntüleme.',
    followupPlan: sev==='normal'?'Şikayet varsa yıllık kontrol.':sev==='mild'?'6 ayda bir.':sev==='moderate'?'3–4 ayda bir.':'Cerrahi ekip takvimine göre.',
    imagingIndications: meary>20?'Konservatif tedavi başarısız olursa cerrahi planlama için MRI/BT düşünülmeli.':'Rutin ayakta lateral ayak grafisi.',
    orthoticRecommendation:
      sev==='normal'   ? 'İç kemer destekli standart ayakkabı.' :
      sev==='mild'     ? 'Hazır ark destekli tabanlık. Sert topuk bölmeli ayakkabı.' :
      sev==='moderate' ? 'Özel yarı sert UCBL ortezi. Çocuklarda 12–18 ayda değişim.' :
                         'Özel AFO veya UCBL. Ayak cerrahisi konsültasyonu.',
  };
}

function getFootRecsAR(meary: number, sev: string, flexible: boolean, isChild: boolean, _age: number): FootClinicalRec {
  return {
    overallDescription: `زاوية ميري ${meary}° — ${sev==='normal'?'قوس طبيعي':sev+' قدم مسطحة'} تم تشخيصه. ${flexible?'مرن: القوس يتشكل على أطراف الأصابع.':'صلب: القوس لا يتشكل.'} ${isChild?'عند الأطفال دون 8 سنوات، القدم المسطحة الفسيولوجية شائعة وتحسن تلقائياً.':''} التقييم السريري ضروري.`,
    treatmentPlan: sev==='normal'?'لا تدخل. حذاء مناسب.':sev==='mild'?'تمارين القدم القصيرة (SFE). نعل طبي.':sev==='moderate'?(flexible?'جبيرة UCBL مخصصة + تمارين.':'UCBL + علاج طبيعي. استشارة جراحية إن لزم.'):' استشارة جراحية. AFO/UCBL.',
    followupPlan: sev==='normal'?'سنوياً إن وجدت أعراض.':sev==='mild'?'كل 6 أشهر.':'كل 3-4 أشهر.',
    imagingIndications: meary>20?'MRI/CT للتخطيط الجراحي إن فشل العلاج التحفظي.':'صورة جانبية واقفة دورية.',
    orthoticRecommendation: sev==='normal'?'حذاء بدعم للقوس.':sev==='mild'?'نعل طبي جاهز.':sev==='moderate'?'UCBL مخصص.':'AFO أو UCBL مخصص.',
  };
}
