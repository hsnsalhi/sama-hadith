import { state } from './state.js';
import { normalizeText } from '../lib/search-norm.js';
const wordCache = new WeakMap();
const wordsOf = n => { let w = wordCache.get(n); if (!w) { w = normalizeText(`${n.name_ar || ''} ${n.name_short || ''} ${(n.alt || []).join(' ')}`).split(' ').filter(Boolean).map(x => x === 'ابن' ? 'بن' : x); wordCache.set(n, w); } return w; };
const matchWord = (w, x) => x === w || x.startsWith(w) || (w.startsWith('ال') && w.length > 3 && (x === w.slice(2) || x.startsWith(w.slice(2)))) || ('ال' + w === x);
import { GCS, genLabel } from '../lib/constants.js';
import { openPanel } from './panel.js';
import { isHadithMode, runHadithSearch } from './hadith-mode.js';

export function initSearch() {
  const si = document.getElementById('si');
  const sr = document.getElementById('sr');

  let timer = null;
  si.addEventListener('input', () => {
    const q = si.value.trim();
    if (isHadithMode()) { clearTimeout(timer); timer = setTimeout(() => runHadithSearch(q), 180); return; }
    if (!q) { sr.style.display = 'none'; return; }

    // every word of the query must begin a word of the name (diacritics, hamza forms, ى/ي and ة/ه ignored)
    const qw = normalizeText(q).split(' ').filter(Boolean).map(x => x === 'ابن' ? 'بن' : x);
    const ql = q.toLowerCase();
    // a kunya in the query ("ابو عاصم") must appear as such, not as two scattered words
    const kunyas = qw.map((w, i) => (w === 'ابو' || w === 'ام') && qw[i + 1] ? [w, qw[i + 1]] : null).filter(Boolean);
    const hasKunya = (n, [k, x]) => { const ws = wordsOf(n); return ws.some((y, i) => y === k && ws[i + 1] && matchWord(x, ws[i + 1])); };
    const score = n => { const ws = wordsOf(n); let s = 0; for (const w of qw) { if (ws.includes(w) || ws.includes('ال' + w) || ws.includes(w.replace(/^ال/, ''))) s += 2; else if (ws.some(x => matchWord(w, x))) s += 1; } for (const k of kunyas) if (hasKunya(n, k)) s += 3; return s; };
    const res = state.narrators
      .filter(n => (qw.length && qw.every(w => wordsOf(n).some(x => matchWord(w, x))) && kunyas.every(k => hasKunya(n, k))) || n.name_latin?.toLowerCase().includes(ql))
      .map(n => ({ n, s: score(n) }))
      .sort((a, b) => b.s - a.s || (b.n.hadith_count || 0) - (a.n.hadith_count || 0)) // whole words first, then the best attested
      .map(x => x.n)
      .slice(0, 12);

    if (!res.length) { sr.style.display = 'none'; return; }

    sr.innerHTML = res.map(n =>
      `<div class="sri" data-narrator-id="${n.id}">
        <span class="sri-n">${n.name_ar}</span>
        <span class="sri-g" style="background:${GCS[n.generation]}18;color:${GCS[n.generation]};border:0.5px solid ${GCS[n.generation]}33">${genLabel(n)}</span>
      </div>`
    ).join('');

    sr.querySelectorAll('.sri').forEach(el => {
      el.addEventListener('click', () => {
        const id = parseInt(el.dataset.narratorId);
        sr.style.display = 'none';
        si.value = '';
        const n = state.narrators.find(x => x.id === id);
        if (n) openPanel(n);
      });
    });

    sr.style.display = 'block';
  });

  document.addEventListener('click', e => {
    if (!document.getElementById('sw').contains(e.target)) {
      sr.style.display = 'none';
    }
  });
}
