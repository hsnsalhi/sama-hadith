// Data access layer. Two modes:
//  - API mode (default): talks to the Express server under /api
//  - Static mode (VITE_STATIC_DATA=1, used on GitHub Pages): reads the JSON
//    snapshot produced by server/scripts/export-static.js from /data
const STATIC = import.meta.env.VITE_STATIC_DATA === '1';
const API_BASE = '/api';
const DATA_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/data`;

async function fetchJson(url, { optional = false } = {}) {
  const res = await fetch(url);
  if (res.status === 404 && optional) return null;
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ── Static snapshot (cached once per page) ──────────────────────────────────
const cache = {};
function snapshot(name) {
  return (cache[name] ??= fetchJson(`${DATA_BASE}/${name}.json`));
}

// ── Public API ──────────────────────────────────────────────────────────────
export async function getNarrators({ limit = 1000, generation } = {}) {
  if (STATIC) {
    const all = await snapshot('narrators');
    const rows = generation && generation !== 'all' ? all.filter(n => n.generation === generation) : all;
    return rows.slice(0, limit);
  }
  let url = `${API_BASE}/narrators?limit=${limit}`;
  if (generation && generation !== 'all') url += `&generation=${generation}`;
  return fetchJson(url);
}

export async function getNarratorById(id) {
  if (STATIC) {
    const all = await snapshot('narrators');
    return all.find(n => n.id === Number(id)) || null;
  }
  return fetchJson(`${API_BASE}/narrators/${id}`);
}

export async function getNarratorsLite({ limit = 500 } = {}) {
  if (STATIC) return snapshot('narrators');
  return fetchJson(`${API_BASE}/narrators?fields=lite&limit=${limit}`);
}

export async function getTransmissions({ teacherId, studentId, limit = 5000 } = {}) {
  if (STATIC) {
    const all = await snapshot('transmissions');
    let rows = all;
    if (teacherId && studentId) rows = all.filter(t => t.teacher_id === teacherId || t.student_id === studentId);
    else if (teacherId) rows = all.filter(t => t.teacher_id === teacherId);
    else if (studentId) rows = all.filter(t => t.student_id === studentId);
    return rows.slice(0, limit);
  }
  let url = `${API_BASE}/transmissions?limit=${limit}`;
  if (teacherId) url += `&teacher_id=${teacherId}`;
  if (studentId) url += `&student_id=${studentId}`;
  return fetchJson(url);
}

export async function getTransmissionsByNarrator(id) {
  const n = Number(id);
  if (STATIC) return getTransmissions({ teacherId: n, studentId: n, limit: Infinity });
  return fetchJson(`${API_BASE}/transmissions?teacher_id=${n}&student_id=${n}`);
}

export async function getHadiths({ narratorId, limit = 2000 } = {}) {
  if (STATIC) {
    if (!narratorId) return []; // no global sample in static mode; loaded per narrator
    const rows = await fetchJson(`${DATA_BASE}/hadiths/${Number(narratorId)}.json`, { optional: true });
    return (rows || []).slice(0, limit);
  }
  let url = `${API_BASE}/hadiths?limit=${limit}`;
  if (narratorId) url += `&narrator_id=${narratorId}`;
  return fetchJson(url);
}
