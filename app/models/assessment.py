import enum
from datetime import datetime, timezone
from app.extensions import db


class AssessmentStatus(enum.Enum):
    SCHEDULED = 'scheduled'
    COMPLETED = 'completed'
    CANCELLED = 'cancelled'


class Assessment(db.Model):
    __tablename__ = 'assessments'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    assessor_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    scheduled_at = db.Column(db.DateTime, nullable=False)
    status = db.Column(db.Enum(AssessmentStatus), default=AssessmentStatus.SCHEDULED, nullable=False)
    hundredms_room_id = db.Column(db.String(100), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    student = db.relationship('User', foreign_keys=[student_id],
                              backref=db.backref('assessments_as_student', lazy='dynamic'))
    assessor = db.relationship('User', foreign_keys=[assessor_id],
                               backref=db.backref('assessments_as_assessor', lazy='dynamic'))
    report = db.relationship('AssessmentReport', backref='assessment', uselist=False,
                             cascade='all, delete-orphan')

    def __repr__(self):
        return f'<Assessment {self.id} ({self.status.value})>'


class AssessmentReport(db.Model):
    __tablename__ = 'assessment_reports'

    id = db.Column(db.Integer, primary_key=True)
    assessment_id = db.Column(db.Integer, db.ForeignKey('assessments.id', ondelete='CASCADE'),
                              nullable=False, unique=True)
    strengths = db.Column(db.Text, nullable=False, default='')
    weaknesses = db.Column(db.Text, nullable=False, default='')
    recommended_track_id = db.Column(db.String(50), db.ForeignKey('tracks.id'), nullable=True)
    recommended_level = db.Column(db.String(50), nullable=True)
    personality_notes = db.Column(db.Text, nullable=True)
    overall_score = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    recommended_track = db.relationship('Track')
