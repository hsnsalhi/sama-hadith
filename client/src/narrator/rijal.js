// The notices of the rijāl books matched to this narrator (texts from OpenITI, CC BY-NC-SA 4.0).
const BOOKS = {
  tahdhib: { title: 'تهذيب التهذيب', author: 'ابن حجر العسقلاني (ت 852 هـ)' },
  kamal: { title: 'تهذيب الكمال في أسماء الرجال', author: 'جمال الدين المزّي (ت 742 هـ)' },
  kashif: { title: 'الكاشف', author: 'شمس الدين الذهبي (ت 748 هـ)' },
  jarh: { title: 'الجرح والتعديل', author: 'ابن أبي حاتم الرازي (ت 327 هـ)' },
  thiqat: { title: 'الثقات', author: 'ابن حبّان البستي (ت 354 هـ)' },
  tarikh: { title: 'التاريخ الكبير', author: 'البخاري (ت 256 هـ)' },
};
const ORDER = ['tarikh', 'jarh', 'thiqat', 'kamal', 'kashif', 'tahdhib'];

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
