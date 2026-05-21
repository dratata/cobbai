// ============================================================
// CobbAI v2 — Internationalisation
// Supports TR (Turkish), EN (English), AR (Arabic)
// ============================================================

export type Lang = 'tr' | 'en' | 'ar';

export interface Translations {
  // Nav/badges
  badge: string;
  aiChip: string;
  forDoctors: string;
  // Hero
  titleS: string;
  titleF: string;
  subS: string;
  subF: string;
  tagline: string;
  // Patient bar
  pLbl: string;
  pAge: string;
  pGen: string;
  opt0: string;
  opt1: string;
  opt2: string;
  // Panel labels
  upLblS: string;
  upLblF: string;
  uTitleS: string;
  uTitleF: string;
  uHintS: string;
  uHintF: string;
  uIcoS: string;
  uIcoF: string;
  changBtn: string;
  abtnS: string;
  abtnF: string;
  resLbl: string;
  emptyMsg: string;
  loadTxt: string;
  // Legend
  leg1: string;
  leg2: string;
  leg3: string;
  leg4: string;
  disc: string;
  // Foot metrics
  flM: string;
  flC: string;
  flT: string;
  // Recommendations
  recTitle: string;
  rt1: string;
  rt2: string;
  rt3: string;
  risserTitle: string;
  risserH: string;
  sandersH: string;
  risserC: string;
  sandersC: string;
  orthoTitle: string;
  imgTitle: string;
  discFinal: string;
  refTitle: string;
  // Ref table spine
  sr1: string; sd1: string;
  sr2: string; sd2: string;
  sr3: string; sd3: string;
  sr4: string; sd4: string;
  // Ref table foot
  fr1: string; fd1: string;
  fr2: string; fd2: string;
  fr3: string; fd3: string;
  fr4: string; fd4: string;
  // Exercise links
  es1: string; es2: string;
  ef1: string; ef2: string;
  // Footer
  footerTxt: string;
  // KVKK
  kvPre: string;
  kvLink: string;
  kvPost: string;
  kvWarn: string;
  modalTitle: string;
  modalClose: string;
  modalAccept: string;
  kvBody: string;
  // iOS
  iosMsg: string;
  // Severity
  sevS: Record<string, string>;
  sevF: Record<string, string>;
  flex: Record<string, string>;
  conf: Record<string, string>;
  // Curve labels
  curveP: string;
  curveS: string;
  cobb: string;
  conv: string;
  vert: string;
  dL: string;
  dR: string;
  // Sidebar
  dl1: string; dl2: string; dl3: string; dl4: string; dl5: string;
  dn1: string; ds1: string;
  dn2: string; ds2: string;
  dn3: string; ds3: string;
  dn4: string; ds4: string;
  dn5: string; ds5: string;
  dn6: string; ds6: string;
  dn7: string; ds7: string;
  dn8: string; ds8: string;
  dnVal: string; dsVal: string;
  // Landing screen
  lsSub: string;
  lsDocTitle: string;
  lsDocSub: string;
  lsPatTitle: string;
  lsPatSub: string;
  lsDisc: string;
  // Onboarding
  obTitle: string;
  obSub: string;
  ob1t: string; ob1d: string;
  ob2t: string; ob2d: string;
  ob3t: string; ob3d: string;
  obBtn: string;
  obNote: string;
  // History
  histTitle: string;
  // Comparison
  prevXrayLbl: string;
  currXrayLbl: string;
  prevUTitle: string;
  prevUHint: string;
  prevAnalyzeBtn: string;
  prevLoadTxt: string;
  compTitle: string;
  // Controls
  ctrlBr: string;
  ctrlCt: string;
  ctrlOp: string;
  ctrlBA: string;
  ctrlReset: string;
  ctrlPng: string;
  // Misc
  notes: string;
  notesPlaceholder: string;
  editLines: string;
  resetToAI: string;
  // Report
  reportTitle: string;
  printBtn: string;
  // Growth
  growthTitle: string;
}

// ── Turkish ───────────────────────────────────────────────────

