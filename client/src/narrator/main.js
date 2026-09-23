import '../styles/narrator.css';
import { GCS, GL, kindOf, KINDS, gradeAr, graderAr, fmtYear, deathAt } from '../lib/constants.js';
import { getCollections } from '../lib/api.js';
import { getCoords } from '../lib/utils.js';
import { getNarratorById, getTransmissionsByNarrator, getHadith, getNarratorMap, getHadithRowsByNarrator, getRijal, getManifest } from '../lib/api.js';

const NUM_AR = '٠١٢٣٤٥٦٧٨٩';
const ar = s => String(s ?? '');
const COLL_NAMES = { bukhari: 'البخاري', muslim: 'مسلم', abudawud: 'أبو داود', tirmidhi: 'الترمذي', nasai: 'النسائي', ibnmajah: 'ابن ماجه', malik: 'الموطأ' };
import { initBg } from './background.js';
import { drawMap } from './map.js';
import { drawMiniTimeline } from './mini-timeline.js';
import { drawIsnad } from './isnad-graph.js';
import { buildRijal } from './rijal.js';

function showNotFound() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('notfound').style.display = 'block';
}

async function main() {
  initBg();

  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if (!id) { showNotFound(); return; }

  try {
    const [n, transData, hadithRows, narMap, rijal, manifest] = await Promise.all([
      getNarratorById(id),
      getTransmissionsByNarrator(id),
      getHadithRowsByNarrator(id),
      getNarratorMap(),
      getRijal(id),
      getManifest(),
    ]);
    const hadithIds = hadithRows.map(r => r.id);

    if (!n) { showNotFound(); return; }
    const col = GCS[n.generation] || '#c9a84c';

    const byWeight = (a, b) => b.count - a.count;
    const teacherRows = (transData || []).filter(t => t.student_id == id).sort(byWeight).map(t => ({ n: narMap.get(t.teacher_id), w: t.count })).filter(x => x.n);
    const studentRows = (transData || []).filter(t => t.teacher_id == id).sort(byWeight).map(t => ({ n: narMap.get(t.student_id), w: t.count })).filter(x => x.n);
    const teachers = teacherRows.map(x => x.n), students = studentRows.map(x => x.n);

    document.title = 'سماء الحديث · ' + n.name_ar;

    // HERO
    const colls = Array.isArray(n.collections) ? n.collections : [];
    document.getElementById('hero-star').innerHTML = `<svg viewBox="0 0 24 24" width="36" height="36" fill="${col}"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
    document.getElementById('hero-star').style.color = col;
    document.getElementById('hero-gen').textContent = (GL[n.generation] || n.generation) + (n.compiler ? ' · مؤلِّف' : '');
    document.getElementById('hero-gen').style.color = col;
    document.getElementById('hero-name').textContent = n.name_ar;
    document.getElementById('hero-name').style.color = col;
    document.getElementById('hero-latin').textContent = n.name_latin || '';
    const tags = [...(n.unnamed ? ['لم يُسمَّ في الإسناد'] : []), ...(n.origin ? [n.origin] : []), ...colls.slice(0, 3)];
    document.getElementById('hero-tags').innerHTML = tags.map(t => `<span class="htag">${t}</span>`).join('');
    document.getElementById('hero').style.display = 'flex';
    document.getElementById('hero').style.borderColor = col + '44';

    // BIOGRAPHY — curated notice when available + a portrait computed from the corpus
    renderBiography(n, teacherRows, studentRows, hadithRows, transData, await getCollections(), rijal, manifest.layer_names || {});

    // STATS
    document.getElementById('st-hadiths').textContent = ar((hadithIds.length || n.hadith_count || 0).toLocaleString('en'));
    document.getElementById('st-death').textContent = n.death_ah ? fmtYear(n.death_ah, n.death_estimated) : '—';
    if (n.death_estimated) document.getElementById('st-death').title = 'تاريخ مقدَّر من موقعه في الأسانيد';
    document.getElementById('st-teachers').textContent = teachers.length;
    document.getElementById('st-students').textContent = students.length;
    document.getElementById('stats').style.display = 'grid';

    // MINI TIMELINE
    document.getElementById('sec-tl').style.display = 'block';
    drawMiniTimeline(n, col);

    // MAP
    const coords = getCoords(n.origin);
    if (coords) {
      document.getElementById('sec-map').style.display = 'block';
      setTimeout(() => drawMap(coords, n.origin), 100);
    }

    // ISNAD GRAPH
    if (teachers.length || students.length) {
      document.getElementById('sec-isnad').style.display = 'block';
      setTimeout(() => drawIsnad(n, teachers, students), 100);
    }

    // TEACHERS / STUDENTS — complete lists
    const personRow = ({ n: x, w }) => `<a class="person-row" href="narrator.html?id=${x.id}"><i style="background:${GCS[x.generation] || '#c9a84c'}"></i><span class="person-name">${x.name_ar}</span><span class="person-meta">${w > 1 ? '×' + ar(w) + ' · ' : ''}${x.death_ah ? fmtYear(x.death_ah, x.death_estimated) : ''}</span></a>`;
    if (teacherRows.length || studentRows.length) {
      document.getElementById('sec-people').style.display = 'block';
      document.getElementById('teachers-list').innerHTML = teacherRows.length ? `<div class="people-title">روى عن <span>${ar(teacherRows.length)}</span></div>` + teacherRows.map(personRow).join('') : '';
      document.getElementById('students-list').innerHTML = studentRows.length ? `<div class="people-title">روى عنه <span>${ar(studentRows.length)}</span></div>` + studentRows.map(personRow).join('') : '';
    }

    // HADITHS — every hadith in whose isnad the narrator appears, grouped by collection; click to load the full text
    if (hadithRows.length) {
      document.getElementById('sec-hadiths').style.display = 'block';
      document.querySelector('#sec-hadiths .section-title').textContent = `أحاديثه (${ar(hadithRows.length)})`;
      const list = document.getElementById('hadiths-list');
      const byColl = new Map();
      for (const r of hadithRows) (byColl.get(r.collName) || byColl.set(r.collName, []).get(r.collName)).push(r);
      list.innerHTML = [...byColl].map(([name, rows], i) => `
        <details class="hgroup" ${i === 0 ? 'open' : ''}><summary>${name} <span>${ar(rows.length)}</span></summary>
        ${rows.map(r => `<div class="hadith-item" data-h="${r.id}">
            <div class="hadith-text hadith-snippet">${r.snippet ? r.snippet + '…' : '<i>النص غير متوفر في المصدر</i>'}</div>
            <div class="hadith-meta"><span class="hadith-tag">${name} ${ar(r.num)}</span>${kindOf(r.kind) ? `<span class="hadith-tag" style="color:${kindOf(r.kind).col}" title="${kindOf(r.kind).title}">${kindOf(r.kind).label}</span>` : ''}<span class="hadith-tag">${ar(r.chain)} رواة</span><a class="hadith-tag hadith-go" href="index.html?hadith=${encodeURIComponent(r.id)}">مسار الإسناد ↗</a></div>
          </div>`).join('')}
        </details>`).join('');
      list.querySelectorAll('.hadith-item[data-h]').forEach(el => el.addEventListener('click', async e => {
        if (e.target.closest('a')) return;
        if (el.dataset.loaded) { el.classList.toggle('collapsed'); return; }
        el.dataset.loaded = 1;
        const h = await getHadith(el.dataset.h);
        if (!h) return;
        const gr = (h.grades || []).find(g => g.grade && gradeAr(g.grade));
        el.querySelector('.hadith-snippet').innerHTML = `${h.isnad_ar ? `<div class="hadith-isnad">${h.isnad_ar}</div>` : ''}<div>${h.matn_ar || ''}</div>${h.text_en ? `<div class="hadith-en">${h.text_en}</div>` : ''}`;
        if (h.section?.name_ar || h.section?.name_en) el.querySelector('.hadith-meta').insertAdjacentHTML('afterbegin', `<span class="hadith-tag">${h.section.name_ar || h.section.name_en}</span>`);
        if (gr) el.querySelector('.hadith-meta').insertAdjacentHTML('afterbegin', `<span class="hadith-tag hadith-grade-sahih" title="حكم ${graderAr(gr.name)}">${gradeAr(gr.grade)}</span>`);
      }));
    }

    // RIJAL — the full notice of Tahdhīb al-Tahdhīb (critics' statements, teachers, students)
    if (rijal && (rijal.tahdhib || rijal.notices?.length)) { document.getElementById('sec-rijal').style.display = 'block'; buildRijal(n, rijal); document.querySelector('#sec-rijal .section-title').textContent = `تراجمه في كتب الرجال (${(rijal.notices?.length || 0) + (rijal.tahdhib ? 1 : 0)})`; }

    // Hide loading
    const ld = document.getElementById('loading');
    ld.style.opacity = '0';
    setTimeout(() => ld.style.display = 'none', 600);
  } catch (e) {
    console.error(e);
    showNotFound();
  }
}

main();


// ── ترجمة الراوي ─────────────────────────────────────────────────────────
const LAYER_TEXT = { sahabi: 'من الصحابة رضوان الله عليهم', tabii: 'من التابعين', muhaddith: 'من المحدّثين وأتباع التابعين ومن بعدهم', rijal: 'من علماء الرجال' };
const KIND_LABEL = { marfu: 'مرفوعة إلى النبي ﷺ', mawquf: 'موقوفة على صحابي', maqtu: 'مقطوعة على تابعي', balagh: 'بلاغات', ray: 'آراء وأقوال' };
const joinAr = (arr) => arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join('، ') + ' و' + arr[arr.length - 1];
const plural = (n, one, two, many, manyAcc) => n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${many}` : `${n} ${manyAcc}`;

const DEATH_SRC = { reference: 'من المصادر', taqrib: 'تقريب التهذيب', taqrib_approx: 'تقريب التهذيب (تقريباً)', rijal: 'كتب الرجال الأخرى', estimated: 'تقديري من موقعه في الأسانيد' };
function renderBiography(n, teachers, students, hadithRows, trans, collections, rijal, layerNames) {
  const sec = document.getElementById('sec-bio');
  sec.style.display = 'block';
  const col = GCS[n.generation] || '#c9a84c';

  // 1. curated notice
  const bioEl = document.getElementById('bio-text');
  if (n.bio) { bioEl.innerHTML = `<div class="prov">من كتب التراجم (تقريب التهذيب، سير أعلام النبلاء، الإصابة)</div>${n.bio}`; bioEl.style.borderColor = col + '55'; }
  else bioEl.style.display = 'none';

  // 1b. Taqrīb al-Tahdhīb (Ibn Ḥajar): the entry itself, with its number
  const rq = document.getElementById('bio-rijal');
  if (n.taqrib && rijal?.taqrib) {
    const t = n.taqrib;
    const parts = [];
    if (t.grade) parts.push(`<span class="rq-chip">الحكم: ${t.grade}</span>`);
    if (t.layer) parts.push(`<span class="rq-chip">الطبقة ${t.layer}: ${layerNames[t.layer] || ''}</span>`);
    if (t.death) parts.push(`<span class="rq-chip">الوفاة: ${t.approx ? 'نحو ' : ''}${fmtYear(t.death)}</span>`);
    rq.innerHTML = `<div class="prov">تقريب التهذيب لابن حجر العسقلاني، ${deathAt(852)} · الترجمة رقم ${t.n} · نص OpenITI</div><div class="rq-text">${rijal.taqrib}</div><div class="rq-chips">${parts.join('')}</div>`;
    rq.style.borderColor = col + '55';
  } else rq.style.display = 'none';

  // 2. portrait computed from the corpus
  const total = hadithRows.length;
  const byColl = collections.map(c => [c.title_ar || c.name_ar, n.coll_counts?.[c.code] || 0, c.name_ar]).filter(x => x[1]);
  const kinds = Object.entries(n.kind_counts || {}).sort((a, b) => b[1] - a[1]);
  const directLinks = trans.reduce((a, t) => a + (t.direct || 0), 0), allLinks = trans.reduce((a, t) => a + (t.count || 0), 0);
  const directPct = allLinks ? Math.round(100 * directLinks / allLinks) : null;
  const topT = teachers.slice(0, 5).map(x => `${x.n.name_ar} (${x.w})`);
  const topS = students.slice(0, 5).map(x => `${x.n.name_ar} (${x.w})`);

  const p = [];
  p.push(`<b>${n.name_ar}</b>${n.name_latin ? ` <span class="latin">${n.name_latin}</span>` : ''}، ${LAYER_TEXT[n.generation] || ''}${n.origin ? `، من أهل ${n.origin}` : ''}${n.death_ah ? `، ${n.death_estimated ? 'يُقدَّر أنه توفي نحو سنة' : 'توفي سنة'} ${fmtYear(n.death_ah)}` : ''}${n.reliability ? `، حكمه عند النقّاد: «${n.reliability}»` : ''}.${n.compiler ? ' وهو مؤلِّف أحد الكتب المعتمدة في هذا الأطلس، فيبدأ به إسناد كل حديث في كتابه.' : ''}`);
  if (teachers.length || students.length) {
    let t = '';
    if (teachers.length) t += `روى عن ${plural(teachers.length, 'راوٍ واحد', 'راويين', 'رواة', 'راوياً')}${topT.length > 1 ? `، وأكثر مروياته عن ${joinAr(topT)}` : ''}`;
    if (students.length) t += `${t ? '، و' : ''}روى عنه ${plural(students.length, 'راوٍ واحد', 'راويان', 'رواة', 'راوياً')}${topS.length > 1 ? `، وأكثرهم رواية عنه ${joinAr(topS)}` : ''}`;
    p.push(t + '.' + (directPct != null ? ` نسبة ما صُرِّح فيه بالسماع (حدثنا، أخبرنا، سمعت) من روابطه ${directPct}٪، والباقي بالعنعنة.` : ''));
  }
  if (total) {
    let t = `ورد في ${plural(total, 'حديث واحد', 'حديثين', 'أحاديث', 'حديثاً')} من كتب هذا الأطلس`;
    if (byColl.length) t += `: ${joinAr(byColl.map(([c, k]) => `${k} في ${c}`))}`;
    t += '.';
    if (kinds.length) t += ` وهي بحسب نوعها: ${joinAr(kinds.map(([k, v]) => `${v} ${KIND_LABEL[k] || k}`))}.`;
    p.push(t);
  }
  if (n.depth != null && !n.compiler) {
    const pos = n.depth >= 4.5 ? 'في آخر السند، أي في طبقة الصحابة والتابعين الأوائل' : n.depth >= 3 ? 'في وسط السند' : n.depth >= 1.5 ? 'في أوائل السند قريباً من المصنِّفين' : 'في أول السند، ممن روى عنهم المصنِّفون مباشرة';
    p.push(`موقعه في الأسانيد ${pos} (متوسط رتبته ${n.depth} من المصنِّف).`);
  }
  document.getElementById('bio-profile').innerHTML = `<div class="prov">مستخرج آلياً من أسانيد الكتب السبعة${n.death_estimated && !n.layer ? '؛ التاريخ والطبقة تقديريان ما لم يُذكر خلاف ذلك' : n.death_estimated ? '؛ التاريخ تقديري' : ''}</div>` + p.map(x => `<p>${x}</p>`).join('');

  // 3. facts grid
  const facts = [
    ['الطبقة', GL[n.generation] || n.generation],
    ['طبقته عند ابن حجر', n.layer ? `${n.layer} · ${layerNames[n.layer] || ''}` : '—'],
    ['الوفاة', n.death_ah ? `${fmtYear(n.death_ah)}${n.death_estimated ? ' (تقديري)' : ''}` : '—'],
    ['مصدر التاريخ', DEATH_SRC[n.death_source] || '—'],
    ['المنشأ', n.origin || '—'],
    ['الحكم', n.reliability || '—'],
    ['روى عن', teachers.length], ['روى عنه', students.length],
    ['الأحاديث', total], ['روابط السند', allLinks],
    ['المصادر', byColl.map(x => x[2]).join('، ') || '—'],
  ];
  document.getElementById('bio-facts').innerHTML = facts.map(([k, v]) => `<div class="fact"><span class="fact-k">${k}</span><span class="fact-v">${v}</span></div>`).join('');
}
