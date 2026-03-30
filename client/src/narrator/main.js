import '../styles/narrator.css';
import { GCS, GL } from '../lib/constants.js';
import { getCoords } from '../lib/utils.js';
import { getNarratorById, getTransmissionsByNarrator, getHadiths, getNarratorsLite } from '../lib/api.js';
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
    const [n, transData, hadithData, allNar] = await Promise.all([
      getNarratorById(id),
      getTransmissionsByNarrator(id),
      getHadiths({ narratorId: id, limit: 30 }),
      getNarratorsLite(),
    ]);

    if (!n) { showNotFound(); return; }
    const col = GCS[n.generation] || '#c9a84c';

    const narMap = {};
    (allNar || []).forEach(x => narMap[x.id] = x);

    const teacherIds = (transData || []).filter(t => t.student_id == id).map(t => t.teacher_id);
    const studentIds = (transData || []).filter(t => t.teacher_id == id).map(t => t.student_id);
    const teachers = teacherIds.map(i => narMap[i]).filter(Boolean);
    const students = studentIds.map(i => narMap[i]).filter(Boolean);

    document.title = 'سماء الحديث · ' + n.name_ar;

    // HERO
    const colls = Array.isArray(n.collections) ? n.collections : (n.collections ? JSON.parse(n.collections) : []);
    document.getElementById('hero-star').innerHTML = `<svg viewBox="0 0 24 24" width="36" height="36" fill="${col}"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
    document.getElementById('hero-star').style.color = col;
    document.getElementById('hero-gen').textContent = GL[n.generation] || n.generation;
    document.getElementById('hero-gen').style.color = col;
    document.getElementById('hero-name').textContent = n.name_ar;
    document.getElementById('hero-name').style.color = col;
    document.getElementById('hero-latin').textContent = n.name_latin || '';
    const tags = [...(n.origin ? [n.origin] : []), ...colls.slice(0, 3)];
    document.getElementById('hero-tags').innerHTML = tags.map(t => `<span class="htag">${t}</span>`).join('');
    document.getElementById('hero').style.display = 'flex';
    document.getElementById('hero').style.borderColor = col + '44';

    // STATS
    document.getElementById('st-hadiths').textContent = (n.hadith_count || 0).toLocaleString();
    document.getElementById('st-death').textContent = n.death_ah ? n.death_ah + ' هـ' : '—';
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
        const gradeClass = h.chapter?.includes('صحيح') ? 'hadith-grade-sahih' : h.chapter?.includes('حسن') ? 'hadith-grade-hasan' : '';
        return `<div class="hadith-item">
          <div class="hadith-text">${h.text_ar}</div>
          <div class="hadith-meta">
            ${h.collection ? `<span class="hadith-tag">${h.collection}</span>` : ''}
            ${h.chapter ? `<span class="hadith-tag ${gradeClass}">${h.chapter}</span>` : ''}
          </div>
        </div>`;
      }).join('');
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
