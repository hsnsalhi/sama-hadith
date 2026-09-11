// مسار الحديث — hadith mode: search a hadith, then trace its isnad through the sky.
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { state } from './state.js';
import { GC_HEX, GCS, GL } from '../lib/constants.js';
import { setHighlight, positionOf } from './stars.js';
import { updateTimelineRange } from './timeline.js';
import { updateGeoAxis } from './geo-axis.js';
import { openPanel } from './panel.js';
import { getAllHadithIndexes, getHadith, getHadithNeighbours, getManifest, splitHadithId } from '../lib/api.js';

const NUM_AR = '٠١٢٣٤٥٦٧٨٩';
export const toArabicDigits = s => String(s).replace(/\d/g, d => NUM_AR[d]);
const stripAr = s => (s || '').replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase();

// ── DOM: label layer for the path ──────────────────────────────────────────
const layer = document.createElement('div');
layer.id = 'path-layer';
layer.setAttribute('dir', 'rtl');
document.body.appendChild(layer);

let lineObjects = [];   // THREE objects added to the scene
let labelItems = [];    // { el, pos: Vector3, kind }
let collections = [];   // from manifest
let connectors = [];    // connector vocabulary
let connectorTypes = []; // direct | indirect | quote
let flatIndex = null;   // [{id, coll, num, snippet, norm}]
let collFilter = null;  // collection code or null
let flyTimer = null;

export function isHadithMode() { return state.mode === 'hadith'; }

// ── Init: tabs, chips, search behaviour ────────────────────────────────────
export async function initHadithMode() {
  const m = await getManifest();
  collections = m.collections;
  connectors = m.connectors;
  connectorTypes = m.connector_types || [];

  const chips = document.getElementById('sw-colls');
  chips.innerHTML = `<button class="chip on" data-c="">الكل</button>` +
    collections.map(c => `<button class="chip" data-c="${c.code}">${c.name_ar}</button>`).join('') +
    `<button class="chip rnd" id="sw-random" title="حديث عشوائي">🎲</button>`;
  chips.querySelectorAll('.chip[data-c]').forEach(b => b.addEventListener('click', () => {
    collFilter = b.dataset.c || null;
    chips.querySelectorAll('.chip[data-c]').forEach(x => x.classList.toggle('on', x === b));
    runHadithSearch(document.getElementById('si').value);
  }));
  document.getElementById('sw-random').addEventListener('click', randomHadith);

  document.querySelectorAll('#sw-tabs .swt').forEach(t => t.addEventListener('click', () => setMode(t.dataset.m)));

  document.getElementById('pcl').addEventListener('click', () => { if (state.hadith) clearPath(); });
  window.addEventListener('resize', () => lineObjects.forEach(o => o.material.resolution?.set(innerWidth, innerHeight)));
}

export function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('#sw-tabs .swt').forEach(t => t.classList.toggle('on', t.dataset.m === mode));
  const si = document.getElementById('si');
  si.placeholder = mode === 'hadith' ? 'ابحث في الأحاديث بكلمة أو رقم…' : 'ابحث عن راوٍ...';
  document.getElementById('sw-colls').style.display = mode === 'hadith' ? 'flex' : 'none';
  document.getElementById('sr').style.display = 'none';
  si.value = '';
  si.focus();
}

async function ensureIndex() {
  if (flatIndex) return flatIndex;
  const sr = document.getElementById('sr');
  sr.innerHTML = `<div class="sri-empty">جارٍ تحميل فهرس الأحاديث…</div>`;
  sr.style.display = 'block';
  const lists = await getAllHadithIndexes();
  flatIndex = [];
  for (const { coll, rows } of lists) for (const r of rows) flatIndex.push({ id: r[0], coll: coll.code, collName: coll.name_ar, num: r[1], snippet: r[2], chain: r[3], norm: stripAr(r[2]) });
  return flatIndex;
}

export async function runHadithSearch(qRaw) {
  const sr = document.getElementById('sr');
  const q = (qRaw || '').trim();
  if (!q && !collFilter) { sr.style.display = 'none'; return; }
  const idx = await ensureIndex();
  const numMatch = q.match(/^(\D*?)\s*([\d٠-٩]+(?:\.\d+)?)$/u);
  const wantNum = numMatch ? numMatch[2].replace(/[٠-٩]/g, d => NUM_AR.indexOf(d)) : null;
  const collWord = numMatch ? stripAr(numMatch[1]) : '';
  const words = wantNum ? [] : stripAr(q).split(/\s+/).filter(w => w.length > 1);

  let res = [];
  for (const r of idx) {
    if (collFilter && r.coll !== collFilter) continue;
    if (wantNum) {
      if (r.num !== wantNum && !r.num.startsWith(wantNum + '.')) continue;
      if (collWord && !stripAr(r.collName).includes(collWord)) continue;
    } else if (words.length) {
      if (!words.every(w => r.norm.includes(w))) continue;
    }
    res.push(r);
    if (res.length >= 60) break;
  }
  if (!res.length) { sr.innerHTML = `<div class="sri-empty">لا نتائج</div>`; sr.style.display = 'block'; return; }
  sr.innerHTML = res.map(r => `
    <div class="sri hr" data-h="${r.id}">
      <span class="sri-c">${r.collName} <b>${toArabicDigits(r.num)}</b></span>
      <span class="sri-t">${r.snippet || '—'}</span>
      <span class="sri-k" title="عدد الرواة">${toArabicDigits(r.chain)}</span>
    </div>`).join('');
  sr.style.display = 'block';
  sr.querySelectorAll('.sri[data-h]').forEach(el => el.addEventListener('click', () => { sr.style.display = 'none'; openHadith(el.dataset.h); }));
}

