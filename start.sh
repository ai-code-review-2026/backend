#!/bin/bash

################################################################################
# AI Code Review Platform - Script de démarrage VPS
# Usage: ./start.sh
################################################################################

set -e  # Arrêter en cas d'erreur

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Répertoire du script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Fichier docker-compose
COMPOSE_FILE="docker-compose.vps.yml"

################################################################################
# Fonctions utilitaires
################################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

wait_for_service() {
    local service=$1
    local max_wait=$2
    local count=0
    
    log_info "Attente du service $service (max ${max_wait}s)..."
    
    while [ $count -lt $max_wait ]; do
        if docker compose -f $COMPOSE_FILE ps $service | grep -q "Up"; then
            log_success "$service est prêt !"
            return 0
        fi
        sleep 2
        count=$((count + 2))
        echo -n "."
    done
    
    log_error "$service n'a pas démarré dans les temps"
    return 1
}

check_health() {
    local service=$1
    local health=$(docker compose -f $COMPOSE_FILE ps $service --format json | grep -o '"Health":"[^"]*"' | cut -d'"' -f4)
    
    if [ "$health" == "healthy" ]; then
        return 0
    else
        return 1
    fi
}

################################################################################
# Vérifications préalables
################################################################################

log_info "=== Vérifications préalables ==="

# Vérifier que Docker est installé
if ! command -v docker &> /dev/null; then
    log_error "Docker n'est pas installé. Installez-le avec: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

# Vérifier que Docker Compose est installé
if ! docker compose version &> /dev/null; then
    log_error "Docker Compose n'est pas installé"
    exit 1
fi

# Vérifier que le fichier .env existe
if [ ! -f ".env" ]; then
    log_error "Le fichier .env n'existe pas. Copiez .env.example vers .env et remplissez les valeurs"
    exit 1
fi

# Vérifier que le fichier docker-compose existe
if [ ! -f "$COMPOSE_FILE" ]; then
    log_error "Le fichier $COMPOSE_FILE n'existe pas"
    exit 1
fi

log_success "Toutes les vérifications sont passées"

################################################################################
# Pull des images Docker
################################################################################

log_info "=== Pull des dernières images Docker ==="
docker compose -f $COMPOSE_FILE pull

################################################################################
# Démarrage séquentiel des services
################################################################################

log_info "=== Démarrage des services ==="

# Étape 1: Bases de données et infrastructure
log_info "Étape 1/5: Démarrage de l'infrastructure (Postgres, Redis, Neo4j, MinIO)..."
docker compose -f $COMPOSE_FILE up -d postgres redis neo4j minio

# Attendre que les bases de données soient prêtes
wait_for_service "postgres" 60
wait_for_service "redis" 30
wait_for_service "neo4j" 90
wait_for_service "minio" 30

log_success "Infrastructure démarrée"
sleep 10

# Étape 2: Backend API
log_info "Étape 2/5: Démarrage du backend API..."
docker compose -f $COMPOSE_FILE up -d backend

wait_for_service "backend" 60
log_success "Backend API démarré"
sleep 5

# Étape 3: Celery Worker
log_info "Étape 3/5: Démarrage du worker Celery..."
docker compose -f $COMPOSE_FILE up -d worker

wait_for_service "worker" 30
log_success "Worker Celery démarré"
sleep 5

# Étape 4: Frontend (Dashboard + YJS)
log_info "Étape 4/5: Démarrage du frontend (Dashboard + YJS)..."
docker compose -f $COMPOSE_FILE up -d dashboard yjs-server

wait_for_service "dashboard" 90
wait_for_service "yjs-server" 30
log_success "Frontend démarré"
sleep 5

# Étape 5: Reverse Proxy et Monitoring
log_info "Étape 5/5: Démarrage de Caddy et monitoring..."
docker compose -f $COMPOSE_FILE up -d caddy grafana flower pgadmin

wait_for_service "caddy" 30
wait_for_service "grafana" 30
wait_for_service "flower" 30
log_success "Reverse proxy et monitoring démarrés"

################################################################################
# Vérification finale
################################################################################

log_info "=== Vérification finale ==="

# Afficher l'état de tous les services
echo ""
docker compose -f $COMPOSE_FILE ps

echo ""
log_info "Vérification de la santé des services..."

# Compter les services healthy
healthy_count=0
total_count=0

for service in postgres redis neo4j backend; do
    total_count=$((total_count + 1))
    if check_health $service; then
        log_success "$service est healthy"
        healthy_count=$((healthy_count + 1))
    else
        log_warning "$service n'est pas encore healthy (peut prendre quelques minutes)"
    fi
done

echo ""
log_info "Services healthy: $healthy_count/$total_count"

################################################################################
# Affichage des URLs
################################################################################

# Récupérer les domaines depuis .env
source .env

echo ""
log_success "=== Démarrage terminé ! ==="
echo ""
log_info "URLs d'accès:"
echo "  🌐 Dashboard:   https://${APP_DOMAIN:-votre-domaine.com}"
echo "  🔌 API:         https://${API_DOMAIN:-api.votre-domaine.com}/docs"
echo "  📊 Grafana:     https://${GRAFANA_DOMAIN:-grafana.votre-domaine.com}"
echo "  🌺 Flower:      https://${FLOWER_DOMAIN:-flower.votre-domaine.com}"
echo "  🗄️  MinIO:       https://${MINIO_DOMAIN:-minio.votre-domaine.com}"
echo "  💾 pgAdmin:     https://pgadmin.${APP_DOMAIN:-votre-domaine.com}"
echo ""
log_info "Commandes utiles:"
echo "  Voir les logs:      docker compose -f $COMPOSE_FILE logs -f [service]"
echo "  Redémarrer:         docker compose -f $COMPOSE_FILE restart [service]"
echo "  Arrêter:            ./stop.sh"
echo "  Statut:             docker compose -f $COMPOSE_FILE ps"
echo ""
log_warning "Si SSL ne fonctionne pas, vérifiez les DNS et attendez quelques minutes"
log_warning "Let's Encrypt peut prendre 1-2 minutes pour générer les certificats"
echo ""
