"""child age for AI daily plan

Revision ID: 0011_child_age
Revises: 0010_wishes_offers_goals_quiet
Create Date: 2026-11-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0011_child_age"
down_revision = "0010_wishes_offers_goals_quiet"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("age", sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table("users") as batch:
        batch.drop_column("age")
