import '../styles/index.css';
import { state } from './state.js';
import { initThree } from './scene.js';
import { buildStars } from './stars.js';
import { updateLabels } from './labels.js';
import { computeTimelineRange, buildTimeline } from './timeline.js';
import { buildGeoAxis } from './geo-axis.js';
import { initSearch } from './search.js';
import { initFilters } from './filters.js';
import { doZoom, resetCam } from './controls.js';
import { closePanel, bindHadithApi } from './panel.js';
import { initHadithMode, updatePathLabels, openHadith, clearPath, backToHadith } from './hadith-mode.js';
import { getNarrators, getTransmissions, getManifest } from '../lib/api.js';

function setLS(m, p) {
  document.getElementById('lst').textContent = m;
  document.getElementById('lbf').style.width = p + '%';
}

function animate() {
  requestAnimationFrame(animate);
  const dt = state.clock.getDelta();
  const t = state.clock.getElapsedTime();

  state.spherical.theta += (state.targetSpherical.theta - state.spherical.theta) * 0.08;
  state.spherical.phi += (state.targetSpherical.phi - state.spherical.phi) * 0.08;
  state.spherical.radius += (state.targetSpherical.radius - state.spherical.radius) * 0.08;

  state.panCurrent.lerp(state.panTarget, 0.08);

  if (state.autoOn) state.targetSpherical.theta += dt * 0.15;

  state.camera.position.setFromSpherical(state.spherical);
  state.camera.position.add(state.panCurrent);
  state.camera.lookAt(state.panCurrent);

  if (state.bgParticles) state.bgParticles.rotation.y = t * 0.008;
  if (state.starPoints) state.starPoints.material.uniforms.uTime.value = t;

  updateLabels();
  updatePathLabels();
  state.renderer.render(state.scene, state.camera);
}

async function loadData() {
  setLS('تحميل الرواة...', 20);
  const manifest = await getManifest();
  state.narrators = await getNarrators();
  state.narById = new Map(state.narrators.map(n => [n.id, n]));
  setLS('تحميل الأسانيد...', 55);
  state.transmissions = await getTransmissions();
  setLS('تجهيز فهرس الأحاديث...', 80);
  await initHadithMode();

  document.getElementById('stn').textContent = state.narrators.length.toLocaleString('en-US');
  document.getElementById('stl').textContent = state.transmissions.length.toLocaleString('en-US');
  document.getElementById('sth').textContent = (manifest.hadiths_with_isnad || manifest.hadiths).toLocaleString('en-US');

  setLS('بناء الكون ثلاثي الأبعاد...', 92);
  await new Promise(r => setTimeout(r, 300));

  computeTimelineRange(); // the era range drives the x axis of the stars
  buildStars();
  buildTimeline();
  buildGeoAxis();

  setLS('جاهز', 100);
  await new Promise(r => setTimeout(r, 400));

  // deep link: index.html?hadith=bukhari:1
  const hid = new URLSearchParams(location.search).get('hadith');
  if (hid) { document.querySelector('#sw-tabs .swt[data-m="hadith"]')?.click(); openHadith(hid); }

  const ld = document.getElementById('ld');
  ld.style.opacity = '0';
  setTimeout(() => ld.style.display = 'none', 1000);
  setTimeout(() => { document.getElementById('hint').style.opacity = '0'; }, 5000);
}

function init() {
  initThree();
  initSearch();
  initFilters();

  // Zoom buttons
  const zoomBtns = document.querySelectorAll('#zc .zb');
  zoomBtns[0].addEventListener('click', () => doZoom(0.8));
  zoomBtns[1].addEventListener('click', () => doZoom(1.25));
  zoomBtns[2].addEventListener('click', () => resetCam());

  // Close panel
  document.getElementById('pcl').addEventListener('click', closePanel);
  bindHadithApi({ openHadith, clearPath, backToHadith });

  animate();
  loadData();
}

init();
