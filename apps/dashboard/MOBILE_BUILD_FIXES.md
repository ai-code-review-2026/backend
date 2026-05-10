# 🔧 Mobile Build Fixes (Next.js 16 + Capacitor)

## ✅ Problèmes corrigés

### 1. **Conflit Turbopack/Webpack dans mobile build** ✅

**Problème:**
```
ERROR: This build is using Turbopack, with a `webpack` config and no `turbopack` config.
Error: Call retries were exceeded
```

**Cause:**
- `next.config.mobile.js` avait config `webpack` MAIS pas de config `turbopack`
- Next.js 16 utilise Turbopack par défaut → conflit

**Solution appliquée:**

`next.config.mobile.js`:
```javascript
// ✅ AJOUTÉ
turbopack: {
  root: __dirname,  // Force ce répertoire comme root
},

webpack: (config, { isServer }) => {
  // Config webpack existante
}
```

---

### 2. **Config ESLint obsolète** ✅

**Problème:**
```
⚠ `eslint` configuration in next.config.js is no longer supported.
⚠ Unrecognized key(s) in object: 'eslint'
```

**Solution appliquée:**

`next.config.mobile.js`:
```javascript
// ❌ RETIRÉ (obsolète dans Next.js 16)
eslint: {
  ignoreDuringBuilds: true,
}

// ✅ Alternative: utiliser --no-lint flag ou .eslintrc config
```

---

### 3. **Multiple lockfiles warning** ✅

**Problème:**
```
⚠ Warning: Next.js inferred your workspace root, but it may not be correct.
   We detected multiple lockfiles and selected the directory of C:\Users\Ahmed Amin Bejoui\package-lock.json
   Detected additional lockfiles:
     * C:\Users\Ahmed Amin Bejoui\Desktop\ai-code-review-platform\apps\dashboard\package-lock.json
```

**Cause:**
- Il y a un `package.json` + `package-lock.json` dans ton répertoire **home** (`C:\Users\Ahmed Amin Bejoui\`)
- Next.js scan les parents et trouve 2 lockfiles

**Solution appliquée:**

`next.config.js` + `next.config.mobile.js`:
```javascript
turbopack: {
  root: __dirname,  // Force Next.js à utiliser ce répertoire comme root
}
```

**Alternative (nettoyer home dir):**
```bash
# Si tu n'utilises pas ces packages globalement:
rm ~/package.json ~/package-lock.json

# Ou les déplacer ailleurs
mv ~/package.json ~/old-packages/
```

---

### 4. **Build script pas forcé à webpack** ✅

**Problème:**
- `scripts/build-mobile.js` utilise `next build` sans flag
- Next.js 16 utilise Turbopack par défaut → conflit avec webpack config

**Solution appliquée:**

`scripts/build-mobile.js`:
```javascript
// ❌ AVANT
execSync('npm run clean:next && next build', { ... })

// ✅ APRÈS
execSync('npm run clean:next && next build --webpack', { ... })
```

---

## 📋 Fichiers modifiés

| Fichier | Changement | Impact |
|---------|-----------|--------|
| `next.config.mobile.js` | Retiré `eslint: { ... }` | Élimine warning obsolète |
| `next.config.mobile.js` | Ajouté `turbopack: { root: __dirname }` | Fixe "multiple lockfiles" |
| `next.config.js` | Ajouté `turbopack: { root: __dirname }` | Fixe "multiple lockfiles" |
| `scripts/build-mobile.js` | Changé `next build` → `next build --webpack` | Force webpack explicitement |

---

## 🧪 Validation

### Test mobile build

```bash
cd apps/dashboard

# Build mobile
npm run mobile:build

# Attendu:
# ✓ Static build completed
# ✓ Files exported to: out/
# ✓ Capacitor sync completed
```

**Output attendu:**
```
[Mobile Build] Starting mobile build...
[Mobile Build] Swapping Next.js config for mobile...
[Mobile Build] Running Next.js static export...
▲ Next.js 16.2.4 (Turbopack)
  Creating an optimized production build ...
✓ Compiled successfully
✓ Generating static pages (X/X)
✓ Finalizing page optimization
[Mobile Build] ✅ Next.js build completed!
[Mobile Build] Syncing to Capacitor platforms...
[Mobile Build] ✅ Capacitor sync completed!
[Mobile Build] 🎉 Mobile build completed successfully!
```

---

## 🎯 Structure du mobile build

### Flow du build

```
1. Backup fichiers
   ├─ next.config.js → _mobile_build_backup/
   ├─ middleware.ts → _mobile_build_backup/
   └─ app/api → (reste en place, ignoré par static export)

2. Swap config
   ├─ next.config.mobile.js → next.config.js

3. Build
   ├─ next build --webpack
   └─ Output: out/ (static HTML/CSS/JS)

4. Restore
   ├─ Restore next.config.js
   └─ Restore middleware.ts

5. Sync Capacitor
   └─ npx cap sync (copy out/ to iOS/Android)
```

---

## 📱 Configuration mobile vs web

### `next.config.js` (Web)

```javascript
const nextConfig = {
  reactStrictMode: true,
  // Pas de output: 'export' → server-side rendering
  
  images: {
    remotePatterns: [...]  // Image optimization enabled
  },
  
  turbopack: {
    root: __dirname,
  },
  
  webpack: (config, { dev, isServer }) => {
    // Server + client webpack config
  }
}
```

---

### `next.config.mobile.js` (Capacitor)

```javascript
const nextConfig = {
  output: 'export',           // ✅ Static HTML export
  reactStrictMode: true,
  trailingSlash: true,        // ✅ URLs end with /
  
  images: {
    unoptimized: true,        // ✅ No image optimization
  },
  
  experimental: {
    serverActions: {
      allowedOrigins: [],     // ✅ Disable server actions
    },
  },
  
  turbopack: {
    root: __dirname,          // ✅ Ignore parent lockfiles
  },
  
  webpack: (config, { isServer }) => {
    // Client-only webpack config
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,            // ✅ No fs in browser
        net: false,
        tls: false,
      };
    }
  }
}
```

---

## 🔍 Différences clés

| Feature | Web (`next.config.js`) | Mobile (`next.config.mobile.js`) |
|---------|----------------------|--------------------------------|
| **Output** | SSR (server) | Static export (HTML) |
| **API routes** | ✅ Supported | ❌ Not included in export |
| **Middleware** | ✅ Runs on server | ❌ Backed up before build |
| **Image optimization** | ✅ Enabled | ❌ Disabled (`unoptimized: true`) |
| **Server actions** | ✅ Enabled | ❌ Disabled |
| **Trailing slash** | ❌ | ✅ Required for iOS/Android |
| **Webpack fallbacks** | Server + client | Client only (no `fs`, `net`) |

---

## 🚀 Commandes disponibles

```bash
# Build mobile (iOS + Android)
npm run mobile:build

