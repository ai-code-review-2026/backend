#!/bin/bash
# scripts/start_dev.sh
# Script de démarrage intelligent pour l'environnement de développement
#
# Usage:
#   ./scripts/start_dev.sh minimal    # Seulement DB + Redis + Qdrant
#   ./scripts/start_dev.sh frontend   # Frontend Next.js uniquement
#   ./scripts/start_dev.sh backend    # Backend complet mais optimisé
#   ./scripts/start_dev.sh full       # Stack complète (comme avant)

set -e

MODE=${1:-minimal}

echo "🚀 Démarrage du mode: $MODE"
echo ""

case $MODE in
  "minimal")
    echo "📦 Lancement de l'infrastructure minimale..."
    make up-minimal
    echo ""
    echo "✅ Infrastructure prête !"
    echo "💡 Pour continuer:"
    echo "   - Backend: make host-migrate && make host-api"
    echo "   - Frontend: cd apps/dashboard && npm run dev"
    ;;

  "frontend")
    echo "🎨 Lancement du frontend uniquement..."
    cd apps/dashboard
    npm install
    npm run dev
    ;;

  "backend")
    echo "⚡ Lancement du backend optimisé..."
    make up-minimal
    echo "⏳ Attente de l'infrastructure..."
    sleep 5
    make host-migrate
    make host-api &
    echo ""
    echo "✅ Backend démarré sur http://localhost:8000"
    ;;

  "full")
    echo "🔥 Lancement de la stack complète..."
    echo "⚠️  Attention: Consomme beaucoup de ressources !"
    make up
    echo "⏳ Attente de l'infrastructure..."
    sleep 10
    make migrate
    ;;

  *)
    echo "❌ Mode non reconnu: $MODE"
    echo ""
    echo "Modes disponibles:"
    echo "  minimal   - Infrastructure de base (DB, Redis, Qdrant)"
    echo "  frontend  - Frontend Next.js uniquement"
    echo "  backend   - Backend optimisé avec infra minimale"
    echo "  full      - Stack complète (gourmand en ressources)"
    exit 1
    ;;
esac

echo ""
echo "🎉 Démarrage terminé !"