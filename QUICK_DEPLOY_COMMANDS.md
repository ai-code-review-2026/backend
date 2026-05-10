# 🚀 Commandes Rapides de Déploiement VPS

## ⚡ Déploiement en Une Commande (Recommandé)

Copiez-collez cette commande complète dans votre terminal PowerShell:

```powershell
ssh root@135.125.100.150 "cd /root/ai-code-review-platform && git pull origin main && cd apps/backend && poetry install && poetry run alembic upgrade head && cd /root/ai-code-review-platform && docker-compose down && docker-compose up -d --build && sleep 5 && curl -s http://localhost:8000/health"
```

**Mot de passe**: `DevoraPass2026`

---

## 📋 Étapes Individuelles (Si Préféré)

### 1. Connexion au serveur

```powershell
ssh root@135.125.100.150
# Entrez le mot de passe: DevoraPass2026
```

### 2. Une fois connecté, exécutez:

```bash
cd /root/ai-code-review-platform
git pull origin main
cd apps/backend
poetry install
poetry run alembic upgrade head
cd /root/ai-code-review-platform
docker-compose down
docker-compose up -d --build
sleep 5
curl -s http://localhost:8000/health | python3 -m json.tool
```

---

## ✅ Vérification Rapide

```powershell
# Test depuis votre machine Windows
curl http://135.125.100.150:8000/health
```

Réponse attendue:
```json
{
  "status": "ok",
  "services": {
    "api": "ok",
    "neo4j": "configured"
  }
}
```

---

## 🔧 Configuration Pattern Analysis (À faire une seule fois)

```bash
ssh root@135.125.100.150

# Éditer .env
cd /root/ai-code-review-platform
nano .env

# Ajouter ces lignes (si pas déjà présentes):
# PATTERN_ANALYSIS_ENABLED=true
# NEO4J_ENABLED=true
# NEO4J_URI=bolt://localhost:7687
# NEO4J_USER=neo4j
# NEO4J_PASSWORD=neo4j

# Sauvegarder: Ctrl+O, Enter, Ctrl+X

# Redémarrer les services
docker-compose restart
```

---

## 🧪 Test Pattern Analysis

```bash
ssh root@135.125.100.150

cd /root/ai-code-review-platform/apps/backend

# Test d'extraction de patterns
poetry run python -c "
from app.core.design_patterns import PatternExtractor
print('✅ Pattern Analysis module loaded successfully')
"

# Test de connexion Neo4j
poetry run python -c "
from app.integrations.graph_database.neo4j_client import get_neo4j_client
neo4j = get_neo4j_client()
if neo4j.enabled:
    with neo4j.driver.session() as session:
        result = session.run('RETURN 1')
        print('✅ Neo4j connected successfully')
else:
    print('⚠️  Neo4j is disabled')
"
```

---

## 📊 Monitoring

### Voir les logs en temps réel

```powershell
# Depuis Windows PowerShell
ssh root@135.125.100.150 "docker logs -f ai-code-review-api --tail 100"
```

### Vérifier les services Docker

```bash
ssh root@135.125.100.150 "docker ps"
```

---

## 🆘 Dépannage Rapide

### Si les services ne démarrent pas:

```bash
ssh root@135.125.100.150

cd /root/ai-code-review-platform
docker-compose logs --tail 50
docker-compose ps
docker-compose restart
```

### Si Neo4j ne se connecte pas:

```bash
ssh root@135.125.100.150

docker ps | grep neo4j
docker logs neo4j --tail 50
docker restart neo4j
```

### Si les migrations échouent:

```bash
ssh root@135.125.100.150

cd /root/ai-code-review-platform/apps/backend
poetry run alembic current
poetry run alembic history
poetry run alembic upgrade head --sql  # Voir le SQL
poetry run alembic upgrade head        # Exécuter
```

---

## 📈 Statistiques Pattern Analysis

```bash
# Depuis le VPS
curl http://localhost:8000/api/v1/patterns/statistics | python3 -m json.tool

# Depuis Windows
curl http://135.125.100.150:8000/api/v1/patterns/statistics
```

---

## 🔄 Redéploiement Rapide (Après Modifications)

```powershell
# Une seule commande depuis Windows
ssh root@135.125.100.150 "cd /root/ai-code-review-platform && git pull && docker-compose restart"
```

---

## 📝 Checklist Post-Déploiement

- [ ] `git pull` réussi
- [ ] `poetry install` réussi
- [ ] Migrations exécutées
- [ ] Services Docker actifs: `docker ps`
- [ ] Health check OK: `curl http://localhost:8000/health`
- [ ] Neo4j accessible: `docker logs neo4j`
- [ ] Pattern Analysis activé dans `.env`
- [ ] API répond: `curl http://135.125.100.150:8000/health`

---

## 🎯 Accès aux Services

- **Backend API**: http://135.125.100.150:8000
- **API Docs**: http://135.125.100.150:8000/docs
- **Dashboard**: http://135.125.100.150:3001
- **Neo4j Browser**: http://135.125.100.150:7474
- **Prometheus**: http://135.125.100.150:9090
- **Grafana**: http://135.125.100.150:3000

---

## 💡 Commandes Utiles

```bash
# État des services
docker ps

# Logs API
docker logs ai-code-review-api --tail 100 -f

# Logs Worker
docker logs ai-code-review-worker --tail 100 -f

# Logs Neo4j
docker logs neo4j --tail 50

# Redémarrer un service
docker-compose restart api

# Reconstruire et redémarrer
docker-compose up -d --build api

# Arrêter tout
docker-compose down

# Démarrer tout
docker-compose up -d

# Espace disque
df -h

# Mémoire
free -h

# Processus
htop
```

---

**Note**: Si vous rencontrez des problèmes, consultez `VPS_DEPLOYMENT_GUIDE.md` pour des solutions détaillées.
