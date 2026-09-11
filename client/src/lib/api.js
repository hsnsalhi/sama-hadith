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

/** Hadith records for a narrator (first `limit`), grouped fetches by chunk. */
export async function getHadiths({ narratorId, limit = 30, offset = 0 } = {}) {
  if (!narratorId) return [];
  const ids = (await getHadithIdsByNarrator(narratorId)).slice(offset, offset + limit);
  const out = await Promise.all(ids.map(id => getHadith(id)));
  return out.filter(Boolean);
}
