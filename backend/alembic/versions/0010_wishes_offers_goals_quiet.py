"""reward wishes, family goals, open task offers, quiet hours

Revision ID: 0010_wishes_offers_goals_quiet
Revises: 0009_pin_auth_and_push
Create Date: 2026-11-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0010_wishes_offers_goals_quiet"
down_revision = "0009_pin_auth_and_push"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "reward_wishes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("family_id", sa.Integer(), sa.ForeignKey("families.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("suggested_cost", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("parent_note", sa.String(), nullable=True),
        sa.Column("reward_id", sa.Integer(), sa.ForeignKey("rewards.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "family_goals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("family_id", sa.Integer(), sa.ForeignKey("families.id"), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("target_xp", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Volny ukol k rozebrani: user_id je NULL, rodina je v offer_family_id.
    op.add_column("tasks", sa.Column("offer_family_id", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("quiet_start", sa.String(), nullable=True))
    op.add_column("users", sa.Column("quiet_end", sa.String(), nullable=True))


def downgrade():
    op.drop_column("users", "quiet_end")
    op.drop_column("users", "quiet_start")
    op.drop_column("tasks", "offer_family_id")
    op.drop_table("family_goals")
    op.drop_table("reward_wishes")
