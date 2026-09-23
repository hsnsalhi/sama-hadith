import * as THREE from 'three';
import { state } from './state.js';
import { GC_HEX, GEN_Z, PROPHET_ID } from '../lib/constants.js';
import { getGeoY } from '../lib/utils.js';
import { clearLabels } from './labels.js';
import vertexShader from '../shaders/star.vert.glsl';
import fragmentShader from '../shaders/star.frag.glsl';

export const WORLD_W = 900; // width of the time axis in world units (was 400: too dense)

// estimated death years cluster on a few interpolated values: spread them by ±5 years (their real uncertainty)
function displayYear(n) {
  const y = n.death_ah || 1;
  if (!n.death_estimated) return y;
  const seed = (n.id * 40503) >>> 0;
  return y + ((seed % 1000) / 1000 - 0.5) * 10;
}

// depth axis: mean position in the isnads (0 = compiler side, ~6 = companion side), continuous — no gap between layers
function depthZ(n) {
  if (n.depth == null) return GEN_Z[n.generation] || 0;
  return 150 - Math.min(7, Math.max(0, n.depth)) * 42;
}

export function getPos3D(n) {
  const x = ((displayYear(n) - state.ERA_MIN) / (state.ERA_MAX - state.ERA_MIN)) * WORLD_W - WORLD_W / 2;
  const z = depthZ(n);
  const seed = (n.id * 2654435761) >>> 0;
  const geoY = getGeoY(n.origin);
  const baseY = geoY !== null ? geoY : ((seed % 6000) / 6000 - 0.5) * 160;
  const jx = ((seed % 997) / 997 - 0.5) * 20;
  const jy = ((seed % 503) / 503 - 0.5) * 18;
  const jz = ((seed % 1013) / 1013 - 0.5) * 42; // half a depth level: blends integer mean depths into a continuum
  return new THREE.Vector3(x + jx, baseY + jy, z + jz);
}

export function getPos2D(n) {
  const x = ((displayYear(n) - state.ERA_MIN) / (state.ERA_MAX - state.ERA_MIN)) * WORLD_W - WORLD_W / 2;
  const geoY = getGeoY(n.origin);
  const seed = (n.id * 2654435761) >>> 0;
  const baseY = geoY !== null ? geoY : ((seed % 6000) / 6000 - 0.5) * 160;
  const jy = ((seed % 503) / 503 - 0.5) * 18;
  return new THREE.Vector3(x, baseY + jy, 0);
}

export function getPos(n) {
  return state.view === '3d' ? getPos3D(n) : getPos2D(n);
}

function starSize(n) {
  if (n.generation === 'sahabi') return 4.5;
  if (n.hadith_count > 10000) return 5;
  if (n.hadith_count > 3000) return 3.8;
  if (n.hadith_count > 800) return 3;
  return 2.2;
}

