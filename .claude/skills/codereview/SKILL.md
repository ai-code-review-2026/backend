---
name: code-review
description: >
  Analyse complète de code et de repositories. Utilise cette skill dès que l'utilisateur
  mentionne une revue de code, un audit de repo, une analyse de qualité, une détection de bugs,
  une refactorisation, une analyse de sécurité, une vérification de bonnes pratiques, ou toute
  demande liée à l'évaluation d'un projet ou fichier de code — même si l'utilisateur ne dit pas
  explicitement "code review". Trigger également sur : "regarde mon code", "qu'est-ce qui ne va pas",
  "analyse mon projet", "améliore mon code", "trouve les problèmes", "optimise", "audite mon repo".
---

# Code Review — Analyse Complète de Repository

Cette skill guide Claude pour effectuer une revue de code exhaustive, structurée et actionnable,
qu'il s'agisse d'un seul fichier, d'un module, ou d'un projet entier.

---

## 1. Comprendre la demande

Avant de démarrer, identifie :

- **Périmètre** : un fichier ? un dossier ? tout le repo ?
- **Langage(s)** : Python, TypeScript, Java, Go, Rust, etc.
- **Objectif** : qualité générale, sécurité, performance, lisibilité, conformité à un standard ?
- **Contexte** : projet perso, prod, open-source, code legacy ?
- **Niveau de détail souhaité** : survol rapide ou analyse profonde ligne par ligne ?

Si ces éléments ne sont pas clairs, pose **une seule question synthétique** avant de démarrer.

---

## 2. Exploration du repo

### 2.1 Cartographie initiale

```bash
# Structure du projet
find . -type f \( -name "*.py" -o -name "*.ts" -o -name "*.js" -o -name "*.go" \
  -o -name "*.java" -o -name "*.rs" -o -name "*.cpp" -o -name "*.c" \) \
  | head -100

# Fichiers de config présents
ls -la
cat package.json 2>/dev/null || cat pyproject.toml 2>/dev/null \
  || cat Cargo.toml 2>/dev/null || cat go.mod 2>/dev/null || true

# Taille du projet
find . -type f | wc -l
wc -l $(find . -name "*.py" -o -name "*.ts" -o -name "*.js" 2>/dev/null) 2>/dev/null | tail -1
```

### 2.2 Points d'entrée

Identifie :
- Le fichier principal (`main.py`, `index.ts`, `App.jsx`, `main.go`, etc.)
- Les fichiers de configuration (`config.py`, `.env.example`, `settings.py`, etc.)
- Les fichiers de test (`tests/`, `__tests__/`, `*.spec.ts`, etc.)
- La CI/CD (`.github/workflows/`, `Dockerfile`, `docker-compose.yml`)

---

## 3. Grille d'analyse

Pour chaque fichier ou module analysé, évalue ces 7 dimensions :

### 🔴 Sécurité (priorité absolue)
- Injection SQL / NoSQL / commandes shell
- Secrets hardcodés (API keys, mots de passe, tokens)
- Validation insuffisante des entrées utilisateur
- Dépendances avec vulnérabilités connues (CVE)
- Exposition d'informations sensibles dans les logs ou erreurs
- Authentification / autorisation incorrecte
- XSS, CSRF, SSRF (pour les projets web)

### 🟠 Bugs & Correctness
- Conditions de course (race conditions)
- Gestion des erreurs absente ou silencieuse (`except: pass`, `.catch(() => {})`)
- Pointeurs null / undefined non vérifiés
- Off-by-one errors, boucles infinies
- Logique métier incorrecte
- Valeurs de retour ignorées

### 🟡 Performance
- Requêtes N+1 (ORM)
- Boucles inutilement imbriquées (O(n²) évitable)
- Absence de cache sur les opérations coûteuses
- Allocations mémoire excessives
- I/O synchrone bloquant dans du code async
- Index manquants sur les requêtes DB fréquentes

