# سماء الحديث · Sama al-Hadith

<div dir="rtl">

## بالعربية

**سماء الحديث** أطلس تفاعلي لرواة الحديث في الكتب السبعة: صحيح البخاري، صحيح مسلم، سنن أبي داود، جامع الترمذي، سنن النسائي، سنن ابن ماجه، وموطأ مالك. يُقرأ إسناد كل حديث آلياً، فتُبنى منه شبكة الرواة (من روى عمّن)، وتُعرض في «سماء» يمكن تصفّحها في بعدين أو ثلاثة: المحور الأفقي هو الزمن (سنة الوفاة بالهجري)، والمحور العمودي هو الموطن، والعمق هو موقع الراوي في الإسناد.

الموقع: <https://hsnsalhi.github.io/sama-hadith/>

### ما يقدّمه الموقع

- **سماء الرواة**: أكثر من أحد عشر ألف راوٍ، ونحو ثمانية وثلاثين ألف رابطة رواية، مع تصفية بحسب الطبقة (الصحابة، التابعون، المحدّثون) والبحث بالاسم.
- **مسار الإسناد**: اختر أي حديث من الستة والثلاثين ألف حديث فتُرسم سلسلة رواته في السماء، مع تمييز السماع الصريح عن العنعنة، والإسناد الموروث من الحديث السابق («بهذا الإسناد»)، ونوع الرواية (مرفوع، موقوف، مقطوع، بلاغ).
- **ترجمة الراوي**: صفحة لكل راوٍ فيها ترجمته كما وردت في كتب الرجال (تقريب التهذيب، تهذيب التهذيب، تهذيب الكمال، الكاشف، الجرح والتعديل، الثقات، التاريخ الكبير، طبقات ابن سعد، ميزان الاعتدال، سير أعلام النبلاء، كتب الصحابة…) مع رقم الترجمة، وأقوال النقّاد فيه، ومن روى عنهم ومن روى عنه، وأحاديثه كاملة.
- **الإحصاءات والمصادر**: صفحة تشرح من أين يأتي كل رقم، وما هي المصادر، وكيف بُنيت البيانات.

### المصادر

