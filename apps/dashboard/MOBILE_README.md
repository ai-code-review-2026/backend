# 📱 Mobile App Development Guide

## Architecture

Cette application mobile est construite avec **Capacitor**, qui permet de transformer le dashboard Next.js en application native iOS/Android.

### Structure
- **Frontend** : Next.js (partagé avec le dashboard web)
- **Pages mobile** : `/app/mobile/*` (All PRs, Analysis Summary, Notifications, Health, Dashboard)
- **Auth** : Clerk (session partagée web/mobile)
- **API** : Appels via routes proxy Next.js `/api/dashboard/*` → Backend FastAPI `/v1/*`
- **Push notifications** : Capacitor Push Notifications (FCM/APNS)

---

## 🚀 Quick Start (Mode développement)

### Option 1 : Script automatique (recommandé)

```bash
cd apps/dashboard
npm run mobile:dev
```

Le script va :
1. Auto-détecter votre IP locale (ex: `192.168.1.10`)
2. Démarrer le dev server Next.js sur `http://IP:3001`
3. Configurer Capacitor en mode live-reload
4. Ouvrir Android Studio

Ou spécifier manuellement votre IP :
```bash
npm run mobile:dev -- 192.168.1.10
```

### Option 2 : Configuration manuelle

#### 1. Trouver votre IP locale

**Windows PowerShell :**
```powershell
ipconfig
```
Cherchez "IPv4 Address" (ex: `192.168.1.10`)

**Linux/macOS :**
```bash
ifconfig | grep "inet "
```

#### 2. Démarrer le backend (terminal 1)

```bash
cd apps/backend
make host-api    # ou: poetry run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Backend accessible sur `http://localhost:8000`

#### 3. Démarrer Next.js dev server (terminal 2)

```bash
cd apps/dashboard
npm run dev
```

Dev server sur `http://localhost:3001`

#### 4. Configurer Capacitor avec votre IP

**Windows PowerShell :**
```powershell
cd apps/dashboard
$env:CAPACITOR_DEV_SERVER_URL="http://192.168.1.10:3001"
npx cap sync
npm run mobile:android
```

**Linux/macOS/Git Bash :**
```bash
cd apps/dashboard
export CAPACITOR_DEV_SERVER_URL=http://192.168.1.10:3001
npx cap sync
npm run mobile:android
```

#### 5. Lancer l'app dans Android Studio

1. Sélectionner un émulateur ou appareil physique
2. Cliquer sur ▶️ Run
3. L'app charge `http://192.168.1.10:3001/mobile/prs` avec **live-reload actif**

---

## 📱 Navigation mobile

L'app ouvre sur **`/mobile/prs`** (All PRs). Bottom navigation :

1. **All PRs** (`/mobile/prs`) — Liste des PRs/analyses par statut avec badges compteurs
   - New attention (rouge)
   - Return (orange)
   - Approved (vert)
   - Waiting reviewer (jaune)
   - Drafts (gris)
   - Waiting author (bleu)

2. **Notifs** (`/mobile/notifications`) — Centre de notifications
   - Mark as read
   - Polling automatique (30s)
   - Deep links vers analyses

3. **Santé** (`/mobile/health`) — Santé plateforme **[Tech Lead only]**
   - Queue depth
   - Failure rate
   - Workers online
   - Services status

4. **Dashboard** (`/mobile/dashboard`) — Stats personnelles
   - PRs reviewed today/this week
   - Analyses completed
   - Quick actions
   - Sign out

---

## 🔧 Routes API créées

Toutes les routes proxy sont dans `/api/dashboard/*` :

| Route | Backend endpoint | Description |
|-------|------------------|-------------|
| `GET /api/dashboard/health/mobile` | `GET /v1/mobile/health` | Santé plateforme |
| `GET /api/dashboard/analyses/[id]/mobile-summary` | `GET /v1/mobile/analyses/{id}/summary` | Résumé analyse léger |
| `GET /api/dashboard/analyses/mobile-counts` | `GET /v1/mobile/analyses/counts` | Compteurs par onglet PRs |
| `POST /api/dashboard/notifications/push` | `POST /v1/mobile/push/subscribe` | Enregistrer token FCM/APNS |
| `DELETE /api/dashboard/notifications/push` | `DELETE /v1/mobile/push/unsubscribe` | Supprimer token |
| `GET /api/dashboard/statistics/mobile` | `GET /v1/statistics` | Stats utilisateur |

Toutes les routes :
- Authentifient via Clerk (`auth()`)
- Timeout 15s (lecture) / 30s (écriture)
- Retournent JSON structuré (pas de raw backend response)

---

## 🔔 Push Notifications

### Configuration (à faire)

#### Android (Firebase Cloud Messaging)

1. Créer un projet Firebase : https://console.firebase.google.com
2. Ajouter une app Android avec package `com.aicodereview.app`
3. Télécharger `google-services.json` → `apps/dashboard/android/app/`
4. Copier le Server Key → variable backend `FCM_SERVER_KEY`

