# Visualisation 3D du Graphe de Connaissances

## Vue d'ensemble

Cette fonctionnalité fournit une visualisation 3D interactive du graphe de connaissances Neo4j en temps réel. Elle permet d'explorer visuellement les relations entre les différents types de nœuds (Repository, File, Chunk, Rule, KnowledgeDocument, etc.).

## Architecture

### Backend (FastAPI)

**Endpoint principal:** `apps/backend/app/api/http/graph_visualization.py`

Trois endpoints disponibles:

1. **GET /api/v1/graph/stats** - Statistiques du graphe
   - Retourne le nombre total de nœuds et d'arêtes
   - Compte les nœuds par type
   - Compte les arêtes par type

2. **GET /api/v1/graph/data** - Données complètes du graphe
   - Paramètres:
     - `limit` (défaut: 500, max: 5000) - Nombre max de nœuds
     - `node_types` - Types de nœuds à inclure (séparés par virgules)
     - `repo_id` - Filtrer par repository
     - `depth` (défaut: 2) - Profondeur de traversée du graphe
   - Retourne: nodes, edges, stats

3. **GET /api/v1/graph/repository/{repo_id}** - Graphe d'un repository spécifique
   - Paramètres:
     - `include_chunks` (défaut: false) - Inclure les nœuds Chunk
     - `limit` (défaut: 1000)
   - Retourne: nodes, edges, stats pour un repository

### Frontend (Next.js + React)

**Routes API (proxies):**
- `apps/dashboard/app/api/dashboard/graph/stats/route.ts`
- `apps/dashboard/app/api/dashboard/graph/data/route.ts`
- `apps/dashboard/app/api/dashboard/graph/repository/[repoId]/route.ts`

**Composant de visualisation:**
- `apps/dashboard/components/knowledge-graph-3d.tsx`
- Utilise React Three Fiber (R3F) pour le rendu 3D
- Utilise @react-three/drei pour les contrôles et helpers

**Page dashboard:**
- `apps/dashboard/app/dashboard/graph-3d/page.tsx`

## Technologies utilisées

- **Three.js** - Bibliothèque 3D WebGL
- **React Three Fiber** - React renderer pour Three.js
- **@react-three/drei** - Helpers et abstractions pour R3F
- **Neo4j** - Base de données graphe (backend)

## Fonctionnalités

### Visualisation

1. **Nœuds (sphères)**
   - Couleur et taille basées sur le type de nœud
   - Étiquettes au survol et lors de la sélection
   - Animation de rotation pour les nœuds sélectionnés

2. **Arêtes (lignes)**
   - Relient les nœuds selon leurs relations (CONTAINS, IMPORTS, etc.)
   - Opacité réduite pour ne pas surcharger la vue
   - Épaisseur basée sur le poids de la relation

3. **Simulation physique (force-directed layout)**
   - Répulsion entre tous les nœuds
   - Attraction le long des arêtes
   - Peut être activée/désactivée via les contrôles

### Interactions

1. **Caméra**
   - Clic + glisser: Rotation
   - Molette: Zoom
   - Clic droit + glisser: Panoramique

2. **Nœuds**
   - Clic: Sélectionner un nœud
   - Survol: Afficher l'étiquette
   - Sélection: Afficher les propriétés dans le panneau

### Filtres et contrôles

1. **Panneau de contrôle** (en haut à droite)
   - Activer/désactiver la simulation physique
   - Limite du nombre de nœuds
   - Filtrer par types de nœuds
   - Bouton de rechargement

2. **Panneau de statistiques** (en haut à gauche)
   - Nombre total de nœuds et d'arêtes
   - Répartition par type de nœud

3. **Panneau de détails** (en bas à gauche)
   - Propriétés du nœud sélectionné
   - ID, type, attributs

## Configuration des couleurs

Les couleurs des nœuds sont définies dans `graph_visualization.py`:

```python
NODE_TYPE_COLORS = {
    "Repository": "#8b5cf6",     # Purple
    "File": "#3b82f6",            # Blue
    "Chunk": "#06b6d4",           # Cyan
    "Rule": "#f59e0b",            # Amber
    "KnowledgeDocument": "#10b981", # Green
    "AnalysisRun": "#ef4444",     # Red
    "Comment": "#ec4899",         # Pink
    "Organization": "#6366f1",    # Indigo
    "Project": "#14b8a6",         # Teal
}
```

## Installation

### Installer les dépendances

```bash
cd apps/dashboard
npm install
```