export function buildStars() {
  const vis = state.narrators.filter(n => !n.prophet && (state.filter === 'all' || n.generation === state.filter));
  if (state.starPoints) {
    state.scene.remove(state.starPoints);
    state.starPoints.geometry.dispose();
  }
  clearLabels();

  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(vis.length * 3);
  const colors = new Float32Array(vis.length * 3);
  const sizes = new Float32Array(vis.length);
  const hi = new Float32Array(vis.length);

  state.idxMap = {};
  state.posMap = {};
  state.indexOfId = {};

  vis.forEach((n, i) => {
    const p = getPos(n);
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
    state.posMap[n.id] = p;
    state.idxMap[i] = n.id;
    state.indexOfId[n.id] = i;
    if (state.pathIds && state.pathIds.has(n.id)) hi[i] = 1;
    const c = new THREE.Color(GC_HEX[n.generation] || 0xc9a84c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    sizes[i] = starSize(n);
  });

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aHi', new THREE.BufferAttribute(hi, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSelected: { value: -1 },
      uHovered: { value: -1 },
      uDim: { value: state.pathIds ? 1 : 0 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  state.starPoints = new THREE.Points(geo, mat);
  state.scene.add(state.starPoints);
  buildProphetStar();
  // first display of the flat map: spread it over the whole viewport
  if (state.view === '2d' && !state.fittedOnce && vis.length) { state.fittedOnce = true; fitToStars(positions); }

}

/** Mark the given narrator ids as highlighted (hadith path) and dim the rest. */
export function setHighlight(ids) {
  state.pathIds = ids && ids.size ? ids : null;
  if (!state.starPoints) return;
  const attr = state.starPoints.geometry.getAttribute('aHi');
  const arr = attr.array;
  arr.fill(0);
  if (state.pathIds) for (const id of state.pathIds) { const i = state.indexOfId[id]; if (i !== undefined) arr[i] = 1; }
  attr.needsUpdate = true;
  state.starPoints.material.uniforms.uDim.value = state.pathIds ? 1 : 0;
  if (state.prophet) state.prophet.dim = state.pathIds ? (state.pathIds.has(PROPHET_ID) ? 0 : 1) : 0;
}

// ── The star of the Prophet ﷺ ──────────────────────────────────────────────
// A single distinguished light at the origin of the sky (Medina, 11 AH): a soft white-gold halo with eight rays, always visible,
// drawn apart from the narrators' point cloud and kept at a constant size on screen.
function prophetTexture(rays) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const cx = S / 2;
  const grd = g.createRadialGradient(cx, cx, 0, cx, cx, cx);
  if (rays) { grd.addColorStop(0, 'rgba(255,252,240,1)'); grd.addColorStop(0.07, 'rgba(255,246,220,0.95)'); grd.addColorStop(0.18, 'rgba(255,230,170,0.45)'); grd.addColorStop(0.4, 'rgba(255,214,130,0.1)'); grd.addColorStop(1, 'rgba(255,200,100,0)'); }
  else { grd.addColorStop(0, 'rgba(255,236,190,0.55)'); grd.addColorStop(0.35, 'rgba(255,220,150,0.18)'); grd.addColorStop(0.7, 'rgba(255,210,130,0.05)'); grd.addColorStop(1, 'rgba(255,200,100,0)'); }
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  if (rays) {
    g.translate(cx, cx);
    for (let i = 0; i < 8; i++) {
      const long = i % 2 === 0, L = long ? cx * 0.98 : cx * 0.62, w = long ? 6 : 3.5;
      const rg = g.createLinearGradient(0, 0, L, 0); rg.addColorStop(0, 'rgba(255,248,225,0.9)'); rg.addColorStop(0.5, 'rgba(255,236,180,0.35)'); rg.addColorStop(1, 'rgba(255,230,160,0)');
      g.fillStyle = rg; g.beginPath(); g.moveTo(0, -w); g.lineTo(L, 0); g.lineTo(0, w); g.closePath(); g.fill();
      g.rotate(Math.PI / 4);
    }
  }
  return new THREE.CanvasTexture(c);
}
function buildProphetStar() {
  const n = state.narById.get(PROPHET_ID);
  if (!n) return;
  const pos = getPos(n); pos.x += 26; // a step inside the sky, clear of the geographic axis drawn at its edge
  state.posMap[n.id] = pos;
  if (!state.prophet) {
    const mk = (rays, order) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: prophetTexture(rays), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })); sp.renderOrder = order; state.scene.add(sp); return sp; };
    state.prophet = { n, star: mk(true, 8), halo: mk(false, 7), dim: 0 };
  }
  state.prophet.star.position.copy(pos); state.prophet.halo.position.copy(pos);
}
/** Called every frame: constant on-screen size, a slow breathing halo, brighter when hovered, selected or on a hadith path. */
export function animateProphet(t) {
  const p = state.prophet; if (!p || !state.camera) return;
  const dist = state.camera.position.distanceTo(p.star.position);
  const per = 2 * Math.tan(state.camera.fov * Math.PI / 360) * dist / Math.max(1, innerHeight); // world units per pixel at that depth
  const active = state.selId === PROPHET_ID || state.hovId === PROPHET_ID || (state.pathIds && state.pathIds.has(PROPHET_ID));
  const breath = 1 + 0.05 * Math.sin(t * 1.6);
  const px = (active ? 64 : 50) * breath;
  p.star.scale.set(px * per, px * per, 1);
  p.halo.scale.set(px * 2.6 * per, px * 2.6 * per, 1);
  const fade = p.dim ? 0.3 : 1;
  p.star.material.opacity = fade * (active ? 1 : 0.92);
  p.halo.material.opacity = fade * (0.55 + 0.15 * Math.sin(t * 1.6 + 1)) * (active ? 1.2 : 1);
}

/** World position of a narrator even when filtered out of the sky. */
export function positionOf(n) {
  return state.posMap[n.id] || getPos(n);
}

/** Camera distance at which the given positions fill the viewport (2D view). */
export function fitToStars(positions) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < positions.length; i += 3) { const x = positions[i], y = positions[i + 1]; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (!isFinite(minX)) return;
  const fov = (state.camera?.fov || 60) * Math.PI / 180, aspect = innerWidth / Math.max(1, innerHeight);
  const w = (maxX - minX) * 1.08 + 60, h = (maxY - minY) * 1.25 + 60;
  const portrait = innerHeight > innerWidth && innerWidth <= 760;
  const visible = portrait ? Math.max(0.3, (innerHeight - 290) / innerHeight) : 1; // header, search, toolbar and timeline cover the rest
  const r = portrait ? h / 2 / Math.tan(fov / 2) / visible : Math.max(w / 2 / (Math.tan(fov / 2) * aspect), h / 2 / Math.tan(fov / 2));
  state.targetSpherical.radius = Math.max(30, Math.min(2600, r));
  state.targetSpherical.theta = 0; state.targetSpherical.phi = Math.PI / 2;
}
