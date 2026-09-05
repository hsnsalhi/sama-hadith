import { state } from './state.js';
import { GL } from '../lib/constants.js';
import { openPanel, closePanel } from './panel.js';

export function handleMouseMove(e) {
  state.mouse.x = (e.clientX / innerWidth) * 2 - 1;
  state.mouse.y = -(e.clientY / innerHeight) * 2 + 1;

  if (!state.starPoints) return;

  state.raycaster.setFromCamera(state.mouse, state.camera);
  const hits = state.raycaster.intersectObject(state.starPoints);
  const tt = document.getElementById('tt');

  if (hits.length) {
    const idx = hits[0].index;
    const nid = state.idxMap[idx];
    state.hovId = nid;
    state.starPoints.material.uniforms.uHovered.value = idx;
    const n = state.narrators.find(x => x.id === nid);
    if (n) {
      document.getElementById('ttn').textContent = n.name_ar;
      document.getElementById('tts').textContent =
        (n.death_ah || '?') + ' هـ - ' + (GL[n.generation] || n.generation) + (n.origin ? ' - ' + n.origin : '');
      tt.style.display = 'block';
      tt.style.left = (e.clientX + 12) + 'px';
      tt.style.top = (e.clientY - 8) + 'px';
    }
    state.renderer.domElement.style.cursor = 'pointer';
  } else {
    state.hovId = null;
    state.starPoints.material.uniforms.uHovered.value = -1;
    tt.style.display = 'none';
    state.renderer.domElement.style.cursor = 'grab';
  }
}

export function handleClick(e, prevX, prevY) {
  if (Math.abs(e.clientX - prevX) + Math.abs(e.clientY - prevY) > 5) return;
  if (e.button !== 0) return;

  if (!state.starPoints) return;

  state.mouse.x = (e.clientX / innerWidth) * 2 - 1;
  state.mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  state.raycaster.setFromCamera(state.mouse, state.camera);
  const hits = state.raycaster.intersectObject(state.starPoints);

  if (hits.length) {
    const n = state.narrators.find(x => x.id === state.idxMap[hits[0].index]);
    if (n) openPanel(n);
  }
  // Don't close panel on empty clicks — user must click the ✕ button to deselect
}