async function randomHadith() {
  const idx = await ensureIndex();
  const pool = idx.filter(r => (!collFilter || r.coll === collFilter) && r.chain >= 3);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  document.getElementById('sr').style.display = 'none';
  if (pick) openHadith(pick.id);
}

// ── Open a hadith: path + panel + camera ───────────────────────────────────
export async function openHadith(id, { fly = true } = {}) {
  const h = await getHadith(id);
  if (!h) return;
  clearPath({ keepMode: true });
  state.hadith = h;
  state.selId = null;
  if (state.selLines) { state.scene.remove(state.selLines); state.selLines = null; }
  if (state.starPoints) state.starPoints.material.uniforms.uSelected.value = -1;

  const ids = new Set(h.isnad.nodes);
  for (const e of h.isnad.edges) { ids.add(e[0]); ids.add(e[1]); }
  setHighlight(ids);
  buildLines(h);
  buildLabels(h, ids);
  renderPanel(h);

  const pts = [...ids].map(i => state.narById.get(i)).filter(Boolean).map(positionOf);
  if (fly && pts.length) fitCamera(pts);
  const deaths = [...ids].map(i => state.narById.get(i)?.death_ah).filter(Boolean);
  if (deaths.length) updateTimelineRange(Math.min(...deaths), Math.max(...deaths), collectionTitle(h.coll) + ' ' + toArabicDigits(h.num), '#f0d080');
  updateGeoAxis(null);
  try { history.replaceState(null, '', `?hadith=${encodeURIComponent(id)}`); } catch {}
}

