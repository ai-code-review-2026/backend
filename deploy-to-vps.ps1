# ============================================================================
# PowerShell Deployment Script - Design Pattern Analysis System
# Server: 135.125.100.150
# Usage: .\deploy-to-vps.ps1
# ============================================================================

$VPS_IP = "135.125.100.150"
$VPS_USER = "root"
$VPS_PASSWORD = "DevoraPass2026"
$PROJECT_DIR = "/root/ai-code-review-platform"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🚀 Deploying to VPS: $VPS_IP" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Function to execute SSH command
function Invoke-SSHCommand {
    param (
        [string]$Command,
        [string]$Description
    )
    
    Write-Host "📡 $Description..." -ForegroundColor Yellow
    
    $sshCommand = "echo $VPS_PASSWORD | ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} '$Command'"
    
    try {
        Invoke-Expression $sshCommand
        Write-Host "✅ Success" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ Failed: $_" -ForegroundColor Red
    }
    
    Write-Host ""
}

# Step 1: Pull latest changes
Invoke-SSHCommand -Command "cd $PROJECT_DIR && git pull origin main" -Description "Pulling latest changes from GitHub"

# Step 2: Install dependencies
Invoke-SSHCommand -Command "cd $PROJECT_DIR/apps/backend && poetry install" -Description "Installing backend dependencies"

# Step 3: Run migrations
Invoke-SSHCommand -Command "cd $PROJECT_DIR/apps/backend && poetry run alembic upgrade head" -Description "Running database migrations"

# Step 4: Initialize Neo4j schema
$neo4jCommand = "cd $PROJECT_DIR/apps/backend && poetry run python -c 'from app.integrations.graph_database.neo4j_client import get_neo4j_client; neo4j = get_neo4j_client(); neo4j.init_schema() if neo4j.enabled else print(\"Neo4j disabled\")'"
Invoke-SSHCommand -Command $neo4jCommand -Description "Initializing Neo4j schema"

# Step 5: Restart services
Invoke-SSHCommand -Command "cd $PROJECT_DIR && docker-compose down && docker-compose up -d --build" -Description "Restarting backend services"

# Step 6: Health check
Invoke-SSHCommand -Command "sleep 5 && curl -s http://localhost:8000/health" -Description "Checking service health"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "✅ Deployment Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 Next Steps:" -ForegroundColor Yellow
Write-Host "1. Configure pattern analysis in .env" -ForegroundColor White
Write-Host "2. Test pattern extraction" -ForegroundColor White
Write-Host "3. View logs: ssh $VPS_USER@$VPS_IP 'docker logs -f ai-code-review-api'" -ForegroundColor White
Write-Host ""
Write-Host "🔗 Access API: http://$VPS_IP:8000" -ForegroundColor Cyan
Write-Host "🔗 Access Dashboard: http://$VPS_IP:3001" -ForegroundColor Cyan
Write-Host ""
