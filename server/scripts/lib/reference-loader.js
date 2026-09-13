/**
 * Loads and indexes narrator reference data for enrichment.
 *
 * Primary source: Known narrators with biographical data.
 * We embed a curated dataset of the most important narrators
 * from the 9 canonical collections, then supplement with any
 * external dataset if available.
 */

import { normalize } from './name-matcher.js';

// Curated reference of major narrators with biographical data
// Sources: Tahdhib al-Kamal, Taqrib al-Tahdhib, Siyar A'lam al-Nubala
const KNOWN_NARRATORS = [
  // ── الصحابة (Companions) ──
  { name: 'أبو هريرة', latin: 'Abu Hurairah', death: 57, gen: 'sahabi', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'عبد الله بن عمر', latin: 'Abdullah ibn Umar', death: 73, gen: 'sahabi', origin: 'مكة', reliability: 'ثقة' },
  { name: 'عائشة بنت أبي بكر', latin: 'Aisha bint Abu Bakr', death: 58, gen: 'sahabi', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'عائشة', latin: 'Aisha', death: 58, gen: 'sahabi', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'أنس بن مالك', latin: 'Anas ibn Malik', death: 93, gen: 'sahabi', origin: 'البصرة', reliability: 'ثقة' },
  { name: 'عبد الله بن عباس', latin: 'Abdullah ibn Abbas', death: 68, gen: 'sahabi', origin: 'مكة', reliability: 'ثقة' },
  { name: 'ابن عباس', latin: 'Ibn Abbas', death: 68, gen: 'sahabi', origin: 'مكة', reliability: 'ثقة' },
  { name: 'جابر بن عبد الله', latin: 'Jabir ibn Abdullah', death: 78, gen: 'sahabi', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'عبد الله بن مسعود', latin: 'Abdullah ibn Masud', death: 32, gen: 'sahabi', origin: 'الكوفة', reliability: 'ثقة' },
  { name: 'ابن مسعود', latin: 'Ibn Masud', death: 32, gen: 'sahabi', origin: 'الكوفة', reliability: 'ثقة' },
  { name: 'أبو سعيد الخدري', latin: 'Abu Said al-Khudri', death: 74, gen: 'sahabi', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'علي بن أبي طالب', latin: 'Ali ibn Abi Talib', death: 40, gen: 'sahabi', origin: 'الكوفة', reliability: 'ثقة' },
  { name: 'أبو بكر الصديق', latin: 'Abu Bakr al-Siddiq', death: 13, gen: 'sahabi', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'عمر بن الخطاب', latin: 'Umar ibn al-Khattab', death: 23, gen: 'sahabi', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'عثمان بن عفان', latin: 'Uthman ibn Affan', death: 35, gen: 'sahabi', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'أبو موسى الأشعري', latin: 'Abu Musa al-Ashari', death: 44, gen: 'sahabi', origin: 'البصرة', reliability: 'ثقة' },
  { name: 'معاوية بن أبي سفيان', latin: 'Muawiya ibn Abi Sufyan', death: 60, gen: 'sahabi', origin: 'الشام', reliability: 'ثقة' },
  { name: 'سعد بن أبي وقاص', latin: 'Sad ibn Abi Waqqas', death: 55, gen: 'sahabi', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'أبو ذر الغفاري', latin: 'Abu Dharr al-Ghifari', death: 32, gen: 'sahabi', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'زيد بن ثابت', latin: 'Zaid ibn Thabit', death: 45, gen: 'sahabi', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'أبو أيوب الأنصاري', latin: 'Abu Ayyub al-Ansari', death: 52, gen: 'sahabi', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'سهل بن سعد', latin: 'Sahl ibn Sad', death: 91, gen: 'sahabi', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'البراء بن عازب', latin: 'al-Bara ibn Azib', death: 72, gen: 'sahabi', origin: 'الكوفة', reliability: 'ثقة' },
  { name: 'أبو الدرداء', latin: 'Abu al-Darda', death: 32, gen: 'sahabi', origin: 'الشام', reliability: 'ثقة' },
  { name: 'حذيفة بن اليمان', latin: 'Hudhaifa ibn al-Yaman', death: 36, gen: 'sahabi', origin: 'الكوفة', reliability: 'ثقة' },
  { name: 'عمران بن حصين', latin: 'Imran ibn Husain', death: 52, gen: 'sahabi', origin: 'البصرة', reliability: 'ثقة' },
  { name: 'المغيرة بن شعبة', latin: 'al-Mughira ibn Shuba', death: 50, gen: 'sahabi', origin: 'الكوفة', reliability: 'ثقة' },
  { name: 'أسامة بن زيد', latin: 'Usama ibn Zaid', death: 54, gen: 'sahabi', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'أم سلمة', latin: 'Umm Salama', death: 62, gen: 'sahabi', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'حفصة بنت عمر', latin: 'Hafsa bint Umar', death: 45, gen: 'sahabi', origin: 'المدينة', reliability: 'ثقة' },

  // ── التابعون (Followers) ──
  { name: 'سعيد بن المسيب', latin: 'Said ibn al-Musayyib', death: 94, gen: 'tabii', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'نافع مولى ابن عمر', latin: 'Nafi mawla Ibn Umar', death: 117, gen: 'tabii', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'نافع', latin: 'Nafi', death: 117, gen: 'tabii', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'عروة بن الزبير', latin: 'Urwa ibn al-Zubayr', death: 94, gen: 'tabii', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'الزهري', latin: 'al-Zuhri', death: 124, gen: 'tabii', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'محمد بن شهاب الزهري', latin: 'Muhammad ibn Shihab al-Zuhri', death: 124, gen: 'tabii', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'ابن شهاب', latin: 'Ibn Shihab', death: 124, gen: 'tabii', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'الحسن البصري', latin: 'al-Hasan al-Basri', death: 110, gen: 'tabii', origin: 'البصرة', reliability: 'ثقة' },
  { name: 'محمد بن سيرين', latin: 'Muhammad ibn Sirin', death: 110, gen: 'tabii', origin: 'البصرة', reliability: 'ثقة' },
  { name: 'ابن سيرين', latin: 'Ibn Sirin', death: 110, gen: 'tabii', origin: 'البصرة', reliability: 'ثقة' },
  { name: 'عطاء بن أبي رباح', latin: 'Ata ibn Abi Rabah', death: 114, gen: 'tabii', origin: 'مكة', reliability: 'ثقة' },
  { name: 'مجاهد بن جبر', latin: 'Mujahid ibn Jabr', death: 104, gen: 'tabii', origin: 'مكة', reliability: 'ثقة' },
  { name: 'مجاهد', latin: 'Mujahid', death: 104, gen: 'tabii', origin: 'مكة', reliability: 'ثقة' },
  { name: 'إبراهيم النخعي', latin: 'Ibrahim al-Nakhai', death: 96, gen: 'tabii', origin: 'الكوفة', reliability: 'ثقة' },
  { name: 'الشعبي', latin: 'al-Shabi', death: 104, gen: 'tabii', origin: 'الكوفة', reliability: 'ثقة' },
  { name: 'عامر بن شراحيل الشعبي', latin: 'Amir ibn Sharahil al-Shabi', death: 104, gen: 'tabii', origin: 'الكوفة', reliability: 'ثقة' },
  { name: 'أبو سلمة بن عبد الرحمن', latin: 'Abu Salama ibn Abd al-Rahman', death: 94, gen: 'tabii', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'سالم بن عبد الله', latin: 'Salim ibn Abdullah', death: 106, gen: 'tabii', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'القاسم بن محمد', latin: 'al-Qasim ibn Muhammad', death: 106, gen: 'tabii', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'طاوس بن كيسان', latin: 'Tawus ibn Kaysan', death: 106, gen: 'tabii', origin: 'اليمن', reliability: 'ثقة' },
  { name: 'عكرمة', latin: 'Ikrima', death: 105, gen: 'tabii', origin: 'المدينة', reliability: 'ثقة صدوق' },
  { name: 'قتادة', latin: 'Qatada', death: 118, gen: 'tabii', origin: 'البصرة', reliability: 'ثقة' },
  { name: 'قتادة بن دعامة', latin: 'Qatada ibn Diama', death: 118, gen: 'tabii', origin: 'البصرة', reliability: 'ثقة' },

  // ── أتباع التابعين + المحدثون ──
  { name: 'مالك بن أنس', latin: 'Malik ibn Anas', death: 179, gen: 'muhaddith', origin: 'المدينة', reliability: 'إمام حجة' },
  { name: 'مالك', latin: 'Malik', death: 179, gen: 'muhaddith', origin: 'المدينة', reliability: 'إمام حجة' },
  { name: 'سفيان بن عيينة', latin: 'Sufyan ibn Uyayna', death: 198, gen: 'muhaddith', origin: 'مكة', reliability: 'ثقة حافظ' },
  { name: 'سفيان الثوري', latin: 'Sufyan al-Thawri', death: 161, gen: 'muhaddith', origin: 'الكوفة', reliability: 'ثقة حافظ إمام' },
  { name: 'شعبة بن الحجاج', latin: 'Shuba ibn al-Hajjaj', death: 160, gen: 'muhaddith', origin: 'البصرة', reliability: 'ثقة حافظ' },
  { name: 'شعبة', latin: 'Shuba', death: 160, gen: 'muhaddith', origin: 'البصرة', reliability: 'ثقة حافظ' },
  { name: 'الأعمش', latin: 'al-Amash', death: 148, gen: 'muhaddith', origin: 'الكوفة', reliability: 'ثقة حافظ' },
  { name: 'سليمان بن مهران الأعمش', latin: 'Sulayman ibn Mihran al-Amash', death: 148, gen: 'muhaddith', origin: 'الكوفة', reliability: 'ثقة حافظ' },
  { name: 'الليث بن سعد', latin: 'al-Layth ibn Sad', death: 175, gen: 'muhaddith', origin: 'مصر', reliability: 'ثقة إمام' },
  { name: 'عبد الرزاق بن همام', latin: 'Abd al-Razzaq', death: 211, gen: 'muhaddith', origin: 'اليمن', reliability: 'ثقة حافظ' },
  { name: 'عبد الرزاق', latin: 'Abd al-Razzaq', death: 211, gen: 'muhaddith', origin: 'اليمن', reliability: 'ثقة حافظ' },
  { name: 'وكيع بن الجراح', latin: 'Waki ibn al-Jarrah', death: 197, gen: 'muhaddith', origin: 'الكوفة', reliability: 'ثقة حافظ' },
  { name: 'يحيى بن سعيد القطان', latin: 'Yahya ibn Said al-Qattan', death: 198, gen: 'muhaddith', origin: 'البصرة', reliability: 'ثقة حافظ إمام' },
  { name: 'عبد الله بن المبارك', latin: 'Abdullah ibn al-Mubarak', death: 181, gen: 'muhaddith', origin: 'خراسان', reliability: 'ثقة حافظ' },
  { name: 'ابن المبارك', latin: 'Ibn al-Mubarak', death: 181, gen: 'muhaddith', origin: 'خراسان', reliability: 'ثقة حافظ' },
  { name: 'هشام بن عروة', latin: 'Hisham ibn Urwa', death: 146, gen: 'muhaddith', origin: 'المدينة', reliability: 'ثقة' },
  { name: 'ابن جريج', latin: 'Ibn Jurayj', death: 150, gen: 'muhaddith', origin: 'مكة', reliability: 'ثقة' },
  { name: 'حماد بن زيد', latin: 'Hammad ibn Zaid', death: 179, gen: 'muhaddith', origin: 'البصرة', reliability: 'ثقة ثبت' },
  { name: 'حماد بن سلمة', latin: 'Hammad ibn Salama', death: 167, gen: 'muhaddith', origin: 'البصرة', reliability: 'ثقة' },
  { name: 'يحيى بن أبي كثير', latin: 'Yahya ibn Abi Kathir', death: 132, gen: 'muhaddith', origin: 'البصرة', reliability: 'ثقة ثبت' },
  { name: 'محمد بن إسماعيل البخاري', latin: 'Muhammad ibn Ismail al-Bukhari', death: 256, gen: 'muhaddith', origin: 'بخارى', reliability: 'إمام' },
  { name: 'البخاري', latin: 'al-Bukhari', death: 256, gen: 'muhaddith', origin: 'بخارى', reliability: 'إمام' },
  { name: 'مسلم بن الحجاج', latin: 'Muslim ibn al-Hajjaj', death: 261, gen: 'muhaddith', origin: 'نيسابور', reliability: 'إمام' },
  { name: 'أحمد بن حنبل', latin: 'Ahmad ibn Hanbal', death: 241, gen: 'muhaddith', origin: 'بغداد', reliability: 'إمام حافظ' },
  { name: 'أبو داود', latin: 'Abu Dawud', death: 275, gen: 'muhaddith', origin: 'البصرة', reliability: 'إمام حافظ' },
  { name: 'الترمذي', latin: 'al-Tirmidhi', death: 279, gen: 'muhaddith', origin: 'خراسان', reliability: 'إمام حافظ' },
  { name: 'النسائي', latin: 'al-Nasai', death: 303, gen: 'muhaddith', origin: 'خراسان', reliability: 'إمام حافظ' },
  { name: 'ابن ماجه', latin: 'Ibn Majah', death: 273, gen: 'muhaddith', origin: 'خراسان', reliability: 'إمام' },
  { name: 'الدارمي', latin: 'al-Darimi', death: 255, gen: 'muhaddith', origin: 'خراسان', reliability: 'إمام حافظ' },
  { name: 'إسماعيل بن إبراهيم', latin: 'Ismail ibn Ibrahim', death: 193, gen: 'muhaddith', origin: 'البصرة', reliability: 'ثقة حافظ' },
  { name: 'يحيى بن معين', latin: 'Yahya ibn Main', death: 233, gen: 'muhaddith', origin: 'بغداد', reliability: 'إمام في الجرح والتعديل' },
  { name: 'علي بن المديني', latin: 'Ali ibn al-Madini', death: 234, gen: 'muhaddith', origin: 'البصرة', reliability: 'إمام في العلل' },
  { name: 'أبو حاتم الرازي', latin: 'Abu Hatim al-Razi', death: 277, gen: 'muhaddith', origin: 'الري', reliability: 'إمام حافظ' },
  // Ibn Ḥibbān (d. 354) and al-Dāraquṭnī (d. 385) never narrate in the seven books: "ابن حبان" in the isnads is محمد بن يحيى بن حبان
];

/**
 * Build the reference map from the curated list.
 * @returns {Map<string, object>} normalized name → narrator data
 */
export function loadReference() {
  const refMap = new Map();

  for (const entry of KNOWN_NARRATORS) {
    const key = normalize(entry.name);
    refMap.set(key, {
      name_ar: entry.name,
      name_latin: entry.latin,
      death_ah: entry.death,
      generation: entry.gen,
      origin: entry.origin,
      reliability: entry.reliability,
    });
  }

  console.log(`  Reference loaded: ${refMap.size} known narrators`);
  return refMap;
}

/**
 * Estimate a narrator's generation based on their average chain position.
 *
 * @param {number} avgPosition - Average position in chains (0 = near compiler)
 * @param {number} maxChainLen - Average max chain length
 * @returns {string} Generation estimate
 */
export function estimateGeneration(avgPosition, maxChainLen) {
  if (maxChainLen === 0) return 'muhaddith';
  const ratio = avgPosition / maxChainLen;
  if (ratio > 0.75) return 'sahabi';
  if (ratio > 0.55) return 'tabii';
  if (ratio < 0.25) return 'muhaddith';
  return 'muhaddith';
}
