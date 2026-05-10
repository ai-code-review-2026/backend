# PowerShell Script pour déployer sur VPS
# Usage: .\deploy-vps.ps1

$VPS_IP = "135.125.100.150"
$VPS_USER = "root"
$VPS_PASSWORD = "DevoraPass2026"
$PROJECT_PATH = "/opt/ai-code-review-platform"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Déploiement sur VPS: $VPS_IP" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Installation de plink si nécessaire (partie de PuTTY)
Write-Host "Note: Ce script nécessite plink.exe (PuTTY)" -ForegroundColor Yellow
Write-Host "Téléchargez depuis: https://www.putty.org/" -ForegroundColor Yellow
Write-Host ""

# Commandes à exécuter sur le VPS
$commands = @"
# Étape 1: Installation des dépendances
echo "Étape 1/8: Installation des dépendances..."
apt-get update
apt-get install -y git curl

# Étape 2: Installation de Docker
echo "Étape 2/8: Installation de Docker..."
command -v docker || curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Étape 3: Installation de Docker Compose
echo "Étape 3/8: Installation de Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-linux-x86_64" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# Étape 4: Installation d'Ollama
echo "Étape 4/8: Installation d'Ollama..."
command -v ollama || curl -fsSL https://ollama.com/install.sh | sh
systemctl enable ollama || true
systemctl start ollama || true
sleep 5
ollama list | grep -q deepseek-coder || ollama pull deepseek-coder:6.7b

# Étape 5: Clone/Update du repository
echo "Étape 5/8: Clone/Update du repository..."
mkdir -p /opt
if [ -d "$PROJECT_PATH/.git" ]; then
    echo "Repository existe, pull des changements..."
    cd $PROJECT_PATH
    git fetch origin
    git reset --hard origin/main
else
    echo "Clone du repository..."
    cd /opt
    git clone https://github.com/ai-code-review-2026/backend.git ai-code-review-platform
    cd $PROJECT_PATH
fi

# Étape 6: Arrêt des services existants
echo "Étape 6/8: Arrêt des services existants..."
cd $PROJECT_PATH
docker compose -f docker-compose.local.yml down || true

# Étape 7: Création des répertoires de données
echo "Étape 7/8: Création des répertoires de données..."
mkdir -p postgres_data redis_data neo4j_data minio_data qdrant_data langfuse_db_data

# Étape 8: Démarrage des services
echo "Étape 8/8: Démarrage des services..."
docker compose -f docker-compose.local.yml --profile llm-observability up -d

# Attente du démarrage
echo "Attente du démarrage des services (30s)..."
sleep 30

# Vérification de la santé
echo ""
echo "Vérification de la santé des services..."
if curl -f http://localhost:8000/health > /dev/null 2>&1; then
    echo "✓ Backend API est en ligne"
else
    echo "✗ Backend API ne répond pas"
fi

if curl -f http://localhost:3001 > /dev/null 2>&1; then
    echo "✓ Dashboard est en ligne"
else
    echo "✗ Dashboard ne répond pas"
fi

echo ""
echo "========================================="
echo "Déploiement terminé!"
echo "========================================="
echo ""
echo "URLs d'accès:"
echo "  - Backend API:         http://135.125.100.150:8000"
echo "  - Backend Health:      http://135.125.100.150:8000/health"
echo "  - Backend Docs:        http://135.125.100.150:8000/docs"
echo "  - Dashboard:           http://135.125.100.150:3001"
echo "  - Models Hub:          http://135.125.100.150:3001/models"
echo "  - Prompt Observatory:  http://135.125.100.150:3001/observatory"
echo "  - GraphRAG Explorer:   http://135.125.100.150:3001/graphrag-explorer"
echo "  - AI Review Center:    http://135.125.100.150:3001/ai-review"
echo "  - Langfuse:            http://135.125.100.150:3100"
echo "  - Jaeger:              http://135.125.100.150:16686"
echo "  - Prometheus:          http://135.125.100.150:9090"
echo "  - MinIO Console:       http://135.125.100.150:9001"
echo ""
echo "Commandes utiles:"
echo "  docker compose -f docker-compose.local.yml logs -f backend"
echo "  docker compose -f docker-compose.local.yml logs -f worker"
echo "  docker compose -f docker-compose.local.yml ps"
echo "  docker compose -f docker-compose.local.yml restart"
echo ""
"@

# Sauvegarder les commandes dans un fichier temporaire
$tempScript = "$env:TEMP\deploy-vps-commands.sh"
$commands | Out-File -FilePath $tempScript -Encoding ASCII

Write-Host "Script de déploiement créé: $tempScript" -ForegroundColor Green
Write-Host ""
Write-Host "Étapes manuelles à suivre:" -ForegroundColor Yellow
Write-Host "1. Utilisez PuTTY ou un client SSH pour vous connecter:" -ForegroundColor White
Write-Host "   ssh root@$VPS_IP" -ForegroundColor Cyan
Write-Host "   Mot de passe: $VPS_PASSWORD" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Une fois connecté, copiez le contenu du fichier:" -ForegroundColor White
Write-Host "   $tempScript" -ForegroundColor Cyan
Write-Host ""
Write-Host "3. Ou exécutez ces commandes une par une:" -ForegroundColor White
Write-Host ""

# Afficher les commandes
Write-Host $commands -ForegroundColor Gray

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Alternative: Copier le fichier .env" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Utilisez WinSCP ou scp pour copier .env.vps vers le VPS:" -ForegroundColor White
Write-Host "pscp.exe .env.vps root@${VPS_IP}:${PROJECT_PATH}/.env" -ForegroundColor Cyan
Write-Host ""
