import enum
from datetime import datetime, date, timezone
from app.extensions import db


# ─── Enums ──────────────────────────────────────────────────────────────────

class QuestDifficulty(enum.Enum):
    BEGINNER = 'beginner'
    INTERMEDIATE = 'intermediate'
    ADVANCED = 'advanced'


class QuestCategory(enum.Enum):
    CODING = 'coding'
    AI = 'ai'
    ROBOTICS = 'robotics'
    DATA = 'data'
    SECURITY = 'security'


class QuestStatus(enum.Enum):
    LOCKED = 'locked'
    AVAILABLE = 'available'
    IN_PROGRESS = 'in_progress'
    COMPLETED = 'completed'


class ActivityType(enum.Enum):
    CODING = 'coding'
    GAME = 'game'
    QUIZ = 'quiz'
    DRAG_DROP = 'drag_drop'
    READING = 'reading'
    PROJECT = 'project'


class ActivitySource(enum.Enum):
    LIVE_CLASS = 'live_class'
    ASSIGNED = 'assigned'
    SELF_PACED = 'self_paced'
    QUEST = 'quest'


class RewardType(enum.Enum):
    COINS = 'coins'
    GEMS = 'gems'
    XP = 'xp'
    MYSTERY = 'mystery'
    CHEST = 'chest'


class MilestoneType(enum.Enum):
    JOINED = 'joined'
    TRACK_UNLOCKED = 'track_unlocked'
    QUEST_COMPLETED = 'quest_completed'
    LEVEL_UP = 'level_up'
    BADGE_EARNED = 'badge_earned'
    STREAK_MILESTONE = 'streak_milestone'


class MotivationType(enum.Enum):
    COMPETITION = 'competition'
    ADVENTURE = 'adventure'
    MASTERY = 'mastery'
    SOCIAL = 'social'


# ─── Models ─────────────────────────────────────────────────────────────────

class StudentWallet(db.Model):
    __tablename__ = 'student_wallets'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'),
                           nullable=False, unique=True, index=True)
    coins = db.Column(db.Integer, nullable=False, default=0)
    gems = db.Column(db.Integer, nullable=False, default=0)

    student = db.relationship('User', backref=db.backref('wallet', uselist=False))

    def __repr__(self):
        return f'<Wallet student={self.student_id} coins={self.coins} gems={self.gems}>'


class CurrencyTransaction(db.Model):
    __tablename__ = 'currency_transactions'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'),
                           nullable=False, index=True)
    currency = db.Column(db.String(10), nullable=False)  # 'coins' or 'gems'
    amount = db.Column(db.Integer, nullable=False)
    reason = db.Column(db.String(200), nullable=False, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    student = db.relationship('User', backref=db.backref('currency_transactions', lazy='dynamic'))


class Quest(db.Model):
    __tablename__ = 'quests'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    title_ar = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=False, default='')
    description_ar = db.Column(db.Text, nullable=False, default='')
    difficulty = db.Column(db.Enum(QuestDifficulty), nullable=False, default=QuestDifficulty.BEGINNER)
    category = db.Column(db.Enum(QuestCategory), nullable=False, default=QuestCategory.CODING)
    xp_reward = db.Column(db.Integer, nullable=False, default=50)
    coin_reward = db.Column(db.Integer, nullable=False, default=20)
    gem_reward = db.Column(db.Integer, nullable=False, default=0)
    required_level = db.Column(db.Integer, nullable=False, default=1)
    prerequisite_quest_id = db.Column(db.Integer, db.ForeignKey('quests.id'), nullable=True)
    track_id = db.Column(db.String(50), db.ForeignKey('tracks.id'), nullable=True)
    estimated_minutes = db.Column(db.Integer, nullable=False, default=15)
    sort_order = db.Column(db.Integer, nullable=False, default=0)

    prerequisite = db.relationship('Quest', remote_side=[id], backref='unlocks')
    track = db.relationship('Track', backref=db.backref('quests', lazy='dynamic'))

    def __repr__(self):
        return f'<Quest {self.title}>'


class StudentQuest(db.Model):
    __tablename__ = 'student_quests'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'),
                           nullable=False, index=True)
    quest_id = db.Column(db.Integer, db.ForeignKey('quests.id', ondelete='CASCADE'),
                         nullable=False)
    status = db.Column(db.Enum(QuestStatus), nullable=False, default=QuestStatus.AVAILABLE)
    started_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)

    student = db.relationship('User', backref=db.backref('student_quests', lazy='dynamic'))
    quest = db.relationship('Quest', backref=db.backref('student_progress', lazy='dynamic'))

    __table_args__ = (
        db.UniqueConstraint('student_id', 'quest_id', name='uq_student_quest'),
    )


class Activity(db.Model):
    __tablename__ = 'activities'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    title_ar = db.Column(db.String(200), nullable=False)
    activity_type = db.Column(db.Enum(ActivityType), nullable=False, default=ActivityType.CODING)
    source = db.Column(db.Enum(ActivitySource), nullable=False, default=ActivitySource.SELF_PACED)
    difficulty = db.Column(db.Enum(QuestDifficulty), nullable=False, default=QuestDifficulty.BEGINNER)
    xp_reward = db.Column(db.Integer, nullable=False, default=20)
    coin_reward = db.Column(db.Integer, nullable=False, default=10)
    track_id = db.Column(db.String(50), db.ForeignKey('tracks.id'), nullable=True)
    quest_id = db.Column(db.Integer, db.ForeignKey('quests.id'), nullable=True)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id'), nullable=True)
    due_date = db.Column(db.DateTime, nullable=True)
    estimated_minutes = db.Column(db.Integer, nullable=False, default=10)
    sort_order = db.Column(db.Integer, nullable=False, default=0)

    track = db.relationship('Track', backref=db.backref('activities', lazy='dynamic'))
    quest = db.relationship('Quest', backref=db.backref('activities', lazy='dynamic'))

    def __repr__(self):
        return f'<Activity {self.title}>'


