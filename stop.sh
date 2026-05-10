#!/bin/bash

################################################################################
# AI Code Review Platform - Script d'arrêt VPS
# Usage: ./stop.sh
################################################################################

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="docker-compose.vps.yml"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

################################################################################
# Arrêt des services
################################################################################

log_info "=== Arrêt de la plateforme AI Code Review ==="

# Demander confirmation
read -p "Êtes-vous sûr de vouloir arrêter tous les services ? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Arrêt annulé"
    exit 0
fi

# Arrêt séquentiel (inverse du démarrage)
log_info "Arrêt du reverse proxy et monitoring..."
docker compose -f $COMPOSE_FILE stop caddy grafana flower pgadmin

log_info "Arrêt du frontend..."
docker compose -f $COMPOSE_FILE stop dashboard yjs-server

log_info "Arrêt du worker..."
docker compose -f $COMPOSE_FILE stop worker

log_info "Arrêt du backend..."
docker compose -f $COMPOSE_FILE stop backend

log_info "Arrêt de l'infrastructure..."
docker compose -f $COMPOSE_FILE stop postgres redis neo4j minio

log_success "Tous les services sont arrêtés"

# Option pour supprimer les conteneurs
read -p "Voulez-vous aussi supprimer les conteneurs ? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_warning "Suppression des conteneurs (les données persistent dans les volumes)..."
    docker compose -f $COMPOSE_FILE down
    log_success "Conteneurs supprimés"
else
    log_info "Conteneurs conservés (utilisez 'docker compose -f $COMPOSE_FILE down' pour les supprimer)"
fi

echo ""
log_info "Pour redémarrer: ./start.sh"
echo ""
