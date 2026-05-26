"""challenges, recurring tasks, task feedback

Revision ID: 0005_challenges_recurring_feedback
Revises: 0004_streak
Create Date: 2026-04-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0005_challenges_recurring_feedback"
down_revision = "0004_streak"
branch_labels = None
depends_on = None


def upgrade():
    # Task: recurrence + feedback fields
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("recurrence", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("recurrence_days", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("parent_task_id", sa.Integer(), sa.ForeignKey("tasks.id"), nullable=True))
        batch_op.add_column(sa.Column("feedback", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("feedback_at", sa.DateTime(timezone=True), nullable=True))

    # Family challenges
    op.create_table(
        "family_challenges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("family_id", sa.Integer(), sa.ForeignKey("families.id"), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("target", sa.Integer(), nullable=False),
        sa.Column("bonus_xp", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("bonus_gold", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default="0"),
    )

    # Challenge progress (per-user contribution)
    op.create_table(
        "challenge_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("challenge_id", sa.Integer(), sa.ForeignKey("family_challenges.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("contribution", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade():
    op.drop_table("challenge_progress")
    op.drop_table("family_challenges")
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_column("feedback_at")
        batch_op.drop_column("feedback")
        batch_op.drop_column("parent_task_id")
        batch_op.drop_column("recurrence_days")
        batch_op.drop_column("recurrence")
