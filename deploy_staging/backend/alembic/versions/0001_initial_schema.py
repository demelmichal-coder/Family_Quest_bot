"""initial schema

Revision ID: 0001_initial_schema
Revises: None
Create Date: 2026-03-20 00:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "rewards" not in tables:
        op.create_table(
            "rewards",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("cost", sa.Integer(), nullable=True),
            sa.Column("description", sa.String(), nullable=True),
        )
    if "users" not in tables:
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("telegram_id", sa.String(), nullable=False),
            sa.Column("username", sa.String(), nullable=True),
            sa.Column("role", sa.String(), nullable=False),
            sa.Column("xp", sa.Integer(), nullable=True),
            sa.Column("gold", sa.Integer(), nullable=True),
            sa.UniqueConstraint("telegram_id"),
        )
    if "reward_purchases" not in tables:
        op.create_table(
            "reward_purchases",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("reward_name", sa.String(), nullable=False),
            sa.Column("cost", sa.Integer(), nullable=True),
            sa.Column("purchased_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("reward_id", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(["reward_id"], ["rewards.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        )
    if "tasks" not in tables:
        op.create_table(
            "tasks",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("xp", sa.Integer(), nullable=True),
            sa.Column("gold", sa.Integer(), nullable=True),
            sa.Column("is_daily", sa.Boolean(), nullable=True),
            sa.Column("is_completed", sa.Boolean(), nullable=True),
            sa.Column("approved", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "tasks" in tables:
        op.drop_table("tasks")
    if "reward_purchases" in tables:
        op.drop_table("reward_purchases")
    if "users" in tables:
        op.drop_table("users")
    if "rewards" in tables:
        op.drop_table("rewards")
