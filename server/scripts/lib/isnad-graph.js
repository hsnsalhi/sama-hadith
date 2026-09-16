/**
 * Isnad graph parser.
 *
 * Reads the isnad (chain of transmission) at the head of a hadith text and
 * returns a small directed graph: nodes are narrators (normalized name keys),
 * edges go from STUDENT to TEACHER (the direction of "X said: Y told me").
 * The compiler (Bukhari, Muslim…) is the implicit ROOT.
 *
 * Handles: hamza-less connectors (اخبرنا, انبانا…), quotative fillers (قال,
 * قالا…), parallel teachers ("حدثنا X، وY، قالا حدثنا Z"), the tahwil mark
 * "ح" (a second chain for the same hadith, starting again from the compiler),
 * chained connectors ("وحدثني عن مالك"), relative references ("عن ابيه",
 * "عن جده") resolved from the previous name, and "يعني ابن X" clarifications.
 *
 *   parseIsnadGraph(text) → {
 *     nodes: Map<key, { key, raw, depth }>,        // depth = shortest distance from ROOT
 *     edges: [{ student, teacher, connector, type }], // student = null means ROOT (compiler)
 *     leaves: [key…],                                  // narrators with no teacher in this isnad (usually the companion)
 *     reachesProphet: bool,                             // the Prophet is mentioned right after the isnad
 *     isnadEnd: number,                                 // char offset of the matn in `normalized`
 *     normalized: string,
 *   }
 *
 * Everything is heuristic. Tune with scripts/eval numbers, not by intuition.
 */

// ── Normalization ──────────────────────────────────────────────────────────

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭـ]/g;

/** Normalize Arabic for matching: no diacritics, unified alef/hamza/ya/ta-marbuta. */
export function normalizeArabic(s) {
  return (s || '')
    .replace(/ًا|اً/g, '') // accusative tanwīn: مجاهدًا → مجاهد
    .replace(DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[“”«»"'’‘‏]/g, '')
    .replace(/[,;؛]/g, '،')
    .replace(/\s+/g, ' ')
    .trim();
}

const AR = /^[ء-ي]+$/; // a plain Arabic word

// Name vocabulary (words of the names in Taqrīb/Tahdhīb al-Tahdhīb and the reference lists), set by the build.
// When set, a bare word is accepted as a name only if it is known (or is followed by a patronymic).
let NAME_VOCAB = new Set();
export function setNameVocab(set) { NAME_VOCAB = set || new Set(); }
export const vocabHas = w => !NAME_VOCAB.size || NAME_VOCAB.has(w) || (w.startsWith('ال') && (NAME_VOCAB.has(w.slice(2)) || (w.endsWith('يه') && NAME_VOCAB.has(w.slice(0, -1))))) || (w.endsWith('يه') && NAME_VOCAB.has(w.slice(0, -1)));

const DIACRITIC_CHAR = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭـ]/;
const CHAR_MAP = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ؤ': 'و', 'ئ': 'ي', 'ى': 'ي', 'ة': 'ه', ',': '،', ';': '،', '؛': '،' };
const DROP = new Set(['“', '”', '«', '»', '"', "'", '’', '‘', '‏', '‎', '‫', '‬', '\ufffd']);
const BRACKETS = new Set(['{', '}', '[', ']', '<', '>', '|', '*', '_']);

/** Same as normalizeArabic but returns, for every normalized char, the index of the source char. */
export function normalizeWithMap(text) {
  const out = [], map = [];
  let lastSpace = true, quoted = false;
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    if (c === '{') { quoted = true; continue; }                 // a Qurʾānic quotation ({هيت لك}) never holds a narrator
    if (c === '}') { quoted = false; if (!lastSpace) { out.push(' '); map.push(i); lastSpace = true; } continue; }
    if (quoted) continue;
    if (DIACRITIC_CHAR.test(c) || DROP.has(c)) continue;
    if (/\s/.test(c) || BRACKETS.has(c)) { if (!lastSpace) { out.push(' '); map.push(i); lastSpace = true; } continue; }
    c = CHAR_MAP[c] || c;
    out.push(c); map.push(i); lastSpace = false;
  }
  if (out.length && out[out.length - 1] === ' ') { out.pop(); map.pop(); }
  map.push(text.length);
  return { normalized: out.join(''), map };
}