const tr: Translations = {
  badge: '🦴 Yapay Zeka Analizi',
  aiChip: 'AI · SRS/SOSORT 2024',
  forDoctors: 'HEKİMLER ve FİZYOTERAPİSTLER İÇİN',
  titleS: 'X-Ray <em>Skolyoz</em> Analizi',
  titleF: 'X-Ray <em>Pes Planus</em> Analizi',
  subS: 'Cobb Açısı · AP Görünüm · SRS/SOSORT 2024',
  subF: 'Meary Açısı · Lateral Görünüm · Yük Taşımalı',
  tagline: 'Hekimler ve fizyoterapistler için tanı yardımcı aracı · Hastalar için egzersiz programları ve bilgilendirme rehberleri',
  pLbl: 'HASTA',
  pAge: 'Yaş',
  pGen: 'Cinsiyet',
  opt0: 'Belirtilmemiş',
  opt1: 'Kadın',
  opt2: 'Erkek',
  upLblS: 'X-RAY & ÖLÇÜM',
  upLblF: 'LATERAL AYAK X-RAY',
  uTitleS: 'Görüntü seç veya çek',
  uTitleF: 'Ayak X-ray seç veya çek',
  uHintS: 'Kamera veya galeri · Ayakta AP görünüm önerilir',
  uHintF: 'Kamera veya galeri · Yük taşımalı lateral görünüm gerekli',
  uIcoS: '🦴',
  uIcoF: '🦶',
  changBtn: '↺ Değiştir',
  abtnS: 'Cobb Açısını Hesapla →',
  abtnF: 'Pes Planus Analiz Et →',
  resLbl: 'ANALİZ SONUCU',
  emptyMsg: 'X-ray yükleyin ve analizi başlatın',
  loadTxt: 'Analiz ediliyor...',
  leg1: 'Primer eğrilik',
  leg2: 'Sekonder eğrilik',
  leg3: 'Talus aksı',
  leg4: '1. Metatars',
  disc: 'Kesin tanı için Fiziksel Tıp ve Rehabilitasyon Uzman Hekimine başvurunuz.',
  flM: 'Meary',
  flC: 'Kal.Pitch',
  flT: 'Talar',
  recTitle: 'Klinik Değerlendirme & Takip',
  rt1: 'Yaşa Göre Öneri',
  rt2: 'Tedavi Planı',
  rt3: 'Takip Programı',
  risserTitle: 'KEMİK OLGUNLUK EVRELEMESİ — RİSSER & SANDERS',
  risserH: 'Risser Evresi (İliak Apofiz)',
  sandersH: 'Sanders Evresi (El-Bilek)',
  risserC: '0: Osifikasyon yok → max risk<br>1-2: %0-50 → büyüme devam<br>3-4: %50-100 → yavaşlıyor<br>5: Tam → olgunlaşma tamamlandı',
  sandersC: '1-2: Pik öncesi → en yüksek risk<br>3-4: Pik büyüme → aktif korse<br>5-6: Yavaşlıyor → azalt<br>7-8: Tamamlandı → sonlandır',
  orthoTitle: 'ÖNERİLEN ORTEZ VE AYAKKABI',
  imgTitle: 'EK TETKİK ENDİKASYONLARI',
  discFinal: '⚕ Bu öneriler SRS/SOSORT 2024 rehberlerine dayanır. Tüm klinik kararlar için <strong>Fiziksel Tıp ve Rehabilitasyon Uzman Hekimi</strong> değerlendirmesi gereklidir.',
  refTitle: 'Referans',
  sr1: 'Normal', sd1: 'Klinik skolyoz yok.',
  sr2: 'Hafif', sd2: 'Egzersiz, 4-6 ay takip.',
  sr3: 'Orta', sd3: 'TLSO korse + Schroth.',
  sr4: 'Şiddetli', sd4: 'Cerrahi değerlendirme.',
  fr1: 'Normal', fd1: 'Normal kemer.',
  fr2: 'Hafif Pes Planus', fd2: 'Tabanlık, egzersiz.',
  fr3: 'Orta', fd3: 'UCBL + fizyoterapi.',
  fr4: 'Şiddetli', fd4: 'AFO/UCBL, cerrahi.',
  es1: 'Skolyoz Egzersiz Programı',
  es2: 'Schroth · 13 egzersiz · TR/EN',
  ef1: 'Pes Planus Egzersiz Programı',
  ef2: 'SFE · 15 egzersiz · TR/EN',
  footerTxt: 'CobbAI © 2025 · SRS/SOSORT 2024 · ⚕ Tıbbi tavsiye değildir · cobbai.vercel.app',
  kvPre: 'Okudum, kabul ediyorum: ',
  kvLink: 'Kişisel Verilerin Korunması Bildirimi',
  kvPost: '. Görüntümün yalnızca analiz için işlenmesine onay veriyorum. Lisanslı ve diplomalı bir Tıp Doktoru/Fizyoterapist olduğumu kabul ediyorum.',
  kvWarn: 'Devam etmek için lütfen gizlilik bildirimini kabul edin.',
  modalTitle: 'Kişisel Verilerin Korunması',
  modalClose: 'Kapat',
  modalAccept: 'Kabul Et ve Kapat',
  kvBody: `<h3>KİŞİSEL VERİLERİN KORUNMASI BİLDİRİMİ</h3>
<p><strong>CobbAI</strong> ("Platform"), 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında veri sorumlusu sıfatıyla hareket etmektedir.</p>
<h4>1. İşlenen Veriler</h4>
<p>Platform'a yüklediğiniz X-ray görüntüleri ve isteğe bağlı demografik bilgiler (yaş, cinsiyet) yalnızca yapay zeka tabanlı analiz amacıyla işlenmektedir. Görüntüler sunucularımızda kalıcı olarak depolanmamakta; analiz tamamlandıktan sonra imha edilmektedir.</p>
<h4>2. Veri İşleme Amacı</h4>
<ul>
  <li>Cobb açısı ve Meary açısı hesaplama</li>
  <li>Klinik öneri oluşturma (SRS/SOSORT 2024 kılavuzları)</li>
  <li>Platform kalitesinin iyileştirilmesi (anonim, toplu istatistik)</li>
</ul>
<h4>3. Üçüncü Taraf Hizmetler</h4>
<p>Görüntü analizi Google Gemini API aracılığıyla gerçekleştirilmektedir. Google'ın gizlilik politikası geçerlidir: <em>policies.google.com/privacy</em>. Görüntü verileri yalnızca API isteği süresince aktarılmakta olup Google tarafından model eğitiminde kullanılmamaktadır.</p>
<h4>4. Veri Güvenliği</h4>
<p>Tüm iletişim TLS 1.3 ile şifrelenmektedir. Görüntüler base64 formatında API'ye iletilmekte ve işlem sonrasında belleğe alınmamaktadır.</p>
<h4>5. KVKK Kapsamındaki Haklarınız</h4>
<ul>
  <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme</li>
  <li>İşlenmişse buna ilişkin bilgi talep etme</li>
  <li>İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme</li>
  <li>Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme</li>
  <li>Eksik veya yanlış işlenmişse düzeltilmesini isteme</li>
  <li>KVKK'nın 7. maddesi çerçevesinde silinmesini veya yok edilmesini isteme</li>
</ul>
<h4>6. Mesleki Sorumluluk Beyanı</h4>
<p>Bu platformu kullanarak lisanslı ve diplomalı bir Tıp Doktoru veya Fizyoterapist olduğunuzu beyan etmekteysiniz. CobbAI, klinik tanı aracı değil, <strong>karar destek sistemidir</strong>. Tüm klinik kararlar yetkili sağlık profesyoneli tarafından verilmelidir.</p>
<h4>7. İletişim</h4>
<p>KVKK kapsamındaki talepleriniz için: <em>cobbai.vercel.app</em> üzerinden iletişime geçebilirsiniz.</p>
<p><em>Son güncelleme: 2025</em></p>`,
  iosMsg: 'Safari → Paylaş □↑ → "Ana Ekrana Ekle"',
  sevS: {
    normal: 'Normal',
    mild: 'Hafif Skolyoz',
    moderate: 'Orta Skolyoz',
    severe: 'Şiddetli Skolyoz',
  },
  sevF: {
    normal: 'Normal',
    mild: 'Hafif Pes Planus',
    moderate: 'Orta Pes Planus',
    severe: 'Şiddetli Pes Planus',
  },
  flex: {
    flexible: 'Fleksibıl',
    rigid: 'Rijit',
    unknown: 'Bilinmiyor',
  },
  conf: {
    high: 'Yüksek Güven · SRS',
    medium: 'Orta Güven',
    low: 'Düşük Güven',
  },
  curveP: 'PRİMER EĞRİLİK',
  curveS: 'SEKONDER EĞRİLİK',
  cobb: 'Cobb',
  conv: 'Skolyoz Yerleşim',
  vert: 'Vertebralar',
  dL: '← SOL',
  dR: '→ SAĞ',
  dl1: 'X-RAY ANALİZİ',
  dl2: 'EGZERSİZ PROGRAMLARI',
  dl3: 'HEKİMLER İÇİN',
  dl4: 'HASTALAR İÇİN',
  dl5: 'DOĞRULAMA',
  dn1: 'X-ray Skolyoz', ds1: 'Cobb açısı · AP görünüm',
  dn2: 'X-ray Pes Planus', ds2: 'Meary açısı · Lateral görünüm',
  dn3: 'Skolyoz Egzersizleri', ds3: 'Schroth · 13 egzersiz',
  dn4: 'Pes Planus Egzersizleri', ds4: 'SFE · 15 egzersiz',
  dn5: 'Skolyoz Nedir?', ds5: 'Hekimler için',
  dn6: 'Pes Planus Nedir?', ds6: 'Hekimler için',
  dn7: 'Skolyoz Nedir?', ds7: 'Hastalar için',
  dn8: 'Pes Planus (Düz Taban) Nedir?', ds8: 'Hastalar için',
  dnVal: 'Klinik Doğrulama', dsVal: 'ICC · MAE · Bland-Altman',
  lsSub: 'Yapay zeka destekli skolyoz ve pes planus X-ray analiz platformu',
  lsDocTitle: 'Tıp Hekimi / Fizyoterapist',
  lsDocSub: 'X-Ray analizi, Cobb açısı ölçümü, klinik değerlendirme',
  lsPatTitle: 'Hasta / Yakını',
  lsPatSub: 'Egzersiz programları, bilgilendirme ve hasta rehberleri',
  lsDisc: '⚕ CobbAI tıbbi tanı aracı değildir',
  obTitle: "CobbAI'ya Hoş Geldiniz",
  obSub: 'Yapay zeka ile omurga ve ayak X-ray analizi',
  ob1t: 'X-ray Yükle',
  ob1d: 'Ayakta çekilmiş AP omurga veya lateral ayak röntgeni',
  ob2t: 'AI Analiz',
  ob2d: 'Cobb / Meary açısı otomatik ölçülür',
  ob3t: 'FTR Önerileri',
  ob3d: 'Yaşa özel tedavi planı ve takip programı',
  obBtn: 'Başla →',
  obNote: '⚕ Tıbbi tanı yerine geçmez. FTR Uzman Hekimine danışın.',
  histTitle: 'SON ÖLÇÜMLER',
  prevXrayLbl: 'ÖNCEKİ X-RAY',
  currXrayLbl: 'GÜNCEL ANALİZ',
  prevUTitle: 'Önceki röntgeni seç',
  prevUHint: 'Önceki tarihe ait X-ray görüntüsü',
  prevAnalyzeBtn: 'Önceki X-Ray Analiz Et →',
  prevLoadTxt: 'Analiz ediliyor...',
  compTitle: 'KARŞILAŞTIRMA SONUCU',
  ctrlBr: '☀️ Parlaklık',
  ctrlCt: '◑ Kontrast',
  ctrlOp: '👁 Kaplama',
  ctrlBA: '🔃 Önce/Sonra',
  ctrlReset: '↺ Sıfırla',
  ctrlPng: '💾 PNG İndir',
  notes: 'HEKİM NOTU',
  notesPlaceholder: 'Klinik notunuzu buraya girin...',
  editLines: '⊹ Endplate Düzenle',
  resetToAI: '↺ AI Ölçümüne Dön',
  reportTitle: '📋 Otomatik Klinik Rapor',
  printBtn: '🖨️ Yazdır / PDF',
  growthTitle: '📈 BÜYÜME TAHMİN ANALİZİ',
};

