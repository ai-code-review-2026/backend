# ⚠️ Mobile Build Status

## 🚫 Mobile Build temporairement désactivé

### Problème technique

L'application dashboard utilise **Next.js App Router avec routes dynamiques** qui ne sont pas compatibles avec `output: 'export'` (requis pour Capacitor mobile).

**Pages dynamiques problématiques:**
```
/dashboard/diff/[id]
/dashboard/projects/[id]
/dashboard/analyses/[id]
/dashboard/teams/[teamId]
... et 50+ autres routes
```

---

### Pourquoi ça ne marche pas?

#### `output: 'export'` requirements

Next.js static export nécessite:
1. ✅ Pas d'API routes (`/api/*`)
2. ✅ Pas de middleware server-side
3. ❌ **Pas de dynamic routes SANS `generateStaticParams`**

#### Notre situation

Notre dashboard a:
- ✅ 100+ API routes → **backup OK**
- ✅ Clerk middleware → **backup OK**
- ❌ **50+ dynamic pages** (`[id]`, `[teamId]`, etc.) → **BLOQUE le build**

---

### Solutions possibles (par ordre de difficulté)

#### Solution 1: Ajouter `generateStaticParams` partout (long, non recommandé)

```typescript
// dashboard/diff/[id]/page.tsx
export async function generateStaticParams() {
  // Pré-générer TOUS les IDs possibles
  const analyses = await fetch('/api/analyses')
  return analyses.map((a) => ({ id: a.id }))
}
```

**Problèmes:**
- 50+ fichiers à modifier
- Nécessite connaître TOUS les IDs à l'avance
- Build time >> 1 heure (génère des milliers de pages statiques)
- Taille finale >> 1 GB

---

#### Solution 2: Mode SPA Capacitor (recommandé si mobile nécessaire)

Au lieu de static export, utiliser **Capacitor + Next.js dev server local**:

```javascript
// capacitor.config.ts
export default {
  server: {
    url: 'http://localhost:3001',  // Dev server
    cleartext: true
  }
}
```

**Avantages:**
- ✅ Pas besoin de static export
- ✅ Toutes les features fonctionnent (API routes, dynamic routes)
- ✅ Hot reload pendant dev

**Inconvénients:**
- ⚠️ Nécessite backend accessible (localhost ou VPN)
- ⚠️ Pas 100% offline
- ⚠️ Latence réseau

---

#### Solution 3: Dashboard mobile simplifié (compromis)

Créer une version mobile avec **pages statiques uniquement**:

```
Mobile app (Capacitor):
├── Home page (statique)
├── Login page (statique)
├── Analysis list (call API → CSR)
└── Analysis detail → ouvre navigateur externe

Web app (Next.js full):
├── Toutes les routes dynamiques
└── Admin panel
```

**Avantages:**
- ✅ Mobile app léger (~ 10 MB)
- ✅ Build rapide (< 2 min)
- ✅ Fonctionne offline pour pages principales

**Inconvénients:**
- ⚠️ Features limitées sur mobile
- ⚠️ Nécessite maintenir 2 versions

---

### 🎯 Recommandation pour PFE

#### Option A: Skip mobile (focus web) ✅ **RECOMMANDÉ**

**Arguments:**
1. Dashboard est principalement un **outil desktop** (large screen, multi-panels)
2. Time to market: focus sur features core plutôt que mobile
3. Web responsive suffit pour 90% des cas d'usage
4. Mobile peut être Phase 2 post-PFE

**Dans ton rapport PFE:**
> "Le dashboard AI Code Review Platform est conçu comme une application web responsive 
> accessible sur desktop et mobile via navigateur. Une application native mobile (iOS/Android) 
> via Capacitor a été explorée mais désactivée temporairement en raison de limitations techniques 
> du static export Next.js avec routes dynamiques. Cette fonctionnalité est prévue en Phase 2 
> avec une architecture SPA ou une version mobile simplifiée."

---

#### Option B: Implémenter Solution 2 (SPA mode)

Si mobile est **critique** pour ton PFE:

1. Modifier `capacitor.config.ts` pour pointer vers dev server
2. Setup backend accessible (ngrok, Cloudflare Tunnel, ou VPN)
3. Build APK/IPA qui se connecte au backend

**Temps estimé:** 2-3 heures

---

### 📊 Comparaison solutions

| Solution | Effort | Offline | Features | Build Time |
|----------|--------|---------|----------|------------|
| **generateStaticParams** | 🔴 Très élevé (50+ files) | ✅ Oui | ✅ 100% | 🔴 > 1h |
| **SPA mode** | 🟡 Moyen (config) | ❌ Non | ✅ 100% | ✅ < 5 min |
| **Mobile simplifié** | 🟡 Moyen (new pages) | 🟡 Partiel | ⚠️ 30% | ✅ < 2 min |
| **Skip mobile** | ✅ Aucun | N/A | N/A | N/A |

---

### 🔧 Si tu veux quand même essayer (déconseillé)

#### Étape 1: Identifier toutes les dynamic routes

```bash
cd apps/dashboard
find app -name "[*]" -type d
```

**Résultat (partiel):**
```
app/dashboard/diff/[id]
app/dashboard/projects/[id]
app/dashboard/analyses/[id]
app/dashboard/teams/[teamId]
app/dashboard/teams/[teamId]/members/[userId]
app/dashboard/admin/organizations/[id]
app/dashboard/admin/users/[id]
app/api/dashboard/analyses/[id]
... 50+ autres
```

#### Étape 2: Backup TOUTES les dynamic routes

`scripts/build-mobile.js`:
```javascript
const DYNAMIC_ROUTES = [
  'app/dashboard/diff',
  'app/dashboard/projects',
  'app/dashboard/analyses',
  // ... 50+ autres
]

for (const route of DYNAMIC_ROUTES) {
  backupFile(route)
}
```

**Problème:** Il ne resterait presque **aucune page** dans le mobile build!

---

### ✅ Décision finale recommandée

**Skip mobile build pour le PFE, focus sur web**

Raisons:
1. ⏰ **Time to market** — focus sur core features (AI code review, RAG, dashboard web)
2. 🎯 **Use case** — reviewers travaillent principalement sur desktop (large diffs, multi-panels)
3. 📱 **Responsive suffit** — Web app fonctionne sur mobile browser
4. 🚀 **Phase 2** — Mobile app native peut être ajoutée post-PFE avec SPA mode

---

### 📚 Documentation

Pour référence, voir:
- `MOBILE_BUILD_FIXES.md` — Corrections appliquées (Turbopack, webpack, lockfiles)
- `next.config.mobile.js` — Config mobile (output: 'export')
- `scripts/build-mobile.js` — Build script avec backup/restore

---

**Status:** ⚠️ Mobile build désactivé temporairement (routes dynamiques non compatibles)

**Alternative:** Web responsive accessible sur tous devices via navigateur
