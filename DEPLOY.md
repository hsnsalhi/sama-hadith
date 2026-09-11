# Déploiement · sama-hadith.mainlyb.com

## Architecture

- `client/` — front Vite + Three.js, buildé en statique dans `client/dist`
- `client/public/data/` — **jeu de données statique** généré par `server/scripts/build-dataset.js`
  (narrateurs, transmissions, hadiths par blocs, graphes d'isnad). Le front ne dépend d'aucune API.
- `server/scripts/lib/isnad-graph.js` — analyseur d'isnad : texte → graphe élève→maître (tahwil, « عن أبيه », branches…)
- `server/scripts/lib/reference-extra.js` — dates de décès et lieux des narrateurs célèbres (les autres sont datés par interpolation)
- `server/` (Express + Supabase) et `api/index.js` (Vercel) — API héritée, plus utilisée par le front ; conservée pour référence

### Source des données

Les sept recueils (البخاري، مسلم، أبو داود، الترمذي، النسائي، ابن ماجه، الموطأ) sont lus depuis
`cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1` : texte arabe vocalisé, traduction anglaise, grades,
numéro de livre et de section. Le build les met en cache dans `.cache/hadith-api/`.

```bash
npm run build:data     # ~15 s une fois le cache rempli → client/public/data
npm run build          # données + client
```

Fichiers produits : `manifest.json`, `narrators.json`, `transmissions.json` (lignes `[maître, élève, n, directs]`),
`hadiths/index/<recueil>.json` (recherche), `hadiths/<recueil>/<bloc>.json` (200 hadiths complets avec leur graphe d'isnad),
`narrators/h/<shard>.json` (hadiths de chaque narrateur).

## Option A · GitHub Pages (sans serveur)

Le workflow `.github/workflows/pages.yml` s'exécute à chaque push sur `main` :

1. construit le jeu de données (`node server/scripts/build-dataset.js`, sources en cache)
2. construit le client (`VITE_BASE=/sama-hadith/`)
3. publie `client/dist` sur GitHub Pages

URL : **https://hsnsalhi.github.io/sama-hadith/** — lien profond vers un hadith : `?hadith=bukhari:1`

Aucun secret n'est nécessaire : les sources sont publiques. Les secrets `SUPABASE_*` ne servent plus
qu'au script optionnel `server/scripts/export-static.js` (instantané brut de l'ancienne base).

Pour un domaine personnalisé sur Pages : Settings → Pages → Custom domain `sama-hadith.mainlyb.com`, CNAME chez Namecheap vers `hsnsalhi.github.io`, puis définir la variable d'Actions `SITE_BASE` à `/` (Settings → Secrets and variables → Actions → Variables).

Les données sont figées au moment du build : relancer le workflow (Actions → Deploy to GitHub Pages → Run workflow) pour reconstruire.

## Option B · Vercel (front + API)

1. https://vercel.com/new → importer le dépôt GitHub `hsnsalhi/sama-hadith`.
2. Laisser la détection automatique : `vercel.json` définit déjà install, build, sortie et réécritures.
3. **Environment Variables** (Production + Preview) :

   | Nom | Valeur |
   |---|---|
   | `SUPABASE_URL` | `https://<projet>.supabase.co` |
   | `SUPABASE_KEY` | clé **service_role** (ou clé `sb_secret_...`) |
   | `CLIENT_ORIGIN` | `https://sama-hadith.mainlyb.com` |

4. Deploy. Vérifier `https://<projet>.vercel.app/api/health` → `{"status":"ok"}`.

## 2. Domaine

Dans le projet Vercel → **Settings → Domains** → ajouter `sama-hadith.mainlyb.com`.

Chez le registrar / DNS de `mainlyb.com`, ajouter :

```
Type   Nom            Valeur
CNAME  sama-hadith    cname.vercel-dns.com
```

Le certificat TLS est émis automatiquement par Vercel après propagation DNS.

## 3. Développement local

```bash
npm run install:all
cp server/.env.example server/.env   # renseigner les clés
npm run dev                          # client sur :5173, API sur :3000
```

## 4. Reconstruire la base

```bash
cd server && npm run rebuild-db
```

Vide les trois tables puis les régénère à partir des 7 recueils (API fawazahmed0/hadith-api).
