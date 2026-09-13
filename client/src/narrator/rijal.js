// Tahdhīb al-Tahdhīb (Ibn Ḥajar): the full notice matched to this narrator, as published by OpenITI (CC BY-NC-SA 4.0).
export function buildRijal(n, rijal) {
  const list = document.getElementById('rijal-list');
  list.innerHTML = '';
  if (!rijal?.tahdhib) return;
  const text = rijal.tahdhib;
  const short = text.length > 900;
  const card = document.createElement('div');
  card.className = 'rijal-card';
  const ref = n.tahdhib ? `الجزء ${n.tahdhib.vol} · الترجمة رقم ${n.tahdhib.n}` : '';
  card.innerHTML = `
    <div class="rijal-name">تهذيب التهذيب لابن حجر العسقلاني${ref ? ' · ' + ref : ''}</div>
    <div class="rijal-text" id="tahdhib-text">${short ? text.slice(0, 900) + '…' : text}</div>
    ${short ? '<button class="rijal-more" id="tahdhib-more">عرض الترجمة كاملة</button>' : ''}
    ${rijal.teachers?.length ? `<div class="rijal-sub"><span class="rijal-k">روى عن (في التهذيب):</span> ${rijal.teachers.join('، ')}</div>` : ''}
    ${rijal.students?.length ? `<div class="rijal-sub"><span class="rijal-k">روى عنه (في التهذيب):</span> ${rijal.students.join('، ')}</div>` : ''}
    <div class="rijal-attr">النص من مشروع OpenITI (مخطوطة رقمية مصحّحة آلياً، قد تحوي أخطاء طباعية) · الرخصة CC BY-NC-SA 4.0 · المطابقة مع الراوي آلية بحسب الاسم والرموز والشيوخ والتلاميذ.</div>
  `;
  list.appendChild(card);
  const btn = card.querySelector('#tahdhib-more');
  if (btn) btn.addEventListener('click', () => { card.querySelector('#tahdhib-text').textContent = text; btn.remove(); });
}
