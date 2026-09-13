/**
 * Texts missing from hadith-api (empty `text`) are taken from the sunnah.com scrape of
 * AhmedBaset/hadith-json when the two numberings can be aligned without doubt.
 *
 * The two datasets segment the books slightly differently, so no number is trusted: the entries
 * that have a text in both are anchored by their first 100 letters, and a run of empty entries is
 * filled only when it sits between two anchors whose hadith-json counterparts leave exactly as many
 * entries in between (or, for a single empty entry, two or three sub-hadiths, which are joined).
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';

const RAW = 'https://raw.githubusercontent.com/AhmedBaset/hadith-json/main/db/by_book/the_9_books';
export const SUPPLEMENT = { name: 'AhmedBaset/hadith-json', url: 'https://github.com/AhmedBaset/hadith-json', origin: 'sunnah.com' };

const key = s => (s || '').replace(/[ً-ٰٟـ\s‏،.:\-"«»()\[\]]/g, '').slice(0, 100);

async function fetchBook(cache, book) {
  const path = resolve(cache, `${book}.json`);
  try { await access(path); return JSON.parse(await readFile(path, 'utf8')); } catch {}
  const res = await fetch(`${RAW}/${book}.json`);
  if (!res.ok) throw new Error(`hadith-json ${book}: HTTP ${res.status}`);
  const text = await res.text();
  await mkdir(cache, { recursive: true });
  await writeFile(path, text);
  return JSON.parse(text);
}

/**
 * @param hadiths records of one collection in numbering order ({ text, ... }), mutated in place
 * @returns ids of the records that received a text
 */
export async function fillMissingTexts(hadiths, book, cache, log = () => {}) {
  if (!hadiths.some(h => !h.text.trim())) return [];
  let hj;
  try { hj = (await fetchBook(cache, book)).hadiths; } catch (e) { log(`hadith-json unavailable for ${book}: ${e.message}`); return []; }
  // sunnah.com puts Muslim's introduction (chapter 0) first; the scrape appends it at the end
  hj = [...hj.filter(h => Number(h.chapterId) === 0), ...hj.filter(h => Number(h.chapterId) !== 0)];
  const byKey = new Map();
  for (let i = 0; i < hj.length; i++) { const k = key(hj[i].arabic); if (k) (byKey.get(k) || byKey.set(k, []).get(k)).push(i); }
  const pos = hadiths.map(h => { const k = key(h.text); const p = k && byKey.get(k); return p && p.length === 1 ? p[0] : null; });
  const filled = [];
  let i = 0;
  while (i < hadiths.length) {
    if (hadiths[i].text.trim()) { i++; continue; }
    let j = i; while (j < hadiths.length && !hadiths[j].text.trim()) j++;   // empty run [i, j)
    let p = i - 1; while (p >= 0 && pos[p] == null) p--;                     // anchors around it
    let q = j; while (q < hadiths.length && pos[q] == null) q++;
    const hp = p >= 0 ? pos[p] : -1, hq = q < hadiths.length ? pos[q] : hj.length;
    const nMiss = j - i, unanchored = (q - p - 1) - nMiss, hRange = hq - hp - 1;
    const take = (fi, hi) => { const t = hj[hi]?.arabic.trim(); if (t) { hadiths[fi].text = t; hadiths[fi].text_src = 'hadith-json'; filled.push(hadiths[fi].id); } };
    if (unanchored === 0 && hRange === nMiss) {
      for (let k = 0; k < nMiss; k++) take(i + k, hp + 1 + k);
    } else if (unanchored === 0 && p < 0 && hRange < nMiss) {
      for (let k = 0; k < hRange; k++) take(j - 1 - k, hq - 1 - k);     // a book opening with entries the scrape lacks: align on the right anchor, the very first entries stay empty
    } else if (unanchored === 0 && q >= hadiths.length && hRange < nMiss) {
      for (let k = 0; k < hRange; k++) take(i + k, hp + 1 + k);         // same at the end of a book
    } else if (unanchored === 0 && nMiss === 1 && hRange >= 2 && hRange <= 3) {
      const t = hj.slice(hp + 1, hq).map(h => h.arabic.trim()).filter(Boolean).join(' ');
      if (t) { hadiths[i].text = t; hadiths[i].text_src = 'hadith-json'; filled.push(hadiths[i].id); }
    }
    i = j;
  }
  return filled;
}
