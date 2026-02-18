import enum
from datetime import datetime, date, timezone
from app.extensions import db


class BadgeCriteria(enum.Enum):
    SESSIONS_ATTENDED = 'sessions_attended'
    XP_EARNED = 'xp_earned'
    STREAK_DAYS = 'streak_days'
    ASSIGNMENTS_COMPLETED = 'assignments_completed'
    QUESTIONS_ASKED = 'questions_asked'
    CUSTOM = 'custom'


class StudentXP(db.Model):
    __tablename__ = 'student_xp'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    amount = db.Column(db.Integer, nullable=False)
    reason = db.Column(db.String(200), nullable=False)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id', ondelete='SET NULL'), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    student = db.relationship('User', backref=db.backref('xp_records', lazy='dynamic'))

    @staticmethod
    def total_xp(student_id):
        from sqlalchemy import func
        result = db.session.query(func.coalesce(func.sum(StudentXP.amount), 0)).filter_by(
            student_id=student_id
        ).scalar()
        return result

    @staticmethod
    def current_level(total_xp):
        thresholds = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5000,
                      6500, 8000, 10000, 12500, 15000, 18000, 21000, 25000]
        level = 1
        for i, t in enumerate(thresholds):
            if total_xp >= t:
                level = i + 1
            else:
                break
        return level

    @staticmethod
    def level_title(level):
        titles = {
            1: ('مستكشف', 'Explorer'),
            2: ('مبتدئ', 'Beginner'),
            3: ('متعلم', 'Learner'),
            4: ('مغامر', 'Adventurer'),
            5: ('رائد', 'Pioneer'),
            6: ('بطل', 'Hero'),
            7: ('خبير', 'Expert'),
            8: ('نجم', 'Star'),
            9: ('رائد فضاء', 'Astronaut'),
            10: ('قائد', 'Commander'),
            11: ('أسطورة', 'Legend'),
            12: ('عبقري', 'Genius'),
            13: ('ملهم', 'Visionary'),
            14: ('قائد النجوم', 'Star Commander'),
            15: ('سيد الكون', 'Universe Master'),
        }
        return titles.get(level, ('محارب الكود', 'Code Warrior'))


class Badge(db.Model):
    __tablename__ = 'badges'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    name_ar = db.Column(db.String(100), nullable=False)
    icon = db.Column(db.String(100), nullable=False, default='star')
    description = db.Column(db.String(300), nullable=False, default='')
    description_ar = db.Column(db.String(300), nullable=False, default='')
    criteria_type = db.Column(db.Enum(BadgeCriteria), nullable=False)
    criteria_value = db.Column(db.Integer, nullable=False, default=1)

    def __repr__(self):
        return f'<Badge {self.name}>'


StudentBadge = db.Table(
    'student_badges',
    db.Column('student_id', db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
    db.Column('badge_id', db.Integer, db.ForeignKey('badges.id', ondelete='CASCADE'), primary_key=True),
    db.Column('earned_at', db.DateTime, default=lambda: datetime.now(timezone.utc)),
)

# Add relationship to User model via backref
Badge.holders = db.relationship('User', secondary=StudentBadge,
                                backref=db.backref('badges_earned', lazy='dynamic'),
                                lazy='dynamic')


class Streak(db.Model):
    __tablename__ = 'streaks'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'),
                           nullable=False, unique=True)
    current_streak = db.Column(db.Integer, default=0, nullable=False)
    longest_streak = db.Column(db.Integer, default=0, nullable=False)
    last_activity_date = db.Column(db.Date, nullable=True)

    student = db.relationship('User', backref=db.backref('streak', uselist=False))

    def update_streak(self):
        today = date.today()
        if self.last_activity_date is None:
            self.current_streak = 1
        elif self.last_activity_date == today:
            return  # Already counted today
        elif (today - self.last_activity_date).days == 1:
            self.current_streak += 1
        else:
            self.current_streak = 1

        self.last_activity_date = today
        if self.current_streak > self.longest_streak:
            self.longest_streak = self.current_streak
