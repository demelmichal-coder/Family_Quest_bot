"""task proof and ai anti-cheat fields

Revision ID: 0006_task_proof_anticheat
Revises: 0005_challenges_recurring_feedback
Create Date: 2026-04-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0006_task_proof_anticheat"
down_revision = "0005_challenges_recurring_feedback"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tasks", sa.Column("requires_proof", sa.Boolean(), nullable=False, server_default="0"))
    op.add_column("tasks", sa.Column("proof_text", sa.Text(), nullable=True))
    op.add_column("tasks", sa.Column("proof_media_url", sa.String(), nullable=True))
    op.add_column("tasks", sa.Column("proof_submitted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tasks", sa.Column("ai_review_score", sa.Integer(), nullable=True))
    op.add_column("tasks", sa.Column("ai_review_note", sa.Text(), nullable=True))
    op.add_column("tasks", sa.Column("ai_flagged", sa.Boolean(), nullable=False, server_default="0"))


def downgrade():
    op.drop_column("tasks", "ai_flagged")
    op.drop_column("tasks", "ai_review_note")
    op.drop_column("tasks", "ai_review_score")
    op.drop_column("tasks", "proof_submitted_at")
    op.drop_column("tasks", "proof_media_url")
    op.drop_column("tasks", "proof_text")
    op.drop_column("tasks", "requires_proof")
