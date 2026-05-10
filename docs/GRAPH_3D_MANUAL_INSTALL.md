# Installation manuelle des dépendances

Si les scripts automatiques ne fonctionnent pas, suivez ces étapes:

## Étape 1: Naviguer vers le dashboard

```bash
cd apps/dashboard
```

## Étape 2: Installer les dépendances

### Option A: Avec legacy-peer-deps (Recommandé)

```bash
npm install @react-three/fiber@^8.18.6 @react-three/drei@^9.122.4 --legacy-peer-deps
```

### Option B: Avec force (Si Option A échoue)

```bash
npm install @react-three/fiber@^8.18.6 @react-three/drei@^9.122.4 --force
```

## Étape 3: Vérifier l'installation

```bash
npm list @react-three/fiber @react-three/drei
```

Vous devriez voir:

```
devora@0.1.0
├── @react-three/drei@9.122.4
└── @react-three/fiber@8.18.6
```

## Étape 4: Démarrer le dashboard

```bash
npm run dev
```

## Si vous rencontrez des erreurs

### Erreur: peer dependency conflict

**Solution**: Utilisez `--legacy-peer-deps`

```bash
npm install --legacy-peer-deps
```

### Erreur: Module not found après installation

**Solution**: Nettoyez le cache et réinstallez

```bash
# Nettoyer
rm -rf node_modules package-lock.json
npm cache clean --force

# Réinstaller tout
npm install --legacy-peer-deps
```

### Erreur: React version mismatch

**Symptôme**: Warning about React 18 vs React 19

**Solution**: C'est normal, `--legacy-peer-deps` permet de contourner ce warning. @react-three/fiber fonctionne avec React 18.

### Erreur de build TypeScript

**Solution**: Ajouter les types dans `tsconfig.json` si nécessaire

```json
{
  "compilerOptions": {
    "types": ["three"]
  }
}
```

## Vérification finale

Une fois installé, vérifiez que les fichiers suivants existent:

```
node_modules/@react-three/fiber/
node_modules/@react-three/drei/
node_modules/three/
```

## Support

Si vous continuez à avoir des problèmes:

1. Vérifiez la version de Node.js: `node --version` (>= 18.x recommandé)
2. Vérifiez la version de npm: `npm --version` (>= 9.x recommandé)
3. Consultez les logs: `npm install --verbose`

---

**Note**: Les warnings de peer dependencies sont normaux et n'empêchent pas le fonctionnement.
