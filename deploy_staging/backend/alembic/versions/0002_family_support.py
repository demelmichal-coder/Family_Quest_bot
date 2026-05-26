"""family support

Revision ID: 0002_family_support
Revises: 0001_initial_schema
Create Date: 2026-03-20 00:30:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0002_family_support"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def _has_column(inspector, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "families" not in tables:
        op.create_table(
            "families",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("invite_code", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("invite_code"),
        )

    if "users" in tables and not _has_column(inspector, "users", "family_id"):
        with op.batch_alter_table("users") as batch_op:
            batch_op.add_column(sa.Column("family_id", sa.Integer(), nullable=True))
            batch_op.create_foreign_key("fk_users_family_id_families", "families", ["family_id"], ["id"])

    inspector = sa.inspect(bind)
    if "rewards" in tables and not _has_column(inspector, "rewards", "family_id"):
        with op.batch_alter_table("rewards") as batch_op:
            batch_op.add_column(sa.Column("family_id", sa.Integer(), nullable=True))
            batch_op.create_foreign_key("fk_rewards_family_id_families", "families", ["family_id"], ["id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "rewards" in tables and _has_column(inspector, "rewards", "family_id"):
        with op.batch_alter_table("rewards") as batch_op:
            batch_op.drop_constraint("fk_rewards_family_id_families", type_="foreignkey")
            batch_op.drop_column("family_id")

    inspector = sa.inspect(bind)
    if "users" in tables and _has_column(inspector, "users", "family_id"):
        with op.batch_alter_table("users") as batch_op:
            batch_op.drop_constraint("fk_users_family_id_families", type_="foreignkey")
            batch_op.drop_column("family_id")

    inspector = sa.inspect(bind)
    if "families" in inspector.get_table_names():
        op.drop_table("families")
