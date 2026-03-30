import * as THREE from 'three';
import { state } from './state.js';
import { GC_HEX } from '../lib/constants.js';

export function buildSelLines(narratorId) {
  if (state.selLines) {
    state.scene.remove(state.selLines);
    state.selLines.geometry.dispose();
  }
  const sel = state.narrators.find(n => n.id === narratorId);
  if (!sel) return;
  const sp = state.posMap[sel.id];
  if (!sp) return;

  const pts = [];
  const cols = [];

  state.transmissions.forEach(t => {
    let other = null;
    if (t.teacher_id === narratorId) other = state.narrators.find(n => n.id === t.student_id);
    else if (t.student_id === narratorId) other = state.narrators.find(n => n.id === t.teacher_id);
    if (!other || !state.posMap[other.id]) return;
    const op = state.posMap[other.id];
    pts.push(sp.x, sp.y, sp.z, op.x, op.y, op.z);
    const c = new THREE.Color(GC_HEX[other.generation] || 0xc9a84c);
    const isTeacher = t.student_id === narratorId;
    const alpha = isTeacher ? 0.6 : 0.3;
    cols.push(c.r * alpha, c.g * alpha, c.b * alpha, c.r * 0.1, c.g * 0.1, c.b * 0.1);
  });

  if (!pts.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });
  state.selLines = new THREE.LineSegments(geo, mat);
  state.scene.add(state.selLines);
}

export function flyTo(n) {
  if (!state.posMap[n.id]) return;
  const tp = state.posMap[n.id].clone();
  const startPan = state.panTarget.clone();
  let t = 0;
  if (state.flyAnim) clearInterval(state.flyAnim);
  state.flyAnim = setInterval(() => {
    t += 0.05;
    if (t >= 1) { t = 1; clearInterval(state.flyAnim); }
    const e = 1 - Math.pow(1 - t, 3);
    state.panTarget.lerpVectors(startPan, tp, e);
  }, 16);
}
