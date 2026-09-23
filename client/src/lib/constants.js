// Generation colors — hex int for Three.js
export const PROPHET_ID = 100000; // the star of the Prophet ﷺ, where every marfūʿ chain ends (not a narrator)
export const GC_HEX = {
  prophet: 0xfff3c9,
  sahabi: 0xf5d77a,
  tabii: 0x7ab8f5,
  muhaddith: 0xc07af5,
  rijal: 0x7af5c0,
};

// Generation colors — CSS strings
export const GCS = {
  prophet: '#fff3c9',
  sahabi: '#f5d77a',
  tabii: '#7ab8f5',
  muhaddith: '#c07af5',
  rijal: '#7af5c0',
};

// Years: the atlas counts in hijrī years; every date is shown as "671 م (50 هـ)" (Gregorian first, hijrī in parentheses)
export const hijriToCe = h => Math.round(h * 0.970229 + 621.5643);
export const fmtYear = (h, approx = false) => h == null || h === '' ? '؟' : `${hijriToCe(h)} م (${h} هـ)${approx ? ' ~' : ''}`;
/** "ت 852 هـ" inside a sentence → "ت 1449 م (852 هـ)" */
export const deathAt = h => `ت ${fmtYear(h)}`;

// Generation labels (Arabic)
export const GL = {
  prophet: 'رسول الله ﷺ',
  sahabi: 'صحابي',
  tabii: 'تابعي',
  muhaddith: 'محدّث',
  rijal: 'ناقد رجال',
};

// Z-axis offset per generation (3D view)
export const GEN_Z = {
  prophet: -165,
  sahabi: -120,
  tabii: -40,
  muhaddith: 40,
  rijal: 120,
};

// Historical eras for timeline
export const ERAS = [
  { label: 'عصر النبوة', start: 1, end: 11, col: '#f5d77a' },
  { label: 'الصحابة', start: 11, end: 100, col: '#f5c040' },
  { label: 'التابعون', start: 100, end: 180, col: '#7ab8f5' },
  { label: 'أتباع التابعين', start: 180, end: 250, col: '#5090d0' },
  { label: 'عصر التدوين', start: 250, end: 400, col: '#c07af5' },
  { label: 'المحدثون', start: 400, end: 700, col: '#9050d0' },
  { label: 'علماء الرجال', start: 700, end: 950, col: '#7af5c0' },
];

// Average lifespan per generation (for birth estimation)
export const AVG_LIFE = {
  prophet: 63,
  sahabi: 65,
  tabii: 70,
  muhaddith: 70,
  rijal: 75,
};

// Geo-axis cities for the vertical geographic axis
export const GEO_AXIS_CITIES = [
  { name: 'الأندلس', y: 160, major: false },
  { name: 'المغرب', y: 140, major: false },
  { name: 'الشام', y: 110, major: true },
  { name: 'بغداد', y: 100, major: true },
  { name: 'خراسان', y: 105, major: false },
  { name: 'الكوفة', y: 90, major: false },
  { name: 'البصرة', y: 75, major: true },
  { name: 'مصر', y: 40, major: true },
  { name: 'المدينة', y: -10, major: true },
  { name: 'مكة', y: -30, major: true },
  { name: 'اليمن', y: -110, major: true },
];

