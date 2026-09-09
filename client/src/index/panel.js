import { state } from './state.js';
import { GCS, GL } from '../lib/constants.js';
import { buildSelLines, flyTo } from './selection.js';
import { updateTimeline } from './timeline.js';
import { updateGeoAxis } from './geo-axis.js';
import { getHadiths } from '../lib/api.js';

export function openPanel(n) {
  state.selId = n.id;
  buildSelLines(n.id);

  if (state.starPoints) {
    state.starPoints.material.uniforms.uSelected.value =
      Object.keys(state.idxMap).find(k => parseInt(state.idxMap[k]) === n.id) || -1;
  }

  const col = GCS[n.generation] || '#c9a84c';
  document.getElementById('pdot').style.cssText = `background:${col};box-shadow:0 0 6px ${col}`;
  document.getElementById('pgt').textContent = GL[n.generation] || n.generation;
  document.getElementById('pn').textContent = n.name_ar;
  document.getElementById('pl').textContent = n.name_latin || '';

  const colls = Array.isArray(n.collections) ? n.collections : (typeof n.collections === 'string' ? JSON.parse(n.collections) : []);
  const teachers = state.transmissions.filter(t => t.student_id === n.id).map(t => state.narrators.find(x => x.id === t.teacher_id)).filter(Boolean);
  const students = state.transmissions.filter(t => t.teacher_id === n.id).map(t => state.narrators.find(x => x.id === t.student_id)).filter(Boolean);
  const nh = state.hadiths.filter(h => h.narrator_id === n.id);

  document.getElementById('pb').innerHTML = `
    <a href="narrator.html?id=${n.id}" target="_blank" style="display:block;text-align:center;padding:9px;margin-bottom:14px;background:rgba(201,168,76,.1);border:0.5px solid rgba(201,168,76,.3);border-radius:8px;color:var(--gold);font-family:'Cairo',sans-serif;font-size:12px;text-decoration:none;transition:background .2s;" onmouseover="this.style.background='rgba(201,168,76,.18)'" onmouseout="this.style.background='rgba(201,168,76,.1)'">الفيشة الكاملة ↗</a>
    <div class="ir"><span class="il">وفاته</span><span class="iv">${n.death_ah ? n.death_ah + ' هـ' : '—'}</span></div>
    <div class="ir"><span class="il">المنشأ</span><span class="iv">${n.origin || '—'}</span></div>
    <div class="ir"><span class="il">الأحاديث</span><span class="iv">${(n.hadith_count || 0).toLocaleString()}</span></div>
    <div class="ir"><span class="il">الحكم</span><span class="iv">${n.reliability || '—'}</span></div>
    ${colls.length ? `<div class="ps"><div class="pst">المصادر</div>${colls.map(c => `<span class="tag tc">${c}</span>`).join('')}</div>` : ''}
    ${teachers.length ? `<div class="ps"><div class="pst">شيوخه (${teachers.length})</div>${teachers.map(t => `<div class="pl-item" data-narrator-id="${t.id}"><div class="pl-d" style="background:${GCS[t.generation]};box-shadow:0 0 4px ${GCS[t.generation]}"></div><span class="pl-n">${t.name_ar}</span><span class="pl-e">${t.death_ah || ''}هـ</span></div>`).join('')}</div>` : ''}
    ${students.length ? `<div class="ps"><div class="pst">تلاميذه (${students.length})</div>${students.map(s => `<div class="pl-item" data-narrator-id="${s.id}"><div class="pl-d" style="background:${GCS[s.generation]};box-shadow:0 0 4px ${GCS[s.generation]}"></div><span class="pl-n">${s.name_ar}</span><span class="pl-e">${s.death_ah || ''}هـ</span></div>`).join('')}</div>` : ''}
    ${nh.length ? `<div class="ps"><div class="pst">أحاديثه</div>${nh.map(h => `<div class="hc"><div class="ht">${h.text_ar}</div><div class="hm">${h.collection || ''}${h.chapter ? ' - ' + h.chapter : ''}</div></div>`).join('')}</div>` : ''}
  `;

  // Hadiths not in the preloaded sample: load them for this narrator
  if (!nh.length) loadPanelHadiths(n.id);

  // Bind click events on narrator items
  document.getElementById('pb').querySelectorAll('.pl-item[data-narrator-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = parseInt(el.dataset.narratorId);
      focusNarrator(id);
    });
  });

  document.getElementById('panel').classList.add('open');
  updateTimeline(n);
  updateGeoAxis(n);
  flyTo(n);
}

async function loadPanelHadiths(id) {
  try {
    const rows = await getHadiths({ narratorId: id, limit: 30 });
    if (!rows.length || state.selId !== id) return;
    const div = document.createElement('div');
    div.className = 'ps';
    div.innerHTML = `<div class="pst">أحاديثه</div>${rows.map(h => `<div class="hc"><div class="ht">${h.text_ar}</div><div class="hm">${h.collection || ''}${h.chapter ? ' - ' + h.chapter : ''}</div></div>`).join('')}`;
    document.getElementById('pb').appendChild(div);
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

export function focusNarrator(id) {
  const n = state.narrators.find(x => x.id === id);
  if (n) openPanel(n);
}
