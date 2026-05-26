import os
import asyncio
import httpx
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, ReplyKeyboardRemove, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from dotenv import load_dotenv

# Import tvého stávajícího klienta
from ai.groq_client import rewrite_task_to_game

load_dotenv()
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL", "").strip()
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")
PARENT_CHAT_ID = os.getenv("PARENT_CHAT_ID", "").strip()

# 1. Definice stavů (FSM)
class TaskFSM(StatesGroup):
    waiting_for_task = State()
    waiting_for_style = State()

bot = Bot(token=TELEGRAM_TOKEN)
dp = Dispatcher()

# Handler pro příkaz /start, který nabídne otevření Mini App
@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    kb = []
    text = "Ahoj! Jsem Family Quest bot.\n\nZadej příkaz /ukol pro vytvoření nové mise."

    if WEBAPP_URL:
        kb.append([InlineKeyboardButton(text="Otevřít Family Quest", web_app=WebAppInfo(url=WEBAPP_URL))])
        text = "Ahoj! Jsem Family Quest bot.\n\nOtevři aplikaci a plň úkoly, nebo zadej /ukol pro vytvoření nové mise."

    markup = InlineKeyboardMarkup(inline_keyboard=kb)
    await message.answer(text, reply_markup=markup)


# KROK 1: Spuštění FSM procesu pro tvorbu úkolu
@dp.message(Command("ukol"))
async def cmd_ukol(message: types.Message, state: FSMContext):
    await message.answer("Napiš mi úkol, který chceš přetvořit (např. 'Uklidit si pokoj'):")
    # Nastavíme stav na čekání na úkol
    await state.set_state(TaskFSM.waiting_for_task)

# KROK 2: Zachycení názvu úkolu
@dp.message(TaskFSM.waiting_for_task)
async def process_task(message: types.Message, state: FSMContext):
    # Uložíme text úkolu do paměti stavu pro pozdější použití
    await state.update_data(task_text=message.text)
    
    # Nabídneme uživateli styly přes tlačítka (odpovídá tvým STYLE_PROMPTS v groq_client.py)
    kb = ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="epicke"), KeyboardButton(text="vtipne")],
            [KeyboardButton(text="kratke")]
        ],
        resize_keyboard=True
    )
    
    await message.answer("Super! A v jakém stylu to chceš?", reply_markup=kb)
    # Přepneme do stavu pro výběr stylu
    await state.set_state(TaskFSM.waiting_for_style)

# KROK 3: Zachycení stylu a odeslání do Groq
@dp.message(TaskFSM.waiting_for_style)
async def process_style(message: types.Message, state: FSMContext):
    style = message.text.lower()
    
    # Validace, zda vybral správný styl
    if style not in ["epicke", "vtipne", "kratke"]:
        await message.answer("Zvol prosím jeden ze stylů na klávesnici (epicke, vtipne, kratke).")
        return

    # Načteme uložená data z předchozího kroku
    user_data = await state.get_data()
    task_text = user_data['task_text']
    
    await message.answer("Generuji úkol pomocí AI... ⏳", reply_markup=ReplyKeyboardRemove())
    
    try:
        # Zavoláme tvoji Groq API funkci se získanými parametry
        name, xp = await rewrite_task_to_game(task_text, style=style)
        await message.answer(f"⚔️ <b>Nová mise:</b> {name}\n💎 <b>Odměna:</b> {xp} XP", parse_mode="HTML")
    except Exception as e:
        await message.answer(f"Došlo k chybě: {e}")
        
    # Vyčistíme stav a paměť pro další úkoly
    await state.clear()


# Handler pro schvalování úkolů přes Inline tlačítka
@dp.callback_query(F.data.startswith("approve_"))
async def approve_task_callback(callback: types.CallbackQuery):
    # Telegram vyžaduje, abychom na callback odpověděli, jinak tlačítko zůstane "viset" v načítání
    await callback.answer()
    
    task_id = callback.data.split("_", 1)[1]
    if not PARENT_CHAT_ID:
        await callback.message.edit_text("Schválení není nakonfigurované. Nastav PARENT_CHAT_ID v .env souboru.")
        return

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{API_BASE_URL}/game/approve-task/{task_id}",
                headers={"X-Telegram-Id": PARENT_CHAT_ID},
            )
    except httpx.RequestError:
        await callback.message.edit_text("Nelze se spojit s backendem. Zkus to prosím později.")
        return

    if response.is_success:
        await callback.message.edit_text(f"Úkol ID {task_id} byl úspěšně schválen.")
        return

    detail = "Schválení selhalo."
    try:
        payload = response.json()
        if isinstance(payload, dict) and payload.get("detail"):
            detail = str(payload["detail"])
    except Exception:
        if response.text:
            detail = response.text

    await callback.message.edit_text(f"Schválení úkolu ID {task_id} selhalo: {detail}")

async def main():
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())