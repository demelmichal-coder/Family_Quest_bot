#!/usr/bin/env pwsh
# Build + deploy backendu a frontendu na Cloud Run.
#
# Tajne hodnoty (TELEGRAM_TOKEN, JWT_SECRET, DB_URL, PIN_PEPPER, VAPID_*) se sem NEZAPISUJI.
# Jsou ulozene primo na sluzbe family-quest-backend a deploy je zachovava beze zmeny
# (nepouziva se --set-env-vars, ktere by vsechny promenne prepsalo).
# Zmena jedne hodnoty:
#   gcloud run services update family-quest-backend --region europe-west1 --update-env-vars "NAZEV=hodnota"
Set-StrictMode -Version Latest
# Bez $ErrorActionPreference = "Stop": Windows PowerShell 5.1 by jinak ukoncil skript uz na
# varovanich, ktera gcloud vypisuje na stderr. Chyby kontrolujeme pres $LASTEXITCODE.

$ProjectId = "family-quest-bot-2026"
$Region = "europe-west1"
$RepoRoot = $PSScriptRoot

gcloud config set project $ProjectId

Write-Host "Building backend..." -ForegroundColor Cyan
$backendImage = "gcr.io/$ProjectId/family-quest-backend:latest"
gcloud builds submit (Join-Path $RepoRoot "backend") --tag $backendImage
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "Deploying backend..." -ForegroundColor Cyan
gcloud run deploy family-quest-backend `
  --image $backendImage `
  --platform managed --region $Region --allow-unauthenticated --port 8000 `
  --memory 1Gi
if ($LASTEXITCODE -ne 0) { exit 1 }

$backendUrl = (gcloud run services describe family-quest-backend --region $Region --format="value(status.url)").Trim()
Write-Host "Backend: $backendUrl" -ForegroundColor Green

Write-Host "Building frontend..." -ForegroundColor Cyan
$frontendDir = Join-Path $RepoRoot "frontend"
"VITE_API_URL=$backendUrl/api" | Out-File (Join-Path $frontendDir ".env.production") -Encoding utf8

Push-Location $frontendDir
npm run build
$buildExit = $LASTEXITCODE
Pop-Location
if ($buildExit -ne 0) { exit 1 }

Write-Host "Deploying frontend..." -ForegroundColor Cyan
$frontendImage = "gcr.io/$ProjectId/family-quest-frontend:latest"
gcloud builds submit $frontendDir --tag $frontendImage
if ($LASTEXITCODE -ne 0) { exit 1 }

gcloud run deploy family-quest-frontend `
  --image $frontendImage `
  --platform managed --region $Region --allow-unauthenticated --port 80
if ($LASTEXITCODE -ne 0) { exit 1 }

$frontendUrl = (gcloud run services describe family-quest-frontend --region $Region --format="value(status.url)").Trim()
Write-Host "Frontend: $frontendUrl" -ForegroundColor Green
Write-Host "Deploy finished." -ForegroundColor Green
