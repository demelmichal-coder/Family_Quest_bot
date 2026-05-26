from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import declarative_base, relationship

from constants import ROLE_PENDING

Base = declarative_base()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(String, unique=True, nullable=False, index=True)
    username = Column(String, nullable=True)
    role = Column(String, nullable=False, default=ROLE_PENDING)
    xp = Column(Integer, default=0, nullable=False)
    gold = Column(Integer, default=0, nullable=False)
    family_id = Column(Integer, ForeignKey("families.id"), nullable=True)
    avatar = Column(String, nullable=True)

    current_streak = Column(Integer, default=0, nullable=False)
    last_active_date = Column(Date, nullable=True)

    family = relationship("Family", back_populates="members")
    tasks = relationship("Task", back_populates="user", cascade="all, delete-orphan")
    purchases = relationship("RewardPurchase", back_populates="user", cascade="all, delete-orphan")


class Family(Base):
    __tablename__ = "families"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    invite_code = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    members = relationship("User", back_populates="family")
    rewards = relationship("Reward", back_populates="family", cascade="all, delete-orphan")
    challenges = relationship("FamilyChallenge", back_populates="family", cascade="all, delete-orphan")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    description = Column(String)
    xp = Column(Integer, default=10, nullable=False)
    gold = Column(Integer, default=0, nullable=False)
    is_daily = Column(Boolean, default=False, nullable=False)
    is_completed = Column(Boolean, default=False, nullable=False)
    approved = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    user_id = Column(Integer, ForeignKey("users.id"))
    # Recurring tasks
    recurrence = Column(String, nullable=True)        # 'daily' | 'weekly' | 'mon,wed,fri' atd.
    recurrence_days = Column(String, nullable=True)   # CSV dnu tydne: '0,2,4' (0=Po)
    parent_task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    # Feedback od rodice
    feedback = Column(Text, nullable=True)
    feedback_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="tasks")
    subtasks = relationship("Task", foreign_keys=[parent_task_id])


class Reward(Base):
    __tablename__ = "rewards"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    cost = Column(Integer, default=0, nullable=False)
    description = Column(String)
    family_id = Column(Integer, ForeignKey("families.id"), nullable=True)

    family = relationship("Family", back_populates="rewards")
    purchases = relationship("RewardPurchase", back_populates="reward")


class RewardPurchase(Base):
    __tablename__ = "reward_purchases"

    id = Column(Integer, primary_key=True)
    reward_name = Column(String, nullable=False)
    cost = Column(Integer, default=0, nullable=False)
    purchased_at = Column(DateTime(timezone=True), default=utc_now)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reward_id = Column(Integer, ForeignKey("rewards.id"), nullable=True)

    user = relationship("User", back_populates="purchases")
    reward = relationship("Reward", back_populates="purchases")


class FamilyChallenge(Base):
    __tablename__ = "family_challenges"

    id = Column(Integer, primary_key=True)
    family_id = Column(Integer, ForeignKey("families.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    target = Column(Integer, nullable=False)          # cilovy pocet splnenych ukolu
    bonus_xp = Column(Integer, default=50, nullable=False)  # odmena XP pro kazdeho
    bonus_gold = Column(Integer, default=0, nullable=False)
    starts_at = Column(DateTime(timezone=True), default=utc_now)
    ends_at = Column(DateTime(timezone=True), nullable=False)
    completed = Column(Boolean, default=False, nullable=False)

    family = relationship("Family", back_populates="challenges")
    progress_entries = relationship("ChallengeProgress", back_populates="challenge", cascade="all, delete-orphan")


class ChallengeProgress(Base):
    __tablename__ = "challenge_progress"

    id = Column(Integer, primary_key=True)
    challenge_id = Column(Integer, ForeignKey("family_challenges.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    contribution = Column(Integer, default=0, nullable=False)  # pocet ukolu splnenych v ramci vyzvy

    challenge = relationship("FamilyChallenge", back_populates="progress_entries")
    user = relationship("User")