#### iOS (Apple Push Notification Service)

1. Générer un certificat APNs dans Apple Developer Console
2. Configurer dans Xcode (Signing & Capabilities → Push Notifications)
3. Backend utilise `pywebpush` pour envoyer les notifications

### Fonctionnement

- `CapacitorProvider` enregistre automatiquement le token push au sign-in
- Tokens stockés en DB (`push_subscriptions` table)
- Backend envoie les notifications via `POST /v1/mobile/push/subscribe`
- Deep links : `{ analysis_id: "abc123" }` → ouvre `/mobile/analysis/abc123`

---

## 🛠️ Scripts disponibles

| Commande | Description |
|----------|-------------|
| `npm run mobile:dev` | **[DEV]** Démarre dev server + Android Studio (live-reload) |
| `npm run mobile:add:android` | Ajoute la plateforme Android |
| `npm run mobile:add:ios` | Ajoute la plateforme iOS (macOS uniquement) |
| `npm run mobile:sync` | Synchronise assets web → native |
| `npm run mobile:android` | Ouvre Android Studio |
| `npm run mobile:ios` | Ouvre Xcode (macOS uniquement) |
| `npm run mobile:build` | **[PROD]** Build static export (⚠️ incompatible avec Clerk auth) |

---

## ⚠️ Limitations actuelles

### Static export non fonctionnel

Le build statique (`output: 'export'`) ne peut pas inclure :
- ❌ Clerk authentication (nécessite server runtime)
- ❌ API routes dynamiques (`/api/dashboard/*`)
- ❌ Middleware Next.js

**Solutions possibles :**

1. **[Actuel]** Mode dev avec live-reload (fonctionne parfaitement)
2. **[Production]** Déployer Next.js sur un serveur (Vercel, Docker, etc.) et pointer Capacitor vers l'URL
3. **[Futur]** Migrer vers un système d'auth compatible static export (ex: JWT stockés en local, refresh via API)
4. **[Futur]** Créer des pages mobile dédiées sans auth (offline-first avec sync)

---

## 📂 Fichiers clés

```
apps/dashboard/
├── app/mobile/                      # Pages mobile
│   ├── layout.tsx                   # Layout + bottom nav
│   ├── page.tsx                     # Redirect → /mobile/prs
│   ├── prs/page.tsx                 # All PRs (6 onglets)
│   ├── analysis/[id]/page.tsx       # Analysis summary
│   ├── notifications/page.tsx       # Centre notifications
│   ├── health/page.tsx              # Santé plateforme
│   └── dashboard/page.tsx           # Dashboard personnel
├── lib/capacitor-push.ts            # Service push notifications
├── components/providers/
│   └── capacitor-provider.tsx       # Provider Capacitor + push auto-register
├── capacitor.config.ts              # Config Capacitor
├── scripts/
│   └── mobile-dev.js                # Helper dev mode
├── android/                         # Projet Android Studio
└── ios/                             # Projet Xcode (si macOS)
```

Backend :
```
apps/backend/
└── app/api/http/mobile.py           # Endpoints mobile FastAPI
```

---

## 🧪 Testing

### Émulateur Android

1. Créer un émulateur dans Android Studio (Settings → Virtual Device Manager)
2. Recommandé : Pixel 6 API 35 (Android 15)
3. Lancer via Android Studio ou :
   ```bash
   npm run mobile:run:android
   ```

### Appareil physique

1. Activer le mode développeur sur Android :
   - Paramètres → À propos → Taper 7× sur "Numéro de build"
   - Activer "Débogage USB"
2. Connecter via USB
3. Autoriser le débogage quand demandé
4. L'appareil apparaît dans Android Studio

### Live reload

Toute modification dans `apps/dashboard/app/mobile/*` recharge automatiquement l'app (⚡ Hot Module Replacement actif).

---

## 📖 Ressources

- **Capacitor docs** : https://capacitorjs.com/docs
- **Clerk mobile** : https://clerk.com/docs/references/nextjs/overview
- **Next.js static export** : https://nextjs.org/docs/app/building-your-application/deploying/static-exports
- **Capacitor Push Notifications** : https://capacitorjs.com/docs/apis/push-notifications

---

## ✅ Checklist production

- [ ] Configurer Firebase FCM (Android)
- [ ] Configurer APNs (iOS)
- [ ] Créer icônes app (1024×1024 → générer toutes tailles via `npx capacitor-assets generate`)
- [ ] Créer splash screen
- [ ] Tester sur appareils physiques
- [ ] Implémenter offline mode (Service Worker + Cache API)
- [ ] Ajouter analytics (ex: Sentry, Firebase Analytics)
- [ ] Build release : `cd android && ./gradlew assembleRelease`
- [ ] Signer l'APK avec keystore
- [ ] Publier sur Google Play Store / Apple App Store

---

**Auteur** : AI Code Review Platform Team  
**Dernière mise à jour** : 26 avril 2026