- نصوص الأحاديث: الطبعات الرقمية لمشروع [hadith-api](https://github.com/fawazahmed0/hadith-api).
- تراجم الرواة: نصوص مشروع [OpenITI](https://github.com/OpenITI) (الرخصة CC BY-NC-SA 4.0)، تُحمَّل عند البناء وتُقرأ آلياً.
- قوائم مرجعية مدقّقة لأشهر الرواة (تواريخ الوفاة والطبقات والبلدان).

النصوص الرقمية مصحّحة آلياً وقد تحوي أخطاء، والمطابقة بين الترجمة والراوي آلية؛ لذلك يُذكر دائماً اسم الكتاب ورقم الترجمة للتحقق.

### الرخصة والمساهمة

الموقع والشيفرة مفتوحان للجميع ولأي استعمال، بلا مقابل ولا شرط: الشيفرة برخصة **0BSD** (ملف `LICENSE`)، ومحتوى الموقع الذي أنشأه المشروع (النصوص والوثائق والصور والبيانات المستخرجة) بإهداء **CC0 1.0** إلى الملك العام (ملف `LICENSE-CONTENT`). أما النصوص المقتبسة من مصادر خارجية فتبقى على شروط أصحابها (طبعات hadith-api، ونصوص OpenITI برخصة CC BY-NC-SA 4.0). الاقتراحات والمساهمات تُطرح في [نقاشات المستودع على GitHub](https://github.com/hsnsalhi/sama-hadith/discussions).

</div>

---

## English

**Sama al-Hadith** ("the sky of hadith") is an interactive atlas of the narrators of the seven canonical hadith collections: Ṣaḥīḥ al-Bukhārī, Ṣaḥīḥ Muslim, Sunan Abī Dāwūd, Jāmiʿ al-Tirmidhī, Sunan al-Nasāʾī, Sunan Ibn Mājah and the Muwaṭṭaʾ of Mālik. The chain of transmission (isnād) of every hadith is parsed automatically, the resulting network of narrators (who transmitted from whom) is built, and it is displayed as a "sky" that can be explored in two or three dimensions: the horizontal axis is time (year of death, Hijri), the vertical axis the narrator's home town, the depth his position in the chains.

Live site: <https://hsnsalhi.github.io/sama-hadith/>

### Features

- **The narrators' sky**: more than 11,000 narrators and about 38,000 transmission links, filtered by layer (Companions, Successors, later traditionists), with search by name.
- **Isnād path**: pick any of the 36,000 hadiths and its chain is drawn in the sky, distinguishing explicit audition (ḥaddathanā, akhbaranā, samiʿtu) from ʿanʿana, chains inherited from the previous hadith ("bi-hādhā l-isnād"), and the kind of report (marfūʿ, mawqūf, maqṭūʿ, balāgh).
- **Narrator page**: for every narrator, his entries in the classical biographical dictionaries (Taqrīb al-Tahdhīb, Tahdhīb al-Tahdhīb, Tahdhīb al-Kamāl, al-Kāshif, al-Jarḥ wa-l-taʿdīl, al-Thiqāt, al-Tārīkh al-kabīr, Ṭabaqāt Ibn Saʿd, Mīzān al-iʿtidāl, Siyar aʿlām al-nubalāʾ, the dictionaries of Companions…) with the entry number, the critics' verdicts, the people he transmitted from and to, and all his hadiths.
- **Statistics and sources**: a page explaining where every figure comes from, which sources are used, and how the data is built.

### Data and method

1. The seven collections (vocalised Arabic text and English translation) are downloaded from [hadith-api](https://github.com/fawazahmed0/hadith-api).
2. Each isnād is parsed word by word: transmission verbs give the direction, a grammar of the Arabic name (kunya, "ibn", nisba, laqab) reads the names, and the frequent constructions are handled (taḥwīl "ح", groups of teachers speaking in turn, relatives "ʿan abīhi", references to the previous chain).
3. Names are normalised and disambiguated: a bare given name is resolved from its neighbours in the chain, from the teacher/student lists of the biographical dictionaries, and from the plausibility of dates; a word is accepted as a name only if the dictionaries know it.
4. The biographical dictionaries are downloaded from [OpenITI](https://github.com/OpenITI) at build time and read automatically (name, sigla of the six books, year of death, teachers, students, verdicts); each entry is aligned with a narrator by name, sigla, date and shared neighbours.
5. Dates missing from the sources are estimated by interpolation along the chains; layers and kinds of report are derived from the structure of the chains and from the dictionaries.

All digital texts are machine-corrected and may contain errors, and the alignment between an entry and a narrator is automatic: the book and the entry number are always shown so that the reader can check.

### Running it

```bash
npm install && (cd client && npm install)
npm run build:data          # builds client/public/data from the sources (cached in .cache/)
cd client && npm run dev    # local development server
VITE_BASE=/sama-hadith/ npm run build   # static site in client/dist (sub-path for GitHub Pages)
```

The site is deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`. See `DEPLOY.md` for other hosts.

### Licence and contributions

The site and its code are open to everyone for any use, free of charge and without conditions: the code is released under **0BSD** (file `LICENSE`), and the content created by the project (texts, documentation, images, extracted data) is dedicated to the public domain under **CC0 1.0** (file `LICENSE-CONTENT`). Third-party texts keep their own terms: the hadith editions of hadith-api, and the OpenITI biographical texts (CC BY-NC-SA 4.0, quoted with attribution). Suggestions and contributions go to the [GitHub Discussions of the repository](https://github.com/hsnsalhi/sama-hadith/discussions).

---

## Français

**Sama al-Hadith** (« le ciel du hadith ») est un atlas interactif des transmetteurs des sept recueils canoniques du hadith : Ṣaḥīḥ al-Bukhārī, Ṣaḥīḥ Muslim, Sunan Abī Dāwūd, Jāmiʿ al-Tirmidhī, Sunan al-Nasāʾī, Sunan Ibn Mājah et le Muwaṭṭaʾ de Mālik. La chaîne de transmission (isnād) de chaque hadith est lue automatiquement, le réseau des transmetteurs (qui a transmis de qui) en est déduit, et il est représenté comme un « ciel » que l'on parcourt en deux ou trois dimensions : l'axe horizontal est le temps (année de décès, hégire), l'axe vertical la ville d'origine, la profondeur la position du transmetteur dans les chaînes.

Site : <https://hsnsalhi.github.io/sama-hadith/>

### Ce que propose le site

- **Le ciel des transmetteurs** : plus de 11 000 transmetteurs et environ 38 000 liens de transmission, avec filtre par couche (Compagnons, Successeurs, traditionnistes postérieurs) et recherche par nom.
- **Le chemin de l'isnād** : on choisit l'un des 36 000 hadiths et sa chaîne est tracée dans le ciel, en distinguant l'audition explicite (ḥaddathanā, akhbaranā, samiʿtu) de la ʿanʿana, les chaînes héritées du hadith précédent (« bi-hādhā l-isnād ») et le type de rapport (marfūʿ, mawqūf, maqṭūʿ, balāgh).
- **La fiche du transmetteur** : pour chacun, ses notices dans les dictionnaires biographiques classiques (Taqrīb al-Tahdhīb, Tahdhīb al-Tahdhīb, Tahdhīb al-Kamāl, al-Kāshif, al-Jarḥ wa-l-taʿdīl, al-Thiqāt, al-Tārīkh al-kabīr, Ṭabaqāt Ibn Saʿd, Mīzān al-iʿtidāl, Siyar aʿlām al-nubalāʾ, les dictionnaires des Compagnons…) avec le numéro de la notice, les jugements des critiques, ceux dont il a transmis et ceux qui ont transmis de lui, et tous ses hadiths.
- **Statistiques et sources** : une page qui explique d'où vient chaque chiffre, quelles sont les sources et comment les données sont construites.

### Données et méthode

1. Les sept recueils (texte arabe vocalisé et traduction anglaise) sont téléchargés depuis [hadith-api](https://github.com/fawazahmed0/hadith-api).
2. Chaque isnād est lu mot à mot : les verbes de transmission donnent la direction, une grammaire du nom arabe (kunya, « ibn », nisba, laqab) lit les noms, et les constructions fréquentes sont traitées (taḥwīl « ح », groupes de maîtres parlant tour à tour, parents « ʿan abīhi », renvois à la chaîne précédente).
3. Les noms sont normalisés et désambiguïsés : un prénom nu est résolu d'après ses voisins dans la chaîne, d'après les listes de maîtres et d'élèves des dictionnaires, et d'après la vraisemblance des dates ; un mot n'est accepté comme nom que si les dictionnaires le connaissent.
4. Les dictionnaires biographiques sont téléchargés depuis [OpenITI](https://github.com/OpenITI) au moment du build et lus automatiquement (nom, sigles des six livres, année de décès, maîtres, élèves, jugements) ; chaque notice est alignée sur un transmetteur par le nom, les sigles, la date et les voisins communs.
5. Les dates absentes des sources sont estimées par interpolation le long des chaînes ; les couches et les types de rapport sont déduits de la structure des chaînes et des dictionnaires.

Les textes numériques sont corrigés automatiquement et peuvent contenir des erreurs, et l'alignement entre une notice et un transmetteur est automatique : le livre et le numéro de la notice sont toujours affichés pour permettre la vérification.

### Lancer le projet

```bash
npm install && (cd client && npm install)
npm run build:data          # construit client/public/data à partir des sources (cache dans .cache/)
cd client && npm run dev    # serveur de développement
VITE_BASE=/sama-hadith/ npm run build   # site statique dans client/dist (sous-chemin pour GitHub Pages)
```

Le site est déployé sur GitHub Pages par `.github/workflows/pages.yml` à chaque push sur `main`. Voir `DEPLOY.md` pour les autres hébergements.

### Licence et contributions

Le site et son code sont ouverts à tous et pour tout usage, gratuitement et sans condition : le code est sous licence **0BSD** (fichier `LICENSE`), et le contenu créé par le projet (textes, documentation, images, données extraites) est versé au domaine public sous **CC0 1.0** (fichier `LICENSE-CONTENT`). Les textes tiers gardent leurs propres conditions : les éditions de hadith-api et les textes biographiques d'OpenITI (CC BY-NC-SA 4.0, cités avec attribution). Suggestions et contributions se font dans les [discussions GitHub du dépôt](https://github.com/hsnsalhi/sama-hadith/discussions).
