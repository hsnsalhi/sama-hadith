import { state } from './state.js';
import { GCS, ERAS, AVG_LIFE } from '../lib/constants.js';
import { openPanel } from './panel.js';

function tlPct(year) {
  return Math.max(0, Math.min(1, (year - state.TL_MIN) / (state.TL_MAX - state.TL_MIN))) * 100;
}

export function computeTimelineRange() {
  const deaths = state.narrators.filter(n => n.death_ah && n.death_ah > 0).map(n => n.death_ah);
  if (!deaths.length) return;
  state.TL_MIN = Math.max(1, Math.min(...deaths) - 10);
  state.TL_MAX = Math.max(...deaths) + 10;
  state.TL_MIN = Math.floor(state.TL_MIN / 10) * 10 || 1;
  state.TL_MAX = Math.ceil(state.TL_MAX / 10) * 10;
  state.ERA_MIN = state.TL_MIN;
  state.ERA_MAX = state.TL_MAX;
}

export function buildTimeline() {
  const track = document.getElementById('tl-track');

  // Eras background
  const erasEl = document.getElementById('tl-eras');
  erasEl.innerHTML = '';
  ERAS.forEach(era => {
    const left = tlPct(era.start);
    const width = tlPct(era.end) - left;
    const seg = document.createElement('div');
    seg.style.cssText = `flex:none;width:${width}%;background:${era.col}22;border-right:0.5px solid ${era.col}33;`;
    erasEl.appendChild(seg);
  });

  // Labels
  const labelsEl = document.getElementById('tl-labels');
  labelsEl.innerHTML = '';
  const range = state.TL_MAX - state.TL_MIN;
  const step = range <= 200 ? 20 : range <= 400 ? 50 : range <= 600 ? 100 : 200;
  const firstLabel = Math.ceil(state.TL_MIN / step) * step;
  const years = [];
  for (let y = firstLabel; y <= state.TL_MAX; y += step) years.push(y);
  years.forEach(y => {
    const sp = document.createElement('span');
    sp.className = 'tl-era-label';
    sp.textContent = y + ' هـ';
    sp.style.left = tlPct(y) + '%';
    sp.style.position = 'absolute';
    labelsEl.appendChild(sp);
  });
  labelsEl.style.position = 'relative';
  labelsEl.style.height = '16px';

  // Dots: every narrator, drawn on a canvas (thousands of DOM nodes would be too heavy)
  track.querySelectorAll('.tl-dot').forEach(d => d.remove());
  let cv = track.querySelector('canvas.tl-dots');
  if (!cv) { cv = document.createElement('canvas'); cv.className = 'tl-dots'; track.insertBefore(cv, track.firstChild.nextSibling); }
  const drawDots = () => {
    const W = track.clientWidth || 800, H = track.clientHeight || 26;
    cv.width = W * devicePixelRatio; cv.height = H * devicePixelRatio; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const ctx = cv.getContext('2d'); ctx.scale(devicePixelRatio, devicePixelRatio); ctx.clearRect(0, 0, W, H);
    const vis = state.narrators.filter(n => (state.filter === 'all' || n.generation === state.filter) && n.death_ah);
    // stack dots per pixel column so density shows as height
    const cols = new Map();
    for (const n of vis) { const x = Math.round(tlPct(n.death_ah) / 100 * W); const arr = cols.get(x) || cols.set(x, []).get(x); arr.push(n); }
    for (const [x, arr] of cols) {
      arr.sort((a, b) => (b.hadith_count || 0) - (a.hadith_count || 0));
      arr.forEach((n, i) => {
        const y = H / 2 + (i % 2 ? 1 : -1) * Math.min(H / 2 - 1, Math.floor(i / 2) * 1.6);
        ctx.fillStyle = GCS[n.generation] || '#c9a84c';
        ctx.globalAlpha = i === 0 ? 0.9 : 0.35;
        ctx.beginPath(); ctx.arc(x, y, i === 0 ? 1.6 : 1, 0, Math.PI * 2); ctx.fill();
      });
    }
    ctx.globalAlpha = 1;
  };
  drawDots();
  if (!track._tlResize) { track._tlResize = true; window.addEventListener('resize', drawDots); }

  track.addEventListener('mousemove', tlHover);
  track.addEventListener('mouseleave', tlLeave);
  track.addEventListener('click', tlClick);
}

