import '../styles/narrator.css';
import { GCS, GL } from '../lib/constants.js';
import { getCoords } from '../lib/utils.js';
import { getNarratorById, getTransmissionsByNarrator, getHadiths, getNarratorMap, getHadithIdsByNarrator } from '../lib/api.js';

const NUM_AR = '٠١٢٣٤٥٦٧٨٩';
const ar = s => String(s ?? '').replace(/\d/g, d => NUM_AR[d]);
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
    const [n, transData, hadithData, narMap, hadithIds] = await Promise.all([
      getNarratorById(id),
      getTransmissionsByNarrator(id),
      getHadiths({ narratorId: id, limit: 30 }),
      getNarratorMap(),
      getHadithIdsByNarrator(id),
    ]);

    if (!n) { showNotFound(); return; }
    const col = GCS[n.generation] || '#c9a84c';

    const byWeight = (a, b) => b.count - a.count;
    const teachers = (transData || []).filter(t => t.student_id == id).sort(byWeight).map(t => narMap.get(t.teacher_id)).filter(Boolean);
    const students = (transData || []).filter(t => t.teacher_id == id).sort(byWeight).map(t => narMap.get(t.student_id)).filter(Boolean);

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
    const tags = [...(n.origin ? [n.origin] : []), ...colls.slice(0, 3)];
    document.getElementById('hero-tags').innerHTML = tags.map(t => `<span class="htag">${t}</span>`).join('');
    document.getElementById('hero').style.display = 'flex';
    document.getElementById('hero').style.borderColor = col + '44';

    // STATS
    document.getElementById('st-hadiths').textContent = ar((hadithIds.length || n.hadith_count || 0).toLocaleString('en'));
    document.getElementById('st-death').textContent = n.death_ah ? ar(n.death_ah) + ' هـ' + (n.death_estimated ? ' ~' : '') : '—';
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

    // HADITHS
    if (hadithData && hadithData.length > 0) {
      document.getElementById('sec-hadiths').style.display = 'block';
      const list = document.getElementById('hadiths-list');
      list.innerHTML = hadithData.map(h => {
        const grade = (h.grades || []).find(g => g.grade)?.grade;
        const gradeClass = grade?.includes('صحيح') || grade?.toLowerCase().includes('sahih') ? 'hadith-grade-sahih' : grade?.includes('حسن') || grade?.toLowerCase().includes('hasan') ? 'hadith-grade-hasan' : '';
        return `<a class="hadith-item" href="index.html?hadith=${encodeURIComponent(h.id)}" title="تتبّع مسار الإسناد في السماء">
          ${h.isnad_ar ? `<div class="hadith-isnad">${h.isnad_ar}</div>` : ''}
          <div class="hadith-text">${h.matn_ar || ''}</div>
          <div class="hadith-meta">
            <span class="hadith-tag">${COLL_NAMES[h.coll] || h.coll} ${ar(h.num)}</span>
            ${h.section?.name_en ? `<span class="hadith-tag">${h.section.name_en}</span>` : ''}
            ${grade ? `<span class="hadith-tag ${gradeClass}">${grade}</span>` : ''}
            <span class="hadith-tag hadith-go">مسار الإسناد ↗</span>
          </div>
        </a>`;
      }).join('') + (hadithIds.length > hadithData.length ? `<div class="hadith-more">يظهر ${ar(hadithData.length)} من ${ar(hadithIds.length)} حديثاً ورد فيها هذا الراوي</div>` : '');
    }

    // RIJAL
    document.getElementById('sec-rijal').style.display = 'block';
    buildRijal(n);

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