// ── English ───────────────────────────────────────────────────

const en: Translations = {
  badge: '🦴 AI Analysis',
  aiChip: 'AI · SRS/SOSORT 2024',
  forDoctors: 'FOR PHYSICIANS & PHYSIOTHERAPISTS',
  titleS: 'X-Ray <em>Scoliosis</em> Analysis',
  titleF: 'X-Ray <em>Pes Planus</em> Analysis',
  subS: 'Cobb Angle · AP View · SRS/SOSORT 2024',
  subF: 'Meary Angle · Lateral View · Weight-Bearing',
  tagline: 'AI-assisted diagnostic tool for physicians and physiotherapists · Exercise programs and patient guides',
  pLbl: 'PATIENT',
  pAge: 'Age',
  pGen: 'Gender',
  opt0: 'Not Specified',
  opt1: 'Female',
  opt2: 'Male',
  upLblS: 'X-RAY & MEASUREMENT',
  upLblF: 'LATERAL FOOT X-RAY',
  uTitleS: 'Select or capture image',
  uTitleF: 'Select or capture foot X-ray',
  uHintS: 'Camera or gallery · Standing AP view recommended',
  uHintF: 'Camera or gallery · Weight-bearing lateral view required',
  uIcoS: '🦴',
  uIcoF: '🦶',
  changBtn: '↺ Change',
  abtnS: 'Calculate Cobb Angle →',
  abtnF: 'Analyze Pes Planus →',
  resLbl: 'ANALYSIS RESULT',
  emptyMsg: 'Upload an X-ray and start analysis',
  loadTxt: 'Analyzing...',
  leg1: 'Primary curve',
  leg2: 'Secondary curve',
  leg3: 'Talus axis',
  leg4: '1st Metatarsal',
  disc: 'For definitive diagnosis, consult a Physical Medicine & Rehabilitation specialist.',
  flM: 'Meary',
  flC: 'Cal.Pitch',
  flT: 'Talar',
  recTitle: 'Clinical Assessment & Follow-up',
  rt1: 'Age-Based Recommendation',
  rt2: 'Treatment Plan',
  rt3: 'Follow-up Schedule',
  risserTitle: 'BONE MATURITY STAGING — RISSER & SANDERS',
  risserH: 'Risser Stage (Iliac Apophysis)',
  sandersH: 'Sanders Stage (Wrist)',
  risserC: '0: No ossification → max risk<br>1-2: 0-50% → growth continues<br>3-4: 50-100% → slowing<br>5: Complete → maturation done',
  sandersC: '1-2: Pre-peak → highest risk<br>3-4: Peak growth → active brace<br>5-6: Slowing → reduce<br>7-8: Complete → discontinue',
  orthoTitle: 'RECOMMENDED ORTHOTICS & FOOTWEAR',
  imgTitle: 'IMAGING INDICATIONS',
  discFinal: '⚕ These recommendations are based on SRS/SOSORT 2024 guidelines. All clinical decisions require evaluation by a <strong>Physical Medicine & Rehabilitation Specialist</strong>.',
  refTitle: 'Reference',
  sr1: 'Normal', sd1: 'No clinical scoliosis.',
  sr2: 'Mild', sd2: 'Exercise, 4-6 month follow-up.',
  sr3: 'Moderate', sd3: 'TLSO brace + Schroth.',
  sr4: 'Severe', sd4: 'Surgical evaluation.',
  fr1: 'Normal', fd1: 'Normal arch.',
  fr2: 'Mild Pes Planus', fd2: 'Insoles, exercise.',
  fr3: 'Moderate', fd3: 'UCBL + physiotherapy.',
  fr4: 'Severe', fd4: 'AFO/UCBL, surgery.',
  es1: 'Scoliosis Exercise Program',
  es2: 'Schroth · 13 exercises · TR/EN',
  ef1: 'Pes Planus Exercise Program',
  ef2: 'SFE · 15 exercises · TR/EN',
  footerTxt: 'CobbAI © 2025 · SRS/SOSORT 2024 · ⚕ Not medical advice · cobbai.vercel.app',
  kvPre: 'I have read and agree: ',
  kvLink: 'Personal Data Protection Notice',
  kvPost: '. I consent to my image being processed solely for analysis. I confirm I am a licensed and qualified Medical Doctor or Physiotherapist.',
  kvWarn: 'Please accept the privacy notice to continue.',
  modalTitle: 'Personal Data Protection',
  modalClose: 'Close',
  modalAccept: 'Accept & Close',
  kvBody: `<h3>PERSONAL DATA PROTECTION NOTICE</h3>
<p><strong>CobbAI</strong> ("Platform") acts as the data controller under applicable data protection regulations.</p>
<h4>1. Data Processed</h4>
<p>X-ray images uploaded to the Platform and optional demographic data (age, gender) are processed solely for AI-based analysis. Images are not permanently stored on our servers and are destroyed after analysis is complete.</p>
<h4>2. Purpose of Processing</h4>
<ul>
  <li>Cobb angle and Meary angle calculation</li>
  <li>Clinical recommendation generation (SRS/SOSORT 2024 guidelines)</li>
  <li>Platform quality improvement (anonymous, aggregated statistics)</li>
</ul>
<h4>3. Third-Party Services</h4>
<p>Image analysis is performed via the Google Gemini API. Google's privacy policy applies: <em>policies.google.com/privacy</em>. Image data is only transmitted during the API request and is not used by Google for model training.</p>
<h4>4. Data Security</h4>
<p>All communications are encrypted with TLS 1.3. Images are transmitted to the API in base64 format and are not retained in memory after processing.</p>
<h4>5. Your Rights</h4>
<ul>
  <li>Right to know whether your personal data is being processed</li>
  <li>Right to request information about processing</li>
  <li>Right to know the purpose of processing</li>
  <li>Right to correction of incomplete or inaccurate data</li>
  <li>Right to erasure or destruction of data</li>
</ul>
<h4>6. Professional Responsibility Declaration</h4>
<p>By using this platform, you declare that you are a licensed and qualified Medical Doctor or Physiotherapist. CobbAI is a <strong>clinical decision support tool</strong>, not a diagnostic tool. All clinical decisions must be made by a qualified healthcare professional.</p>
<p><em>Last updated: 2025</em></p>`,
  iosMsg: 'Safari → Share □↑ → "Add to Home Screen"',
  sevS: {
    normal: 'Normal',
    mild: 'Mild Scoliosis',
    moderate: 'Moderate Scoliosis',
    severe: 'Severe Scoliosis',
  },
  sevF: {
    normal: 'Normal',
    mild: 'Mild Pes Planus',
    moderate: 'Moderate Pes Planus',
    severe: 'Severe Pes Planus',
  },
  flex: {
    flexible: 'Flexible',
    rigid: 'Rigid',
    unknown: 'Unknown',
  },
  conf: {
    high: 'High Confidence · SRS',
    medium: 'Medium Confidence',
    low: 'Low Confidence',
  },
  curveP: 'PRIMARY CURVE',
  curveS: 'SECONDARY CURVE',
  cobb: 'Cobb',
  conv: 'Scoliosis Location',
  vert: 'Vertebrae',
  dL: '← LEFT',
  dR: '→ RIGHT',
  dl1: 'X-RAY ANALYSIS',
  dl2: 'EXERCISE PROGRAMS',
  dl3: 'FOR PHYSICIANS',
  dl4: 'FOR PATIENTS',
  dl5: 'VALIDATION',
  dn1: 'X-ray Scoliosis', ds1: 'Cobb angle · AP view',
  dn2: 'X-ray Pes Planus', ds2: 'Meary angle · Lateral view',
  dn3: 'Scoliosis Exercises', ds3: 'Schroth · 13 exercises',
  dn4: 'Pes Planus Exercises', ds4: 'SFE · 15 exercises',
  dn5: 'What is Scoliosis?', ds5: 'For physicians',
  dn6: 'What is Pes Planus?', ds6: 'For physicians',
  dn7: 'What is Scoliosis?', ds7: 'For patients',
  dn8: 'What is Pes Planus (Flat Foot)?', ds8: 'For patients',
  dnVal: 'Clinical Validation', dsVal: 'ICC · MAE · Bland-Altman',
  lsSub: 'AI-powered scoliosis and pes planus X-ray analysis platform',
  lsDocTitle: 'Medical Doctor / Physiotherapist',
  lsDocSub: 'X-Ray analysis, Cobb angle measurement, clinical assessment',
  lsPatTitle: 'Patient / Family Member',
  lsPatSub: 'Exercise programs, information and patient guides',
  lsDisc: '⚕ CobbAI is not a medical diagnostic tool',
  obTitle: 'Welcome to CobbAI',
  obSub: 'AI-powered spinal and foot X-ray analysis',
  ob1t: 'Upload X-ray',
  ob1d: 'Standing AP spine or lateral foot radiograph',
  ob2t: 'AI Analysis',
  ob2d: 'Cobb / Meary angle measured automatically',
  ob3t: 'PMR Recommendations',
  ob3d: 'Age-specific treatment plan and follow-up schedule',
  obBtn: 'Start →',
  obNote: '⚕ Not a substitute for clinical diagnosis. Consult a PMR specialist.',
  histTitle: 'RECENT MEASUREMENTS',
  prevXrayLbl: 'PREVIOUS X-RAY',
  currXrayLbl: 'CURRENT ANALYSIS',
  prevUTitle: 'Select previous X-ray',
  prevUHint: 'X-ray image from a previous date',
  prevAnalyzeBtn: 'Analyze Previous X-Ray →',
  prevLoadTxt: 'Analyzing...',
  compTitle: 'COMPARISON RESULT',
  ctrlBr: '☀️ Brightness',
  ctrlCt: '◑ Contrast',
  ctrlOp: '👁 Overlay',
  ctrlBA: '🔃 Before/After',
  ctrlReset: '↺ Reset',
  ctrlPng: '💾 Download PNG',
  notes: 'PHYSICIAN NOTES',
  notesPlaceholder: 'Enter your clinical notes here...',
  editLines: '⊹ Edit Endplates',
  resetToAI: '↺ Reset to AI Measurement',
  reportTitle: '📋 Automated Clinical Report',
  printBtn: '🖨️ Print / PDF',
  growthTitle: '📈 GROWTH PREDICTION ANALYSIS',
};

