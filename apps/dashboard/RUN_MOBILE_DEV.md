# 🚀 Guide de démarrage mobile (Mode développement)

## Prérequis
- Next.js dev server actif sur le réseau local
- Android Studio installé
- Backend FastAPI en cours d'exécution

## Étapes

### 1. Trouver votre IP locale

**Windows PowerShell :**
```powershell
ipconfig
```
Cherchez "IPv4 Address" sous votre adaptateur réseau principal (ex: `192.168.1.10`)

**Linux/macOS :**
```bash
ifconfig
# ou
ip addr show
```

### 2. Démarrer le dev server Next.js

Dans `apps/dashboard/` :
```bash
npm run dev
```
Le serveur démarre sur `http://localhost:3001`

### 3. Configurer Capacitor en mode dev

Définir la variable d'environnement `CAPACITOR_DEV_SERVER_URL` avec votre IP locale :

**Windows PowerShell :**
```powershell
$env:CAPACITOR_DEV_SERVER_URL="http://192.168.1.10:3001"
npx cap sync
```

**Linux/macOS/Git Bash :**
```bash
export CAPACITOR_DEV_SERVER_URL=http://192.168.1.10:3001
npx cap sync
```

### 4. Ouvrir dans Android Studio

```bash
npm run mobile:android
```

### 5. Lancer l'app

Dans Android Studio :
1. Sélectionner un émulateur ou appareil physique
2. Cliquer sur ▶️ Run
3. L'app chargera `http://192.168.1.10:3001/mobile/prs` avec **live-reload actif**

## Navigation

L'app ouvre directement sur `/mobile/prs` (All PRs). La bottom navigation permet d'accéder à :
- **PRs** : Liste des analyses par statut (New attention, Return, Approved, etc.)
- **Notifs** : Centre de notifications avec mark as read
- **Santé** : Santé plateforme (Tech Lead uniquement)
- **Dashboard** : Stats personnelles + Sign out

## Mode production (à venir)

Pour un build standalone sans dev server :
- Option A : Créer des pages mobile statiques sans auth (offline-first)
- Option B : Utiliser un serveur Next.js déployé (pas de static export)
- Option C : Migrer l'auth vers un système compatible static export

---

## Problème actuel résolu

❌ **Avant** : `npm run mobile:build` générait un static export qui ne pouvait pas inclure les pages `/mobile` (nécessitent Clerk auth + API routes dynamiques)

✅ **Maintenant** : Mode dev avec live-reload — toutes les pages fonctionnent, auth Clerk incluse
