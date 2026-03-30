import { state } from './state.js';
import { buildStars } from './stars.js';
import { buildTimeline } from './timeline.js';
import { buildSelLines } from './selection.js';

export function initFilters() {
  // Generation filter buttons
  document.getElementById('ba').addEventListener('click', () => setF('all'));
  document.getElementById('bs').addEventListener('click', () => setF('sahabi'));
  document.getElementById('bt').addEventListener('click', () => setF('tabii'));
  document.getElementById('bm').addEventListener('click', () => setF('muhaddith'));
  document.getElementById('br').addEventListener('click', () => setF('rijal'));

  // Auto-rotate
  document.getElementById('bauto').addEventListener('click', toggleAuto);

  // View toggle
  document.getElementById('vb3d').addEventListener('click', () => setView('3d'));
  document.getElementById('vb2d').addEventListener('click', () => setView('2d'));
}

function setF(f) {
  state.filter = f;
  ['all', 'sahabi', 'tabii', 'muhaddith', 'rijal'].forEach(k => {
    const b = document.getElementById('b' + (k === 'all' ? 'a' : k[0]));
    if (b) b.classList.toggle('on', k === f);
  });
  buildStars();
  buildTimeline();
}

function toggleAuto() {
  state.autoOn = !state.autoOn;
  document.getElementById('bauto').classList.toggle('on', state.autoOn);
}

function setView(v) {
  state.view = v;
  document.getElementById('vb3d').classList.toggle('on', v === '3d');
  document.getElementById('vb2d').classList.toggle('on', v === '2d');
  if (v === '2d') {
    state.targetSpherical.set(state.targetSpherical.radius, Math.PI / 2, 0);
  }
  buildStars();
  if (state.selId) buildSelLines(state.selId);
}
