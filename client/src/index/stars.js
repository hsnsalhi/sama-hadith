import * as THREE from 'three';
import { state } from './state.js';
import { GC_HEX, GEN_Z } from '../lib/constants.js';
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
  const vis = state.narrators.filter(n => state.filter === 'all' || n.generation === state.filter);
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
