import enum
from datetime import datetime, timezone
from app.extensions import db


class SessionStatus(enum.Enum):
    SCHEDULED = 'scheduled'
    LIVE = 'live'
    COMPLETED = 'completed'
    CANCELLED = 'cancelled'


class AttendanceStatus(enum.Enum):
    PRESENT = 'present'
    ABSENT = 'absent'
    LATE = 'late'
    EXCUSED = 'excused'


class GroupStudent(db.Model):
    __tablename__ = 'group_students'

    group_id = db.Column(db.Integer, db.ForeignKey('groups.id', ondelete='CASCADE'), primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    joined_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    student = db.relationship('User', backref=db.backref('group_memberships', lazy='dynamic'))


class Group(db.Model):
    __tablename__ = 'groups'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    track_id = db.Column(db.String(50), db.ForeignKey('tracks.id'), nullable=True)
    level_id = db.Column(db.String(50), nullable=True)
    teacher_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    max_students = db.Column(db.Integer, default=12)
    schedule_notes = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    students = db.relationship('GroupStudent', backref='group', lazy='dynamic',
                               cascade='all, delete-orphan')
    sessions = db.relationship('Session', backref='group', lazy='dynamic',
                               order_by='Session.scheduled_at')

    @property
    def student_count(self):
        return self.students.count()

    def __repr__(self):
        return f'<Group {self.name}>'


class Session(db.Model):
    __tablename__ = 'sessions'

    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('groups.id', ondelete='CASCADE'), nullable=False)
    teacher_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    unit_track_id = db.Column(db.String(50), nullable=True)
    unit_level_id = db.Column(db.String(50), nullable=True)
    unit_id = db.Column(db.String(50), nullable=True)
    title = db.Column(db.String(300), nullable=False)
    scheduled_at = db.Column(db.DateTime, nullable=False)
    duration_minutes = db.Column(db.Integer, default=60)
    status = db.Column(db.Enum(SessionStatus), default=SessionStatus.SCHEDULED, nullable=False)
    hundredms_room_id = db.Column(db.String(100), nullable=True)
    recording_url = db.Column(db.String(500), nullable=True)
    teacher_notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    attendance = db.relationship('Attendance', backref='session', lazy='dynamic',
                                 cascade='all, delete-orphan')
    resources = db.relationship('SessionResource', backref='session', lazy='dynamic',
                                order_by='SessionResource.sort_order',
                                cascade='all, delete-orphan')

    def __repr__(self):
        return f'<Session {self.title} ({self.status.value})>'


class Attendance(db.Model):
    __tablename__ = 'attendance'

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id', ondelete='CASCADE'), nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    joined_at = db.Column(db.DateTime, nullable=True)
    left_at = db.Column(db.DateTime, nullable=True)
    duration_seconds = db.Column(db.Integer, default=0)
    status = db.Column(db.Enum(AttendanceStatus), default=AttendanceStatus.ABSENT, nullable=False)

    student = db.relationship('User', backref=db.backref('attendance_records', lazy='dynamic'))

    __table_args__ = (
        db.UniqueConstraint('session_id', 'student_id', name='uq_attendance_session_student'),
    )


class SessionResource(db.Model):
    __tablename__ = 'session_resources'

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id', ondelete='CASCADE'), nullable=False)
    resource_id = db.Column(db.Integer, db.ForeignKey('resources.id', ondelete='CASCADE'), nullable=False)
    sort_order = db.Column(db.Integer, default=0)
    is_active = db.Column(db.Boolean, default=False)

    resource = db.relationship('Resource')
