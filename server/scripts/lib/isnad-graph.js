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

const DIACRITIC_CHAR = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭـ]/;
const CHAR_MAP = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ؤ': 'و', 'ئ': 'ي', 'ى': 'ي', 'ة': 'ه', ',': '،', ';': '،', '؛': '،' };
const DROP = new Set(['“', '”', '«', '»', '"', "'", '’', '‘', '‏', '‎', '‫', '‬', '\ufffd']);
const BRACKETS = new Set(['{', '}', '[', ']', '<', '>', '|', '*', '_']);

/** Same as normalizeArabic but returns, for every normalized char, the index of the source char. */
export function normalizeWithMap(text) {
  const out = [], map = [];
  let lastSpace = true;
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
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
  return (s || '').replace(DIACRITICS, '').replace(/\s*،\s*/g, ' ').replace(/[“”«»"'’‘‏‎]/g, '').replace(/\s+/g, ' ').trim();
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
]);
// words allowed right after these connectors before the name
const CONNECTOR_TAIL = { 'قرا': ['علينا', 'علي', 'عليه'], 'قرات': ['علي', 'عليه'], 'قري': ['علي', 'عليه'], 'كتب': ['الي', 'اليه'], 'روي': ['هذا', 'الحديث', 'هذه', 'ذلك', 'عنه', 'له'], 'رواه': ['هذا', 'الحديث'], 'يرويه': [] };
// phrases removed from the token stream (replaced by spaces, offsets preserved)
const NOISE_PHRASES = /(?:رضي|رضى) الله (?:عنه|عنها|عنهم|عنهما|عنهن)|ان شاء الله|رحمه الله|رحمها الله|تعالي عنه|عليه السلام|قال ابو عيسي هذا حديث/g;

const PUNCT = /^[،:.؟()\-]$/;

const FILLERS = new Set([
  'قال', 'قالا', 'قالوا', 'قالت', 'قلت', 'يقول', 'تقول', 'يقولان', 'قالتا', 'وقال', 'فقال', 'وقالت', 'فقالت', 'وقالا', 'وزاد', 'زاد', 'به', 'بذلك', 'ايضا',
  'وقد', 'قد', 'ولقد', 'لقد', 'وفيما', 'فيما', 'وفي', 'مما', 'بما', 'وبه', 'وبهذا', 'ومن', 'وعن', 'وايضا', 'كذلك', 'وكذلك', 'هكذا', 'وهكذا',
  'انه', 'انها', 'انهما', 'انهم', 'وانه', 'اني', 'لي', 'له', 'لنا', 'لهم', 'لهما',
  'ح', 'و', 'جميعا', 'كلاهما', 'كلهم', 'كلهما', 'جميعهم', 'ثلاثتهم', 'اربعتهم',
  'وهو', 'هو', 'هي', 'المعني', 'بهذا', 'بمثله', 'نحوه', 'بمعناه', 'مثله', 'بنحوه', 'الاسناد', 'واللفظ', 'حديث', 'في', 'هذا', 'الحديث', 'واحد', 'المعنى',
  'يعني', // only when not followed by a name (handled in readName)
]);

const NOT_NAME_START = new Set([
  'الله', 'رسول', 'النبي', 'رب', 'ان', 'لا', 'ما', 'من', 'في', 'الي', 'عند', 'كان', 'كانت', 'قال', 'قالت', 'يقول',
  'ذلك', 'هذا', 'هذه', 'الذي', 'التي', 'الذين', 'ثم', 'بعد', 'قبل', 'حيث', 'لما', 'كل', 'بعض', 'غير', 'مثل', 'احد', 'شيء',
  'يوم', 'ليله', 'عام', 'سنه', 'رجل', 'رجلا', 'امراه', 'ناس', 'قوم', 'اهل', 'اصحاب', 'صلي', 'سلم', 'عليه', 'وسلم', 'بسم',
  'الرحمن', 'الرحيم', 'جميعا', 'ايضا', 'اذ', 'اذا', 'حتي', 'لعل', 'كيف', 'اين', 'متي', 'انه', 'انها', 'انا', 'نحن', 'هو', 'هي',
  'هم', 'هن', 'هما', 'اما', 'انما', 'لم', 'لن', 'قد', 'لقد', 'فلما', 'فقال', 'فقالت', 'وقال', 'وقالت', 'فان', 'وان',
  'الرجل', 'المراه', 'الناس', 'القوم', 'شيخ', 'رجال', 'نفر', 'غيره', 'غيرهم', 'اخر', 'واحد', 'نبي', 'به', 'بها', 'بهذا',
  'ذكر', 'يذكر', 'زعم', 'بعضهم', 'غير', 'كلهم', 'احدهم', 'احدهما', 'صاحب', 'صاحبه', 'اصحابه', 'اهله', 'ابنه', 'ابنته',
]);

// Words that end a name
const NAME_END = new Set([
  'قال', 'قالت', 'قالا', 'قالوا', 'قالتا', 'يقول', 'تقول', 'انه', 'انها', 'انهما', 'انهم', 'ان', 'عن', 'يحدث', 'يخبر', 'يذكر', 'يرفعه',
  'رفعه', 'سمعته', 'سمعتها', 'سمعه', 'يبلغ', 'به', 'بهذا', 'بمثله', 'نحوه', 'وهو', 'هو', 'هي', 'كان', 'كانت', 'انا',
  'يرويه', 'يقرا', 'يرفع', 'يخبره', 'يحدثه', 'اخبره', 'حدثه', 'او', 'ثم', 'في', 'الي', 'من', 'مع', 'الا', 'اذ', 'اذا',
  'لما', 'فلما', 'حين', 'عند', 'يوم', 'ليله', 'وكان', 'صلي', 'رضي', 'رضى', 'عليه', 'الله', 'عنه', 'عنها', 'عنهم', 'عنهما', 'رحمه',
  'يحدثنا', 'يحدثني', 'اخبرت', 'حدثت', 'ذكر', 'يذكرون', 'زعم', 'سئل', 'سيل', 'سال', 'سالت', 'ساله', 'سالته', 'يسال',
  'قرا', 'قرات', 'كتب', 'كتبت', 'رايت', 'راي', 'رايته', 'شهدت', 'اتيت', 'جاء', 'جاءت', 'دخلت', 'دخل', 'خرج', 'خرجنا', 'كنا', 'كنت',
  'بينما', 'اني', 'انك', 'ما', 'لا', 'قد', 'لقد', 'وقد', 'يخبرنا', 'يخبرني', 'زوج', 'زوجه', 'النبي', 'رسول', 'صاحب', 'مولاه',
  'خطيب', 'امام', 'قاضي', 'والي', 'امير', 'فقال', 'فقالت', 'وقال', 'وقالت', 'قالوا', 'يعني', 'المعني', 'واللفظ', 'لفظ', 'قراءه', 'اجازه', 'مناوله',
  'ح', 'جميعا', 'كلاهما', 'كلهم', 'الحديث', 'حديث', 'بهذا', 'الاسناد', 'مثله', 'نحوه', 'بنحوه', 'بمعناه', 'حدثنا', 'حدثني', 'اخبرنا', 'اخبرني', 'انبانا', 'سمعت', 'سمعنا', 'سمع',
]);

const HONORIFICS = /(?:^| )(?:رضي|رضى) الله (?:عنه|عنها|عنهم|عنهما|عنهن)(?= |$)|(?:^| )صلي الله عليه وسلم(?= |$)|(?:^| )رحمه الله(?= |$)|(?:^| )رحمها الله(?= |$)|(?:^| )عليه السلام(?= |$)|(?:^| )عليهما السلام(?= |$)/g;

const PROPHET = /(?:^| )(?:رسول الله|النبي|نبي الله|رفعه|يرفعه|رفعته|مرفوعا|يبلغ به|بلغ به|ينميه)(?= |$)/;

const KUNYA = new Set(['ابو', 'ابي', 'ابا', 'ام']);
const THEOPHORIC = new Set(['عبد', 'عبيد']);
// second word of a compound name: عبد الله، عبد الرحمن، عبيد الله، عبد ربه، عبد المطلب، عبد مناف، عبد عمرو، عبد قيس…
const THEO_TAIL = new Set(['ربه', 'مناف', 'شمس', 'عمرو', 'قيس', 'يزيد', 'المطلب', 'كلال', 'ياليل', 'ود', 'مناه', 'يغوث', 'نهم', 'خير']);
const theoComplement = w => w !== undefined && AR.test(w) && (w === 'الله' || THEO_TAIL.has(w) || (w.startsWith('ال') && !NAME_END.has(w))) && !CONNECTORS.has(w);
const PATRONYM = new Set(['بن', 'ابن', 'بنت', 'ابنه', 'مولي']);
const REVERSE = new Set(['اخبره', 'حدثه', 'اخبرته', 'حدثته', 'اخبرهم', 'حدثهم', 'اخبراه', 'حدثاه', 'اخبرها', 'حدثها', 'اخبرني', 'حدثني', 'اخبرنا', 'حدثنا', 'حدثاهم', 'اخبراهم', 'حدثوهم', 'اخبروهم', 'حدثاكم', 'حدثوه', 'اخبروه', 'انباه', 'انباهم', 'انبانا', 'انباني']);
const FIRST_PERSON = new Set(['حدثني', 'حدثنا', 'اخبرني', 'اخبرنا', 'انباني', 'انبانا', 'حدثتني', 'اخبرتني', 'حدثتنا', 'اخبرتنا']);
const ACCUSATIVE_CONNECTORS = new Set(['سمعت', 'سمعنا', 'سمع', 'ان']);
const RELATIVES = new Set(['ابي', 'امي', 'جدي', 'عمي', 'خالي', 'اخي', 'ابيه', 'ابيها', 'جده', 'جدها', 'امه', 'امها', 'عمه', 'عمته', 'خاله', 'خالته', 'اخيه', 'اخته', 'مولاه', 'مولاته', 'ابنه', 'ابنته', 'زوجه', 'زوجته', 'جدته', 'اخيها']);

// Fallback list of frequent first tokens of names (used for و-conjunction detection before a corpus pass exists)
const NAME_STARTS = new Set(['ابو', 'ابي', 'ابا', 'ابن', 'ام', 'عبد', 'عبيد', 'محمد', 'احمد', 'علي', 'عمر', 'عمرو', 'عثمان', 'يحيي', 'اسحاق', 'زهير', 'قتيبه', 'هناد', 'سفيان', 'مالك', 'شعبه', 'هشيم', 'وكيع', 'حماد', 'اسماعيل', 'ابراهيم', 'موسي', 'يونس', 'يعقوب', 'الحسن', 'الحسين', 'الليث', 'الاعمش', 'الزهري', 'مسدد', 'محمود', 'حجاج', 'ابراهيم']);

// ── Tokenizer ──────────────────────────────────────────────────────────────

function tokenize(normalized) {
  const tokens = [], starts = [], ends = [];
  const re = /[،:.؟()\-]|[^\s،:.؟()\-]+/g;
  let m;
  while ((m = re.exec(normalized))) { tokens.push(m[0]); starts.push(m.index); ends.push(m.index + m[0].length); }
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
  return c ? { conn: c, len: 1 } : null;
}

// ── Name grammar ───────────────────────────────────────────────────────────

/**
 * Read a personal name at tokens[i]. Returns { tokens, next } or null.
 * name := head tail*
 * head := (ابو|ام) word | (عبد|عبيد) word | ابن word | word
 * tail := (بن|بنت|مولي) [ابي|عبد] word | يعني [ابن] word | ال-word (nisba) | one extra word
 */
function readName(tokens, i, nameStarts, { noExtra = false } = {}) {
  const n = tokens.length;
  if (i >= n) return null;
  let t = tokens[i];
  if (!AR.test(t) || connectorOf(t) || FILLERS.has(t) || NAME_END.has(t)) return null;
  if (NOT_NAME_START.has(t)) return null;
  const out = [];
  let j = i;

  const word = k => k < n && AR.test(tokens[k]) && !connectorOf(tokens[k]) && !NAME_END.has(tokens[k]) && !PUNCT.test(tokens[k]);

  if (KUNYA.has(t)) {
    const off = tokens[j + 1] === '،' && word(j + 2) ? 2 : 1; // "أبا، عبيد": stray comma inside the name
    if (!word(j + off) && !THEOPHORIC.has(tokens[j + off])) return null;
    out.push(t === 'ابي' || t === 'ابا' ? 'ابو' : t, tokens[j + off]); j += off + 1;
    if (THEOPHORIC.has(tokens[j - 1]) && theoComplement(tokens[j])) { out.push(tokens[j]); j += 1; } // ابو عبد الله
  } else if (THEOPHORIC.has(t) && theoComplement(tokens[j + 1])) {
    out.push(t, tokens[j + 1]); j += 2; // عبد الله / عبد الرحمن / عبيد الله …
  } else if (t === 'ابن' || t === 'بنت') {
    if (!word(j + 1)) return null;
    out.push(t, tokens[j + 1]); j += 2;
  } else {
    out.push(t); j += 1;
  }

  let extra = 0;
  while (j < n) {
    const u = tokens[j];
    if (u === '،' && tokens[j + 1] === 'مولي' && j + 2 < n && AR.test(tokens[j + 2]) && !connectorOf(tokens[j + 2]) && !NAME_END.has(tokens[j + 2])) { j += 1; continue; } // "ثابت، مولى عبد الرحمن"
    if (PATRONYM.has(u)) {
      const off = tokens[j + 1] === '،' && j + 2 < n && AR.test(tokens[j + 2]) && !NAME_END.has(tokens[j + 2]) && !connectorOf(tokens[j + 2]) ? 2 : 1; // "بن، نمير"
      const w = tokens[j + off];
      if (w !== undefined && AR.test(w) && !connectorOf(w) && !PUNCT.test(w) && (!NAME_END.has(w) || KUNYA.has(w) || THEOPHORIC.has(w))) {
        out.push(u === 'ابن' ? 'بن' : u);
        if ((KUNYA.has(w) && j + off + 1 < n && AR.test(tokens[j + off + 1]) && !NAME_END.has(tokens[j + off + 1])) || (THEOPHORIC.has(w) && theoComplement(tokens[j + off + 1]))) { out.push(w === 'ابا' ? 'ابي' : w, tokens[j + off + 1]); j += off + 2; }
        else { out.push(w); j += off + 1; }
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
    if (KUNYA.has(u) && out.length >= 1 && u !== 'ام' && word(j + 1) && !REVERSE.has(tokens[j + 1]) && !KUNYA.has(tokens[j + 1])) { out.push(u === 'ابا' || u === 'ابي' ? 'ابو' : u, tokens[j + 1]); j += 2; extra = 0; continue; } // الربيع بن نافع أبو توبة، سعيد أبي شجاع
    if (u.startsWith('ال')) { out.push(u); j += 1; continue; }         // nisba / laqab
    if (extra < 1 && !noExtra) { out.push(u); j += 1; extra += 1; continue; } // one extra given word (صالح السمان …)
    break;
  }
  return { tokens: out, next: j };
}

/** Normalized key for a raw name (honorifics removed, kunya case unified). */
export function cleanName(raw) {
  let s = normalizeArabic(raw).replace(HONORIFICS, ' ').replace(/[،:.؟()\-]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/(^| )(عبد|عبيد)(الله|الرحمن|الرحيم|العزيز|الملك|الكريم|الوهاب|الرزاق|الوارث|الصمد|الاعلي|المجيد|الحميد|المطلب)(?= |$)/g, '$1$2 $3'); // عبدالله → عبد الله
  s = s.replace(/^(?:ابي|ابا) /, 'ابو ');
  s = s.replace(/^و(?=(?:ابو|ابن|ام|عبد|عبيد) )/, '');
  s = s.replace(/ (?:قال|قالت|انه|انها|يقول)$/, '').trim();
  s = s.replace(/ (?:ام المومنين|زوج النبي(?: صلي الله عليه وسلم)?|امير المومنين|خليفه رسول الله)(?= |$)/g, '').trim();
  return s;
}

function resolveRelative(word, prevName) {
  if (!prevName) return null;
  const parts = prevName.split(' ');
  const idx = parts.indexOf('بن');
  if (word === 'ابيه' || word === 'ابيها' || word === 'ابي') return idx > 0 && idx + 1 < parts.length ? parts.slice(idx + 1).join(' ') : null;
  if (word === 'جده' || word === 'جدها' || word === 'جدي') {
    if (idx <= 0) return null;
    const rest = parts.slice(idx + 1); const idx2 = rest.indexOf('بن');
    return idx2 > 0 && idx2 + 1 < rest.length ? rest.slice(idx2 + 1).join(' ') : null;
  }
  return null;
}

// ── Main parser ────────────────────────────────────────────────────────────

export function parseIsnadGraph(text, nameStarts = new Set(), { compilerKeys = new Set(), _retry = false } = {}) {
  const { normalized: normalized0, map } = normalizeWithMap(text || '');
  const normalized = normalized0.replace(NOISE_PHRASES, m => ' '.repeat(m.length));
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

    if (t === 'ح') { frontier = [null]; prevFrontier = [null]; i++; continue; } // tahwil: new chain from the compiler
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
      else if (t === 'يعني' && k < n && AR.test(tokens[k]) && !NAME_END.has(tokens[k]) && !connectorOf(tokens[k]) && !FILLERS.has(tokens[k]) && !NOT_NAME_START.has(tokens[k])) { add = [tokens[k]]; k += 1; }
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
      const nm = readName(tokens, i + 1, nameStarts);
      if (nm) {
        const key = cleanName(nm.tokens.join(' '));
        const k = skipFillers(nm.next);
        const found = nodes.has(key) ? key : [...nodes.keys()].filter(x => x.startsWith(key + ' '));
        const anchor = typeof found === 'string' ? found : (found.length === 1 ? found[0] : null);
        if (anchor && k < n && connectorOf(tokens[k])) { frontier = [anchor]; prevFrontier = [anchor]; lastName = anchor; i = nm.next; continue; }
      }
    }

    if (FILLERS.has(t) || PUNCT.test(t)) { i++; continue; }
    if (PROPHET.test(tokens.slice(i, i + 3).join(' '))) { stop = i; break; }

    // reverse pattern: "ان عبد الله بن عباس اخبره" → the frontier heard from X
    if ((t === 'ان' || t === 'وان') && (edges.length || i === 0)) {
      const cp = tokens.slice();
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
      }
    }

    // sibling name: "، وابو كريب" (و-prefixed name at the same level)
    if (edges.length && t[0] === 'و' && t.length > 2 && !connectorOf(t) && (nameStarts.has(t.slice(1)) || NAME_STARTS.has(t.slice(1)))) {
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
      j = skipFillers(i + ca.len);
      // words that belong to the connector: "قرأ علينا", "كتب إليّ", "روى هذا الحديث"
      while (j < n && (CONNECTOR_TAIL[conn] || []).includes(tokens[j])) j = skipFillers(j + 1);
      // chained connectors: "حدثني عن مالك" → take the last
      while (j < n && connectorAt(tokens, j)) { const c2 = connectorAt(tokens, j); conn = c2.conn; j = skipFillers(j + c2.len); while (j < n && (CONNECTOR_TAIL[conn] || []).includes(tokens[j])) j = skipFillers(j + 1); }
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
    const w = tokens[j];
    const nameStart = j;
    const relativeHere = RELATIVES.has(w) && !(w === 'ابي' && j + 1 < n && AR.test(tokens[j + 1]) && !connectorAt(tokens, j + 1) && !FILLERS.has(tokens[j + 1]) && !NAME_END.has(tokens[j + 1]));
    if (relativeHere) {
      raw = w; display = w;
      const single = frontier.length === 1 && frontier[0] ? frontier[0] : lastName;
      const resolved = cleanName(resolveRelative(w, single) || '') || null;
      key = resolved || `${w}@${single || '?'}`;
      if (resolved && nodes.has(single)) {
        const parts = nodes.get(single).display.split(' بن ');
        const drop = w.startsWith('اب') ? 1 : 2;
        if (parts.length > drop) display = parts.slice(drop).join(' بن ');
      }
      j += 1;
    } else {
      let src = tokens;
      if (ACCUSATIVE_CONNECTORS.has(conn) && w.length > 3 && w.endsWith('ا') && !KUNYA.has(w) && nameStarts.has(w.slice(0, -1))) { src = tokens.slice(); src[j] = w.slice(0, -1); }
      const nm = readName(src, j, nameStarts, { noExtra: noExtraNext });
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
  const isnadEnd = stop > 0 ? ends[stop - 1] : 0;                 // in `normalized`
  const cut = stop > 0 ? map[ends[stop - 1]] ?? text.length : 0;  // in `text`
  const isnad_ar = text.slice(0, cut).trim();
  const matn_ar = text.slice(cut).replace(/^[\s،:.\-]+/, '').trim();
  return { nodes, edges, leaves, reachesProphet, isnadEnd, normalized, isnad_ar, matn_ar };
}

export function connectorType(c) { return CONNECTORS.get(c) || (c === 'قال' || c === 'قراءة' ? 'quote' : 'direct'); }

/** Teacher→student pairs of a parsed graph (ROOT edges excluded). */
export function graphTransmissions(g) {
  return g.edges.filter(e => e.student).map(e => ({ teacher: e.teacher, student: e.student, connector: e.connector, type: e.type }));
}