// ── Arabic ────────────────────────────────────────────────────

const ar: Translations = {
  badge: '🦴 تحليل الذكاء الاصطناعي',
  aiChip: 'AI · SRS/SOSORT 2024',
  forDoctors: 'للأطباء وأخصائيي العلاج الطبيعي',
  titleS: 'تحليل الجنف بالأشعة السينية <em>Scoliosis</em>',
  titleF: 'تحليل القدم المسطحة بالأشعة السينية <em>Pes Planus</em>',
  subS: 'زاوية كوب · عرض AP · SRS/SOSORT 2024',
  subF: 'زاوية ميري · عرض جانبي · أثناء حمل الوزن',
  tagline: 'أداة مساعدة للتشخيص للأطباء وأخصائيي العلاج الطبيعي · برامج تمارين وأدلة للمرضى',
  pLbl: 'المريض',
  pAge: 'العمر',
  pGen: 'الجنس',
  opt0: 'غير محدد',
  opt1: 'أنثى',
  opt2: 'ذكر',
  upLblS: 'الأشعة السينية والقياس',
  upLblF: 'أشعة القدم الجانبية',
  uTitleS: 'اختر أو التقط صورة',
  uTitleF: 'اختر أو التقط أشعة القدم',
  uHintS: 'الكاميرا أو المعرض · يُنصح بعرض AP واقفاً',
  uHintF: 'الكاميرا أو المعرض · مطلوب عرض جانبي بحمل الوزن',
  uIcoS: '🦴',
  uIcoF: '🦶',
  changBtn: '↺ تغيير',
  abtnS: 'احسب زاوية كوب →',
  abtnF: 'حلل القدم المسطحة →',
  resLbl: 'نتيجة التحليل',
  emptyMsg: 'قم بتحميل أشعة سينية وابدأ التحليل',
  loadTxt: 'جارٍ التحليل...',
  leg1: 'الانحناء الأولي',
  leg2: 'الانحناء الثانوي',
  leg3: 'محور الكاحل',
  leg4: 'عظم مشط القدم الأول',
  disc: 'للحصول على تشخيص دقيق، استشر أخصائي الطب الطبيعي وإعادة التأهيل.',
  flM: 'ميري',
  flC: 'انحدار العقب',
  flT: 'الكاحل',
  recTitle: 'التقييم السريري والمتابعة',
  rt1: 'التوصية حسب العمر',
  rt2: 'خطة العلاج',
  rt3: 'جدول المتابعة',
  risserTitle: 'تحديد مرحلة نضج العظام — ريسر وساندرز',
  risserH: 'مرحلة ريسر (نتوء الحرقفة)',
  sandersH: 'مرحلة ساندرز (المعصم)',
  risserC: '0: لا تعظم → خطر أقصى<br>1-2: 0-50٪ → النمو مستمر<br>3-4: 50-100٪ → يتباطأ<br>5: مكتمل → اكتمل النضج',
  sandersC: '1-2: قبل الذروة → أعلى خطر<br>3-4: ذروة النمو → دعامة نشطة<br>5-6: يتباطأ → تقليل<br>7-8: مكتمل → إيقاف',
  orthoTitle: 'الدعامات والأحذية الموصى بها',
  imgTitle: 'مؤشرات التصوير الإضافي',
  discFinal: '⚕ تستند هذه التوصيات إلى إرشادات SRS/SOSORT 2024. تتطلب جميع القرارات السريرية تقييم <strong>أخصائي الطب الطبيعي وإعادة التأهيل</strong>.',
  refTitle: 'المرجع',
  sr1: 'طبيعي', sd1: 'لا جنف سريري.',
  sr2: 'خفيف', sd2: 'تمارين، متابعة 4-6 أشهر.',
  sr3: 'متوسط', sd3: 'دعامة TLSO + سكروث.',
  sr4: 'شديد', sd4: 'تقييم جراحي.',
  fr1: 'طبيعي', fd1: 'قوس طبيعي.',
  fr2: 'قدم مسطحة خفيفة', fd2: 'نعل داخلي، تمارين.',
  fr3: 'متوسط', fd3: 'UCBL + علاج طبيعي.',
  fr4: 'شديد', fd4: 'AFO/UCBL، جراحة.',
  es1: 'برنامج تمارين الجنف',
  es2: 'سكروث · 13 تمريناً · TR/EN',
  ef1: 'برنامج تمارين القدم المسطحة',
  ef2: 'SFE · 15 تمريناً · TR/EN',
  footerTxt: 'CobbAI © 2025 · SRS/SOSORT 2024 · ⚕ ليس نصيحة طبية · cobbai.vercel.app',
  kvPre: 'قرأت وأوافق على: ',
  kvLink: 'إشعار حماية البيانات الشخصية',
  kvPost: '. أوافق على معالجة صورتي لأغراض التحليل فقط. أقر بأنني طبيب أو أخصائي علاج طبيعي مرخص.',
  kvWarn: 'يرجى قبول إشعار الخصوصية للمتابعة.',
  modalTitle: 'حماية البيانات الشخصية',
  modalClose: 'إغلاق',
  modalAccept: 'قبول وإغلاق',
  kvBody: `<h3>إشعار حماية البيانات الشخصية</h3>
<p><strong>CobbAI</strong> ("المنصة") تعمل بوصفها المتحكم في البيانات وفقاً للوائح حماية البيانات المعمول بها.</p>
<h4>1. البيانات المعالَجة</h4>
<p>تتم معالجة صور الأشعة السينية المحملة على المنصة والبيانات الديموغرافية الاختيارية (العمر، الجنس) فقط لأغراض التحليل بالذكاء الاصطناعي. لا تُخزَّن الصور بشكل دائم على خوادمنا وتُمحى بعد اكتمال التحليل.</p>
<h4>2. غرض المعالجة</h4>
<ul>
  <li>حساب زاوية كوب وزاوية ميري</li>
  <li>توليد التوصيات السريرية (إرشادات SRS/SOSORT 2024)</li>
  <li>تحسين جودة المنصة (إحصاءات مجمعة مجهولة الهوية)</li>
</ul>
<h4>3. خدمات الطرف الثالث</h4>
<p>يتم إجراء تحليل الصور عبر Google Gemini API. تنطبق سياسة خصوصية Google: <em>policies.google.com/privacy</em>.</p>
<h4>4. إقرار المسؤولية المهنية</h4>
<p>باستخدام هذه المنصة، تُقر بأنك طبيب أو أخصائي علاج طبيعي مرخص ومؤهل. CobbAI هي <strong>أداة دعم القرار السريري</strong> وليست أداة تشخيص.</p>
<p><em>آخر تحديث: 2025</em></p>`,
  iosMsg: 'Safari → مشاركة □↑ → "إضافة إلى الشاشة الرئيسية"',
  sevS: {
    normal: 'طبيعي',
    mild: 'جنف خفيف',
    moderate: 'جنف متوسط',
    severe: 'جنف شديد',
  },
  sevF: {
    normal: 'طبيعي',
    mild: 'قدم مسطحة خفيفة',
    moderate: 'قدم مسطحة متوسطة',
    severe: 'قدم مسطحة شديدة',
  },
  flex: {
    flexible: 'مرن',
    rigid: 'صلب',
    unknown: 'غير معروف',
  },
  conf: {
    high: 'ثقة عالية · SRS',
    medium: 'ثقة متوسطة',
    low: 'ثقة منخفضة',
  },
  curveP: 'الانحناء الأولي',
  curveS: 'الانحناء الثانوي',
  cobb: 'كوب',
  conv: 'موضع الجنف',
  vert: 'الفقرات',
  dL: '← يسار',
  dR: '→ يمين',
  dl1: 'تحليل الأشعة',
  dl2: 'برامج التمارين',
  dl3: 'للأطباء',
  dl4: 'للمرضى',
  dl5: 'التحقق',
  dn1: 'أشعة الجنف', ds1: 'زاوية كوب · عرض AP',
  dn2: 'أشعة القدم المسطحة', ds2: 'زاوية ميري · عرض جانبي',
  dn3: 'تمارين الجنف', ds3: 'سكروث · 13 تمريناً',
  dn4: 'تمارين القدم المسطحة', ds4: 'SFE · 15 تمريناً',
  dn5: 'ما هو الجنف؟', ds5: 'للأطباء',
  dn6: 'ما هي القدم المسطحة؟', ds6: 'للأطباء',
  dn7: 'ما هو الجنف؟', ds7: 'للمرضى',
  dn8: 'ما هي القدم المسطحة؟', ds8: 'للمرضى',
  dnVal: 'التحقق السريري', dsVal: 'ICC · MAE · Bland-Altman',
  lsSub: 'منصة تحليل أشعة الجنف والقدم المسطحة بالذكاء الاصطناعي',
  lsDocTitle: 'طبيب / أخصائي علاج طبيعي',
  lsDocSub: 'تحليل الأشعة السينية، قياس زاوية كوب، التقييم السريري',
  lsPatTitle: 'مريض / أحد أفراد الأسرة',
  lsPatSub: 'برامج التمارين والمعلومات وأدلة المرضى',
  lsDisc: '⚕ CobbAI ليست أداة تشخيص طبي',
  obTitle: 'مرحباً بك في CobbAI',
  obSub: 'تحليل أشعة العمود الفقري والقدم بالذكاء الاصطناعي',
  ob1t: 'تحميل الأشعة',
  ob1d: 'أشعة العمود الفقري AP واقفاً أو أشعة القدم الجانبية',
  ob2t: 'تحليل AI',
  ob2d: 'قياس زاوية كوب / ميري تلقائياً',
  ob3t: 'توصيات الطب الطبيعي',
  ob3d: 'خطة علاج وجدول متابعة مخصصان للعمر',
  obBtn: 'ابدأ →',
  obNote: '⚕ لا يحل محل التشخيص السريري. استشر أخصائي الطب الطبيعي.',
  histTitle: 'آخر القياسات',
  prevXrayLbl: 'الأشعة السابقة',
  currXrayLbl: 'التحليل الحالي',
  prevUTitle: 'اختر الأشعة السابقة',
  prevUHint: 'صورة أشعة سينية من تاريخ سابق',
  prevAnalyzeBtn: 'تحليل الأشعة السابقة →',
  prevLoadTxt: 'جارٍ التحليل...',
  compTitle: 'نتيجة المقارنة',
  ctrlBr: '☀️ السطوع',
  ctrlCt: '◑ التباين',
  ctrlOp: '👁 التراكب',
  ctrlBA: '🔃 قبل/بعد',
  ctrlReset: '↺ إعادة تعيين',
  ctrlPng: '💾 تنزيل PNG',
  notes: 'ملاحظات الطبيب',
  notesPlaceholder: 'أدخل ملاحظاتك السريرية هنا...',
  editLines: '⊹ تعديل الصفائح النهائية',
  resetToAI: '↺ العودة لقياس AI',
  reportTitle: '📋 تقرير سريري تلقائي',
  printBtn: '🖨️ طباعة / PDF',
  growthTitle: '📈 تحليل توقعات النمو',
};

// ── Exported T object ─────────────────────────────────────────

export const T: Record<Lang, Translations> = { tr, en, ar };

export function getT(lang: Lang): Translations {
  return T[lang] ?? T['en'];
}

// ── React hook ────────────────────────────────────────────────

export function useT(lang?: Lang): Translations {
  const stored = (typeof window !== 'undefined' ? localStorage.getItem('cobbai_lang') : null) as Lang | null;
  const resolved: Lang = lang ?? stored ?? 'tr';
  return T[resolved] ?? T['tr'];
}
