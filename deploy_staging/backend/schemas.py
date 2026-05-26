
from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    detail: str


class UserRead(ORMModel):
    id: int
    telegram_id: str
    username: Optional[str] = None
    role: str
    xp: int
    gold: int
    family_id: Optional[int] = None
    avatar: Optional[str] = None
    current_streak: int = 0


class FamilyRead(ORMModel):
    id: int
    name: str
    invite_code: str
    created_at: Optional[datetime] = None


class FamilyMemberRead(ORMModel):
    id: int
    telegram_id: str
    username: Optional[str] = None
    role: str
    xp: int
    gold: int
    avatar: Optional[str] = None


class FamilyDetailRead(FamilyRead):
    members: List[FamilyMemberRead]


class TaskRead(ORMModel):
    id: int
    title: str
    description: Optional[str] = None
    xp: int
    gold: int
    is_daily: bool
    is_completed: bool
    approved: bool
    user_id: Optional[int] = None
    created_at: Optional[datetime] = None
    recurrence: Optional[str] = None
    recurrence_days: Optional[str] = None
    parent_task_id: Optional[int] = None
    feedback: Optional[str] = None
    feedback_at: Optional[datetime] = None


class RewardRead(ORMModel):
    id: int
    name: str
    cost: int
    description: Optional[str] = None


class RewardPurchaseRead(ORMModel):
    id: int
    reward_name: str
    cost: int
    purchased_at: datetime
    user_id: int
    reward_id: Optional[int] = None


class CompleteTaskResponse(BaseModel):
    detail: str
    task: TaskRead
    user: UserRead
    streak: int = 0
    bonus_xp: int = 0


class ChildWeeklyStats(BaseModel):
    user_id: int
    username: str
    total_xp: int
    tasks_completed: int
    activity_days: List[int]  # pocet splnenych ukolu za posledni 7 dni (den 0 = nejstarsi)


class FamilyWeeklyStatsRead(BaseModel):
    children: List[ChildWeeklyStats]


class LeaderboardEntry(ORMModel):
    rank: int
    id: int
    telegram_id: str
    username: Optional[str] = None
    role: str
    xp: int
    gold: int
    avatar: Optional[str] = None
    completed_tasks: int = 0
    is_me: bool = False


class FamilyStatsRead(BaseModel):
    family_id: int
    family_name: str
    members: int
    children: int
    total_xp: int
    total_gold: int
    total_tasks: int
    completed_tasks: int
    daily_tasks: int
    rewards: int


class BuyRewardResponse(BaseModel):
    detail: str
    user: UserRead
    purchase: RewardPurchaseRead


class SeasonProgressRead(BaseModel):
    season_label: str
    season_day: int
    season_length_days: int
    pass_level: int
    pass_level_progress_xp: int
    pass_level_target_xp: int
    season_xp: int


class AchievementRead(BaseModel):
    id: str
    title: str
    description: str
    unlocked: bool
    progress: int
    target: int


# --- Family Challenges ---

class ChallengeProgressRead(ORMModel):
    user_id: int
    contribution: int


class FamilyChallengeRead(ORMModel):
    id: int
    family_id: int
    title: str
    description: Optional[str] = None
    target: int
    bonus_xp: int
    bonus_gold: int
    starts_at: Optional[datetime] = None
    ends_at: datetime
    completed: bool
    current_progress: int = 0  # vypocitano ze sumy contributions
    progress_entries: List[ChallengeProgressRead] = []


class FamilyChallengeCreate(BaseModel):
    title: str
    description: str = ""
    target: int = 20
    bonus_xp: int = 50
    bonus_gold: int = 0
    days: int = 7  # delka vyzvy ve dnech


# --- Recurring tasks ---

class TaskCreate(BaseModel):
    title: str
    description: str = ""
    xp: int = 10
    gold: int = 0
    is_daily: bool = False
    user_id: Optional[int] = None
    recurrence: Optional[str] = None        # 'daily' | 'weekly' | 'custom'
    recurrence_days: Optional[str] = None   # CSV: '0,2,4'


# --- Task Feedback ---

class TaskFeedbackWrite(BaseModel):
    feedback: str