class StudentActivity(db.Model):
    __tablename__ = 'student_activities'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'),
                           nullable=False, index=True)
    activity_id = db.Column(db.Integer, db.ForeignKey('activities.id', ondelete='CASCADE'),
                            nullable=False)
    status = db.Column(db.String(20), nullable=False, default='pending')  # pending/in_progress/completed
    started_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    score = db.Column(db.Integer, nullable=True)

    student = db.relationship('User', backref=db.backref('student_activities', lazy='dynamic'))
    activity = db.relationship('Activity', backref=db.backref('student_progress', lazy='dynamic'))

    __table_args__ = (
        db.UniqueConstraint('student_id', 'activity_id', name='uq_student_activity'),
    )


class DailyReward(db.Model):
    __tablename__ = 'daily_rewards'

    id = db.Column(db.Integer, primary_key=True)
    day_number = db.Column(db.Integer, nullable=False, unique=True)  # 1-5
    reward_type = db.Column(db.Enum(RewardType), nullable=False)
    amount = db.Column(db.Integer, nullable=False, default=10)
    label_ar = db.Column(db.String(100), nullable=False, default='')
    label_en = db.Column(db.String(100), nullable=False, default='')


class StudentDailyReward(db.Model):
    __tablename__ = 'student_daily_rewards'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'),
                           nullable=False, index=True)
    day_number = db.Column(db.Integer, nullable=False)
    claimed_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    cycle_start = db.Column(db.Date, nullable=False)

    student = db.relationship('User', backref=db.backref('daily_rewards_claimed', lazy='dynamic'))

    __table_args__ = (
        db.UniqueConstraint('student_id', 'day_number', 'cycle_start', name='uq_student_daily_reward'),
    )


class StudentUnitProgress(db.Model):
    __tablename__ = 'student_unit_progress'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'),
                           nullable=False, index=True)
    track_id = db.Column(db.String(50), nullable=False)
    level_id = db.Column(db.String(50), nullable=False)
    unit_id = db.Column(db.String(50), nullable=False)
    status = db.Column(db.String(20), nullable=False, default='locked')  # locked/current/completed
    completed_at = db.Column(db.DateTime, nullable=True)

    student = db.relationship('User', backref=db.backref('unit_progress', lazy='dynamic'))

    __table_args__ = (
        db.UniqueConstraint('student_id', 'track_id', 'level_id', 'unit_id',
                            name='uq_student_unit_progress'),
        db.ForeignKeyConstraint(
            ['track_id', 'level_id', 'unit_id'],
            ['units.track_id', 'units.level_id', 'units.id'],
            ondelete='CASCADE'
        ),
    )


class JourneyMilestone(db.Model):
    __tablename__ = 'journey_milestones'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'),
                           nullable=False, index=True)
    milestone_type = db.Column(db.Enum(MilestoneType), nullable=False)
    title_ar = db.Column(db.String(200), nullable=False)
    title_en = db.Column(db.String(200), nullable=False, default='')
    detail = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    student = db.relationship('User', backref=db.backref('milestones', lazy='dynamic'))


class LessonContent(db.Model):
    __tablename__ = 'lesson_contents'

    id = db.Column(db.Integer, primary_key=True)
    track_id = db.Column(db.String(50), nullable=False)
    level_id = db.Column(db.String(50), nullable=False)
    unit_id = db.Column(db.String(50), nullable=False)
    chapter_number = db.Column(db.Integer, nullable=False, default=1)
    title_ar = db.Column(db.String(200), nullable=False)
    title_en = db.Column(db.String(200), nullable=False, default='')
    content_html = db.Column(db.Text, nullable=False, default='')
    quiz_json = db.Column(db.Text, nullable=True)  # JSON string
    glossary_json = db.Column(db.Text, nullable=True)  # JSON string

    __table_args__ = (
        db.ForeignKeyConstraint(
            ['track_id', 'level_id', 'unit_id'],
            ['units.track_id', 'units.level_id', 'units.id'],
            ondelete='CASCADE'
        ),
    )


class LessonProgress(db.Model):
    __tablename__ = 'lesson_progress'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'),
                           nullable=False, index=True)
    lesson_id = db.Column(db.Integer, db.ForeignKey('lesson_contents.id', ondelete='CASCADE'),
                          nullable=False)
    completed = db.Column(db.Boolean, nullable=False, default=False)
    completed_at = db.Column(db.DateTime, nullable=True)

    student = db.relationship('User', backref=db.backref('lesson_progress', lazy='dynamic'))
    lesson = db.relationship('LessonContent', backref=db.backref('student_progress', lazy='dynamic'))

    __table_args__ = (
        db.UniqueConstraint('student_id', 'lesson_id', name='uq_student_lesson'),
    )
