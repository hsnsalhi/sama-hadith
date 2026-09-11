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
import { parseIsnadGraph, cleanName, displayForm } from './lib/isnad-graph.js';
import { loadReference } from './lib/reference-loader.js';
import { EXTRA_NARRATORS } from './lib/reference-extra.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]] : []).filter(x => x.length));
const CACHE = resolve(args.cache || resolve(__dirname, '../../.cache/hadith-api'));
const OUT = resolve(args.out || resolve(__dirname, '../../client/public/data'));
const CDN = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions';

export const COLLECTIONS = [
  { code: 'bukhari', edition: 'bukhari', name_ar: 'البخاري', title_ar: 'صحيح البخاري', compiler: 'البخاري', compilerDeath: 256 },
  { code: 'muslim', edition: 'muslim', name_ar: 'مسلم', title_ar: 'صحيح مسلم', compiler: 'مسلم', compilerDeath: 261 },
  { code: 'abudawud', edition: 'abudawud', name_ar: 'أبو داود', title_ar: 'سنن أبي داود', compiler: 'ابو داود', compilerDeath: 275 },
  { code: 'tirmidhi', edition: 'tirmidhi', name_ar: 'الترمذي', title_ar: 'جامع الترمذي', compiler: 'الترمذي', compilerDeath: 279 },
  { code: 'nasai', edition: 'nasai', name_ar: 'النسائي', title_ar: 'سنن النسائي', compiler: 'النسايي', compilerDeath: 303 },
  { code: 'ibnmajah', edition: 'ibnmajah', name_ar: 'ابن ماجه', title_ar: 'سنن ابن ماجه', compiler: 'ابن ماجه', compilerDeath: 273 },
  { code: 'malik', edition: 'malik', name_ar: 'الموطأ', title_ar: 'موطأ مالك', compiler: 'مالك', compilerDeath: 179 },
];
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
  for (const h of hadiths) {
    const g = parseIsnadGraph(h.text, nameStarts);
    h.graph = { nodes: g.nodes, edges: g.edges, reachesProphet: g.reachesProphet };
    h.isnad_ar = g.isnad_ar; h.matn_ar = g.matn_ar;
  }
  return nameStarts;
}

// ── 3. "بهذا الإسناد" → inherit the previous isnad ──────────────────────────

