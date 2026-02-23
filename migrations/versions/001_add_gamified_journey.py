"""Add gamified journey: wallets, quests, activities, daily rewards, milestones, lessons, user bio/onboarding, badge tier

Revision ID: 001_journey
Revises:
Create Date: 2026-02-23
"""
from alembic import op
import sqlalchemy as sa

revision = '001_journey'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # --- Add columns to existing tables ---

    # users table: bio, motivation_type, onboarding_completed
    op.add_column('users', sa.Column('bio', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('motivation_type', sa.String(20), nullable=True))
    op.add_column('users', sa.Column('onboarding_completed', sa.Boolean(), nullable=False, server_default='0'))

    # badges table: tier
    op.add_column('badges', sa.Column('tier', sa.Integer(), nullable=False, server_default='1'))

    # --- Create new tables ---

    op.create_table('student_wallets',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('student_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('coins', sa.Integer(), nullable=False, default=0),
        sa.Column('gems', sa.Integer(), nullable=False, default=0),
    )
    op.create_index('ix_student_wallets_student_id', 'student_wallets', ['student_id'])

    op.create_table('currency_transactions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('student_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('currency', sa.String(10), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('reason', sa.String(200), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime()),
    )
    op.create_index('ix_currency_transactions_student_id', 'currency_transactions', ['student_id'])

    op.create_table('quests',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('title_ar', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('description_ar', sa.Text(), nullable=False, server_default=''),
        sa.Column('difficulty', sa.String(20), nullable=False, server_default='beginner'),
        sa.Column('category', sa.String(20), nullable=False, server_default='coding'),
        sa.Column('xp_reward', sa.Integer(), nullable=False, server_default='50'),
        sa.Column('coin_reward', sa.Integer(), nullable=False, server_default='20'),
        sa.Column('gem_reward', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('required_level', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('prerequisite_quest_id', sa.Integer(), sa.ForeignKey('quests.id'), nullable=True),
        sa.Column('track_id', sa.String(50), sa.ForeignKey('tracks.id'), nullable=True),
        sa.Column('estimated_minutes', sa.Integer(), nullable=False, server_default='15'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
    )

    op.create_table('student_quests',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('student_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('quest_id', sa.Integer(), sa.ForeignKey('quests.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='available'),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('student_id', 'quest_id', name='uq_student_quest'),
    )
    op.create_index('ix_student_quests_student_id', 'student_quests', ['student_id'])

    op.create_table('activities',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('title_ar', sa.String(200), nullable=False),
        sa.Column('activity_type', sa.String(20), nullable=False, server_default='coding'),
        sa.Column('source', sa.String(20), nullable=False, server_default='self_paced'),
        sa.Column('difficulty', sa.String(20), nullable=False, server_default='beginner'),
        sa.Column('xp_reward', sa.Integer(), nullable=False, server_default='20'),
        sa.Column('coin_reward', sa.Integer(), nullable=False, server_default='10'),
        sa.Column('track_id', sa.String(50), sa.ForeignKey('tracks.id'), nullable=True),
        sa.Column('quest_id', sa.Integer(), sa.ForeignKey('quests.id'), nullable=True),
        sa.Column('session_id', sa.Integer(), sa.ForeignKey('sessions.id'), nullable=True),
        sa.Column('due_date', sa.DateTime(), nullable=True),
        sa.Column('estimated_minutes', sa.Integer(), nullable=False, server_default='10'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
    )

    op.create_table('student_activities',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('student_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('activity_id', sa.Integer(), sa.ForeignKey('activities.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('score', sa.Integer(), nullable=True),
        sa.UniqueConstraint('student_id', 'activity_id', name='uq_student_activity'),
    )
    op.create_index('ix_student_activities_student_id', 'student_activities', ['student_id'])

    op.create_table('daily_rewards',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('day_number', sa.Integer(), nullable=False, unique=True),
        sa.Column('reward_type', sa.String(20), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False, server_default='10'),
        sa.Column('label_ar', sa.String(100), nullable=False, server_default=''),
        sa.Column('label_en', sa.String(100), nullable=False, server_default=''),
    )

    op.create_table('student_daily_rewards',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('student_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('day_number', sa.Integer(), nullable=False),
        sa.Column('claimed_at', sa.DateTime()),
        sa.Column('cycle_start', sa.Date(), nullable=False),
        sa.UniqueConstraint('student_id', 'day_number', 'cycle_start', name='uq_student_daily_reward'),
    )
    op.create_index('ix_student_daily_rewards_student_id', 'student_daily_rewards', ['student_id'])

    op.create_table('student_unit_progress',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('student_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('track_id', sa.String(50), nullable=False),
        sa.Column('level_id', sa.String(50), nullable=False),
        sa.Column('unit_id', sa.String(50), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='locked'),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('student_id', 'track_id', 'level_id', 'unit_id', name='uq_student_unit_progress'),
        sa.ForeignKeyConstraint(['track_id', 'level_id', 'unit_id'],
                                ['units.track_id', 'units.level_id', 'units.id'],
                                ondelete='CASCADE'),
    )
    op.create_index('ix_student_unit_progress_student_id', 'student_unit_progress', ['student_id'])

    op.create_table('journey_milestones',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('student_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('milestone_type', sa.String(30), nullable=False),
        sa.Column('title_ar', sa.String(200), nullable=False),
        sa.Column('title_en', sa.String(200), nullable=False, server_default=''),
        sa.Column('detail', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime()),
    )
    op.create_index('ix_journey_milestones_student_id', 'journey_milestones', ['student_id'])

    op.create_table('lesson_contents',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('track_id', sa.String(50), nullable=False),
        sa.Column('level_id', sa.String(50), nullable=False),
        sa.Column('unit_id', sa.String(50), nullable=False),
        sa.Column('chapter_number', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('title_ar', sa.String(200), nullable=False),
        sa.Column('title_en', sa.String(200), nullable=False, server_default=''),
        sa.Column('content_html', sa.Text(), nullable=False, server_default=''),
        sa.Column('quiz_json', sa.Text(), nullable=True),
        sa.Column('glossary_json', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['track_id', 'level_id', 'unit_id'],
                                ['units.track_id', 'units.level_id', 'units.id'],
                                ondelete='CASCADE'),
    )

    op.create_table('lesson_progress',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('student_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('lesson_id', sa.Integer(), sa.ForeignKey('lesson_contents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('completed', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('student_id', 'lesson_id', name='uq_student_lesson'),
    )
    op.create_index('ix_lesson_progress_student_id', 'lesson_progress', ['student_id'])


def downgrade():
    op.drop_table('lesson_progress')
    op.drop_table('lesson_contents')
    op.drop_table('journey_milestones')
    op.drop_table('student_unit_progress')
    op.drop_table('student_daily_rewards')
    op.drop_table('daily_rewards')
    op.drop_table('student_activities')
    op.drop_table('activities')
    op.drop_table('student_quests')
    op.drop_table('quests')
    op.drop_table('currency_transactions')
    op.drop_table('student_wallets')
    op.drop_column('badges', 'tier')
    op.drop_column('users', 'onboarding_completed')
    op.drop_column('users', 'motivation_type')
    op.drop_column('users', 'bio')