Les dépendances suivantes seront installées:
- `three@^0.184.0` (déjà présent)
- `@react-three/fiber@^8.18.6`
- `@react-three/drei@^9.122.4`

### Démarrer le backend

```bash
cd apps/backend
make host-api  # ou: poetry run uvicorn app.main:app --reload
```

Assurez-vous que Neo4j est en cours d'exécution et configuré dans `.env`:

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
NEO4J_ENABLED=true
```

### Démarrer le dashboard

```bash
cd apps/dashboard
npm run dev
```

## Accès

Une fois démarré, accédez à:

**http://localhost:3001/dashboard/graph-3d**

## Utilisation

1. **Vue d'ensemble du graphe**
   - Au chargement, 500 nœuds sont affichés par défaut
   - La simulation physique positionne automatiquement les nœuds

2. **Explorer un repository spécifique**
   - Dans le filtre "Node Types", entrez: `Repository,File`
   - Cela affichera uniquement les repositories et fichiers

3. **Examiner les chunks de code**
   - Augmentez la limite à 1000-2000 nœuds
   - Ajoutez "Chunk" dans les types de nœuds
   - Utilisez la molette pour zoomer sur les clusters

4. **Analyser les relations**
   - Les arêtes bleues CONTAINS = structure hiérarchique
   - Les arêtes grises IMPORTS = dépendances entre fichiers
   - Cliquez sur un nœud pour voir ses connexions

5. **Optimisation des performances**
   - Désactivez la simulation physique après stabilisation
   - Limitez le nombre de nœuds pour les graphes très larges
   - Filtrez par type ou repository pour focus

## Mise à jour en temps réel

Pour ajouter une mise à jour en temps réel (polling ou WebSocket):

### Option 1: Polling

Ajoutez dans `knowledge-graph-3d.tsx`:

```typescript
useEffect(() => {
  const interval = setInterval(() => {
    fetchGraphData()
  }, 30000) // Rafraîchir toutes les 30 secondes

  return () => clearInterval(interval)
}, [])
```

### Option 2: WebSocket (recommandé)

1. Backend: Créer un endpoint WebSocket dans `graph_visualization.py`
2. Frontend: Connecter au WebSocket et écouter les mises à jour
3. Incrémenter uniquement les changements (nodes/edges ajoutés/supprimés)

## Performance

### Limites recommandées

- **Petits graphes** (< 100 nœuds): Limite 100-500, simulation activée
- **Graphes moyens** (100-1000 nœuds): Limite 500-1000, simulation désactivée après stabilisation
- **Grands graphes** (> 1000 nœuds): Limite 1000-2000, filtres par type, simulation désactivée

### Optimisations

1. **Filtrage côté serveur**: Neo4j fait le travail lourd
2. **Embeddings exclus**: Les vecteurs ne sont pas envoyés au frontend
3. **Memoization**: useMemo/useCallback pour éviter les re-renders
4. **Instancing**: Pour de très grands graphes, utiliser THREE.InstancedMesh

## Troubleshooting

### Le graphe est vide

- Vérifiez que Neo4j est en cours d'exécution
- Vérifiez que des données ont été ingérées (voir `apps/backend/scripts/seed_sample_data.py`)
- Vérifiez les logs backend pour les erreurs

### Performance lente

- Réduisez la limite de nœuds
- Désactivez la simulation physique
- Filtrez par type ou repository

### Erreur "Failed to fetch graph data"

- Vérifiez que le backend est accessible sur http://localhost:8000
- Vérifiez les variables d'environnement `BACKEND_API_URL`
- Vérifiez l'authentification Clerk

## Extension future

1. **Recherche de nœuds**: Barre de recherche pour trouver un nœud spécifique
2. **Filtres avancés**: Par langue, catégorie, date, etc.
3. **Layouts alternatifs**: Hiérarchique, circulaire, force-atlas
4. **Export**: Exporter le graphe en image ou JSON
5. **Animations**: Animer les changements lors des mises à jour
6. **Mini-map**: Vue d'ensemble dans un coin pour la navigation
7. **Multi-selection**: Sélectionner plusieurs nœuds à la fois
8. **Clustering**: Grouper les nœuds par type ou communauté

## Références

- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)
- [Three.js](https://threejs.org/docs/)
- [Drei Helpers](https://github.com/pmndrs/drei)
- [Neo4j Graph Visualization](https://neo4j.com/docs/browser-manual/current/visual-tour/)
