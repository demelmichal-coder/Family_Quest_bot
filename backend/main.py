import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from api.ai import router as ai_router
from api.challenges import router as challenges_router
from api.families import router as families_router
from api.game import router as game_router
from api.rewards import router as rewards_router
from api.tasks import router as tasks_router
from api.users import router as users_router
from config import settings
from database import SessionLocal
from scheduler import recurring_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(recurring_scheduler())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="FamilyQuest API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(families_router)
app.include_router(tasks_router)
app.include_router(rewards_router)
app.include_router(ai_router)
app.include_router(game_router)
app.include_router(challenges_router)


@app.get("/")
def root():
    return {"zprava": "FamilyQuest API bezi!"}


@app.get("/health/live")
def live_health():
    return {"status": "ok"}


@app.get("/health/ready")
def ready_health():
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok"}
    finally:
        db.close()
