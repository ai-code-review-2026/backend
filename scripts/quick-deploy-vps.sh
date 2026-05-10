#!/bin/bash

# 🚀 Script de déploiement rapide - Copier-coller dans le terminal VPS
# Ce script résout l'erreur 404 sur /dashboard/graph-3d

echo "🔧 Déploiement de la visualisation 3D du graphe..."
echo ""

# 1. Aller dans le répertoire du projet
cd /root/ai-code-review-platform || exit 1
echo "✓ Dans le projet"

# 2. Pull les modifications
echo "📥 Mise à jour du code..."
git pull origin main
echo ""

# 3. Vérifier les fichiers
echo "🔍 Vérification des fichiers..."
if [ -f "apps/dashboard/app/dashboard/graph-3d/page.tsx" ]; then
    echo "✓ Page trouvée"
else
    echo "✗ Page manquante!"
    exit 1
fi

# 4. Installer les dépendances
echo "📦 Installation des dépendances..."
cd apps/dashboard
npm install @react-three/fiber@^8.18.6 @react-three/drei@^9.122.4 --legacy-peer-deps
echo ""

# 5. Nettoyer et rebuild
echo "🏗️ Build du frontend..."
rm -rf .next
npm run build
echo ""

# 6. Redémarrer
echo "🔄 Redémarrage..."
pm2 restart dashboard 2>/dev/null || npm start &
echo ""

# 7. Test
sleep 3
echo "✅ Déploiement terminé!"
echo ""
echo "🌐 Accéder à: http://135.125.100.150:3001/dashboard/graph-3d"
