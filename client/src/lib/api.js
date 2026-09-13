import { STOP, normalizeText, stem, shardKey } from './search-norm.js';
// Data layer over the static dataset produced by server/scripts/build-dataset.js
// (client/public/data). Everything is lazy and cached for the page lifetime.
const DATA = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/data`;

const cache = new Map();
function load(rel, { optional = false } = {}) {
  if (!cache.has(rel)) {
    cache.set(rel, fetch(`${DATA}/${rel}`).then(async res => {
      if (res.status === 404 && optional) return null;
      if (!res.ok) throw new Error(`data error ${res.status}: ${rel}`);
      return res.json();
    }).catch(err => { cache.delete(rel); throw err; }));
  }
  return cache.get(rel);
}

// ── Manifest & collections ─────────────────────────────────────────────────
export const getManifest = () => load('manifest.json');

export async function getCollections() {
  return (await getManifest()).collections; // [{code, name_ar, title_ar, hadiths, chunk}]
}
export async function collectionName(code) {
  return (await getCollections()).find(c => c.code === code)?.name_ar || code;
}

// ── Narrators ──────────────────────────────────────────────────────────────
let narratorIndex = null;
export async function getNarrators({ limit = Infinity, generation } = {}) {
  const all = await load('narrators.json');
  if (!narratorIndex) narratorIndex = new Map(all.map(n => [n.id, n]));
  const rows = generation && generation !== 'all' ? all.filter(n => n.generation === generation) : all;
  return rows.slice(0, limit);
}
export async function getNarratorById(id) {
  await getNarrators();
  return narratorIndex.get(Number(id)) || null;
}
export async function getNarratorMap() { await getNarrators(); return narratorIndex; }
export const getNarratorsLite = getNarrators;

// ── Transmissions (teacher_id, student_id, count, direct) ──────────────────
let transmissionRows = null;
export async function getTransmissions({ teacherId, studentId, limit = Infinity } = {}) {
  if (!transmissionRows) {
    const raw = await load('transmissions.json');
    transmissionRows = raw.map(r => Array.isArray(r) ? { teacher_id: r[0], student_id: r[1], count: r[2], direct: r[3] } : r);
  }
  const all = transmissionRows;
  let rows = all;
  if (teacherId && studentId) rows = all.filter(t => t.teacher_id === teacherId || t.student_id === studentId);
  else if (teacherId) rows = all.filter(t => t.teacher_id === teacherId);
  else if (studentId) rows = all.filter(t => t.student_id === studentId);
  return rows.slice(0, limit);
}
export function getTransmissionsByNarrator(id) {
  const n = Number(id);
  return getTransmissions({ teacherId: n, studentId: n });
}

// ── Hadiths ────────────────────────────────────────────────────────────────
// index row: [id, num, snippet, chainSize]; position in the array → chunk = floor(pos / chunk)
export const getHadithIndex = code => load(`hadiths/index/${code}.json`);

export async function getAllHadithIndexes() {
  const colls = await getCollections();
  const lists = await Promise.all(colls.map(c => getHadithIndex(c.code)));
  return colls.map((c, i) => ({ coll: c, rows: lists[i] }));
}

/** Map hadith id → index row [id, num, snippet, chainSize, noText] across all collections. */
let rowMap = null;
export async function getIndexRowMap() {
  if (rowMap) return rowMap;
  const lists = await getAllHadithIndexes();
  rowMap = new Map();
  for (const { coll, rows } of lists) for (const r of rows) rowMap.set(r[0], { id: r[0], coll: coll.code, collName: coll.name_ar, num: r[1], snippet: r[2], chain: r[3], noText: !!r[4], kind: r[5] ?? -1 });
  return rowMap;
}

// ── Full-text search over the whole text (isnad and matn) ─────────────────
const shardCache = new Map();
async function shardOf(word) {
  const key = shardKey(word);
  if (shardCache.has(key)) return shardCache.get(key);
  const m = await getManifest();
  const entry = (m.search?.letters || []).find(([l]) => l === key);
  const p = entry ? load(`search/${entry[1]}.json`) : Promise.resolve(null);
  shardCache.set(key, p);
  return p;
}
const MAX_PREFIX = 400;
/**
 * Hadiths containing one query word: its exact form (weight 3), its stem (2) or, when neither is
 * indexed, the indexed words it is a prefix of (1) — so a partly typed word still finds something.
 */
async function ordinalsOf(word) {
  const shard = await shardOf(word);
  const hits = new Map(); // ordinal → weight
  const add = (list, w) => { for (const o of list || []) if ((hits.get(o) || 0) < w) hits.set(o, w); };
  if (shard?.[word]) add(shard[word], 3);
  const st = stem(word);
  if (st.length >= 2 && st !== word) { const sh = shardKey(st) === shardKey(word) ? shard : await shardOf(st); add(sh?.[st], 2); }
  if (!hits.size && shard && word.length >= 3) {
    let n = 0;
    for (const w in shard) if (w.startsWith(word) && ++n <= MAX_PREFIX) add(shard[w], 1);
  }
  return hits;
}
/**
 * AND search over the words of the query (stop words such as «لا», «ما», «حتى» are ignored, as
 * they are not indexed). Results are ranked: exact words first, then stems, then prefixes; ties
 * keep the order of the collections.
 * @returns {{ ids: string[], ignored: string[], words: string[] }}
 */
export async function searchHadiths(query) {
  const all = normalizeText(query).split(' ').filter(w => w.length >= 2);
  const words = all.filter(w => !STOP.has(w));
  const ignored = all.filter(w => STOP.has(w));
  if (!words.length) return { ids: [], ignored, words };
  const ids = await load('search/ids.json');
  let acc = null; // ordinal → score
  for (const w of words) {
    const hits = await ordinalsOf(w);
    if (!hits.size) return { ids: [], ignored, words };
    if (!acc) acc = hits;
    else { const next = new Map(); for (const [o, s] of acc) { const h = hits.get(o); if (h) next.set(o, s + h); } acc = next; }
    if (!acc.size) return { ids: [], ignored, words };
  }
  return { ids: [...acc].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([o]) => ids[o]), ignored, words };
}

export function splitHadithId(id) {
  const i = id.indexOf(':');
  return { coll: id.slice(0, i), num: id.slice(i + 1) };
}

/** Full hadith record (text, grades, isnad graph…) by id "coll:num". */
export async function getHadith(id) {
  const { coll } = splitHadithId(id);
  const [index, colls] = await Promise.all([getHadithIndex(coll), getCollections()]);
  const pos = index.findIndex(r => r[0] === id);
  if (pos < 0) return null;
  const size = colls.find(c => c.code === coll)?.chunk || 200;
  const chunk = await load(`hadiths/${coll}/${Math.floor(pos / size)}.json`);
  return chunk.find(h => h.id === id) || null;
}

/** Neighbouring hadith ids in the same collection (for prev/next). */
export async function getHadithNeighbours(id) {
  const { coll } = splitHadithId(id);
  const index = await getHadithIndex(coll);
  const pos = index.findIndex(r => r[0] === id);
  return { prev: pos > 0 ? index[pos - 1][0] : null, next: pos >= 0 && pos + 1 < index.length ? index[pos + 1][0] : null, pos, total: index.length };
}

/** Ids of every hadith in whose isnad the narrator appears. */
export async function getHadithIdsByNarrator(narratorId) {
  const m = await getManifest();
  const shard = await load(`narrators/h/${Number(narratorId) % m.shards}.json`);
  return shard[String(narratorId)] || [];
}

/** Hadith records for a narrator (all by default), grouped fetches by chunk. */
export async function getHadiths({ narratorId, limit = Infinity, offset = 0 } = {}) {
  if (!narratorId) return [];
  const ids = (await getHadithIdsByNarrator(narratorId)).slice(offset, offset + limit);
  const out = await Promise.all(ids.map(id => getHadith(id)));
  return out.filter(Boolean);
}

/** Rijāl notices (Taqrīb line, Tahdhīb text, its teacher/student lists) of a narrator, or null. */
export async function getRijal(narratorId) {
  const m = await getManifest();
  const shard = await load(`narrators/r/${Number(narratorId) % (m.shards || 64)}.json`, { optional: true });
  return shard?.[narratorId] || null;
}

/** Lightweight rows (number, snippet) for every hadith of a narrator, in collection order. */
export async function getHadithRowsByNarrator(narratorId) {
  const [ids, rows, colls] = await Promise.all([getHadithIdsByNarrator(narratorId), getIndexRowMap(), getCollections()]);
  const order = new Map(colls.map((c, i) => [c.code, i]));
  return ids.map(id => rows.get(id)).filter(Boolean).sort((a, b) => (order.get(a.coll) - order.get(b.coll)) || (parseFloat(a.num) - parseFloat(b.num)));
}
