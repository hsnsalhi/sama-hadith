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

  // Dots
  track.querySelectorAll('.tl-dot').forEach(d => d.remove());
  const vis = state.narrators.filter(n => state.filter === 'all' || n.generation === state.filter);
  vis.forEach(n => {
    if (!n.death_ah) return;
    const dot = document.createElement('div');
    dot.className = 'tl-dot';
    dot.style.cssText = `left:${tlPct(n.death_ah)}%;background:${GCS[n.generation]};box-shadow:0 0 3px ${GCS[n.generation]};`;
    dot.title = n.name_ar;
    dot.addEventListener('click', () => openPanel(n));
    track.appendChild(dot);
  });

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
  hlName.textContent = narrator.name_ar;
  hlName.style.color = col;
  hlName.style.textShadow = `0 0 10px ${col}`;

  const birthStr = birthEst ? `${Math.max(0, birthEst)} هـ` : '؟';
  const deathStr = narrator.death_ah ? `${narrator.death_ah} هـ` : '؟';
  hlDates.textContent = `${birthStr} — ${deathStr}`;
}