export function clearPath({ keepMode = false } = {}) {
  for (const o of lineObjects) { state.scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
  lineObjects = [];
  for (const l of labelItems) l.el.remove();
  labelItems = [];
  setHighlight(null);
  state.hadith = null;
  updateTimelineRange(null);
  if (!keepMode) { try { history.replaceState(null, '', location.pathname); } catch {} }
}

function collectionTitle(code) { return collections.find(c => c.code === code)?.title_ar || code; }

// Lines: solid for direct transmission (حدثنا…), dashed for "عن", faint dashed for inherited edges
function buildLines(h) {
  const groups = { direct: [], indirect: [], quote: [], inherited: [] };
  for (const [s, t, c, inh] of h.isnad.edges) {
    const a = state.narById.get(s), b = state.narById.get(t);
    if (!a || !b) continue;
    const pa = positionOf(a), pb = positionOf(b);
    const ca = new THREE.Color(GC_HEX[a.generation] || 0xc9a84c), cb = new THREE.Color(GC_HEX[b.generation] || 0xc9a84c);
    const ty = connectorTypes[c] || (connectors[c] === 'عن' ? 'indirect' : 'direct');
    const kind = inh ? 'inherited' : ty === 'indirect' ? 'indirect' : ty === 'quote' ? 'quote' : 'direct';
    groups[kind].push({ pa, pb, ca, cb });
  }
  const make = (segs, { width, opacity, dashed, glow }) => {
    if (!segs.length) return;
    const pos = [], col = [];
    for (const s of segs) { pos.push(s.pa.x, s.pa.y, s.pa.z, s.pb.x, s.pb.y, s.pb.z); col.push(s.ca.r, s.ca.g, s.ca.b, s.cb.r, s.cb.g, s.cb.b); }
    const geo = new LineSegmentsGeometry();
    geo.setPositions(pos); geo.setColors(col);
    const mat = new LineMaterial({ linewidth: width, vertexColors: true, transparent: true, opacity, dashed, dashSize: 3, gapSize: 2.2, depthTest: false, blending: THREE.AdditiveBlending });
    mat.resolution.set(innerWidth, innerHeight);
    const line = new LineSegments2(geo, mat);
    line.computeLineDistances();
    line.renderOrder = 5;
    state.scene.add(line); lineObjects.push(line);
    if (glow) {
      const gm = new LineMaterial({ linewidth: width * 3.2, vertexColors: true, transparent: true, opacity: opacity * 0.16, depthTest: false, blending: THREE.AdditiveBlending });
      gm.resolution.set(innerWidth, innerHeight);
      const g = new LineSegments2(geo, gm); g.renderOrder = 4;
      state.scene.add(g); lineObjects.push(g);
    }
  };
  make(groups.direct, { width: 2.6, opacity: 0.95, dashed: false, glow: true });
  make(groups.indirect, { width: 2.2, opacity: 0.85, dashed: true, glow: true });
  make(groups.quote, { width: 1.6, opacity: 0.6, dashed: true, glow: false });      // معلَّق / قال فلان
  make(groups.inherited, { width: 1.4, opacity: 0.45, dashed: true, glow: false }); // بهذا الإسناد (from the previous hadith)
}

function buildLabels(h, ids) {
  for (const id of ids) {
    const n = state.narById.get(id); if (!n) continue;
    const el = document.createElement('div');
    el.className = 'plbl node' + (n.compiler ? ' compiler' : '');
    el.style.setProperty('--c', GCS[n.generation] || '#c9a84c');
    el.innerHTML = `<span class="plbl-n">${n.name_ar}</span><span class="plbl-d">${n.death_ah ? toArabicDigits(n.death_ah) + ' هـ' + (n.death_estimated ? ' ~' : '') : ''}</span>`;
    el.addEventListener('click', () => openPanel(n, { keepPath: true }));
    layer.appendChild(el);
    labelItems.push({ el, pos: positionOf(n), kind: 'node' });
  }
  for (const [s, t, c, inh] of h.isnad.edges) {
    if (inh) continue;
    const a = state.narById.get(s), b = state.narById.get(t); if (!a || !b) continue;
    const el = document.createElement('div');
    el.className = 'plbl conn';
    el.textContent = connectors[c] || '';
    layer.appendChild(el);
    labelItems.push({ el, pos: positionOf(a).clone().lerp(positionOf(b), 0.5), kind: 'conn' });
  }
}

/** Called every frame from the animation loop. */
export function updatePathLabels() {
  if (!labelItems.length) return;
  const placed = [];
  for (const it of labelItems) {
    const v = it.pos.clone().project(state.camera);
    if (v.z > 1 || v.z < -1) { it.el.style.display = 'none'; continue; }
    const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
    if (it.kind === 'conn' && placed.some(p => Math.hypot(p[0] - sx, p[1] - sy) < 34)) { it.el.style.display = 'none'; continue; }
    placed.push([sx, sy]);
    it.el.style.display = '';
    it.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, ${it.kind === 'node' ? '14px' : '-50%'})`;
  }
}

function fitCamera(points) {
  const center = new THREE.Vector3();
  points.forEach(p => center.add(p)); center.multiplyScalar(1 / points.length);
  let r = 0; points.forEach(p => { r = Math.max(r, p.distanceTo(center)); });
  const fov = state.camera.fov * Math.PI / 180;
  const dist = Math.max(90, Math.min(900, (r / Math.tan(fov / 2)) * 1.35 + 40));
  state.targetSpherical.radius = dist;
  const start = state.panTarget.clone();
  let t = 0;
  if (flyTimer) clearInterval(flyTimer);
  flyTimer = setInterval(() => {
    t += 0.04; if (t >= 1) { t = 1; clearInterval(flyTimer); }
    const e = 1 - Math.pow(1 - t, 3);
    state.panTarget.lerpVectors(start, center, e);
  }, 16);
  document.getElementById('zv').textContent = Math.round(350 / dist * 100) + '%';
}

// ── Panel ──────────────────────────────────────────────────────────────────
function levelsOf(h) {
  const compiler = h.isnad.edges.find(e => !h.isnad.nodes.includes(e[0]))?.[0];
  const adj = new Map();
  for (const [s, t] of h.isnad.edges) (adj.get(s) || adj.set(s, []).get(s)).push(t);
  const depth = new Map(); const q = [];
  if (compiler !== undefined) { depth.set(compiler, 0); q.push(compiler); }
  while (q.length) { const k = q.shift(); for (const t of adj.get(k) || []) if (!depth.has(t)) { depth.set(t, depth.get(k) + 1); q.push(t); } }
  for (const id of h.isnad.nodes) if (!depth.has(id)) depth.set(id, 99);
  const levels = [];
  for (const [id, d] of depth) (levels[d] ||= []).push(id);
  return { levels: levels.filter(Boolean), compiler };
}

async function renderPanel(h) {
  const { levels } = levelsOf(h);
  const connOf = (s, t) => { const e = h.isnad.edges.find(x => x[0] === s && x[1] === t); return e ? connectors[e[2]] : ''; };
  const chip = id => {
    const n = state.narById.get(id); if (!n) return '';
    const col = GCS[n.generation] || '#c9a84c';
    return `<span class="nchip" data-n="${id}" style="--c:${col}"><i></i>${n.name_ar}<small>${n.death_ah ? toArabicDigits(n.death_ah) + (n.death_estimated ? '~' : '') : ''}</small></span>`;
  };
  const chainHtml = levels.map((lvl, i) => {
    const prev = levels[i - 1] || [];
    const conns = [...new Set(lvl.flatMap(t => prev.map(s => connOf(s, t)).filter(Boolean)))];
    return `${i ? `<div class="lvl-conn">${conns.map(c => `<span>${c}</span>`).join('')}<em>↓</em></div>` : ''}<div class="lvl">${lvl.map(chip).join('')}</div>`;
  }).join('');

  const grades = (h.grades || []).filter(g => g.grade).map(g => `<span class="tag gr" title="${g.name}">${g.grade}</span>`).join('');
  document.getElementById('pdot').style.cssText = 'display:none';
  document.getElementById('pgt').textContent = collectionTitle(h.coll);
  document.getElementById('pn').textContent = 'حديث رقم ' + toArabicDigits(h.num);
  document.getElementById('pl').textContent = h.section?.name_en ? `${h.section.name_en} · كتاب ${toArabicDigits(h.section.number)}` : (h.ref ? `كتاب ${toArabicDigits(h.ref.book)} · حديث ${toArabicDigits(h.ref.hadith)}` : '');
  document.getElementById('pb').innerHTML = `
    <div class="hnav"><button id="h-prev" class="cb">‹ السابق</button><button id="h-next" class="cb">التالي ›</button></div>
    ${grades ? `<div class="ps"><div class="pst">الحكم</div>${grades}</div>` : ''}
    ${h.isnad.inherited === 'all' ? `<div class="note">هذه الفقرة بلا إسناد مستقل في المصدر؛ المسار المعروض هو إسناد الحديث السابق.</div>` : h.isnad.inherited === 'tail' ? `<div class="note">«بهذا الإسناد»: تكملة المسار مأخوذة من الحديث السابق (الخطوط المنقّطة الخافتة).</div>` : h.isnad.inherited === 'head' ? `<div class="note">يبدأ النص بـ«قال فلان» تتمةً للحديث السابق؛ بداية المسار مأخوذة منه (الخطوط المنقّطة الخافتة).</div>` : ''}
    ${h.isnad.edges.some(e => connectorTypes[e[2]] === 'quote') ? `<div class="note">يبدأ المسار بـ«قال فلان» دون سماع مصرَّح: رابطة معلَّقة (خط منقّط رفيع).</div>` : ''}
    <div class="ps"><div class="pst">سلسلة الرواة${h.isnad.reaches_prophet ? ' · تنتهي إلى النبي ﷺ' : ''}</div><div class="chain">${chainHtml}${h.isnad.reaches_prophet ? '<div class="lvl-conn"><em>↓</em></div><div class="lvl"><span class="nchip prophet">رسول الله ﷺ</span></div>' : ''}</div></div>
    ${h.isnad_ar ? `<div class="ps"><div class="pst">الإسناد</div><div class="isnad-txt">${h.isnad_ar}</div></div>` : ''}
    <div class="ps"><div class="pst">المتن</div><div class="matn-txt">${h.matn_ar || '—'}</div></div>
    ${h.text_en ? `<div class="ps"><div class="pst en-toggle" id="en-toggle">English ▸</div><div class="en-txt" id="en-txt" hidden>${h.text_en}</div></div>` : ''}
    <div class="ps"><div class="pst">مشاركة</div><input class="share" readonly value="${location.origin}${location.pathname}?hadith=${h.id}"></div>
  `;
  const pb = document.getElementById('pb');
  pb.querySelectorAll('.nchip[data-n]').forEach(el => el.addEventListener('click', () => { const n = state.narById.get(Number(el.dataset.n)); if (n) openPanel(n, { keepPath: true }); }));
  pb.querySelector('#en-toggle')?.addEventListener('click', () => { const t = pb.querySelector('#en-txt'); t.hidden = !t.hidden; });
  pb.querySelector('.share')?.addEventListener('click', e => { e.target.select(); try { navigator.clipboard?.writeText(e.target.value); } catch {} });
  document.getElementById('panel').classList.add('open');

  const nb = await getHadithNeighbours(h.id);
  const prev = pb.querySelector('#h-prev'), next = pb.querySelector('#h-next');
  prev.disabled = !nb.prev; next.disabled = !nb.next;
  prev.addEventListener('click', () => nb.prev && openHadith(nb.prev));
  next.addEventListener('click', () => nb.next && openHadith(nb.next));
}

/** Re-open the current hadith panel (after visiting a narrator). */
export function backToHadith() { if (state.hadith) renderPanel(state.hadith); }
