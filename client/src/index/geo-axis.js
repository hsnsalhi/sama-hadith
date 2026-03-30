import { state } from './state.js';
import { GCS, GEO_AXIS_CITIES } from '../lib/constants.js';
import { getGeoY } from '../lib/utils.js';

const GEO_Y_MIN = -150, GEO_Y_MAX = 170;

function worldYtoPct(y) {
  return 1 - (y - GEO_Y_MIN) / (GEO_Y_MAX - GEO_Y_MIN);
}

export function buildGeoAxis() {
  const track = document.getElementById('geo-track');
  track.querySelectorAll('.geo-label,.geo-dot').forEach(e => e.remove());

  GEO_AXIS_CITIES.forEach(city => {
    const pct = worldYtoPct(city.y) * 100;
    if (pct < 0 || pct > 100) return;

    const dot = document.createElement('div');
    dot.className = 'geo-dot' + (city.major ? ' major' : '');
    dot.style.top = pct + '%';
    track.appendChild(dot);

    const lbl = document.createElement('div');
    lbl.className = 'geo-label';
    lbl.id = 'geo-lbl-' + city.name;
    lbl.setAttribute('dir', 'rtl');
    lbl.textContent = city.name;
    lbl.style.top = pct + '%';
    lbl.style.color = city.major ? 'rgba(201,168,76,.55)' : 'rgba(201,168,76,.3)';
    track.appendChild(lbl);
  });

  track.addEventListener('mousemove', geoHover);
  track.addEventListener('mouseleave', geoLeave);
}

function geoHover(e) {
  const track = document.getElementById('geo-track');
  const rect = track.getBoundingClientRect();
  const pct = (e.clientY - rect.top) / rect.height;
  const worldY = GEO_Y_MIN + (1 - pct) * (GEO_Y_MAX - GEO_Y_MIN);

  const closest = GEO_AXIS_CITIES.reduce((best, c) => {
    const d = Math.abs(c.y - worldY);
    return (!best || d < best.d) ? { c, d } : best;
  }, null);

  const cursor = document.getElementById('geo-cursor');
  cursor.style.top = pct * 100 + '%';
  cursor.style.opacity = '1';

  document.querySelectorAll('.geo-label').forEach(l => l.classList.remove('active'));
  if (closest && closest.d < 25) {
    const lbl = document.getElementById('geo-lbl-' + closest.c.name);
    if (lbl) lbl.classList.add('active');
  }
}

function geoLeave() {
  document.getElementById('geo-cursor').style.opacity = '0';
  document.querySelectorAll('.geo-label').forEach(l => l.classList.remove('active'));
}

export function updateGeoAxis(narrator) {
  const hl = document.getElementById('geo-highlight');
  document.querySelectorAll('.geo-label').forEach(l => l.classList.remove('active'));

  if (!narrator) { hl.style.opacity = '0'; return; }

  const geoY = getGeoY(narrator.origin);
  if (geoY === null) { hl.style.opacity = '0'; return; }

  const col = GCS[narrator.generation] || '#c9a84c';
  const pct = worldYtoPct(geoY) * 100;

  hl.style.top = (pct - 1) + '%';
  hl.style.height = '2%';
  hl.style.background = col;
  hl.style.boxShadow = `0 0 10px ${col}, 0 0 20px ${col}44`;
  hl.style.opacity = '1';

  const closest = GEO_AXIS_CITIES.reduce((best, c) => {
    const d = Math.abs(c.y - geoY);
    return (!best || d < best.d) ? { c, d } : best;
  }, null);
  if (closest && closest.d < 30) {
    const lbl = document.getElementById('geo-lbl-' + closest.c.name);
    if (lbl) lbl.classList.add('active');
  }
}
