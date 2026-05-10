# Script d'installation des dépendances pour la visualisation 3D du graphe
Write-Host "=== Installation des dépendances pour la visualisation 3D du graphe ===" -ForegroundColor Cyan
Write-Host ""

# Obtenir le répertoire du script
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$dashboardPath = Join-Path $scriptPath "..\apps\dashboard"

# Vérifier que le répertoire existe
if (-not (Test-Path $dashboardPath)) {
    Write-Host "❌ Erreur: Le répertoire dashboard n'existe pas: $dashboardPath" -ForegroundColor Red
    exit 1
}

# Naviguer vers le répertoire dashboard
Set-Location $dashboardPath

Write-Host "📦 Installation de @react-three/fiber et @react-three/drei..." -ForegroundColor Yellow
Write-Host ""

# Installer les dépendances avec --legacy-peer-deps
$output = npm install @react-three/fiber@^8.18.6 @react-three/drei@^9.122.4 --legacy-peer-deps 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Dépendances installées avec succès!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🚀 Pour démarrer la visualisation 3D:" -ForegroundColor Cyan
    Write-Host "   1. Assurez-vous que Neo4j est en cours d'exécution" -ForegroundColor White
    Write-Host "   2. Démarrez le backend: cd apps\backend; make host-api" -ForegroundColor White
    Write-Host "   3. Démarrez le dashboard: cd apps\dashboard; npm run dev" -ForegroundColor White
    Write-Host "   4. Accédez à http://localhost:3001/dashboard/graph-3d" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Erreur lors de l'installation des dépendances" -ForegroundColor Red
    Write-Host "   Essayez manuellement: npm install @react-three/fiber @react-three/drei --legacy-peer-deps" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Sortie de l'erreur:" -ForegroundColor Yellow
    Write-Host $output -ForegroundColor Red
    exit 1
}
