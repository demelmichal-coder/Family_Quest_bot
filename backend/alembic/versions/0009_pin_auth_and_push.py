"""add PIN auth columns to users and push_subscriptions table

Revision ID: 0009_pin_auth_and_push
Revises: 0008_task_due_date
Create Date: 2026-09-10
"""

from alembic import op
import sqlalchemy as sa

revision = "0009_pin_auth_and_push"
down_revision = "0008_task_due_date"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("pin_hash", sa.String(), nullable=True))
    op.add_column("users", sa.Column("pin_set_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("pin_failed_attempts", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("pin_locked_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("auth_kind", sa.String(), nullable=False, server_default="telegram"))

    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("endpoint", sa.String(), nullable=False, unique=True),
        sa.Column("p256dh", sa.String(), nullable=False),
        sa.Column("auth", sa.String(), nullable=False),
        sa.Column("user_agent", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_table("push_subscriptions")
    op.drop_column("users", "auth_kind")
    op.drop_column("users", "pin_locked_until")
    op.drop_column("users", "pin_failed_attempts")
    op.drop_column("users", "pin_set_at")
    op.drop_column("users", "pin_hash")
