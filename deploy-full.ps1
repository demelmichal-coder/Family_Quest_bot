#!/usr/bin/env pwsh
Set-StrictMode -Version Latest

$ProjectId = "family-quest-bot-2026"
$Region = "europe-west1"
$JwtSecret = "9J5dn84IOUpaZsgGhVTB7NtEFPkC6XYW2lyMf0cv"
$TelegramToken = "8552899429:AAEULEKoCj-tDRA2t_nWPM-8UjL6idSf_iM"

gcloud config set project $ProjectId

Write-Host "🔨 Building backend..." -ForegroundColor Cyan
cd backend
$image = "gcr.io/$ProjectId/family-quest-backend:latest"
gcloud builds submit . --tag $image
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "`n📤 Deploying backend..." -ForegroundColor Cyan
gcloud run deploy family-quest-backend `
  --image $image `
  --platform managed --region $Region --allow-unauthenticated --port 8000 `
  --set-env-vars="TELEGRAM_TOKEN=$TelegramToken,JWT_SECRET=$JwtSecret,JWT_ISSUER=familyquest-api,ALLOW_INSECURE_DEMO_AUTH=false" `
  --memory 1Gi

$backendUrl = (gcloud run services describe family-quest-backend --region $Region --format="value(status.url)").Trim()
Write-Host "✅ Backend: $backendUrl" -ForegroundColor Green

Write-Host "`n🔨 Building frontend..." -ForegroundColor Cyan
cd ../frontend

# Update frontend env
@"
VITE_API_URL=$backendUrl/api
"@ | Out-File ".env.production" -Encoding utf8

npm run build
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "`n📤 Deploying frontend..." -ForegroundColor Cyan
cd ..
gcloud builds submit frontend --tag "gcr.io/$ProjectId/family-quest-frontend:latest"
if ($LASTEXITCODE -ne 0) { exit 1 }

gcloud run deploy family-quest-frontend `
  --image "gcr.io/$ProjectId/family-quest-frontend:latest" `
  --platform managed --region $Region --allow-unauthenticated --port 80

$frontendUrl = (gcloud run services describe family-quest-frontend --region $Region --format="value(status.url)").Trim()
Write-Host "✅ Frontend: $frontendUrl" -ForegroundColor Green

Write-Host "`n✨ Deploy finished!" -ForegroundColor Green
