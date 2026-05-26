"""streak fields on users

Revision ID: 0004_streak
Revises: 0003_user_avatar
Create Date: 2026-04-28 00:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_streak"
down_revision = "0003_user_avatar"
branch_labels = None
depends_on = None


def _has_column(inspector, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "users" not in inspector.get_table_names():
        return

    with op.batch_alter_table("users") as batch_op:
        if not _has_column(inspector, "users", "current_streak"):
            batch_op.add_column(sa.Column("current_streak", sa.Integer(), nullable=False, server_default="0"))
        if not _has_column(inspector, "users", "last_active_date"):
            batch_op.add_column(sa.Column("last_active_date", sa.Date(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "users" not in inspector.get_table_names():
        return

    with op.batch_alter_table("users") as batch_op:
        if _has_column(inspector, "users", "current_streak"):
            batch_op.drop_column("current_streak")
        if _has_column(inspector, "users", "last_active_date"):
            batch_op.drop_column("last_active_date")
