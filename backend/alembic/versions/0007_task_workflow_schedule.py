"""task workflow timestamps and schedule support

Revision ID: 0007_task_workflow_schedule
Revises: 0006_task_proof_anticheat
Create Date: 2026-04-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0007_task_workflow_schedule"
down_revision = "0006_task_proof_anticheat"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tasks", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tasks", sa.Column("approval_requested_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tasks", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tasks", sa.Column("due_time", sa.String(), nullable=True))
    op.add_column("tasks", sa.Column("last_reminded_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("tasks", "last_reminded_at")
    op.drop_column("tasks", "due_time")
    op.drop_column("tasks", "approved_at")
    op.drop_column("tasks", "approval_requested_at")
    op.drop_column("tasks", "completed_at")