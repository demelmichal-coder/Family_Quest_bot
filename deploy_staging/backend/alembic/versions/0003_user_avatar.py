"""user avatar support

Revision ID: 0003_user_avatar
Revises: 0002_family_support
Create Date: 2026-03-27 00:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_user_avatar"
down_revision = "0002_family_support"
branch_labels = None
depends_on = None


def _has_column(inspector, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "users" in inspector.get_table_names() and not _has_column(inspector, "users", "avatar"):
        with op.batch_alter_table("users") as batch_op:
            batch_op.add_column(sa.Column("avatar", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "users" in inspector.get_table_names() and _has_column(inspector, "users", "avatar"):
        with op.batch_alter_table("users") as batch_op:
            batch_op.drop_column("avatar")
