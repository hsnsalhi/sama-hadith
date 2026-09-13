// Phone layout helpers: the panel is a bottom sheet there, so the point of interest must be centred in the sky that stays visible above it.
import { state } from './state.js';

export const isPhone = () => matchMedia('(max-width: 760px)').matches;
const TOP_UI = 150;   // header + search box, in px
const SHEET = 0.56;   // the sheet's share of the viewport height (see index.css)

/** World-space vertical shift so that a point lands in the middle of the visible sky when the sheet is open. */
export function sheetOffset(dist) {
  if (!isPhone()) return 0;
  const fov = (state.camera?.fov || 60) * Math.PI / 180;
  return (SHEET - TOP_UI / innerHeight) * dist * Math.tan(fov / 2);
}

/** The sheet can be pulled up (tall) or back to its half height by its grip. */
export function initSheet() {
  const grip = document.getElementById('pgrip');
  const panel = document.getElementById('panel');
  if (!grip) return;
  grip.addEventListener('click', () => panel.classList.toggle('tall'));
  let y0 = null;
  grip.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
  grip.addEventListener('touchend', e => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0; y0 = null;
    if (dy < -30) panel.classList.add('tall');
    else if (dy > 30) { if (panel.classList.contains('tall')) panel.classList.remove('tall'); else document.getElementById('pcl').click(); }
  }, { passive: true });
}
