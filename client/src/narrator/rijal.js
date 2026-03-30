const RIJAL_DATA = {
  'أبو هريرة': [
    { critic: 'البخاري', text: 'أكثر الصحابة حديثاً عن رسول الله ﷺ', grade: 'ثقة' },
    { critic: 'الذهبي', text: 'حافظ الصحابة', grade: 'ثقة' },
  ],
  'عائشة بنت أبي بكر': [
    { critic: 'ابن حجر', text: 'أم المؤمنين وأفقه نساء الأمة', grade: 'ثقة' },
  ],
  'البخاري': [
    { critic: 'ابن خزيمة', text: 'ما رأيت تحت أديم السماء أعلم بحديث رسول الله ﷺ من محمد بن إسماعيل', grade: 'إمام' },
    { critic: 'الترمذي', text: 'ما رأيت أحداً أعلم بالعلل والرجال من البخاري', grade: 'إمام' },
  ],
  'مالك بن أنس': [
    { critic: 'الشافعي', text: 'مالك حجة الله على خلقه بعد التابعين', grade: 'حجة إمام' },
    { critic: 'يحيى بن معين', text: 'ثقة، هو أثبت الناس في كل شيء', grade: 'ثقة' },
  ],
  'أحمد بن حنبل': [
    { critic: 'ابن المديني', text: 'ليس في أصحابنا أحفظ من أحمد', grade: 'إمام حافظ' },
    { critic: 'الشافعي', text: 'خرجت من بغداد وما خلفت بها أحداً أفضل ولا أعلم ولا أفقه من أحمد', grade: 'إمام' },
  ],
};

export function buildRijal(narrator) {
  const list = document.getElementById('rijal-list');
  const data = RIJAL_DATA[narrator.name_ar] || [];

  if (narrator.reliability) {
    const card = document.createElement('div');
    card.className = 'rijal-card';
    card.innerHTML = `
      <div class="rijal-name">الحكم العام</div>
      <div class="rijal-text">${narrator.reliability}</div>
      <span class="rijal-grade" style="background:rgba(122,245,192,.08);border:0.5px solid rgba(122,245,192,.2);color:#7af5c0">${narrator.reliability}</span>
    `;
    list.appendChild(card);
  }

  data.forEach(r => {
    const card = document.createElement('div');
    card.className = 'rijal-card';
    card.innerHTML = `
      <div class="rijal-name">${r.critic}</div>
      <div class="rijal-text">"${r.text}"</div>
      <span class="rijal-grade" style="background:rgba(122,245,192,.08);border:0.5px solid rgba(122,245,192,.2);color:#7af5c0">${r.grade}</span>
    `;
    list.appendChild(card);
  });
}
