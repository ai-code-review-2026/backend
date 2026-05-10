# scripts/start_dev.ps1
# Script de démarrage intelligent pour l'environnement de développement (Windows)
#
# Usage:
#   .\scripts\start_dev.ps1 minimal    # Seulement DB + Redis + Qdrant
#   .\scripts\start_dev.ps1 frontend   # Frontend Next.js uniquement
#   .\scripts\start_dev.ps1 backend    # Backend complet mais optimisé
#   .\scripts\start_dev.ps1 full       # Stack complète (comme avant)

param(
    [string]$Mode = "minimal"
)

Write-Host "🚀 Démarrage du mode: $Mode" -ForegroundColor Green
Write-Host ""

switch ($Mode) {
    "minimal" {
        Write-Host "📦 Lancement de l'infrastructure minimale..." -ForegroundColor Yellow
        make up-minimal
        Write-Host ""
        Write-Host "✅ Infrastructure prête !" -ForegroundColor Green
        Write-Host "💡 Pour continuer:" -ForegroundColor Cyan
        Write-Host "   - Backend: make host-migrate && make host-api" -ForegroundColor White
        Write-Host "   - Frontend: cd apps/dashboard && npm run dev" -ForegroundColor White
    }

    "frontend" {
        Write-Host "🎨 Lancement du frontend uniquement..." -ForegroundColor Yellow
        Set-Location "apps/dashboard"
        npm install
        npm run dev
    }

    "backend" {
        Write-Host "⚡ Lancement du backend optimisé..." -ForegroundColor Yellow
        make up-minimal
        Write-Host "⏳ Attente de l'infrastructure..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
        make host-migrate
        Start-Job -ScriptBlock { make host-api }
        Write-Host ""
        Write-Host "✅ Backend démarré sur http://localhost:8000" -ForegroundColor Green
    }

    "full" {
        Write-Host "🔥 Lancement de la stack complète..." -ForegroundColor Red
        Write-Host "⚠️  Attention: Consomme beaucoup de ressources !" -ForegroundColor Yellow
        make up
        Write-Host "⏳ Attente de l'infrastructure..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
        make migrate
    }

    default {
        Write-Host "❌ Mode non reconnu: $Mode" -ForegroundColor Red
        Write-Host ""
        Write-Host "Modes disponibles:" -ForegroundColor Cyan
        Write-Host "  minimal   - Infrastructure de base (DB, Redis, Qdrant)" -ForegroundColor White
        Write-Host "  frontend  - Frontend Next.js uniquement" -ForegroundColor White
        Write-Host "  backend   - Backend optimisé avec infra minimale" -ForegroundColor White
        Write-Host "  full      - Stack complète (gourmand en ressources)" -ForegroundColor White
        exit 1
    }
}

Write-Host ""
Write-Host "🎉 Démarrage terminé !" -ForegroundColor Green