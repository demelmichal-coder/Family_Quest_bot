import os
import httpx
from dotenv import load_dotenv
from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    MenuButtonWebApp,
    ReplyKeyboardMarkup,
    Update,
    WebAppInfo,
)
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)
from ai.groq_client import rewrite_task_to_game

# Načtení proměnných z .env souboru pro lokální běh ve VS Code
load_dotenv()

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL", "").strip()
# Pro lokální běh upravena výchozí adresa z 'backend' na 'localhost'
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")
# Změněno z PARENT_TELEGRAM_ID na PARENT_CHAT_ID, aby odpovídalo .env
PARENT_CHAT_ID = os.getenv("PARENT_CHAT_ID", "").strip()


def build_start_keyboard() -> InlineKeyboardMarkup | None:
    if not WEBAPP_URL:
        return None
    return InlineKeyboardMarkup(
        [[InlineKeyboardButton("🚀 Otevřít Family Quest", web_app=WebAppInfo(url=WEBAPP_URL))]]
    )


def build_persistent_app_keyboard() -> ReplyKeyboardMarkup | None:
    if not WEBAPP_URL:
        return None
    return ReplyKeyboardMarkup(
        [[KeyboardButton(text="📱 Otevřít aplikaci", web_app=WebAppInfo(url=WEBAPP_URL))]],
        resize_keyboard=True,
    )


async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data or ""
    if not data.startswith("approve_"):
        return

    task_id = data.split("_", maxsplit=1)[1]
    if not PARENT_CHAT_ID:
        await query.edit_message_text(
            text="Schválení není nakonfigurované. Nastav PARENT_CHAT_ID v .env souboru."
        )
        return

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{API_BASE_URL}/game/approve-task/{task_id}",
                headers={"X-Telegram-Id": PARENT_CHAT_ID},
            )
    except httpx.RequestError as e:
        await query.edit_message_text(text="Nelze se spojit s backendem. Zkus to prosím později.")
        return

    if response.is_success:
        await query.edit_message_text(text=f"Úkol ID {task_id} byl úspěšně schválen.")
        return

    detail = "Schválení selhalo."
    try:
        payload = response.json()
        if isinstance(payload, dict) and payload.get("detail"):
            detail = str(payload["detail"])
    except Exception:
        if response.text:
            detail = response.text

    await query.edit_message_text(text=f"Schválení úkolu ID {task_id} selhalo: {detail}")


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    inline_keyboard = build_start_keyboard()
    reply_keyboard = build_persistent_app_keyboard()

    text = (
        "<b>Vítej ve Family Quest</b>\n\n"
        "Tvoje úkoly se mění na mise, sbíráš XP a odemykáš odměny.\n\n"
        "<b>Doporučeno:</b> otevři aplikaci tlačítkem níže."
    )

    if not WEBAPP_URL:
        text += "\n\n⚠️ WEBAPP_URL není nastaveno, Mini App nepůjde otevřít."

    await update.message.reply_text(text, parse_mode="HTML", reply_markup=reply_keyboard)

    if inline_keyboard:
        await update.message.reply_text("Rychlý vstup do aplikace:", reply_markup=inline_keyboard)


async def open_app(update: Update, context: ContextTypes.DEFAULT_TYPE):
    inline_keyboard = build_start_keyboard()
    if not inline_keyboard:
        await update.message.reply_text("WEBAPP_URL není nastaveno.")
        return
    await update.message.reply_text(
        "<b>Otevři Family Quest</b>\nAplikace má kompletní grafické rozhraní.",
        parse_mode="HTML",
        reply_markup=inline_keyboard,
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    help_text = (
        "<b>Co umím</b>\n"
        "• /start - uvítání a vstup do aplikace\n"
        "• /app - otevře Mini App\n"
        "• /ukol [text] - vygeneruje herní misi z úkolu"
    )
    await update.message.reply_text(help_text, parse_mode="HTML")


async def echo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(f"Napsal jsi: {update.message.text}")


async def generate_task(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("Napiš mi úkol, který chceš přetvořit. Např: /ukol Uklidit si pokoj")
        return
        
    task_text = " ".join(context.args)
    await update.message.reply_text("Generuji epický úkol pomocí AI... ⏳")
    
    try:
        name, xp = await rewrite_task_to_game(task_text)
        await update.message.reply_text(f"⚔️ *Nová mise:* {name}\n💎 *Odměna:* {xp} XP", parse_mode="Markdown")
    except Exception as e:
        await update.message.reply_text(f"Došlo k chybě při generování: {e}")


async def configure_menu_button(app: Application):
    if not WEBAPP_URL:
        return
    await app.bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(text="Family Quest", web_app=WebAppInfo(url=WEBAPP_URL))
    )


def main():
    if not TELEGRAM_TOKEN:
        raise RuntimeError("TELEGRAM_TOKEN není nastaven v proměnných prostředí.")
    app = Application.builder().token(TELEGRAM_TOKEN).post_init(configure_menu_button).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("app", open_app))
    app.add_handler(CommandHandler("ukol", generate_task))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))
    app.add_handler(CallbackQueryHandler(button_handler))
    app.run_polling()


if __name__ == "__main__":
    main()
