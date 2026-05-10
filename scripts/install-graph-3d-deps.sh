#!/bin/bash

echo "=== Installation des dépendances pour la visualisation 3D du graphe ==="

# Naviguer vers le répertoire dashboard
cd "$(dirname "$0")/../apps/dashboard" || exit 1

echo ""
echo "📦 Installation de @react-three/fiber et @react-three/drei..."
echo ""

# Installer les dépendances avec --legacy-peer-deps pour éviter les conflits
npm install @react-three/fiber@^8.18.6 @react-three/drei@^9.122.4 --legacy-peer-deps

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Dépendances installées avec succès!"
  echo ""
  echo "🚀 Pour démarrer la visualisation 3D:"
  echo "   1. Assurez-vous que Neo4j est en cours d'exécution"
  echo "   2. Démarrez le backend: cd apps/backend && make host-api"
  echo "   3. Démarrez le dashboard: cd apps/dashboard && npm run dev"
  echo "   4. Accédez à http://localhost:3001/dashboard/graph-3d"
  echo ""
else
  echo ""
  echo "❌ Erreur lors de l'installation des dépendances"
  echo "   Essayez manuellement: npm install @react-three/fiber @react-three/drei --legacy-peer-deps"
  echo ""
  exit 1
fi
