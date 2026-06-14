"""add message_context_summaries

Revision ID: b7c8d9e0f1a2
Revises: a546d20ab52a
Create Date: 2026-06-14 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, Sequence[str], None] = 'a546d20ab52a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create message_context_summaries table
    op.create_table('message_context_summaries',
        sa.Column('message_id', sa.Uuid(), nullable=False),
        sa.Column('conversation_id', sa.Uuid(), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id'], ),
        sa.ForeignKeyConstraint(['message_id'], ['messages.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('message_id')
    )

    # Migrate existing context_summary data from conversations to message_context_summaries
    # For each conversation that has a context_summary, create a record linked to its last assistant message
    op.execute("""
        INSERT INTO message_context_summaries (id, message_id, conversation_id, summary, created_at, updated_at)
        SELECT
            hex(randomblob(16)),
            m.id,
            c.id,
            c.context_summary,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        FROM conversations c
        INNER JOIN (
            SELECT conversation_id, MAX(created_at) as max_created
            FROM messages
            WHERE role = 'assistant'
            GROUP BY conversation_id
        ) latest ON c.id = latest.conversation_id
        INNER JOIN messages m ON m.conversation_id = latest.conversation_id
            AND m.created_at = latest.max_created
            AND m.role = 'assistant'
        WHERE c.context_summary IS NOT NULL
          AND c.context_summary != ''
    """)

    # Drop context_summary column from conversations
    # SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
    # For now, we'll leave the column in place but it will no longer be used
    # In production with PostgreSQL, you would use: op.drop_column('conversations', 'context_summary')


def downgrade() -> None:
    """Downgrade schema."""
    # Restore context_summary from message_context_summaries
    op.execute("""
        UPDATE conversations
        SET context_summary = (
            SELECT mcs.summary
            FROM message_context_summaries mcs
            INNER JOIN messages m ON mcs.message_id = m.id
            WHERE m.conversation_id = conversations.id
            ORDER BY mcs.created_at DESC
            LIMIT 1
        )
        WHERE id IN (
            SELECT DISTINCT conversation_id
            FROM message_context_summaries
        )
    """)

    # Drop message_context_summaries table
    op.drop_table('message_context_summaries')
