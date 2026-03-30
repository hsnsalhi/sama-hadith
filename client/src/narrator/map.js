import { GEO_CITIES } from '../lib/constants.js';

export function drawMap(coords, origin) {
  const cv = document.getElementById('map-c');
  const W = cv.parentElement.clientWidth, H = 260;
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = '#000c1a';
  ctx.fillRect(0, 0, W, H);

  const LNG_MIN = -10, LNG_MAX = 80, LAT_MIN = 10, LAT_MAX = 45;
  function proj(lat, lng) {
    return {
      x: (lng - LNG_MIN) / (LNG_MAX - LNG_MIN) * (W - 60) + 30,
      y: (1 - (lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * (H - 40) + 20,
    };
  }

  // Grid
  ctx.strokeStyle = 'rgba(201,168,76,.06)';
  ctx.lineWidth = 0.5;
  for (let lng = 0; lng <= 80; lng += 20) {
    const p1 = proj(LAT_MIN, lng), p2 = proj(LAT_MAX, lng);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    ctx.fillStyle = 'rgba(201,168,76,.2)'; ctx.font = '8px Cairo,sans-serif';
    ctx.fillText(lng + '°', p1.x - 6, H - 6);
  }
  for (let lat = 10; lat <= 45; lat += 10) {
    const p1 = proj(lat, LNG_MIN), p2 = proj(lat, LNG_MAX);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    ctx.fillStyle = 'rgba(201,168,76,.2)'; ctx.font = '8px Cairo,sans-serif';
    ctx.fillText(lat + '°', 2, p1.y + 3);
  }

  // Known cities
  Object.entries(GEO_CITIES).forEach(([name, c]) => {
    if (c.lng < LNG_MIN || c.lng > LNG_MAX || c.lat < LAT_MIN || c.lat > LAT_MAX) return;
    const p = proj(c.lat, c.lng);
    ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(201,168,76,.25)'; ctx.fill();
    ctx.font = '8px Cairo,sans-serif'; ctx.fillStyle = 'rgba(201,168,76,.3)';
    ctx.fillText(name, p.x + 4, p.y + 3);
  });

  // Narrator point
  if (coords) {
    const p = proj(coords.lat, coords.lng);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 30);
    g.addColorStop(0, 'rgba(201,168,76,.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(p.x, p.y, 30, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#f0d080'; ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(201,168,76,.4)'; ctx.lineWidth = 1; ctx.stroke();
    document.getElementById('geo-map-label').textContent = origin || '';
  }
}
