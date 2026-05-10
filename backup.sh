#!/bin/bash

################################################################################
# AI Code Review Platform - Script de backup automatique
# Usage: ./backup.sh
# Crontab: 0 3 * * * /home/aireviewer/ai-code-review-platform/backup.sh
################################################################################

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/home/aireviewer/backups}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_BASE_DIR/$DATE"
COMPOSE_FILE="docker-compose.vps.yml"
RETENTION_DAYS=${RETENTION_DAYS:-7}

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

################################################################################
# Préparation
################################################################################

log_info "=== Début du backup ==="
log_info "Destination: $BACKUP_DIR"

# Créer le répertoire de backup
mkdir -p "$BACKUP_DIR"

cd "$SCRIPT_DIR"

################################################################################
# Backup PostgreSQL
################################################################################

log_info "Backup PostgreSQL..."

if docker compose -f $COMPOSE_FILE ps postgres | grep -q "Up"; then
    docker compose -f $COMPOSE_FILE exec -T postgres pg_dump -U postgres ai_code_review > "$BACKUP_DIR/postgres.sql"
    
    # Vérifier que le backup n'est pas vide
    if [ -s "$BACKUP_DIR/postgres.sql" ]; then
        log_success "PostgreSQL backup réussi ($(du -sh "$BACKUP_DIR/postgres.sql" | cut -f1))"
    else
        log_error "PostgreSQL backup vide"
        exit 1
    fi
else
    log_error "PostgreSQL n'est pas actif"
    exit 1
fi

################################################################################
# Backup Neo4j
################################################################################

log_info "Backup Neo4j..."

if docker compose -f $COMPOSE_FILE ps neo4j | grep -q "Up"; then
    # Créer le backup dans le conteneur
    docker compose -f $COMPOSE_FILE exec -T neo4j neo4j-admin database dump neo4j --to-path=/backups --overwrite-destination=true
    
    # Copier depuis le conteneur
    NEO4J_CONTAINER=$(docker compose -f $COMPOSE_FILE ps -q neo4j)
    docker cp $NEO4J_CONTAINER:/backups/neo4j.dump "$BACKUP_DIR/neo4j.dump"
    
    if [ -s "$BACKUP_DIR/neo4j.dump" ]; then
        log_success "Neo4j backup réussi ($(du -sh "$BACKUP_DIR/neo4j.dump" | cut -f1))"
    else
        log_error "Neo4j backup vide"
    fi
else
    log_error "Neo4j n'est pas actif"
fi

################################################################################
# Backup MinIO (S3 Objects)
################################################################################

log_info "Backup MinIO..."

if docker compose -f $COMPOSE_FILE ps minio | grep -q "Up"; then
    # Utiliser MinIO Client pour backup
    docker run --rm \
        --network ai-review-network \
        -e MINIO_ENDPOINT="minio:9000" \
        -e MINIO_ACCESS_KEY="${MINIO_ROOT_USER:-minioadmin}" \
        -e MINIO_SECRET_KEY="${MINIO_ROOT_PASSWORD:-minioadmin}" \
        -v "$BACKUP_DIR:/backup" \
        minio/mc sh -c "
            mc alias set myminio http://minio:9000 \$MINIO_ACCESS_KEY \$MINIO_SECRET_KEY &&
            mc mirror --overwrite myminio/ai-review-artifacts /backup/minio
        " 2>/dev/null || log_error "MinIO backup échoué (le bucket peut être vide)"
    
    if [ -d "$BACKUP_DIR/minio" ]; then
        log_success "MinIO backup réussi ($(du -sh "$BACKUP_DIR/minio" | cut -f1))"
    else
        log_error "MinIO backup vide ou échoué"
    fi
else
    log_error "MinIO n'est pas actif"
fi

################################################################################
# Backup Redis (optionnel - données en cache)
################################################################################

log_info "Backup Redis..."

if docker compose -f $COMPOSE_FILE ps redis | grep -q "Up"; then
    docker compose -f $COMPOSE_FILE exec -T redis redis-cli SAVE
    docker cp $(docker compose -f $COMPOSE_FILE ps -q redis):/data/dump.rdb "$BACKUP_DIR/redis.rdb" 2>/dev/null || true
    
    if [ -f "$BACKUP_DIR/redis.rdb" ]; then
        log_success "Redis backup réussi ($(du -sh "$BACKUP_DIR/redis.rdb" | cut -f1))"
    fi
fi

################################################################################
# Backup fichiers de configuration
################################################################################

log_info "Backup configuration..."

# Copier .env (sans les secrets en clair si possible)
if [ -f ".env" ]; then
    cp .env "$BACKUP_DIR/.env.backup"
    log_success "Configuration .env sauvegardée"
fi

# Copier docker-compose
cp $COMPOSE_FILE "$BACKUP_DIR/$COMPOSE_FILE"
cp Caddyfile "$BACKUP_DIR/Caddyfile"

################################################################################
# Compression
################################################################################

log_info "Compression du backup..."

cd "$BACKUP_BASE_DIR"
tar -czf "$DATE.tar.gz" "$DATE"

# Vérifier la compression
if [ -f "$DATE.tar.gz" ]; then
    BACKUP_SIZE=$(du -sh "$DATE.tar.gz" | cut -f1)
    log_success "Backup compressé: $DATE.tar.gz ($BACKUP_SIZE)"
    
    # Supprimer le répertoire non compressé
    rm -rf "$DATE"
else
    log_error "Compression échouée"
    exit 1
fi

################################################################################
# Nettoyage des anciens backups
################################################################################

log_info "Nettoyage des backups de plus de $RETENTION_DAYS jours..."

find "$BACKUP_BASE_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete

REMAINING_BACKUPS=$(find "$BACKUP_BASE_DIR" -name "*.tar.gz" | wc -l)
log_info "Backups restants: $REMAINING_BACKUPS"

################################################################################
# Résumé
################################################################################

log_success "=== Backup terminé ==="
log_info "Fichier: $BACKUP_BASE_DIR/$DATE.tar.gz"
log_info "Taille: $BACKUP_SIZE"
log_info "Contenu:"
echo "  - PostgreSQL: postgres.sql"
echo "  - Neo4j: neo4j.dump"
echo "  - MinIO: minio/"
echo "  - Redis: redis.rdb"
echo "  - Config: .env.backup, $COMPOSE_FILE, Caddyfile"

################################################################################
# Upload vers stockage distant (optionnel)
################################################################################

# Décommenter pour activer l'upload S3/Backblaze
# log_info "Upload vers S3..."
# aws s3 cp "$BACKUP_BASE_DIR/$DATE.tar.gz" s3://votre-bucket/backups/ --storage-class GLACIER
# log_success "Upload S3 terminé"

# Décommenter pour activer rsync vers serveur distant
# log_info "Upload vers serveur distant..."
# rsync -avz "$BACKUP_BASE_DIR/$DATE.tar.gz" user@backup-server:/backups/
# log_success "Upload rsync terminé"

exit 0
