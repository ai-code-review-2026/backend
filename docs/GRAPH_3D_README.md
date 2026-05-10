# 🌐 Visualisation 3D du Graphe de Connaissances

Interface 3D interactive en temps réel pour explorer votre base de connaissances Neo4j.

![Graph 3D Visualization](https://img.shields.io/badge/Status-Ready-green)
![Technologies](https://img.shields.io/badge/Tech-Three.js%20%7C%20React%20Three%20Fiber%20%7C%20Neo4j-blue)

## ✨ Fonctionnalités

- 🎨 **Visualisation 3D interactive** des nœuds et arêtes du graphe
- 🔄 **Simulation physique** force-directed layout pour positionnement automatique
- 🎯 **Sélection et inspection** des nœuds avec affichage des propriétés
- 🔍 **Filtres avancés** par type de nœud et repository
- 📊 **Statistiques en temps réel** (nombre de nœuds, arêtes, distribution)
- 🎮 **Contrôles intuitifs** (rotation, zoom, panoramique)
- 🎨 **Couleurs personnalisées** par type de nœud
- 📱 **Interface responsive** avec panneaux d'information

## 🚀 Démarrage rapide

### 1. Installation des dépendances

#### Windows (PowerShell)
```powershell
.\scripts\install-graph-3d-deps.ps1
```

#### Linux/Mac (Bash)
```bash
chmod +x scripts/install-graph-3d-deps.sh
./scripts/install-graph-3d-deps.sh
```

#### Manuellement
```bash
cd apps/dashboard
npm install @react-three/fiber@^8.18.6 @react-three/drei@^9.122.4 --legacy-peer-deps
```

### 2. Configuration Neo4j

Assurez-vous que Neo4j est configuré dans votre `.env`:

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
NEO4J_ENABLED=true
```

### 3. Démarrage des services

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

### 4. Accès

Ouvrez votre navigateur sur:

**http://localhost:3001/dashboard/graph-3d**

## 📖 Guide d'utilisation

### Navigation 3D

| Action | Contrôle |
|--------|----------|
| **Rotation** | Clic gauche + glisser |
| **Zoom** | Molette de la souris |
| **Panoramique** | Clic droit + glisser |
| **Sélection nœud** | Clic sur un nœud |

### Panneaux d'interface

1. **Panneau Statistiques** (haut gauche)
   - Nombre total de nœuds et arêtes
   - Répartition par type de nœud
   - Vue d'ensemble du graphe

2. **Panneau Contrôles** (haut droit)
   - Activer/désactiver la simulation physique
   - Définir la limite de nœuds (10-5000)
   - Filtrer par types de nœuds (ex: "File,Chunk,Rule")
   - Bouton de rechargement

3. **Panneau Détails** (bas gauche, si sélection)
   - Propriétés du nœud sélectionné
   - Type, ID, attributs personnalisés
   - Fermer avec le bouton ×

4. **Instructions** (bas droit)
   - Rappels des contrôles de base

### Types de nœuds et couleurs

| Type | Couleur | Description |
|------|---------|-------------|
| 🟣 **Repository** | Violet | Dépôts de code source |
| 🔵 **File** | Bleu | Fichiers de code |
| 🔷 **Chunk** | Cyan | Segments de code (fonctions, classes) |
| 🟠 **Rule** | Ambre | Règles de qualité et guidelines |
| 🟢 **KnowledgeDocument** | Vert | Documents de base de connaissances |
| 🔴 **AnalysisRun** | Rouge | Historique d'analyses |
| 🟡 **Comment** | Rose | Commentaires et findings |
| 🔵 **Organization** | Indigo | Organisations |
| 🟦 **Project** | Teal | Projets |

### Types de relations (arêtes)

- **CONTAINS** - Structure hiérarchique (Repository → File → Chunk)
- **IMPORTS** - Dépendances entre fichiers
- **INHERITS** - Héritage de classes
- **RELATED_TO** - Liens génériques
- **VIOLATES** - Violations de règles

## 🎯 Exemples d'utilisation

### Visualiser un repository spécifique

1. Dans le panneau de contrôles, désactivez la simulation
2. Dans "Node Types", entrez: `Repository,File`
3. Cliquez sur "Reload Graph"
4. Utilisez le zoom pour explorer les fichiers

### Explorer les chunks de code

1. Augmentez la limite à 1000-2000
2. Entrez: `File,Chunk` dans les types
3. Activez la simulation pour voir le positionnement automatique
4. Cliquez sur un chunk pour voir son code et propriétés

### Analyser les dépendances

1. Filtrez sur: `File`
2. Les arêtes IMPORTS montrent les dépendances
3. Cliquez sur un fichier pour voir ses imports/exports
4. Identifiez les fichiers centraux (nombreuses connexions)

### Inspecter les règles

1. Filtrez sur: `Rule,KnowledgeDocument`
2. Explorez les règles de qualité et guidelines
3. Cliquez pour voir les détails (catégorie, sévérité, pattern)

## 🛠️ Architecture technique

### Backend

- **Fichier**: `apps/backend/app/api/http/graph_visualization.py`
- **Endpoints**:
  - `GET /api/v1/graph/stats` - Statistiques
  - `GET /api/v1/graph/data` - Données complètes
  - `GET /api/v1/graph/repository/{repo_id}` - Graphe d'un repo

### Frontend

- **Composant**: `apps/dashboard/components/knowledge-graph-3d.tsx`
- **Page**: `apps/dashboard/app/dashboard/graph-3d/page.tsx`
- **API Proxies**: `apps/dashboard/app/api/dashboard/graph/`

### Technologies

- **Three.js** - Moteur 3D WebGL
- **React Three Fiber** - React renderer pour Three.js
- **@react-three/drei** - Helpers (OrbitControls, Text, Line)
- **Neo4j** - Base de données graphe
- **FastAPI** - Backend REST API
- **Next.js 14** - Frontend framework

## ⚡ Optimisation des performances

### Limites recommandées

| Taille du graphe | Limite nœuds | Simulation | Notes |
|------------------|--------------|------------|-------|
| Petit (< 100) | 100-500 | ✅ Activée | Performance optimale |
| Moyen (100-1000) | 500-1000 | ⚠️ Désactiver après | Désactiver une fois stabilisé |
| Grand (> 1000) | 1000-2000 | ❌ Désactivée | Utiliser les filtres |

### Conseils de performance

1. **Filtrez par type** - Ne chargez que les nœuds nécessaires
2. **Limitez les chunks** - Ils sont très nombreux, utilisez `include_chunks=false`
3. **Désactivez la simulation** - Une fois le graphe stabilisé
4. **Utilisez un repository** - Filtrez par `repo_id` pour focus

## 🔧 Dépannage

### Le graphe est vide

**Cause**: Aucune donnée dans Neo4j

**Solution**:
```bash
cd apps/backend
poetry run python scripts/seed_sample_data.py
```

### Erreur "Failed to fetch graph data"

**Causes possibles**:
- Backend non démarré → Vérifiez http://localhost:8000/health
- Neo4j non accessible → Vérifiez la connexion Neo4j
- Authentification Clerk → Vérifiez que vous êtes connecté

**Solution**:
```bash
# Vérifier les services
docker ps  # Neo4j doit être running
curl http://localhost:8000/health  # Backend doit répondre
```

### Performance lente

**Solutions**:
1. Réduire la limite de nœuds (500 ou moins)
2. Désactiver la simulation physique
3. Filtrer par type de nœud spécifique
4. Fermer les autres onglets/applications

### Erreur d'installation npm

**Erreur**: Conflit de peer dependencies

**Solution**:
```bash
npm install @react-three/fiber @react-three/drei --legacy-peer-deps
```

## 🚀 Prochaines améliorations

- [ ] **Recherche de nœuds** - Barre de recherche avec auto-complétion
- [ ] **Filtres avancés** - Par langue, date, catégorie
- [ ] **Layouts alternatifs** - Hiérarchique, circulaire, force-atlas
- [ ] **Export** - PNG, SVG, JSON
- [ ] **Animations** - Transition lors des mises à jour
- [ ] **Mini-map** - Vue d'ensemble dans un coin
- [ ] **Multi-selection** - Sélectionner plusieurs nœuds
- [ ] **Clustering** - Grouper par type ou communauté
- [ ] **WebSocket** - Mises à jour en temps réel
- [ ] **VR Mode** - Support WebXR pour casques VR

## 📚 Documentation complète

Voir [GRAPH_3D_VISUALIZATION.md](../docs/GRAPH_3D_VISUALIZATION.md) pour:
- Architecture détaillée
- API Reference
- Configuration avancée
- Extensions et personnalisation

## 🤝 Contribution

Pour contribuer à cette fonctionnalité:

1. Fork le repository
2. Créez une branche feature: `git checkout -b feature/graph-3d-improvements`
3. Committez vos changements: `git commit -m 'Add new graph feature'`
4. Pushez vers la branche: `git push origin feature/graph-3d-improvements`
5. Ouvrez une Pull Request

## 📝 Licence

Ce projet est sous licence MIT - voir le fichier [LICENSE](../LICENSE) pour plus de détails.

## 🙋 Support

Pour toute question ou problème:
- Ouvrez une issue sur GitHub
- Consultez la documentation complète
- Vérifiez les logs backend et frontend

---

**Bon voyage dans le graphe de connaissances 3D! 🚀🌐**
