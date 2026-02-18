from datetime import datetime, timezone
from app.extensions import db


class Homework(db.Model):
    __tablename__ = 'homework'

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id', ondelete='SET NULL'), nullable=True)
    group_id = db.Column(db.Integer, db.ForeignKey('groups.id', ondelete='CASCADE'), nullable=False)
    teacher_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(300), nullable=False)
    description = db.Column(db.Text, nullable=False, default='')
    due_date = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    group = db.relationship('Group', backref=db.backref('homework_list', lazy='dynamic'))
    teacher = db.relationship('User', backref=db.backref('assigned_homework', lazy='dynamic'))
    session = db.relationship('Session', backref=db.backref('homework_list', lazy='dynamic'))
    submissions = db.relationship('HomeworkSubmission', backref='homework', lazy='dynamic',
                                  cascade='all, delete-orphan')

    def __repr__(self):
        return f'<Homework {self.title}>'


class HomeworkSubmission(db.Model):
    __tablename__ = 'homework_submissions'

    id = db.Column(db.Integer, primary_key=True)
    homework_id = db.Column(db.Integer, db.ForeignKey('homework.id', ondelete='CASCADE'), nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    content = db.Column(db.Text, nullable=True)
    file_url = db.Column(db.String(500), nullable=True)
    grade = db.Column(db.Integer, nullable=True)
    feedback = db.Column(db.Text, nullable=True)
    submitted_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    graded_at = db.Column(db.DateTime, nullable=True)

    student = db.relationship('User', backref=db.backref('homework_submissions', lazy='dynamic'))

    __table_args__ = (
        db.UniqueConstraint('homework_id', 'student_id', name='uq_submission_homework_student'),
    )
