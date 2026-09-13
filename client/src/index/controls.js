import * as THREE from 'three';
import { state } from './state.js';
import { handleMouseMove, handleClick } from './raycaster.js';

let isDragging = false, prevX = 0, prevY = 0;
let downX = 0, downY = 0, dragDist = 0; // where the button went down, and how far the pointer travelled since
let tDist = 0;
let dragMode = 0; // 0=none 1=orbit 2=pan

export function initControls() {
  const el = state.renderer.domElement;

  el.addEventListener('contextmenu', e => e.preventDefault());

  el.addEventListener('mousedown', e => {
    prevX = e.clientX;
    prevY = e.clientY;
    downX = e.clientX; downY = e.clientY; dragDist = 0;
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
      dragDist += Math.abs(dx) + Math.abs(dy);
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

  let lastTap = 0;
  el.addEventListener('click', e => {
    if (Date.now() - lastTap < 600) return; // the tap already selected; this is the browser's synthetic click
    // a real click: the pointer barely moved since the button went down; a drag never selects
    if (dragDist > 6 || Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 6) return;
    handleClick(e, downX, downY);
  });

  el.addEventListener('wheel', e => {
    e.preventDefault();
    state.targetSpherical.radius *= (e.deltaY > 0 ? 1.12 : 0.89);
    state.targetSpherical.radius = Math.max(30, Math.min(2600, state.targetSpherical.radius));
    updateZoomLabel();
  }, { passive: false });

  // Touch controls
  let touch2PrevMidX = 0, touch2PrevMidY = 0;

  const oneFingerMode = () => state.view === '2d' ? 2 : 1; // pan the flat map, orbit the sphere
  el.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      isDragging = true; dragMode = oneFingerMode();
      prevX = e.touches[0].clientX; prevY = e.touches[0].clientY;
      downX = prevX; downY = prevY; dragDist = 0;
    } else if (e.touches.length === 2) {
      dragDist += 20; // a pinch is never a tap
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
    if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - prevX;
      const dy = e.touches[0].clientY - prevY;
      dragDist += Math.abs(dx) + Math.abs(dy);
      if (dragMode === 1) {
        state.targetSpherical.theta -= dx * 0.005;
        state.targetSpherical.phi -= dy * 0.005;
        state.targetSpherical.phi = Math.max(0.15, Math.min(Math.PI - 0.15, state.targetSpherical.phi));
      } else {
        const panSpeed = state.targetSpherical.radius * 0.0016;
        const right = new THREE.Vector3(), up = new THREE.Vector3();
        right.setFromMatrixColumn(state.camera.matrix, 0);
        up.setFromMatrixColumn(state.camera.matrix, 1);
        state.panTarget.addScaledVector(right, -dx * panSpeed);
        state.panTarget.addScaledVector(up, dy * panSpeed);
      }
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
    if (e.touches.length === 0) {
      const t = e.changedTouches[0];
      if (isDragging && dragDist < 8 && t) { lastTap = Date.now(); handleClick({ clientX: t.clientX, clientY: t.clientY, button: 0 }, downX, downY); } // a tap selects the star under the finger
      isDragging = false; dragMode = 0;
    }
    else if (e.touches.length === 1) {
      isDragging = true; dragMode = oneFingerMode();
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
