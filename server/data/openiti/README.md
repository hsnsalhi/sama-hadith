# Textes de rijāl (OpenITI)

Deux ouvrages d'Ibn Ḥajar al-ʿAsqalānī (m. 852 H), tels que publiés par le projet
[OpenITI](https://github.com/OpenITI) (dépôt `0875AH`, auteur `0852IbnHajarCasqalani`) :

| Fichier | Ouvrage | Identifiant OpenITI |
|---|---|---|
| `taqrib-tahdhib.txt` | تقريب التهذيب | `0852IbnHajarCasqalani.TaqribTahdhib.JK000121-ara1.completed` |
| `tahdhib-tahdhib.txt` | تهذيب التهذيب | `0852IbnHajarCasqalani.TahdhibTahdhib.JK000134-ara1.mARkdown` |

Licence des textes OpenITI : **CC BY-NC-SA 4.0** (usage non commercial, attribution, partage
aux mêmes conditions). Le site les cite avec attribution. Édition du Taqrīb : Muḥammad ʿAwwāma,
Dār al-Rashīd, 1406/1986.

Les entrées sont lues par `server/scripts/lib/taqrib.js` au moment du build et rapprochées
des narrateurs extraits des isnads.

## Autres dictionnaires (téléchargés au build)

Les autres livres de rijāl ne sont pas copiés dans le dépôt : `server/scripts/lib/openiti.js`
les télécharge depuis les dépôts OpenITI au moment du build (cache `.cache/openiti/`, conservé
par GitHub Actions) et les lit avec un lecteur générique du format mARkdown (entrées `### $`).
La liste des ouvrages (Tahdhīb al-Kamāl, al-Kāshif, al-Jarḥ wa-l-taʿdīl, al-Thiqāt, al-Tārīkh
al-kabīr, Ṭabaqāt Ibn Saʿd, al-ʿIjlī, al-Majrūḥīn, Ibn Shāhīn, Mīzān al-iʿtidāl, Siyar aʿlām
al-nubalāʾ, al-Istīʿāb, Usd al-ghāba, al-Iṣāba, Maʿrifat al-ṣaḥāba) est dans `SOURCES`.
Même licence : CC BY-NC-SA 4.0, avec attribution sur le site.