const REF_RE = /(?:بهذا الاسناد|بهذا الحديث|باسناده|باسناد|بالاسناد|في هذا الاسناد|^(?:،\s*)?(?:بمثله|مثله|نحوه|بمعناه|بمثل حديث|بنحو حديث|مثل حديث|نحو حديث|بمثل|بنحو|بهذا)(?= |$))/;
function inheritIsnads(hadiths) {
  let inherited = 0;
  const byColl = new Map();
  for (const h of hadiths) (byColl.get(h.coll) || byColl.set(h.coll, []).get(h.coll)).push(h);
  for (const list of byColl.values()) {
    list.sort((a, b) => a.sortKey - b.sortKey);
    for (let i = 1; i < list.length; i++) {
      const h = list[i], g = h.graph;
      if (!g.edges.length || g.reachesProphet) continue;
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
  return inherited;
}

// ── 4/5. Name resolution ────────────────────────────────────────────────────

const SHORT = k => !k.includes(' بن ') && !k.includes('@');

function resolveNames(hadiths) {
  const base = k => k.replace(/#\d+$/, '');
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

  let shortExpanded = 0, shortTotal = 0, relResolved = 0, relTotal = 0;
  for (const h of hadiths) {
    const g = h.graph;
    const rename = new Map();
    // a) short names
    for (const k0 of g.nodes.keys()) {
      const k = base(k0);
      if (k.includes('@') || !SHORT(k) || k.startsWith('ابن ') || k.startsWith('ابو ') || k.startsWith('ام ')) { if (k0 !== k) rename.set(k0, k); continue; }
      shortTotal++;
      const students = g.edges.filter(e => e.teacher === k0).map(e => e.student == null ? `ROOT:${h.coll}` : base(e.student));
      const teachers = g.edges.filter(e => e.student === k0).map(e => base(e.teacher));
      let full = null;
      for (const s of students) { full = pick(byPair.get(`${k}|s|${s}`)); if (full) break; }
      if (!full) for (const t of teachers) { full = pick(byPair.get(`${k}|t|${t}`)); if (full) break; }
      if (full) { rename.set(k0, full); shortExpanded++; } else if (k0 !== k) rename.set(k0, k);
    }
    // b) relatives, using the expanded base when available
    for (const k0 of g.nodes.keys()) {
      if (!k0.includes('@')) continue;
      relTotal++;
      const [rel, b0] = k0.split('@');
      const b = rename.get(b0) || rename.get(base(b0)) || base(b0);
      let target = null;
      if (rel === 'ابيه' || rel === 'ابيها') {
        if (b.startsWith('ابن ')) target = b.slice(4);
        else { const full = b.includes(' بن ') ? b : dominant(b); target = full ? fatherOf(full) : null; }
      } else if (rel === 'جده' || rel === 'جدها') {
        const full = b.includes(' بن ') ? b : dominant(b);
        const f = full ? fatherOf(full) : null;
        const ff = f ? (f.includes(' بن ') ? f : dominant(f)) : null;
        target = ff ? fatherOf(ff) : null;
      }
      if (target) target = cleanName(target) || null;
      if (target) { rename.set(k0, target); relResolved++; }
      else if (b !== b0) rename.set(k0, `${rel}@${b}`);
    }
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
  return { relResolved, relTotal, shortExpanded, shortTotal };
}

// ── 6. Entities ─────────────────────────────────────────────────────────────

function loadReferences() {
  const ref = new Map();   // key → { death, gen, origin, latin, reliability, source }
  const canon = new Map(); // alias key → canonical key (same person)
  const byPerson = new Map();
  for (const [k, r] of loadReference()) {
    const key = cleanName(k);
    ref.set(key, { death: r.death_ah, gen: r.generation, origin: r.origin, latin: r.name_latin, reliability: r.reliability, source: 'reference' });
    const pid = `${r.name_latin}|${r.death_ah}`; // the legacy list repeats a person under several names
    if (byPerson.has(pid)) canon.set(key, byPerson.get(pid)); else byPerson.set(pid, key);
  }
  for (const e of EXTRA_NARRATORS) {
    const names = e.names.filter(nm => !e.ambiguous?.includes(nm)).map(cleanName);
    if (!names.length) continue;
    let main = names.find(k => canon.has(k) || byPerson.has(`${e.latin}|${e.death}`)) ;
    main = main ? (canon.get(main) || main) : names[0];
    for (const k of names) {
      if (!ref.has(k) || ref.get(k).source === 'reference') ref.set(k, { death: e.death, gen: e.gen, origin: e.origin, latin: e.latin, reliability: ref.get(k)?.reliability || ref.get(main)?.reliability || null, source: 'reference' });
      if (k !== main) canon.set(k, main);
    }
  }
  return { ref, canon };
}

function buildEntities(hadiths, ref, canon) {
  const ents = new Map(); // key → entity
  const get = key0 => {
    const key = canon.get(key0) || key0;
    let e = ents.get(key);
    if (!e) { e = { key, displays: new Map(), count: 0, colls: new Set(), estimates: [], votes: { sahabi: 0, tabii: 0, muhaddith: 0 }, hadiths: [] }; ents.set(key, e); }
    return e;
  };
  // compilers
  for (const c of COLLECTIONS) { const e = get(c.compiler); e.compiler = c.code; e.displays.set(c.name_ar === 'الموطأ' ? 'مالك بن أنس' : c.name_ar, 1e9); }
  for (const h of hadiths) {
    const g = h.graph;
    for (const [k, node] of g.nodes) {
      const e = get(k);
      e.count++; e.colls.add(h.coll); e.hadiths.push(h.id);
      let d = node.display.replace(/^(?:أبي|أبا)(?= )/, 'أبو').replace(/^(?:ابي|ابا)(?= )/, 'أبو');
      if (k.includes('@')) {
        const [rel, b] = k.split('@');
        const bd = ents.get(b)?.displays.size ? [...ents.get(b).displays].sort((x, y) => y[1] - x[1])[0][0] : b;
        d = ({ ابيه: 'والد', ابيها: 'والد', جده: 'جدّ', جدها: 'جدّ', امه: 'والدة', امها: 'والدة', عمه: 'عمّ', عمته: 'عمّة', خاله: 'خال', خالته: 'خالة', اخيه: 'أخو', اخته: 'أخت', مولاه: 'مولى', مولاته: 'مولاة', ابنه: 'ابن', ابنته: 'ابنة', زوجه: 'زوج', زوجته: 'زوجة', جدته: 'جدّة', اخيها: 'أخو' }[rel] || rel) + ' ' + bd;
      }
      e.displays.set(d, (e.displays.get(d) || 0) + 1);
    }
    if (g.edges.length) { const ce = get(COLLECTIONS.find(c => c.code === h.coll).compiler); if (!ce.hadiths.includes(h.id)) ce.hadiths.push(h.id); }
  }
  // reference enrichment
  for (const e of ents.values()) {
    const r = ref.get(e.key);
    if (r) { e.death = r.death; e.gen = r.gen; e.origin = r.origin || null; e.latin = r.latin || null; e.reliability = r.reliability || null; e.dated = 'reference'; }
    if (e.compiler) { const c = COLLECTIONS.find(c => c.code === e.compiler); e.death = c.compilerDeath; e.gen = 'muhaddith'; e.dated = 'reference'; }
  }
  return ents;
}

// ── 7. Dating & layers ──────────────────────────────────────────────────────

function dateAndClassify(hadiths, ents) {
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
    for (const [k, d] of depth) { if (k === '∅') continue; const e = ents.get(k); if (e?.dated === 'reference') anchors.push([d, e.death]); }
    if (g.reachesProphet) anchors.push([maxDepth + 1, PROPHET_YEAR + 30]); // a companion typically outlived the Prophet by decades; soft anchor
    anchors.sort((a, b) => a[0] - b[0]);

    for (const [k, d] of depth) {
      if (k === '∅') continue;
      const e = ents.get(k);
      if (e.dated === 'reference') continue;
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
    if (e.dated === 'reference') continue;
    if (e.estimates.length) { e.death = Math.round(median(e.estimates)); e.dated = 'estimated'; }
    const v = e.votes; const best = Object.entries(v).sort((a, b) => b[1] - a[1])[0];
    e.gen = best && best[1] > 0 ? best[0] : (e.death && e.death < 100 ? 'sahabi' : e.death && e.death < 150 ? 'tabii' : 'muhaddith');
    // an estimated date that contradicts the structural layer wins
    if (e.gen === 'sahabi' && e.death > 115) e.gen = e.death > 200 ? 'muhaddith' : 'tabii';
    if (e.gen === 'tabii' && e.death > 200) e.gen = 'muhaddith';
  }
}

// ── 8/9. Assemble & write ───────────────────────────────────────────────────

async function writeJson(rel, data) {
  const p = resolve(OUT, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(data));
}

async function main() {
  const t0 = Date.now();
  const { hadiths, sections } = await loadAll();
  const nameStarts = parseAll(hadiths);
  const inherited = inheritIsnads(hadiths);
  log(`isnads inherited from previous hadith: ${inherited}`);
  const res = resolveNames(hadiths);
  log(`relatives resolved: ${res.relResolved}/${res.relTotal} · short names expanded: ${res.shortExpanded}/${res.shortTotal}`);
  const { ref, canon } = loadReferences();
  // apply aliases inside the graphs so ids resolve to the canonical entity
  for (const h of hadiths) {
    const g = h.graph;
    if (![...g.nodes.keys()].some(k => canon.has(k))) continue;
    const nodes = new Map();
    for (const [k, node] of g.nodes) { const nk = canon.get(k) || k; if (!nodes.has(nk)) nodes.set(nk, { ...node, key: nk }); }
    for (const e of g.edges) { if (canon.has(e.student)) e.student = canon.get(e.student); if (canon.has(e.teacher)) e.teacher = canon.get(e.teacher); }
    g.edges = g.edges.filter((e, i, arr) => e.student !== e.teacher && arr.findIndex(x => x.student === e.student && x.teacher === e.teacher) === i);
    g.nodes = nodes;
  }
  const ents = buildEntities(hadiths, ref, canon);
  dateAndClassify(hadiths, ents);

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
  const narrators = list.map(e => ({
    id: e.id,
    name_ar: [...e.displays].sort((a, b) => b[1] - a[1])[0][0],
    name_latin: e.latin || null,
    generation: e.gen,
    death_ah: e.death ?? null,
    death_estimated: e.dated !== 'reference',
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
  for (const h of hadiths) (byColl.get(h.coll) || byColl.set(h.coll, []).get(h.coll)).push(h);
  let hadithsWithIsnad = 0;
  for (const c of COLLECTIONS) {
    const arr = (byColl.get(c.code) || []).sort((a, b) => a.sortKey - b.sortKey);
    const index = [];
    for (let i = 0; i < arr.length; i += CHUNK) {
      const chunk = arr.slice(i, i + CHUNK).map(h => {
        const g = h.graph;
        const nodeIds = [...g.nodes.keys()].map(k => idOf(k)).filter(Boolean);
        if (g.edges.length) hadithsWithIsnad++;
        const hasTeacher = new Set(g.edges.map(e => e.student));
        return {
          id: h.id, coll: c.code, num: h.num, ref: h.ref,
          section: h.ref ? { number: h.ref.book, name_en: sections[c.code]?.[String(h.ref.book)] || null } : null,
          grades: h.grades, isnad_ar: h.isnad_ar, matn_ar: h.matn_ar, text_en: h.text_en,
          isnad: {
            nodes: nodeIds,
            edges: g.edges.map(e => [e.student ? idOf(e.student) : idOf(c.compiler), idOf(e.teacher), connId(e.connector), e.inherited ? 1 : 0]).filter(e => e[0] && e[1]),
            companions: [...g.nodes.keys()].filter(k => !hasTeacher.has(k)).map(idOf).filter(Boolean),
            reaches_prophet: g.reachesProphet,
          },
        };
      });
      await writeJson(`hadiths/${c.code}/${i / CHUNK}.json`, chunk);
      for (const h of chunk) index.push([h.id, h.num, displayForm(h.matn_ar).slice(0, 120), h.isnad.nodes.length]);
    }
    await writeJson(`hadiths/index/${c.code}.json`, index);
  }

  // per-narrator hadith ids, sharded
  const shards = Array.from({ length: SHARDS }, () => ({}));
  for (const e of list) shards[e.id % SHARDS][e.id] = e.hadiths;
  for (let i = 0; i < SHARDS; i++) await writeJson(`narrators/h/${i}.json`, shards[i]);

  const dated = narrators.filter(n => n.death_ah).length, refDated = narrators.filter(n => !n.death_estimated).length;
  await writeJson('manifest.json', {
    generated_at: new Date().toISOString(),
    version: 2,
    collections: COLLECTIONS.map(c => ({ code: c.code, name_ar: c.name_ar, title_ar: c.title_ar, hadiths: (byColl.get(c.code) || []).length, chunk: CHUNK })),
    connectors: [...connIndex.keys()],
    shards: SHARDS,
    narrators: narrators.length, narrators_reference_dated: refDated, narrators_dated: dated,
    transmissions: trans.size, hadiths: hadiths.length, hadiths_with_isnad: hadithsWithIsnad,
    isnads_inherited: inherited, relatives_resolved: res.relResolved, short_names_expanded: res.shortExpanded,
  });
  log(`narrators ${narrators.length} (reference-dated ${refDated}, dated ${dated}) · transmissions ${trans.size} · hadiths ${hadiths.length} (with isnad ${hadithsWithIsnad}) · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch(e => { console.error(e); process.exit(1); });
