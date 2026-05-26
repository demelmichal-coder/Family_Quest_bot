"""add due_date to tasks

Revision ID: 0008_task_due_date
Revises: 0007_task_workflow_schedule
Create Date: 2026-05-26
"""

from alembic import op
import sqlalchemy as sa

revision = "0008_task_due_date"
down_revision = "0007_task_workflow_schedule"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tasks", sa.Column("due_date", sa.Date(), nullable=True))


def downgrade():
    op.drop_column("tasks", "due_date")
