/**
 * Rijāl sources: the two works of Ibn Ḥajar al-ʿAsqalānī (d. 852) as published by OpenITI
 * (server/data/openiti, CC BY-NC-SA 4.0).
 *
 *   Taqrīb al-Tahdhīb  — one line per narrator: name, grade, layer (1–12), death year, sigla
 *   Tahdhīb al-Tahdhīb — full notice: sigla, name, teachers ("روى عن"), students ("وعنه"), critics
 *
 * loadTaqrib / loadTahdhib parse the texts; entryKeys derives the lookup keys of an entry;
 * matchRijal aligns the entries with the narrator entities extracted from the isnads.
 */
import { readFileSync } from 'node:fs';
import { cleanName, normalizeArabic, NON_NAME_WORDS } from './isnad-graph.js';

const LAYERS = { 'الاولي': 1, 'الثانيه': 2, 'الثالثه': 3, 'الرابعه': 4, 'الخامسه': 5, 'السادسه': 6, 'السابعه': 7, 'الثامنه': 8, 'التاسعه': 9, 'العاشره': 10, 'الحاديه عشره': 11, 'الثانيه عشره': 12 };
export const LAYER_NAMES = { 1: 'الصحابة', 2: 'كبار التابعين', 3: 'الطبقة الوسطى من التابعين', 4: 'من جلّ روايتهم عن كبار التابعين', 5: 'صغار التابعين', 6: 'عاصروا صغار التابعين ولم يلقوا الصحابة', 7: 'كبار أتباع التابعين', 8: 'الطبقة الوسطى من أتباع التابعين', 9: 'صغار أتباع التابعين', 10: 'كبار الآخذين عن تبع الأتباع', 11: 'الطبقة الوسطى من الآخذين عن تبع الأتباع', 12: 'صغار الآخذين عن تبع الأتباع' };
const GRADES = ['ثقه ثبت', 'ثقه حافظ', 'ثقه فقيه', 'ثقه حجه', 'ثقه امام', 'ثقه عابد', 'ثقه متقن', 'ثقه فاضل', 'ثقه', 'صدوق يخطئ', 'صدوق يهم', 'صدوق له اوهام', 'صدوق سيء الحفظ', 'صدوق يدلس', 'صدوق', 'مقبول', 'لين الحديث', 'لين', 'ضعيف', 'متروك', 'مجهول الحال', 'مجهول', 'مستور', 'كذاب', 'متهم بالكذب', 'صحابيه', 'صحابي', 'لا باس به', 'لا يعرف'];
const GRADE_DISPLAY = { 'ثقه ثبت': 'ثقة ثبت', 'ثقه حافظ': 'ثقة حافظ', 'ثقه فقيه': 'ثقة فقيه', 'ثقه حجه': 'ثقة حجة', 'ثقه امام': 'ثقة إمام', 'ثقه عابد': 'ثقة عابد', 'ثقه متقن': 'ثقة متقن', 'ثقه فاضل': 'ثقة فاضل', 'ثقه': 'ثقة', 'صدوق يخطئ': 'صدوق يخطئ', 'صدوق يهم': 'صدوق يهم', 'صدوق له اوهام': 'صدوق له أوهام', 'صدوق سيء الحفظ': 'صدوق سيّئ الحفظ', 'صدوق يدلس': 'صدوق يدلّس', 'صدوق': 'صدوق', 'مقبول': 'مقبول', 'لين الحديث': 'ليّن الحديث', 'لين': 'ليّن', 'ضعيف': 'ضعيف', 'متروك': 'متروك', 'مجهول الحال': 'مجهول الحال', 'مجهول': 'مجهول', 'مستور': 'مستور', 'كذاب': 'كذّاب', 'متهم بالكذب': 'متّهم بالكذب', 'صحابيه': 'صحابية', 'صحابي': 'صحابي', 'لا باس به': 'لا بأس به', 'لا يعرف': 'لا يُعرف' };
const SIGLA = { 'ع': ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah'], '4': ['abudawud', 'tirmidhi', 'nasai', 'ibnmajah'], 'خ': ['bukhari'], 'م': ['muslim'], 'د': ['abudawud'], 'ت': ['tirmidhi'], 'س': ['nasai'], 'ق': ['ibnmajah'], 'بخ': [], 'خت': ['bukhari'], 'عخ': [], 'مد': [], 'تم': [], 'عس': [], 'فق': [], 'كد': [], 'خد': [], 'صد': [], 'ل': [], 'ر': [], 'كن': [], 'ص': [], 'ز': [], 'ي': [], 'قد': [], 'سي': [], 'مق': [] };
const ORD = { 'واحده': 1, 'احدي': 1, 'اثنتين': 2, 'ثلاث': 3, 'اربع': 4, 'خمس': 5, 'ست': 6, 'سبع': 7, 'ثمان': 8, 'تسع': 9, 'عشر': 10, 'عشره': 10, 'عشرين': 20, 'ثلاثين': 30, 'اربعين': 40, 'خمسين': 50, 'ستين': 60, 'سبعين': 70, 'ثمانين': 80, 'تسعين': 90, 'مايه': 100, 'ماية': 100, 'مئه': 100, 'ميه': 100, 'مايتين': 200, 'مئتين': 200, 'ميتين': 200, 'ثلاثمايه': 300, 'ثلاثمئه': 300, 'ثلاثميه': 300, 'ثلثمايه': 300, 'ثلثميه': 300, 'اربعمايه': 400, 'اربعميه': 400 };
// pronunciation glosses ("بكسر الميم وسكون النون", "بمعجمتين", "مصغرا"): skipped, the name resumes at the kunya, the nisba or the next link
const PRON_RE = /^(?:و?ب(?:كسر|فتح|ضم|سكون|تشديد|تخفيف|مهمل|معجم|موحد|مثنا|مثلث|نون|لام|جيم|حاء|خاء|دال|ذال|زاي|سين|شين|صاد|ضاد|طاء|ظاء|عين|غين|فاء|قاف|كاف|ميم|هاء|واو|ياء|وزن|ال)[^ ]*|و?ال(?:الف|باء|تاء|ثاء|جيم|حاء|خاء|دال|ذال|راء|زاي|زاء|سين|شين|صاد|ضاد|طاء|ظاء|عين|غين|فاء|قاف|كاف|لام|ميم|نون|هاء|واو|ياء|مهمله|معجمه|موحده|مثناه|مثلثه|فوقانيه|تحتانيه|ساكنه|مفتوحه|مضمومه|مكسوره|مشدده|مخففه|مصغره|اولي|ثانيه|ثالثه|اخيره|كل)|و?(?:سكون|فتح|كسر|ضم|تشديد|تخفيف|تثقيل|تصغير|مصغر|مصغرا|مكبر|مكبرا|مثقل|مثقلا|مخفف|مخففا|مهمله|معجمه|موحده|مثناه|مثلثه|ساكنه|مفتوحه|مضمومه|مكسوره|مشدده|مخففه|مصغره|فوقانيه|تحتانيه|مهملتين|معجمتين|موحدتين|مثناتين|فتحتين|ضمتين|كسرتين)|اخر|اخره|اوله|ثانيه|ثالثه|بعدها|قبلها|بينهما|ثم|فيهما|جميعا|معا|فيه|كذلك)$/;
const EXAMPLE_RE = /^(?:بوزن|وزن|بمثل|مثل|نحو|بلفظ|كلفظ)$/; // "بوزن عظيم": the next word is the example, not a name
const GLOSS_WORD = /^(?:المعروف|المشهور|يعرف|يقال|ويقال|وقيل|نزيل|صاحب|مولي|مولاهم|روي|وهو|هو|وهي|هي|قيل|واسمه|اسمه|واسم|اسم|اختلف|قال|حتي|امام|راس|كبير|احد|الصحابي|الجليل|حافظ|من|عن|له|لها|وله|ولها|كان|وكان|يكني|ويكني|كنيته|وكنيته|ولد|مولده|قدم|سكن|اصله|واصله|والد|والده|اخو|اخت|زوج|زوجه|امراه|جد|جده)$/;
export function stripGloss(name) {
  const w = name.split(' ').filter(Boolean), out = [];
  let i = 0;
  while (i < w.length) {
    const t = w[i];
    if (out.length && PRON_RE.test(t)) {
      let j = i + 1; while (j < w.length && (PRON_RE.test(w[j]) || EXAMPLE_RE.test(w[j - 1]))) j++;
      if (j < w.length && (w[j] === 'ابو' || w[j] === 'ام' || w[j] === 'بن' || w[j] === 'ابن' || (w[j].startsWith('ال') && w[j].length > 3 && !GLOSS_WORD.test(w[j])))) { i = j; continue; }
      break;
    }
    if (GLOSS_WORD.test(t) || (t === 'ابن' && /^(?:اخي|اخت|عم|خال|اخيه|اخته|عمه|خاله)$/.test(w[i + 1] || ''))) break;
    out.push(t); i++;
  }
  return out.join(' ');
}
const GLOSS_RE = / (?:المعروف|المشهور|يعرف|يقال|ويقال|وقيل|نزيل|صاحب|بكسر|بفتح|بضم|بسكون|بتشديد|بتخفيف|مصغر|بالتصغير|بمهمله|بمعجمه|بموحده|بمثناه|بمثلثه|بنون|بلام|بجيم|بحاء|بخاء|بدال|بذال|بزاي|بسين|بشين|بصاد|بضاد|بطاء|بظاء|بعين|بغين|بفاء|بقاف|بكاف|بميم|بهاء|بواو|بياء|بالمهمله|بالمعجمه|بالموحده|بالمثناه|بالمثلثه|بالنون|بالتحتانيه|بالفوقانيه|بوزن|بالتثقيل|مكبر|بالكسر|بالفتح|بالضم|اخر|اخره|اوله|ثانيه|ثالثه|بعدها|وسكون|وفتح|وكسر|وضم|مولي|مولاهم|روي|وهو|هو|وهي|هي|ويقال|قيل|ثم|واسمه|اسمه|واسم|اسم|اختلف|قال|حتي|امام|راس|كبير|احد|الصحابي|الجليل|حافظ|من|عن|له|لها|وله|ولها|كان|وكان|يكني|ويكني|كنيته|وكنيته|ولد|مولده|قدم|سكن|اصله|واصله|ابن اخي|ابن اخت|ابن عم|والد|والده|اخو|اخت|زوج|زوجه|امراه|جد|جده)(?= |$).*$/;
const GENERIC_NISBA = new Set(['المدني', 'المكي', 'الكوفي', 'البصري', 'الشامي', 'المصري', 'البغدادي', 'الواسطي', 'الدمشقي', 'الحمصي', 'اليماني', 'الخراساني', 'النيسابوري', 'المروزي', 'الرازي', 'الحافظ', 'الامام', 'الفقيه', 'القاضي', 'الاعمي', 'الضرير', 'الاصل', 'الكبير', 'الصغير', 'المولي', 'الحجازي', 'العراقي', 'الجزري', 'الرقي', 'الحراني', 'البلخي', 'الهروي', 'السجستاني', 'الطايفي', 'الحبشي', 'الاسود', 'الاعرج', 'الاعور', 'الاصم', 'الاحول', 'الطويل', 'القصير', 'الاحمر', 'الازرق', 'الابيض']);

/** Removes the OpenITI/manuscript markers: "ms0011", "PageV10P005", "%~%", milestone tags. */
export const stripMarkers = s => s.replace(/\bms\d+\b/g, ' ').replace(/PageV\d+P\d+/g, ' ').replace(/%~%|~~/g, ' ').replace(/\s+/g, ' ').trim();

/** "ثلاث وثمانين ومايه" → 183 ; "سبع عشره ومايه" → 117 ; "مايه" → 100 */
export function arabicYear(s) {
  const toks = normalizeArabic(s).replace(/و/g, ' ').split(/\s+/).filter(Boolean);
  let total = 0, any = false;
  for (const t of toks) {
    if (ORD[t] != null) { total += ORD[t]; any = true; continue; }
    if (/^\d+$/.test(t)) { total += Number(t); any = true; }
  }
  return any ? total : null;
}

/** Reads "### $ N …" entries with their "~~" continuation lines; tracks the printed volume from PageV markers. */
function readEntries(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const out = [];
  let vol = 1;
  for (let i = 0; i < lines.length; i++) {
    const pv = lines[i].match(/PageV(\d+)P/); if (pv) vol = Number(pv[1]);
    const m = lines[i].match(/^### \$\$? (\d+) (.*)$/);
    if (!m) continue;
    let body = m[2];
    let j = i + 1;
    while (j < lines.length && lines[j].startsWith('~~')) { const pv2 = lines[j].match(/PageV(\d+)P/); if (pv2) vol = Number(pv2[1]); body += ' ' + lines[j].slice(2); j++; }
    out.push({ n: Number(m[1]), vol, body: stripMarkers(body) });
  }
  return out;
}

const normText = s => normalizeArabic(s).replace(/[،:.()\[\]«»"']/g, ' ').replace(/\s+/g, ' ').trim();

export function loadTaqrib(path) {
  const entries = [];
  for (const { n, body } of readEntries(path)) {
    const norm = normText(body);
    let layer = null;
    const lm = norm.match(/ من (?:(?:رووس|رءوس|كبار|صغار|اوساط|اواسط|اوايل|اواخر) )?(?:الطبقه )?(الحاديه عشره|الثانيه عشره|الاولي|الثانيه|الثالثه|الرابعه|الخامسه|السادسه|السابعه|الثامنه|التاسعه|العاشره)(?= |$)/);
    if (lm) layer = LAYERS[lm[1]];
    if (!layer && /(?:^| )(?:صحابي|صحابيه|له صحبه|لها صحبه|من كبار الصحابه|من الصحابه|من صغار الصحابه|امير المومنين|من المهاجرين|من الانصار|شهد بدرا|شهد احدا|شهد الحديبيه|بايع تحت الشجره)(?: |$)/.test(norm)) layer = 1;
    let grade = null, gradePos = -1;
    for (const g of GRADES) {
      let p = norm.indexOf(' ' + g + ' '); if (p < 0 && norm.endsWith(' ' + g)) p = norm.length - g.length - 1;
      if (p >= 0 && (gradePos < 0 || p < gradePos)) { grade = g; gradePos = p; }
    }
    let death = null, deathApprox = false;
    const dm = norm.match(/(?:مات|توفي|قتل|استشهد|توفيت|ماتت|قتلت)(?: (?:شهيدا|في|ذي|الحجه|القعده|المحرم|صفر|ربيع|الاول|الاخر|جمادي|الاولي|الاخره|رجب|شعبان|رمضان|شوال|اول|اخر|وسط|ليله|يوم|عاشوراء|عرفه|الجمعه|الاربعاء|الخميس|السبت|الاحد|الاثنين|الثلاثاء|من|بالمدينه|بمكه|بالبصره|بالكوفه|بالشام|بمصر|بدمشق|ببغداد|بواسط|بخراسان|باليمن|بالطايف|بحمص|بالري|بنيسابور|بمرو|بالثغر|بطرسوس|بالرقه|بحران|بسمرقند|ببخاري|ببيت المقدس|بالمدينه|بحلب)){0,6} (?:سنه|في حدود سنه|بعد سنه|قبل سنه|في سنه|بعد|قبل|نحو سنه|في حدود) /);
    let centuryExplicit = false;
    if (dm) {
      // collect the numeral words that follow ("خمس وعشرين ومايه", "سبع او ثمان وخمسين"); stop at anything else ("وقيل…")
      const rest = norm.slice(dm.index + dm[0].length).split(' ');
      const nums = [];
      for (const w of rest) { const b = w.replace(/^و/, ''); if (ORD[b] != null || /^\d+$/.test(b)) nums.push(w); else if ((w === 'او' || w === 'وقيل' || w === 'قيل') && nums.length) nums.push('او'); else if (w === 'سنه' && nums[nums.length - 1] === 'او') continue; else break; }
      while (nums.length && nums[nums.length - 1] === 'او') nums.pop();
      const phrase = nums.join(' ');
      const alts = phrase.split(' او ');
      death = phrase ? arabicYear(alts[alts.length - 1]) : null;
      var deaths = phrase ? alts.map(arabicYear).filter(x => x != null && x >= 1 && x <= 400) : []; // "أربع وتسعين وقيل أربع ومائة": both are kept
      deathApprox = /حدود|بعد|قبل|نحو/.test(dm[0]) || alts.length > 1;
      centuryExplicit = /مايه|ماية|مئه|ميه|مايتين|مئتين|ميتين|ثلاثمايه|ثلاثمئه|ثلاثميه|ثلثمايه|ثلثميه|اربعمايه|اربعميه/.test(phrase);
      if (death != null && (death < 1 || death > 400)) death = null;
    }
    const toks = norm.split(' ');
    const sig = [];
    for (let k = toks.length - 1; k >= 0 && sig.length < 8; k--) { if (SIGLA[toks[k]]) sig.unshift(toks[k]); else break; }
    const colls = new Set(sig.flatMap(x => SIGLA[x]));
    let nameEnd = norm.length;
    for (const marker of [gradePos, lm ? norm.indexOf(lm[0]) : -1, dm ? dm.index : -1]) if (marker >= 0 && marker < nameEnd) nameEnd = marker;
    const name0 = norm.slice(0, nameEnd).trim();
    const stub = / عن /.test(' ' + name0.split(' ').slice(0, 6).join(' ') + ' ') || /^(?:لا يعرف|مجهول|لم اقف)/.test(norm.slice(nameEnd).trim());
    let name = name0.replace(/ عن .*$/, '').replace(GLOSS_RE, '');
    { // a kunya that a gloss hid ("عمرو بن عبد الله ويقال … أبو إسحاق السبيعي") still names the man: append it to the matching form
      const rest = name0.replace(/ عن .*$/, '').slice(name.length);
      const km = rest.match(/(?:^| )((?:ابو|ام) (?!بن )[^ ]+(?: ال[^ ]{3,})?)(?= |$)/);
      if (km && !name.includes(km[1])) name = (name + ' ' + km[1]).trim();
    }
    let nameFull = stripGloss(name0.replace(/ عن .*$/, ''));
    { const km = name0.slice(nameFull.length).match(/(?:^| )((?:ابو|ام) (?!بن )[^ ]+(?: ال[^ ]{3,})?)(?= |$)/); if (km && !nameFull.includes(km[1])) nameFull = (nameFull + ' ' + km[1]).trim(); } // for display only: "محمد بن خازم بمعجمتين أبو معاوية" keeps its kunya
    entries.push({ n, name, nameFull, stub, deaths: typeof deaths !== 'undefined' ? deaths : [], grade, gradeDisplay: grade ? GRADE_DISPLAY[grade] : null, layer, death, deathApprox, centuryExplicit, sigla: sig, colls: [...colls], raw: body });
  }
  return entries;
}

/**
 * Lookup keys of an entry → strength (3 full name, 2 patronymic prefix / kunya, 1 weak forms).
 * "صهيب ابو الصهباء البكري البصري" → صهيب ابو الصهباء البكري البصري (3), ابو الصهباء (2), ابو الصهباء البكري (2), صهيب البكري (1)
 */
/** A cleaned name that is only a given name ("محمد", "عبد الله"): no patronymic, no kunya, no nisba. Such an entry cannot be told from its namesakes by the name. */
export const bareEntryName = clean => !!clean && (!clean.split(' ').some(w => ['بن', 'بنت', 'ابن', 'ابو', 'ام', 'ابي'].includes(w) || (w.startsWith('ال') && w !== 'الله' && w !== 'الرحمن')) || /^(?:ابو|ام) [^ ]+$/.test(clean)); // "محمد", "عبد الله", "ابو اسحاق" alone
const bareCache = new WeakMap();
const isBareEntry = t => { let v = bareCache.get(t); if (v === undefined) { v = bareEntryName(cleanName(t.name)); bareCache.set(t, v); } return v; };

export function entryKeys(e) {
  const keys = new Map();
  const put = (k, s) => { if (k && (!keys.has(k) || keys.get(k) < s)) keys.set(k, s); };
  const full = cleanName(e.name);
  if (!full) return keys;
  put(full, 3);
  const w = full.split(' ');
  const idx = [];
  w.forEach((t, i) => { if (t === 'بن' || t === 'بنت') idx.push(i); });
  for (const i of idx) { let end = i + 2; if (['ابي', 'ابو', 'عبد', 'عبيد', 'ابن', 'ام', 'بن'].includes(w[end - 1]) && w[end]) end++; const k = w.slice(0, end).join(' '); if (end >= 3 && !/ (?:ابي|ابو|عبد|عبيد|ابن|ام|بن)$/.test(k)) put(k, 2); }
  for (let i = 0; i < w.length; i++) if ((w[i] === 'ابو' || w[i] === 'ام') && w[i + 1] && w[i + 1] !== 'بن') {
    if (!['عبد', 'عبيد', 'بن', 'ابي'].includes(w[i + 1])) put(`${w[i]} ${w[i + 1]}`, 2); else if (w[i + 2]) put(`${w[i]} ${w[i + 1]} ${w[i + 2]}`, 2);
    if (w[i + 2] && w[i + 2].startsWith('ال')) put(`${w[i]} ${w[i + 1]} ${w[i + 2]}`, 2);
  }
  // "ابن X": the father, or a remoter ancestor when his name is a family name ("ابن ابي مليكه", "ابن ابي ذيب", "ابن الهاد"), not a bare given name ("ابن كثير" is the son of كثير)
  idx.forEach((i, r) => { if (!w[i + 1]) return; const f = w.slice(i + 1, i + 3).join(' '); if (!['ابي', 'عبد', 'عبيد', 'ام', 'ابو'].includes(w[i + 1])) { if (r === 0 || w[i + 1].startsWith('ال')) put(`ابن ${w[i + 1]}`, 1); } else if (w[i + 2] && (r === 0 || w[i + 1] === 'ابي')) put(`ابن ${f}`, 1); });
  const nisba = [...w].reverse().find(t => t.startsWith('ال') && t.length > 3 && t !== 'الله' && !GENERIC_NISBA.has(t));
  if (nisba && w[0] !== nisba && w[0] !== 'ابو' && w[0] !== 'ام') put(`${w[0]} ${nisba}`, 1);
  for (const t of w) if (t.startsWith('ال') && t.length >= 6 && !GENERIC_NISBA.has(t) && t !== 'الله') put(t, 1);
  return keys;
}

// ── Tahdhīb al-Tahdhīb ──────────────────────────────────────────────────────
// "### $ 771 م د س مسلم وأبي داود والنسائي صهيب أبو الصهباء البكري البصري ويقال المدني مولى بن عباس روى عن … وعنه … قال أبو زرعة ثقة …"
const EXPANSION_WORDS = new Set(['البخاري', 'ومسلم', 'والترمذي', 'الترمذي', 'والنسايي', 'النسايي', 'وابن', 'ماجه', 'ماجة', 'وداود', 'في', 'الادب', 'المفرد', 'التعاليق', 'التعليق', 'خلق', 'افعال', 'العباد', 'القراءه', 'الامام', 'رفع', 'اليدين', 'الجمعه', 'الصلاه', 'مسايل', 'الناسخ', 'والمنسوخ', 'المراسيل', 'القدر', 'الشمايل', 'اليوم', 'والليله', 'مسند', 'خصايص', 'السنن', 'الكبري', 'التفسير', 'الاسماء', 'والكني', 'مقدمه', 'الصحيح', 'الستة', 'السته', 'الجماعه', 'الاربعه', 'والاربعه', 'والباقين', 'الباقين', 'سوي', 'وحده', 'فقط', 'اصحاب', 'اصحابها', 'الكتب', 'الجميع', 'وفي', 'كتاب', 'الرد', 'الجهميه', 'فضايل', 'الانصار', 'الصحابه', 'النكاح', 'حديث', 'الغيلانيات', 'الاجابه', 'المرسل', 'الطلاق', 'البعث', 'الزهد', 'الوصايا', 'الكني', 'التاريخ']);
const STOP_LIST = /^(?:غيرهم|غيره|جماعه|اخرون|خلق|كثير|كثيرون|اخرين|جماعة|روي|مات قبله|وغيرهم|غير ذلك)$/;
const CUT_RE = / (?:قال|ذكره|وثقه|ضعفه|وقال|مات|توفي|له|روي له|قلت|ذكر|قالوا|قيل|كان|وكان|قال ابو|قال ابن|وله|وذكره)(?= )/;
let WAW_NAMES = new Set(); // names beginning with و (وكيع، وهب، واقد…) so that "وعنه وكيع" is not split into "كيع"
const splitNames = s => s.split(/ (?=و[^ ])| ،|، /).map(x => x.trim()).map(x => (x.startsWith('و') && !WAW_NAMES.has(x.split(' ')[0])) ? x.slice(1) : x).map(x => x.trim()).filter(x => x && x.length > 2 && !STOP_LIST.test(x) && !/\d/.test(x));

export function loadTahdhib(path) {
  const entries = [];
  const raw = readEntries(path);
  // first pass: heads of entries beginning with و
  for (const { body } of raw) { const w = normText(body).split(' ').find(t => !SIGLA[t] && !EXPANSION_WORDS.has(t) && t !== '4'); if (w && w.startsWith('و') && w.length > 2) WAW_NAMES.add(w); }
  for (const { n, vol, body } of raw) {
    const norm = normText(body);
    const toks = norm.split(' ');
    let k = 0;
    while (k < toks.length && SIGLA[toks[k]]) k++;
    const sig = toks.slice(0, k).filter(t => SIGLA[t]);
    // the expansion of the sigla ("البخاري ومسلم وأبي داود والنسائي وابن ماجة", "أبي داود في المراسيل"…)
    while (k < toks.length) {
      const t = toks[k], t2 = toks[k + 1];
      if ((t === 'ابي' || t === 'وابي' || t === 'ابو' || t === 'وابو') && t2 === 'داود') { k += 2; continue; }
      if ((t === 'بن' || t === 'وبن' || t === 'ابن' || t === 'وابن') && (t2 === 'ماجه' || t2 === 'ماجة')) { k += 2; continue; }
      if (EXPANSION_WORDS.has(t) && (k === 0 || sig.length)) { k++; continue; }
      // words that are also names ("مسلم", "علي", "مالك", "خلف", "عمل"): part of the expansion only in their formula
      const prev = toks[k - 1], next = toks[k + 1] || '';
      if (sig.length && ((t === 'مسلم' && next !== 'بن' && (next.startsWith('و') || next === 'في' || next === 'وحده' || next === 'فقط')) || (t === 'علي' && (prev === 'مسند' || prev === 'الرد')) || (t === 'مالك' && (prev === 'حديث' || prev === 'موطا')) || (t === 'خلف' && prev === 'القراءه') || (t === 'عمل' && next === 'اليوم'))) { k++; continue; }
      break;
    }
    const rest = toks.slice(k).join(' ');
    const rw = rest.search(/ (?:روي عن|روت عن|روي عنه|حدث عن) /);
    let name = (rw >= 0 ? rest.slice(0, rw) : rest.split(' ').slice(0, 12).join(' ')).trim();
    if (name.startsWith('بن ')) name = 'ا' + name; // "بن أبي ذئب" = ابن أبي ذئب
    name = name.replace(/^(?:(?:امير المومنين|الامام|الحافظ|الشيخ|القاضي|الفقيه|السيد|الخليفه|الصحابي|الجليل|العلامه|المحدث|ابو الخلفاء|خليفه رسول الله) )+/, '');
    const tailRe = / (?:عن|من|الي|كان|قال|ذكره|روي|له|ابن اخي|ابن اخت|احد|رجل|لم|لا|ليس|في|بحديث)(?= |$).*$/;
    const nameFull = stripGloss(name.replace(tailRe, '')).trim();
    name = name.replace(GLOSS_RE, '').replace(tailRe, '').trim();
    let teachers = [], students = [];
    if (rw >= 0) {
      const after = rest.slice(rw).replace(/^ (?:روي عن|روت عن|روي عنه|حدث عن) /, '');
      const ws = after.search(/ (?:وعنه|وعنها|روي عنه|وروي عنه|روي عنها|وروي عنها) /);
      const tpart = (ws >= 0 ? after.slice(0, ws) : after).split(CUT_RE)[0];
      teachers = splitNames(tpart).slice(0, 400);
      if (ws >= 0) students = splitNames(after.slice(ws).replace(/^ (?:وعنه|وعنها|روي عنه|وروي عنه|روي عنها|وروي عنها) /, '').split(CUT_RE)[0]).slice(0, 400);
    }
    entries.push({ n, vol, name, nameFull, sigla: sig, colls: [...new Set(sig.flatMap(x => SIGLA[x]))], teachers, students, text: body });
  }
  return entries;
}

/**
 * Ibn Ḥajar omits the century when it is obvious ("مات سنة تسع وسبعين" for Mālik, d. 179).
 * Picks the century that best fits a hint (the entity's own dating) or, failing that, the layer.
 */
const LAYER_MID = { 1: 55, 2: 90, 3: 110, 4: 130, 5: 145, 6: 150, 7: 170, 8: 190, 9: 215, 10: 235, 11: 255, 12: 280 };
/** The recorded death year closest to a reference year, among the alternatives the entry gives ("94 وقيل 104"). */
export function closestDeath(t, ref) {
  const alts = t.deaths?.length ? t.deaths : [t.death];
  let best = null, bd = Infinity;
  for (const d of alts) { if (d == null) continue; const y = taqribDeath({ ...t, death: d }, ref); const diff = ref == null ? 0 : Math.abs(y - ref); if (diff < bd) { bd = diff; best = y; } }
  return best;
}
export function taqribDeath(t, hint) {
  if (t.death == null) return null;
  if (t.centuryExplicit || t.death >= 100) return t.death;
  const target = t.layer ? LAYER_MID[t.layer] : hint;
  if (target == null) return t.death;
  const ranked = [0, 100, 200, 300].map(c => ({ y: t.death + c, d: Math.abs(t.death + c - target) })).sort((a, b) => a.d - b.d);
  if (t.layer && hint != null && ranked[1].d - ranked[0].d < 25) return Math.abs(ranked[0].y - hint) <= Math.abs(ranked[1].y - hint) ? ranked[0].y : ranked[1].y; // "ستين" in the 3rd layer: 60 or 160? the estimate decides
  return ranked[0].y;
}

/** Words of the names known to the rijāl books (entry heads only: the teacher/student lists are noisier). */
export function nameVocabulary(taqrib, tahdhib, extraNames = []) {
  const vocab = new Map();
  const add = (nm, w0 = 1) => { for (const w of cleanName(nm).split(' ')) if (w.length > 1) vocab.set(w, (vocab.get(w) || 0) + w0); };
  for (const t of taqrib) add(t.name, 2);
  for (const t of tahdhib) { add(t.name, 2); for (const nm of t.teachers) add(nm); for (const nm of t.students) add(nm); }
  for (const nm of extraNames) add(nm, 2);
  const heads = new Set();
  for (const t of [...taqrib, ...tahdhib]) for (const w of cleanName(t.name).split(' ')) heads.add(w);
  for (const nm of extraNames) for (const w of cleanName(nm).split(' ')) heads.add(w);
  const out = new Set();
  // a word of an entry head is a name; a word met only in the teacher/student lists must recur ("ويقال", "ممن", "خرجت" are list noise)
  for (const [w, c] of vocab) if ((heads.has(w) ? c >= 2 : c >= 4) && !NON_NAME_WORDS.has(w) && !GLOSS_WORD.test(w) && !PRON_RE.test(w)) out.add(w);
  for (const w of ['جد', 'جده', 'جدته', 'والد', 'والده', 'اب', 'ابيه', 'اخ', 'اخو', 'اخي', 'اخت', 'عم', 'عمه', 'خال', 'خاله', 'ابنه', 'ابنته', 'زوج', 'زوجه', 'امراه', 'بن', 'بنت', 'ابن', 'ابو', 'ابي', 'ام', 'عبد', 'عبيد', 'مولي', 'الله', 'اربع', 'كتاب', 'كتب', 'ولد', 'رجل', 'رجلا', 'امراه', 'ناس', 'قوم', 'اهل', 'الحبيب', 'الامين', 'يوم', 'سنه', 'شهر', 'ليله', 'حديث', 'حديثا', 'كلمه', 'شيء', 'شيئا', 'قال', 'انه', 'كان', 'كانوا', 'الغد', 'الجمعه', 'الصلاه', 'المسجد', 'المنبر', 'الناس', 'القوم', 'الرجل', 'المراه', 'الحديث', 'الكتاب', 'الله', 'النبي', 'رسول']) out.delete(w);
  return out;
}

// ── Alignment with the corpus entities ───────────────────────────────────────
const layerGen = l => l === 1 ? 'sahabi' : l <= 5 ? 'tabii' : 'muhaddith';
const prefixOf = (a, b) => { const x = a.split(' '), y = b.split(' '); if (x.length < 2 || y.length < 2) return false; const n = Math.min(x.length, y.length); for (let i = 0; i < n; i++) if (x[i] !== y[i]) return false; return true; };
const compatible = (a, b) => a === b || prefixOf(a, b);

/**
 * ents: Map key → entity { key, colls:Set, gen, death, dated, neighbours:Set<key> }
 * aliases: Map key → [alias keys] (other spellings folded onto the entity)
 * Sets e.tahdhib / e.taqrib on matched entities. Returns statistics.
 */
export function matchRijal(ents, aliases, taqrib, tahdhib) {
  const index = entries => { const m = new Map(); for (const e of entries) for (const [k, s] of entryKeys(e)) (m.get(k) || m.set(k, []).get(k)).push([e, s]); return m; };
  const iTaq = index(taqrib), iTah = index(tahdhib);
  const cands = (idx, e) => {
    const seen = new Map(), by = new Map();
    for (const k of [e.key, ...(aliases.get(e.key) || [])]) for (const [entry, s] of idx.get(k) || []) if (!isBareEntry(entry)) { if (!seen.has(entry) || seen.get(entry) < s) seen.set(entry, s); const b = keyBonus(k, entry); if ((by.get(entry) || 0) < b) by.set(entry, b); }
    return [...seen].map(([entry, s]) => [entry, s, by.get(entry) || 0]);
  };
  const headCount = new Map(); // given name → how many Tahdhīb entries begin with it (a rare name identifies, a common one pools)
  for (const t of tahdhib) { const w = cleanName(t.name).split(' ')[0]; if (w) headCount.set(w, (headCount.get(w) || 0) + 1); }
  const bareGiven = k => !k.includes(' ') && !/^(?:ابو|ابن|ام|ال)/.test(k);
  const stats = { tahdhib: 0, taqrib: 0, tahdhibAmbiguous: 0, taqribAmbiguous: 0, both: 0 };
  // "ابن X" names any descendant of X: among namesakes tied on evidence, the one cited by far more collections wins, else the direct son
  const directSon = (t, key) => { const m = key.match(/^ابن (.+)$/); if (!m) return false; const w = cleanName(t.name).split(' '); const i = w.indexOf('بن'); return i > 0 && w.slice(i + 1, i + 1 + m[1].split(' ').length).join(' ') === m[1]; };
  const pick = (ranked, key = '') => {
    if (!ranked.length) return null;
    const [best, second] = ranked;
    if (best.strength <= 1 && best.s < 3) return null;                 // a weak key ("ابن شهاب", "سفيان الهلالي") needs corroboration
    if (best.strength <= 1 && best.overlap != null && best.overlap < 2 && ranked.length > 1) return null; // several namesakes: the company must speak
    if (ranked.length === 1) return best.s >= 1 || best.strength >= 2 ? best : null;
    if (best.s >= 2 && best.s >= second.s + 1) return best;
    if (best.s === second.s && key.startsWith('ابن ') && best.strength <= 1 && second.strength <= 1) {
      if (best.e.colls.length >= second.e.colls.length + 2) return best;
      if (second.e.colls.length >= best.e.colls.length + 2) return second;
      const d1 = directSon(best.e, key), d2 = directSon(second.e, key);
      if (d1 !== d2 && !ranked.slice(2).some(r => r.s === best.s)) return d1 ? best : second;
    }
    return null;
  };
  // a candidate whose death year contradicts the entity's own dating is discarded
  const dateOk = (t, e) => { if (t.death == null || e.death == null) return true; const d = Math.abs(closestDeath(t, e.death) - e.death); return d <= (e.dated === 'reference' ? 3 : 40); };
  const keyBonus = (key, t) => { // the more of the entity's own name the entry carries, the surer: "ابو سلمه بن عبد الرحمن" over "ابو سلمه", "اسحاق بن ابراهيم الحنظلي" over "اسحاق بن ابراهيم"
    const kw = key.split(' '), nw = new Set(cleanName(t.name).split(' '));
    let b = Math.min(2, Math.max(0, kw.length - 2));
    for (const w of kw) if (w.startsWith('ال') && w !== 'الله' && w !== 'الرحمن' && nw.has(w)) { b += 2; break; }
    return b;
  };
  const DEBUG = new Set((process.env.DEBUG_MATCH || '').split(',').map(x => x.trim()).filter(Boolean));
  const dbg = e => DEBUG.size && [e.key, ...(aliases.get(e.key) || [])].some(k => DEBUG.has(k));
  const fmtT = t => `${cleanName(t.name).slice(0, 60)}${t.death != null ? ' †' + t.death : ''}${t.layer ? ' L' + t.layer : ''}${t.colls?.length ? ' [' + t.colls.join('') + ']' : ''}`;
  for (const e of ents.values()) {
    const nb = e.neighbours || new Set();
    const nbArr = [...nb];
    const collsE = e.colls;
    if (dbg(e)) console.error(`[debug] entity ${e.key} | aliases ${(aliases.get(e.key) || []).join(' / ')} | dated ${e.dated} death ${e.death} gen ${e.gen} colls ${[...collsE].join('')} links ${e.count}`);
    // Tahdhīb first: teachers/students give a strong signal
    {
      const ranked = cands(iTah, e).map(([t, strength, bonus]) => {
        let s = bonus;
        if (t.colls.length && t.colls.some(c => collsE.has(c))) s += 2;
        let overlap = 0;
        for (const nm of [...t.teachers, ...t.students]) { const k = cleanName(nm); if (!k) continue; if (nb.has(k) || nbArr.some(x => compatible(k, x))) overlap++; if (overlap >= 4) break; }
        s += overlap;
        if (strength === 3) s += 1;
        return { e: t, s, strength, overlap };
      }).sort((a, b) => b.s - a.s);
      let best = pick(ranked, e.key);
      if (dbg(e)) for (const r of ranked.slice(0, 6)) console.error(`[debug]   tahdhib cand s=${r.s} str=${r.strength} ov=${r.overlap} ${fmtT(r.e)}`);
      if (!best && ranked.length && !e.key.includes(' بن ') && (!bareGiven(e.key) || (headCount.get(e.key) || 0) <= 3)) { const [b, s2] = ranked; const overlap = b.s - (b.strength === 3 ? 1 : 0) - (b.e.colls.length && b.e.colls.some(c => collsE.has(c)) ? 2 : 0); if (overlap >= 3 && (!s2 || b.s >= s2.s + 2)) best = b; } // "كريب", "الجريري": the company decides
      if (best) { e.tahdhib = best.e; stats.tahdhib++; } else if (ranked.length > 1) stats.tahdhibAmbiguous++;
    }
    {
      // a bare single-word entity ("سفيان", "عمر~") that several persons of the books share is left unmatched: it pools several people
      if (!e.key.includes(' ') && !/^(?:ابو|ابن|ام|ال)/.test(e.key) && (iTaq.get(e.key) || []).length + taqrib.filter(t => cleanName(t.name).split(' ')[0] === e.key).length > 1) continue;
      // a reference-dated narrator is never matched through a weak key ("ابن شهاب" → عبد الله بن شهاب): stage 2 handles him by death year
      const ranked = cands(iTaq, e).filter(([t, strength]) => dateOk(t, e) && (!t.layer || !e.gen || e.dated !== 'reference' || layerGen(t.layer) === e.gen) && !(e.dated === 'reference' && (strength <= 1 || t.stub || (t.death == null && !t.layer)))).map(([t, strength, bonus]) => {
        let s = bonus;
        if (t.colls.length && t.colls.some(c => collsE.has(c))) s += 2;
        if (t.layer && e.gen && layerGen(t.layer) === e.gen) s += 1;
        if (t.death && e.death && Math.abs(closestDeath(t, e.death) - e.death) <= (e.dated === 'reference' ? 3 : 40)) s += 1;
        if (strength === 3) s += 1;
        if (e.tahdhib) { const a = cleanName(t.name), b = cleanName(e.tahdhib.name); if (compatible(a, b) && (!t.colls.length || !e.tahdhib.colls.length || t.colls.join() === e.tahdhib.colls.join())) s += 2; }
        return { e: t, s, strength };
      }).sort((a, b) => b.s - a.s);
      const best = pick(ranked, e.key);
      if (dbg(e)) { for (const r of ranked.slice(0, 6)) console.error(`[debug]   taqrib cand s=${r.s} str=${r.strength} ${fmtT(r.e)}`); console.error(`[debug]   → taqrib ${best ? fmtT(best.e) : '—'} | tahdhib ${e.tahdhib ? fmtT(e.tahdhib) : '—'}`); }
      if (best) { e.taqrib = best.e; stats.taqrib++; } else if (ranked.length > 1) stats.taqribAmbiguous++;
      e.namesakes = ranked.filter(r => r.strength >= 2).length;
      if (e.taqrib && e.tahdhib && e.dated === 'reference') { const a = cleanName(e.taqrib.name).split(' '), b = cleanName(e.tahdhib.name).split(' '); if (a[0] !== b[0] || (a[1] === 'بن' && b[1] === 'بن' && a[2] !== b[2])) { e.tahdhib = null; stats.tahdhib--; } }
    }
  }
  // Stage 2 — reference-dated entities known by a short name (الزهري, عائشة, نافع, عكرمة…): the name must occur
  // inside the Taqrīb entry and the (century-corrected) death year must agree within 3 years.
  {
    const words = new Map();
    taqrib.forEach((t, i) => { for (const w of new Set(cleanName(t.name).split(' '))) (words.get(w) || words.set(w, new Set()).get(w)).add(i); });
    const contains = (nameWords, kw) => { outer: for (let i = 0; i + kw.length <= nameWords.length; i++) { for (let j = 0; j < kw.length; j++) if (nameWords[i + j] !== kw[j]) continue outer; return true; } return false; };
    for (const e of ents.values()) {
      if (e.taqrib || e.dated !== 'reference' || e.death == null) continue;
      const found = new Map();
      for (const key of [e.key, ...(aliases.get(e.key) || [])]) {
        const kw = key.split(' ').filter(Boolean); if (!kw.length) continue;
        let set = null;
        for (const w of kw) { const p = words.get(w); if (!p) { set = null; break; } set = set ? new Set([...set].filter(i => p.has(i))) : new Set(p); }
        if (!set) continue;
        const nameWords = cleanName(key).split(' ');
        const allowInside = nameWords.length >= 2 || /^(?:ابو|ابن|ام|ال)/.test(nameWords[0]); // a kunya, a nisba or a compound may sit anywhere; a bare given name only at the head
        for (const i of set) { const t = taqrib[i]; const w = cleanName(t.name).split(' '); if (allowInside ? contains(w, kw) : w[0] === kw[0]) found.set(i, t); }
      }
      const dated = [...found.values()].filter(t => t.death != null && Math.abs(closestDeath(t, e.death) - e.death) <= 3);
      let ok = dated.filter(t => !t.layer || !e.gen || layerGen(t.layer) === e.gen || e.gen === 'rijal');
      if (ok.length > 1) { // several agree within 3 years: keep the closest one if it is clearly closer
        const diff = t => Math.abs(closestDeath(t, e.death) - e.death);
        ok.sort((a, b) => diff(a) - diff(b));
        ok = diff(ok[1]) >= diff(ok[0]) + 2 ? [ok[0]] : ok;
        if (ok.length > 1) { // still tied: the one cited by the most of the entity's own collections (عكرمة مولى ابن عباس = ع)
          const ov = t => t.colls.filter(c => e.colls.has(c)).length;
          ok.sort((a, b) => ov(b) - ov(a));
          if (ov(ok[0]) > ov(ok[1])) ok = [ok[0]];
        }
      }
      if (dbg(e)) console.error(`[debug]   stage2 found ${found.size} dated≤3 ${dated.length} ok ${ok.map(fmtT).join(' | ')}`);
      if (ok.length === 1) { e.taqrib = ok[0]; e.taqribBy = 'contains+death'; stats.taqrib++; stats.taqribStage2 = (stats.taqribStage2 || 0) + 1; }
    }
  }
  // Stage 3 — Tahdhīb via the matched Taqrīb entry (same author, same order): compatible name and sigla.
  {
    const byFirst = new Map();
    tahdhib.forEach(t => { const w = cleanName(t.name).split(' ')[0]; if (w) (byFirst.get(w) || byFirst.set(w, []).get(w)).push(t); });
    for (const e of ents.values()) {
      if (e.tahdhib || !e.taqrib) continue;
      const a = cleanName(e.taqrib.name); const aw = a.split(' ');
      const cands = (byFirst.get(aw[0]) || []).filter(t => { const b = cleanName(t.name); return compatible(a, b) || compatible(b, a) || (aw.length >= 3 && contains3(b, aw)); })
        .filter(t => !t.colls.length || !e.taqrib.colls.length || t.colls.join() === e.taqrib.colls.join());
      if (!cands.length) continue;
      const nb = e.neighbours || new Set(), nbArr = [...nb];
      const ranked = cands.map(t => { let s = 0; for (const nm of [...t.teachers, ...t.students]) { const k = cleanName(nm); if (k && (nb.has(k) || nbArr.some(x => compatible(k, x)))) s++; if (s >= 4) break; } return { t, s }; }).sort((x, y) => y.s - x.s);
      if (ranked.length === 1 || ranked[0].s > ranked[1].s) { e.tahdhib = ranked[0].t; stats.tahdhib++; stats.tahdhibStage3 = (stats.tahdhibStage3 || 0) + 1; }
    }
  }
  for (const e of ents.values()) if (e.taqrib && e.tahdhib) stats.both++;
  return stats;
}
const contains3 = (name, aw) => { const nw = name.split(' '); const k = aw.slice(0, 3); outer: for (let i = 0; i + 3 <= nw.length; i++) { for (let j = 0; j < 3; j++) if (nw[i + j] !== k[j]) continue outer; return true; } return false; };


/**
 * Aligns the entries of any rijāl book (loaded by openiti.js) with the entities.
 * Evidence: name keys, sigla, death year, teachers/students in common, and compatibility with the
 * Taqrīb/Tahdhīb entry already matched. Sets e.notices = [{ src, entry }].
 */
export function matchSource(ents, aliases, entries, srcId, { companions = false } = {}) {
  const idx = new Map();
  for (const t of entries) for (const [k, st] of entryKeys(t)) (idx.get(k) || idx.set(k, []).get(k)).push([t, st]);
  const heads = new Map();
  for (const t of entries) { const w = cleanName(t.name).split(' ')[0]; if (w) (heads.get(w) || heads.set(w, []).get(w)).push(t); }
  const namesakes = new Map(); // key → number of entries answering to it
  for (const [k, list] of idx) namesakes.set(k, new Set(list.map(([t]) => t)).size);
  const prefixOf = (a, b) => { const x = a.split(' '), y = b.split(' '); if (x.length < 2 || y.length < 2) return false; const n = Math.min(x.length, y.length); for (let i = 0; i < n; i++) if (x[i] !== y[i]) return false; return true; };
  const compat = (a, b) => a === b || prefixOf(a, b);
  const stats = { matched: 0, ambiguous: 0 };
  for (const e of ents.values()) {
    if (companions && e.gen !== 'sahabi' && e.layer !== 1) continue; // a dictionary of companions only speaks of companions
    const keys = [e.key, ...(aliases.get(e.key) || [])];
    const seen = new Map();
    for (const k of keys) for (const [t, st] of idx.get(k) || []) if (!isBareEntry(t) && (!seen.has(t) || seen.get(t) < st)) seen.set(t, st);
    // through the Taqrīb / Tahdhīb entry already found: same head word and compatible name
    const anchorNames = [e.taqrib && cleanName(e.taqrib.name), e.tahdhib && cleanName(e.tahdhib.name)].filter(Boolean);
    for (const an of anchorNames) for (const t of heads.get(an.split(' ')[0]) || []) { const tn = cleanName(t.name); if ((compat(an, tn) || compat(tn, an)) && !seen.has(t)) seen.set(t, 2); }
    if (!seen.size) continue;
    const bare = !e.key.includes(' ') && !/^(?:ابو|ابن|ام|ال)/.test(e.key);
    const nb = e.neighbours || new Set(); const nbArr = [...nb];
    const ranked = [...seen].map(([t, strength]) => {
      let s = 0;
      const tn = cleanName(t.name);
      if (t.colls.length && e.colls && t.colls.some(c => e.colls.has(c))) s += 2;
      if (t.death != null && e.death != null) { const d = Math.abs(taqribDeath({ death: t.death, centuryExplicit: t.death >= 100, layer: e.layer }, e.death) - e.death); if (d <= (e.dated === 'reference' || e.dated === 'taqrib' ? 3 : 40)) s += 1; else if (e.dated === 'reference' || e.dated === 'taqrib') s -= 9; } // a dated man is never given a namesake who died in another decade
      let overlap = 0;
      for (const nm of [...t.teachers, ...t.students]) { const k = cleanName(nm); if (!k) continue; if (nb.has(k) || nbArr.some(x => compat(k, x) || compat(x, k))) overlap++; if (overlap >= 4) break; }
      s += overlap;
      if (strength === 3) s += 1;
      for (const an of anchorNames) if (compat(an, tn) || compat(tn, an)) { s += 3; break; }
      return { t, s, strength, overlap };
    }).filter(x => x.s >= 0).sort((a, b) => b.s - a.s);
    if (!ranked.length) continue;
    const [best, second] = ranked;
    let ok = false;
    if (ranked.length === 1) ok = (best.strength >= 2 && best.s >= 1) || best.s >= 3 || (best.strength === 3 && !bare && cleanName(best.t.name).split(' ').length >= 3);
    else ok = best.s >= 2 && best.s >= second.s + 2 && (best.strength >= 2 || best.s >= 4);
    if (bare && !anchorNames.length) ok = false;
    if (ok && !anchorNames.length && ((namesakes.get(e.key) || 0) > 1 || (e.namesakes || 0) > 1) && !(e.dated === 'reference' && best.t.death != null && Math.abs(best.t.death - e.death) <= 3)) ok = false; // "يحيى بن سعيد" is three men in the Taqrīb: unanchored, only a reference date may decide
    if (/^(?:ابو|ام) [^ ]+$/.test(e.key) && !anchorNames.length && best.s < 4) ok = false; // "أبو حازم" alone names several men: the shared teachers and students must speak
    if (ok) { (e.notices ||= []).push({ src: srcId, entry: best.t }); stats.matched++; } else if (ranked.length > 1) stats.ambiguous++;
  }
  return stats;
}


// ── Full names for display ───────────────────────────────────────────────────
const NISBA_STOP = new Set(['الفقيه', 'الحافظ', 'الامام', 'القاضي', 'الشيخ', 'العلامه', 'المحدث', 'الصحابي', 'الجليل', 'الثقه', 'الضعيف', 'الكبير', 'الصغير', 'الاكبر', 'الاصغر', 'المشهور', 'المعروف', 'الله', 'الرحمن', 'الرحيم', 'الملك', 'العزيز', 'الوهاب', 'الكريم', 'الحميد', 'المجيد', 'الصمد', 'الاعلي', 'المطلب', 'الرزاق', 'الوارث']);
/**
 * Trims a cleaned dictionary name to a readable full name: given name, up to `links` patronymic links,
 * the nisbas/laqabs, and the kunya. "محمد بن مسلم بن عبيد الله بن عبد الله بن شهاب … القرشي الزهري ابو بكر الفقيه" → "محمد بن مسلم بن عبيد الله بن عبد الله القرشي الزهري ابو بكر"
 */
/** "عبد الله", "عبد الرحمن", "عبد مناف", "عبيد الله": the two words are one name; "عبيد" before another name is not. */
const THEO_TAIL = new Set(['مناف', 'شمس', 'العزي', 'ود', 'يغوث', 'يزيد', 'عمرو', 'رب', 'ربه', 'كلال', 'قيس', 'خير', 'اشهل', 'عوف', 'ياليل', 'مليك', 'نهم', 'عمر', 'غنم', 'يليل', 'الدار', 'المطلب']);
export const isTheo = (w, k) => (w[k] === 'عبد' || w[k] === 'عبيد') && !!w[k + 1] && (THEO_TAIL.has(w[k + 1]) || (w[k + 1].startsWith('ال') && w[k + 1] !== 'الله' ? true : w[k + 1] === 'الله'));
export function trimFullName(clean, links = 3) {
  let w = clean.split(' ').filter(Boolean).map((x, i, a) => x === 'ابن' && i > 0 && a[i + 1] ? 'بن' : x); // "هشيم بن بشير ابن القاسم": a link written with alef
  if ((w[0] === 'ابو' || w[0] === 'ام') && w.length >= 4) { // a leading kunya followed by the name: "ابو حازم سلمه بن دينار" → "سلمه بن دينار ابو حازم"
    const k = isTheo(w, 1) ? 3 : 2;
    const rest = w.slice(k);
    if (rest[0] && !rest[0].startsWith('ال') && rest[0] !== 'بن' && rest[0] !== 'بنت' && rest[0] !== 'ابو' && rest[0] !== 'ام' && (rest[1] === 'بن' || rest[1] === 'بنت' || rest[0] === 'عبد' || rest[0] === 'عبيد')) w = [...rest, ...w.slice(0, k)];
  }
  const out = [];
  let i = 0, n = 0;
  const theo = k => isTheo(w, k);
  const nameAt = k => theo(k) ? [w[k], w[k + 1]] : (w[k] === 'ابو' || w[k] === 'ابي' || w[k] === 'ام') && w[k + 1] && w[k + 1] !== 'بن' && w[k + 1] !== 'بنت' ? (theo(k + 1) ? [w[k], w[k + 1], w[k + 2]] : [w[k], w[k + 1]]) : [w[k]];
  let nm = nameAt(0); out.push(...nm); i = nm.length;
  while (i < w.length && (w[i] === 'بن' || w[i] === 'بنت') && w[i + 1]) {
    nm = nameAt(i + 1);
    if (n < links) out.push(w[i], ...nm);
    i += 1 + nm.length; n++;
  }
  let nisbas = 0, kunya = false;
  for (; i < w.length;) {
    if ((w[i] === 'ابو' || w[i] === 'ام') && w[i + 1] && !kunya) { nm = nameAt(i); out.push(...nm); i += nm.length; kunya = true; continue; }
    if (w[i].startsWith('ال') && w[i].length > 3 && !NISBA_STOP.has(w[i])) { if (nisbas < 3) { out.push(w[i]); nisbas++; } i++; continue; }
    break;
  }
  return out.join(' ');
}
/** The words of `raw` (original spelling) that render the cleaned name `clean`, or null. */
export function displayFromRaw(raw, clean) {
  const target = clean.split(' ').filter(Boolean);
  const words = stripMarkers(raw).replace(/[،:.؟()\[\]«»"'؛¶]/g, ' ').split(/\s+/).filter(Boolean);
  const nw = words.map(x => cleanName(x));
  const out = [];
  let j = 0;
  // the trimmed name is a subsequence of the raw words: match in order, skipping raw words not in the name
  for (let i = 0; i < words.length && j < target.length; i++) {
    if (nw[i] === target[j] || (target[j] === 'بن' && nw[i] === 'ابن' && out.length)) { out.push(words[i]); j++; }
    else if (out.length && nw[i] && (nw[i] === 'بن' || nw[i] === 'بنت') && target[j] !== 'بن' && target[j] !== 'بنت') continue;
  }
  if (j === target.length) return out.join(' ').replace(/^(?:ابي|ابا) /, 'أبو ');
  // not a subsequence (the kunya was moved after the nasab): render each word from its first occurrence
  const used = new Set(), out2 = [];
  for (const t of target) { const i = nw.findIndex((x, k) => (x === t || (t === 'بن' && x === 'ابن')) && !used.has(k)); if (i < 0) return null; used.add(i); out2.push(words[i]); }
  return out2.join(' ').replace(/^(?:ابي|ابا) /, 'أبو ');
}
