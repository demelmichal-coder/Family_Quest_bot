#!/usr/bin/env pwsh
# Unified Google Cloud Run deploy for Family Quest Bot
# Usage: ./deploy.ps1 [-ProjectId family-quest-bot-2026] [-Region europe-west1]

param(
	[string]$ProjectId = "family-quest-bot-2026",
	[string]$Region = "europe-west1",
	[string]$BackendService = "family-quest-backend",
	[string]$FrontendService = "family-quest-frontend",
	[switch]$SkipBackend,
	[switch]$SkipFrontend
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"  # gcloud pise info na stderr; chyby hlida Invoke-Step pres $LASTEXITCODE

function Invoke-Step {
	param(
		[string]$Title,
		[scriptblock]$Action
	)

	Write-Host "`n$Title" -ForegroundColor Yellow
	& $Action
	if ($LASTEXITCODE -ne 0) {
		throw "Step failed: $Title"
	}
}

Write-Host "=== Family Quest Bot - Cloud Run Deploy ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectId | Region: $Region" -ForegroundColor DarkCyan

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
	throw "gcloud CLI was not found in PATH. Install Google Cloud SDK first."
}

$repoRoot = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($repoRoot)) {
	$repoRoot = (Get-Location).Path
}

$backendImage = "gcr.io/$ProjectId/$BackendService`:latest"
$frontendImage = "gcr.io/$ProjectId/$FrontendService`:latest"

# Pred nasazenim frontendu overime produkcni konfiguraci (build bez ni by volal spatnou API).
if (-not $SkipFrontend) {
	$envFile = Join-Path $repoRoot "frontend\.env.production"
	if (-not (Test-Path $envFile) -or -not (Select-String -Path $envFile -Pattern "^VITE_API_URL=https://" -Quiet)) {
		throw "Chybi frontend/.env.production s VITE_API_URL (https://...). Bez nej by se nasadil spatny build."
	}
}

Invoke-Step -Title "[1/6] Configure gcloud project" -Action {
	gcloud config set project $ProjectId
}

if (-not $SkipBackend) {
	Invoke-Step -Title "[2/6] Build backend image" -Action {
		Set-Location (Join-Path $repoRoot "backend")
		gcloud builds submit . --tag $backendImage
	}

	Invoke-Step -Title "[3/6] Deploy backend service" -Action {
		gcloud run deploy $BackendService --image $backendImage --platform managed --region $Region --allow-unauthenticated --port 8000 --project $ProjectId
	}
} else {
	Write-Host "`n[2-3/6] Backend preskocen (-SkipBackend)" -ForegroundColor DarkYellow
}

if (-not $SkipFrontend) {
	Invoke-Step -Title "[4/6] Build frontend image" -Action {
		Set-Location (Join-Path $repoRoot "frontend")
		# Lokalni dist musi odpovidat tomu, co se nasadi (pouziva se pro overeni bundle na konci).
		npm run build
		if ($LASTEXITCODE -ne 0) { throw "npm run build selhal" }
		gcloud builds submit . --tag $frontendImage
	}

	Invoke-Step -Title "[5/6] Deploy frontend service" -Action {
		gcloud run deploy $FrontendService --image $frontendImage --platform managed --region $Region --allow-unauthenticated --port 80 --project $ProjectId
	}
} else {
	Write-Host "`n[4-5/6] Frontend preskocen (-SkipFrontend)" -ForegroundColor DarkYellow
}

Invoke-Step -Title "[6/6] Health checks" -Action {
	$backendUrl = (gcloud run services describe $BackendService --region $Region --project $ProjectId --format="value(status.url)").Trim()
	$frontendUrl = (gcloud run services describe $FrontendService --region $Region --project $ProjectId --format="value(status.url)").Trim()

	if ([string]::IsNullOrWhiteSpace($backendUrl) -or [string]::IsNullOrWhiteSpace($frontendUrl)) {
		throw "Could not resolve service URLs from Cloud Run."
	}

	$live = Invoke-WebRequest -Uri "$backendUrl/health/live" -UseBasicParsing
	$ready = Invoke-WebRequest -Uri "$backendUrl/health/ready" -UseBasicParsing
	$frontend = Invoke-WebRequest -Uri $frontendUrl -UseBasicParsing

	if ($live.StatusCode -ne 200 -or $ready.StatusCode -ne 200 -or $frontend.StatusCode -ne 200) {
		throw "Health check failed. backend_live=$($live.StatusCode), backend_ready=$($ready.StatusCode), frontend=$($frontend.StatusCode)"
	}

	# Overeni, ze zivy web servi stejny bundle jako lokalni build (nasazeni se nekdy nepovede tise).
	if (-not $SkipFrontend) {
		$localIndex = Get-Content (Join-Path $repoRoot "frontend\dist\index.html") -Raw
		$localAsset = [regex]::Match($localIndex, "assets/index-[^`"]+\.js").Value
		$liveAsset = [regex]::Match($frontend.Content, "assets/index-[^`"]+\.js").Value
		if ([string]::IsNullOrWhiteSpace($localAsset) -or $localAsset -ne $liveAsset) {
			throw "Zivy web bezi na jinem bundle (live=$liveAsset, local=$localAsset). Zkontroluj build a nasazeni."
		}
		Write-Host "Frontend bundle shodny s lokalnim buildem: $liveAsset" -ForegroundColor Green
	}

	Write-Host "Backend URL: $backendUrl" -ForegroundColor Green
	Write-Host "Frontend URL: $frontendUrl" -ForegroundColor Green
}

Write-Host "`n=== Deploy completed successfully ===" -ForegroundColor Green


