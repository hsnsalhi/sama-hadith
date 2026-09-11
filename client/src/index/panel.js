import { state } from './state.js';
import { GCS, GL } from '../lib/constants.js';
import { buildSelLines, flyTo } from './selection.js';
import { updateTimeline } from './timeline.js';
import { updateGeoAxis } from './geo-axis.js';
import { getHadithRowsByNarrator } from '../lib/api.js';

const NUM_AR = '٠١٢٣٤٥٦٧٨٩';
const ar = s => String(s ?? '').replace(/\d/g, d => NUM_AR[d]);
const COLL_NAMES = { bukhari: 'البخاري', muslim: 'مسلم', abudawud: 'أبو داود', tirmidhi: 'الترمذي', nasai: 'النسائي', ibnmajah: 'ابن ماجه', malik: 'الموطأ' };

// Lazily bound to avoid a circular import at module-evaluation time
let hadithApi = null;
export function bindHadithApi(api) { hadithApi = api; }

export function openPanel(n, { keepPath = false } = {}) {
  if (!keepPath && state.hadith && hadithApi) hadithApi.clearPath();
  state.selId = n.id;
  buildSelLines(n.id);

  if (state.starPoints) {
    const idx = state.indexOfId[n.id];
    state.starPoints.material.uniforms.uSelected.value = idx === undefined ? -1 : idx;
  }

  const col = GCS[n.generation] || '#c9a84c';
  document.getElementById('pdot').style.cssText = `background:${col};box-shadow:0 0 6px ${col}`;
  document.getElementById('pgt').textContent = (GL[n.generation] || n.generation) + (n.compiler ? ' · مؤلِّف' : '');
  document.getElementById('pn').textContent = n.name_ar;
  document.getElementById('pl').textContent = n.name_latin || '';

  const colls = Array.isArray(n.collections) ? n.collections : [];
  const rel = state.transmissions.filter(t => t.student_id === n.id || t.teacher_id === n.id);
  const teachers = rel.filter(t => t.student_id === n.id).map(t => ({ n: state.narById.get(t.teacher_id), w: t.count })).filter(x => x.n).sort((a, b) => b.w - a.w);
  const students = rel.filter(t => t.teacher_id === n.id).map(t => ({ n: state.narById.get(t.student_id), w: t.count })).filter(x => x.n).sort((a, b) => b.w - a.w);
  const item = ({ n: x, w }) => `<div class="pl-item" data-narrator-id="${x.id}"><div class="pl-d" style="background:${GCS[x.generation]};box-shadow:0 0 4px ${GCS[x.generation]}"></div><span class="pl-n">${x.name_ar}</span><span class="pl-e">${w > 1 ? '×' + ar(w) + ' · ' : ''}${x.death_ah ? ar(x.death_ah) + 'هـ' : ''}</span></div>`;
  const list = arr => arr.map(item).join('');

  document.getElementById('pb').innerHTML = `
    ${state.hadith && hadithApi ? `<button id="back-hadith" class="cb wide">↩ العودة إلى الحديث</button>` : ''}
    <a href="narrator.html?id=${n.id}" target="_blank" class="full-link">الفيشة الكاملة ↗</a>
    <div class="ir"><span class="il">وفاته</span><span class="iv">${n.death_ah ? ar(n.death_ah) + ' هـ' + (n.death_estimated ? ' <small title="تاريخ مقدَّر من موقعه في الأسانيد">(تقديري)</small>' : '') : '—'}</span></div>
    <div class="ir"><span class="il">المنشأ</span><span class="iv">${n.origin || '—'}</span></div>
    <div class="ir"><span class="il">وروده في الأسانيد</span><span class="iv">${ar((n.hadith_count || 0).toLocaleString('en'))}</span></div>
    <div class="ir"><span class="il">الحكم</span><span class="iv">${n.reliability || '—'}</span></div>
    ${colls.length ? `<div class="ps"><div class="pst">المصادر</div>${colls.map(c => `<span class="tag tc">${c}</span>`).join('')}</div>` : ''}
    ${teachers.length ? `<div class="ps"><div class="pst">شيوخه (${ar(teachers.length)})</div>${list(teachers)}</div>` : ''}
    ${students.length ? `<div class="ps"><div class="pst">تلاميذه (${ar(students.length)})</div>${list(students)}</div>` : ''}
    <div class="ps" id="panel-hadiths"><div class="pst">أحاديثه</div><div class="pl-more">جارٍ التحميل…</div></div>
  `;
  loadPanelHadiths(n.id);

  document.getElementById('pb').querySelectorAll('.pl-item[data-narrator-id]').forEach(el => {
    el.addEventListener('click', () => focusNarrator(parseInt(el.dataset.narratorId), { keepPath }));
  });
  document.getElementById('back-hadith')?.addEventListener('click', () => { state.selId = null; if (state.selLines) { state.scene.remove(state.selLines); state.selLines = null; } if (state.starPoints) state.starPoints.material.uniforms.uSelected.value = -1; hadithApi.backToHadith(); });

  document.getElementById('panel').classList.add('open');
  updateTimeline(n);
  updateGeoAxis(n);
  flyTo(n);
}

async function loadPanelHadiths(id) {
  try {
    const rows = await getHadithRowsByNarrator(id);
    const box = document.querySelector('#panel-hadiths');
    if (!box || state.selId !== id) return;
    if (!rows.length) { box.querySelector('.pl-more').textContent = 'لا أحاديث مسندة'; return; }
    const byColl = new Map();
    for (const r of rows) (byColl.get(r.collName) || byColl.set(r.collName, []).get(r.collName)).push(r);
    box.innerHTML = `<div class="pst">أحاديثه (${ar(rows.length)})</div>` + [...byColl].map(([name, list], i) => `
      <details class="hgroup" ${i === 0 ? 'open' : ''}><summary>${name} <span>${ar(list.length)}</span></summary>
      ${list.map(r => `<div class="hc hclick" data-h="${r.id}"><div class="ht">${r.snippet || '<i>النص غير متوفر</i>'}</div><div class="hm">${name} ${ar(r.num)} · <span class="hm-link">تتبّع الإسناد ↗</span></div></div>`).join('')}
      </details>`).join('');
    box.querySelectorAll('.hclick').forEach(el => el.addEventListener('click', () => hadithApi?.openHadith(el.dataset.h)));
  } catch (e) {
    console.warn('hadiths load failed', e);
  }
}

export function closePanel() {
  document.getElementById('panel').classList.remove('open');
  state.selId = null;
  if (state.selLines) { state.scene.remove(state.selLines); state.selLines = null; }
  if (state.starPoints) state.starPoints.material.uniforms.uSelected.value = -1;
  updateTimeline(null);
  updateGeoAxis(null);
}

export function focusNarrator(id, opts = {}) {
  const n = state.narById.get(id);
  if (n) openPanel(n, opts);
}
