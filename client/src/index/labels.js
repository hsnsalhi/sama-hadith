import { state } from './state.js';

const labelContainer = document.createElement('div');
labelContainer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:10;overflow:hidden;';
labelContainer.setAttribute('dir', 'rtl');
document.body.appendChild(labelContainer);

export function clearLabels() {
  state.labelDivs.forEach(d => d.remove());
  state.labelDivs = [];
}

export function updateLabels() {
  state.labelDivs.forEach(d => d.remove());
  state.labelDivs = [];

  const vis = state.narrators.filter(n => state.filter === 'all' || n.generation === state.filter);
  const camDist = state.spherical.radius;
  const showAll = camDist < 320;
  const showSome = camDist < 700;

  const projected = [];
  vis.forEach(n => {
    const isSpecial = n.id === state.selId || n.id === state.hovId;
    if (!isSpecial && !showSome) return;
    const p = state.posMap[n.id];
    if (!p) return;
    const v = p.clone().project(state.camera);
    if (v.z > 1 || v.z < -1) return;
    const sx = (v.x * 0.5 + 0.5) * innerWidth;
    const sy = (-v.y * 0.5 + 0.5) * innerHeight;
    if (sx < -50 || sx > innerWidth + 50 || sy < -50 || sy > innerHeight + 50) return;
    projected.push({ n, sx, sy, isSpecial });
  });

  const placed = [];
  const minDist = showAll ? 55 : 80;

  projected.sort((a, b) => {
    if (a.n.id === state.selId) return -1;
    if (b.n.id === state.selId) return 1;
    if (a.n.id === state.hovId) return -1;
    if (b.n.id === state.hovId) return 1;
    return (b.n.hadith_count || 0) - (a.n.hadith_count || 0);
  });

  projected.forEach(({ n, sx, sy, isSpecial }) => {
    if (!isSpecial) {
      const tooClose = placed.some(p => Math.hypot(p.sx - sx, p.sy - sy) < minDist);
      if (tooClose) return;
    }
    placed.push({ sx, sy });

    const isSel = n.id === state.selId;
    const isHov = n.id === state.hovId;
    const opacity = isSel ? 1 : isHov ? 1 : showAll ? 0.85 : 0.95;
    const fontSize = isSel ? 14 : isHov ? 12 : 10;
    const offsetY = isSel ? 22 : isHov ? 20 : 16;

    const d = document.createElement('div');
    d.className = 'lbl';
    d.setAttribute('dir', 'rtl');
    d.textContent = n.name_short || n.name_ar;
    d.style.cssText = `position:absolute;left:${sx}px;top:${sy - offsetY}px;transform:translateX(-50%);opacity:${opacity};font-size:${fontSize}px;`;
    labelContainer.appendChild(d);
    state.labelDivs.push(d);
  });
}
