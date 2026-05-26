#!/bin/bash
# Deployment script for Family Quest Bot upgrades
set -e

echo "🚀 Family Quest Bot - Deployment Started"
echo "=========================================="

DEPLOY_HOME="/home/opc/familyquest"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$DEPLOY_HOME/backups/$TIMESTAMP"

# Backup current code
echo "📦 Creating backup..."
mkdir -p "$BACKUP_DIR"
cp -r "$DEPLOY_HOME/backend" "$BACKUP_DIR/" 2>/dev/null || true
cp -r "$DEPLOY_HOME/frontend" "$BACKUP_DIR/" 2>/dev/null || true
echo "✓ Backup created: $BACKUP_DIR"

# Update backend code
echo "📥 Updating backend code..."
cp -r backend/* "$DEPLOY_HOME/backend/"
echo "✓ Backend updated"

# Update frontend code
echo "📥 Updating frontend code..."
cp -r frontend/* "$DEPLOY_HOME/frontend/"
echo "✓ Frontend updated"

# Run alembic migration
echo "🔄 Running database migration (0005_challenges_recurring_feedback)..."
cd "$DEPLOY_HOME/backend"
python -m alembic upgrade head
echo "✓ Migration complete"

# Rebuild frontend
echo "🔨 Building frontend..."
cd "$DEPLOY_HOME/frontend"
npm install --legacy-peer-deps > /tmp/npm_install.log 2>&1
npm run build >> /tmp/npm_install.log 2>&1
echo "✓ Frontend built"

# Restart containers
echo "🔄 Restarting services..."
cd "$DEPLOY_HOME"
docker compose down
docker compose up -d --build --remove-orphans

# Verify services
echo "✅ Checking service health..."
curl -fsS http://localhost/health/ready > /dev/null && echo "✓ Backend is healthy" || echo "⚠ Backend check failed"
curl -fsS http://localhost/ > /dev/null && echo "✓ Frontend is healthy" || echo "⚠ Frontend check failed"

echo ""
echo "=========================================="
echo "✅ Deployment Complete!"
echo "Backup location: $BACKUP_DIR"
echo "Rollback: cp -r $BACKUP_DIR/* $DEPLOY_HOME/ && docker compose down && docker compose up -d --build --remove-orphans"
