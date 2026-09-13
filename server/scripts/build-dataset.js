#!/usr/bin/env node
/**
 * Builds the static dataset served by the site (client/public/data) from the
 * seven canonical collections published by fawazahmed0/hadith-api.
 *
 *   node server/scripts/build-dataset.js [--cache <dir>] [--out <dir>]
 *
 * Steps
 *   1. load Arabic (vocalised) + English editions
 *   2. parse every isnad into a student→teacher graph (lib/isnad-graph.js)
 *   3. "بهذا الإسناد" references: inherit the tail of the previous hadith's isnad
 *   4. resolve "عن أبيه / عن جده" from corpus-wide name expansions
 *   5. expand short names (سفيان, علي…) using the neighbour they share with a full form
 *   6. build narrator entities, enrich with reference data (dates, layer, town)
 *   7. date undated narrators by interpolation along the chains they appear in
 *   8. aggregate transmissions (teacher→student, weighted)
 *   9. write narrators.json, transmissions.json, hadith indexes + chunks, per-narrator hadith lists
 */
import { mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIsnadGraph, cleanName, displayForm, connectorType, setNameVocab, normalizeArabic } from './lib/isnad-graph.js';
import { loadReference } from './lib/reference-loader.js';
import { EXTRA_NARRATORS } from './lib/reference-extra.js';
import { BIOS } from './lib/reference-bios.js';
import { loadTaqrib, loadTahdhib, matchRijal, matchSource, taqribDeath, nameVocabulary, LAYER_NAMES } from './lib/taqrib.js';
import { SOURCES, fetchSource, loadSource, OPENITI_LICENCE } from './lib/openiti.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]] : []).filter(x => x.length));
const CACHE = resolve(args.cache || resolve(__dirname, '../../.cache/hadith-api'));
const OUT = resolve(args.out || resolve(__dirname, '../../client/public/data'));
const RIJAL = resolve(__dirname, '../data/openiti');
const CACHE_OPENITI = resolve(args.cache || resolve(__dirname, '../../.cache/hadith-api'), '../openiti');
const CDN = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions';

export const COLLECTIONS = [
  { code: 'bukhari', edition: 'bukhari', name_ar: 'البخاري', title_ar: 'صحيح البخاري', compiler: 'البخاري', compilerDisplay: 'البخاري', compilerDeath: 256, aliases: ['ابو عبد الله', 'محمد بن اسماعيل'] },
  { code: 'muslim', edition: 'muslim', name_ar: 'مسلم', title_ar: 'صحيح مسلم', compiler: 'مسلم', compilerDisplay: 'مسلم', compilerDeath: 261, aliases: ['ابو الحسين', 'مسلم بن الحجاج'] },
  { code: 'abudawud', edition: 'abudawud', name_ar: 'أبو داود', title_ar: 'سنن أبي داود', compiler: 'ابو داود', compilerDisplay: 'أبو داود', compilerDeath: 275, aliases: ['سليمان بن الاشعث'] },
  { code: 'tirmidhi', edition: 'tirmidhi', name_ar: 'الترمذي', title_ar: 'جامع الترمذي', compiler: 'الترمذي', compilerDisplay: 'الترمذي', compilerDeath: 279, aliases: ['ابو عيسي', 'محمد بن عيسي'] },
  { code: 'nasai', edition: 'nasai', name_ar: 'النسائي', title_ar: 'سنن النسائي', compiler: 'النسايي', compilerDisplay: 'النسائي', compilerDeath: 303, aliases: ['ابو عبد الرحمن', 'احمد بن شعيب'] },
  { code: 'ibnmajah', edition: 'ibnmajah', name_ar: 'ابن ماجه', title_ar: 'سنن ابن ماجه', compiler: 'ابن ماجه', compilerDisplay: 'ابن ماجه', compilerDeath: 273, aliases: ['ابو عبد الله', 'محمد بن يزيد'] },
  // The Muwatta reaches us through Yahya al-Laythi: he is the root, Malik the first link ("حدثني يحيى عن مالك")
  { code: 'malik', edition: 'malik', name_ar: 'الموطأ', title_ar: 'موطأ مالك', compiler: 'يحيي بن يحيي الليثي', compilerDisplay: 'يحيى بن يحيى الليثي', compilerDeath: 234, aliases: ['يحيي', 'يحيي بن يحيي'] },
];
const compilerKeysOf = c => new Set([c.compiler, ...c.aliases]);
const CHUNK = 200;
const SHARDS = 64;
const PROPHET_YEAR = 11;
const YEARS_PER_LINK = 32; // used only when a chain has a single dated anchor

const log = (...m) => console.log('[build]', ...m);
const median = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ── 1. Load ─────────────────────────────────────────────────────────────────

