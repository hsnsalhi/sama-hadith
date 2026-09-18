import { GCS, fmtYear } from '../lib/constants.js';

export function drawIsnad(narrator, teachers, students) {
  const cv = document.getElementById('isnad-canvas');
  const W = cv.parentElement.clientWidth || 800;
  const H = 320;
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(0,8,16,0)';
  ctx.fillRect(0, 0, W, H);

  const col = GCS[narrator.generation] || '#c9a84c';
  const CX = W / 2, CY = H / 2;
  const nodes = [];

  nodes.push({ n: narrator, x: CX, y: CY, r: 22, col, isMain: true });

  const tH = Math.min(teachers.length, 6);
  teachers.slice(0, 6).forEach((t, i) => {
    const y = CY - (tH - 1) * 35 / 2 + i * 35;
    nodes.push({ n: t, x: W * 0.2, y, r: 12, col: GCS[t.generation] || '#c9a84c', isMain: false });
  });

  const sH = Math.min(students.length, 6);
  students.slice(0, 6).forEach((s, i) => {
    const y = CY - (sH - 1) * 35 / 2 + i * 35;
    nodes.push({ n: s, x: W * 0.8, y, r: 12, col: GCS[s.generation] || '#c9a84c', isMain: false });
  });

  // Lines teachers → narrator
  teachers.slice(0, 6).forEach((_, i) => {
    const from = nodes[1 + i], to = nodes[0];
    const g = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
    g.addColorStop(0, from.col + '44'); g.addColorStop(1, to.col + '88');
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = g; ctx.lineWidth = 1; ctx.setLineDash([3, 6]); ctx.stroke(); ctx.setLineDash([]);
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const ax = to.x - Math.cos(ang) * (to.r + 4), ay = to.y - Math.sin(ang) * (to.r + 4);
    ctx.beginPath(); ctx.moveTo(ax, ay);
    ctx.lineTo(ax - 8 * Math.cos(ang - 0.4), ay - 8 * Math.sin(ang - 0.4));
    ctx.lineTo(ax - 8 * Math.cos(ang + 0.4), ay - 8 * Math.sin(ang + 0.4));
    ctx.closePath(); ctx.fillStyle = to.col + '88'; ctx.fill();
  });

  // Lines narrator → students
  students.slice(0, 6).forEach((_, i) => {
    const from = nodes[0], to = nodes[1 + teachers.slice(0, 6).length + i];
    const g = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
    g.addColorStop(0, from.col + '88'); g.addColorStop(1, to.col + '44');
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = g; ctx.lineWidth = 1; ctx.setLineDash([3, 6]); ctx.stroke(); ctx.setLineDash([]);
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const ax = to.x - Math.cos(ang) * (to.r + 4), ay = to.y - Math.sin(ang) * (to.r + 4);
    ctx.beginPath(); ctx.moveTo(ax, ay);
    ctx.lineTo(ax - 8 * Math.cos(ang - 0.4), ay - 8 * Math.sin(ang - 0.4));
    ctx.lineTo(ax - 8 * Math.cos(ang + 0.4), ay - 8 * Math.sin(ang + 0.4));
    ctx.closePath(); ctx.fillStyle = to.col + '88'; ctx.fill();
  });

  // Column labels
  ctx.font = '9px Cairo,sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(201,168,76,.25)';
  if (teachers.length) ctx.fillText('روى عن', W * 0.2, 20);
  if (students.length) ctx.fillText('روى عنه', W * 0.8, 20);

  // Nodes
  nodes.forEach(nd => {
    const g = ctx.createRadialGradient(nd.x, nd.y, 0, nd.x, nd.y, nd.r * 3);
    g.addColorStop(0, nd.col + (nd.isMain ? '44' : '22')); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(nd.x, nd.y, nd.r * 3, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.arc(nd.x, nd.y, nd.r, 0, Math.PI * 2);
    ctx.fillStyle = nd.isMain ? nd.col : nd.col + '55'; ctx.fill();
    if (nd.isMain) { ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.font = (nd.isMain ? 'bold 13px' : '11px') + ' Amiri,serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = nd.isMain ? '#fff' : nd.col;
    const name = nd.n.name_ar.split(' ').slice(0, 2).join(' ');
    ctx.fillText(name, nd.x, nd.y + nd.r + 14);
    if (nd.n.death_ah) {
      ctx.font = '9px Cairo,sans-serif';
      ctx.fillStyle = 'rgba(201,168,76,.35)';
      ctx.fillText(fmtYear(nd.n.death_ah), nd.x, nd.y + nd.r + 25);
    }
  });
}
