# 🏗️ MonSuivi Financier BTP — Déploiement Vercel

Application de suivi budgétaire BTP professionnelle — **100% statique**, déployable sur Vercel en 2 minutes.

---

## 🚀 Déploiement sur Vercel (via GitHub)

### Étape 1 — Préparer le dépôt GitHub
```bash
git init
git add .
git commit -m "feat: MonSuivi BTP v4.0 — Vercel ready"
git branch -M main
git remote add origin https://github.com/VOTRE_USERNAME/monsuivi-btp.git
git push -u origin main
```

### Étape 2 — Déployer sur Vercel
1. Allez sur [vercel.com](https://vercel.com) → **New Project**
2. **Import** votre dépôt GitHub `monsuivi-btp`
3. Framework Preset : **Other** (pas de build required)
4. Cliquez **Deploy** → ✅ Déployé en ~30 secondes !

---

## ☁️ Configuration Supabase (Optionnel — Sync Cloud)

### Étape 1 — Créer un projet Supabase
1. Allez sur [supabase.com](https://supabase.com) → **New Project**
2. Notez votre **URL** et votre **clé anon** (dans Settings → API)

### Étape 2 — Créer la table
1. Dans Supabase → **SQL Editor**
2. Collez le contenu de `supabase-schema.sql` et exécutez

### Étape 3 — Connecter l'app
1. Ouvrez l'application déployée
2. Menu ⚙️ → **Préférences** → section **☁️ Sync Cloud**
3. Entrez votre URL Supabase et votre clé anon
4. Cliquez **🔌 Connecter**
5. Utilisez **☁️ ↑ Sauvegarder** pour envoyer vos données

---

## 🔐 Système de licence

L'application utilise un système de licence par **empreinte appareil**.

### Premier accès
1. Visitez votre URL Vercel
2. L'écran de licence s'affiche avec votre **empreinte appareil**
3. Notez cette empreinte (ex: `A3B7KM9`)

### Générer une licence
1. Sur l'écran de licence, tapez **`admin`** au clavier
2. Mot de passe admin : `CIVILPLUS-ADMIN-2024`
3. Entrez le nom client + l'empreinte → **Générer le code**
4. Copiez le code et entrez-le dans le champ de licence

### Accès direct sans licence (pour test)
- Ouvrez l'URL avec le hash : `https://votre-app.vercel.app/#admin`

---

## 📁 Structure du projet

```
monsuivi-btp/
├── index.html          # Application complète (self-contained)
├── vercel.json         # Configuration Vercel (headers, routing)
├── supabase-schema.sql # Schema SQL à exécuter dans Supabase
└── README.md           # Ce fichier
```

---

## ✨ Fonctionnalités

| Feature | Status |
|---------|--------|
| Saisie dépenses / entrées | ✅ |
| Journal filtrable & triable | ✅ |
| Synthèse par N° Prix / LOT | ✅ |
| Dashboard avec 3 graphiques | ✅ |
| Import/Export CSV & JSON | ✅ |
| Mode sombre / clair | ✅ |
| 6 devises (FCFA, EUR, USD...) | ✅ |
| Sync cloud Supabase | ✅ |
| Système de licence | ✅ |
| Responsive mobile | ✅ |

---

## 🛠️ Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Ctrl+S` | Export JSON |
| `Ctrl+I` | Import JSON |

---

*MonSuivi Financier BTP v4.0 — CIVIL+*
