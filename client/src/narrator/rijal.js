// The notices of the rijāl books matched to this narrator (texts from OpenITI, CC BY-NC-SA 4.0).
import { deathAt } from '../lib/constants.js';
const BOOKS = {
  tahdhib: { title: 'تهذيب التهذيب', author: `ابن حجر العسقلاني، ${deathAt(852)}` },
  kamal: { title: 'تهذيب الكمال في أسماء الرجال', author: `جمال الدين المزّي، ${deathAt(742)}` },
  kashif: { title: 'الكاشف', author: `شمس الدين الذهبي، ${deathAt(748)}` },
  jarh: { title: 'الجرح والتعديل', author: `ابن أبي حاتم الرازي، ${deathAt(327)}` },
  thiqat: { title: 'الثقات', author: `ابن حبّان البستي، ${deathAt(354)}` },
  tarikh: { title: 'التاريخ الكبير', author: `البخاري، ${deathAt(256)}` },
  sacd: { title: 'الطبقات الكبرى', author: `ابن سعد، ${deathAt(230)}` },
  ijli: { title: 'معرفة الثقات', author: `العجلي، ${deathAt(261)}` },
  majruhin: { title: 'المجروحين', author: `ابن حبّان البستي، ${deathAt(354)}` },
  shahin: { title: 'تاريخ أسماء الثقات', author: `ابن شاهين، ${deathAt(385)}` },
  mizan: { title: 'ميزان الاعتدال', author: `شمس الدين الذهبي، ${deathAt(748)}` },
  siyar: { title: 'سير أعلام النبلاء', author: `شمس الدين الذهبي، ${deathAt(748)}` },
  istiab: { title: 'الاستيعاب في معرفة الأصحاب', author: `ابن عبد البر، ${deathAt(463)}` },
  usd: { title: 'أسد الغابة', author: `ابن الأثير، ${deathAt(630)}` },
  isaba: { title: 'الإصابة في تمييز الصحابة', author: `ابن حجر العسقلاني، ${deathAt(852)}` },
  nuaym: { title: 'معرفة الصحابة', author: `أبو نعيم الأصبهاني، ${deathAt(430)}` },
};
const ORDER = ['sacd', 'tarikh', 'ijli', 'jarh', 'thiqat', 'majruhin', 'shahin', 'nuaym', 'istiab', 'usd', 'kamal', 'kashif', 'mizan', 'siyar', 'tahdhib', 'isaba'];

function card(list, { src, ref, text, teachers, students, grades }) {
  const b = BOOKS[src] || { title: src, author: '' };
  const short = text.length > 900;
  const el = document.createElement('div');
  el.className = 'rijal-card';
  el.innerHTML = `
    <div class="rijal-name">${b.title} · ${b.author}${ref ? (ref.split(':')[0] !== '0' ? ` · الجزء ${ref.split(':')[0]}` : '') + ` · رقم ${ref.split(':')[1]}` : ''}</div>
    <div class="rijal-text">${short ? text.slice(0, 900) + '…' : text}</div>
    ${short ? '<button class="rijal-more">عرض النص كاملاً</button>' : ''}
    ${grades?.length ? `<div class="rijal-grades">${grades.map(g => `<span class="rq-chip" title="${(g.text || '').replace(/"/g, '&quot;')}">${g.critic ? g.critic + ': ' : ''}${g.verdict}</span>`).join('')}</div>` : ''}
    ${teachers?.length ? `<div class="rijal-sub"><span class="rijal-k">روى عن (في هذا الكتاب):</span> ${teachers.join('، ')}</div>` : ''}
    ${students?.length ? `<div class="rijal-sub"><span class="rijal-k">روى عنه (في هذا الكتاب):</span> ${students.join('، ')}</div>` : ''}
  `;
  const btn = el.querySelector('.rijal-more');
  if (btn) btn.addEventListener('click', () => { el.querySelector('.rijal-text').textContent = text; btn.remove(); });
  list.appendChild(el);
}

export function buildRijal(n, rijal) {
  const list = document.getElementById('rijal-list');
  list.innerHTML = '';
  const notices = [];
  if (rijal?.tahdhib) notices.push({ src: 'tahdhib', ref: n.tahdhib ? `${n.tahdhib.vol}:${n.tahdhib.n}` : '', text: rijal.tahdhib, teachers: rijal.teachers, students: rijal.students, grades: [] });
  for (const x of rijal?.notices || []) notices.push(x);
  if (!notices.length) return false;
  notices.sort((a, b) => ORDER.indexOf(a.src) - ORDER.indexOf(b.src));
  for (const x of notices) card(list, x);
  const attr = document.createElement('div');
  attr.className = 'rijal-attr';
  attr.textContent = 'النصوص من مشروع OpenITI (نصوص رقمية مصحّحة آلياً، قد تحوي أخطاء طباعية) · الرخصة CC BY-NC-SA 4.0 · المطابقة مع الراوي آلية بحسب الاسم والرموز وسنة الوفاة والشيوخ والتلاميذ، ويُذكر رقم الترجمة للتحقق.';
  list.appendChild(attr);
  return true;
}
