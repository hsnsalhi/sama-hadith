/**
 * Generic reader for the biographical dictionaries published by OpenITI (mARkdown):
 * every "### $ N - …" heading opens an entry; the "# " paragraphs that follow (with "~~" continuations) are its text.
 * Per-work extractors derive: name, sigla (Mizzī, Dhahabī), death year, teachers ("روى عن"), students ("روى عنه"), critics' verdicts.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanName, normalizeArabic } from './isnad-graph.js';
import { arabicYear, stripMarkers } from './taqrib.js';

export const SOURCES = [
  { id: 'kamal', title: 'تهذيب الكمال في أسماء الرجال', author: 'جمال الدين المزّي', authorDeath: 742, repo: '0750AH', path: '0742Mizzi/0742Mizzi.TahdhibKamal/0742Mizzi.TahdhibKamal.Shamela0003722-ara1.mARkdown', sigla: 'head' },
  { id: 'kashif', title: 'الكاشف في معرفة من له رواية في الكتب الستة', author: 'شمس الدين الذهبي', authorDeath: 748, repo: '0750AH', path: '0748Dhahabi/0748Dhahabi.Kashif/0748Dhahabi.Kashif.Shia003276Vols-ara1.mARkdown', sigla: 'tail', nameFromBody: true },
  { id: 'jarh', title: 'الجرح والتعديل', author: 'ابن أبي حاتم الرازي', authorDeath: 327, repo: '0350AH', path: '0327IbnAbiHatimRazi/0327IbnAbiHatimRazi.JarhWaTacdil/0327IbnAbiHatimRazi.JarhWaTacdil.Shamela0002170-ara1.completed', nameFromBody: true },
  { id: 'thiqat', title: 'الثقات', author: 'ابن حبّان البستي', authorDeath: 354, repo: '0375AH', path: '0354IbnHibbanBusti/0354IbnHibbanBusti.Thiqat/0354IbnHibbanBusti.Thiqat.Shamela0005816-ara1.completed' },
  { id: 'tarikh', title: 'التاريخ الكبير', author: 'البخاري', authorDeath: 256, repo: '0275AH', path: '0256Bukhari/0256Bukhari.TarikhKabir/0256Bukhari.TarikhKabir.Shamela0000956-ara1.completed' },
];
export const OPENITI_LICENCE = 'CC BY-NC-SA 4.0';

/** Downloads a source into the cache directory (or reuses the cached copy); returns the local path. */
export async function fetchSource(src, cacheDir) {
  mkdirSync(cacheDir, { recursive: true });
  const local = resolve(cacheDir, src.path.split('/').pop());
  if (existsSync(local) && readFileSync(local).length > 10000) return local;
  const url = `https://raw.githubusercontent.com/OpenITI/${src.repo}/master/data/${src.path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${src.id}: HTTP ${res.status} for ${url}`);
  writeFileSync(local, await res.text());
  return local;
}

