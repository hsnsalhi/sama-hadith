import * as THREE from 'three';
import { state } from './state.js';
import { initControls } from './controls.js';

export function initThree() {
  state.scene = new THREE.Scene();
  state.clock = new THREE.Clock();
  state.mouse = new THREE.Vector2();

  state.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 5000);
  state.camera.position.set(0, 0, 620);

  state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  state.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  state.renderer.setSize(innerWidth, innerHeight);
  state.renderer.setClearColor(0x000508, 1);
  document.getElementById('c').appendChild(state.renderer.domElement);

  state.raycaster = new THREE.Raycaster();
  state.raycaster.params.Points.threshold = matchMedia('(pointer: coarse)').matches ? 12 : 4; // a finger is wider than a mouse pointer

  addBgParticles();
  addNebula();

  window.addEventListener('resize', onResize);
  initControls();
}

function addBgParticles() {
  const geo = new THREE.BufferGeometry();
  const n = 3000;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 2000;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 2000;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 2000;
    const t = Math.random();
    if (t < 0.15) { col[i * 3] = 0.7; col[i * 3 + 1] = 0.85; col[i * 3 + 2] = 1.0; }
    else if (t < 0.25) { col[i * 3] = 1.0; col[i * 3 + 1] = 0.95; col[i * 3 + 2] = 0.8; }
    else { col[i * 3] = 0.9; col[i * 3 + 1] = 0.88; col[i * 3 + 2] = 0.82; }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.6, vertexColors: true, transparent: true, opacity: 0.7, sizeAttenuation: true });
  state.bgParticles = new THREE.Points(geo, mat);
  state.scene.add(state.bgParticles);
}

function addNebula() {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x000305, side: THREE.BackSide })
  );
  state.scene.add(sky);
}

function onResize() {
  state.camera.aspect = innerWidth / innerHeight;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(innerWidth, innerHeight);
}