### 🔵 Qualité & Maintenabilité
- Fonctions trop longues (> 50 lignes → signal d'alerte)
- Responsabilités multiples dans une même classe/fonction (SRP)
- Code dupliqué (DRY)
- Magic numbers / strings sans constante nommée
- Nommage obscur ou trompeur
- Commentaires obsolètes ou absence de documentation sur les APIs publiques

### 🟢 Architecture & Design
- Couplage fort entre modules non liés
- Dépendances circulaires
- Architecture en couches respectée (presentation / business / data)
- Respect des patterns du projet (si patterns déjà en place)
- Testabilité du code (injection de dépendances, mocking possible)

### ⚪ Tests
- Couverture des cas nominaux
- Cas limites et erreurs testés
- Tests trop couplés à l'implémentation (fragilité)
- Fixtures / mocks réutilisables
- Nommage des tests (doit décrire le comportement attendu)

### 🔧 Style & Conventions
- Respect du linter/formatter du projet (ESLint, Black, gofmt, clippy…)
- Imports non utilisés
- Fichiers trop longs (> 300-400 lignes → candidat au split)
- Consistance dans les conventions de nommage

---

## 4. Workflow d'analyse

### Étape 1 — Lecture des fichiers clés

Commence par les fichiers les plus critiques :
1. Point d'entrée principal
2. Modèles de données / schémas
3. Couche d'authentification / sécurité
4. Fichiers les plus longs ou les plus importés

```bash
# Lire un fichier
cat path/to/file.py

# Chercher des patterns suspects
grep -rn "password\|secret\|api_key\|token" . --include="*.py" --include="*.ts" \
  --include="*.js" --include="*.env" | grep -v ".env.example" | grep -v node_modules

# Trouver les TODO/FIXME/HACK
grep -rn "TODO\|FIXME\|HACK\|XXX\|BUG" . --include="*.py" --include="*.ts" \
  --include="*.js" | grep -v node_modules

# Détecter du code mort (fonctions non appelées - Python)
grep -rn "^def \|^async def " . --include="*.py" | grep -v node_modules

# Vérifier les dépendances
cat requirements.txt 2>/dev/null || cat package.json 2>/dev/null | python3 -m json.tool
```

### Étape 2 — Analyse approfondie

Pour chaque fichier significatif (> 50 lignes), applique la grille d'analyse section 3.

### Étape 3 — Synthèse

Consolide les findings par sévérité.

---

## 5. Format du rapport de sortie

Structure toujours le rapport ainsi :

```
# 📋 Rapport de Code Review — [Nom du projet / fichier]
Date : [date]
Périmètre : [fichiers analysés]

---

## 🎯 Résumé Exécutif
[3-5 phrases : état global, principaux risques, recommandation prioritaire]

**Score global** : [🔴 Critique | 🟠 Faible | 🟡 Moyen | 🟢 Bon | ✅ Excellent]

---

## 🔴 Problèmes Critiques (blocker)
### [Titre court]
- **Fichier** : `path/to/file.py`, ligne X
- **Problème** : description claire
- **Risque** : impact concret (ex: "injection SQL permettant l'exfiltration de données")
- **Correction** :
  ```[langage]
  // Code corrigé
  ```

---

## 🟠 Problèmes Importants (should fix)
[Même format]

---

## 🟡 Améliorations Recommandées (nice to fix)
[Même format, peut être en liste]

---

## 🟢 Points Positifs
[Ce qui est bien fait — toujours inclure cette section]

---

## 📊 Statistiques
| Dimension       | Évaluation     |
|----------------|----------------|
| Sécurité       | 🟡 Moyen       |
| Qualité code   | 🟢 Bon         |
| Tests          | 🔴 Insuffisant |
| Architecture   | 🟢 Bon         |
| Performance    | 🟡 Moyen       |

---

## 🚀 Plan d'action suggéré
1. [Immédiat — critique] ...
2. [Court terme — 1 semaine] ...
3. [Moyen terme — 1 mois] ...
```

---

## 6. Règles de comportement

### Ce que tu DOIS faire
- **Toujours proposer du code corrigé**, pas seulement pointer un problème
- **Prioriser** : ne pas noyer l'utilisateur sous 50 problèmes — hiérarchise
- **Être précis** : indiquer le fichier ET la ligne quand possible
- **Expliquer le pourquoi** : "pourquoi c'est un problème" avant "comment le corriger"
- **Reconnaître ce qui est bien** : une bonne review n'est pas que critique

### Ce que tu NE DOIS PAS faire
- Reformater du code fonctionnel sans raison
- Imposer un style personnel si le projet a déjà une convention
- Inventer des bugs qui n'existent pas pour paraître exhaustif
- Faire des suggestions de performance prématurée sur du code non critique

---

## 7. Cas particuliers

### Repo très large (> 50 fichiers)
1. Demande à l'utilisateur les modules prioritaires
2. Commence par une analyse macro (architecture, dépendances, points d'entrée)
3. Propose un rapport par module puis une synthèse globale

### Code legacy ou sans tests
- Signale explicitement l'absence de tests comme risque
- Avant toute suggestion de refacto, recommande d'ajouter des tests de régression
- Utilise la règle "boy scout" : améliore ce que tu touches, sans tout réécrire

### Analyse de sécurité approfondie
Si l'utilisateur demande un audit de sécurité spécifique :
- Cherche les CVE connues dans les dépendances (`npm audit`, `pip-audit`, `cargo audit`)
- Vérifie la gestion des sessions, JWT, CORS
- Analyse les endpoints exposés et leurs validations
- Vérifie les variables d'environnement et la gestion des secrets

```bash
# Audit sécurité npm
npm audit 2>/dev/null

# Audit sécurité Python
pip-audit 2>/dev/null || safety check 2>/dev/null

# Chercher des secrets hardcodés
grep -rEn "(password|passwd|pwd|secret|api_key|apikey|token|auth)\s*=\s*['\"][^'\"]{4,}" \
  . --include="*.py" --include="*.js" --include="*.ts" --include="*.env" \
  | grep -v ".env.example" | grep -v "node_modules" | grep -v "__pycache__"
```

### Multi-langage
Si le repo mélange plusieurs langages, analyse chaque partie avec les conventions
spécifiques au langage. Signale les incohérences entre les parties.

---

## 8. Checklist rapide (pour reviews express < 5 min)

Si l'utilisateur veut juste un coup d'œil rapide :

```
☐ Secrets hardcodés ?
☐ SQL/commande sans paramétrage ?
☐ Erreurs silenciées ?
☐ Inputs non validés ?
☐ Dépendances à jour ?
☐ Tests présents ?
☐ README / doc à jour ?
```

---

## Rappel final

Une bonne code review est **constructive, précise, et actionnable**.
L'objectif n'est pas de trouver le maximum de problèmes,
mais d'aider le développeur à livrer un code plus sûr, plus maintenable, et plus robuste.