function tlHover(e) {
  const track = document.getElementById('tl-track');
  const rect = track.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const pct = x / rect.width;
  const year = Math.round(state.TL_MIN + pct * (state.TL_MAX - state.TL_MIN));

  document.getElementById('tl-cursor').style.left = x + 'px';
  document.getElementById('tl-cursor').style.opacity = '1';

  const tip = document.getElementById('tl-year-tip');
  tip.style.left = x + 'px';
  tip.style.opacity = '1';
  tip.textContent = year + ' هـ';
}

function tlLeave() {
  document.getElementById('tl-cursor').style.opacity = '0';
  document.getElementById('tl-year-tip').style.opacity = '0';
}

function tlClick(e) {
  const track = document.getElementById('tl-track');
  const rect = track.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  const year = state.TL_MIN + pct * (state.TL_MAX - state.TL_MIN);
  const vis = state.narrators.filter(n => state.filter === 'all' || n.generation === state.filter);
  const closest = vis.reduce((best, n) => {
    if (!n.death_ah) return best;
    const d = Math.abs(n.death_ah - year);
    return (!best || d < best.d) ? { n, d } : best;
  }, null);
  if (closest && closest.d < 30) openPanel(closest.n);
}

export function updateTimeline(narrator) {
  const hl = document.getElementById('tl-highlight');
  const hlLabel = document.getElementById('tl-hl-label');
  const hlName = document.getElementById('tl-hl-name');
  const hlDates = document.getElementById('tl-hl-dates');

  if (!narrator) {
    hl.style.opacity = '0';
    hlLabel.style.opacity = '0';
    return;
  }

  const col = GCS[narrator.generation] || '#c9a84c';
  const lifespan = AVG_LIFE[narrator.generation] || 70;
  const birthEst = narrator.death_ah ? (narrator.death_ah - lifespan) : null;
  const startYear = birthEst ? Math.max(state.TL_MIN, birthEst) : state.TL_MIN;
  const endYear = narrator.death_ah || state.TL_MAX;

  const leftPct = tlPct(startYear);
  const rightPct = tlPct(endYear);
  const widthPct = rightPct - leftPct;
  const centerPct = leftPct + widthPct / 2;

  hl.style.left = leftPct + '%';
  hl.style.width = widthPct + '%';
  hl.style.background = col;
  hl.style.boxShadow = `0 0 14px ${col}, 0 0 28px ${col}44`;
  hl.style.opacity = '1';

  hlLabel.style.left = centerPct + '%';
  hlLabel.style.opacity = '1';
  hlName.textContent = narrator.name_short || narrator.name_ar;
  hlName.style.color = col;
  hlName.style.textShadow = `0 0 10px ${col}`;

  const birthStr = birthEst ? `${Math.max(0, birthEst)} هـ` : '؟';
  const deathStr = narrator.death_ah ? `${narrator.death_ah} هـ` : '؟';
  hlDates.textContent = `${birthStr} — ${deathStr}`;
}

/** Highlight a year range (used by the hadith path). Pass null to hide. */
export function updateTimelineRange(start, end, label, col = '#f0d080') {
  const hl = document.getElementById('tl-highlight');
  const hlLabel = document.getElementById('tl-hl-label');
  if (start == null) { hl.style.opacity = '0'; hlLabel.style.opacity = '0'; return; }
  const l = tlPct(start), r = tlPct(end);
  hl.style.left = l + '%'; hl.style.width = Math.max(0.6, r - l) + '%';
  hl.style.background = col; hl.style.boxShadow = `0 0 14px ${col}, 0 0 28px ${col}44`; hl.style.opacity = '1';
  hlLabel.style.left = (l + (r - l) / 2) + '%'; hlLabel.style.opacity = '1';
  const name = document.getElementById('tl-hl-name'), dates = document.getElementById('tl-hl-dates');
  name.textContent = label || ''; name.style.color = col; name.style.textShadow = `0 0 10px ${col}`;
  dates.textContent = `${start} — ${end} هـ`;
}
