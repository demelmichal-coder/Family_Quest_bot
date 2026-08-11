# database/__init__.py - SQLAlchemy engine a session
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from config import settings

connect_args = {"check_same_thread": False} if settings.DB_URL.startswith("sqlite") else {}
engine = create_engine(settings.DB_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
