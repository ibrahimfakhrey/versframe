import enum
from datetime import datetime, timezone
from app.extensions import db


class NotificationType(enum.Enum):
    SESSION_REMINDER = 'session_reminder'
    HOMEWORK = 'homework'
    GRADE = 'grade'
    BADGE = 'badge'
    SYSTEM = 'system'
    MESSAGE = 'message'


class Notification(db.Model):
    __tablename__ = 'notifications'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    message = db.Column(db.Text, nullable=False, default='')
    type = db.Column(db.Enum(NotificationType), default=NotificationType.SYSTEM, nullable=False)
    is_read = db.Column(db.Boolean, default=False, nullable=False)
    link = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    user = db.relationship('User', backref=db.backref('notifications', lazy='dynamic',
                                                       order_by='Notification.created_at.desc()'))

    def __repr__(self):
        return f'<Notification {self.title} -> {self.user_id}>'
