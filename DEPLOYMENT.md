# AI Code Review Platform - Guide de Déploiement VPS

Guide complet pour déployer la plateforme AI Code Review sur un VPS en production.

## 📋 Table des Matières

1. [Prérequis](#prérequis)
2. [Architecture](#architecture)
3. [Configuration DNS](#configuration-dns)
4. [Préparation du VPS](#préparation-du-vps)
5. [Configuration de l'Environnement](#configuration-de-lenvironnement)
6. [Déploiement](#déploiement)
7. [Vérification](#vérification)
8. [Maintenance](#maintenance)
9. [Troubleshooting](#troubleshooting)
10. [Sécurité](#sécurité)

---

## 🎯 Prérequis

### Infrastructure Requise

- **VPS/Serveur Cloud** avec minimum:
  - 4 vCPU
  - 8 GB RAM
  - 100 GB SSD
  - Ubuntu 22.04 LTS ou Debian 12
  - Connexion Internet stable

- **Domaine personnalisé** (ex: votre-domaine.com)
  - Accès à la configuration DNS

### Outils Requis sur Votre Machine Locale

- Git
- Docker Desktop (pour build des images)
- Compte Docker Hub (pour pousser les images)
- SSH client

### Services Externes

- **GitHub App** configurée (pour l'intégration)
- **Clerk** (optionnel, pour l'authentification)
- **Anthropic API Key** ou **OpenAI API Key** (pour les LLMs)

---

## 🏗️ Architecture

### Services Déployés

```
┌─────────────────────────────────────────────────────────┐
│                     Internet (HTTPS)                     │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────▼──────────┐
         │   Caddy (Port 443)   │ ← Reverse Proxy + SSL
         │  Let's Encrypt SSL   │
         └───────────┬──────────┘
                     │
     ┌───────────────┼───────────────┐
     │               │               │
┌────▼─────┐  ┌─────▼────┐  ┌──────▼──────┐
│Dashboard │  │ Backend  │  │ YJS Server  │
│ (3001)   │  │ (8000)   │  │  (1234)     │
└──────────┘  └────┬─────┘  └─────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
   ┌────▼───┐ ┌───▼────┐ ┌───▼────┐
   │Postgres│ │ Redis  │ │ Neo4j  │
   │ (5432) │ │ (6379) │ │ (7687) │
   └────────┘ └────────┘ └────────┘
```

### Sous-domaines

- `votre-domaine.com` → Dashboard (Frontend)
- `api.votre-domaine.com` → Backend API
- `yjs.votre-domaine.com` → WebSocket collaboration
- `grafana.votre-domaine.com` → Monitoring
- `flower.votre-domaine.com` → Celery monitoring
- `minio.votre-domaine.com` → MinIO admin UI
- `storage.votre-domaine.com` → MinIO S3 API

---

## 🌐 Configuration DNS

### Étape 1: Créer les enregistrements DNS

Chez votre fournisseur DNS (OVH, Cloudflare, etc.), créez ces **enregistrements A**:

| Type | Nom | Valeur | TTL |
|------|-----|--------|-----|
| A | @ | `VOTRE_IP_VPS` | 3600 |
| A | api | `VOTRE_IP_VPS` | 3600 |
| A | yjs | `VOTRE_IP_VPS` | 3600 |
| A | grafana | `VOTRE_IP_VPS` | 3600 |
| A | flower | `VOTRE_IP_VPS` | 3600 |
| A | minio | `VOTRE_IP_VPS` | 3600 |
| A | storage | `VOTRE_IP_VPS` | 3600 |

### Étape 2: Vérifier la propagation DNS

```bash
# Tester depuis votre machine locale (attendre 5-10 minutes)
nslookup votre-domaine.com
nslookup api.votre-domaine.com
```

---

## 🖥️ Préparation du VPS

### Étape 1: Connexion SSH

```bash
ssh root@VOTRE_IP_VPS
```

### Étape 2: Mise à jour du système

```bash
# Mettre à jour les paquets
apt update && apt upgrade -y

# Installer les outils essentiels
apt install -y curl wget git ufw fail2ban htop
```

### Étape 3: Créer un utilisateur non-root

```bash
# Créer l'utilisateur
adduser aireviewer
usermod -aG sudo aireviewer

# Autoriser Docker sans sudo
usermod -aG docker aireviewer

# Se connecter avec le nouvel utilisateur
su - aireviewer
```

### Étape 4: Installer Docker et Docker Compose

```bash
# Installer Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Vérifier l'installation
docker --version
docker compose version

# Activer Docker au démarrage
sudo systemctl enable docker
sudo systemctl start docker
```

### Étape 5: Configurer le Firewall

```bash
# Autoriser SSH, HTTP, HTTPS
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP (Caddy)
sudo ufw allow 443/tcp  # HTTPS (Caddy)

# Activer le firewall
sudo ufw enable
sudo ufw status
```

### Étape 6: Configurer Fail2Ban (protection brute-force)

```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

---

## ⚙️ Configuration de l'Environnement

### Étape 1: Cloner le repository

```bash
cd /home/aireviewer
git clone https://github.com/votre-org/ai-code-review-platform.git
cd ai-code-review-platform
```

### Étape 2: Créer le fichier .env

```bash
# Copier le template
cp .env.example .env

# Éditer avec nano ou vim
nano .env
```

### Étape 3: Remplir les variables critiques

Voici les variables **OBLIGATOIRES** à modifier dans `.env`:

#### 1. Domaines

```bash
APP_DOMAIN=votre-domaine.com
API_DOMAIN=api.votre-domaine.com
YJS_DOMAIN=yjs.votre-domaine.com
GRAFANA_DOMAIN=grafana.votre-domaine.com
FLOWER_DOMAIN=flower.votre-domaine.com
MINIO_DOMAIN=minio.votre-domaine.com
STORAGE_DOMAIN=storage.votre-domaine.com
```

#### 2. Mots de passe des bases de données

```bash
# PostgreSQL
POSTGRES_PASSWORD=$(openssl rand -base64 24)

# Neo4j
NEO4J_PASSWORD=$(openssl rand -base64 24)

# MinIO
MINIO_ROOT_PASSWORD=$(openssl rand -base64 24)
```

#### 3. Clés de sécurité

```bash
# Clé de chiffrement Fernet
SECRETS_ENCRYPTION_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")

# JWT Secret
JWT_SECRET_KEY=$(openssl rand -hex 32)

# GitHub Webhook Secret
GITHUB_WEBHOOK_SECRET=$(openssl rand -hex 20)
```

#### 4. GitHub App

```bash
GITHUB_APP_ID=123456
GITHUB_APP_INSTALLATION_ID=987654
GITHUB_APP_PRIVATE_KEY_PEM="-----BEGIN RSA PRIVATE KEY-----\nVOTRE_CLE_PRIVEE\n-----END RSA PRIVATE KEY-----"
GITHUB_OAUTH_TOKEN=ghp_votre_token
```

#### 5. LLM Provider (Anthropic ou OpenAI)

```bash
# Anthropic (recommandé)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-XXXXXXXXXX
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# OU OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-XXXXXXXXXX
OPENAI_MODEL=gpt-4o-mini
```

#### 6. Monitoring

```bash
GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 16)
FLOWER_PASSWORD=$(openssl rand -base64 16)
```

### Étape 4: Éditer le Caddyfile

```bash
nano Caddyfile

# Remplacer TOUTES les occurrences de <votre-domaine.com>
# Exemple: :%s/<votre-domaine.com>/monsite.com/g dans vim
```

### Étape 5: Générer les hash pour authentification basique

```bash
# Pour Flower et pgAdmin (optionnel)
# Installer caddy localement ou utiliser bcrypt online
docker run --rm caddy caddy hash-password --plaintext votre-mot-de-passe

# Copier le hash dans Caddyfile section basicauth
```

---

## 🚀 Déploiement

### Étape 1: Build et Push des Images Docker

Sur **votre machine locale** (pas le VPS):

```bash
# Se connecter à Docker Hub
docker login

# Build backend
cd apps/backend
docker build -t votre-username/ai-review-backend:latest .
docker push votre-username/ai-review-backend:latest

# Build dashboard
cd ../dashboard
docker build -t votre-username/ai-review-dashboard:latest .
docker push votre-username/ai-review-dashboard:latest

# Build YJS server (si applicable)
cd ../yjs-server
docker build -t votre-username/ai-review-yjs:latest .
docker push votre-username/ai-review-yjs:latest
```

### Étape 2: Mettre à jour docker-compose.vps.yml

Sur le **VPS**, éditer `docker-compose.vps.yml`:

```yaml
services:
  backend:
    image: votre-username/ai-review-backend:latest  # Votre image
    # ...
  
  dashboard:
    image: votre-username/ai-review-dashboard:latest  # Votre image
    # ...
```

### Étape 3: Créer les répertoires de logs

```bash
sudo mkdir -p /var/log/caddy
sudo chown -R aireviewer:aireviewer /var/log/caddy
```

### Étape 4: Démarrer les services

```bash
# Étape 1: Démarrer l'infrastructure (bases de données)
docker compose -f docker-compose.vps.yml up -d postgres redis neo4j minio

# Attendre 30 secondes
sleep 30

# Vérifier que les bases sont up
docker compose -f docker-compose.vps.yml ps

# Étape 2: Démarrer le backend
docker compose -f docker-compose.vps.yml up -d backend worker

# Attendre 20 secondes
sleep 20

# Étape 3: Démarrer le frontend
docker compose -f docker-compose.vps.yml up -d dashboard yjs-server

# Étape 4: Démarrer le reverse proxy
docker compose -f docker-compose.vps.yml up -d caddy

# Étape 5: Démarrer le monitoring (optionnel)
docker compose -f docker-compose.vps.yml up -d grafana flower pgadmin
```

### Étape 5: Vérifier les logs

```bash
# Voir tous les conteneurs
docker compose -f docker-compose.vps.yml ps

# Logs du backend
docker compose -f docker-compose.vps.yml logs -f backend

# Logs Caddy (SSL)
docker compose -f docker-compose.vps.yml logs -f caddy

# Logs dashboard
docker compose -f docker-compose.vps.yml logs -f dashboard
```

---

## ✅ Vérification

### 1. Vérifier les services

```bash
# Tous les conteneurs doivent être "Up" et "healthy"
docker compose -f docker-compose.vps.yml ps
```

### 2. Tester les endpoints

```bash
# Health check backend
curl https://api.votre-domaine.com/health

# Dashboard
curl https://votre-domaine.com

# MinIO
curl https://storage.votre-domaine.com/minio/health/live
```

### 3. Vérifier SSL

Ouvrir dans le navigateur:
- https://votre-domaine.com (doit afficher 🔒 vert)
- https://api.votre-domaine.com/docs (Swagger UI)

### 4. Tester l'authentification

- Se connecter au dashboard
- Créer un projet
- Déclencher une analyse

### 5. Vérifier le monitoring

- Grafana: https://grafana.votre-domaine.com (admin / votre_password)
- Flower: https://flower.votre-domaine.com (admin / votre_password)
- MinIO: https://minio.votre-domaine.com (minioadmin / votre_password)

---

## 🛠️ Maintenance

### Mise à jour de l'application

```bash
# 1. Pull les dernières images
docker compose -f docker-compose.vps.yml pull

# 2. Redémarrer avec les nouvelles images
docker compose -f docker-compose.vps.yml up -d

# 3. Nettoyer les anciennes images
docker image prune -a -f
```

### Backup des données

#### Backup PostgreSQL

```bash
# Backup manuel
docker compose -f docker-compose.vps.yml exec postgres pg_dump -U postgres ai_code_review > backup_$(date +%Y%m%d).sql

# Restore
docker compose -f docker-compose.vps.yml exec -T postgres psql -U postgres ai_code_review < backup_20250427.sql
```

#### Backup Neo4j

```bash
# Backup
docker compose -f docker-compose.vps.yml exec neo4j neo4j-admin database dump neo4j --to-path=/backups

# Copier depuis le conteneur
docker cp $(docker compose -f docker-compose.vps.yml ps -q neo4j):/backups ./neo4j_backup_$(date +%Y%m%d)
```

#### Backup MinIO (S3)

```bash
# Utiliser mc (MinIO Client)
docker run --rm --network ai-review-network \
  -v $(pwd)/minio_backup:/backup \
  minio/mc mirror minio/ai-review-artifacts /backup
```

### Script de backup automatique

Créer `/home/aireviewer/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/home/aireviewer/backups/$(date +%Y%m%d)"
mkdir -p $BACKUP_DIR

# Postgres
docker compose -f /home/aireviewer/ai-code-review-platform/docker-compose.vps.yml \
  exec -T postgres pg_dump -U postgres ai_code_review > $BACKUP_DIR/postgres.sql

# Neo4j
docker compose -f /home/aireviewer/ai-code-review-platform/docker-compose.vps.yml \
  exec neo4j neo4j-admin database dump neo4j --to-path=/backups
docker cp $(docker compose -f /home/aireviewer/ai-code-review-platform/docker-compose.vps.yml ps -q neo4j):/backups/neo4j.dump $BACKUP_DIR/

# Compresser
tar -czf $BACKUP_DIR.tar.gz -C $BACKUP_DIR .
rm -rf $BACKUP_DIR

# Garder seulement 7 derniers backups
find /home/aireviewer/backups -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR.tar.gz"
```

Ajouter au crontab:

```bash
crontab -e

# Backup quotidien à 3h du matin
0 3 * * * /home/aireviewer/backup.sh >> /var/log/backup.log 2>&1
```

### Monitoring des logs

```bash
# Voir les logs en temps réel
docker compose -f docker-compose.vps.yml logs -f --tail=100

# Logs d'un service spécifique
docker compose -f docker-compose.vps.yml logs -f backend

# Logs Caddy (erreurs SSL)
tail -f /var/log/caddy/app.log
tail -f /var/log/caddy/api.log
```

### Nettoyage

```bash
# Nettoyer les volumes inutilisés
docker volume prune

# Nettoyer les images
docker image prune -a

# Nettoyer les logs Docker (si /var/lib/docker est plein)
sudo sh -c "truncate -s 0 /var/lib/docker/containers/*/*-json.log"
```

---

## 🐛 Troubleshooting

### Problème: SSL ne fonctionne pas

**Symptômes**: ERR_SSL_PROTOCOL_ERROR ou certificat invalide

**Solutions**:

```bash
# 1. Vérifier les logs Caddy
docker compose -f docker-compose.vps.yml logs caddy

# 2. Vérifier que les ports sont ouverts
sudo ufw status
sudo netstat -tulpn | grep :443

# 3. Vérifier DNS
nslookup votre-domaine.com

# 4. Tester Let's Encrypt en staging d'abord
# Éditer Caddyfile: décommenter la ligne acme_ca staging
docker compose -f docker-compose.vps.yml restart caddy

# 5. Forcer le renouvellement
docker compose -f docker-compose.vps.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
```

### Problème: Backend ne démarre pas

**Symptômes**: backend exit code 1

**Solutions**:

```bash
# 1. Voir les logs détaillés
docker compose -f docker-compose.vps.yml logs backend

# 2. Vérifier la connexion DB
docker compose -f docker-compose.vps.yml exec backend python -c "import asyncpg; print('OK')"

# 3. Tester la connexion Postgres
docker compose -f docker-compose.vps.yml exec postgres psql -U postgres -c "SELECT 1"

# 4. Vérifier les variables .env
docker compose -f docker-compose.vps.yml exec backend env | grep DATABASE_URL

# 5. Redémarrer avec les dépendances
docker compose -f docker-compose.vps.yml restart postgres redis
docker compose -f docker-compose.vps.yml restart backend
```

### Problème: Worker Celery ne traite pas les tâches

**Symptômes**: Analyses en attente indéfiniment

**Solutions**:

```bash
# 1. Vérifier que le worker tourne
docker compose -f docker-compose.vps.yml ps worker

# 2. Logs du worker
docker compose -f docker-compose.vps.yml logs -f worker

# 3. Vérifier Redis
docker compose -f docker-compose.vps.yml exec redis redis-cli ping

# 4. Voir la queue Celery dans Flower
# Ouvrir https://flower.votre-domaine.com

# 5. Redémarrer le worker
docker compose -f docker-compose.vps.yml restart worker
```

### Problème: Neo4j out of memory

**Symptômes**: Neo4j crash ou lent

**Solutions**:

```bash
# 1. Augmenter la heap dans .env
NEO4J_HEAP_INITIAL=1G
NEO4J_HEAP_MAX=4G
NEO4J_PAGECACHE=2G

# 2. Redémarrer
docker compose -f docker-compose.vps.yml restart neo4j

# 3. Vérifier l'utilisation mémoire
docker stats neo4j
```

### Problème: Dashboard 502 Bad Gateway

**Symptômes**: Page blanche ou erreur 502

**Solutions**:

```bash
# 1. Vérifier que dashboard tourne
docker compose -f docker-compose.vps.yml ps dashboard

# 2. Logs dashboard
docker compose -f docker-compose.vps.yml logs -f dashboard

# 3. Vérifier le build Next.js
docker compose -f docker-compose.vps.yml exec dashboard ls -la .next

# 4. Variables d'environnement
docker compose -f docker-compose.vps.yml exec dashboard env | grep NEXT_PUBLIC

# 5. Rebuild l'image
docker compose -f docker-compose.vps.yml build --no-cache dashboard
docker compose -f docker-compose.vps.yml up -d dashboard
```

### Problème: Espace disque plein

```bash
# Vérifier l'espace
df -h

# Nettoyer Docker
docker system prune -a --volumes

# Nettoyer les logs
sudo journalctl --vacuum-time=3d
sudo sh -c "truncate -s 0 /var/lib/docker/containers/*/*-json.log"

# Identifier les gros fichiers
du -sh /var/lib/docker/*
du -sh /home/aireviewer/*
```

---

## 🔒 Sécurité

### 1. Clés SSH

```bash
# Sur votre machine locale, générer une clé SSH
ssh-keygen -t ed25519 -C "votre-email@example.com"

# Copier la clé publique sur le VPS
ssh-copy-id aireviewer@VOTRE_IP_VPS

# Sur le VPS, désactiver l'authentification par mot de passe
sudo nano /etc/ssh/sshd_config
# Mettre: PasswordAuthentication no
sudo systemctl restart sshd
```

### 2. Fail2Ban pour Docker

```bash
# Créer /etc/fail2ban/jail.d/docker.conf
sudo nano /etc/fail2ban/jail.d/docker.conf
```

Contenu:

```ini
[docker]
enabled = true
filter = docker
logpath = /var/log/caddy/*.log
maxretry = 5
bantime = 3600
```

### 3. Limiter l'accès aux services sensibles

```bash
# Restreindre pgAdmin, Flower, Grafana par IP
# Éditer Caddyfile, ajouter:
# @admin_ips {
#   remote_ip 203.0.113.0/24  # Votre IP
# }
# handle @admin_ips {
#   reverse_proxy pgadmin:5050
# }
```

### 4. Rotation des secrets

```bash
# Tous les 90 jours, regénérer:
POSTGRES_PASSWORD=$(openssl rand -base64 24)
JWT_SECRET_KEY=$(openssl rand -hex 32)
SECRETS_ENCRYPTION_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")

# Mettre à jour .env et redémarrer
docker compose -f docker-compose.vps.yml down
docker compose -f docker-compose.vps.yml up -d
```

### 5. Monitoring de sécurité

```bash
# Installer Lynis (audit de sécurité)
sudo apt install lynis
sudo lynis audit system

# Vérifier les ports ouverts
sudo ss -tulpn

# Vérifier les connexions actives
sudo netstat -an | grep ESTABLISHED
```

---

## 📞 Support

### Logs à fournir en cas de problème

```bash
# Générer un rapport complet
{
  echo "=== Docker Compose Status ==="
  docker compose -f docker-compose.vps.yml ps
  
  echo "=== Backend Logs ==="
  docker compose -f docker-compose.vps.yml logs --tail=100 backend
  
  echo "=== Caddy Logs ==="
  docker compose -f docker-compose.vps.yml logs --tail=100 caddy
  
  echo "=== System Info ==="
  df -h
  free -m
  docker stats --no-stream
} > debug_report_$(date +%Y%m%d).txt
```

### Contact

- GitHub Issues: https://github.com/votre-org/ai-code-review-platform/issues
- Documentation: https://docs.votre-domaine.com

---

## 📝 Checklist de Déploiement

- [ ] VPS provisionné (4 vCPU, 8 GB RAM, 100 GB SSD)
- [ ] Domaine acheté et DNS configuré (7 enregistrements A)
- [ ] Ubuntu 22.04 installé et mis à jour
- [ ] Docker et Docker Compose installés
- [ ] Firewall configuré (ports 22, 80, 443)
- [ ] Utilisateur non-root créé
- [ ] Repository cloné sur le VPS
- [ ] Fichier .env créé et rempli (37 variables minimum)
- [ ] Caddyfile édité (domaine remplacé)
- [ ] Images Docker buildées et pushées sur Docker Hub
- [ ] docker-compose.vps.yml mis à jour (images Docker Hub)
- [ ] Services démarrés (infra → backend → frontend → proxy)
- [ ] SSL vérifié (certificats Let's Encrypt actifs)
- [ ] Endpoints testés (API, dashboard, websocket)
- [ ] Monitoring configuré (Grafana, Flower)
- [ ] Backup automatique configuré (crontab)
- [ ] Tests end-to-end réussis (création projet, analyse)

---

**Félicitations ! 🎉 Votre plateforme AI Code Review est maintenant déployée en production !**
