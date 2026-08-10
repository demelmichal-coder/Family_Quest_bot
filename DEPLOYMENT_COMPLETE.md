# 🚀 Family Quest Bot - Deployment Guide

Gratuluji! Tvoje aplikace je nyní na Google Cloud Run! 🎉

## Kontrola Deploymentu

### 1. Ověř, že služby běží

Po deploymentu byste měli mít dvě služby v Google Cloud Console:
- **family-quest-backend** - https://family-quest-backend-XXXXX.europe-west1.run.app
- **family-quest-frontend** - https://family-quest-frontend-XXXXX.europe-west1.run.app

### 2. Otestuj zdraví (Health Checks)

Otevři v browseru:
```
{BACKEND_URL}/health/live    # Měl by vrátit {"status": "ok"}
{BACKEND_URL}/health/ready   # Ověří DB připojení
{FRONTEND_URL}/              # Měl by načíst React app
```

## Jak Používat Aplikaci

### Bez Telegramu (Demo Mode)

Otevři frontend URL a přidej query parameter:
```
{FRONTEND_URL}/?demo_user=player-1
```

Tím se "přihlásíš" jako demo uživatel. Můžeš vytvořit rodinu nebo se připojit kódem.

### S Telegram Botem (Produkce)

1. **Jdi do BotFathera** v Telegramu (hledej @BotFather)

2. **Zvol svého bota** a jdi na Web App settings:
   ```
   /mybots → Zvol bot → Web App → New Web App
   ```

3. **Nastav URL na tvůj frontend**:
   ```
   https://family-quest-frontend-XXXXX.europe-west1.run.app
   ```

4. **V testeri bota** klikni na tlačítko Web App a měla by se otevřít tvoje aplikace

## Profily a Pamatování

✅ **Teď funguje správně!** Když se přihlásíš a vytvoříš/připojíš se k rodině, profil se uloží.

Příště když se vrátíš na aplikaci:
- Uvidíš seznam uložených profilů
- Klikneš na profil a obnovíš session bez přihlašování
- Připraveno k obnově ✅

Pokud se chceš odhlásit a vrátit se, přejdi na přihlašovací obrazovku a vyber profil.

## Rodina - Role a Funkce

### Rodič (Parent)
- Spravuje děti
- Vytváří/schvaluje úkoly
- Přiděluje odměny
- Vidí admin panel a statistiky

### Dítě (Child)
- Vidí zadané úkoly
- Plní úkoly pro XP
- Nakupuje si odměny za gold
- Soutěží na žebříčku

## Pozvání do Rodiny

Jakmile vytvoříš rodinu jako rodič, dostaneš **invite kód** (8 znaků, např. `A1B2C3D4`).

Ostatní si mohou:
1. Otevřít aplikaci
2. Vybrat "Připojit se do rodiny"
3. Zadat invite kód
4. Zvolit roli (rodič/dítě)

## Prostředí Proměnné

Pokud potřebuješ změnit konfiguraci, jdi do Google Cloud Run console:

```
Cloud Run → Tvá služba → EDIT → Runtime settings → Environment variables
```

Klíčové proměnné:
- `TELEGRAM_TOKEN` - Token od @BotFather
- `JWT_SECRET` - Tajný klíč pro session (už je nastavený)
- `ALLOW_INSECURE_DEMO_AUTH` - Povoluje demo mode (teď `false`)

## Troubleshooting

### "Aplikace se nemůže připojit k backendu"
- Ověř, že backend URL je správně nastavená v frontend env
- Zkontroluj Cloud Run console, je backend spuštěný?
- Backend potřebuje sekund na startup - počkej chvíli

### "Profil se nepamatuje"
- Vymaž `localStorage` v browseru (F12 → Application → Local Storage → Clear All)
- Zkus se znovu přihlásit
- Profil by se měl uložit

### "Telegram bot nefunguje"
- Ověř URL v BotFather Web App settings
- Zkontroluj, že `ALLOWED_ORIGINS` v env obsahuje tvou frontend doménu
- TELEGRAM_TOKEN musí být správný

## Upgrade / Změny

Pokud chceš udělat změny:
1. Pushni do repo
2. Spustit deploy skript znovu
3. (Nebo ručně pushni nový Docker image a redeploy v Cloud Run)

## Ceny

Google Cloud Run FREE tier:
- 2M requestů/měsíc zdarma ✅
- 360K GB-sekund/měsíc zdarma ✅
- Rodina z 2-5 osob by měla vejít v free tier 💰

Přibližné reálné náklady (pokud překročíš): ~$0.40 za milion requestů

---

**Hotovo!** Tvá aplikace je online a připravená! 🎉

Pokud něco nefunguje nebo potřebuješ změny, jsem tady. 💪
