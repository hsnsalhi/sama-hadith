import * as THREE from 'three';
import { state } from './state.js';
import { GC_HEX, GEN_Z } from '../lib/constants.js';
import { getGeoY } from '../lib/utils.js';
import { clearLabels } from './labels.js';
import vertexShader from '../shaders/star.vert.glsl';
import fragmentShader from '../shaders/star.frag.glsl';

export function getPos3D(n) {
  const x = (((n.death_ah || 1) - state.ERA_MIN) / (state.ERA_MAX - state.ERA_MIN)) * 400 - 200;
  const z = GEN_Z[n.generation] || 0;
  const seed = (n.id * 2654435761) >>> 0;
  const geoY = getGeoY(n.origin);
  const baseY = geoY !== null ? geoY : ((seed % 6000) / 6000 - 0.5) * 80;
  const jx = ((seed % 997) / 997 - 0.5) * 20;
  const jy = ((seed % 503) / 503 - 0.5) * 18;
  const jz = ((seed % 1013) / 1013 - 0.5) * 20;
  return new THREE.Vector3(x + jx, baseY + jy, z + jz);
}

export function getPos2D(n) {
  const x = (((n.death_ah || 1) - state.ERA_MIN) / (state.ERA_MAX - state.ERA_MIN)) * 400 - 200;
  const geoY = getGeoY(n.origin);
  const seed = (n.id * 2654435761) >>> 0;
  const baseY = geoY !== null ? geoY : ((seed % 6000) / 6000 - 0.5) * 80;
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

  state.idxMap = {};
  state.posMap = {};

  vis.forEach((n, i) => {
    const p = getPos(n);
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
    state.posMap[n.id] = p;
    state.idxMap[i] = n.id;
    const c = new THREE.Color(GC_HEX[n.generation] || 0xc9a84c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    sizes[i] = starSize(n);
  });

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSelected: { value: -1 },
      uHovered: { value: -1 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  state.starPoints = new THREE.Points(geo, mat);
  state.scene.add(state.starPoints);
}
