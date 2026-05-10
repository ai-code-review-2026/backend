# 🚀 Quick Start - Visualisation 3D du Graphe

## Installation rapide (5 minutes)

### 1️⃣ Installer les dépendances

```bash
cd apps/dashboard
npm install @react-three/fiber@^8.18.6 @react-three/drei@^9.122.4 --legacy-peer-deps
```

### 2️⃣ Vérifier la configuration Neo4j

Créer/éditer `.env` à la racine du projet:

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
NEO4J_ENABLED=true
```

### 3️⃣ Démarrer les services

**Terminal 1 - Backend:**
```bash
cd apps/backend
make host-api
```

**Terminal 2 - Dashboard:**
```bash
cd apps/dashboard
npm run dev
```

### 4️⃣ Accéder à l'interface

Ouvrir: **http://localhost:3001/dashboard/graph-3d**

---

## ✅ Vérification rapide

### Backend est prêt?
```bash
curl http://localhost:8000/health
# Devrait retourner: {"status": "ok"}
```

### Dashboard est prêt?
```bash
curl http://localhost:3001/
# Devrait retourner du HTML
```

### Neo4j contient des données?
```bash
# Depuis le backend
cd apps/backend
poetry run python scripts/seed_sample_data.py
```

---

## 🎮 Utilisation basique

### Navigation
- **Rotation**: Clic gauche + glisser
- **Zoom**: Molette
- **Pan**: Clic droit + glisser

### Exploration
1. Cliquez sur un nœud pour voir ses propriétés
2. Utilisez les filtres pour limiter les types de nœuds
3. Désactivez la simulation une fois le graphe stabilisé

---

## 🐛 Problèmes courants

### "No graph data available"
**→ Pas de données dans Neo4j**
```bash
cd apps/backend
poetry run python scripts/seed_sample_data.py
```

### "Failed to fetch graph data"
**→ Backend non démarré ou Neo4j inaccessible**
```bash
# Vérifier
curl http://localhost:8000/api/v1/graph/stats

# Si erreur, redémarrer
cd apps/backend && make host-api
```

### "Module not found: @react-three/fiber"
**→ Dépendances non installées**
```bash
cd apps/dashboard
npm install @react-three/fiber @react-three/drei --legacy-peer-deps
```

---

## 📚 Documentation complète

- **Guide technique**: [docs/GRAPH_3D_VISUALIZATION.md](docs/GRAPH_3D_VISUALIZATION.md)
- **Guide utilisateur**: [docs/GRAPH_3D_README.md](docs/GRAPH_3D_README.md)
- **Installation**: [docs/GRAPH_3D_INSTALLATION.md](docs/GRAPH_3D_INSTALLATION.md)

---

## 💡 Astuces

1. **Performance**: Commencez avec 500 nœuds maximum
2. **Filtrage**: Utilisez `File,Repository` pour une vue claire
3. **Simulation**: Désactivez après ~10 secondes de stabilisation
4. **Repository**: Filtrez par `repo_id` pour focus sur un projet

---

**Bon voyage dans le graphe 3D! 🌐✨**
