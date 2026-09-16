import '../styles/stats.css';
import { getManifest, getTransmissions } from '../lib/api.js';

const f = n => Number(n || 0).toLocaleString('en-US');
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '٪' : '—';
const GEN = { sahabi: 'الصحابة', tabii: 'التابعون', muhaddith: 'المحدّثون وأتباع التابعين ومن بعدهم' };
const KIND = { marfu: 'مرفوع إلى النبي ﷺ', mawquf: 'موقوف على صحابي', maqtu: 'مقطوع على تابعي', balagh: 'بلاغ (بلا إسناد)', ray: 'رأي أو قول متأخر' };
const SRC = { reference: 'من قوائم المراجع المدقّقة', taqrib: 'من تقريب التهذيب (سنة مصرَّح بها)', taqrib_approx: 'من تقريب التهذيب (تقريبية: نحو/بعد/قبل)', rijal: 'من كتب الرجال الأخرى (وسيط ما تذكره)', estimated: 'تقديري بالاستيفاء بين المواقع في الأسانيد' };

const row = (k, v, extra = '') => `<tr><td>${k}</td><td class="n">${v}</td>${extra}</tr>`;

async function main() {
  const [m, trans] = await Promise.all([getManifest(), getTransmissions()]);
  const links = trans.length;
  const occ = trans.reduce((a, t) => a + (t.count || 0), 0);
  const direct = trans.reduce((a, t) => a + (t.direct || 0), 0);
  const withText = m.hadiths_with_text, noText = (m.entries_without_text || []).length;
  const s = m.sources || {};
  const bySrc = m.narrators_by_death_source || {}, byGen = m.narrators_by_generation || {};
  const eds = s.hadith?.editions || [];
  const kinds = m.kinds || {};
  const kindTotal = Object.values(kinds).reduce((a, b) => a + b, 0);

  document.getElementById('content').innerHTML = `
  <div class="big">
    <div class="card"><div class="v">${f(m.narrators)}</div><div class="k">راوٍ</div>
      <div class="d">كل اسم مميَّز ورد في أسانيد الكتب السبعة بعد توحيد الرسم ودمج ${f(m.merges)} صيغةً مختصرة أو محرَّفة مع صيغتها الكاملة. يُعدّ الاسم الواحد راوياً واحداً، فقد يجمع الكيان الواحد شخصين متشابهي الاسم لم تكفِ القرائن للفصل بينهما.</div></div>
    <div class="card"><div class="v">${f(links)}</div><div class="k">رابطة</div>
      <div class="d">عدد الأزواج المميَّزة (راوٍ → من روى عنه) المستخرجة من الأسانيد. الرابطة الواحدة قد تتكرر في أحاديث كثيرة: مجموع مرات ورودها ${f(occ)}، منها ${f(direct)} (${pct(direct, occ)}) بصيغة سماع صريحة (حدثنا، أخبرنا، سمعت) والباقي بالعنعنة أو القول.</div></div>
    <div class="card"><div class="v">${f(m.hadiths)}</div><div class="k">حديث</div>
      <div class="d">مجموع المداخل المرقَّمة في الطبعات الرقمية للكتب السبعة، منها ${f(withText)} بنصّ عربي و${f(noText)} مداخل بلا نصّ في المصدر (أُبقيت لتكتمل الأرقام). كل حديث بنصّ استُخرج إسناده: ${f(m.hadiths_with_isnad)} حديثاً بسلسلة رواة، و${f(m.hadiths_without_chain)} بلا سلسلة.</div></div>
  </div>

  <h2>الرواة</h2>
  <div class="card"><h3>بحسب الطبقة</h3><table>${Object.entries(byGen).sort((a, b) => b[1] - a[1]).map(([k, v]) => row(GEN[k] || k, f(v))).join('')}<tr class="total"><td>المجموع</td><td class="n">${f(m.narrators)}</td></tr></table>
    <p class="note">الطبقة من تقريب التهذيب حين تتوفر مطابقة (الطبقة 1 = صحابي، 2–5 = تابعي، 6–12 = من بعدهم)، وإلا فمن بنية الإسناد: من انتهى إليه إسناد مرفوع فهو صحابي، ومن روى عن صحابي فتابعي، ومن روى عن تابعي فتابعي على الأقل، ومن روى عن محدّث فمحدّث.</p></div>
  <div class="card"><h3>مصدر سنة الوفاة</h3><table>${Object.entries(bySrc).sort((a, b) => b[1] - a[1]).map(([k, v]) => row(SRC[k] || k, f(v), `<td class="n">${pct(v, m.narrators)}</td>`)).join('')}</table>
    <p class="note">في تقريب التهذيب يُحذف رقم المئة حين يكون معلوماً («مات سنة تسع وسبعين» لمالك = 179)، فيُستكمل من الطبقة ومن موقع الراوي في الأسانيد. التواريخ التقديرية تُستوفى خطياً بين أقرب راويين معلومي الوفاة في السند نفسه (المصنِّف في رأسه، والنبي ﷺ في آخره)، ثم يؤخذ وسيط التقديرات عبر الأحاديث.</p></div>
  <div class="card"><h3>مطابقة كتب الرجال</h3><table>
    ${row('راوٍ له ترجمة في تقريب التهذيب', f(m.narrators_taqrib), `<td class="n">${pct(m.narrators_taqrib, m.narrators)}</td>`)}
    ${row('راوٍ له ترجمة في تهذيب التهذيب', f(m.narrators_tahdhib), `<td class="n">${pct(m.narrators_tahdhib, m.narrators)}</td>`)}
    ${row('راوٍ له ترجمة واحدة على الأقل في كتب الرجال', f(m.narrators_with_notice), `<td class="n">${pct(m.narrators_with_notice, m.narrators)}</td>`)}
  </table><p class="note">المطابقة آلية: بالاسم وأجزائه (الكنية، «فلان بن فلان»)، وبرموز الكتب التي روى فيها (ع، خ، م، د، ت، س، ق)، وبتوافق الطبقة وسنة الوفاة، وبالشيوخ والتلاميذ المشتركين. الحالات الملتبسة تُترك بلا مطابقة.</p></div>

  <h2>الأحاديث</h2>
  <div class="card"><div class="tblwrap"><table><tr><th>الكتاب</th><th class="n">المداخل</th><th class="n">بلا نصّ</th><th class="n">الطبعة الرقمية (عربي)</th><th class="n">(إنجليزي)</th></tr>
    ${eds.map(e => { const c = m.collections.find(x => x.code === e.code); return `<tr><td>${c?.title_ar || e.code}</td><td class="n">${f(e.hadiths)}</td><td class="n">${f(e.without_text)}</td><td class="n src">${e.ara}</td><td class="n src">${e.eng}</td></tr>`; }).join('')}
    <tr class="total"><td>المجموع</td><td class="n">${f(m.hadiths)}</td><td class="n">${f(noText)}</td><td></td><td></td></tr></table></div></div>
  <div class="card"><h3>نوع الرواية (بحسب منتهى الإسناد)</h3><table>${Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => row(KIND[k] || k, f(v), `<td class="n">${pct(v, kindTotal)}</td>`)).join('')}</table>
    <p class="note">مرفوع: ورد ذكر النبي ﷺ (رسول الله، النبي، رفعه، يبلغ به…) في آخر الإسناد أو أول المتن. موقوف: انتهى الإسناد إلى صحابي. مقطوع: انتهى إلى تابعي. بلاغ: «بلغه أنّ…» بلا إسناد (الموطأ خاصة).</p></div>
  <div class="card"><h3>استخراج الأسانيد</h3><table>
    ${row('أسانيد ورثت ذيلها من الحديث السابق («بهذا الإسناد»، «مثله»)', f(m.isnads_inherited_tail))}
    ${row('أسانيد ورثت رأسها', f(m.isnads_inherited_head))}
    ${row('أسانيد منقولة بكاملها', f(m.isnads_inherited_whole))}
    ${row('صِلات قرابة حُلّت («عن أبيه»، «عن جده» → الاسم)', f(m.relatives_resolved))}
    ${row('أسماء مختصرة وُسّعت من سياقها (سفيان → سفيان بن عيينة…)', f(m.short_names_expanded))}
    ${m.merges_taqrib ? row('كيانات دُمجت لأنها تشير إلى ترجمة واحدة في تقريب التهذيب (سفيان الثوري = سفيان بن سعيد بن مسروق)', f(m.merges_taqrib)) : ''}
    ${row('كلمات مفهرسة للبحث في المتون', f(m.search?.words))}
  </table></div>

  <h2>المصادر</h2>
  <div class="card"><h3>نصوص الأحاديث</h3>
    <p><b>${s.hadith?.name || 'fawazahmed0/hadith-api'}</b> — طبعات رقمية للكتب السبعة (النص العربي مشكولاً، والترجمة الإنجليزية)، تُحمَّل من الشبكة عند البناء. <a href="${s.hadith?.url || '#'}" target="_blank" rel="noopener">${s.hadith?.url || ''}</a></p>    ${s.hadith?.supplement?.completed ? `<p class="note">${f(s.hadith.supplement.completed)} حديثاً نصُّها فارغ في هذه الطبعات أُكمل من <a href="${s.hadith.supplement.url}" target="_blank" rel="noopener">${s.hadith.supplement.name}</a> (مأخوذ من sunnah.com) بعد مطابقة الترقيمَين نصاً بنص؛ ما لم تتأكد مطابقته بقي بلا نص (${f(m.entries_without_text?.length)} حديثاً).</p>` : ''}
    ${s.hadith?.supplement?.completed ? `<p class="note">${f(s.hadith.supplement.completed)} حديثاً نصُّها فارغ في هذه الطبعات أُكمل من <a href="${s.hadith.supplement.url}" target="_blank" rel="noopener">${s.hadith.supplement.name}</a> (مأخوذ من sunnah.com) بعد مطابقة الترقيمَين نصاً بنص؛ وما لم تتأكد مطابقته بقي بلا نص (${f(m.entries_without_text?.length)} حديثاً).</p>` : ''}
  </div>
  <div class="card"><h3>تراجم الرواة</h3>
    <div class="tblwrap"><table><tr><th>الكتاب</th><th>المؤلف</th><th class="n">التراجم</th><th class="n">بسنة وفاة</th><th class="n">بقوائم الرواة</th><th class="n">بأحكام النقّاد</th><th class="n">راوٍ مطابَق</th></tr>
    ${(s.rijal?.books || []).map(b => `<tr><td>${b.title}</td><td>${b.author} (ت ${b.author_death} هـ)</td><td class="n">${f(b.entries)}</td><td class="n">${f(b.with_death)}</td><td class="n">${f(b.with_lists)}</td><td class="n">${f(b.with_verdicts)}</td><td class="n">${f(b.matched)}</td></tr>`).join('')}</table></div>
    <p><b>تقريب التهذيب</b> لابن حجر العسقلاني (ت 852 هـ): ${f(s.rijal?.taqrib?.entries)} ترجمة، استُخرج منها الحكم لـ${f(s.rijal?.taqrib?.with_grade)} راوياً، والطبقة لـ${f(s.rijal?.taqrib?.with_layer)}، وسنة الوفاة لـ${f(s.rijal?.taqrib?.with_death)}.</p>
    <p><b>تهذيب التهذيب</b> لابن حجر: ${f(s.rijal?.tahdhib?.entries)} ترجمة موسّعة، منها ${f(s.rijal?.tahdhib?.with_teachers)} بقائمة «روى عن» و${f(s.rijal?.tahdhib?.with_students)} بقائمة «روى عنه».</p>
    <p class="note">كل كتاب يُحمَّل نصّه من مستودعات OpenITI عند البناء ويُقرأ آلياً: يُستخرج من كل ترجمة الاسم، ورموز الكتب الستة إن وُجدت، وسنة الوفاة، وقوائم «روى عن» و«روى عنه»، وأقوال النقّاد. ثم تُطابَق الترجمة مع الراوي بالاسم وأجزائه، والرموز، وسنة الوفاة، والرواة المشتركين في الأسانيد، وبترجمته في تقريب التهذيب إن سبقت مطابقتها. كتب الصحابة (الاستيعاب، أسد الغابة، الإصابة، معرفة الصحابة) لا تُطابَق إلا مع رواة الطبقة الأولى. الحالات الملتبسة تُترك بلا مطابقة، وتُعرض كل ترجمة على صفحة الراوي مع اسم الكتاب ورقم الترجمة للتحقق.</p>
    <p class="note">النصان من مشروع <a href="${s.rijal?.url || '#'}" target="_blank" rel="noopener">OpenITI</a> (${s.rijal?.name || ''})، الرخصة ${s.rijal?.licence || 'CC BY-NC-SA 4.0'}. وهما نصوص رقمية مصحَّحة آلياً قد تحوي أخطاء طباعية؛ تُعرض كما هي مع ذكر رقم الترجمة.</p></div>
  <div class="card"><h3>قوائم مرجعية مدقّقة</h3>
    <p>${f(s.reference?.legacy)} + ${f(s.reference?.extra)} راوياً مشهوراً بتواريخ وفاة وطبقات وبلدان موثّقة من كتب التراجم (سير أعلام النبلاء، الإصابة، تهذيب الكمال)، تُستعمل مراسيَ للتأريخ، و${f(s.reference?.bios)} نبذة مكتوبة لأشهر الرواة.</p></div>

  <h2>الطريقة باختصار</h2>
  <div class="card"><ol>
    <li><b>تحليل الإسناد</b>: يُقرأ نص كل حديث كلمةً كلمة؛ أدوات التحمّل (حدثنا، أخبرنا، عن، سمعت، أنّ فلاناً أخبره…) تحدّد الاتجاه، ويُقرأ الاسم بقواعد الاسم العربي (الكنية، «بن»، النسبة، اللقب). يُعالَج التحويل «ح»، وتعدد الشيوخ («قال فلان: أخبرنا، وقال الآخران: حدثنا»)، والقرابة («عن أبيه»، «حدثني عمي»)، والإحالات («بهذا الإسناد»).</li>
    <li><b>ضبط الأسماء</b>: كلمة مفردة لا تُقبل اسماً إلا إذا وردت في معجم أسماء الرجال المستخرج من التقريب والتهذيب (${f(m.name_vocabulary)} كلمة) أو جاءت في موقع اسم (بين أداتي تحمّل، أو قبل «بن»). الألقاب التشريفية (رضي الله عنه…) والنصب («سمعت مجاهداً») تُعالَج.</li>
    <li><b>التوحيد</b>: توحَّد الصيغ (أبي/أبا/أبو، عبدالله/عبد الله، إسمعيل/إسماعيل)، وتُدمج الصيغة المختصرة مع الكاملة حين تتشارك الجيران ولا تجتمعان في إسناد واحد.</li>
    <li><b>المطابقة مع كتب الرجال</b> ثم <b>التأريخ</b> و<b>تحديد الطبقة</b> و<b>نوع الرواية</b> كما شُرح أعلاه.</li>
  </ol><p class="note">آخر بناء للبيانات: ${m.generated_at ? new Date(m.generated_at).toLocaleDateString('en-GB') : '—'}. الشيفرة مفتوحة على GitHub (hsnsalhi/sama-hadith).</p></div>`;
}
main().catch(e => { console.error(e); document.getElementById('content').innerHTML = '<p class="loading">تعذّر تحميل البيانات.</p>'; });
