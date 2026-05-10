@echo off
REM ============================================================================
REM Windows Deployment Script - Design Pattern Analysis System
REM Server: 135.125.100.150
REM ============================================================================

echo ==========================================
echo 🚀 Deploying to VPS: 135.125.100.150
echo ==========================================

set VPS_IP=135.125.100.150
set VPS_USER=root
set PROJECT_DIR=/root/ai-code-review-platform

echo.
echo 📡 Step 1: Pulling latest changes from GitHub...
plink -ssh %VPS_USER%@%VPS_IP% -batch "cd %PROJECT_DIR% && git pull origin main"

echo.
echo 📦 Step 2: Installing backend dependencies...
plink -ssh %VPS_USER%@%VPS_IP% -batch "cd %PROJECT_DIR%/apps/backend && poetry install"

echo.
echo 🗄️  Step 3: Running database migrations...
plink -ssh %VPS_USER%@%VPS_IP% -batch "cd %PROJECT_DIR%/apps/backend && poetry run alembic upgrade head"

echo.
echo 📊 Step 4: Initializing Neo4j schema...
plink -ssh %VPS_USER%@%VPS_IP% -batch "cd %PROJECT_DIR%/apps/backend && poetry run python -c \"from app.integrations.graph_database.neo4j_client import get_neo4j_client; neo4j = get_neo4j_client(); neo4j.init_schema() if neo4j.enabled else print('Neo4j disabled')\""

echo.
echo 🔄 Step 5: Restarting backend services...
plink -ssh %VPS_USER%@%VPS_IP% -batch "cd %PROJECT_DIR% && docker-compose down && docker-compose up -d --build"

echo.
echo 🏥 Step 6: Checking service health...
plink -ssh %VPS_USER%@%VPS_IP% -batch "curl -s http://localhost:8000/health"

echo.
echo ==========================================
echo ✅ Deployment Complete!
echo ==========================================
echo.
echo 📝 Next Steps:
echo 1. Configure pattern analysis in .env
echo 2. Test pattern extraction
echo 3. View logs: docker logs -f ai-code-review-api
echo.
pause
