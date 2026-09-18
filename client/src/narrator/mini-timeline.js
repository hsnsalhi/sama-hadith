import { AVG_LIFE, fmtYear, hijriToCe } from '../lib/constants.js';

export function drawMiniTimeline(narrator, col) {
  const ERA_MIN = 1, ERA_MAX = 950;
  function pct(y) { return Math.max(0, Math.min(100, (y - ERA_MIN) / (ERA_MAX - ERA_MIN) * 100)); }
  // keep a label inside the card: centred on its year, except near the edges
  function anchor(el, p) { el.style.left = p + '%'; el.style.transform = p < 8 ? 'none' : p > 92 ? 'translateX(-100%)' : 'translateX(-50%)'; }

  const life = AVG_LIFE[narrator.generation] || 70;
  const death = narrator.death_ah || 300;
  const birth = Math.max(1, death - life);
  const lp = pct(birth), rp = pct(death);

  const eras = [
    { s: 1, e: 100, c: 'rgba(245,215,122,.06)' },
    { s: 100, e: 200, c: 'rgba(122,184,245,.06)' },
    { s: 200, e: 400, c: 'rgba(192,122,245,.06)' },
    { s: 400, e: 950, c: 'rgba(122,245,192,.06)' },
  ];

  const track = document.getElementById('mini-tl');
  document.querySelectorAll('#mtl-axis [data-h]').forEach(el => {
    const h = Number(el.dataset.h);
    el.innerHTML = '';
    const ce = document.createElement('span'); ce.className = 'ce'; ce.textContent = `${hijriToCe(h)} م`;
    const ah = document.createElement('span'); ah.className = 'ah'; ah.textContent = `(${h} هـ)`;
    el.append(ce, ah);
    el.title = fmtYear(h);
    anchor(el, pct(h));
  });
  eras.forEach(e => {
    const d = document.createElement('div');
    d.className = 'mtl-era';
    d.style.cssText = `left:${pct(e.s)}%;width:${pct(e.e) - pct(e.s)}%;background:${e.c}`;
    track.insertBefore(d, track.firstChild);
  });

  const life_bar = document.getElementById('mtl-life');
  life_bar.style.cssText = `left:${lp}%;width:${rp - lp}%;background:${col};box-shadow:0 0 8px ${col}44;`;

  const b = document.getElementById('mtl-birth');
  b.style.cssText = `left:${lp}%;color:${col};`;
  const bl = document.createElement('div');
  bl.className = 'mtl-label top';
  anchor(bl, lp);
  bl.textContent = 'ولادة ~' + fmtYear(birth);
  track.appendChild(bl);

  const dm = document.getElementById('mtl-death-dot');
  dm.style.cssText = `left:${rp}%;background:${col};box-shadow:0 0 6px ${col};position:absolute;top:50%;transform:translate(-50%,-50%);width:8px;height:8px;border-radius:50%;`;
  const dl = document.createElement('div');
  dl.className = 'mtl-label bot';
  anchor(dl, rp);
  dl.textContent = 'وفاة ' + fmtYear(death);
  track.appendChild(dl);
}
