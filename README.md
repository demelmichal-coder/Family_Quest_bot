# Family Quest Bot

Rodinna quest aplikace s FastAPI backendem a React/Vite frontendem.

## Autorska prava a licence

Tento projekt je chranen autorskym pravem a je publikovan jako proprietarni software
("All Rights Reserved").

- Neni povoleno software pouzivat, kopirovat, upravovat ani dale distribuovat bez
	predchoziho pisemneho souhlasu autora.
- Podrobne podminky jsou uvedeny v souboru `LICENSE`.

## Lokalni spusteni

### Backend

```powershell
.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --app-dir backend
```

Backend standardne bezi na `http://127.0.0.1:8000`.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend standardne bezi na `http://127.0.0.1:5173`.

## Demo rezim mimo Telegram

Frontend umi lokalne bezet i bez Telegram WebApp session.

Moznosti:

```text
http://127.0.0.1:5173/?demo_user=player-1
```

nebo nastav ve frontend env:

```text
VITE_DEMO_TELEGRAM_ID=player-1
```

Backend pro tento rezim potrebuje `ALLOW_INSECURE_DEMO_AUTH=true`.

## Bezpecne prihlaseni a session (Telegram Mini App)

Pro produkcni bezpecne prihlaseni je pripraveny novy API modul na endpointu `/api/*`:

- `POST /api/auth` - overi Telegram `initData` HMAC podpis, nacte/vytvori uzivatele a vrati JWT token
- `GET /api/auth/verify` - rychla kontrola platnosti JWT tokenu (auto-login)
- `POST /api/family/create` - vytvori novou rodinu a uzivatele nastavi jako `parent`
- `POST /api/family/join` - pripoji uzivatele do rodiny podle kodu

Povinne backend promenne pro produkci:

```text
TELEGRAM_TOKEN=<token bota>
JWT_SECRET=<silny nahodny retezec, min. 32 znaku>
JWT_EXPIRES_MINUTES=60
JWT_ISSUER=familyquest-api
TELEGRAM_AUTH_MAX_AGE_SECONDS=86400
ALLOW_INSECURE_DEMO_AUTH=false
```

Ukazkovy frontend flow (HTML5 + JavaScript pro Telegram WebApp) je v souboru:

```text
frontend/public/telegram-secure-auth.html
```

Stranka demonstruje:

- nacitani `window.Telegram.WebApp.initData`
- auto-login pres `localStorage` + `GET /api/auth/verify`
- first-time rozhodnuti mezi vytvorenim rodiny a pripojenim kodem
- bezpecne odhlaseni (`Odhlasit se`) s vycistenim localStorage tokenu

## Health endpointy

- `GET /health/live` vraci jednoduchy liveness check
- `GET /health/ready` overuje, ze backend otevre DB session

## Docker

```powershell
docker compose up --build
```

Caddy publikuje frontend na `/` a backend pres `/api/*`.
Pro schvalovani z Telegram bota je mozne nastavit:

```text
API_BASE_URL=http://backend:8000
PARENT_CHAT_ID=123456789
```

## Cloud Run Deploy (doporučeno)

Jednotny deploy backendu i frontendu na Google Cloud Run:

```powershell
./deploy.ps1
```

Volitelne parametry:

```powershell
./deploy.ps1 -ProjectId family-quest-bot-2026 -Region europe-west1
```

Skript provede:

- build backend image a deploy sluzby `family-quest-backend`
- build frontend image a deploy sluzby `family-quest-frontend`
- health check backendu (`/health/live`, `/health/ready`) i frontendu

## GitHub Deploy

V repozitari je pripraveny manualni workflow `Deploy`, ktery se spousti pres `workflow_dispatch`.
Pri spusteni lze vybrat `staging` nebo `production` a volitelny git ref.

Potrebne GitHub secrets:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_PATH`
- `HEALTHCHECK_URL`

Workflow se pripoji na server, udela `git fetch`, `git checkout`, `git pull` a potom spusti:

```text
docker compose up -d --build --remove-orphans
```

Pokud je nastaveny `HEALTHCHECK_URL`, workflow po nasazeni opakovane otestuje endpoint a failne, kdyz aplikace nenabehne.

## GitHub Rollback

Je pripraveny i manualni workflow `Rollback`, ktery pouziva stejna secrets a environmenty jako deploy.
Jako `ref` se zadava konkretni commit SHA nebo git tag, na ktery se ma server vratit.

Rollback provede:

```text
git checkout <ref>
docker compose up -d --build --remove-orphans
```

Stejne jako deploy umi po zmene overit `HEALTHCHECK_URL`.

## Testy

### Backend

```powershell
$env:PYTHONPATH='backend'
.venv\Scripts\python.exe -m pytest backend\tests\test_api.py
```

### Frontend

```powershell
cd frontend
npm test -- --run
npm run build
```