// City coordinates for narrator detail map
export const GEO_CITIES = {
  'الأندلس': { lat: 37.9, lng: -4.7 }, 'المغرب': { lat: 33.9, lng: -6.8 },
  'الشام': { lat: 33.5, lng: 36.3 }, 'دمشق': { lat: 33.5, lng: 36.3 },
  'بغداد': { lat: 33.3, lng: 44.4 }, 'العراق': { lat: 33.3, lng: 44.4 },
  'الكوفة': { lat: 32.0, lng: 44.4 }, 'البصرة': { lat: 30.5, lng: 47.8 },
  'خراسان': { lat: 36.2, lng: 59.6 }, 'نيسابور': { lat: 36.2, lng: 58.8 },
  'مرو': { lat: 37.6, lng: 61.8 }, 'بلخ': { lat: 36.7, lng: 66.9 },
  'فارس': { lat: 29.6, lng: 52.5 }, 'أصبهان': { lat: 32.7, lng: 51.7 },
  'الري': { lat: 35.6, lng: 51.4 }, 'بخارى': { lat: 39.8, lng: 64.4 },
  'مصر': { lat: 30.0, lng: 31.2 }, 'الفسطاط': { lat: 30.0, lng: 31.2 },
  'الإسكندرية': { lat: 31.2, lng: 29.9 },
  'المدينة': { lat: 24.5, lng: 39.6 }, 'المدينة المنورة': { lat: 24.5, lng: 39.6 },
  'مكة': { lat: 21.4, lng: 39.8 }, 'مكة المكرمة': { lat: 21.4, lng: 39.8 },
  'الطائف': { lat: 21.3, lng: 40.4 }, 'اليمن': { lat: 15.4, lng: 44.2 },
  'صنعاء': { lat: 15.4, lng: 44.2 }, 'القدس': { lat: 31.8, lng: 35.2 },
  'قرطبة': { lat: 37.9, lng: -4.7 }, 'واسط': { lat: 32.5, lng: 45.8 },
  'الموصل': { lat: 36.3, lng: 43.1 }, 'حران': { lat: 36.9, lng: 39.0 },
};

// Kind of report (classical terminology), by code used in the data
export const KINDS = [
  { key: 'marfu', label: 'مرفوع', title: 'ينتهي إلى النبي ﷺ', col: '#f0d080' },
  { key: 'mawquf', label: 'موقوف', title: 'ينتهي إلى صحابي: قوله أو فعله', col: '#f5d77a' },
  { key: 'maqtu', label: 'مقطوع', title: 'ينتهي إلى تابعي', col: '#7ab8f5' },
  { key: 'balagh', label: 'بلاغ', title: 'بلغ المؤلِّف بلا إسناد', col: '#c07af5' },
  { key: 'ray', label: 'رأي', title: 'قول راوٍ متأخر أو رأي فقهي', col: '#9aa' },
];
export const kindOf = code => KINDS[code] || null;

// Hadith grades and graders of the hadith-api editions, in Arabic
const GRADE_WORDS = { sahih: 'صحيح', daif: 'ضعيف', 'da\'if': 'ضعيف', hasan: 'حسن', isnaad: 'الإسناد', isnad: 'الإسناد', sanad: 'الإسناد', lighairihi: 'لغيره', mauquf: 'موقوف', muquf: 'موقوف', maqtu: 'مقطوع', munkar: 'منكر', shadh: 'شاذ', mawdu: 'موضوع', maudu: 'موضوع', batil: 'باطل', mursal: 'مرسل', mutawatir: 'متواتر', hadith: 'حديث', matn: 'المتن', bukhari: 'البخاري', muslim: 'مسلم', and: 'و', very: 'جداً', gharib: 'غريب', 'mu\'allaq': 'معلّق', muallaq: 'معلّق' };
const GRADERS = { 'al-albani': 'الألباني', 'zubair ali zai': 'زبير علي زئي', 'shuaib al arnaut': 'شعيب الأرناؤوط', 'abu ghuddah': 'عبد الفتاح أبو غدة', 'muhammad muhyi al-din abdul hamid': 'محمد محيي الدين عبد الحميد', 'muhammad fouad abd al-baqi': 'محمد فؤاد عبد الباقي', 'ahmad muhammad shakir': 'أحمد محمد شاكر', 'bashar awad maarouf': 'بشار عوّاد معروف', 'salim al-hilali': 'سليم الهلالي' };
export function gradeAr(g) {
  if (!g || g === '-') return '';
  let s = g.replace(/\s*-\s*Agreed Upon/i, ' متفق عليه').replace(/\s*-\s*Bukhari And Muslim/i, ' رواه البخاري ومسلم');
  const toks = s.split(/\s+/).map(t => { const m = t.match(/^([A-Za-z']+)(.*)$/); if (!m) return t; const w = GRADE_WORDS[m[1].toLowerCase()]; return w ? w + m[2] : t; });
  s = toks.join(' ');
  s = s.replace(/^الإسناد (صحيح|حسن|ضعيف)/, 'إسناده $1').replace(/(ضعيف) جداً|جداً (ضعيف)/, 'ضعيف جداً').replace(/^(صحيح|حسن|ضعيف) الإسناد/, '$1 الإسناد');
  return s;
}
export function graderAr(name) { return GRADERS[(name || '').toLowerCase().trim()] || name || ''; }
