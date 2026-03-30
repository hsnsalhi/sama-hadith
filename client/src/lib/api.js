const API_BASE = '/api';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getNarrators({ limit = 1000, generation } = {}) {
  let url = `${API_BASE}/narrators?limit=${limit}`;
  if (generation && generation !== 'all') url += `&generation=${generation}`;
  return fetchJson(url);
}

export async function getNarratorById(id) {
  return fetchJson(`${API_BASE}/narrators/${id}`);
}

export async function getNarratorsLite({ limit = 500 } = {}) {
  return fetchJson(`${API_BASE}/narrators?fields=lite&limit=${limit}`);
}

export async function getTransmissions({ teacherId, studentId, limit = 5000 } = {}) {
  let url = `${API_BASE}/transmissions?limit=${limit}`;
  if (teacherId) url += `&teacher_id=${teacherId}`;
  if (studentId) url += `&student_id=${studentId}`;
  return fetchJson(url);
}

export async function getTransmissionsByNarrator(id) {
  return fetchJson(`${API_BASE}/transmissions?teacher_id=${id}&student_id=${id}`);
}

export async function getHadiths({ narratorId, limit = 2000 } = {}) {
  let url = `${API_BASE}/hadiths?limit=${limit}`;
  if (narratorId) url += `&narrator_id=${narratorId}`;
  return fetchJson(url);
}
