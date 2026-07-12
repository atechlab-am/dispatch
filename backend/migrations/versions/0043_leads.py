"""Leads — sales pipeline with duplicate detection, bulk actions, CSV
import/export, an activity timeline, and one-click conversion to a Client.

Revision ID: 0043
Revises: 0042
Create Date: 2026-07-11
"""
from alembic import op
import sqlalchemy as sa

revision = "0043"
down_revision = "0042"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "leads",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("business_name", sa.String(255), nullable=False),
        sa.Column("title", sa.String(255), nullable=False, server_default=""),
        sa.Column("industry", sa.String(120), nullable=False, server_default=""),
        sa.Column("address", sa.String(500), nullable=False, server_default=""),
        sa.Column("area", sa.String(120), nullable=False, server_default=""),
        sa.Column("phone", sa.String(50), nullable=False, server_default=""),
        sa.Column("website", sa.String(500), nullable=False, server_default=""),
        sa.Column("contact_name", sa.String(255), nullable=False, server_default=""),
        sa.Column("contact_email", sa.String(255), nullable=False, server_default=""),
        sa.Column("contact_phone", sa.String(50), nullable=False, server_default=""),
        sa.Column(
            "stage",
            sa.Enum("new", "contacted", "qualified", "proposal", "won", "lost", name="leadstage"),
            nullable=False,
            server_default="new",
        ),
        sa.Column(
            "source",
            sa.Enum("referral", "website", "outbound", "event", "other", name="leadsource"),
            nullable=False,
            server_default="other",
        ),
        sa.Column(
            "priority",
            sa.Enum("high", "medium", "low", name="leadpriority"),
            nullable=False,
            server_default="medium",
        ),
        sa.Column(
            "outreach_channel",
            sa.Enum("email", "phone", "in_person", "other", name="outreachchannel"),
            nullable=True,
        ),
        sa.Column("value_estimate", sa.Numeric(12, 2), nullable=True),
        sa.Column("lost_reason", sa.Text(), nullable=False, server_default=""),
        sa.Column("date_contacted", sa.Date(), nullable=True),
        sa.Column("follow_up_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("owner_id", sa.Integer(), nullable=True),
        sa.Column("converted_client_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["converted_client_id"], ["clients.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_leads_id", "leads", ["id"], unique=False)
    op.create_index("ix_leads_business_name", "leads", ["business_name"], unique=False)
    op.create_index("ix_leads_contact_email", "leads", ["contact_email"], unique=False)

    op.create_table(
        "lead_activities",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lead_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column(
            "type",
            sa.Enum("call", "email", "note", "meeting", "stage_change", name="leadactivitytype"),
            nullable=False,
        ),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lead_activities_id", "lead_activities", ["id"], unique=False)
    op.create_index("ix_lead_activities_lead_id", "lead_activities", ["lead_id"], unique=False)


def downgrade():
    op.drop_index("ix_lead_activities_lead_id", table_name="lead_activities")
    op.drop_index("ix_lead_activities_id", table_name="lead_activities")
    op.drop_table("lead_activities")
    op.drop_index("ix_leads_contact_email", table_name="leads")
    op.drop_index("ix_leads_business_name", table_name="leads")
    op.drop_index("ix_leads_id", table_name="leads")
    op.drop_table("leads")
    for enum_name in ("leadactivitytype", "outreachchannel", "leadpriority", "leadsource", "leadstage"):
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
