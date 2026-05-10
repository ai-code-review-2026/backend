# 🚀 Mobile App - Quick Start

**3 étapes simples pour lancer l'app mobile avec les vraies pages**

---

## ✅ Prérequis

- Android Studio installé
- Next.js dev server en cours d'exécution (`npm run dev`)
- Backend FastAPI en cours d'exécution (optionnel pour tester les API)

---

## 🎯 Étape 1 : Vérifier l'environnement

```powershell
cd "c:\Users\Ahmed Amin Bejoui\Desktop\ai-code-review-platform\apps\dashboard"
npm run mobile:check
```

**Résultat attendu :** Tous les checks ✅ passent.

Si des erreurs ❌ apparaissent, suivre les instructions affichées.

---

## 🚀 Étape 2 : Lancer l'environnement mobile

```powershell
npm run mobile:dev
```

Le script va :
1. ✅ Détecter votre IP LAN (ex: `192.168.1.26`)
2. ✅ Démarrer le dev server Next.js sur `http://IP:3001`
3. ✅ Configurer Capacitor avec l'URL correcte
4. ✅ Ouvrir Android Studio automatiquement

**⏳ Attendez 8 secondes** que le dev server initialise.

---

## 📱 Étape 3 : Lancer l'app dans Android Studio

1. **Sélectionner un émulateur** dans la barre du haut
   - Si aucun émulateur : **Device Manager** → **Create Device** → Pixel 6 API 35
   
2. **Cliquer sur ▶️ Run** (ou `Shift + F10`)

3. **Attendre ~30 secondes** (première fois)

4. **L'app démarre** et affiche `/mobile/prs` (All PRs) 🎉

---

## ✨ Résultat attendu

Vous devriez voir :

- **Header** : "AI Code Review" avec logo
- **6 onglets PRs** : New attention, Return, Approved, Waiting reviewer, Drafts, Waiting author
- **Bottom navigation** : 4 onglets (All PRs, Notifs, Santé, Dashboard)
- **Live-reload actif** : Modifiez le code → l'app se recharge automatiquement

---

## 🔥 Live Development

Toute modification dans `app/mobile/*` recharge l'app instantanément :

```typescript
// apps/dashboard/app/mobile/prs/page.tsx
<h1>All PRs</h1>  // Modifiez ce titre
```

💾 Sauvegardez → l'app se recharge automatiquement en **<2s**

---

## 🚨 Problème : Écran blanc ?

Si l'app affiche un **écran blanc** :

### Solution rapide

1. **Arrêter l'app** dans l'émulateur
2. **Redémarrer le dev server** :
   ```powershell
   # Ctrl+C pour arrêter le serveur actuel
   npm run dev
   ```
3. **Re-sync Capacitor** :
   ```powershell
   $env:CAPACITOR_DEV_SERVER_URL="http://192.168.1.26:3001"  # Votre IP
   npx cap sync
   ```
4. **Relancer l'app** dans Android Studio (▶️ Run)

### Diagnostic complet

```powershell
npm run mobile:check
```

Suivre les instructions pour corriger les erreurs détectées.

### Guide détaillé

Voir : [`MOBILE_TROUBLESHOOTING.md`](./MOBILE_TROUBLESHOOTING.md)

---

## 📖 Navigation mobile

| Onglet | Route | Description |
|--------|-------|-------------|
| **All PRs** | `/mobile/prs` | Liste des PRs/analyses par statut (6 catégories) |
| **Notifs** | `/mobile/notifications` | Centre de notifications avec mark as read |
| **Santé** | `/mobile/health` | Santé plateforme (Tech Lead uniquement) |
| **Dashboard** | `/mobile/dashboard` | Stats personnelles + Sign out |

---

## 🛑 Arrêter tout

```powershell
# Dans le terminal où tourne npm run mobile:dev
Ctrl + C
```

Cela arrête :
- Le dev server Next.js
- Les processus de surveillance

Vous pouvez ensuite fermer Android Studio.

---

## 📚 Documentation complète

- **Guide complet** : [`MOBILE_README.md`](./MOBILE_README.md)
- **Troubleshooting** : [`MOBILE_TROUBLESHOOTING.md`](./MOBILE_TROUBLESHOOTING.md)
- **Architecture** : [`CLAUDE.md`](../../CLAUDE.md)

---

**Temps total de démarrage** : ~2 minutes  
**Dernière mise à jour** : 26 avril 2026
