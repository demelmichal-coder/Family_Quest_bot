#!/bin/bash
# Verification script - Run after deployment
set -e

echo "🔍 Family Quest Bot - Deployment Verification"
echo "=============================================="

DEPLOY_HOME="/home/opc/familyquest"
ERRORS=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✓${NC} $1"
  else
    echo -e "${RED}✗${NC} $1 (MISSING)"
    ERRORS=$((ERRORS + 1))
  fi
}

check_dir() {
  if [ -d "$1" ]; then
    echo -e "${GREEN}✓${NC} $1/"
  else
    echo -e "${RED}✗${NC} $1/ (MISSING)"
    ERRORS=$((ERRORS + 1))
  fi
}

# 1. Check Backend Structure
echo ""
echo "📂 Backend Files:"
check_file "$DEPLOY_HOME/backend/models.py"
check_file "$DEPLOY_HOME/backend/schemas.py"
check_file "$DEPLOY_HOME/backend/main.py"
check_file "$DEPLOY_HOME/backend/scheduler.py"
check_file "$DEPLOY_HOME/backend/requirements.txt"
check_dir "$DEPLOY_HOME/backend/api"
check_dir "$DEPLOY_HOME/backend/alembic"

# 2. Check Frontend Structure
echo ""
echo "📂 Frontend Files:"
check_file "$DEPLOY_HOME/frontend/package.json"
check_file "$DEPLOY_HOME/frontend/index.html"
check_dir "$DEPLOY_HOME/frontend/src"
check_dir "$DEPLOY_HOME/frontend/dist"

# 3. Check Database Migration
echo ""
echo "🗄️  Database Migration:"
check_file "$DEPLOY_HOME/backend/alembic/versions/0005_challenges_recurring_feedback.py"

# 4. Check Docker Compose
echo ""
echo "🐳 Docker Configuration:"
check_file "$DEPLOY_HOME/docker-compose.yml"

# 5. Check Services Running
echo ""
echo "🚀 Service Status:"
if docker ps | grep -q familyquest-backend; then
  echo -e "${GREEN}✓${NC} Backend container running"
else
  echo -e "${RED}✗${NC} Backend container NOT running"
  ERRORS=$((ERRORS + 1))
fi

if docker ps | grep -q familyquest-frontend; then
  echo -e "${GREEN}✓${NC} Frontend container running"
else
  echo -e "${YELLOW}ℹ${NC} Frontend container name not found (may be different)"
fi

# 6. Check Backend Health
echo ""
echo "💓 Service Health:"

# Backend API health
BACKEND_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/health/ready 2>/dev/null || echo "000")
if [ "$BACKEND_HEALTH" = "200" ]; then
  echo -e "${GREEN}✓${NC} Backend responding (HTTP $BACKEND_HEALTH)"
else
  echo -e "${YELLOW}⚠${NC} Backend health check returned HTTP $BACKEND_HEALTH"
fi

# Frontend health
FRONTEND_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/ 2>/dev/null || echo "000")
if [ "$FRONTEND_HEALTH" = "200" ]; then
  echo -e "${GREEN}✓${NC} Frontend responding (HTTP $FRONTEND_HEALTH)"
else
  echo -e "${YELLOW}⚠${NC} Frontend health check returned HTTP $FRONTEND_HEALTH"
fi

# 7. Check Python Imports
echo ""
echo "🐍 Python Dependencies:"
cd "$DEPLOY_HOME/backend"
if python3 -c "from models import Task, FamilyChallenge, ChallengeProgress; print('✓ All models imported')" 2>/dev/null; then
  echo -e "${GREEN}✓${NC} Core models import successfully"
else
  echo -e "${RED}✗${NC} Failed to import models"
  ERRORS=$((ERRORS + 1))
fi

if python3 -c "from scheduler import recurring_scheduler; print('✓ Scheduler imported')" 2>/dev/null; then
  echo -e "${GREEN}✓${NC} Scheduler imports successfully"
else
  echo -e "${RED}✗${NC} Failed to import scheduler"
  ERRORS=$((ERRORS + 1))
fi

# 8. Check Alembic Status
echo ""
echo "📜 Database Migration Status:"
cd "$DEPLOY_HOME/backend"
ALEMBIC_STATUS=$(python3 -m alembic current 2>/dev/null || echo "ERROR")
if [[ "$ALEMBIC_STATUS" == *"0005_challenges"* ]] || [[ "$ALEMBIC_STATUS" == *"head"* ]]; then
  echo -e "${GREEN}✓${NC} Migration 0005 applied: $ALEMBIC_STATUS"
else
  echo -e "${YELLOW}ℹ${NC} Current migration: $ALEMBIC_STATUS"
fi

# 9. Check Frontend Build
echo ""
echo "🎨 Frontend Build:"
if [ -f "$DEPLOY_HOME/frontend/dist/index.html" ]; then
  BUILD_SIZE=$(du -sh "$DEPLOY_HOME/frontend/dist" | cut -f1)
  echo -e "${GREEN}✓${NC} Frontend build exists ($BUILD_SIZE)"
else
  echo -e "${RED}✗${NC} Frontend build missing"
  ERRORS=$((ERRORS + 1))
fi

# 10. Check Logs
echo ""
echo "📋 Recent Logs (last 5 lines):"
if [ -f "$DEPLOY_HOME/backend.log" ]; then
  echo -e "${YELLOW}Backend Log:${NC}"
  tail -3 "$DEPLOY_HOME/backend.log" || true
fi

# Final Summary
echo ""
echo "=============================================="
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}✅ All checks passed!${NC}"
  echo "Deployment is ready for use."
else
  echo -e "${RED}❌ $ERRORS check(s) failed!${NC}"
  echo "Please review the errors above."
fi
echo ""
