#!/bin/bash

################################################################################
# AI Code Review Platform - Script de restauration depuis backup
# Usage: ./restore.sh /path/to/backup.tar.gz
################################################################################

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

################################################################################
# Vérifications
################################################################################

if [ $# -eq 0 ]; then
    log_error "Usage: $0 /path/to/backup.tar.gz"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    log_error "Le fichier de backup n'existe pas: $BACKUP_FILE"
    exit 1
fi

log_info "=== Restauration depuis backup ==="
log_info "Fichier: $BACKUP_FILE"

# Confirmation
log_warning "ATTENTION: Cette opération va ÉCRASER les données actuelles !"
read -p "Êtes-vous ABSOLUMENT sûr de vouloir continuer ? (yes/NO) " -r
echo
if [[ ! $REPLY == "yes" ]]; then
    log_info "Restauration annulée"
    exit 0
fi

cd "$SCRIPT_DIR"

################################################################################
# Extraction du backup
################################################################################

RESTORE_DIR="/tmp/restore_$(date +%s)"
mkdir -p "$RESTORE_DIR"

log_info "Extraction du backup..."
tar -xzf "$BACKUP_FILE" -C "$RESTORE_DIR" --strip-components=1

if [ ! -f "$RESTORE_DIR/postgres.sql" ]; then
    log_error "Backup invalide: postgres.sql manquant"
    rm -rf "$RESTORE_DIR"
    exit 1
fi

log_success "Backup extrait dans $RESTORE_DIR"

################################################################################
# Arrêt des services applicatifs
################################################################################

log_info "Arrêt des services applicatifs..."
docker compose -f $COMPOSE_FILE stop backend worker dashboard yjs-server caddy

################################################################################
# Restauration PostgreSQL
################################################################################

log_info "Restauration PostgreSQL..."

if [ -f "$RESTORE_DIR/postgres.sql" ]; then
    # S'assurer que Postgres est actif
    docker compose -f $COMPOSE_FILE start postgres
    sleep 5
    
    # Drop et recréer la base
    log_warning "Suppression de la base existante..."
    docker compose -f $COMPOSE_FILE exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS ai_code_review;"
    docker compose -f $COMPOSE_FILE exec -T postgres psql -U postgres -c "CREATE DATABASE ai_code_review;"
    
    # Restaurer
    log_info "Restauration des données..."
    docker compose -f $COMPOSE_FILE exec -T postgres psql -U postgres ai_code_review < "$RESTORE_DIR/postgres.sql"
    
    log_success "PostgreSQL restauré"
else
    log_error "postgres.sql non trouvé dans le backup"
fi

################################################################################
# Restauration Neo4j
################################################################################

log_info "Restauration Neo4j..."

if [ -f "$RESTORE_DIR/neo4j.dump" ]; then
    # Arrêter Neo4j
    docker compose -f $COMPOSE_FILE stop neo4j
    
    # Copier le dump dans le conteneur
    NEO4J_CONTAINER=$(docker compose -f $COMPOSE_FILE ps -q neo4j)
    
    # Démarrer temporairement pour créer le conteneur
    docker compose -f $COMPOSE_FILE start neo4j
    sleep 10
    docker compose -f $COMPOSE_FILE stop neo4j
    
    # Copier le dump
    docker cp "$RESTORE_DIR/neo4j.dump" $NEO4J_CONTAINER:/var/lib/neo4j/neo4j.dump
    
    # Restaurer
    docker compose -f $COMPOSE_FILE run --rm neo4j neo4j-admin database load neo4j --from-path=/var/lib/neo4j --overwrite-destination=true
    
    log_success "Neo4j restauré"
else
    log_warning "neo4j.dump non trouvé dans le backup"
fi

################################################################################
# Restauration MinIO
################################################################################

log_info "Restauration MinIO..."

if [ -d "$RESTORE_DIR/minio" ]; then
    # S'assurer que MinIO est actif
    docker compose -f $COMPOSE_FILE start minio
    sleep 10
    
    # Restaurer avec mc
    docker run --rm \
        --network ai-review-network \
        -e MINIO_ENDPOINT="minio:9000" \
        -e MINIO_ACCESS_KEY="${MINIO_ROOT_USER:-minioadmin}" \
        -e MINIO_SECRET_KEY="${MINIO_ROOT_PASSWORD:-minioadmin}" \
        -v "$RESTORE_DIR/minio:/restore" \
        minio/mc sh -c "
            mc alias set myminio http://minio:9000 \$MINIO_ACCESS_KEY \$MINIO_SECRET_KEY &&
            mc mb myminio/ai-review-artifacts --ignore-existing &&
            mc mirror --overwrite /restore myminio/ai-review-artifacts
        "
    
    log_success "MinIO restauré"
else
    log_warning "Dossier minio/ non trouvé dans le backup"
fi

################################################################################
# Restauration Redis
################################################################################

log_info "Restauration Redis..."

if [ -f "$RESTORE_DIR/redis.rdb" ]; then
    docker compose -f $COMPOSE_FILE stop redis
    
    # Copier le dump
    REDIS_CONTAINER=$(docker compose -f $COMPOSE_FILE ps -q redis)
    docker cp "$RESTORE_DIR/redis.rdb" $REDIS_CONTAINER:/data/dump.rdb
    
    docker compose -f $COMPOSE_FILE start redis
    log_success "Redis restauré"
else
    log_warning "redis.rdb non trouvé dans le backup"
fi

################################################################################
# Restauration configuration (optionnel)
################################################################################

if [ -f "$RESTORE_DIR/.env.backup" ]; then
    log_warning "Fichier .env trouvé dans le backup"
    read -p "Voulez-vous restaurer le .env ? (y/N) " -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cp "$RESTORE_DIR/.env.backup" .env
        log_success "Fichier .env restauré"
    fi
fi

################################################################################
# Redémarrage complet
################################################################################

log_info "Redémarrage de tous les services..."

# Nettoyer le répertoire temporaire
rm -rf "$RESTORE_DIR"

# Redémarrer dans le bon ordre
docker compose -f $COMPOSE_FILE start postgres redis neo4j minio
sleep 15

docker compose -f $COMPOSE_FILE start backend worker
sleep 10

docker compose -f $COMPOSE_FILE start dashboard yjs-server
sleep 5

docker compose -f $COMPOSE_FILE start caddy grafana flower

################################################################################
# Vérification
################################################################################

log_info "Vérification des services..."
sleep 10

docker compose -f $COMPOSE_FILE ps

log_success "=== Restauration terminée ==="
log_warning "Vérifiez que tous les services sont 'Up' et 'healthy'"
log_info "Testez l'accès à l'application avant de passer en production"
echo ""
