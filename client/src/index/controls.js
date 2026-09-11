import * as THREE from 'three';
import { state } from './state.js';
import { handleMouseMove, handleClick } from './raycaster.js';

let isDragging = false, prevX = 0, prevY = 0;
let tDist = 0;
let dragMode = 0; // 0=none 1=orbit 2=pan

export function initControls() {
  const el = state.renderer.domElement;

  el.addEventListener('contextmenu', e => e.preventDefault());

  el.addEventListener('mousedown', e => {
    prevX = e.clientX;
    prevY = e.clientY;
    if (e.button === 2 || e.ctrlKey || e.shiftKey) {
      dragMode = 1; el.style.cursor = 'grabbing';
    } else {
      dragMode = 2; el.style.cursor = 'move';
    }
    isDragging = true;
  });

  window.addEventListener('mouseup', () => {
    isDragging = false; dragMode = 0;
    el.style.cursor = 'grab';
  });

  window.addEventListener('mousemove', e => {
    if (isDragging) {
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      if (dragMode === 1) {
        state.targetSpherical.theta -= dx * 0.005;
        state.targetSpherical.phi -= dy * 0.005;
        state.targetSpherical.phi = Math.max(0.15, Math.min(Math.PI - 0.15, state.targetSpherical.phi));
      } else if (dragMode === 2) {
        const panSpeed = state.targetSpherical.radius * 0.001;
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        state.camera.getWorldDirection(new THREE.Vector3());
        right.setFromMatrixColumn(state.camera.matrix, 0);
        up.setFromMatrixColumn(state.camera.matrix, 1);
        state.panTarget.addScaledVector(right, -dx * panSpeed);
        state.panTarget.addScaledVector(up, dy * panSpeed);
      }
      prevX = e.clientX;
      prevY = e.clientY;
      return;
    }
    handleMouseMove(e);
  });

  el.addEventListener('click', e => {
    handleClick(e, prevX, prevY);
  });

  el.addEventListener('wheel', e => {
    e.preventDefault();
    state.targetSpherical.radius *= (e.deltaY > 0 ? 1.12 : 0.89);
    state.targetSpherical.radius = Math.max(30, Math.min(2600, state.targetSpherical.radius));
    updateZoomLabel();
  }, { passive: false });

  // Touch controls
  let touch2PrevMidX = 0, touch2PrevMidY = 0;

  el.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      isDragging = true; dragMode = 1;
      prevX = e.touches[0].clientX; prevY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      isDragging = false; dragMode = 2;
      tDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touch2PrevMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      touch2PrevMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }
  }, { passive: true });

  el.addEventListener('touchmove', e => {
    if (e.touches.length === 1 && dragMode === 1 && isDragging) {
      const dx = e.touches[0].clientX - prevX;
      const dy = e.touches[0].clientY - prevY;
      state.targetSpherical.theta -= dx * 0.005;
      state.targetSpherical.phi -= dy * 0.005;
      state.targetSpherical.phi = Math.max(0.15, Math.min(Math.PI - 0.15, state.targetSpherical.phi));
      prevX = e.touches[0].clientX; prevY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      state.targetSpherical.radius *= tDist / d;
      state.targetSpherical.radius = Math.max(30, Math.min(2600, state.targetSpherical.radius));
      tDist = d; updateZoomLabel();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const dx = midX - touch2PrevMidX, dy = midY - touch2PrevMidY;
      const panSpeed = state.targetSpherical.radius * 0.001;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      right.setFromMatrixColumn(state.camera.matrix, 0);
      up.setFromMatrixColumn(state.camera.matrix, 1);
      state.panTarget.addScaledVector(right, -dx * panSpeed);
      state.panTarget.addScaledVector(up, dy * panSpeed);
      touch2PrevMidX = midX; touch2PrevMidY = midY;
    }
  }, { passive: true });

  el.addEventListener('touchend', e => {
    if (e.touches.length === 0) { isDragging = false; dragMode = 0; }
    else if (e.touches.length === 1) {
      isDragging = true; dragMode = 1;
      prevX = e.touches[0].clientX; prevY = e.touches[0].clientY;
    }
  }, { passive: true });
}

export function updateZoomLabel() {
  const pct = Math.round(620 / Math.max(state.targetSpherical.radius, 1) * 100);
  document.getElementById('zv').textContent = pct + '%';
}

export function doZoom(f) {
  state.targetSpherical.radius *= f;
  state.targetSpherical.radius = Math.max(30, Math.min(2600, state.targetSpherical.radius));
  updateZoomLabel();
}

export function resetCam() {
  state.targetSpherical.set(620, Math.PI / 2, 0);
  state.panTarget.set(0, 0, 0);
  updateZoomLabel();
}
