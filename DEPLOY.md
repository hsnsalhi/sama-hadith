# Déploiement · sama-hadith.mainlyb.com

## Architecture

- `client/` — front Vite + Three.js, buildé en statique dans `client/dist`
- `server/src/app.js` — API Express (`/api/narrators`, `/api/transmissions`, `/api/hadiths`, `/api/health`)
- `api/index.js` — point d'entrée Vercel : toute requête `/api/*` est réécrite vers cette fonction serverless, qui exécute l'app Express
- Supabase — base de données (tables `narrators`, `transmissions`, `hadiths`)

La clé Supabase n'est jamais exposée au navigateur : seul le serveur (fonction Vercel) la lit via les variables d'environnement.

## Option A · GitHub Pages (sans serveur)

Le workflow `.github/workflows/pages.yml` s'exécute à chaque push sur `main` :

1. exporte un instantané JSON de la base (`server/scripts/export-static.js`)
2. construit le client en mode statique (`VITE_STATIC_DATA=1`)
3. publie `client/dist` sur GitHub Pages

URL : **https://hsnsalhi.github.io/sama-hadith/**

Prérequis, une seule fois, dans le dépôt GitHub → **Settings → Secrets and variables → Actions** :

| Secret | Valeur |
|---|---|
| `SUPABASE_URL` | `https://<projet>.supabase.co` |
| `SUPABASE_KEY` | clé service_role (ou `sb_secret_...`) |

La clé n'est utilisée que pendant le build ; elle n'apparaît jamais dans le site publié.

Pour un domaine personnalisé sur Pages : Settings → Pages → Custom domain `sama-hadith.mainlyb.com`, CNAME chez Namecheap vers `hsnsalhi.github.io`, puis définir la variable d'Actions `SITE_BASE` à `/` (Settings → Secrets and variables → Actions → Variables).

Les données sont figées au moment du build : relancer le workflow (Actions → Deploy to GitHub Pages → Run workflow) après un `rebuild-db`.

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
