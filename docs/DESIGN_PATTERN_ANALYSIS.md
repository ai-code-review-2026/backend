# Design Pattern Analysis System - Complete Guide

## 🎯 Overview

Le système de **Design Pattern Analysis** extrait automatiquement les patterns architecturaux depuis votre code existant (legacy code), puis compare chaque nouvelle Pull Request contre ces patterns pour détecter les violations et générer des commentaires intelligents.

## 📚 Table des Matières

1. [Architecture](#architecture)
2. [Comment ça Marche](#comment-ça-marche)
3. [Installation](#installation)
4. [Utilisation](#utilisation)
5. [Patterns Détectés](#patterns-détectés)
6. [Règles MERN Stack](#règles-mern-stack)
7. [API Endpoints](#api-endpoints)
8. [Neo4j Schema](#neo4j-schema)
9. [Exemples](#exemples)
10. [Troubleshooting](#troubleshooting)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEVORA PATTERN ANALYSIS                       │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐         ┌──────────────────┐
│  Legacy Code     │────────▶│ Pattern          │
│  (Repositories)  │         │ Extractor        │
└──────────────────┘         └─────────┬────────┘
                                       │
                                       ▼
                            ┌──────────────────────┐
                            │ Detected Patterns    │
                            │ - Route→Controller   │
                            │ - Middleware Chain   │
                            │ - React Components   │
                            │ - Auth Flow          │
                            └──────────┬───────────┘
                                       │
                                       ▼
                            ┌──────────────────────┐
                            │   Neo4j Storage      │
                            │ Repository→Pattern   │
                            └──────────┬───────────┘
                                       │
        ┌──────────────────────────────┴──────────────┐
        │                                             │
        ▼                                             ▼
┌──────────────────┐                    ┌──────────────────────┐
│  New PR Arrives  │                    │  Pattern Comparator  │
│  - Diff          │───────────────────▶│  - Compare PR code   │
│  - Files         │                    │  - Find violations   │
└──────────────────┘                    └──────────┬───────────┘
                                                   │
                                                   ▼
                                        ┌──────────────────────┐
                                        │ Pattern Violations   │
                                        │ - Missing middleware │
                                        │ - Direct DB access   │
                                        │ - No controller      │
                                        └──────────┬───────────┘
                                                   │
                                                   ▼
                                        ┌──────────────────────┐
                                        │ Comment Generator    │
                                        │ - Title + Evidence   │
                                        │ - Expected vs Actual │
                                        │ - Recommendation     │
                                        └──────────┬───────────┘
                                                   │
                                                   ▼
                                        ┌──────────────────────┐
                                        │  GitHub Comments     │
                                        │  Posted on PR        │
                                        └──────────────────────┘
```

---

## Comment ça Marche

### Phase 1: Extraction des Patterns (Une fois, au démarrage)

1. **Scan du code legacy**
   - Lit tous les fichiers `.js`, `.ts`, `.jsx`, `.tsx`, `.py`
   - Parse avec AST (Abstract Syntax Tree)
   - Extrait: fonctions, classes, routes, composants, modèles

2. **Détection des patterns**
   - Analyse les relations entre fichiers
   - Détecte les patterns récurrents
   - Calcule un score de confiance

3. **Stockage dans Neo4j**
   - Crée des nœuds `DesignPattern`
   - Relie aux repositories: `Repository → EXHIBITS_PATTERN → DesignPattern`
   - Stocke les preuves (exemples concrets)

### Phase 2: Analyse d'une Pull Request

1. **Réception de la PR**
   - Récupère le diff Git
   - Extrait les fichiers modifiés

2. **Comparaison avec les patterns**
   - Charge les patterns depuis Neo4j
   - Compare chaque fichier modifié
   - Identifie les violations

3. **Génération des commentaires**
   - Crée un commentaire pour chaque violation
   - Inclut: titre, description, preuve legacy, recommandation
   - Poste sur GitHub

---

## Installation

### 1. Installer les dépendances

```bash
cd apps/backend
poetry install
```

Packages requis:
- `tree-sitter` - Pour parser JavaScript/TypeScript
- `neo4j` - Pour le stockage des patterns

### 2. Configurer Neo4j

Ajouter dans `.env`:

```bash
NEO4J_ENABLED=true
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
```

### 3. Créer le schéma Neo4j

```bash
poetry run python -c "
from app.core.design_patterns import PatternNeo4jRepository
repo = PatternNeo4jRepository()
repo.create_pattern_schema()
repo.close()
"
```

---

## Utilisation

### 1. Extraire les Patterns depuis un Repository

```python
from app.core.design_patterns import PatternExtractor, PatternNeo4jRepository

# Initialize
extractor = PatternExtractor()
neo4j_repo = PatternNeo4jRepository()

# Extract patterns
patterns = extractor.extract_patterns_from_repository(
    repo_path="/path/to/E-commerce",
    repo_name="E-commerce"
)

# Store in Neo4j
for pattern in patterns:
    neo4j_repo.store_pattern(pattern, repository_name="E-commerce")

# Output
print(f"✅ Extracted {len(patterns)} patterns")
for p in patterns:
    print(f"  - {p.name} (confidence: {p.confidence:.2f}, occurrences: {p.occurrences})")
```

**Exemple de sortie:**

```
✅ Extracted 9 patterns
  - Route-Controller-Service-Model (confidence: 0.87, occurrences: 12)
  - Middleware-Chain-Pattern (confidence: 0.75, occurrences: 8)
  - Mongoose-Model-Pattern (confidence: 1.00, occurrences: 6)
  - Auth-Flow-Pattern (confidence: 0.80, occurrences: 3)
  - React-Component-Pattern (confidence: 1.00, occurrences: 45)
  - API-Client-Layer (confidence: 0.90, occurrences: 2)
  - Custom-Hooks-Pattern (confidence: 0.80, occurrences: 5)
  - Input-Validation-Pattern (confidence: 0.67, occurrences: 4)
  - Authorization-Pattern (confidence: 0.90, occurrences: 3)
```

### 2. Analyser une Pull Request

```python
from app.core.design_patterns import (
    PatternComparator,
    PatternCommentGenerator,
    PatternNeo4jRepository,
)

# Load patterns from Neo4j
neo4j_repo = PatternNeo4jRepository()
legacy_patterns_data = neo4j_repo.get_patterns_for_repository("E-commerce")

# Convert to DesignPattern objects
from app.core.design_patterns import DesignPattern
legacy_patterns = [
    DesignPattern(**data) for data in legacy_patterns_data
]

# Prepare PR data
pr_diff = """
diff --git a/routes/user.routes.js b/routes/user.routes.js
+router.post("/login", async (req, res) => {
+  const user = await User.findOne(req.body);
+  const token = jwt.sign({ id: user._id }, "secret123");
+  res.json({ token });
+});
"""

pr_files = {
    "routes/user.routes.js": """
router.post("/login", async (req, res) => {
  const user = await User.findOne(req.body);
  const token = jwt.sign({ id: user._id }, "secret123");
  res.json({ token });
});
"""
}

# Compare
comparator = PatternComparator()
violations = comparator.compare_pr_with_patterns(
    pr_diff=pr_diff,
    pr_files=pr_files,
    legacy_patterns=legacy_patterns,
    repository_path="/path/to/E-commerce",
)

# Generate comments
comment_generator = PatternCommentGenerator()
comments = comment_generator.generate_comments(violations)

# Output
print(f"🚨 Found {len(violations)} violations")
for v in violations:
    print(f"  - {v.severity.upper()}: {v.title}")
    print(f"    File: {v.file_path}:{v.line_number}")
    print(f"    Pattern: {v.pattern.name}")
    print()

# Post comments to GitHub (pseudo-code)
for comment in comments:
    # github_api.post_review_comment(pr_id, comment.file_path, comment.line_number, comment.body)
    print(f"📝 Comment on {comment.file_path}:{comment.line_number}")
    print(comment.body[:200] + "...")
```

**Exemple de sortie:**

```
🚨 Found 3 violations
  - HIGH: Route contains direct business logic
    File: routes/user.routes.js:1
    Pattern: Route-Controller-Service-Model

  - CRITICAL: Sensitive route missing authentication middleware
    File: routes/user.routes.js:1
    Pattern: Middleware-Chain-Pattern

  - CRITICAL: NoSQL Injection detected
    File: routes/user.routes.js:2
    Pattern: Input-Validation-Pattern

📝 Comment on routes/user.routes.js:1
## ⚠️  Route contains direct business logic

**Severity:** `HIGH`

### Description
The route POST /login contains business logic directly instead of delegating to a controller...
```

---

## Patterns Détectés

### 1. **PAT-ARCH-001: Route-Controller-Service-Model**

**Description:** Backend suit une architecture en couches.

**Détection:**
- Fichiers nommés `*.routes.js`, `*.controller.js`, `*.service.js`, `*.model.js`
- Relations d'imports entre ces fichiers
- Appels de fonctions entre couches

**Exemple legacy détecté:**

```
user.routes.js → user.controller.js → user.service.js → user.model.js
product.routes.js → product.controller.js → product.service.js → product.model.js
```

**Violation:**

```javascript
// ❌ BAD (PR code)
router.post("/login", async (req, res) => {
  const user = await User.findOne(req.body);
  res.json({ token: jwt.sign({ id: user._id }, "secret") });
});
```

**Fix:**

```javascript
// ✅ GOOD (following pattern)
// user.routes.js
router.post("/login", authController.login);

// user.controller.js
export async function login(req, res) {
  const result = await authService.login(req.body);
  res.json(result);
}

// user.service.js
export async function login(data) {
  const user = await User.findOne({ email: data.email });
  return generateToken(user);
}
```

---

### 2. **PAT-SEC-001: Middleware-Chain-Pattern**

**Description:** Routes sensibles utilisent des middlewares d'authentification et d'autorisation.

**Détection:**
- Routes avec middlewares nommés `auth*`, `role*`, `validate*`
- Comptage des occurrences

**Exemple legacy détecté:**

```javascript
router.delete("/products/:id", authMiddleware, roleMiddleware("admin"), deleteProduct);
router.post("/orders", authMiddleware, validateOrder, createOrder);
```

**Violation:**

```javascript
// ❌ BAD (PR code)
router.delete("/products/:id", deleteProduct);
```

**Fix:**

```javascript
// ✅ GOOD
router.delete("/products/:id", authMiddleware, roleMiddleware("admin"), deleteProduct);
```

---

### 3. **PAT-REACT-002: API-Client-Layer**

**Description:** Appels API centralisés dans un client layer.

**Détection:**
- Fichiers `apiClient.js`, `api.js`, `services/*Api.js`
- Composants qui importent depuis ces fichiers

**Exemple legacy détecté:**

```javascript
// services/productApi.js
export const getProducts = () => fetch("/api/products").then(r => r.json());

// components/ProductList.jsx
import { getProducts } from "../services/productApi";
```

**Violation:**

```javascript
// ❌ BAD (PR code - component)
function ProductList() {
  useEffect(() => {
    fetch("/api/products").then(r => r.json()).then(setProducts);
  }, []);
}
```

**Fix:**

```javascript
// ✅ GOOD
// services/productApi.js
export const getProducts = () => fetch("/api/products").then(r => r.json());

// components/ProductList.jsx
import { getProducts } from "../services/productApi";

function ProductList() {
  useEffect(() => {
    getProducts().then(setProducts);
  }, []);
}
```

---

### 4. **PAT-DB-001: Mongoose-Model-Pattern**

**Description:** Modèles DB définis avec Mongoose schemas + validation.

**Détection:**
- `new Schema(...)` ou `Schema({...})`
- `mongoose.model(...)`

**Violation:**

```javascript
// ❌ BAD (PR code)
const User = mongoose.model("User", {});
```

**Fix:**

```javascript
// ✅ GOOD
const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

const User = mongoose.model("User", userSchema);
```

---

## Règles MERN Stack

Les règles sont stockées dans `data/knowledge_base/rules_mern_stack.json`.

Chaque règle inclut:

- `id`: Identifiant unique
- `category`: Catégorie (Security, Architecture, Frontend, etc.)
- `severity`: CRITICAL, HIGH, MEDIUM, LOW
- `title`: Titre court
- `description`: Description détaillée
- `recommendation`: Solution recommandée
- **`target_extensions`**: Extensions de fichiers concernés
- **`target_files`**: Noms de dossiers/fichiers concernés
- `linked_repositories`: Repositories utilisant cette règle
- `linked_tickets`: Tickets Jira liés

**Exemple:**

```json
{
  "id": "RULE-SEC-002",
  "category": "NoSQL Injection",
  "severity": "CRITICAL",
  "title": "Interdire req.body/req.query dans requêtes MongoDB",
  "description": "Les entrées utilisateur ne doivent pas être passées directement...",
  "recommendation": "Valider avec Zod/Joi et construire un filtre autorisé.",
  "target_extensions": [".js", ".ts"],
  "target_files": ["controllers", "services", "routes", "models"],
  "linked_repositories": ["E-commerce", "ecommerce-project"],
  "linked_tickets": ["JIRA-DEVORA-002", "JIRA-DEVORA-013"]
}
```

---

## API Endpoints

### POST `/api/v1/patterns/extract`

Extrait les patterns depuis un repository.

**Request:**

```json
{
  "repository_name": "E-commerce",
  "repository_path": "/path/to/repo"
}
```

**Response:**

```json
{
  "patterns_extracted": 9,
  "patterns": [
    {
      "pattern_id": "PAT-ARCH-001",
      "name": "Route-Controller-Service-Model",
      "confidence": 0.87,
      "occurrences": 12
    }
  ]
}
```

---

### POST `/api/v1/patterns/analyze-pr`

Analyse une PR contre les patterns.

**Request:**

```json
{
  "repository_name": "E-commerce",
  "pr_diff": "diff --git ...",
  "pr_files": {
    "routes/user.js": "content..."
  }
}
```

**Response:**

```json
{
  "violations": 3,
  "violations_by_severity": {
    "critical": 1,
    "high": 1,
    "medium": 1
  },
  "comments": [
    {
      "file_path": "routes/user.js",
      "line_number": 5,
      "severity": "high",
      "title": "Route contains direct business logic"
    }
  ]
}
```

---

### GET `/api/v1/patterns/repository/{repo_name}`

Récupère les patterns d'un repository.

**Response:**

```json
{
  "repository": "E-commerce",
  "patterns": [
    {
      "pattern_id": "PAT-ARCH-001",
      "name": "Route-Controller-Service-Model",
      "confidence": 0.87,
      "occurrences": 12,
      "evidence": [
        "user.routes.js → user.controller.js → ..."
      ]
    }
  ]
}
```

---

## Neo4j Schema

```cypher
// Nodes
(:Repository {name, url})
(:DesignPattern {pattern_id, name, type, confidence, occurrences, description})
(:PatternViolation {violation_id, severity, title, file_path, line_number})
(:PullRequest {pr_id, title, url})
(:AnalysisRun {id, status})

// Relationships
(Repository)-[:EXHIBITS_PATTERN]->(DesignPattern)
(PullRequest)-[:HAS_VIOLATION]->(PatternViolation)
(PatternViolation)-[:VIOLATES]->(DesignPattern)
(AnalysisRun)-[:DETECTED_VIOLATION]->(PatternViolation)
```

**Exemples de requêtes:**

```cypher
// Patterns les plus violés
MATCH (v:PatternViolation)-[:VIOLATES]->(p:DesignPattern)
RETURN p.name, count(v) AS violations
ORDER BY violations DESC
LIMIT 10

// Violations critiques sur une PR
MATCH (pr:PullRequest {pr_id: "PR-123"})-[:HAS_VIOLATION]->(v:PatternViolation)
WHERE v.severity = "critical"
RETURN v.title, v.file_path, v.line_number

// Repositories avec pattern X
MATCH (r:Repository)-[:EXHIBITS_PATTERN]->(p:DesignPattern {pattern_id: "PAT-ARCH-001"})
RETURN r.name, p.confidence
```

---

## Exemples

### Exemple Complet: Analyse E-commerce

```python
# 1. Extract patterns
from app.core.design_patterns import *

extractor = PatternExtractor()
patterns = extractor.extract_patterns_from_repository(
    repo_path="/repos/E-commerce",
    repo_name="E-commerce"
)

# 2. Store in Neo4j
neo4j_repo = PatternNeo4jRepository()
for pattern in patterns:
    neo4j_repo.store_pattern(pattern, "E-commerce")

# 3. Analyze PR
pr_diff = open("pr_diff.txt").read()
pr_files = {
    "routes/product.js": open("routes/product.js").read()
}

comparator = PatternComparator()
violations = comparator.compare_pr_with_patterns(
    pr_diff, pr_files, patterns, "/repos/E-commerce"
)

# 4. Generate comments
generator = PatternCommentGenerator()
comments = generator.generate_comments(violations)

# 5. Post to GitHub
for comment in comments:
    print(f"📝 {comment.file_path}:{comment.line_number}")
    print(comment.body)
```

---

## Troubleshooting

### Problème: Aucun pattern détecté

**Cause:** Structure de projet non standard ou fichiers skip

**Solution:**
1. Vérifier que les dossiers ne sont pas dans `node_modules`, `dist`, etc.
2. Vérifier les conventions de nommage: `*.routes.js`, `*.controller.js`
3. Activer le logging: `logging.basicConfig(level=logging.DEBUG)`

### Problème: Trop de faux positifs

**Cause:** Confidence trop basse

**Solution:**
- Filtrer les patterns avec `pattern.confidence > 0.6`
- Augmenter le seuil d'occurrences minimum

### Problème: Neo4j connection failed

**Solution:**
```bash
# Vérifier Neo4j
docker ps | grep neo4j

# Démarrer Neo4j
docker-compose up neo4j -d

# Tester connexion
cypher-shell -a bolt://localhost:7687 -u neo4j -p your_password
```

---

## Next Steps

1. ✅ Patterns extraits depuis legacy code
2. ✅ Comparaison PR vs patterns
3. ✅ Commentaires intelligents générés
4. 🔄 Intégration dans le pipeline GraphRAG principal
5. 🔄 API endpoints exposés
6. 🔄 Dashboard pour visualiser les patterns

---

**Documentation générée par Devora AI** 🚀
