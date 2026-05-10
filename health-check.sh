#!/bin/bash

################################################################################
# AI Code Review Platform - Script de monitoring et healthcheck
# Usage: ./health-check.sh
# Crontab: */5 * * * * /home/aireviewer/ai-code-review-platform/health-check.sh
################################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="docker-compose.vps.yml"
LOG_FILE="/var/log/ai-review-health.log"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

cd "$SCRIPT_DIR"

# Sourcer les variables .env
if [ -f .env ]; then
    source .env
fi

################################################################################
# Vérification des conteneurs
################################################################################

log_info "=== Health Check des Services ==="

SERVICES=("postgres" "redis" "neo4j" "minio" "backend" "worker" "dashboard" "yjs-server" "caddy")
CRITICAL_SERVICES=("postgres" "redis" "backend")

ALL_HEALTHY=true
CRITICAL_DOWN=false

for service in "${SERVICES[@]}"; do
    if docker compose -f $COMPOSE_FILE ps $service | grep -q "Up"; then
        # Vérifier le health status si disponible
        HEALTH=$(docker compose -f $COMPOSE_FILE ps $service --format json 2>/dev/null | grep -o '"Health":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
        
        if [ "$HEALTH" == "healthy" ] || [ "$HEALTH" == "unknown" ]; then
            log_success "$service est UP"
        else
            log_warning "$service est UP mais status: $HEALTH"
            ALL_HEALTHY=false
        fi
    else
        log_error "$service est DOWN"
        ALL_HEALTHY=false
        
        # Vérifier si c'est un service critique
        if [[ " ${CRITICAL_SERVICES[@]} " =~ " ${service} " ]]; then
            CRITICAL_DOWN=true
        fi
    fi
done

################################################################################
# Vérification des endpoints HTTP
################################################################################

log_info "Vérification des endpoints..."

# Backend API health
if [ -n "$API_DOMAIN" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://${API_DOMAIN}/health || echo "000")
    if [ "$HTTP_CODE" == "200" ]; then
        log_success "API health endpoint: OK ($HTTP_CODE)"
    else
        log_error "API health endpoint: FAIL ($HTTP_CODE)"
        ALL_HEALTHY=false
    fi
fi

# Dashboard
if [ -n "$APP_DOMAIN" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://${APP_DOMAIN} || echo "000")
    if [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "307" ] || [ "$HTTP_CODE" == "302" ]; then
        log_success "Dashboard: OK ($HTTP_CODE)"
    else
        log_error "Dashboard: FAIL ($HTTP_CODE)"
        ALL_HEALTHY=false
    fi
fi

################################################################################
# Vérification de la connexion aux bases de données
################################################################################

log_info "Vérification des bases de données..."

# PostgreSQL
PG_CHECK=$(docker compose -f $COMPOSE_FILE exec -T postgres pg_isready -U postgres 2>&1 || echo "FAIL")
if echo "$PG_CHECK" | grep -q "accepting connections"; then
    log_success "PostgreSQL: connexions acceptées"
else
    log_error "PostgreSQL: $PG_CHECK"
    ALL_HEALTHY=false
fi

# Redis
REDIS_CHECK=$(docker compose -f $COMPOSE_FILE exec -T redis redis-cli ping 2>&1 || echo "FAIL")
if [ "$REDIS_CHECK" == "PONG" ]; then
    log_success "Redis: PONG"
else
    log_error "Redis: $REDIS_CHECK"
    ALL_HEALTHY=false
fi

# Neo4j (optionnel)
NEO4J_CHECK=$(docker compose -f $COMPOSE_FILE exec -T neo4j cypher-shell "RETURN 1" -u neo4j -p "${NEO4J_PASSWORD}" 2>&1 || echo "FAIL")
if echo "$NEO4J_CHECK" | grep -q "1"; then
    log_success "Neo4j: connexion OK"
else
    log_warning "Neo4j: $NEO4J_CHECK"
fi

################################################################################
# Vérification de l'espace disque
################################################################################

log_info "Vérification espace disque..."

DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')

if [ "$DISK_USAGE" -lt 80 ]; then
    log_success "Espace disque: ${DISK_USAGE}% utilisé"
elif [ "$DISK_USAGE" -lt 90 ]; then
    log_warning "Espace disque: ${DISK_USAGE}% utilisé (attention)"
else
    log_error "Espace disque: ${DISK_USAGE}% utilisé (CRITIQUE)"
    ALL_HEALTHY=false
fi

################################################################################
# Vérification mémoire
################################################################################

log_info "Vérification mémoire..."

MEM_USAGE=$(free | awk 'NR==2 {printf "%.0f", $3*100/$2}')

if [ "$MEM_USAGE" -lt 85 ]; then
    log_success "Mémoire: ${MEM_USAGE}% utilisée"
elif [ "$MEM_USAGE" -lt 95 ]; then
    log_warning "Mémoire: ${MEM_USAGE}% utilisée (attention)"
else
    log_error "Mémoire: ${MEM_USAGE}% utilisée (CRITIQUE)"
fi

################################################################################
# Vérification SSL (Caddy)
################################################################################

if [ -n "$APP_DOMAIN" ]; then
    log_info "Vérification certificat SSL..."
    
    SSL_EXPIRY=$(echo | openssl s_client -servername ${APP_DOMAIN} -connect ${APP_DOMAIN}:443 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
    
    if [ -n "$SSL_EXPIRY" ]; then
        DAYS_LEFT=$(( ($(date -d "$SSL_EXPIRY" +%s) - $(date +%s)) / 86400 ))
        
        if [ "$DAYS_LEFT" -gt 30 ]; then
            log_success "Certificat SSL valide: expire dans ${DAYS_LEFT} jours"
        elif [ "$DAYS_LEFT" -gt 7 ]; then
            log_warning "Certificat SSL expire dans ${DAYS_LEFT} jours"
        else
            log_error "Certificat SSL expire dans ${DAYS_LEFT} jours (URGENT)"
        fi
    else
        log_warning "Impossible de vérifier le certificat SSL"
    fi
fi

################################################################################
# Statistiques Docker
################################################################################

log_info "Statistiques conteneurs:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" | tee -a "$LOG_FILE"

################################################################################
# Actions automatiques
################################################################################

if [ "$CRITICAL_DOWN" = true ]; then
    log_error "Un service critique est DOWN, tentative de redémarrage..."
    
    for service in "${CRITICAL_SERVICES[@]}"; do
        if ! docker compose -f $COMPOSE_FILE ps $service | grep -q "Up"; then
            log_info "Redémarrage de $service..."
            docker compose -f $COMPOSE_FILE restart $service
            sleep 10
        fi
    done
    
    # Notification (décommenter pour activer)
    # curl -X POST "https://hooks.slack.com/services/XXX" \
    #   -H 'Content-Type: application/json' \
    #   -d '{"text":"⚠️ AI Review: Service critique DOWN, redémarrage automatique effectué"}'
fi

################################################################################
# Résumé
################################################################################

echo ""
if [ "$ALL_HEALTHY" = true ]; then
    log_success "=== Tous les services sont opérationnels ==="
    exit 0
else
    log_warning "=== Certains services ont des problèmes ==="
    log_info "Voir les logs: docker compose -f $COMPOSE_FILE logs [service]"
    exit 1
fi