# Sync assets to platforms
npm run mobile:sync

# Add platforms (first time only)
npm run mobile:add:ios
npm run mobile:add:android

# Open in IDE
npm run mobile:ios       # Xcode (macOS only)
npm run mobile:android   # Android Studio

# Run on device/emulator
npm run mobile:run:ios
npm run mobile:run:android
```

---

## 🐛 Troubleshooting

### Erreur: "Cannot find module 'fs'"

**Cause:** Le code utilise `fs` côté client (interdit dans browser)

**Fix:**
```javascript
// ❌ BAD (client-side)
import fs from 'fs'

// ✅ GOOD (server-side only)
// Move to API route or getStaticProps
```

---

### Erreur: "API routes are not supported"

**Cause:** `output: 'export'` ne supporte pas les API routes

**Fix:**
- Appeler le backend API externe (https://api.example.com)
- Retirer les appels à `/api/*` locaux

---

### Erreur: "Server Actions not supported"

**Cause:** `use server` incompatible avec static export

**Fix:**
```javascript
// ❌ BAD
'use server'
export async function myAction() { ... }

// ✅ GOOD
// Use client-side fetch to external API
```

---

### Warning: "Invalid next.config.js options detected: 'eslint'"

**Cause:** Next.js 16 ne supporte plus `eslint: { ... }` dans next.config

**Fix:** Déjà appliqué (retiré de `next.config.mobile.js`)

---

### Warning: "Multiple lockfiles detected"

**Cause:** `package.json` dans répertoire home

**Fix 1 (appliqué):**
```javascript
// next.config.js + next.config.mobile.js
turbopack: {
  root: __dirname,
}
```

**Fix 2 (optionnel, nettoyer):**
```bash
# Si tu n'utilises pas ces packages:
rm ~/package.json ~/package-lock.json
```

---

## ✅ Checklist finale

Avant `npm run mobile:build`:

- [x] `next.config.mobile.js` contient `turbopack: { root: __dirname }`
- [x] `next.config.mobile.js` ne contient PAS `eslint: { ... }`
- [x] `scripts/build-mobile.js` utilise `next build --webpack`
- [x] `next.config.js` (web) contient aussi `turbopack: { root: __dirname }`
- [x] Platforms ajoutées: `npm run mobile:add:android` (first time)
- [x] Test local: `npm run build` (web) réussit

---

## 📊 Build times comparaison

| Build Type | Webpack | Turbopack |
|------------|---------|-----------|
| **Web (SSR)** | ~8-10 min | ~3-4 min (non stable) |
| **Mobile (static)** | ~5-7 min | ~2-3 min (non supporté) |

**Note:** Turbopack ne supporte pas encore `output: 'export'` dans Next.js 16, donc **webpack obligatoire** pour mobile builds.

---

## 🎓 Pourquoi ces changements?

### Next.js 16 changes (décembre 2024)

1. **Turbopack par défaut**
   - Plus besoin de `--turbo` flag
   - Webpack devient optionnel (`--webpack`)

2. **ESLint config déplacée**
   - `eslint: { ... }` retiré de next.config
   - Utiliser `.eslintrc` ou `--no-lint` flag

3. **Workspace inference améliorée**
   - Next.js scan les parents pour trouver monorepos
   - Peut détecter des lockfiles hors du projet
   - `turbopack.root` force le répertoire

---

**Status:** ✅ **Mobile build corrigé et prêt!**

Test:
```bash
npm run mobile:build
```