/** Display form of a source span: diacritics removed, spelling (hamza, ة) kept. */
export function displayForm(s) {
  return (s || '').replace(/ًا|اً/g, '').replace(DIACRITICS, '').replace(/\s*،\s*/g, ' ').replace(/[“”«»"'’‘‏‎]/g, '').replace(/\s+/g, ' ').trim();
}

// ── Vocabulary ─────────────────────────────────────────────────────────────

const CONNECTORS = new Map([
  ['حدثنا', 'direct'], ['حدثني', 'direct'], ['حدثتنا', 'direct'], ['حدثتني', 'direct'], ['حدثه', 'direct'], ['حدثهم', 'direct'], ['حدثت', 'direct'],
  ['اخبرنا', 'direct'], ['اخبرني', 'direct'], ['اخبرتنا', 'direct'], ['اخبرتني', 'direct'], ['اخبره', 'direct'], ['اخبرهم', 'direct'], ['اخبرت', 'direct'],
  ['انبانا', 'direct'], ['انباني', 'direct'], ['انباه', 'direct'],
  ['سمعت', 'direct'], ['سمعنا', 'direct'], ['سمع', 'direct'],
  ['حدثنيه', 'direct'], ['حدثناه', 'direct'], ['اخبرنيه', 'direct'], ['اخبرناه', 'direct'], ['حدثتنيه', 'direct'], ['انبانيه', 'direct'],
  ['حدثكم', 'direct'], ['اخبركم', 'direct'], ['حدثك', 'direct'], ['اخبرك', 'direct'], ['انباكم', 'direct'],
  ['ثنا', 'direct'], ['ثني', 'direct'],
  ['قرا', 'direct'], ['قرات', 'direct'], ['قري', 'direct'], ['كتب', 'direct'], // قرأ علينا / قرأت على / قُرئ على / كتب إليّ
  ['روي', 'quote'], ['رواه', 'quote'], ['يرويه', 'quote'], ['زاد', 'quote'], ['قال لي', 'direct'], ['قال لنا', 'direct'],
  ['عن', 'indirect'],
  ['بلغني', 'quote'], ['بلغه', 'quote'], ['بلغنا', 'quote'], ['بلغها', 'quote'], ['بلغهم', 'quote'], // بلاغ: "بلغني عن فلان" (Muwaṭṭaʾ)
]);
// words allowed right after these connectors before the name
const CONNECTOR_TAIL = { 'قرا': ['علينا', 'علي', 'عليه'], 'قرات': ['علي', 'عليه'], 'قري': ['علي', 'عليه'], 'كتب': ['الي', 'اليه'], 'روي': ['هذا', 'الحديث', 'هذه', 'ذلك', 'عنه', 'له'], 'رواه': ['هذا', 'الحديث'], 'يرويه': [], 'بلغني': ['عن'], 'بلغه': ['عن'], 'بلغنا': ['عن'], 'بلغها': ['عن'], 'بلغهم': ['عن'] };
// phrases removed from the token stream (replaced by spaces, offsets preserved)
const NOISE_PHRASES = /(?:رضي|رضى) الله (?:عنهما|عنهم|عنهن|عنها|عنه)(?![ء-ي])|ان شاء الله|رحمه الله|رحمها الله|تعالي عنه|عليه السلام|قال ابو عيسي هذا حديث/g;

const PUNCT = /^[،:.؟()¤\-]$/;

const FILLERS = new Set([
  'قال', 'قالا', 'قالوا', 'قالت', 'قلت', 'يقول', 'تقول', 'يقولان', 'قالتا', 'وقال', 'فقال', 'وقالت', 'فقالت', 'وقالا', 'وزاد', 'زاد', 'به', 'بذلك', 'ايضا',
  'وقد', 'قد', 'ولقد', 'لقد', 'وفيما', 'فيما', 'وفي', 'مما', 'بما', 'وبه', 'وبهذا', 'ومن', 'وعن', 'وايضا', 'كذلك', 'وكذلك', 'هكذا', 'وهكذا',
  'انه', 'انها', 'انهما', 'انهم', 'وانه', 'اني', 'لي', 'له', 'لنا', 'لهم', 'لهما',
  'ح', 'و', 'جميعا', 'كلاهما', 'كلهم', 'كلهما', 'جميعهم', 'ثلاثتهم', 'اربعتهم',
  'وهو', 'هو', 'هي', 'المعني', 'بهذا', 'بمثله', 'نحوه', 'بمعناه', 'مثله', 'بنحوه', 'الاسناد', 'واللفظ', 'حديث', 'في', 'هذا', 'الحديث', 'واحد', 'المعنى',
  'يعني', // only when not followed by a name (handled in readName)
  'وغير', 'وغيره', 'وغيرهم', 'وغيرهما', 'غيره', 'غيرهم', 'غيرهما', 'غير',
]);

const NOT_NAME_START = new Set([
  'الله', 'رسول', 'النبي', 'رب', 'ان', 'لا', 'ما', 'من', 'في', 'الي', 'عند', 'كان', 'كانت', 'قال', 'قالت', 'يقول',
  'ذلك', 'هذا', 'هذه', 'الذي', 'التي', 'الذين', 'ثم', 'بعد', 'قبل', 'حيث', 'لما', 'كل', 'بعض', 'غير', 'مثل', 'احد', 'شيء',
  'يوم', 'ليله', 'عام', 'سنه', 'رجل', 'رجلا', 'امراه', 'ناس', 'قوم', 'اهل', 'اصحاب', 'صلي', 'سلم', 'عليه', 'وسلم', 'بسم',
  'الرحمن', 'الرحيم', 'جميعا', 'ايضا', 'اذ', 'اذا', 'حتي', 'لعل', 'كيف', 'اين', 'متي', 'انه', 'انها', 'انا', 'نحن', 'هو', 'هي',
  'هم', 'هن', 'هما', 'اما', 'انما', 'لم', 'لن', 'قد', 'لقد', 'فلما', 'فقال', 'فقالت', 'وقال', 'وقالت', 'فان', 'وان',
  'الرجل', 'المراه', 'الناس', 'القوم', 'شيخ', 'رجال', 'نفر', 'غيره', 'غيرهم', 'اخر', 'واحد', 'نبي', 'به', 'بها', 'بهذا',
  'ذكر', 'يذكر', 'زعم', 'بعضهم', 'غير', 'كلهم', 'احدهم', 'احدهما', 'صاحب', 'صاحبه', 'اصحابه', 'اهله', 'ابنه', 'ابنته',
  // anonymous groups and "the others" ("وقال الآخران حدثنا")
  'الحبيب', 'الامين', 'عمومتي', 'بمني', 'الاخران', 'الاخرون', 'الاخر', 'الباقون', 'الاخرين', 'رجلان', 'رجلين', 'رجال', 'رهط', 'نفر', 'نفرا', 'شيوخ', 'شيوخا', 'الثقه', 'اعرابي', 'اعرابيا', 'ولد',
  'بلغني', 'بلغه', 'بلغنا', 'بلغها', 'بلغهم', 'فبلغني', 'وبلغني', 'فبلغه', 'وبلغه', 'بلغ', 'يبلغه', 'منه', 'منها', 'منهم', 'علينا', 'عليها', 'عليهم', 'انتهي', 'ذكروا', 'رفع', 'عنده', 'عندنا', 'عندهم', 'فيه', 'فيها', 'لهم', 'لها',
  // verbs, particles and glosses that slipped in as one-word "names"
  'ممن', 'خرجت', 'خطبه', 'عده', 'اخرجه', 'اسناده', 'اعظم', 'جعل', 'حديثه', 'رويا', 'سواء', 'سيد', 'غزا', 'قضي', 'قل', 'قيل', 'نجي', 'يقال', 'ويقال', 'يكني', 'ويكني', 'ثلاثه', 'احدي', 'ابناء', 'ذي', 'لد', 'عق', 'جزء', 'بيعه', 'محدث', 'مخبر', 'جاريه', 'شكل', 'غلام', 'فلان', 'فلانه', 'اصحابنا', 'عمومه', 'قريبه', 'عميله', 'جديه', 'وعن', 'ومن', 'كنيته', 'اسمه', 'واسمه', 'مولاه', 'مولاته', 'موذن', 'تيبه', 'سعدي', 'عميه', 'اخت', 'اختي', 'اخته', 'اخي', 'اخيه', 'عمي', 'خالي', 'خاله', 'جدتي', 'جدته', 'امي', 'امه', 'ابنتي', 'ابني', 'زوجي', 'زوجته', 'زوجها', 'مولاي',
  'كانوا', 'كانا', 'والله', 'نام', 'التمس', 'لفظا', 'مخبرا', 'منادي', 'غزوا', 'نبيكم', 'الدابه', 'التوراه', 'المسلمون', 'المتلاعنين', 'الملاعنه', 'الملي', 'عليكم', 'قدم', 'وفدنا', 'اخذ', 'اصبنا', 'بيع', 'اعلمهم', 'بذا', 'ونحن', 'وكانت', 'وذكر', 'ويذكر', 'ويروي', 'وقراته', 'قراته',
]);
const OTHERS = new Set(['الاخران', 'الاخرون', 'الاخر', 'الباقون', 'الاخرين']);
// ال-words that are never a nisba/laqab at the end of a name
const NON_NISBA = new Set(['الحبيب', 'الامين', 'الغد', 'الحديث', 'المعني', 'الثقه', 'المامون', 'الحروريه', 'الذين', 'التي', 'الذي', 'القصاص', 'السنبل', 'العقيقه', 'المنبر', 'المسجد', 'الصلاه', 'الجمعه', 'الليل', 'النهار', 'اليوم', 'الناس', 'القوم', 'الكتاب', 'القران', 'السنه', 'البيت', 'الدار', 'المدينه', 'الكوفه', 'البصره', 'الشام', 'اليمن', 'العراق', 'الحج', 'الصوم', 'الزكاه', 'الخمر', 'الماء', 'الطعام', 'الجنه', 'النار', 'الموت', 'الرحيم', 'الحق', 'الخير', 'الشر', 'الامر', 'الحرب', 'الاسناد', 'اللفظ', 'الاول', 'الثاني', 'الاخران', 'الاخرون']);

// Words that end a name
const NAME_END0 = new Set([
  'قال', 'قالت', 'قالا', 'قالوا', 'قالتا', 'يقول', 'تقول', 'انه', 'انها', 'انهما', 'انهم', 'ان', 'عن', 'يحدث', 'يخبر', 'يذكر', 'يرفعه',
  'رفعه', 'سمعته', 'سمعتها', 'سمعه', 'يبلغ', 'بلغني', 'بلغه', 'بلغنا', 'بلغها', 'بلغهم', 'انتهي', 'به', 'بهذا', 'بمثله', 'نحوه', 'وهو', 'هو', 'هي', 'كان', 'كانت', 'انا',
  'يرويه', 'يقرا', 'يرفع', 'يخبره', 'يحدثه', 'اخبره', 'حدثه', 'او', 'ثم', 'في', 'الي', 'من', 'مع', 'الا', 'اذ', 'اذا',
  'لما', 'فلما', 'حين', 'عند', 'يوم', 'ليله', 'وكان', 'صلي', 'رضي', 'رضى', 'عليه', 'الله', 'عنه', 'عنها', 'عنهم', 'عنهما', 'رحمه',
  'يحدثنا', 'يحدثني', 'اخبرت', 'حدثت', 'ذكر', 'يذكرون', 'زعم', 'سئل', 'سيل', 'سال', 'سالت', 'ساله', 'سالته', 'يسال',
  'قرا', 'قرات', 'كتب', 'كتبت', 'رايت', 'راي', 'رايته', 'شهدت', 'اتيت', 'جاء', 'جاءت', 'دخلت', 'دخل', 'خرج', 'خرجنا', 'كنا', 'كنت',
  'بينما', 'اني', 'انك', 'ما', 'لا', 'قد', 'لقد', 'وقد', 'يخبرنا', 'يخبرني', 'زوج', 'زوجه', 'النبي', 'رسول', 'صاحب', 'مولاه',
  'خطيب', 'امام', 'قاضي', 'والي', 'امير', 'فقال', 'فقالت', 'وقال', 'وقالت', 'قالوا', 'يعني', 'المعني', 'واللفظ', 'لفظ', 'قراءه', 'اجازه', 'مناوله',
  'ح', 'جميعا', 'كلاهما', 'كلهم', 'الحديث', 'حديث', 'بهذا', 'الاسناد', 'مثله', 'نحوه', 'بنحوه', 'بمعناه', 'حدثنا', 'حدثني', 'اخبرنا', 'اخبرني', 'انبانا', 'سمعت', 'سمعنا', 'سمع',
  'واسمه', 'اسمه', 'واسم', 'واثني', 'وانا', 'وهي', 'وقراه', 'وقراته', 'قراته', 'بالاسنادين', 'والمعني', 'جالس', 'يشهدان', 'يذكران', 'سمعا', 'كتابا', 'يساله', 'وكل', 'وذكر', 'حتي', 'وكانا', 'وكانت', 'وكانوا', 'يعزيه', 'اتينا', 'اتي', 'زوجا', 'قسم', 'قلنا', 'اقبلنا', 'بايعت', 'ولو', 'سالوا', 'وساله', 'اخاه', 'اباه', 'ونحن', 'ويذكر', 'ويروي', 'يسال', 'يقولون', 'يحدثون',
]);
const NAME_END = NAME_END0;
// accusative: "سمعت مجاهدًا" → مجاهد (only when the stem is a known name and the alef form is not)
const deAcc = w => (w && w.length > 3 && w.endsWith('ا') && !vocabHas(w) && !NAME_END0.has(w) && vocabHas(w.slice(0, -1))) ? w.slice(0, -1) : w;

const HONORIFICS = /(?:^| )(?:رضي|رضى) الله (?:عنهما|عنهم|عنهن|عنها|عنه)(?= |$)|(?:^| )صلي الله عليه وسلم(?= |$)|(?:^| )رحمه الله(?= |$)|(?:^| )رحمها الله(?= |$)|(?:^| )عليه السلام(?= |$)|(?:^| )عليهما السلام(?= |$)/g;

const PROPHET = /(?:^| )(?:رسول الله|النبي|نبي الله|رفعه|يرفعه|رفعته|مرفوعا|مرفوع|يبلغ به|بلغ به|ينميه)(?= |$)/;

const KUNYA = new Set(['ابو', 'ابي', 'ابا', 'ام']);
const THEOPHORIC = new Set(['عبد', 'عبيد']);
// second word of a compound name: عبد الله، عبد الرحمن، عبيد الله، عبد ربه، عبد المطلب، عبد مناف، عبد عمرو، عبد قيس…
const THEO_TAIL = new Set(['ربه', 'مناف', 'شمس', 'عمرو', 'قيس', 'يزيد', 'المطلب', 'كلال', 'ياليل', 'ود', 'مناه', 'يغوث', 'نهم', 'خير']);
const theoComplement = w => w !== undefined && AR.test(w) && (w === 'الله' || THEO_TAIL.has(w) || (w.startsWith('ال') && !NAME_END.has(w))) && !CONNECTORS.has(w);
const PATRONYM = new Set(['بن', 'ابن', 'بنت', 'ابنه', 'مولي']);
const SAYING = new Set(['قال', 'قالت', 'قالا', 'قالوا', 'كان', 'كانت', 'كانوا', 'يقول', 'تقول', 'سيل', 'سئل', 'سال', 'سالت', 'سمع', 'سمعت', 'راي', 'رات', 'خرج', 'خرجت', 'صلي', 'صلت', 'اتي', 'اتت', 'جاء', 'جاءت', 'دخل', 'دخلت', 'مر', 'مرت', 'نهي', 'امر', 'افتي', 'اعتق', 'اشتري', 'باع', 'كتب', 'حج', 'اعتمر', 'ركب', 'نزل', 'حدث', 'يحدث', 'ذكر', 'زعم', 'اخبر']); // what a named man did or said: the report stops on him
const REVERSE = new Set(['اخبره', 'حدثه', 'اخبرته', 'حدثته', 'اخبرهم', 'حدثهم', 'اخبراه', 'حدثاه', 'اخبرها', 'حدثها', 'اخبرني', 'حدثني', 'اخبرنا', 'حدثنا', 'حدثاهم', 'اخبراهم', 'حدثوهم', 'اخبروهم', 'حدثاكم', 'حدثوه', 'اخبروه', 'انباه', 'انباهم', 'انبانا', 'انباني']);
const FIRST_PERSON = new Set(['حدثني', 'حدثنا', 'اخبرني', 'اخبرنا', 'انباني', 'انبانا', 'حدثتني', 'اخبرتني', 'حدثتنا', 'اخبرتنا']);
const ACCUSATIVE_CONNECTORS = new Set(['سمعت', 'سمعنا', 'سمع', 'ان']);
// relative words → canonical third-person form used in keys ("جدتي" = the student's grandmother → جدته@student)
const REL_CANON = { 'اباه': 'ابيه', 'اباها': 'ابيه', 'اخاه': 'اخيه', 'جدتاي': 'جدته', 'عماي': 'عمه', 'ابواي': 'ابيه', 'حماتي': 'حماته', 'حماته': 'حماته', 'حماتها': 'حماته', 'ابي': 'ابيه', 'امي': 'امه', 'جدي': 'جده', 'جدتي': 'جدته', 'عمي': 'عمه', 'عمتي': 'عمته', 'خالي': 'خاله', 'خالتي': 'خالته', 'اخي': 'اخيه', 'اختي': 'اخته', 'والدي': 'ابيه', 'والدتي': 'امه', 'مولاي': 'مولاه', 'مولاتي': 'مولاته', 'ابنتي': 'ابنته', 'زوجي': 'زوجه', 'زوجتي': 'زوجته', 'امراتي': 'زوجته',
  'ابيه': 'ابيه', 'ابيها': 'ابيه', 'ابيهما': 'ابيه', 'جده': 'جده', 'جدها': 'جده', 'جدهما': 'جده', 'جدته': 'جدته', 'جدتها': 'جدته', 'امه': 'امه', 'امها': 'امه', 'امهما': 'امه', 'عمه': 'عمه', 'عمها': 'عمه', 'عمته': 'عمته', 'عمتها': 'عمته', 'خاله': 'خاله', 'خالها': 'خاله', 'خالته': 'خالته', 'خالتها': 'خالته', 'اخيه': 'اخيه', 'اخيها': 'اخيه', 'اخوها': 'اخيه', 'اخته': 'اخته', 'اختها': 'اخته', 'مولاه': 'مولاه', 'مولاها': 'مولاه', 'مولاته': 'مولاته', 'مولاتها': 'مولاته', 'ابنه': 'ابنه', 'ابنها': 'ابنه', 'ابنته': 'ابنته', 'ابنتها': 'ابنته', 'زوجه': 'زوجه', 'زوجها': 'زوجه', 'زوجته': 'زوجته', 'والده': 'ابيه', 'والدها': 'ابيه', 'والدته': 'امه', 'والدتها': 'امه' };
const RELATIVES = new Set(Object.keys(REL_CANON));
/** Words that can never stand alone as a narrator: relatives without a referent, verbs, particles. */
export const NON_NAME_WORDS = new Set([...NOT_NAME_START, ...NAME_END0, ...FILLERS, ...RELATIVES, 'ابي', 'جدي', 'جدتي', 'عمي', 'خالي', 'اخي', 'اختي', 'امي', 'ابنتي', 'ابني', 'مولاي', 'شيخ', 'شيخنا', 'شيخي', 'صاحبنا', 'صاحب', 'رجل', 'امراه']);
export const isJunkName = key => { const k = key.replace(/~+$/, ''); return !k.includes(' ') && !k.includes('@') && NON_NAME_WORDS.has(k); };
const ACC_REL = new Set(['اباه', 'اباها', 'اخاه', 'ابنه', 'جده', 'عمه', 'خاله', 'امه', 'ابنته', 'اخته', 'عمته', 'خالته', 'جدته', 'مولاه']);

// Fallback list of frequent first tokens of names (used for و-conjunction detection before a corpus pass exists)
const NAME_STARTS = new Set(['ابو', 'ابي', 'ابا', 'ابن', 'ام', 'عبد', 'عبيد', 'محمد', 'احمد', 'علي', 'عمر', 'عمرو', 'عثمان', 'يحيي', 'اسحاق', 'زهير', 'قتيبه', 'هناد', 'سفيان', 'مالك', 'شعبه', 'هشيم', 'وكيع', 'حماد', 'اسماعيل', 'ابراهيم', 'موسي', 'يونس', 'يعقوب', 'الحسن', 'الحسين', 'الليث', 'الاعمش', 'الزهري', 'مسدد', 'محمود', 'حجاج', 'ابراهيم']);

// ── Tokenizer ──────────────────────────────────────────────────────────────

const GLUE_SUFFIX = ['وقال', 'فقال', 'قال', 'انه', 'انها', 'حدثنا', 'حدثني', 'اخبرنا', 'اخبرني', 'وفي', 'في', 'عن'];
const GLUE_PREFIX = ['حدثنا', 'حدثني', 'اخبرنا', 'اخبرني', 'سمعت', 'وعن', 'عن'];
function tokenize(normalized) {
  const tokens = [], starts = [], ends = [];
  const re = /[،:.؟()¤\-]|[^\s،:.؟()¤\-]+/g;
  let m;
  const push = (t, a, b) => { tokens.push(t); starts.push(a); ends.push(b); };
  while ((m = re.exec(normalized))) {
    const t = m[0], a = m.index;
    // words glued in the source: "هريرهقال" → "هريره" "قال", "حدثنااسحاق" → "حدثنا" "اسحاق"
    if (NAME_VOCAB.size && t.length >= 6 && AR.test(t) && !NAME_VOCAB.has(t)) {
      const suf = GLUE_SUFFIX.find(x => t.endsWith(x) && t.length - x.length >= 3 && (NAME_VOCAB.has(t.slice(0, -x.length)) || NOT_NAME_START.has(t.slice(0, -x.length))));
      if (suf) { push(t.slice(0, -suf.length), a, a + t.length - suf.length); push(suf, a + t.length - suf.length, a + t.length); continue; }
      const pre = GLUE_PREFIX.find(x => t.startsWith(x) && t.length - x.length >= 3 && NAME_VOCAB.has(t.slice(x.length)));
      if (pre) { push(pre, a, a + pre.length); push(t.slice(pre.length), a + pre.length, a + t.length); continue; }
    }
    push(t, a, a + t.length);
  }
  return { tokens, starts, ends };
}

function connectorOf(t) {
  if (CONNECTORS.has(t)) return t;
  if (t.length > 2 && (t[0] === 'و' || t[0] === 'ف') && CONNECTORS.has(t.slice(1))) return t.slice(1);
  return null;
}
/** connector at tokens[i], possibly two words ("قال لي"); returns { conn, len } or null */
function connectorAt(tokens, i) {
  const t = tokens[i];
  if ((t === 'قال' || t === 'وقال' || t === 'فقال') && (tokens[i + 1] === 'لي' || tokens[i + 1] === 'لنا')) return { conn: 'قال ' + tokens[i + 1], len: 2 };
  const c = connectorOf(t);
  if (c && CONNECTOR_TAIL[c] && CONNECTOR_TAIL[c].length && !CONNECTOR_TAIL[c].includes(tokens[i + 1])) return null; // "قرأ" transmits only as "قرأ علينا / على فلان"; "قرأ {هيت لك}" is a recitation
  return c ? { conn: c, len: 1 } : null;
}

// ── Name grammar ───────────────────────────────────────────────────────────

/**
 * Read a personal name at tokens[i]. Returns { tokens, next } or null.
 * name := head tail*
 * head := (ابو|ام) word | (عبد|عبيد) word | ابن word | word
 * tail := (بن|بنت|مولي) [ابي|عبد] word | يعني [ابن] word | ال-word (nisba) | one extra word
 */
const KIN = new Set(['اخ', 'اخي', 'اخت', 'اخته', 'عم', 'عمه', 'عمته', 'خال', 'خاله', 'خالته', 'امراه', 'ابنه', 'ابنته', 'اخيه', 'ولد', 'بني', 'بنو', 'اخو', 'زوج', 'زوجه', 'مولاه', 'مولاته']);
const isNameStartWord = (w, nameStarts) => nameStarts.has(w) || NAME_STARTS.has(w) || KUNYA.has(w) || THEOPHORIC.has(w) || w === 'ابن';
function readName(tokens, i, nameStarts, { noExtra = false, trusted = false } = {}) {
  const n = tokens.length;
  if (i >= n) return null;
  let t = tokens[i];
  if (!AR.test(t) || connectorOf(t) || FILLERS.has(t) || NAME_END.has(t)) return null;
  if (NOT_NAME_START.has(t)) return null;
  const out = [];
  let j = i;

  const word = k => k < n && AR.test(tokens[k]) && !connectorOf(tokens[k]) && !NAME_END.has(tokens[k]) && !PUNCT.test(tokens[k]);

  const nameWord = w => vocabHas(w) || nameStarts.has(w);
  // "ابن أخت لأبي هريرة", "ابن أخي الزهري": the relation is a gloss, the name that follows is the person's
  const kinGloss = k => { // returns the index after the gloss + name, or -1
    let m = k; if (tokens[m] === '،') m++;
    const cp = tokens.slice(); if (cp[m] && cp[m][0] === 'ل' && cp[m].length > 3 && (KUNYA.has(cp[m].slice(1)) || cp[m].slice(1) === 'ابن' || (!vocabHas(cp[m]) && vocabHas(cp[m].slice(1))))) cp[m] = cp[m].slice(1);
    const sub = readName(cp, m, nameStarts, { noExtra: true, trusted: true });
    return sub ? { tokens: sub.tokens, next: sub.next, src: cp } : null;
  };
  if (KUNYA.has(t) && tokens[j + 1] === 'بن') { out.push('ابي'); j += 1; } // "أُبَيّ بن كعب": a given name, not a kunya
  else if (KUNYA.has(t)) {
    const off = tokens[j + 1] === '،' && word(j + 2) ? 2 : 1; // "أبا، عبيد": stray comma inside the name
    if (!word(j + off) && !THEOPHORIC.has(tokens[j + off])) return null;
    const c = tokens[j + off];
    if ((NOT_NAME_START.has(c) && c !== 'شيخ') || (c[0] === 'و' && !vocabHas(c)) || (!nameWord(deAcc(c)) && /^[يتن]/.test(c))) return null; // "أبي ووكيع" (my father and Wakīʿ), "أبو يستحب…"
    out.push(t === 'ابي' || t === 'ابا' ? 'ابو' : t, deAcc(c)); j += off + 1;
    // "أم المؤمنين، عائشة": the title followed by the name → the name
    if (t === 'ام' && c === 'المومنين') { const k = tokens[j] === '،' ? j + 1 : j; if (k < n && word(k) && nameWord(tokens[k]) && !RELATIVES.has(tokens[k])) { out.length = 0; out.push(tokens[k]); j = k + 1; } }
    if (THEOPHORIC.has(tokens[j - 1]) && theoComplement(tokens[j])) { out.push(tokens[j]); j += 1; } // ابو عبد الله
  } else if (THEOPHORIC.has(t) && theoComplement(tokens[j + 1])) {
    out.push(t, tokens[j + 1]); j += 2; // عبد الله / عبد الرحمن / عبيد الله …
  } else if (t === 'ابن' || t === 'بنت') {
    if (!word(j + 1)) return null;
    let c = tokens[j + 1];
    if (c[0] === 'ل' && !vocabHas(c) && vocabHas(c.slice(1))) c = c.slice(1); // "ابن لكعب" = a son of Kaʿb
    if (NOT_NAME_START.has(c)) return null;
    if (KIN.has(c)) { const g = kinGloss(j + 2); if (!g) return null; out.push(t, c, ...g.tokens); j = g.next; return { tokens: out, next: j }; } // ابن أخت لأبي هريرة
    if (c === 'عليه' && t === 'ابن') { out.push('بن', 'عليه'); j += 2; return { tokens: out, next: j }; } // إسماعيل ابن عُلَيَّة
    out.push(t, c); j += 2;
    if (KUNYA.has(c) && word(j)) { out.push(tokens[j]); j += 1; }                         // ابن أبي فديك
    if (THEOPHORIC.has(out[out.length - 1]) && theoComplement(tokens[j])) { out.push(tokens[j]); j += 1; } // ابن عبد الرحمن، ابن أبي عبد الله
  } else {
    // "قلت لقتيبة: حدثكم…" → the name is قتيبة
    if (t[0] === 'ل' && t.length > 3 && !vocabHas(t) && (vocabHas(t.slice(1)) || nameStarts.has(t.slice(1)))) t = t.slice(1);
    if (t[0] === 'ب' && t.length > 3 && !vocabHas(t) && vocabHas(t.slice(1))) return null;
    // a bare word is a name only if it is a known name word, is followed by a patronymic ("جعيد بن عبد الرحمن") or a kunya ("جعد أبو عثمان"),
    // or directly follows a first-person transmission verb ("حدثنا جعد")
    t = deAcc(t);
    const patronymNext = j + 1 < n && (tokens[j + 1] === 'بن' || tokens[j + 1] === 'بنت' || (KUNYA.has(tokens[j + 1]) && word(j + 2)));
    // "عن ثابث، عن أنس": a word standing between two transmission links is a name by structure
    const between = trusted || (j + 1 < n && (connectorOf(tokens[j + 1]) || (tokens[j + 1] === '،' && j + 2 < n && connectorOf(tokens[j + 2]))));
    if (!nameWord(t) && !patronymNext && !between) return null;
    if (!nameWord(t) && /^[يتن]/.test(t) && t.length > 4 && !patronymNext) return null;
    out.push(t); j += 1;
  }

  let extra = 0;
  while (j < n) {
    const u = tokens[j];
    if (u === '،' && tokens[j + 1] === 'مولي' && j + 2 < n && AR.test(tokens[j + 2]) && !connectorOf(tokens[j + 2]) && !NAME_END.has(tokens[j + 2])) { j += 1; continue; } // "ثابت، مولى عبد الرحمن"
    if (PATRONYM.has(u)) {
      const off = tokens[j + 1] === '،' && j + 2 < n && AR.test(tokens[j + 2]) && !NAME_END.has(tokens[j + 2]) && !connectorOf(tokens[j + 2]) ? 2 : 1; // "بن، نمير"
      const w = tokens[j + off];
      if (w === 'عليه' && u === 'ابن') { out.push('بن', 'عليه'); j += off + 1; extra = 0; continue; } // إسماعيل ابن عُلَيَّة
      if (w !== undefined && KIN.has(w)) { const g = kinGloss(j + off + 1); if (g) { j = g.next; extra = 0; continue; } break; } // "X ابن أخي Y": a gloss, skipped
      if (KUNYA.has(w) && tokens[j + off + 1] === 'بن') { out.push(u === 'ابن' ? 'بن' : u, 'ابي'); j += off + 1; extra = 0; continue; } // الطفيل بن أُبَيّ بن كعب
      if (w !== undefined && AR.test(w) && !connectorOf(w) && !PUNCT.test(w) && (!NAME_END.has(w) || KUNYA.has(w) || THEOPHORIC.has(w))) {
        out.push(u === 'ابن' ? 'بن' : u);
        if ((KUNYA.has(w) && j + off + 1 < n && AR.test(tokens[j + off + 1]) && !NAME_END.has(tokens[j + off + 1])) || (THEOPHORIC.has(w) && theoComplement(tokens[j + off + 1]))) {
          out.push(w === 'ابا' ? 'ابي' : w, tokens[j + off + 1]); j += off + 2;
          if (KUNYA.has(w) && THEOPHORIC.has(tokens[j - 1]) && theoComplement(tokens[j])) { out.push(tokens[j]); j += 1; } // بن أبي عبد الرحمن
        }
        else { out.push(deAcc(w)); j += off + 1; }
        extra = 0;
        continue;
      }
    }
    if (u === 'يعني' && j + 1 < n) {
      const k = j + 1;
      if (tokens[k] === 'ابن' && word(k + 1)) { out.push('بن', tokens[k + 1]); j = k + 2; continue; }
      if (word(k) && !FILLERS.has(tokens[k])) { out.push(tokens[k]); j = k + 1; continue; }
      break;
    }
    if (PUNCT.test(u) || connectorOf(u) || NAME_END.has(u) || FILLERS.has(u) || REVERSE.has(u) || !AR.test(u)) break;
    if (u === 'علي' || u === 'عليه' || u === 'عليها') break; // preposition after a name ("عمر على المنبر"); "علي" as a given name is a head, "بن علي" a patronym
    if (u[0] === 'و' && u.length > 2 && (nameStarts.has(u.slice(1)) || NAME_STARTS.has(u.slice(1)))) break; // "، وابو كريب" → sibling
    if (THEOPHORIC.has(u) && theoComplement(tokens[j + 1])) { out.push(u, tokens[j + 1]); j += 2; extra = 0; continue; } // الحميدي عبد الله …
    if (KUNYA.has(u) && out.length >= 1 && u !== 'ام' && word(j + 1) && !REVERSE.has(tokens[j + 1]) && !KUNYA.has(tokens[j + 1])) { out.push(u === 'ابا' || u === 'ابي' ? 'ابو' : u, tokens[j + 1]); j += 2; extra = 0; if (THEOPHORIC.has(tokens[j - 1]) && theoComplement(tokens[j])) { out.push(tokens[j]); j += 1; } continue; } // الربيع بن نافع أبو توبة، سعيد أبي شجاع، القاسم أبو عبد الرحمن
    if (u.startsWith('ال')) {                                           // nisba / laqab
      if (NON_NISBA.has(u) || u === 'الله') break;
      if (!nameWord(u) && /(?:يان|يين|يون)$/.test(u)) break;              // "الدمشقيان": a nisba shared by two siblings
      out.push(u); j += 1; continue;
    }
    if (word(j) && (tokens[j + 1] === 'بن' || tokens[j + 1] === 'بنت') && out.length === 2 && KUNYA.has(out[0]) && !NOT_NAME_START.has(u) && !RELATIVES.has(u) && u[0] !== 'و') { out.push(u); j += 1; extra = 0; continue; } // apposition: "أبو كامل فضيل بن حسين"
    if (extra < 1 && !noExtra && (NAME_VOCAB.has(deAcc(u)) || nameStarts.has(u)) && !/^[وفبلك]/.test(u) && !RELATIVES.has(u) && !PATRONYM.has(u) && !KUNYA.has(u) && !KIN.has(u)) { out.push(deAcc(u)); j += 1; extra += 1; continue; } // one extra given word (صالح السمان …)
    break;
  }
  // a name never ends with a particle ("عبد", "بن أبي", "مولى", "أم")
  while (out.length > 1 && /^(?:عبد|بن|ابن|ابي|ابو|ام|مولي|بني|بنو|ال|اخي|اخ|اخت|عم|خال)$/.test(out[out.length - 1])) { out.pop(); if (out[out.length - 1] === 'بن' || out[out.length - 1] === 'بنت') out.pop(); }
  if (!out.length || (out.length === 1 && /^(?:ابن|ابو|ام|عبد|عبيد|بن|مولي)$/.test(out[0]))) return null;
  return { tokens: out, next: j };
}

/** Normalized key for a raw name (honorifics removed, kunya case unified). */
export function cleanName(raw) {
  let s = normalizeArabic(raw).replace(HONORIFICS, ' ').replace(/[،:.؟()\-]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/(^| )(عبد|عبيد)(الله|الرحمن|الرحيم|العزيز|الملك|الكريم|الوهاب|الرزاق|الوارث|الصمد|الاعلي|المجيد|الحميد|المطلب)(?= |$)/g, '$1$2 $3'); // عبدالله → عبد الله
  s = s.replace(/(^| )(ثابث|اسمعيل|اسحق|ابرهيم|هرون|سليمن|عثمن|عليي|داوود|عبدالرحمن|الرحمان)(?= |$)/g, (m, a, w) => a + ({ 'ثابث': 'ثابت', 'اسمعيل': 'اسماعيل', 'اسحق': 'اسحاق', 'ابرهيم': 'ابراهيم', 'هرون': 'هارون', 'سليمن': 'سليمان', 'عثمن': 'عثمان', 'عليي': 'علي', 'داوود': 'داود', 'عبدالرحمن': 'عبد الرحمن', 'الرحمان': 'الرحمن' })[w]);
  s = s.replace(/^(?:ابي|ابا) (?!بن )/, 'ابو ');
  s = s.replace(/^و(?=(?:ابو|ابن|ام|عبد|عبيد) )/, '');
  s = s.replace(/ (?:قال|قالت|انه|انها|يقول)$/, '').trim();
  s = s.replace(/ (?:ام المومنين|زوج النبي(?: صلي الله عليه وسلم)?|امير المومنين|خليفه رسول الله)(?= |$)/g, '').trim();
  return s;
}

function resolveRelative(word, prevName) {
  if (!prevName) return null;
  const parts = prevName.split(' ');
  const idx = parts.indexOf('بن');
  word = REL_CANON[word] || word;
  if (word === 'ابيه') return idx > 0 && idx + 1 < parts.length ? parts.slice(idx + 1).join(' ') : null;
  if (word === 'جده') {
    if (idx <= 0) return null;
    const rest = parts.slice(idx + 1); const idx2 = rest.indexOf('بن');
    return idx2 > 0 && idx2 + 1 < rest.length ? rest.slice(idx2 + 1).join(' ') : null;
  }
  return null;
}

// ── Main parser ────────────────────────────────────────────────────────────

export function parseIsnadGraph(text, nameStarts = new Set(), { compilerKeys = new Set(), _retry = false } = {}) {
  const { normalized: normalized0, map } = normalizeWithMap(text || '');
  const normalized = normalized0.replace(NOISE_PHRASES, m => '¤' + ' '.repeat(m.length - 1)).replace(/(?<=(?:^| )(?:ابن|بن|ابو|ابي|عبد|عبيد|ام))،/g, ' '); // "وابن، بشار": a stray comma inside a name (same length: the char map stays valid)
  const { tokens, starts, ends } = tokenize(normalized);
  const n = tokens.length;
  const spanOf = (from, to) => text.slice(map[starts[from]], map[ends[to - 1] ] ?? text.length); // original text of tokens[from..to)
  const raws = new Map(); // key → display forms seen
  const MAX = Math.min(n, 220);

  const nodes = new Map();
  const edges = [];
  const edgeSeen = new Set();
  const addNode = (key, raw, display) => {
    if (!nodes.has(key)) nodes.set(key, { key, raw, display: display || raw, depth: Infinity });
    return nodes.get(key);
  };
  // would S→T close a cycle? (T already leads to S through teacher edges)
  const reaches = (from, to) => {
    const stack = [from], seen = new Set();
    while (stack.length) { const k = stack.pop(); if (k === to) return true; if (seen.has(k)) continue; seen.add(k); for (const e of edges) if (e.student === k) stack.push(e.teacher); }
    return false;
  };
  const distinctKey = (key, students) => {
    if (!nodes.has(key)) return key;
    if (students.some(s => s !== null && (s === key || reaches(key, s)))) { let k = 2; while (nodes.has(`${key}#${k}`)) k++; return `${key}#${k}`; }
    return key;
  };
  const addEdge = (student, teacher, connector) => {
    if (student === teacher) return;
    const id = `${student}→${teacher}`;
    if (edgeSeen.has(id)) return;
    edgeSeen.add(id);
    edges.push({ student, teacher, connector, type: CONNECTORS.get(connector) || (REVERSE.has(connector) ? 'direct' : 'quote') });
  };

  let frontier = [null];      // nodes waiting for their teacher; null = ROOT (compiler)
  let prevFrontier = [null];  // frontier before the last name (for sibling names)
  const pendingFrontiers = []; // frontiers of the chains closed by a tahwil ("ح"), joined again by "جميعا عن"
  const ALL_OF = new Set(['جميعا', 'كلاهما', 'كلهم', 'كلهما', 'جميعهم', 'ثلاثتهم', 'اربعتهم']);
  let lastGroup = null, lastAnchor = null; // sibling group narrowed by "قال فلان: حدثنا…" — "وقال الآخران" restores the others
  const anchorOf = key => { const found = nodes.has(key) ? key : [...nodes.keys()].filter(x => x.startsWith(key + ' ')); return typeof found === 'string' ? found : (found.length === 1 ? found[0] : null); };
  const narrowTo = anchor => { if (frontier.length > 1 || (lastGroup && lastGroup.includes(anchor))) lastGroup = frontier.length > 1 ? frontier : lastGroup; else if (!lastGroup || !lastGroup.includes(anchor)) lastGroup = null; frontier = [anchor]; prevFrontier = [anchor]; lastName = anchor; lastAnchor = anchor; };
  const restoreOthers = () => { frontier = lastGroup && lastGroup.length ? lastGroup : prevFrontier; prevFrontier = frontier; };
  const isGroupMember = k => frontier.includes(k) || prevFrontier.includes(k) || (lastGroup && lastGroup.includes(k)) || frontier.some(f => f && reaches(k, f)) || edges.some(e => e.student === null && e.teacher === k);
  let lastConnector = null;
  let lastName = null;
  let i = 0, stop = 0;
  let noExtraNext = false; // bare-name starts are read without the optional extra word

  const skipFillers = k => { while (k < n && (FILLERS.has(tokens[k]) || PUNCT.test(tokens[k]))) k++; return k; };
  const isNameStart = w => nameStarts.has(w) || NAME_STARTS.has(w) || KUNYA.has(w) || THEOPHORIC.has(w) || w === 'ابن';

  // "باب ما جاء في …" chapter heading glued to the text: jump to the first connector
  if (tokens[0] === 'باب') { let k = 1; while (k < n && !connectorAt(tokens, k)) k++; if (k < n) i = k; }

  while (i < MAX) {
    const t = tokens[i];

    if (t === 'ح') { pendingFrontiers.push(frontier.filter(f => f !== null)); frontier = [null]; prevFrontier = [null]; i++; continue; } // tahwil: new chain from the compiler
    if (t === '-' && edges.length) { // "- قال زهير وكان ثقة -": aside without transmission → skip it
      let k = i + 1; while (k < n && k < i + 12 && tokens[k] !== '-') k++;
      if (k < n && tokens[k] === '-') { const inner = tokens.slice(i + 1, k); if (!inner.some((w, x) => connectorAt(inner, x)) && !inner.includes('يعني') && !inner.includes('هو')) { i = k + 1; continue; } }
    }

    // "، هو ابن ابي كثير" / "، يعني ابن زيد" / "، يعني الثوري" → clarifies the previous name
    if ((t === 'هو' || t === 'وهو' || t === 'يعني') && lastName && nodes.has(lastName)) {
      let k = i + 1, add = null;
      if (tokens[k] === 'ابن' && k + 1 < n && AR.test(tokens[k + 1]) && (!NAME_END.has(tokens[k + 1]) || KUNYA.has(tokens[k + 1])) && !connectorOf(tokens[k + 1])) {
        add = ['بن', tokens[k + 1]]; k += 2;
        if ((KUNYA.has(tokens[k - 1]) || THEOPHORIC.has(tokens[k - 1])) && k < n && AR.test(tokens[k])) { add.push(tokens[k]); k += 1; }
        while (k < n && AR.test(tokens[k]) && tokens[k].startsWith('ال') && !NAME_END.has(tokens[k]) && !connectorOf(tokens[k])) { add.push(tokens[k]); k += 1; } // … بن عمرو الرقي
      }
      else if (t !== 'يعني' && /^(?:ابن|ابو) [^ ]+$/.test(lastName) && k < n && AR.test(tokens[k]) && !NAME_END.has(tokens[k]) && !connectorOf(tokens[k]) && !FILLERS.has(tokens[k]) && !NOT_NAME_START.has(tokens[k])) {
        // "عن ابن حبان - هو محمد بن يحيى بن حبان -": the full name replaces the short one when it contains it
        const nm = readName(tokens, k, nameStarts, { noExtra: true });
        const tail = lastName.split(' ')[1];
        if (nm && nm.tokens.includes('بن') && nm.tokens.includes(tail)) {
          const newKey = cleanName(nm.tokens.join(' '));
          if (newKey && newKey !== lastName && !nodes.has(newKey)) {
            const node = nodes.get(lastName); nodes.delete(lastName); node.key = newKey; node.raw = nm.tokens.join(' '); node.display = displayForm(spanOf(k, nm.next)); nodes.set(newKey, node);
            for (const e of edges) { if (e.student === lastName) e.student = newKey; if (e.teacher === lastName) e.teacher = newKey; }
            frontier = frontier.map(f => f === lastName ? newKey : f);
            lastName = newKey;
          }
          i = nm.next; continue;
        }
      }
      else if (t === 'يعني' && k < n && AR.test(tokens[k]) && !NAME_END.has(tokens[k]) && !connectorOf(tokens[k]) && !FILLERS.has(tokens[k]) && !NOT_NAME_START.has(tokens[k]) && !PROPHET.test(' ' + tokens[k]) && (vocabHas(tokens[k]) || nameStarts.has(tokens[k]))) { add = [tokens[k]]; k += 1; }
      if (add) {
        const newKey = cleanName(lastName.replace(/#\d+$/, '') + ' ' + add.join(' '));
        if (newKey && newKey !== lastName && !nodes.has(newKey)) {
          const node = nodes.get(lastName); nodes.delete(lastName); node.key = newKey; node.raw += ' ' + add.join(' ');
          node.display = displayForm(node.display + ' ' + spanOf(i + 1, k).replace(/^(?:و?هو|يعني)\s*/, '')); nodes.set(newKey, node);
          for (const e of edges) { if (e.student === lastName) e.student = newKey; if (e.teacher === lastName) e.teacher = newKey; }
          frontier = frontier.map(f => f === lastName ? newKey : f);
          lastName = newKey;
        }
        i = k; continue;
      }
    }

    if ((t === 'قال' || t === 'وقال') && edges.length) {
      if (OTHERS.has(tokens[i + 1]) && connectorOf(tokens[skipFillers(i + 2)] || '')) { restoreOthers(); i += 2; continue; } // "وقال الآخران حدثنا…"
      const nm = readName(tokens, i + 1, nameStarts);
      if (nm) {
        const key = cleanName(nm.tokens.join(' '));
        const k = skipFillers(nm.next);
        const anchor = anchorOf(key);
        if (anchor && k < n && connectorOf(tokens[k]) && isGroupMember(anchor)) { narrowTo(anchor); i = nm.next; continue; }
      }
    }

    if (FILLERS.has(t) || PUNCT.test(t)) { i++; continue; }
    if (PROPHET.test(tokens.slice(i, i + 3).join(' '))) { stop = i; break; }

    // reverse pattern: "ان عبد الله بن عباس اخبره" → the frontier heard from X
    if ((t === 'ان' || t === 'وان') && edges.length && ACC_REL.has(tokens[i + 1]) && REVERSE.has(tokens[skipFillers(i + 2)])) {
      // "أن أباه حدثه": the narrator's relative told him
      const single = frontier.length === 1 && frontier[0] ? frontier[0] : lastName;
      if (!single) { stop = i; break; }
      const rel = REL_CANON[tokens[i + 1]] || tokens[i + 1];
      const resolved = cleanName(resolveRelative(rel, single) || '') || null;
      const key = resolved || `${rel}@${single}`;
      let display = rel;
      if (resolved && nodes.has(single)) { const parts = nodes.get(single).display.split(' بن '); const drop = rel.startsWith('اب') ? 1 : 2; if (parts.length > drop) display = parts.slice(drop).join(' بن '); }
      const k = skipFillers(i + 2);
      addNode(key, rel, display);
      for (const s of frontier) addEdge(s, key, tokens[k]);
      prevFrontier = frontier; frontier = [key]; lastConnector = tokens[k]; lastName = key;
      i = k + 1; stop = i; continue;
    }
    if ((t === 'ان' || t === 'وان') && (edges.length || i === 0)) {
      const cp = tokens.slice();
      if (ACC_REL.has(cp[i + 1]) && cp[i + 2] && AR.test(cp[i + 2]) && !NAME_END.has(cp[i + 2]) && !connectorAt(cp, i + 2)) cp[i + 1] = cp[i + 2] === '،' ? cp[i + 1] : '،'; // "أن أباه، جبير بن مطعم أخبره": the relation is a gloss
      if (cp[i + 1] && cp[i + 1].length > 3 && cp[i + 1].endsWith('ا') && nameStarts.has(cp[i + 1].slice(0, -1))) cp[i + 1] = cp[i + 1].slice(0, -1); // accusative
      const nm = readName(cp, i + 1, nameStarts);
      if (nm) {
        const names = [{ key: cleanName(nm.tokens.join(' ')), disp: displayForm(spanOf(i + 1, nm.next)), raw: nm.tokens.join(' ') }];
        let k = skipFillers(nm.next);
        // siblings: "، وابا عبيد"
        while (k < n && tokens[k][0] === 'و' && tokens[k].length > 2 && !connectorAt(tokens, k) && isNameStart(tokens[k].slice(1))) {
          const cp2 = tokens.slice(); cp2[k] = tokens[k].slice(1);
          const nm2 = readName(cp2, k, nameStarts, { noExtra: true });
          if (!nm2) break;
          names.push({ key: cleanName(nm2.tokens.join(' ')), disp: displayForm(spanOf(k, nm2.next)).replace(/^[وف](?=[^ ])/, ''), raw: nm2.tokens.join(' ') });
          k = skipFillers(nm2.next);
        }
        if (k < n && REVERSE.has(tokens[k])) {
          const added = [];
          for (const nmx of names) {
            if (!nmx.key) continue;
            addNode(nmx.key, nmx.raw, nmx.disp);
            for (const s of frontier) addEdge(s, nmx.key, tokens[k]);
            added.push(nmx.key);
          }
          if (added.length) { prevFrontier = frontier; frontier = added; lastConnector = tokens[k]; lastName = added[added.length - 1]; }
          i = k + 1; stop = i; continue;
        }
        // "عن نافع أن ابن عمر قال / كان": the report is attributed to X, who is the last link (mawqūf / maqṭūʿ)
        const kv = names.length === 1 && SAYING.has(tokens[nm.next]) ? nm.next : k; // "قال" is also a filler, so look before the fillers were skipped
        if (edges.length && kv < n && SAYING.has(tokens[kv]) && names.length === 1 && names[0].key && !connectorAt(tokens, kv)) {
          const nmx = names[0];
          addNode(nmx.key, nmx.raw, nmx.disp);
          for (const s of frontier) addEdge(s, nmx.key, 'ان');
          prevFrontier = frontier; frontier = [nmx.key]; lastConnector = 'ان'; lastName = nmx.key;
          i = kv; stop = i; break;
        }
      }
    }

    // sibling relative: "حدثنا أبي وعمي" → the student's uncle, at the same level as the father
    if (edges.length && t[0] === 'و' && RELATIVES.has(t.slice(1)) && lastName && lastName.includes('@') && !connectorAt(tokens, i + 1) && !(isNameStart(tokens[i + 1] || '') && !NAME_END.has(tokens[i + 1] || ''))) {
      const key = `${REL_CANON[t.slice(1)]}@${lastName.split('@')[1]}`;
      addNode(key, t.slice(1), t.slice(1));
      for (const s of prevFrontier) addEdge(s, key, lastConnector);
      if (!frontier.includes(key)) frontier.push(key);
      i += 1; stop = i; continue;
    }
    // sibling name: "، وابو كريب" (و-prefixed name at the same level)
    if (edges.length && t[0] === 'و' && t.length > 2 && !connectorOf(t) && !FILLERS.has(t) && !NAME_END.has(t) && !/^[وف]?قال/.test(tokens[i - 1] || '') && (nameStarts.has(t.slice(1)) || NAME_STARTS.has(t.slice(1)) || (vocabHas(t.slice(1)) && !vocabHas(t) && !NOT_NAME_START.has(t.slice(1)) && !RELATIVES.has(t.slice(1)) && frontier.some(f => f !== null)))) {
      const cp = tokens.slice(); cp[i] = t.slice(1);
      const nm = readName(cp, i, nameStarts);
      if (nm) {
        const key = cleanName(nm.tokens.join(' '));
        if (key) {
          addNode(key, nm.tokens.join(' '), displayForm(spanOf(i, nm.next)).replace(/^[وف](?=[^ ])/, ''));
          for (const s of prevFrontier) addEdge(s, key, lastConnector);
          if (!frontier.includes(key)) frontier.push(key);
        }
        i = nm.next; continue;
      }
    }

    // "حدثنا أبو حفص، عمر بن يزيد السياري": full name in apposition to a bare kunya → same person
    if (edges.length && frontier.length === 1 && frontier[0] && /^ابو [^ ]+$/.test(frontier[0]) && isNameStart(t) && !connectorAt(tokens, i)) {
      const nm = readName(tokens, i, nameStarts, { noExtra: true });
      if (nm && nm.tokens.includes('بن')) {
        const oldKey = frontier[0];
        const newKey = cleanName(oldKey + ' ' + nm.tokens.join(' '));
        if (!nodes.has(newKey)) {
          const node = nodes.get(oldKey); nodes.delete(oldKey); node.key = newKey; node.raw += ' ' + nm.tokens.join(' '); node.display = displayForm(node.display + ' ' + spanOf(i, nm.next)); nodes.set(newKey, node);
          for (const e of edges) { if (e.student === oldKey) e.student = newKey; if (e.teacher === oldKey) e.teacher = newKey; }
          frontier = [newKey]; lastName = newKey;
        }
        i = nm.next; stop = i; continue;
      }
    }
    // inverted order: "ابن خثيم حدثني عن أبي الزبير" → the frontier heard from ابن خثيم, who continues the chain
    if (edges.length && frontier.some(f => f !== null) && isNameStart(t) && !connectorAt(tokens, i)) {
      const nm = readName(tokens, i, nameStarts, { noExtra: true });
      const k = nm ? skipFillers(nm.next) : -1;
      if (nm && k < n && FIRST_PERSON.has(tokens[k])) {
        const key0 = cleanName(nm.tokens.join(' '));
        if (key0 && !compilerKeys.has(key0)) {
          const key = distinctKey(key0, frontier);
          addNode(key, nm.tokens.join(' '), displayForm(spanOf(i, nm.next)));
          for (const s of frontier) addEdge(s, key, tokens[k]);
          prevFrontier = frontier; frontier = [key]; lastConnector = tokens[k]; lastName = key;
          i = k + 1; stop = i; continue; // the connector's own object follows ("… حدثني عن أبي الزبير")
        }
      }
    }

    const ca = connectorAt(tokens, i);
    let conn = ca?.conn || null;
    let j;
    if (conn) {
      if (t[0] === 'و' && edges.length && frontier.some(f => f !== null) && i > 0 && /^[،.]$/.test(tokens[i - 1]) && /^(?:حدثنا|حدثني|اخبرنا|اخبرني|حدثنيه|حدثناه)$/.test(conn)) {
        frontier = [null]; prevFrontier = [null]; // "، وحدثنا فلان": a new chain from the compiler
      }
      let from = i + ca.len;
      j = skipFillers(from);
      // "ح وحدثنا أبو بكر، جميعا عن ابن عيينة": the chains closed by the tahwil rejoin here
      if (pendingFrontiers.length && tokens.slice(Math.max(0, i - 3), j).some(w => ALL_OF.has(w))) { frontier = [...new Set([...pendingFrontiers.flat(), ...frontier])]; pendingFrontiers.length = 0; }
      // "قال إسحاق: أخبرنا، وقال الآخران: حدثنا فلان": members of a group speaking in turn (قال is a filler, so look back for it)
      const speakerTurn = () => {
        if (!edges.length || j >= n) return false;
        let saw = false; for (let p = from; p < j; p++) if (/^[وف]?قال(?:ا|وا|ت)?$/.test(tokens[p])) saw = true;
        if (!saw) return false;
        if (OTHERS.has(tokens[j]) && connectorOf(tokens[skipFillers(j + 1)] || '')) { restoreOthers(); from = j + 1; j = skipFillers(from); return true; }
        const nm2 = readName(tokens, j, nameStarts, { noExtra: true }); if (!nm2) return false;
        const anchor = anchorOf(cleanName(nm2.tokens.join(' '))); const k2 = skipFillers(nm2.next);
        if (anchor && k2 < n && connectorOf(tokens[k2]) && isGroupMember(anchor)) { narrowTo(anchor); from = nm2.next; j = k2; return true; }
        return false;
      };
      for (;;) {
        // words that belong to the connector: "قرأ علينا", "كتب إليّ", "روى هذا الحديث"
        while (j < n && (CONNECTOR_TAIL[conn] || []).includes(tokens[j])) j = skipFillers(j + 1);
        if (speakerTurn()) continue;
        // chained connectors: "حدثني عن مالك" → take the last
        const c2 = j < n ? connectorAt(tokens, j) : null; if (!c2) break;
        conn = c2.conn; from = j + c2.len; j = skipFillers(from);
      }
    } else if (frontier.length === 1 && frontier[0] === null) {
      // bare name while standing at the compiler: "قال مالك أخبرني…", "وقال الليث حدثني…", "قال أبو داود" (the compiler himself),
      // or a suspended report "قال أبو هريرة …" (mu'allaq) when the word is a known name start
      const nm = readName(tokens, i, nameStarts, { noExtra: true });
      if (!nm) { stop = i; break; }
      const key = cleanName(nm.tokens.join(' '));
      const k = skipFillers(nm.next);
      if (compilerKeys.has(key)) { i = nm.next; continue; }                       // the compiler speaking → stay at ROOT
      const afterIsLink = k < n && (connectorAt(tokens, k) || tokens[k] === 'قراءه');
      if (afterIsLink || (isNameStart(tokens[i]) && !edges.length)) { conn = tokens[k] === 'قراءه' ? 'قراءة' : 'قال'; j = i; noExtraNext = true; }
      else { stop = i; break; }
    } else { stop = i; break; }

    if (j >= n) { stop = i; break; }
    if (PROPHET.test(tokens.slice(j, j + 3).join(' '))) { stop = j; break; }

    let key, raw, display;
    // "خالي علي بن محمد", "عمي حسناء بنت معاوية": the relation is a gloss, the name follows
    if (RELATIVES.has(tokens[j]) && tokens[j] !== 'ابي' && j + 1 < n && (isNameStart(tokens[j + 1]) || (vocabHas(tokens[j + 1]) && tokens[j + 2] === 'بن')) && !connectorAt(tokens, j + 1) && !NAME_END.has(tokens[j + 1]) && !RELATIVES.has(tokens[j + 1])) j += 1;
    const w = tokens[j];
    const nameStart = j;
    const nx = tokens[j + 1];
    const kunyaHere = w === 'ابي' && j + 1 < n && AR.test(nx) && !connectorAt(tokens, j + 1) && !FILLERS.has(nx) && !NAME_END.has(nx) && !(NOT_NAME_START.has(nx) && nx !== 'شيخ') && !(nx[0] === 'و' && !vocabHas(nx)) && (vocabHas(nx) || nameStarts.has(nx) || !/^[يتن]/.test(nx));
    const relativeHere = RELATIVES.has(w) && !kunyaHere;
    if (relativeHere) {
      raw = w; display = w;
      const single = frontier.length === 1 && frontier[0] ? frontier[0] : lastName;
      if (!single) { stop = i; break; } // "حدثني عمي" with no narrator to relate to
      const resolved = cleanName(resolveRelative(w, single) || '') || null;
      key = resolved || `${REL_CANON[w] || w}@${single || '?'}`;
      if (resolved && nodes.has(single)) {
        const parts = nodes.get(single).display.split(' بن ');
        const drop = w.startsWith('اب') ? 1 : 2;
        if (parts.length > drop) display = parts.slice(drop).join(' بن ');
      }
      j += 1;
    } else {
      let src = tokens;
      if (ACCUSATIVE_CONNECTORS.has(conn) && w.length > 3 && w.endsWith('ا') && !KUNYA.has(w) && nameStarts.has(w.slice(0, -1))) { src = tokens.slice(); src[j] = w.slice(0, -1); }
      const nm = readName(src, j, nameStarts, { noExtra: noExtraNext, trusted: FIRST_PERSON.has(conn) });
      noExtraNext = false;
      if (!nm) { stop = i; break; }
      raw = nm.tokens.join(' ');
      key = cleanName(raw);
      j = nm.next;
      display = displayForm(spanOf(nameStart, j));
    }
    if (!key || key.length < 2) { stop = i; break; }
    // "حدثني يحيى عن مالك": the compiler naming himself → stay at ROOT
    if (compilerKeys.has(key) && frontier.length === 1 && frontier[0] === null) { i = j; stop = i; continue; }

    key = distinctKey(key, frontier);
    addNode(key, raw, display);
    for (const s of frontier) addEdge(s, key, conn);
    prevFrontier = frontier;
    frontier = [key];
    lastConnector = conn;
    lastName = key;
    i = j; stop = i;
    if (tokens[i] === 'قراءه') { let k = i + 1; while (k < n && ['عليه', 'وانا', 'اسمع', 'واللفظ', 'له', 'علينا'].includes(tokens[k])) k++; i = k; stop = i; }
  }

  // depth from ROOT (BFS over student→teacher edges)
  const adj = new Map();
  for (const e of edges) { const s = e.student ?? '∅'; (adj.get(s) || adj.set(s, []).get(s)).push(e.teacher); }
  const q = [['∅', 0]];
  const seen = new Set(['∅']);
  while (q.length) {
    const [k, d] = q.shift();
    for (const t of adj.get(k) || []) if (!seen.has(t)) { seen.add(t); nodes.get(t).depth = d + 1; q.push([t, d + 1]); }
  }
  const hasTeacher = new Set(edges.map(e => e.student).filter(Boolean));
  const leaves = [...nodes.keys()].filter(k => !hasTeacher.has(k));

  // "عن عمر بن الخطاب رضي الله عنه قال…": the honorific belongs to the isnad
  if (edges.length && stop + 2 < n) {
    const tail = tokens.slice(stop, stop + 4).join(' ');
    const m = tail.match(/^(?:،\s*)?(?:رضي|رضى) الله (?:عنه|عنها|عنهم|عنهما|عنهن)/);
    if (m) stop += m[0].split(' ').length;
  }
  // Nothing found from the start? "وصار قول ابن عباس فيما حدثنا أحمد بن صالح…": skip the preamble to the first connector
  if (!edges.length && !_retry) {
    let p = 1;
    while (p < Math.min(n, 14) && !connectorAt(tokens, p)) p++;
    if (p < Math.min(n, 14)) {
      const cut = map[starts[p]];
      const sub = parseIsnadGraph(text.slice(cut), nameStarts, { compilerKeys, _retry: true });
      if (sub.edges.length) { sub.isnad_ar = (text.slice(0, cut) + sub.isnad_ar).trim(); return sub; }
    }
  }

  const after = tokens.slice(stop, stop + 24).join(' ');
  const reachesProphet = edges.length > 0 && PROPHET.test(after);
  // the matn starts at its first token: an honorific replaced by '¤' spans several source chars, so the end of the last isnad token is not a safe cut
  const isnadEnd = stop > 0 ? (stop < n ? starts[stop] : normalized.length) : 0;                 // in `normalized`
  const cut = stop > 0 ? (stop < n ? map[starts[stop]] ?? text.length : text.length) : 0;      // in `text`
  const isnad_ar = text.slice(0, cut).trim();
  const matn_ar = text.slice(cut).replace(/^[\s،:.\-–—\u200f\u200e]+/, '').trim();
  return { nodes, edges, leaves, reachesProphet, isnadEnd, normalized, isnad_ar, matn_ar };
}

export function connectorType(c) { return CONNECTORS.get(c) || (c === 'قال' || c === 'قراءة' ? 'quote' : 'direct'); }

/** Teacher→student pairs of a parsed graph (ROOT edges excluded). */
export function graphTransmissions(g) {
  return g.edges.filter(e => e.student).map(e => ({ teacher: e.teacher, student: e.student, connector: e.connector, type: e.type }));
}
