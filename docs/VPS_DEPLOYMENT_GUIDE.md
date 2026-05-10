# 🔧 Guide de déploiement VPS - Visualisation 3D

## Erreur 404 "This page could not be found"

Cette erreur signifie que Next.js ne trouve pas la route `/dashboard/graph-3d/`. Voici comment résoudre:

## Solution rapide (Commandes à exécuter sur le VPS)

### Étape 1: Se connecter au VPS
```bash
ssh root@135.125.100.150
```

### Étape 2: Naviguer vers le projet
```bash
cd /root/ai-code-review-platform
```

### Étape 3: Vérifier et mettre à jour le code
```bash
# Vérifier la branche actuelle
git branch

# Mettre à jour depuis GitHub
git pull origin main

# Vérifier que les fichiers existent
ls -la apps/dashboard/app/dashboard/graph-3d/
ls -la apps/dashboard/components/knowledge-graph-3d.tsx
ls -la apps/backend/app/api/http/graph_visualization.py
```

### Étape 4: Installer les dépendances manquantes
```bash
cd apps/dashboard

# Installer les nouvelles dépendances
npm install @react-three/fiber@^8.18.6 @react-three/drei@^9.122.4 --legacy-peer-deps
```

### Étape 5: Nettoyer et rebuild
```bash
# Nettoyer le cache Next.js
rm -rf .next
rm -rf node_modules/.cache

# Rebuild
npm run build
```

### Étape 6: Redémarrer les services

**Si vous utilisez PM2:**
```bash
pm2 restart dashboard
pm2 restart backend
pm2 logs dashboard --lines 50
```

**Si vous utilisez systemd:**
```bash
sudo systemctl restart ai-review-backend
sudo systemctl restart ai-review-dashboard
sudo journalctl -u ai-review-dashboard -f
```

**Si vous utilisez Docker:**
```bash
cd /root/ai-code-review-platform
make down
make up
make logs-api
```

### Étape 7: Vérifier
```bash
# Tester le backend
curl http://localhost:8000/health
curl http://localhost:8000/api/v1/graph/stats

# Tester le frontend
curl http://localhost:3001/

# Vérifier les processus
pm2 status  # ou: ps aux | grep node
```

### Étape 8: Accéder à la page
Ouvrir dans le navigateur:
```
http://135.125.100.150:3001/dashboard/graph-3d
```

---

## Script automatique de déploiement

Utilisez le script fourni pour automatiser tout le processus:

```bash
cd /root/ai-code-review-platform
chmod +x scripts/deploy-graph-3d-vps.sh
./scripts/deploy-graph-3d-vps.sh
```

---

## Diagnostic des problèmes

### 1. Vérifier que les fichiers sont bien présents

```bash
cd /root/ai-code-review-platform

# Page principale
cat apps/dashboard/app/dashboard/graph-3d/page.tsx

# Composant
head -20 apps/dashboard/components/knowledge-graph-3d.tsx

# API backend
head -20 apps/backend/app/api/http/graph_visualization.py
```

Si un fichier est manquant, refaites `git pull origin main`.

### 2. Vérifier les dépendances npm

```bash
cd apps/dashboard
npm list @react-three/fiber @react-three/drei

# Devrait afficher:
# devora@0.1.0
# ├── @react-three/drei@9.122.4
# └── @react-three/fiber@8.18.6
```

Si non installé:
```bash
npm install @react-three/fiber @react-three/drei --legacy-peer-deps
```

### 3. Vérifier le build Next.js

```bash
cd apps/dashboard

# Vérifier que le build a bien créé les pages
ls -la .next/server/app/dashboard/graph-3d/

# Si le dossier n'existe pas, rebuild:
rm -rf .next
npm run build
```

### 4. Vérifier les logs

**Frontend (PM2):**
```bash
pm2 logs dashboard --lines 100
```

**Frontend (systemd):**
```bash
sudo journalctl -u ai-review-dashboard -n 100
```

**Backend:**
```bash
sudo journalctl -u ai-review-backend -n 100
```

Recherchez les erreurs liées à:
- `knowledge-graph-3d`
- `graph-3d`
- `@react-three/fiber`
- `three`

### 5. Vérifier le routage Next.js

```bash
cd apps/dashboard

# Vérifier la structure des dossiers
tree app/dashboard -L 2

# Devrait montrer:
# app/dashboard
# ├── graph-3d
# │   └── page.tsx
# ├── knowledge-base
# ├── projects
# ...
```

### 6. Vérifier Neo4j

```bash
# Status
sudo systemctl status neo4j

# Démarrer si nécessaire
sudo systemctl start neo4j

# Vérifier la connexion
curl http://localhost:7474
```

---

## Erreurs courantes

### Erreur: "Module not found: Can't resolve '@react-three/fiber'"

**Solution:**
```bash
cd apps/dashboard
npm install @react-three/fiber @react-three/drei --legacy-peer-deps
npm run build
pm2 restart dashboard
```

### Erreur: "Failed to fetch graph data"

**Causes possibles:**
1. Backend non démarré
2. Neo4j non accessible
3. Authentification Clerk

**Solution:**
```bash
# Vérifier backend
curl http://localhost:8000/health

# Vérifier Neo4j
sudo systemctl status neo4j

# Vérifier les variables d'environnement
cat .env | grep NEO4J
cat .env | grep CLERK
```

### Erreur: Page blanche ou erreur 500

**Solution:**
```bash
# Nettoyer complètement
cd apps/dashboard
rm -rf .next node_modules/.cache

# Rebuild
npm run build

# Redémarrer
pm2 restart dashboard

# Vérifier les logs
pm2 logs dashboard
```

### Build échoue avec erreur TypeScript

**Solution:**
```bash
cd apps/dashboard

# Vérifier les types
npm run lint

# Si erreurs de types Three.js, installer les types:
npm install --save-dev @types/three

# Rebuild
npm run build
```

---

## Vérification finale

Une fois tout déployé, vérifiez:

1. ✅ Backend accessible: `curl http://localhost:8000/health`
2. ✅ Frontend accessible: `curl http://localhost:3001/`
3. ✅ Graph API: `curl http://localhost:8000/api/v1/graph/stats`
4. ✅ Neo4j running: `systemctl status neo4j`
5. ✅ Page accessible: http://135.125.100.150:3001/dashboard/graph-3d

---

## Commandes utiles

```bash
# Voir les processus Node.js
pm2 status
ps aux | grep node

# Voir les ports utilisés
netstat -tlnp | grep :3001
netstat -tlnp | grep :8000

# Espace disque
df -h

# Mémoire
free -h

# Redémarrer tout
pm2 restart all
# ou
sudo systemctl restart ai-review-backend ai-review-dashboard
```

---

## Support

Si le problème persiste après ces étapes:

1. Collectez les logs:
```bash
pm2 logs dashboard > /tmp/dashboard.log
sudo journalctl -u ai-review-backend > /tmp/backend.log
```

2. Vérifiez la configuration:
```bash
cat .env | grep -v "PASSWORD\|SECRET\|KEY"
```

3. Testez le build localement sur le VPS:
```bash
cd apps/dashboard
npm run dev
# Accéder à http://135.125.100.150:3001/dashboard/graph-3d
```

---

**Note**: N'oubliez pas de configurer Neo4j avec des données pour que le graphe soit visible!

```bash
cd apps/backend
poetry run python scripts/seed_sample_data.py
```