const SIGLA = { 'ع': ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah'], '4': ['abudawud', 'tirmidhi', 'nasai', 'ibnmajah'], 'خ': ['bukhari'], 'م': ['muslim'], 'د': ['abudawud'], 'ت': ['tirmidhi'], 'س': ['nasai'], 'ق': ['ibnmajah'], 'بخ': [], 'خت': ['bukhari'], 'عخ': [], 'مد': [], 'تم': [], 'عس': [], 'فق': [], 'كد': [], 'خد': [], 'صد': [], 'ل': [], 'ر': [], 'كن': [], 'ص': [], 'ز': [], 'ي': [], 'قد': [], 'سي': [], 'مق': [] };
const norm = s => normalizeArabic(s).replace(/\(\d+\)|\[[^\]]*\]|\d+ - /g, ' ').replace(/[،:.؟()\[\]«»"'؛¶]/g, ' ').replace(/\s+/g, ' ').trim();
const normKeep = s => normalizeArabic(s).replace(/\(\d+\)|\[[^\]]*\]|\d+ - /g, ' ').replace(/[،:.؟()\[\]«»"'؛]/g, ' ').replace(/\s+/g, ' ').trim();
const NAME_STOP = / (?:يروي|روي|روت|سمع|سمعت|عن|من|مات|توفي|توفيت|ماتت|كان|كانت|له|لها|قال|قاله|قالت|وله|كنيته|يكني|ويكني|كناه|اخو|اخت|ابن اخي|ابن اخت|ابن عم|مولاهم|ومن|وهو|هو|وهي|هي|راي|رات|شهد|اسلم|اسلمت|ادرك|نزل|سكن|قدم|قدمت|عداده|يعد|يقال|ويقال|وقيل|قيل|صاحب|امام|كنا|امه|حديثه|حدث|حدثت|كتب|ذكره|كذا|هكذا|ثقه|صدوق|ضعيف|متروك|منكر|مجهول|لين|ليس|لا|ما|في|الي|ثم|فيه|بايع|بايعت|شيخ|الحافظ|الفقيه|القاضي|احد|رجل|امراه|جد|والد|والده|ابو ابيه|اخوه|ابنه|ابن|مختلف|اختلف|كنت|نسبه|نسبته|اصله|واصله|منزله|ولد|مولده|بكسر|بفتح|بضم|بالتصغير|مصغر|بمهمله|بمعجمه|بموحده|بمثناه|بنون|بلام|بجيم|بحاء|بخاء|بدال|بزاي|بسين|بشين|بصاد|بضاد|بطاء|بظاء|بعين|بغين|بفاء|بقاف|بكاف|بميم|بهاء|بواو|بياء|روي له|تابعي|صحابي|لقبه|واسمه|اسمه|واسم|اسم|هذا|هذه|ذكر|ذكرت|وذكره|وحديثه|وفد|بصري|كوفي|مدني|مكي|شامي|مصري|يماني|واسطي|بغدادي|خراساني|نيسابوري|مروزي|رازي|حمصي|دمشقي)(?= |$).*$/;
const ORD_RE = /^(?:واحده|احدي|اثنتين|ثلاث|اربع|خمس|ست|سبع|ثمان|تسع|عشر|عشره|عشرين|ثلاثين|اربعين|خمسين|ستين|سبعين|ثمانين|تسعين|مايه|ماية|مئه|ميه|مايتين|مئتين|ميتين|ثلاثمايه|ثلاثمئه|ثلاثميه|ثلثمايه|ثلثميه|اربعمايه|اربعميه|\d+)$/;
const DEATH_RE = /(?:مات|توفي|توفيت|ماتت|قتل|قتلت|استشهد|هلك|وفاته|توفاه الله)(?: (?:رحمه الله|رحمها الله|شهيدا|في|ب[^ ]+|ذي|الحجه|القعده|المحرم|صفر|ربيع|الاول|الاخر|جمادي|الاولي|الاخره|رجب|شعبان|رمضان|شوال|اول|اخر|وسط|ليله|يوم|عاشوراء|عرفه|الجمعه|الاربعاء|الخميس|السبت|الاحد|الاثنين|الثلاثاء|من|بعد|قبل|نحو|حدود|قريبا|قريب)){0,6}(?: (?:سنه|في سنه|بعد سنه|قبل سنه|نحو سنه|في حدود سنه|في حدود))? /;
const VERDICT_RE = /(?:^| )(?:ثقه|ثبت|حجه|حافظ|صدوق|صالح الحديث|صالح|لا باس به|ليس به باس|شيخ|محله الصدق|مقبول|مستور|لين الحديث|لين|ضعيف|ضعيف الحديث|متروك|متروك الحديث|منكر الحديث|مجهول|لا يعرف|لا يحتج به|ليس بالقوي|ليس بقوي|ليس بشيء|كذاب|وضاع|يضع الحديث|متهم|ساقط|صويلح|ليس بذاك|لا يتابع عليه|يخطئ|يهم|يدلس|يرسل|فيه نظر|سكتوا عنه|كثير الخطا|سيء الحفظ)(?= |$)/;
const CRITICS = ['يحيي بن معين', 'ابن معين', 'احمد بن حنبل', 'احمد', 'ابو حاتم', 'ابو زرعه', 'البخاري', 'النسايي', 'ابو داود', 'الدارقطني', 'ابن حبان', 'العجلي', 'ابن سعد', 'ابن عدي', 'الذهبي', 'ابن حجر', 'الترمذي', 'ابن المديني', 'علي بن المديني', 'علي', 'ابن ابي حاتم', 'ابو احمد الحاكم', 'الحاكم', 'ابن خراش', 'ابن شاهين', 'يعقوب بن سفيان', 'ابو نعيم', 'البزار', 'ابن نمير', 'الساجي', 'ابن قانع', 'مسلم', 'الشافعي', 'مالك', 'شعبه', 'ابن المبارك', 'وكيع', 'ابن مهدي', 'ابو مسهر', 'دحيم', 'ابن عمار', 'ابن خزيمه', 'ابن الجارود', 'ابن الجوزي', 'ابن القطان', 'الازدي', 'ابو الفتح الازدي', 'ابن حزم', 'ابو بكر بن ابي شيبه', 'الفلاس', 'عمرو بن علي', 'ابو الوليد', 'ابن ابي خيثمه', 'ابو بكر البزار', 'الطبراني', 'ابن يونس', 'الخطيب', 'ابن عبد البر', 'الليث بن سعد', 'الليث', 'سفيان', 'ابن عيينه', 'الثوري', 'يحيي القطان', 'يحيي بن سعيد', 'ابن سيرين', 'الجوزجاني', 'العقيلي', 'ابو الحسن', 'ابي', 'ابو عبيد', 'الغلابي', 'ابو بكر', 'ابو عبد الله', 'الحافظ'];
const CRITIC_RE = new RegExp('(?:قال|وقال|قاله|سالت|سئل|ذكره|وذكره|وقال لي|كتب الي|وثقه|ضعفه|سمعت) (' + CRITICS.map(c => c.replace(/ /g, ' ')).join('|') + ')(?= |$)');

function readEntries(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const out = [];
  let vol = 1, cur = null, seq = 0;
  const flush = () => { if (cur) { cur.text = stripMarkers(cur.parts.join(' ')); delete cur.parts; out.push(cur); cur = null; } };
  for (const line of lines) {
    const pv = line.match(/PageV(\d+)P/); if (pv) vol = Number(pv[1]);
    if (line.startsWith('### ')) {
      flush();
      const m = line.match(/^### \$ (?:(\d+) - ?)?(.*)$/);
      if (m) { seq++; cur = { n: m[1] ? Number(m[1]) : seq, seq, vol, parts: [m[2]] }; }
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('# ')) cur.parts.push('¶ ' + line.slice(2));
    else if (line.startsWith('~~')) cur.parts.push(line.slice(2));
  }
  flush();
  return out;
}

const SIGLA_TOK = /(?: (?:ع|4|خ|م|د|ت|س|ق|بخ|خت|عخ|مد|تم|عس|فق|كد|خد|صد|ل|ر|كن|ص|ز|ي|قد|سي|مق))+$/;
const splitNames = s => s.replace(/¶/g, ' ').split(/ و(?=[^ ])|، /).map(x => x.replace(/^و/, '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().replace(SIGLA_TOK, '').replace(/ (?:كتبت عنه|سمعت منه|روي عنه.*|وقيل.*|فيما قيل|شيخ [^ ]+)$/, '').trim()).filter(x => x && x.length > 2 && !/^(?:غيرهم|غيره|جماعه|اخرون|خلق|كثير|طبقته|طبقتهم|وطبقته|اخرين|غير ذلك|ابن اخي|ابن اخت)$/.test(x) && !/\d/.test(x)).slice(0, 300);
const WAW = new Set(['وكيع', 'وهب', 'واقد', 'واسع', 'وليد', 'وايل', 'وبره', 'وراد', 'وردان', 'وهيب', 'وازع', 'ورقاء', 'وقاء', 'وابصه', 'واثله', 'واصل', 'وحشي', 'ورد', 'وثيمه', 'وضاح', 'وزير', 'وقدان', 'ولاد', 'وهبان']);
const fixWaw = list => list.map(x => { const w = x.split(' ')[0]; return WAW.has('و' + w) ? 'و' + x : x; });

/** Loads one source; returns entries { src, n, vol, name, sigla, colls, death, deathApprox, teachers, students, grades, text }. */
export function loadSource(src, path) {
  const entries = [];
  for (const raw of readEntries(path)) {
    const paras = raw.text.split(' ¶ ').map(p => p.trim()).filter(Boolean);
    let head = paras[0] || '', body = paras.slice(1).join(' ');
    if (src.nameFromBody && head.replace(/[\s\-–—]/g, '') === '') { head = paras[1] || ''; body = paras.slice(2).join(' '); }
    const nhead = norm(head);
    // sigla
    let sig = [], toks = nhead.split(' ');
    if (src.sigla === 'head') { let k = 0; while (k < toks.length && SIGLA[toks[k]]) k++; sig = toks.slice(0, k); toks = toks.slice(k); }
    if (src.sigla === 'tail') { const last = norm(paras[paras.length - 1] || '').split(' '); const t = []; for (let k = last.length - 1; k >= 0 && t.length < 8; k--) { if (SIGLA[last[k]]) t.unshift(last[k]); else break; } sig = t; }
    let name = toks.join(' ').replace(/^(?:و|ال)?(?:منهم|ومنهم) /, '');
    name = name.replace(NAME_STOP, '').replace(/ (?:بن|بنت|ابن|ابي|ابو|ام|عبد|مولي)$/, '').trim();
    if (name.split(' ').length > 12) name = name.split(' ').slice(0, 12).join(' ');
    const ntext = normKeep(raw.text);
    // death
    let death = null, deathApprox = false;
    const dm = ntext.match(DEATH_RE);
    if (dm) {
      const rest = ntext.slice(dm.index + dm[0].length).split(' ');
      const nums = []; for (const w of rest) { const b = w.replace(/^و/, ''); if (ORD_RE.test(b)) nums.push(w); else if ((w === 'او' || w === 'وقيل' || w === 'قيل') && nums.length) nums.push('او'); else if (w === 'سنه' && nums[nums.length - 1] === 'او') continue; else break; }
      while (nums.length && nums[nums.length - 1] === 'او') nums.pop();
      const alts = nums.join(' ').split(' او ');
      death = nums.length ? arabicYear(alts[alts.length - 1]) : null;
      deathApprox = /بعد|قبل|نحو|حدود|قريب/.test(dm[0]) || alts.length > 1;
      if (death != null && (death < 1 || death > 700)) death = null;
    }
    // teachers / students
    let teachers = [], students = [];
    const tm = ntext.match(/(?:^|[¶ ])(?:روي عن|يروي عن|روت عن|تروي عن|سمع|حدث عن|حدثت عن) (.+?)(?= (?:روي عنه|روي عنها|وعنه|وعنها|يروي عنه|روي له|قال|وقال|قلت|مات|توفي|ذكره|كان|وكان|عداده|له|ثقه|صدوق|ضعيف|وثقه|ضعفه|سمع منه)(?: |$)|$)/);
    if (tm) teachers = fixWaw(splitNames(tm[1]));
    const sm = ntext.match(/(?:^|[¶ ])(?:روي عنه|روي عنها|وعنه|وعنها|يروي عنه|سمع منه|حدث عنه) (.+?)(?= (?:قال|وقال|قاله|قلت|مات|توفي|ذكره|كان|وكان|عداده|روي له|له|ثقه|صدوق|ضعيف|وثقه|ضعفه|سالت|سئل|وله|وقيل|حديثه|في|من)(?: |$)|$)/);
    if (sm) students = fixWaw(splitNames(sm[1]));
    // verdicts
    const grades = [];
    for (const sent of ntext.split(/ ¶ | \. /)) {
      if (!VERDICT_RE.test(sent)) continue;
      const c = sent.match(CRITIC_RE);
      const critic = c ? c[1] : (/(?:^|[¶ ])قلت /.test(sent) ? src.author : null);
      const v = sent.match(VERDICT_RE)[0].trim();
      if (!critic && /^(?:صالح|شيخ|ثبت|حافظ|حجه|مستور|مقبول|يخطئ|يهم|يرسل|يدلس)$/.test(v)) continue; // a name, not a verdict, unless a critic says it
      if (!critic && !/(?:^|[¶ ])(?:وهو|هو|كان|وكان|فيه|ثقه|صدوق|ضعيف|متروك|لين|مجهول|كذاب|منكر) /.test(sent)) continue;
      grades.push({ critic: critic ? critic.slice(0, 40) : null, verdict: v, text: sent.replace(/¶/g, '').slice(0, 160) });
      if (grades.length >= 12) break;
    }
    entries.push({ src: src.id, n: raw.n, seq: raw.seq, vol: raw.vol, name, sigla: sig, colls: [...new Set(sig.flatMap(x => SIGLA[x]))], death, deathApprox, teachers, students, grades, text: raw.text.replace(/ ¶ /g, '\n') });
  }
  return entries;
}