async function fetchEdition(file) {
  const path = resolve(CACHE, file);
  try { await access(path); return JSON.parse(await readFile(path, 'utf8')); } catch {}
  log(`download ${file}`);
  const res = await fetch(`${CDN}/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const text = await res.text();
  await mkdir(CACHE, { recursive: true });
  await writeFile(path, text);
  return JSON.parse(text);
}

async function loadAll() {
  const hadiths = [];
  const sections = {};
  for (const c of COLLECTIONS) {
    const ara = await fetchEdition(`ara-${c.edition}.json`);
    const eng = await fetchEdition(`eng-${c.edition}.min.json`);
    const enByNum = new Map(eng.hadiths.map(h => [String(h.hadithnumber), h]));
    sections[c.code] = ara.metadata?.sections || {};
    for (const h of ara.hadiths) {
      const num = String(h.hadithnumber);
      const en = enByNum.get(num);
      hadiths.push({
        id: `${c.code}:${num}`, coll: c.code, num, sortKey: Number(h.hadithnumber),
        text: h.text || '', text_en: en?.text || '',
        grades: (h.grades || []).map(g => ({ name: g.name, grade: g.grade })),
        ref: h.reference ? { book: h.reference.book, hadith: h.reference.hadith } : null,
      });
    }
    log(`${c.code}: ${ara.hadiths.length} hadiths`);
  }
  return { hadiths, sections };
}

// ── 2. Parse ────────────────────────────────────────────────────────────────

function parseAll(hadiths) {
  const first = new Map();
  for (const h of hadiths) for (const k of parseIsnadGraph(h.text).nodes.keys()) { const w = k.split(' ')[0]; first.set(w, (first.get(w) || 0) + 1); }
  const nameStarts = new Set([...first].filter(([, n]) => n >= 3).map(([w]) => w));
  const keysByColl = Object.fromEntries(COLLECTIONS.map(c => [c.code, compilerKeysOf(c)]));
  for (const h of hadiths) {
    const g = parseIsnadGraph(h.text, nameStarts, { compilerKeys: keysByColl[h.coll] });
    h.graph = { nodes: g.nodes, edges: g.edges, reachesProphet: g.reachesProphet };
    h.isnad_ar = g.isnad_ar; h.matn_ar = g.matn_ar;
  }
  return nameStarts;
}

// ── 3. "بهذا الإسناد" → inherit the previous isnad ──────────────────────────

const REF_RE = /(?:بهذا الاسناد|بهذا الحديث|باسناده|باسناد|بالاسناد|في هذا الاسناد|^(?:،\s*)?(?:بمثله|مثله|نحوه|بمعناه|بمثل حديث|بنحو حديث|مثل حديث|نحو حديث|بمثل|بنحو|بهذا)(?= |$))/;
function inheritIsnads(hadiths) {
  let inherited = 0, inheritedAll = 0, inheritedHead = 0;
  const byColl = new Map();
  for (const h of hadiths) (byColl.get(h.coll) || byColl.set(h.coll, []).get(h.coll)).push(h);
  for (const list of byColl.values()) {
    list.sort((a, b) => a.sortKey - b.sortKey);
    for (let i = 1; i < list.length; i++) {
      const h = list[i], g = h.graph;
      if (g.reachesProphet) continue;
      // a) no isnad at all (fragment continuing the previous entry, "وبإسناده قال…"): take the previous isnad entirely
      if (!g.edges.length) {
        if (!h.text.trim()) continue;
        for (let back = 1; back <= 3 && i - back >= 0; back++) {
          const prev = list[i - back].graph;
          if (!prev.edges.length) continue;
          for (const [k, node] of prev.nodes) g.nodes.set(k, { ...node, depth: Infinity });
          for (const e of prev.edges) g.edges.push({ ...e, inherited: true });
          g.reachesProphet = prev.reachesProphet;
          g.inheritedAll = true;
          inheritedAll++;
          break;
        }
        continue;
      }
      // c) "قال عروة: ولقد حدثتني عائشة…": a suspended start whose speaker sits in the previous isnad → attach it there
      const rootQuotes = g.edges.filter(e => e.student === null && (e.type === 'quote'));
      if (rootQuotes.length && rootQuotes.length === g.edges.filter(e => e.student === null).length) {
        let done = false;
        for (let back = 1; back <= 3 && i - back >= 0 && !done; back++) {
          const prev = list[i - back].graph;
          for (const rq of rootQuotes) {
            if (!prev.nodes.has(rq.teacher)) continue;
            // ancestors of the speaker in the previous isnad (path from its ROOT down to the speaker)
            const stack = [rq.teacher], seen = new Set(), picked = [];
            while (stack.length) {
              const k = stack.pop(); if (seen.has(k)) continue; seen.add(k);
              for (const e of prev.edges) if (e.teacher === k) { picked.push(e); if (e.student !== null) stack.push(e.student); }
            }
            if (!picked.length) continue;
            for (const e of picked) { if (e.student !== null && !g.nodes.has(e.student)) g.nodes.set(e.student, { ...prev.nodes.get(e.student), depth: Infinity }); g.edges.push({ ...e, inherited: true }); }
            g.edges = g.edges.filter(e => e !== rq);
            inheritedHead++; done = true;
          }
        }
        if (done) continue;
      }
      // b) "… عن الأعمش بهذا الإسناد": complete the tail from the previous isnad
      const around = cleanName(h.isnad_ar.slice(-50)) + ' ‖ ' + cleanName(h.matn_ar.slice(0, 50));
      if (!REF_RE.test(around.split(' ‖ ')[1]) && !/(?:بهذا الاسناد|بهذا الحديث|باسناده|بالاسناد)/.test(around)) continue;
      // leaves of the current graph
      const hasTeacher = new Set(g.edges.map(e => e.student));
      const leaves = [...g.nodes.keys()].filter(k => !hasTeacher.has(k));
      for (let back = 1; back <= 6 && i - back >= 0; back++) {
        const prev = list[i - back].graph;
        const anchor = leaves.find(l => prev.nodes.has(l));
        if (!anchor) continue;
        // copy the sub-graph below `anchor` from prev
        const stack = [anchor], seen = new Set();
        while (stack.length) {
          const k = stack.pop(); if (seen.has(k)) continue; seen.add(k);
          for (const e of prev.edges) if (e.student === k) {
            if (!g.nodes.has(e.teacher)) g.nodes.set(e.teacher, { ...prev.nodes.get(e.teacher), depth: Infinity });
            g.edges.push({ ...e, inherited: true });
            stack.push(e.teacher);
          }
        }
        g.reachesProphet = prev.reachesProphet;
        inherited++;
        break;
      }
    }
  }
  return { inherited, inheritedAll, inheritedHead };
}

// ── 4/5. Name resolution ────────────────────────────────────────────────────

const SHORT = k => !k.includes(' بن ') && !k.includes('@');

// depth of every node from the compiler (0 = the compiler's direct source)
const depthsOf = g => { const adj = new Map(); for (const e of g.edges) { const s = e.student ?? '∅'; (adj.get(s) || adj.set(s, []).get(s)).push(e.teacher); } const d = new Map([['∅', -1]]); const q = ['∅']; while (q.length) { const k = q.shift(); for (const t of adj.get(k) || []) if (!d.has(t)) { d.set(t, d.get(k) + 1); q.push(t); } } return d; };
// a companion cannot stand within two links of the compiler, a successor cannot be his direct source
const LAYER_MID = { 1: 55, 2: 90, 3: 110, 4: 130, 5: 145, 6: 150, 7: 170, 8: 190, 9: 215, 10: 235, 11: 255, 12: 280 };
/**
 * r: { gen, death, layer } of the candidate person; depth from the compiler; deaths of his would-be students and teachers when known.
 * A link rarely spans more than ~65 years; a student seldom dies long before his teacher.
 */
const plausibleAt = (r, depth, compilerDeath = null, studentDeaths = [], teacherDeaths = []) => {
  if (!r || depth == null) return true;
  if (r.gen === 'sahabi' && depth <= 2) return false;
  if (r.gen === 'tabii' && depth <= 0) return false;
  const death = r.death ?? (r.layer ? LAYER_MID[r.layer] : null);
  if (death == null) return true;
  if (compilerDeath && death < compilerDeath - 55 * (depth + 1) - 20) return false;
  for (const sd of studentDeaths) if (death < sd - 70 || death > sd + 15) return false;
  for (const td of teacherDeaths) if (death > td + 90 || death < td - 15) return false;
  return true;
};

function resolveNames(hadiths, ref = new Map(), rijal = [], fullest = new Map()) {
  const base = k => k.replace(/#\d+$/, '');
  const RANK = { sahabi: 0, tabii: 1, muhaddith: 2, rijal: 2 };
  // a companion cannot stand within two links of the compiler, a successor cannot be his direct source
  let compilerDeath = null; // set per hadith
  const deathOfKey = k => { if (!k || k.includes('@') || k.startsWith('ROOT:')) return null; const r = ref.get(k); return r?.death ?? null; };
  const plausible = (full, depth, students = [], teachers = []) => plausibleAt(ref.get(full), depth, compilerDeath, students.map(deathOfKey).filter(x => x != null), teachers.map(deathOfKey).filter(x => x != null));
  // genealogies from the rijāl books: "عمر بن الخطاب" → "عمر بن الخطاب بن نفيل بن عبد العزى…"
  const nasab = new Map(); // "X بن Y" → [{ words, layer, death }]
  for (const t of rijal) { const w = cleanName(t.name).split(' '); const i = w.indexOf('بن'); if (i !== 1 || w.length < 3) continue; const k = w.slice(0, 3).join(' '); (nasab.get(k) || nasab.set(k, []).get(k)).push({ words: w, layer: t.layer || null, death: t.death ?? null }); }
  const layerGen = l => l === 1 ? 'sahabi' : l <= 5 ? 'tabii' : 'muhaddith';
  const trimName = w => { const out = w.slice(0, 4); while (out.length > 1 && /^(?:بن|بنت|ابي|ابو|عبد|عبيد|ام|ابن)$/.test(out[out.length - 1])) out.pop(); return out.join(' '); };
  // bare name + its neighbours → the person of the rijāl books whose teachers/students include those neighbours ("حدثنا عمر، حدثنا أبي" → عمر بن حفص بن غياث)
  const rijalByHead = new Map();
  const taqByName = new Map(); // 3–6 first words of a Taqrīb name → [{ layer, death }] (used only when unique)
  for (const t of rijal) if (t.layer || t.death != null) { const w = cleanName(t.name).split(' '); for (let n = 3; n <= Math.min(6, w.length); n++) { const k = w.slice(0, n).join(' '); (taqByName.get(k) || taqByName.set(k, []).get(k)).push({ layer: t.layer || null, death: t.death != null ? taqribDeath(t, null) : null }); } }
  const taqInfo = w => { for (let n = Math.min(6, w.length); n >= 3; n--) { const l = taqByName.get(w.slice(0, n).join(' ')); if (l && l.length === 1) return l[0]; if (l && l.length > 1) return {}; } return {}; };
  for (const t of rijal) {
    if (!t.teachers || (!t.teachers.length && !t.students.length)) continue;
    const name = cleanName(t.name); const w = name.split(' '); if (w.length < 2) continue;
    const tq = taqInfo(w);
    (rijalByHead.get(w[0]) || rijalByHead.set(w[0], []).get(w[0])).push({ name, words: w, layer: t.layer || tq.layer || null, death: tq.death ?? null, teachers: t.teachers.map(cleanName).filter(Boolean), students: t.students.map(cleanName).filter(Boolean) });
  }
  const compilerKey = { bukhari: 'البخاري', muslim: 'مسلم', abudawud: 'ابو داود', tirmidhi: 'الترمذي', nasai: 'النسايي', ibnmajah: 'ابن ماجه', malik: 'مالك' };
  const prefixOf = (a, b) => { const x = a.split(' '), y = b.split(' '); if (x.length < 2 || y.length < 2) return false; const n = Math.min(x.length, y.length); for (let i = 0; i < n; i++) if (x[i] !== y[i]) return false; return true; };
  const GENERIC = new Set(['المدني', 'المكي', 'الكوفي', 'البصري', 'الشامي', 'المصري', 'البغدادي', 'الواسطي', 'الدمشقي', 'الحمصي', 'اليماني', 'الخراساني', 'النيسابوري', 'المروزي', 'الرازي', 'الحافظ', 'الامام', 'الفقيه', 'القاضي', 'الاعمي', 'الضرير', 'الاصل', 'الكبير', 'الصغير', 'المولي', 'الحجازي', 'العراقي', 'الجزري', 'الرقي', 'الحراني', 'البلخي', 'الهروي', 'السجستاني', 'الطايفي', 'الانصاري', 'القرشي', 'الهاشمي', 'الاموي', 'التميمي', 'الازدي', 'الثقفي', 'المخزومي', 'الزهري', 'العدوي', 'الاسدي', 'الكندي', 'الهمداني', 'النخعي', 'السلمي', 'الجهني', 'الليثي', 'الخزاعي', 'الاشعري', 'الاعرج', 'الاعور', 'الطويل', 'القصير', 'الاحول', 'الاسود', 'الله', 'الرحمن']);
  const distinctive = nm => nm.split(' ').filter(w => w.startsWith('ال') && w.length >= 5 && !GENERIC.has(w));
  const ibnOf = nm => { const w = nm.split(' '); if (w[0] === 'ابن' && w.length >= 2) return w.slice(1).join(' '); const i = w.indexOf('بن'); return i > 0 ? w.slice(i + 1).join(' ') : null; };
  const sameName = (a, b) => a === b || prefixOf(a, b) || distinctive(a).some(w => b.split(' ').includes(w)) || (a.startsWith('ابن ') && ibnOf(b) != null && (ibnOf(b) === ibnOf(a) || ibnOf(b).startsWith(ibnOf(a) + ' '))) || (b.startsWith('ابن ') && ibnOf(a) != null && (ibnOf(a) === ibnOf(b) || ibnOf(a).startsWith(ibnOf(b) + ' ')));
  const rijalByWord = new Map(); // distinctive nisba/laqab → entries
  const entryCache = new Map();
  for (const l of rijalByHead.values()) for (const c of l) for (const d of distinctive(c.name)) (rijalByWord.get(d) || rijalByWord.set(d, []).get(d)).push(c);
  const viaRijal = (bare, students, teachers, depth, relTeachers = []) => {
    const cands = rijalByHead.get(bare); if (!cands) return null;
    const st = students.map(x => x.startsWith('ROOT:') ? compilerKey[x.slice(5)] : x).filter(x => x && !x.includes('@'));
    const te = teachers.filter(x => !x.includes('@'));
    const rels = teachers.filter(x => x.includes('@')).map(x => x.split('@')[0]);
    if (!st.length && !te.length && !rels.length) return null;
    // symmetric evidence: the neighbour's own notice names the candidate ("الحميدي: روى عن سفيان بن عيينة")
    const entriesOf = key => {
      if (entryCache.has(key)) return entryCache.get(key);
      const w = key.split(' '); const cs = rijalByHead.get(w[0]) || [];
      let found = cs.filter(c => c.name === key || c.name.startsWith(key + ' '));
      if (!found.length) found = cs.filter(c => sameName(key, c.name));
      if (!found.length) for (const d of distinctive(key)) for (const c of rijalByWord.get(d) || []) if (sameName(key, c.name) && !found.includes(c)) found.push(c); // "الحميدي عبد الله بن الزبير" → عبد الله بن الزبير … الحميدي
      entryCache.set(key, found); return found;
    };
    const namedBy = (key, side, c) => entriesOf(key).some(x => (side === 'student' ? x.teachers : x.students).some(y => sameName(c.name, y) || prefixOf(y, c.name)));
    const fatherEntry = c => { const i = c.words.indexOf('بن'); if (i < 0) return null; const fw = c.words.slice(i + 1); const cs = rijalByHead.get(fw[0]) || []; return cs.find(x => x.words.slice(0, Math.min(fw.length, 4)).join(' ') === fw.slice(0, Math.min(fw.length, 4)).join(' ')) || null; };
    const scored = cands.map(c => { let n = 0; for (const x of st) { if (c.students.some(y => sameName(x, y))) n++; if (x.includes(' ') && namedBy(x, 'student', c)) n++; } for (const x of te) { if (c.teachers.some(y => sameName(x, y))) n++; if (x.includes(' ') && namedBy(x, 'teacher', c)) n++; } for (const r of rels) if (c.teachers.includes(r)) n++; if (rels.includes('ابيه') && relTeachers.length) { const f = fatherEntry(c); if (f) for (const x of relTeachers) if (f.teachers.some(y => sameName(x, y))) n += 2; } return [c, n]; }).filter(([c, n]) => n > 0 && plausibleAt({ gen: c.layer === 1 ? 'sahabi' : c.layer && c.layer <= 5 ? 'tabii' : 'muhaddith', death: c.death, layer: c.layer }, depth, compilerDeath, st.map(deathOfKey).filter(x => x != null), te.map(deathOfKey).filter(x => x != null))).sort((a, b) => b[1] - a[1]);
    if (process.env.DEBUG_BARE && bare === process.env.DEBUG_BARE) console.log('[viaRijal]', bare, JSON.stringify({ st, te, rels, depth, compilerDeath }), scored.slice(0, 4).map(([c, n]) => `${c.name.slice(0, 30)}:${n}:L${c.layer}:d${c.death}`).join(' | '));
    if (!scored.length) return null;
    if (scored.length > 1 && scored[0][1] === scored[1][1]) return null;
    const w = scored[0][0].words;
    for (let n = Math.min(w.length, 5); n >= 2; n--) { const k = w.slice(0, n).join(' '); if (freq.has(k) && k.includes(' بن ')) return k; }
    return trimName(w);
  };
  /** Father (gen = 1) or grandfather (gen = 2) of `full` from the genealogies, or null when unknown / ambiguous. */
  const viaNasab = (full, gen) => {
    const w = full.split(' '); if (w.indexOf('بن') !== 1 || w.length < 3) return null;
    let c = (nasab.get(w.slice(0, 3).join(' ')) || []).filter(x => x.words.slice(0, w.length).join(' ') === full);
    const r = ref.get(full);
    if (r && c.length > 1) {
      c = c.filter(x => (!x.layer || layerGen(x.layer) === r.gen) && (x.death == null || r.death == null || Math.abs(x.death - r.death) <= 5 || Math.abs(x.death + 100 - r.death) <= 5));
      const strong = c.filter(x => x.layer || x.death != null); if (strong.length) c = strong;
    }
    const fathers = new Set();
    for (const x of c) { let idx = -1; for (let n = 0; n < gen; n++) { idx = x.words.indexOf('بن', idx + 1); if (idx < 0) break; } if (idx < 0 || idx + 1 >= x.words.length) continue; fathers.add(trimName(x.words.slice(idx + 1))); }
    return fathers.size === 1 ? [...fathers][0] : null;
  };
  // frequency of every key, display forms, expansions: first token → full keys
  const freq = new Map(), displays = new Map();
  for (const h of hadiths) for (const [k0, node] of h.graph.nodes) {
    const k = base(k0);
    freq.set(k, (freq.get(k) || 0) + 1);
    const d = displays.get(k) || displays.set(k, new Map()).get(k);
    d.set(node.display, (d.get(node.display) || 0) + 1);
  }
  const displayOf = k => { const d = displays.get(k); return d ? [...d].sort((a, b) => b[1] - a[1])[0][0] : k; };
  const fullByHead = new Map();
  for (const [k, n] of freq) {
    if (k.includes('@') || !k.includes(' بن ') || k.startsWith('ابن ')) continue;
    const head = k.split(' بن ')[0];
    (fullByHead.get(head) || fullByHead.set(head, []).get(head)).push([k, n]);
  }
  const dominant = head => {
    const c = fullByHead.get(head); if (!c) return null;
    c.sort((a, b) => b[1] - a[1]);
    const tot = c.reduce((s, x) => s + x[1], 0);
    return c[0][1] >= 3 && c[0][1] / tot >= 0.6 ? c[0][0] : null;
  };
  const fatherOf = full => { const p = full.split(' '); const i = p.indexOf('بن'); return i > 0 && i + 1 < p.length ? p.slice(i + 1).join(' ') : null; };

  // short names → full form sharing a neighbour (student or teacher)
  const byPair = new Map();
  const bump = (key, full) => { const m = byPair.get(key) || byPair.set(key, new Map()).get(key); m.set(full, (m.get(full) || 0) + 1); };
  for (const h of hadiths) for (const e of h.graph.edges) {
    const s = e.student == null ? `ROOT:${h.coll}` : base(e.student);
    const t = base(e.teacher);
    if (t.includes(' بن ') && !t.startsWith('ابن ')) bump(`${t.split(' بن ')[0]}|s|${s}`, t);
    if (e.student != null && s.includes(' بن ') && !s.startsWith('ابن ')) bump(`${s.split(' بن ')[0]}|t|${t}`, s);
  }
  const pick = m => { if (!m) return null; const arr = [...m].sort((a, b) => b[1] - a[1]); const tot = arr.reduce((s, x) => s + x[1], 0); return arr[0][1] >= 2 && arr[0][1] / tot >= 0.7 ? arr[0][0] : null; };

  let shortExpanded = 0, shortTotal = 0, relResolved = 0, relTotal = 0, viaBooks = 0;
  for (const h of hadiths) {
    const g = h.graph;
    const rename = new Map();
    const depths = depthsOf(g);
    compilerDeath = COLLECTIONS.find(c => c.code === h.coll)?.compilerDeath || null;
    // a) short names
    for (const k0 of g.nodes.keys()) {
      const k = base(k0);
      if (k.includes('@') || !SHORT(k) || k.startsWith('ابن ') || k.startsWith('ابو ') || k.startsWith('ام ')) { if (k0 !== k) rename.set(k0, k); continue; }
      shortTotal++;
      const students = g.edges.filter(e => e.teacher === k0).map(e => e.student == null ? `ROOT:${h.coll}` : base(e.student));
      const teachers = g.edges.filter(e => e.student === k0).map(e => base(e.teacher));
      let full = null;
      const depth = depths.get(k0);
      for (const s of students) { full = pick(byPair.get(`${k}|s|${s}`)); if (full && !plausible(full, depth, students, teachers)) full = null; if (full) break; }
      if (!full) for (const t of teachers) { full = pick(byPair.get(`${k}|t|${t}`)); if (full && !plausible(full, depth, students, teachers)) full = null; if (full) break; }
      if (!full) { const relTeachers = teachers.filter(t => t.includes('@')).flatMap(t => g.edges.filter(e => e.student && base(e.student) === t).map(e => base(e.teacher)).filter(x => !x.includes('@'))); full = viaRijal(k, students, teachers, depth, relTeachers); if (full && !plausible(full, depth, students, teachers)) full = null; if (full) viaBooks++; }
      if (full) { rename.set(k0, full); shortExpanded++; } else if (k0 !== k) rename.set(k0, k);
    }
    // b) relatives, using the expanded base when available
    for (const k0 of g.nodes.keys()) {
      if (!k0.includes('@')) continue;
      relTotal++;
      const [rel, b0] = k0.split('@');
      let b = rename.get(b0) || rename.get(base(b0)) || base(b0);
      const bDepth = depths.get(b0);
      if (fullest.has(b) && plausible(fullest.get(b), bDepth)) b = fullest.get(b); // "ابن عمر" → عبد الله بن عمر
      let target = null;
      const fullOf = x => { if (x.includes(' بن ')) return x; const d = dominant(x); return d && plausible(d, bDepth) ? d : null; };
      // the fullest form of the father: the genealogy of the rijāl books first, then the corpus
      const bestKey = nm => { if (!nm) return null; const w = nm.split(' '); for (let n = w.length; n >= 2; n--) { const k = w.slice(0, n).join(' '); if (freq.has(k)) return k; } return freq.has(nm) ? nm : trimName(w); };
      if (rel === 'ابيه' || rel === 'ابيها') {
        if (b.startsWith('ابن ')) target = b.slice(4);
        else { const full = fullOf(b); target = full ? (bestKey(viaNasab(full, 1)) || fatherOf(full)) : null; }

      } else if (rel === 'جده' || rel === 'جدها') {
        const full = fullOf(b);
        const viaBooks = full ? bestKey(viaNasab(full, 2)) : null;
        if (viaBooks) target = viaBooks;
        else { const f = full ? fatherOf(full) : null; const ff = f ? (f.includes(' بن ') ? f : dominant(f)) : null; target = ff ? fatherOf(ff) : null; }
      }
      if (target) target = cleanName(target) || null;
      if (target) { rename.set(k0, target); relResolved++; }
      else if (b !== b0) rename.set(k0, `${rel}@${b}`);
    }
    if (process.env.DEBUG_H === h.id) console.log('[resolveNames]', h.id, 'nodes', [...g.nodes.keys()].join(' | '), '| depths', JSON.stringify([...depths]), '| rename', JSON.stringify([...rename]));
    if (!rename.size) continue;
    const nodes = new Map();
    for (const [k, node] of g.nodes) {
      const nk = rename.get(k) || k;
      if (!nodes.has(nk)) nodes.set(nk, { ...node, key: nk, display: rename.has(k) && !nk.includes('@') && nk !== base(k) ? displayOf(nk) : node.display });
    }
    for (const e of g.edges) { if (rename.has(e.student)) e.student = rename.get(e.student); if (rename.has(e.teacher)) e.teacher = rename.get(e.teacher); }
    g.edges = g.edges.filter((e, i, arr) => e.student !== e.teacher && arr.findIndex(x => x.student === e.student && x.teacher === e.teacher) === i);
    g.nodes = nodes;
  }
  // second pass: names expanded above now feed the neighbour statistics, so the remaining bare names can follow them
  {
    byPair.clear();
    for (const h of hadiths) for (const e of h.graph.edges) {
      const s = e.student == null ? `ROOT:${h.coll}` : base(e.student);
      const t = base(e.teacher);
      if (t.includes(' بن ') && !t.startsWith('ابن ')) bump(`${t.split(' بن ')[0]}|s|${s}`, t);
      if (e.student != null && s.includes(' بن ') && !s.startsWith('ابن ')) bump(`${s.split(' بن ')[0]}|t|${t}`, s);
    }
    let second = 0;
    for (const h of hadiths) {
      const g = h.graph;
      const depths = depthsOf(g);
      compilerDeath = COLLECTIONS.find(c => c.code === h.coll)?.compilerDeath || null;
      const rename = new Map();
      for (const k0 of g.nodes.keys()) {
        const k = base(k0);
        if (k.includes('@') || !SHORT(k) || k.startsWith('ابن ') || k.startsWith('ابو ') || k.startsWith('ام ')) continue;
        const students = g.edges.filter(e => e.teacher === k0).map(e => e.student == null ? `ROOT:${h.coll}` : base(e.student));
        const teachers = g.edges.filter(e => e.student === k0).map(e => base(e.teacher));
        let full = null;
        for (const st of students) { full = pick(byPair.get(`${k}|s|${st}`)); if (full && !plausible(full, depths.get(k0), students, teachers)) full = null; if (full) break; }
        if (!full) for (const t of teachers) { full = pick(byPair.get(`${k}|t|${t}`)); if (full && !plausible(full, depths.get(k0), students, teachers)) full = null; if (full) break; }
        if (full) rename.set(k0, full);
      }
      if (!rename.size) continue;
      second += rename.size;
      const nodes = new Map();
      for (const [k, node] of g.nodes) { const nk = rename.get(k) || k; if (!nodes.has(nk)) nodes.set(nk, { ...node, key: nk, display: rename.has(k) ? displayOf(nk) : node.display }); }
      for (const e of g.edges) { if (rename.has(e.student)) e.student = rename.get(e.student); if (rename.has(e.teacher)) e.teacher = rename.get(e.teacher); }
      g.edges = g.edges.filter((e, i, arr) => e.student !== e.teacher && arr.findIndex(x => x.student === e.student && x.teacher === e.teacher) === i);
      g.nodes = nodes;
    }
    shortExpanded += second;
  }
  return { relResolved, relTotal, shortExpanded, shortTotal, viaBooks };
}

// ── 6. Entities ─────────────────────────────────────────────────────────────

/**
 * A bare given name ("عمر", "مالك") is accepted as an alias of a reference person only when the corpus itself says so:
 * the dominant full form "X بن …" is that person's, or the bare form mostly sits next to the same narrators as his full forms.
 */
function bareAliasCheck(hadiths, rijal = []) {
  const base = k => k.replace(/#\d+$/, '');
  const byHead = new Map(), nb = new Map();
  const add = (m, k, v) => { const x = m.get(k) || m.set(k, new Map()).get(k); x.set(v, (x.get(v) || 0) + 1); };
  for (const h of hadiths) {
    for (const k0 of h.graph.nodes.keys()) { const k = base(k0); if (k.includes(' بن ') && !k.startsWith('ابن ')) add(byHead, k.split(' ')[0], k); }
    for (const e of h.graph.edges) { if (e.student == null) continue; const a = base(e.student), b = base(e.teacher); add(nb, a, b); add(nb, b, a); }
  }
  const rijalByName = new Map();
  for (const t of rijal) { if (!t.teachers?.length && !t.students?.length) continue; rijalByName.set(cleanName(t.name), [...t.teachers, ...t.students].map(cleanName)); }
  const prefixOf = (a, b) => { const x = a.split(' '), y = b.split(' '); if (x.length < 2 || y.length < 2) return false; const n = Math.min(x.length, y.length); for (let i = 0; i < n; i++) if (x[i] !== y[i]) return false; return true; };
  return (bare, fullNames) => {
    const mine = nb.get(bare); if (!mine) return { ok: true, why: 'unused' };
    const tot = [...mine.values()].reduce((s, n) => s + n, 0); if (tot < 3) return { ok: true, why: 'rare' };
    // a competitor: another person "bare بن …" of the corpus who keeps the same company as the bare form
    const forms = byHead.get(bare) || new Map();
    for (const [form, occ] of forms) {
      if (occ < 3 || fullNames.some(f => form === f || form.startsWith(f + ' ') || f.startsWith(form + ' '))) continue;
      const theirs = nb.get(form); if (!theirs) continue;
      let shared = 0; for (const [k, n] of mine) if (theirs.has(k)) shared += n;
      if (shared / tot >= 0.15) return { ok: false, why: `${Math.round(100 * shared / tot)}% of its company is that of ${form}` };
    }
    return { ok: true, why: 'no competitor' };
  };
}

function loadReferences(bareOk = () => ({ ok: true })) {
  const ref = new Map();   // key → { death, gen, origin, latin, reliability, source }
  const canon = new Map(); // alias key → canonical key (same person)
  const byPerson = new Map();
  const rejected = [];
  const fullest = new Map(); // any name of a reference person → his fullest "X بن Y…" name
  const isBare = k => !/ /.test(k) && !/^(?:ال|ابو|ابن|ام)/.test(k);
  for (const [k, r] of loadReference()) {
    const key = cleanName(k);
    ref.set(key, { death: r.death_ah, gen: r.generation, origin: r.origin, latin: r.name_latin, reliability: r.reliability, source: 'reference' });
    const pid = `${r.name_latin}|${r.death_ah}`; // the legacy list repeats a person under several names
    if (byPerson.has(pid)) canon.set(key, byPerson.get(pid)); else byPerson.set(pid, key);
  }
  for (const e of EXTRA_NARRATORS) {
    let names = e.names.filter(nm => !e.ambiguous?.includes(nm)).map(cleanName);
    const fulls = names.filter(k => !isBare(k));
    names = names.filter(k => { if (!isBare(k) || !fulls.length) return true; const r = bareOk(k, fulls); if (!r.ok) rejected.push(`${k} (${e.latin}: ${r.why})`); return r.ok; });
    if (!names.length) continue;
    { const longest = [...names].filter(k => k.includes(' بن ')).sort((a, b) => b.length - a.length)[0]; if (longest) for (const k of e.names.map(cleanName)) fullest.set(k, longest); }
    // the canonical key is the fullest name ("عمر بن الخطاب"), never a bare given name ("عمر")
    let main = names.find(k => canon.has(k) || byPerson.has(`${e.latin}|${e.death}`)) ;
    main = main ? (canon.get(main) || main) : ([...names].filter(k => !isBare(k)).sort((a, b) => b.length - a.length)[0] || names[0]);
    for (const k of names) {
      if (!ref.has(k) || ref.get(k).source === 'reference') ref.set(k, { death: e.death, gen: e.gen, origin: e.origin, latin: e.latin, reliability: ref.get(k)?.reliability || ref.get(main)?.reliability || null, source: 'reference' });
      if (k !== main) canon.set(k, main);
    }
  }
  // a bare given name never stays the canonical key of a person who has a fuller name ("عمر" from the legacy list → "عمر بن الخطاب")
  for (const K of [...new Set([...canon.values(), ...ref.keys()])]) {
    if (!isBare(K)) continue;
    const aliases = [...canon].filter(([, t]) => t === K).map(([a]) => a);
    const fuller = aliases.filter(a => a.includes(' بن ')).sort((a, b) => b.length - a.length)[0] || (fullest.get(K) && fullest.get(K) !== K ? fullest.get(K) : null);
    if (!fuller) continue;
    for (const a of aliases) canon.set(a, fuller);
    canon.delete(fuller);
    if (!ref.has(fuller) && ref.has(K)) ref.set(fuller, ref.get(K));
    const r = bareOk(K, [fuller]);
    if (r.ok) canon.set(K, fuller); else { canon.delete(K); ref.delete(K); rejected.push(`${K} (${r.why})`); }
  }
  if (rejected.length) log(`bare aliases rejected by the corpus: ${rejected.join(' | ')}`);
  return { ref, canon, fullest };
}

function buildEntities(hadiths, ref, canon) {
  const ents = new Map(); // key → entity
  const get = key0 => {
    const key = canon.get(key0) || key0;
    let e = ents.get(key);
    if (!e) { e = { key, displays: new Map(), count: 0, colls: new Set(), estimates: [], depths: [], votes: { sahabi: 0, tabii: 0, muhaddith: 0 }, hadiths: [] }; ents.set(key, e); }
    return e;
  };
  // compilers
  for (const c of COLLECTIONS) { const e = get(c.compiler); e.compiler = c.code; e.displays.set(c.compilerDisplay, 1e9); }
  for (const h of hadiths) {
    const g = h.graph;
    for (const [k, node] of g.nodes) {
      const e = get(k);
      e.count++; e.colls.add(h.coll); e.hadiths.push(h.id);
      let d = node.display.replace(/^(?:أبي|أبا)(?= )/, 'أبو').replace(/^(?:ابي|ابا)(?= )/, 'أبو');
      if (k.includes('@')) {
        const [rel, b] = k.split('@');
        const bd = ents.get(b)?.displays.size ? [...ents.get(b).displays].sort((x, y) => y[1] - x[1])[0][0] : b;
        d = ({ حماته: 'حماة', ابيه: 'والد', ابيها: 'والد', جده: 'جدّ', جدها: 'جدّ', امه: 'والدة', امها: 'والدة', عمه: 'عمّ', عمته: 'عمّة', خاله: 'خال', خالته: 'خالة', اخيه: 'أخو', اخته: 'أخت', مولاه: 'مولى', مولاته: 'مولاة', ابنه: 'ابن', ابنته: 'ابنة', زوجه: 'زوج', زوجته: 'زوجة', جدته: 'جدّة', اخيها: 'أخو' }[rel] || rel) + ' ' + bd;
      }
      e.displays.set(d, (e.displays.get(d) || 0) + 1);
    }
    if (g.edges.length) { const ce = get(COLLECTIONS.find(c => c.code === h.coll).compiler); if (!ce.hadiths.includes(h.id)) ce.hadiths.push(h.id); }
  }
  // reference enrichment
  for (const e of ents.values()) {
    const r = ref.get(e.key);
    if (r) { e.death = r.death; e.gen = r.gen === 'rijal' ? 'muhaddith' : r.gen; e.origin = r.origin || null; e.latin = r.latin || null; e.reliability = r.reliability || null; e.dated = 'reference'; }
    if (e.compiler) { const c = COLLECTIONS.find(c => c.code === e.compiler); e.death = c.compilerDeath; e.gen = 'muhaddith'; e.dated = 'reference'; }
  }
  return ents;
}

// ── 7. Dating & layers ──────────────────────────────────────────────────────

const anchored = e => e.death != null && (e.dated === 'reference' || e.dated === 'taqrib' || e.dated === 'rijal');
function dateAndClassify(hadiths, ents) {
  for (const e of ents.values()) { e.estimates = []; e.depths = []; e.votes = { sahabi: 0, tabii: 0, muhaddith: 0 }; e.teacherRefGens = new Set(); if (!anchored(e) && e.dated !== 'reference') { if (e.dated === 'estimated') e.dated = null; } }
  for (const h of hadiths) {
    const g = h.graph; if (!g.edges.length) continue;
    const c = COLLECTIONS.find(c => c.code === h.coll);
    // depth from ROOT
    const adj = new Map();
    for (const e of g.edges) { const s = e.student ?? '∅'; (adj.get(s) || adj.set(s, []).get(s)).push(e.teacher); }
    const depth = new Map([['∅', 0]]);
    const q = ['∅'];
    while (q.length) { const k = q.shift(); for (const t of adj.get(k) || []) if (!depth.has(t)) { depth.set(t, depth.get(k) + 1); q.push(t); } }
    const hasTeacher = new Set(g.edges.map(e => e.student));
    const leaves = [...g.nodes.keys()].filter(k => !hasTeacher.has(k) && depth.has(k));
    const maxDepth = Math.max(...depth.values());

    // anchors: ROOT (compiler) + every reference-dated node
    const anchors = [[0, c.compilerDeath]];
    for (const [k, d] of depth) { if (k === '∅') continue; const e = ents.get(k); if (e && anchored(e)) anchors.push([d, e.death]); }
    if (g.reachesProphet) anchors.push([maxDepth + 1, PROPHET_YEAR + 30]); // a companion typically outlived the Prophet by decades; soft anchor
    anchors.sort((a, b) => a[0] - b[0]);

    for (const ed of g.edges) {
      if (!ed.student) continue;
      const t = ents.get(ed.teacher), st = ents.get(ed.student);
      if (t && st && (t.dated === 'reference' || t.genFixed)) (st.teacherRefGens ||= new Set()).add(t.gen);
    }
    for (const [k, d] of depth) {
      if (k === '∅') continue;
      const e = ents.get(k);
      if (!e) { (dateAndClassify.missing ||= new Map()).set(k, h.id); continue; }
      (e.depths ||= []).push(d);
      if (anchored(e)) continue;
      // nearest anchors above (smaller depth) and below (greater depth)
      let up = null, down = null;
      for (const a of anchors) { if (a[0] < d) up = a; else if (a[0] > d && !down) down = a; }
      let est;
      if (up && down) est = up[1] + (down[1] - up[1]) * (d - up[0]) / (down[0] - up[0]);
      else if (up) est = up[1] - YEARS_PER_LINK * (d - up[0]);
      else est = down[1] + YEARS_PER_LINK * (down[0] - d);
      e.estimates.push(Math.max(PROPHET_YEAR, Math.round(est)));
      // structural layer votes
      if (g.reachesProphet && leaves.includes(k)) e.votes.sahabi++;
      else if (g.reachesProphet && g.edges.some(x => x.student === k && leaves.includes(x.teacher))) e.votes.tabii++;
      else if (d <= 2) e.votes.muhaddith++;
    }
  }
  for (const e of ents.values()) {
    if (anchored(e)) continue;
    if (e.estimates.length) { e.death = Math.round(median(e.estimates)); e.dated = 'estimated'; }
    if (e.genFixed) continue; // layer given by Taqrīb al-Tahdhīb
    const v = e.votes; const best = Object.entries(v).sort((a, b) => b[1] - a[1])[0];
    e.gen = best && best[1] > 0 ? best[0] : (e.death && e.death < 150 ? 'tabii' : 'muhaddith'); // the date alone never makes a companion
    // an estimated date that contradicts the structural layer wins
    if (e.gen === 'sahabi' && e.death > 115) e.gen = e.death > 200 ? 'muhaddith' : 'tabii';
    if (e.gen === 'tabii' && e.death > 200) e.gen = 'muhaddith';
    // whoever narrates from a known successor cannot be a companion; from a known muhaddith, not a successor
    const RANK = { sahabi: 0, tabii: 1, muhaddith: 2, rijal: 2 };
    const teacherRank = Math.max(-1, ...[...(e.teacherRefGens || [])].map(g => RANK[g] ?? -1));
    const required = teacherRank >= 2 ? 2 : teacherRank >= 0 ? 1 : 0; // from a companion or a successor → at least a successor; from a muhaddith → a muhaddith
    if (RANK[e.gen] < required) e.gen = required === 1 ? 'tabii' : 'muhaddith';
  }
}

// ── 7b. Kind of report (classical terminology) ──────────────────────────────
// marfu  : the chain ends at the Prophet ﷺ
// mawquf : it stops at a companion (his word or deed)
// maqtu  : it stops at a successor (tabi'i)
// balagh : "بلغه أنّ…" — a report reaching the compiler without chain (Muwatta)
// ray    : opinion / later narrator's statement
const BALAGH_RE = /^(?:،\s*)?(?:انه بلغه|بلغه ان|بلغني|بلغنا|انه سمع من يقول|انه سمع اهل العلم)/;
function classify(h, ents) {
  const g = h.graph;
  if (h.noText) return null;
  if (g.reachesProphet) return 'marfu';
  const matn = cleanName(h.matn_ar.slice(0, 60));
  if (BALAGH_RE.test(matn)) return 'balagh';
  const hasTeacher = new Set(g.edges.map(e => e.student));
  const leaves = [...g.nodes.keys()].filter(k => !hasTeacher.has(k));
  const gens = leaves.map(k => ents.get(k)?.gen).filter(Boolean);
  if (gens.includes('sahabi')) return 'mawquf';
  if (gens.includes('tabii')) return 'maqtu';
  return 'ray';
}
const KIND_CODE = { marfu: 0, mawquf: 1, maqtu: 2, balagh: 3, ray: 4 };

// ── 8/9. Assemble & write ───────────────────────────────────────────────────

async function writeJson(rel, data) {
  const p = resolve(OUT, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(data));
}

async function main() {
  const t0 = Date.now();
  let mergeCount = 0, vocabSize = 0;
  const bookStats = [];
  const { hadiths: loaded, sections } = await loadAll();
  // entries with no text in the source: kept (numbering stays complete) but flagged; they cannot carry a chain
  const noText = loaded.filter(h => !h.text.trim());
  for (const h of noText) h.noText = true;
  const hadiths = loaded.filter(h => h.text.trim());
  log(`entries without text in the source: ${noText.length} (kept, flagged)`);
  // name vocabulary from the rijāl books and the reference lists: a bare word is a name only if it is known there
  const taqrib = loadTaqrib(resolve(RIJAL, 'taqrib-tahdhib.txt'));
  const tahdhib = loadTahdhib(resolve(RIJAL, 'tahdhib-tahdhib.txt'));
  {
    const extra = [];
    for (const [k] of loadReference()) extra.push(k);
    for (const e of EXTRA_NARRATORS) extra.push(...e.names);
    extra.push(...Object.keys(BIOS));
    for (const c of COLLECTIONS) extra.push(c.compiler, ...c.aliases);
    const vocab = nameVocabulary(taqrib, tahdhib, extra);
    setNameVocab(vocab);
    vocabSize = vocab.size;
    log(`name vocabulary: ${vocab.size} words`);
  }
  const nameStarts = parseAll(hadiths);
  // names damaged by encoding errors in the source ("أبو بكر بن أبي شي�ة"): repair from the closest well-formed name
  {
    const freq = new Map();
    for (const h of hadiths) for (const [k, node] of h.graph.nodes) if (!node.display.includes('\uFFFD')) freq.set(k, (freq.get(k) || 0) + 1);
    const keys = [...freq.keys()];
    const cache = new Map(); let repaired = 0, dropped = 0, kept = 0;
    const repairOf = (k, display) => {
      const ck = k + '|' + display;
      if (cache.has(ck)) return cache.get(ck);
      const pat = '^' + normalizeArabic(display.replace(/\uFFFD+/g, '\u0001')).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\u0001/g, '.{1,3}') + '$';
      const re = new RegExp(pat);
      const best = keys.filter(x => re.test(x)).sort((a, b) => freq.get(b) - freq.get(a))[0] || (freq.has(k) ? k : null);
      cache.set(ck, best); return best;
    };
    for (const h of hadiths) {
      const g = h.graph;
      const damaged = [...g.nodes.values()].filter(nd => nd.display.includes('\uFFFD'));
      if (!damaged.length) continue;
      const fix = new Map();
      for (const nd of damaged) { const r = repairOf(nd.key, nd.display); fix.set(nd.key, r); if (r === nd.key) kept++; else if (r) repaired++; else dropped++; }
      const nodes = new Map();
      for (const [k, node] of g.nodes) {
        const nk = fix.has(k) ? fix.get(k) : k;
        if (nk === null) continue;
        if (fix.has(k)) node.display = node.display.replace(/\uFFFD+/g, '');
        if (!nodes.has(nk)) nodes.set(nk, { ...node, key: nk });
      }
      const drop = new Set([...fix].filter(([, v]) => v === null).map(([k]) => k));
      for (const d of drop) { const ts = g.edges.filter(e => e.student === d).map(e => e.teacher); const ss = g.edges.filter(e => e.teacher === d); for (const e of ss) for (const t of ts) g.edges.push({ ...e, teacher: t }); }
      g.edges = g.edges.filter(e => !drop.has(e.student) && !drop.has(e.teacher)).map(e => ({ ...e, student: e.student && fix.get(e.student) ? fix.get(e.student) : e.student, teacher: fix.get(e.teacher) ? fix.get(e.teacher) : e.teacher }));
      g.edges = g.edges.filter((e, i, arr) => e.student !== e.teacher && arr.findIndex(x => x.student === e.student && x.teacher === e.teacher) === i);
      g.nodes = nodes;
    }
    log(`encoding-damaged names: ${kept} intact keys, ${repaired} repaired, ${dropped} dropped`);
  }
  for (const h of noText) { h.graph = { nodes: new Map(), edges: [], reachesProphet: false }; h.isnad_ar = ''; h.matn_ar = ''; }
  const { ref, canon, fullest } = loadReferences(bareAliasCheck(hadiths, tahdhib));
  const res = resolveNames(hadiths, ref, [...taqrib, ...tahdhib], fullest);
  log(`relatives resolved: ${res.relResolved}/${res.relTotal} · short names expanded: ${res.shortExpanded}/${res.shortTotal} (${res.viaBooks} through the rijāl books)`);
  // "الربيع بن نافع أبو توبة" and "الربيع بن نافع" are the same person: fold the kunya-suffixed form onto the base form
  {
    const keys = new Set();
    for (const h of hadiths) for (const k of h.graph.nodes.keys()) keys.add(k);
    for (const k of keys) {
      const m = k.match(/^(.+ بن .+?) (?:ابو|ام) [^ ]+$/);
      if (m && keys.has(m[1]) && !canon.has(k)) canon.set(k, canon.get(m[1]) || m[1]);
    }
  }
  // apply aliases inside the graphs so ids resolve to the canonical entity
  const isBareKey = k => !/ /.test(k) && !/^(?:ال|ابو|ابن|ام)/.test(k);
  for (const h of hadiths) {
    const g = h.graph;
    if (![...g.nodes.keys()].some(k => canon.has(k))) continue;
    const depths = depthsOf(g);
    const map = new Map();
    // a bare alias standing where the person cannot stand keeps its own identity ("عمر~": the Bukhārī shaykh, not the caliph)
    for (const k of g.nodes.keys()) { if (!canon.has(k)) continue; const t = canon.get(k); map.set(k, isBareKey(k) && !plausibleAt(ref.get(t), depths.get(k)) ? k + '~' : t); }
    if (!map.size) continue;
    const nodes = new Map();
    for (const [k, node] of g.nodes) { const nk = map.get(k) || k; if (!nodes.has(nk)) nodes.set(nk, { ...node, key: nk }); }
    for (const e of g.edges) { if (map.has(e.student)) e.student = map.get(e.student); if (map.has(e.teacher)) e.teacher = map.get(e.teacher); }
    g.edges = g.edges.filter((e, i, arr) => e.student !== e.teacher && arr.findIndex(x => x.student === e.student && x.teacher === e.teacher) === i);
    g.nodes = nodes;
  }
  // ── Merge variant / truncated name forms into the fuller form of the same person ──
  // "جابر بن عبد" → "جابر بن عبد الله", "يحيى بن يحيى" → "يحيى بن يحيى الليثي" (the one sharing neighbours).
  // Guards: the short form must not be a reference person; the two forms must share a neighbour;
  // they must never appear as two distinct nodes in the same isnad; the winner must be unambiguous.
  {
    const freq = new Map(), nb = new Map(), coOccur = new Map();
    const add = (m, k, v) => (m.get(k) || m.set(k, new Set()).get(k)).add(v);
    for (const h of hadiths) {
      const keys = [...h.graph.nodes.keys()].map(k => canon.get(k) || k);
      for (const k of keys) freq.set(k, (freq.get(k) || 0) + 1);
      for (const e of h.graph.edges) { const a = e.student == null ? null : (canon.get(e.student) || e.student), b = canon.get(e.teacher) || e.teacher; if (a) { add(nb, a, b); add(nb, b, a); } else add(nb, b, `ROOT:${h.coll}`); }
      for (const a of keys) for (const b of keys) if (a !== b) add(coOccur, a, b);
    }
    const compilers = new Set(COLLECTIONS.map(c => c.compiler));
    const INCOMPLETE = new Set(['بن', 'ابي', 'ابن', 'عبد', 'عبيد', 'ام', 'ابو', 'ابا', 'بنت', 'مولي']);
    const byHead = new Map(); // first word → keys (canonical keys and their alias spellings, e.g. "جابر بن عبد الله" → canonical "جابر")
    for (const k of freq.keys()) { const w = k.split(' ')[0]; (byHead.get(w) || byHead.set(w, []).get(w)).push(k); }
    for (const [alias, target] of canon) { if (freq.has(target) && !freq.has(alias)) { const w = alias.split(' ')[0]; (byHead.get(w) || byHead.set(w, []).get(w)).push(alias); } }
    const targetOf = L => freq.has(L) ? L : (canon.get(L) || L);
    const merge = new Map();
    for (const S of freq.keys()) {
      if (ref.has(S) || compilers.has(S) || S.includes('@')) continue;
      const w = S.split(' ');
      const incomplete = INCOMPLETE.has(w[w.length - 1]);
      if (!(incomplete || (w.length >= 3 && w.includes('بن')))) continue;
      const cands = [...new Set((byHead.get(w[0]) || []).filter(L => L !== S && L.startsWith(S + ' ')).map(targetOf))].filter(L => L !== S && (incomplete || !coOccur.get(S)?.has(L))); // a truncation may sit next to the full name in one isnad
      if (!cands.length) continue;
      const fS = freq.get(S);
      const scored = cands.map(L => { const a = nb.get(S) || new Set(), b = nb.get(L) || new Set(); let shared = 0; for (const x of a) if (b.has(x)) shared++; return { L, shared, f: freq.get(L) }; })
        // the longer form must be established: seen at least twice, and not dwarfed by the short form (a frequent short form is the main name, not a truncation)
        // coverage: at least half of the short form's neighbours must be neighbours of the long form (a pooled short form covering several persons fails this)
        .filter(c => (c.shared >= 1 || incomplete) && c.f >= 2 && (incomplete || (c.f * 4 >= fS && c.shared * 2 >= (nb.get(S)?.size || 0))))
        .sort((x, y) => y.shared - x.shared || y.f - x.f);
      if (!scored.length) continue;
      const [best, second] = scored;
      if (second && second.shared >= 1 && !incomplete) continue; // two long forms both share neighbours with the short one: several persons → leave it
      if (best.shared === 0 && (!incomplete || (second && second.f * 3 > best.f))) continue;
      merge.set(S, best.L);
    }
    // resolve chains S → L → LL
    const resolveM = k => { let seen = 0; while (merge.has(k) && seen++ < 5) k = merge.get(k); return k; };
    let applied = 0;
    for (const [S] of merge) { const target = resolveM(S); if (target !== S) { canon.set(S, target); applied++; } }
    for (const h of hadiths) {
      const g = h.graph;
      if (![...g.nodes.keys()].some(k => merge.has(canon.get(k) || k) || merge.has(k))) continue;
      const nodes = new Map();
      for (const [k, node] of g.nodes) { const nk = resolveM(canon.get(k) || k); if (!nodes.has(nk)) nodes.set(nk, { ...node, key: nk }); }
      for (const e of g.edges) { if (e.student != null) e.student = resolveM(canon.get(e.student) || e.student); e.teacher = resolveM(canon.get(e.teacher) || e.teacher); }
      g.edges = g.edges.filter((e, i, arr) => e.student !== e.teacher && arr.findIndex(x => x.student === e.student && x.teacher === e.teacher) === i);
      g.nodes = nodes;
    }
    const examples = [...merge].slice(0, 12).map(([a, b]) => `${a} → ${b}`).join(' | ');
    log(`name variants merged: ${applied} (${examples})`);
    mergeCount = applied;
  }

  // "… عن نافع، أنّ ابن عمر كان يصلي": the report is Ibn Umar's → attach him after the last narrator (quote link)
  {
    const refKeys = new Set([...ref].filter(([, r]) => r.gen === 'sahabi' || r.gen === 'tabii').map(([k]) => k));
    const LEAD = new Set(['ان', 'وان', 'قال', 'قالت', 'سمعت', 'سمع', 'عن', 'كان', 'عند', 'فقال', 'يقول']);
    let attached = 0;
    for (const h of hadiths) {
      const g = h.graph; if (!g.edges.length || g.reachesProphet) continue;
      const toks = cleanName(h.matn_ar.slice(0, 90)).split(' ');
      // "قال ابن عباس", "قال قال ابن عباس", "سمعت أبا هريرة", "أن ابن عمر كان", "تذاكرنا … عند ابن عباس فقال"
      let start = -1;
      for (let i = 0; i < Math.min(toks.length, 12); i++) if (LEAD.has(toks[i])) { start = i + 1; while (LEAD.has(toks[start])) start++; if (start < toks.length) break; }
      if (start < 0) continue;
      let found = null;
      for (let len = 4; len >= 1; len--) {
        let cand = toks.slice(start, start + len).join(' ').replace(/^(?:ابا|ابي) /, 'ابو ');
        const ck = canon.get(cand) || cand;
        if (refKeys.has(ck) || refKeys.has(cand)) { found = ck; break; }
      }
      if (!found) continue;
      const hasTeacher = new Set(g.edges.map(e => e.student));
      const leaves = [...g.nodes.keys()].filter(k => !hasTeacher.has(k));
      if (!leaves.length || leaves.includes(found) || g.nodes.has(found)) continue;
      g.nodes.set(found, { key: found, raw: found, display: found, depth: Infinity });
      for (const l of leaves) g.edges.push({ student: l, teacher: found, connector: 'ان', type: 'quote' });
      attached++;
    }
    log(`matn subjects attached as final link (companion's deed/word): ${attached}`);
  }
  // "بهذا الإسناد" / continuation fragments: inherit from the previous hadith (after resolution & attachment, so the copied tails are final)
  const { inherited, inheritedAll, inheritedHead } = inheritIsnads(hadiths);
  log(`isnads inherited from previous hadith: ${inherited} (tail) + ${inheritedHead} (head) + ${inheritedAll} (whole)`);
  const stillEmpty = hadiths.filter(h => !h.graph.edges.length);
  log(`hadiths without any chain: ${stillEmpty.length}`);
  for (const h of stillEmpty.slice(0, 30)) log(`   [${h.id}] ${cleanName(h.text).slice(0, 110)}`);
  const ents = buildEntities(hadiths, ref, canon);
  dateAndClassify(hadiths, ents);
  if (dateAndClassify.missing) log(`nodes without entity: ${[...dateAndClassify.missing].slice(0, 8).map(x => x.join(' in ')).join(' | ')}`);

  // ── Rijāl: align with Taqrīb / Tahdhīb al-Tahdhīb (Ibn Ḥajar), then re-date with the new anchors ──
  {
    for (const e of ents.values()) e.neighbours = new Set();
    for (const h of hadiths) for (const ed of h.graph.edges) {
      const t = ents.get(ed.teacher), s = ed.student ? ents.get(ed.student) : null;
      if (t && s) { t.neighbours.add(s.key); s.neighbours.add(t.key); }
    }
    const aliases = new Map();
    for (const [alias, target] of canon) (aliases.get(target) || aliases.set(target, []).get(target)).push(alias);
    const st = matchRijal(ents, aliases, taqrib, tahdhib);
    let taqDeath = 0, taqGen = 0;
    for (const e of ents.values()) {
      const t = e.taqrib; if (!t) continue;
      if (t.layer) { e.layer = t.layer; if (!e.compiler) { e.gen = t.layer === 1 ? 'sahabi' : t.layer <= 5 ? 'tabii' : 'muhaddith'; e.genFixed = true; taqGen++; } }
      if (t.gradeDisplay) e.reliability = t.gradeDisplay;
      if (t.death != null && e.dated !== 'reference' && !e.compiler) { e.death = taqribDeath(t, e.death ?? null); e.dated = 'taqrib'; e.deathApprox = t.deathApprox; taqDeath++; }
    }
    log(`rijāl: Taqrīb ${taqrib.length} entries, Tahdhīb ${tahdhib.length} · matched Taqrīb ${st.taqrib} (ambiguous ${st.taqribAmbiguous}), Tahdhīb ${st.tahdhib} (ambiguous ${st.tahdhibAmbiguous}), both ${st.both} · dates from Taqrīb ${taqDeath}, layers ${taqGen}`);
    // the other biographical dictionaries (OpenITI), aligned on the same entities
    for (const src of SOURCES) {
      let entries = [];
      try { entries = loadSource(src, await fetchSource(src, CACHE_OPENITI)); } catch (err) { log(`source ${src.id} unavailable: ${err.message}`); continue; }
      const stS = matchSource(ents, aliases, entries, src.id, { companions: !!src.companions });
      bookStats.push({ id: src.id, title: src.title, author: src.author, author_death: src.authorDeath, entries: entries.length, with_death: entries.filter(t => t.death != null).length, with_lists: entries.filter(t => t.teachers.length || t.students.length).length, with_verdicts: entries.filter(t => t.grades.length).length, matched: stS.matched, ambiguous: stS.ambiguous });
      log(`source ${src.id}: ${entries.length} entries · matched ${stS.matched} (ambiguous ${stS.ambiguous})`);
    }
    // consolidation: a death year attested by the books when neither the reference lists nor the Taqrīb give one; a verdict when the Taqrīb has none
    let rijalDeath = 0;
    for (const e of ents.values()) {
      if (!e.notices?.length) continue;
      if (e.dated !== 'reference' && e.dated !== 'taqrib' && !e.compiler) {
        const ds = e.notices.map(n => n.entry).filter(t => t.death != null && !t.deathApprox).map(t => taqribDeath({ death: t.death, centuryExplicit: t.death >= 100, layer: e.layer }, e.death ?? null));
        if (ds.length) { e.death = Math.round(median(ds)); e.dated = 'rijal'; e.deathApprox = false; rijalDeath++; }
      }
      if (!e.reliability) {
        // al-Dhahabī's own word in al-Kāshif first ("قلت: …"), otherwise the verdict most critics agree on
        const kashif = e.notices.find(n => n.src === 'kashif');
        const own = kashif?.entry.grades.find(g => g.critic === 'شمس الدين الذهبي');
        if (own) e.reliability = own.verdict.replace(/ه$/, 'ة');
        else { const vs = new Map(); for (const n of e.notices) for (const g of n.entry.grades) if (g.critic) vs.set(g.verdict, (vs.get(g.verdict) || 0) + 1); const top = [...vs].sort((a, b) => b[1] - a[1])[0]; if (top && top[1] >= 2) e.reliability = top[0].replace(/ه$/, 'ة'); }
      }
    }
    log(`dates from the other books: ${rijalDeath}`);
    dateAndClassify(hadiths, ents);
  }

  // ids: compilers first, then by count desc
  const list = [...ents.values()].sort((a, b) => (b.compiler ? 1 : 0) - (a.compiler ? 1 : 0) || b.count - a.count || a.key.localeCompare(b.key));
  list.forEach((e, i) => { e.id = i + 1; });
  const idOf = k => ents.get(canon.get(k) || k)?.id;

  // transmissions
  const trans = new Map();
  for (const h of hadiths) {
    const c = COLLECTIONS.find(c => c.code === h.coll);
    for (const e of h.graph.edges) {
      const s = e.student ? idOf(e.student) : idOf(c.compiler), t = idOf(e.teacher);
      if (!s || !t || s === t) continue;
      const key = `${t}-${s}`;
      const r = trans.get(key) || trans.set(key, { teacher_id: t, student_id: s, count: 0, direct: 0 }).get(key);
      r.count++; if (e.type === 'direct') r.direct++;
    }
  }
  const teachersCount = new Map(), studentsCount = new Map();
  for (const r of trans.values()) { teachersCount.set(r.student_id, (teachersCount.get(r.student_id) || 0) + 1); studentsCount.set(r.teacher_id, (studentsCount.get(r.teacher_id) || 0) + 1); }

  const collName = Object.fromEntries(COLLECTIONS.map(c => [c.code, c.name_ar]));
  // per-narrator counts by collection and by kind of report
  const kindByHadith = new Map(loaded.map(h => [h.id, classify(h, ents)]));
  const collOf = id => id.slice(0, id.indexOf(':'));
  // bios: by canonical key or by any alias pointing to it
  const bioOf = e => { if (BIOS[e.key]) return BIOS[e.key]; for (const [alias, target] of canon) if (target === e.key && BIOS[alias]) return BIOS[alias]; return null; };
  const narrators = list.map(e => ({
    id: e.id,
    name_ar: [...e.displays].sort((a, b) => b[1] - a[1])[0][0],
    name_latin: e.latin || null,
    generation: e.gen,
    death_ah: e.death ?? null,
    death_estimated: !(e.dated === 'reference' || e.dated === 'rijal' || (e.dated === 'taqrib' && !e.deathApprox)),
    death_source: e.dated === 'reference' ? 'reference' : e.dated === 'taqrib' ? (e.deathApprox ? 'taqrib_approx' : 'taqrib') : e.dated === 'rijal' ? 'rijal' : 'estimated',
    layer: e.layer || null,
    taqrib: e.taqrib ? { n: e.taqrib.n, grade: e.taqrib.gradeDisplay, layer: e.taqrib.layer, death: e.taqrib.death != null ? taqribDeath(e.taqrib, e.death ?? null) : null, approx: e.taqrib.deathApprox } : null,
    tahdhib: e.tahdhib ? { vol: e.tahdhib.vol, n: e.tahdhib.n } : null,
    notices: e.notices?.length ? Object.fromEntries(e.notices.map(n => [n.src, `${n.entry.vol}:${n.entry.n}`])) : null,
    depth: e.compiler ? 0 : e.depths.length ? Math.round(e.depths.reduce((a, b) => a + b, 0) / e.depths.length * 100) / 100 : null, // mean position in isnads: 0 = compiler, ~6 = companion
    coll_counts: e.hadiths.reduce((a, id) => { const c = collOf(id); a[c] = (a[c] || 0) + 1; return a; }, {}),
    kind_counts: e.hadiths.reduce((a, id) => { const k = kindByHadith.get(id); if (k) a[k] = (a[k] || 0) + 1; return a; }, {}),
    bio: bioOf(e),
    origin: e.origin || null,
    reliability: e.reliability || null,
    hadith_count: e.hadiths.length,
    collections: [...e.colls].map(c => collName[c]),
    teachers_count: teachersCount.get(e.id) || 0,
    students_count: studentsCount.get(e.id) || 0,
    compiler: e.compiler || null,
  }));

  await rm(OUT, { recursive: true, force: true });
  await writeJson('narrators.json', narrators);
  await writeJson('transmissions.json', [...trans.values()].map(r => [r.teacher_id, r.student_id, r.count, r.direct])); // compact rows

  // connectors vocabulary
  const connIndex = new Map();
  const connId = c => { if (!connIndex.has(c)) connIndex.set(c, connIndex.size); return connIndex.get(c); };

  // hadith chunks + indexes
  const byColl = new Map();
  for (const h of loaded) (byColl.get(h.coll) || byColl.set(h.coll, []).get(h.coll)).push(h);
  let hadithsWithIsnad = 0;
  const kindCounts = {};
  // full-text index over the whole matn: word → ordinals (position in `searchIds`), sharded by first letter
  const searchIds = [];
  const postings = new Map();
  const STOP = new Set(['من', 'في', 'علي', 'الي', 'عن', 'ان', 'او', 'ما', 'لا', 'ثم', 'قال', 'قالت', 'قالوا', 'كان', 'كانت', 'الله', 'رسول', 'النبي', 'صلي', 'عليه', 'وسلم', 'يا', 'هو', 'هي', 'هذا', 'هذه', 'ذلك', 'الذي', 'التي', 'به', 'له', 'لها', 'لهم', 'بها', 'فيه', 'فيها', 'عليها', 'عليهم', 'اذا', 'اذ', 'حتي', 'كل', 'بن', 'ابن', 'ابو', 'ابي', 'انه', 'انها', 'اني', 'انا', 'نحن', 'هم', 'كما', 'لم', 'لن', 'قد', 'ولا', 'وما', 'فلا', 'اما', 'انما', 'الا', 'بل', 'مع', 'عند', 'بين', 'حين', 'يوم', 'ليله', 'رجل', 'ناس', 'شيء', 'ثم', 'فقال', 'فقالت', 'وقال', 'قلت', 'يقول', 'كانوا', 'كنا', 'كنت', 'وهو', 'وهي', 'وان', 'فان', 'ولم', 'فلم', 'اذ', 'حديث', 'رضي', 'عنه', 'عنها', 'ابن']);
  const stem = w => w.replace(/^(?:وال|فال|بال|كال|لل|ال|و|ف|ب|ل|ك|س)(?=..)/, '').replace(/(?:ها|هم|هن|كم|كن|نا|ون|ين|ات|ان|ه|ي|ك|ت)$/, '');
  const indexWords = (h, ord) => {
    const words = new Set();
    for (const w0 of cleanName(h.matn_ar || h.text).split(' ')) {
      if (w0.length < 2 || STOP.has(w0)) continue;
      words.add(w0);
      const st = stem(w0); if (st.length >= 2 && st !== w0) words.add(st);
    }
    for (const w of words) (postings.get(w) || postings.set(w, []).get(w)).push(ord);
  };
  for (const c of COLLECTIONS) {
    const arr = (byColl.get(c.code) || []).sort((a, b) => a.sortKey - b.sortKey);
    const index = [];
    for (let i = 0; i < arr.length; i += CHUNK) {
      const chunk = arr.slice(i, i + CHUNK).map(h => {
        const g = h.graph;
        const nodeIds = [...g.nodes.keys()].map(k => idOf(k)).filter(Boolean);
        if (g.edges.length) hadithsWithIsnad++;
        const hasTeacher = new Set(g.edges.map(e => e.student));
        if (!h.noText) { indexWords(h, searchIds.length); searchIds.push(h.id); }
        const kind = classify(h, ents);
        if (kind) kindCounts[kind] = (kindCounts[kind] || 0) + 1;
        return {
          id: h.id, coll: c.code, num: h.num, ref: h.ref, no_text: h.noText ? true : undefined, kind,
          section: h.ref ? { number: h.ref.book, name_en: sections[c.code]?.[String(h.ref.book)] || null } : null,
          grades: h.grades, isnad_ar: h.isnad_ar, matn_ar: h.matn_ar, text_en: h.text_en,
          isnad: {
            nodes: nodeIds,
            edges: g.edges.map(e => [e.student ? idOf(e.student) : idOf(c.compiler), idOf(e.teacher), connId(e.connector), e.inherited ? 1 : 0]).filter(e => e[0] && e[1] && e[0] !== e[1]),
            companions: [...g.nodes.keys()].filter(k => !hasTeacher.has(k)).map(idOf).filter(Boolean),
            reaches_prophet: g.reachesProphet,
            inherited: g.inheritedAll ? 'all' : g.edges.some(e => e.inherited && e.student === null) ? 'head' : g.edges.some(e => e.inherited) ? 'tail' : null,
          },
        };
      });
      await writeJson(`hadiths/${c.code}/${i / CHUNK}.json`, chunk);
      for (const h of chunk) index.push([h.id, h.num, h.no_text ? '' : displayForm(h.matn_ar).slice(0, 120), h.isnad.nodes.length, h.no_text ? 1 : 0, h.kind ? KIND_CODE[h.kind] : -1]);
    }
    await writeJson(`hadiths/index/${c.code}.json`, index);
  }

  // search shards by first letter
  // shard key: first letter, or first two letters for words starting with alef (very frequent)
  const shardKey = w => w[0] === 'ا' && w.length > 1 ? w.slice(0, 2) : w[0];
  const shardsByLetter = new Map();
  for (const [w, ords] of postings) { const l = shardKey(w); (shardsByLetter.get(l) || shardsByLetter.set(l, {}).get(l))[w] = ords; }
  await writeJson('search/ids.json', searchIds);
  const searchLetters = [];
  for (const [l, obj] of shardsByLetter) { const name = [...l].map(ch => ch.codePointAt(0).toString(16)).join('-'); searchLetters.push([l, name]); await writeJson(`search/${name}.json`, obj); }
  log(`search index: ${postings.size} words, ${searchLetters.length} shards`);

  // per-narrator hadith ids, sharded
  const shards = Array.from({ length: SHARDS }, () => ({}));
  for (const e of list) shards[e.id % SHARDS][e.id] = e.hadiths;
  for (let i = 0; i < SHARDS; i++) await writeJson(`narrators/h/${i}.json`, shards[i]);
  // per-narrator rijāl notices (Taqrīb line + Tahdhīb notice), sharded
  const rshards = Array.from({ length: SHARDS }, () => ({}));
  for (const e of list) if (e.taqrib || e.tahdhib || e.notices?.length) rshards[e.id % SHARDS][e.id] = { taqrib: e.taqrib ? e.taqrib.raw : null, tahdhib: e.tahdhib ? e.tahdhib.text : null, teachers: e.tahdhib?.teachers || [], students: e.tahdhib?.students || [],
    notices: (e.notices || []).map(n => ({ src: n.src, ref: `${n.entry.vol}:${n.entry.n}`, name: n.entry.name, death: n.entry.death, approx: n.entry.deathApprox, text: n.entry.text.length > 6000 ? n.entry.text.slice(0, 6000) + '…' : n.entry.text, teachers: n.entry.teachers.slice(0, 80), students: n.entry.students.slice(0, 80), grades: n.entry.grades })) };
  for (let i = 0; i < SHARDS; i++) await writeJson(`narrators/r/${i}.json`, rshards[i]);

  const dated = narrators.filter(n => n.death_ah).length, refDated = narrators.filter(n => !n.death_estimated).length;
  await writeJson('manifest.json', {
    generated_at: new Date().toISOString(),
    version: 2,
    collections: COLLECTIONS.map(c => ({ code: c.code, name_ar: c.name_ar, title_ar: c.title_ar, hadiths: (byColl.get(c.code) || []).length, chunk: CHUNK })),
    connectors: [...connIndex.keys()],
    connector_types: [...connIndex.keys()].map(connectorType),
    shards: SHARDS,
    entries_without_text: noText.map(h => h.id),
    kinds: kindCounts, kind_codes: KIND_CODE,
    search: { letters: searchLetters, ids: searchIds.length, words: postings.size },
    narrators: narrators.length, narrators_reference_dated: refDated, narrators_dated: dated,
    narrators_taqrib: narrators.filter(n => n.taqrib).length, narrators_tahdhib: narrators.filter(n => n.tahdhib).length, narrators_with_notice: narrators.filter(n => n.taqrib || n.tahdhib || n.notices).length,
    narrators_by_death_source: narrators.reduce((a, n) => { a[n.death_source] = (a[n.death_source] || 0) + 1; return a; }, {}),
    narrators_by_generation: narrators.reduce((a, n) => { a[n.generation] = (a[n.generation] || 0) + 1; return a; }, {}),
    layer_names: LAYER_NAMES,
    sources: {
      hadith: { name: 'fawazahmed0/hadith-api', url: 'https://github.com/fawazahmed0/hadith-api', editions: COLLECTIONS.map(c => ({ code: c.code, ara: `ara-${c.edition}.json`, eng: `eng-${c.edition}.min.json`, hadiths: (byColl.get(c.code) || []).length, without_text: noText.filter(h => h.coll === c.code).length })) },
      rijal: { name: 'OpenITI', url: 'https://github.com/OpenITI', licence: OPENITI_LICENCE, books: bookStats, taqrib: { entries: taqrib.length, with_grade: taqrib.filter(t => t.grade).length, with_layer: taqrib.filter(t => t.layer).length, with_death: taqrib.filter(t => t.death != null).length }, tahdhib: { entries: tahdhib.length, with_teachers: tahdhib.filter(t => t.teachers.length).length, with_students: tahdhib.filter(t => t.students.length).length } },
      reference: { legacy: 88, extra: EXTRA_NARRATORS.length, bios: Object.keys(BIOS).length, ref_keys: ref.size },
    },
    merges: mergeCount, name_vocabulary: vocabSize,
    transmissions: trans.size, hadiths: loaded.length, hadiths_with_text: hadiths.length, hadiths_with_isnad: hadithsWithIsnad,
    isnads_inherited_tail: inherited, isnads_inherited_head: inheritedHead, isnads_inherited_whole: inheritedAll, hadiths_without_chain: stillEmpty.length,
    relatives_resolved: res.relResolved, short_names_expanded: res.shortExpanded,
  });
  log(`kinds: ${JSON.stringify(kindCounts)}`);
  log(`narrators ${narrators.length} (reference-dated ${refDated}, dated ${dated}) · transmissions ${trans.size} · hadiths ${loaded.length} (with text ${hadiths.length}, with isnad ${hadithsWithIsnad}) · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch(e => { console.error(e); process.exit(1); });
