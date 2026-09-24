import { state } from './state.js';
import { fmtYear, PROPHET_ID, genLabel } from '../lib/constants.js';
import { openPanel, closePanel } from './panel.js';
const COARSE = matchMedia('(pointer: coarse)').matches;

export function handleMouseMove(e) {
  state.mouse.x = (e.clientX / innerWidth) * 2 - 1;
  state.mouse.y = -(e.clientY / innerHeight) * 2 + 1;

  if (!state.starPoints) return;

  state.raycaster.setFromCamera(state.mouse, state.camera);
  const hits = state.raycaster.intersectObject(state.starPoints).sort((a, b) => a.distanceToRay - b.distanceToRay); // the star nearest to the pointer, not to the camera
  const tt = document.getElementById('tt');

  if (overProphet(e.clientX, e.clientY)) {
    state.hovId = PROPHET_ID;
    state.starPoints.material.uniforms.uHovered.value = -1;
    document.getElementById('ttn').textContent = 'محمد رسول الله ﷺ';
    document.getElementById('tts').textContent = 'خاتم النبيين · توفي ' + fmtYear(11) + ' · المدينة';
    tt.style.display = COARSE ? 'none' : 'block';
    tt.style.left = (e.clientX + 12) + 'px';
    tt.style.top = (e.clientY - 8) + 'px';
    state.renderer.domElement.style.cursor = 'pointer';
  } else if (hits.length) {
    const idx = hits[0].index;
    const nid = state.idxMap[idx];
    state.hovId = nid;
    state.starPoints.material.uniforms.uHovered.value = idx;
    const n = state.narById.get(nid);
    if (n) {
      document.getElementById('ttn').textContent = n.name_ar;
      document.getElementById('tts').textContent =
        fmtYear(n.death_ah, n.death_estimated) + ' - ' + genLabel(n) + (n.origin ? ' - ' + n.origin : '');
      tt.style.display = COARSE ? 'none' : 'block';
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

/** Is the pointer on the star of the Prophet ﷺ (drawn apart from the point cloud)? */
function overProphet(cx, cy) {
  const p = state.posMap[PROPHET_ID]; if (!p) return false;
  const v = p.clone().project(state.camera); if (v.z > 1 || v.z < -1) return false;
  const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
  return Math.hypot(sx - cx, sy - cy) < (COARSE ? 32 : 24);
}

export function handleClick(e, prevX, prevY) {
  if (Math.abs(e.clientX - prevX) + Math.abs(e.clientY - prevY) > 5) return;
  if (e.button !== 0) return;

  if (!state.starPoints) return;

  if (overProphet(e.clientX, e.clientY)) { const p = state.narById.get(PROPHET_ID); if (p) { openPanel(p); return; } } // a tap on the star of the Prophet ﷺ (no hover on touch screens)
  // the click selects exactly the star shown under the pointer (the hovered one)
  if (state.hovId != null) { const n = state.narById.get(state.hovId); if (n) { openPanel(n); return; } }
  state.mouse.x = (e.clientX / innerWidth) * 2 - 1;
  state.mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  state.raycaster.setFromCamera(state.mouse, state.camera);
  const hits = state.raycaster.intersectObject(state.starPoints).sort((a, b) => a.distanceToRay - b.distanceToRay);

  if (hits.length) {
    const n = state.narById.get(state.idxMap[hits[0].index]);
    if (n) openPanel(n);
  }
  // Don't close panel on empty clicks — user must click the ✕ button to deselect
}
