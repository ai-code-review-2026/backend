# 🚨 Mobile App White Screen - Quick Fix Guide

## Symptôme
L'application Android affiche un **écran blanc** au lieu des pages mobile.

---

## ✅ Solution étape par étape

### 1. Arrêter tous les processus en cours

Fermez :
- Android Studio (ou killall l'app dans l'émulateur)
- Le dev server Next.js (Ctrl+C dans le terminal)

### 2. Redémarrer avec le bon script

**Dans un nouveau terminal PowerShell :**

```powershell
cd "c:\Users\Ahmed Amin Bejoui\Desktop\ai-code-review-platform\apps\dashboard"

# Utiliser le nouveau script fixé
npm run mobile:dev
```

Le script va :
1. ✅ Auto-détecter une IP LAN valide (ex: `192.168.x.x`)
2. ✅ Démarrer Next.js en écoutant sur **toutes les interfaces** (`0.0.0.0:3001`)
3. ✅ Configurer Capacitor avec `CAPACITOR_DEV_SERVER_URL`
4. ✅ Ouvrir Android Studio

### 3. Attendre l'initialisation

⏳ Attendez **8 secondes** pour que le dev server démarre complètement.

Vous devriez voir :
```
✓ Ready in 3.2s
○ Local:        http://localhost:3001
○ Network:      http://192.168.1.10:3001
```

### 4. Vérifier la configuration Capacitor

Le script affiche l'URL configurée. Exemple :
```
📱 App will load: http://192.168.1.10:3001/mobile/prs
```

### 5. Lancer l'app dans Android Studio

1. Sélectionner un émulateur (ou créer un : **Device Manager** → **Create Device**)
2. Cliquer sur ▶️ **Run**
3. Attendre ~30s (première fois)

### 6. Résultat attendu

✅ L'app doit afficher la **page All PRs** avec :
- Bottom navigation (4 onglets)
- Liste des PRs/analyses
- Header "AI Code Review"

---

## 🔍 Si l'écran blanc persiste

### A. Vérifier les logs Android

Dans Android Studio :
1. Ouvrir **Logcat** (en bas)
2. Filtrer par : `com.aicodereview.app`
3. Chercher les erreurs rouges

**Erreurs communes :**

#### `ERR_CONNECTION_REFUSED`
**Cause** : Le dev server n'est pas accessible depuis l'émulateur.

**Solution** :
```powershell
# Vérifier que le port 3001 écoute sur toutes les interfaces
netstat -ano | Select-String ":3001"

# Doit afficher : TCP    0.0.0.0:3001    0.0.0.0:0    LISTENING
```

Si ça affiche `127.0.0.1:3001`, le script `dev` n'écoute pas sur `0.0.0.0`.

**Fix** : Vérifier `package.json` ligne 12 :
```json
"dev": "npm run clean:next && next dev -H 0.0.0.0 -p 3001"
```

Le flag `-H 0.0.0.0` est **crucial**.

#### `ERR_CLEARTEXT_NOT_PERMITTED`
**Cause** : Android bloque HTTP (non-HTTPS) par défaut.

**Solution** : Vérifier `android/app/src/main/AndroidManifest.xml` contient :
```xml
<application
    android:usesCleartextTraffic="true"
    ...>
```

#### `net::ERR_NAME_NOT_RESOLVED`
**Cause** : L'IP détectée n'est pas accessible (ex: IP WSL, VPN, loopback).

**Solution** : Spécifier manuellement une IP LAN valide :
```powershell
# Trouver votre IP LAN
ipconfig
# Chercher "IPv4 Address" sous "Wi-Fi" ou "Ethernet" (ex: 192.168.1.10)

# Lancer avec l'IP manuelle
node scripts/mobile-dev-fixed.js 192.168.1.10
```

### B. Tester l'URL dans le navigateur de l'émulateur

1. Dans l'émulateur Android, ouvrir **Chrome**
2. Aller à `http://192.168.1.10:3001/mobile/prs` (remplacer par votre IP)
3. Si ça ne charge pas → problème réseau
4. Si ça charge → problème dans la config Capacitor

### C. Vérifier la config Capacitor dans l'app

```powershell
cd android
cat app/src/main/assets/capacitor.config.json
```

Doit contenir :
```json
{
  "server": {
    "url": "http://192.168.1.10:3001",
    "cleartext": true
  }
}
```

Si `"url"` est absent ou pointe vers `file://` → relancer `npx cap sync`.

### D. Firewall Windows

Le firewall peut bloquer les connexions entrantes sur le port 3001.

**Solution** :
1. Paramètres Windows → **Pare-feu Windows Defender**
2. **Paramètres avancés**
3. **Règles de trafic entrant** → **Nouvelle règle**
4. Type : **Port** → TCP **3001** → **Autoriser**

Ou via PowerShell (admin) :
```powershell
New-NetFirewallRule -DisplayName "Next.js Dev Server" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
```

### E. Réinitialiser complètement

Si rien ne fonctionne :

```powershell
# 1. Supprimer le cache Capacitor
cd "c:\Users\Ahmed Amin Bejoui\Desktop\ai-code-review-platform\apps\dashboard"
Remove-Item -Recurse -Force android/.idea, android/build, android/app/build

# 2. Re-sync
$env:CAPACITOR_DEV_SERVER_URL="http://192.168.1.10:3001"  # Remplacer par votre IP
npx cap sync

# 3. Rebuild dans Android Studio
# Build → Clean Project
# Build → Rebuild Project

# 4. Relancer l'app
```

---

## 🎯 Checklist de vérification

Avant de lancer l'app, vérifiez :

- [ ] Dev server tourne sur `0.0.0.0:3001` (pas `127.0.0.1`)
- [ ] `netstat` montre le port 3001 en LISTENING
- [ ] L'IP détectée est une IP LAN (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`)
- [ ] `capacitor.config.json` (dans `android/app/src/main/assets/`) contient la bonne URL
- [ ] `android/app/src/main/AndroidManifest.xml` a `android:usesCleartextTraffic="true"`
- [ ] Firewall Windows autorise le port 3001
- [ ] L'URL fonctionne dans le navigateur (web et mobile)

---

## 📞 Besoin d'aide ?

Si le problème persiste, fournir :
1. Les logs Logcat (Android Studio)
2. L'output du terminal où tourne `npm run dev`
3. Le contenu de `android/app/src/main/assets/capacitor.config.json`
4. L'output de `ipconfig` (votre IP LAN)
5. L'output de `netstat -ano | Select-String ":3001"`

---

**Dernière mise à jour** : 26 avril 2026
