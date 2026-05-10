#!/bin/bash

# Script de déploiement automatique sur VPS
# Usage: ./deploy-to-vps.sh

set -e

VPS_IP="135.125.100.150"
VPS_USER="root"
VPS_PASSWORD="DevoraPass2026"
PROJECT_PATH="/opt/ai-code-review-platform"

echo "========================================="
echo "Déploiement sur VPS: $VPS_IP"
echo "========================================="

# Fonction pour exécuter des commandes sur le VPS
ssh_exec() {
    sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" "$1"
}

# Fonction pour copier des fichiers vers le VPS
scp_copy() {
    sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no -r "$1" "$VPS_USER@$VPS_IP:$2"
}

echo ""
echo "Étape 1/10: Vérification de la connexion SSH..."
if ssh_exec "echo 'Connexion réussie'"; then
    echo "✓ Connexion SSH établie"
else
    echo "✗ Échec de la connexion SSH"
    exit 1
fi

echo ""
echo "Étape 2/10: Vérification/Création du répertoire projet..."
ssh_exec "mkdir -p $PROJECT_PATH"
echo "✓ Répertoire prêt"

echo ""
echo "Étape 3/10: Installation de Git si nécessaire..."
ssh_exec "command -v git >/dev/null 2>&1 || apt-get update && apt-get install -y git"
echo "✓ Git disponible"

echo ""
echo "Étape 4/10: Clone/Pull du repository..."
if ssh_exec "[ -d $PROJECT_PATH/.git ]"; then
    echo "Repository existe, pull des changements..."
    ssh_exec "cd $PROJECT_PATH && git fetch origin && git reset --hard origin/main"
else
    echo "Clone du repository..."
    ssh_exec "cd /opt && git clone https://github.com/ai-code-review-2026/backend.git ai-code-review-platform"
fi
echo "✓ Code source à jour"

echo ""
echo "Étape 5/10: Vérification des dépendances système..."
ssh_exec "command -v docker >/dev/null 2>&1 || curl -fsSL https://get.docker.com | sh"
ssh_exec "command -v docker-compose >/dev/null 2>&1 || apt-get install -y docker-compose"
echo "✓ Docker installé"

echo ""
echo "Étape 6/10: Copie du fichier .env..."
if [ -f ".env" ]; then
    scp_copy ".env" "$PROJECT_PATH/"
    echo "✓ Fichier .env copié"
else
    echo "⚠ Fichier .env non trouvé localement, vérifier sur le VPS"
fi

echo ""
echo "Étape 7/10: Installation d'Ollama..."
ssh_exec "command -v ollama >/dev/null 2>&1 || (curl -fsSL https://ollama.com/install.sh | sh)"
ssh_exec "systemctl is-active ollama >/dev/null 2>&1 || (systemctl enable ollama && systemctl start ollama)"
ssh_exec "ollama list | grep -q deepseek-coder || ollama pull deepseek-coder:6.7b"
echo "✓ Ollama configuré avec deepseek-coder:6.7b"

echo ""
echo "Étape 8/10: Arrêt des services existants..."
ssh_exec "cd $PROJECT_PATH && docker compose -f docker-compose.local.yml down || true"
echo "✓ Services arrêtés"

echo ""
echo "Étape 9/10: Démarrage des services (stack complète avec observabilité)..."
ssh_exec "cd $PROJECT_PATH && docker compose -f docker-compose.local.yml --profile llm-observability up -d"
echo "✓ Services démarrés"

echo ""
echo "Étape 10/10: Attente du démarrage et vérification de la santé..."
sleep 15
if ssh_exec "curl -f http://localhost:8000/health >/dev/null 2>&1"; then
    echo "✓ Backend API est en ligne"
else
    echo "⚠ Backend API ne répond pas encore, vérifier les logs"
fi

if ssh_exec "curl -f http://localhost:3001 >/dev/null 2>&1"; then
    echo "✓ Dashboard est en ligne"
else
    echo "⚠ Dashboard ne répond pas encore, vérifier les logs"
fi

echo ""
echo "========================================="
echo "Déploiement terminé!"
echo "========================================="
echo ""
echo "URLs d'accès:"
echo "  - Backend API:           http://$VPS_IP:8000"
echo "  - Dashboard:             http://$VPS_IP:3001"
echo "  - Models Hub:            http://$VPS_IP:3001/models"
echo "  - Prompt Observatory:    http://$VPS_IP:3001/observatory"
echo "  - GraphRAG Explorer:     http://$VPS_IP:3001/graphrag-explorer"
echo "  - AI Review Center:      http://$VPS_IP:3001/ai-review"
echo "  - Langfuse (LLMOps):     http://$VPS_IP:3100"
echo "  - Jaeger (Tracing):      http://$VPS_IP:16686"
echo "  - Prometheus (Metrics):  http://$VPS_IP:9090"
echo ""
echo "Commandes utiles:"
echo "  - Voir les logs backend:  ssh root@$VPS_IP 'cd $PROJECT_PATH && docker compose -f docker-compose.local.yml logs -f backend'"
echo "  - Voir les logs worker:   ssh root@$VPS_IP 'cd $PROJECT_PATH && docker compose -f docker-compose.local.yml logs -f worker'"
echo "  - Voir tous les logs:     ssh root@$VPS_IP 'cd $PROJECT_PATH && docker compose -f docker-compose.local.yml logs -f'"
echo "  - Redémarrer:             ssh root@$VPS_IP 'cd $PROJECT_PATH && docker compose -f docker-compose.local.yml restart'"
echo "  - Arrêter:                ssh root@$VPS_IP 'cd $PROJECT_PATH && docker compose -f docker-compose.local.yml down'"
echo ""
