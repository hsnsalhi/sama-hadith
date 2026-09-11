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

// ── Full-text search over the whole matn ─────────────────────────────────
const stripAr = s => (s || '').replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
const stem = w => w.replace(/^(?:وال|فال|بال|كال|لل|ال|و|ف|ب|ل|ك|س)(?=..)/, '').replace(/(?:ها|هم|هن|كم|كن|نا|ون|ين|ات|ان|ه|ي|ك|ت)$/, '');
async function postingsOf(word) {
  const m = await getManifest();
  const key = word[0] === 'ا' && word.length > 1 ? word.slice(0, 2) : word[0];
  const entry = (m.search?.letters || []).find(([l]) => l === key);
  if (!entry) return null;
  const shard = await load(`search/${entry[1]}.json`);
  return shard[word] || null;
}
/**
 * AND search: every query word (or its stem) must occur in the matn.
 * Returns hadith ids in collection order.
 */
export async function searchHadiths(query) {
  const words = stripAr(query).toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  if (!words.length) return [];
  const ids = await load('search/ids.json');
  let acc = null;
  for (const w of words) {
    const exact = await postingsOf(w);
    const st = stem(w);
    const stemmed = st.length >= 2 && st !== w ? await postingsOf(st) : null;
    const set = new Set([...(exact || []), ...(stemmed || [])]);
    if (!set.size) return [];
    acc = acc ? new Set([...acc].filter(o => set.has(o))) : set;
    if (!acc.size) return [];
  }
  return [...acc].sort((a, b) => a - b).map(o => ids[o]);
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

/** Lightweight rows (number, snippet) for every hadith of a narrator, in collection order. */
export async function getHadithRowsByNarrator(narratorId) {
  const [ids, rows, colls] = await Promise.all([getHadithIdsByNarrator(narratorId), getIndexRowMap(), getCollections()]);
  const order = new Map(colls.map((c, i) => [c.code, i]));
  return ids.map(id => rows.get(id)).filter(Boolean).sort((a, b) => (order.get(a.coll) - order.get(b.coll)) || (parseFloat(a.num) - parseFloat(b.num)));
}
