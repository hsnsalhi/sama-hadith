import { state } from './state.js';
import { GCS, GL } from '../lib/constants.js';
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

    const res = state.narrators
      .filter(n => n.name_ar?.includes(q) || n.name_latin?.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 10);

    if (!res.length) { sr.style.display = 'none'; return; }

    sr.innerHTML = res.map(n =>
      `<div class="sri" data-narrator-id="${n.id}">
        <span class="sri-n">${n.name_ar}</span>
        <span class="sri-g" style="background:${GCS[n.generation]}18;color:${GCS[n.generation]};border:0.5px solid ${GCS[n.generation]}33">${GL[n.generation]}</span>
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
