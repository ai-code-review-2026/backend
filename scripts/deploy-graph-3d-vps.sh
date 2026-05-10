#!/bin/bash

# Script de déploiement pour la visualisation 3D du graphe sur VPS
# Usage: ./scripts/deploy-graph-3d-vps.sh

set -e  # Exit on error

echo "🚀 Déploiement de la visualisation 3D du graphe sur VPS"
echo "========================================================"
echo ""

# Couleurs pour les messages
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="/root/ai-code-review-platform"
DASHBOARD_PATH="$PROJECT_ROOT/apps/dashboard"
BACKEND_PATH="$PROJECT_ROOT/apps/backend"

echo -e "${YELLOW}1. Navigation vers le répertoire du projet...${NC}"
cd "$PROJECT_ROOT" || exit 1
echo -e "${GREEN}✓ Dans le répertoire: $(pwd)${NC}"
echo ""

echo -e "${YELLOW}2. Pull des dernières modifications depuis GitHub...${NC}"
git fetch origin
git pull origin main
echo -e "${GREEN}✓ Code mis à jour${NC}"
echo ""

echo -e "${YELLOW}3. Vérification des fichiers créés...${NC}"
if [ -f "$DASHBOARD_PATH/components/knowledge-graph-3d.tsx" ]; then
    echo -e "${GREEN}✓ Composant 3D trouvé${NC}"
else
    echo -e "${RED}✗ Composant 3D manquant!${NC}"
    exit 1
fi

if [ -f "$DASHBOARD_PATH/app/dashboard/graph-3d/page.tsx" ]; then
    echo -e "${GREEN}✓ Page dashboard trouvée${NC}"
else
    echo -e "${RED}✗ Page dashboard manquante!${NC}"
    exit 1
fi

if [ -f "$BACKEND_PATH/app/api/http/graph_visualization.py" ]; then
    echo -e "${GREEN}✓ API backend trouvée${NC}"
else
    echo -e "${RED}✗ API backend manquante!${NC}"
    exit 1
fi
echo ""

echo -e "${YELLOW}4. Installation des dépendances frontend...${NC}"
cd "$DASHBOARD_PATH"
npm install @react-three/fiber@^8.18.6 @react-three/drei@^9.122.4 --legacy-peer-deps
echo -e "${GREEN}✓ Dépendances installées${NC}"
echo ""

echo -e "${YELLOW}5. Nettoyage du cache Next.js...${NC}"
rm -rf .next
rm -rf node_modules/.cache
echo -e "${GREEN}✓ Cache nettoyé${NC}"
echo ""

echo -e "${YELLOW}6. Build du frontend Next.js...${NC}"
npm run build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Build réussi${NC}"
else
    echo -e "${RED}✗ Erreur lors du build!${NC}"
    exit 1
fi
echo ""

echo -e "${YELLOW}7. Vérification de Neo4j...${NC}"
if systemctl is-active --quiet neo4j; then
    echo -e "${GREEN}✓ Neo4j est en cours d'exécution${NC}"
else
    echo -e "${YELLOW}⚠ Neo4j n'est pas démarré, tentative de démarrage...${NC}"
    sudo systemctl start neo4j
    sleep 5
    if systemctl is-active --quiet neo4j; then
        echo -e "${GREEN}✓ Neo4j démarré${NC}"
    else
        echo -e "${RED}✗ Impossible de démarrer Neo4j${NC}"
    fi
fi
echo ""

echo -e "${YELLOW}8. Redémarrage du backend (si géré par systemd)...${NC}"
if systemctl list-units --full -all | grep -q "ai-review-backend"; then
    sudo systemctl restart ai-review-backend
    echo -e "${GREEN}✓ Backend redémarré${NC}"
else
    echo -e "${YELLOW}⚠ Service backend non trouvé (systemd), vérifiez manuellement${NC}"
fi
echo ""

echo -e "${YELLOW}9. Redémarrage du frontend...${NC}"
if command -v pm2 &> /dev/null; then
    cd "$DASHBOARD_PATH"
    pm2 restart dashboard || pm2 start npm --name dashboard -- start
    echo -e "${GREEN}✓ Frontend redémarré avec PM2${NC}"
elif systemctl list-units --full -all | grep -q "ai-review-dashboard"; then
    sudo systemctl restart ai-review-dashboard
    echo -e "${GREEN}✓ Frontend redémarré avec systemd${NC}"
else
    echo -e "${YELLOW}⚠ Aucun gestionnaire de processus trouvé${NC}"
    echo -e "${YELLOW}  Démarrez manuellement avec: cd $DASHBOARD_PATH && npm start${NC}"
fi
echo ""

echo -e "${YELLOW}10. Tests de santé...${NC}"
sleep 3

# Test backend
echo -n "Backend health check... "
if curl -s http://localhost:8000/health > /dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

# Test frontend
echo -n "Frontend health check... "
if curl -s http://localhost:3001/ > /dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

# Test nouveau endpoint
echo -n "Graph API health check... "
if curl -s http://localhost:8000/api/v1/graph/stats > /dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi
echo ""

echo "========================================================"
echo -e "${GREEN}✅ Déploiement terminé!${NC}"
echo ""
echo "📍 Accès à la visualisation 3D:"
echo "   http://135.125.100.150:3001/dashboard/graph-3d"
echo ""
echo "🔍 Pour vérifier les logs:"
echo "   Backend:  sudo journalctl -u ai-review-backend -f"
echo "   Frontend: pm2 logs dashboard"
echo ""
echo "📚 Documentation:"
echo "   - Guide technique: docs/GRAPH_3D_VISUALIZATION.md"
echo "   - Guide utilisateur: docs/GRAPH_3D_README.md"
echo ""
