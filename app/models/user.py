import enum
from datetime import datetime, timezone
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin
from app.extensions import db, login_manager


class Role(enum.Enum):
    ADMIN = 'admin'
    TEACHER = 'teacher'
    STUDENT = 'student'
    PARENT = 'parent'
    ASSESSOR = 'assessor'


parent_student = db.Table(
    'parent_student',
    db.Column('parent_id', db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
    db.Column('student_id', db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
)


class User(UserMixin, db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    name_ar = db.Column(db.String(255), nullable=False)
    name_en = db.Column(db.String(255), nullable=False, default='')
    role = db.Column(db.Enum(Role), nullable=False, default=Role.STUDENT)
    avatar_url = db.Column(db.String(500), nullable=True)
    phone = db.Column(db.String(20), nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    bio = db.Column(db.Text, nullable=True)
    motivation_type = db.Column(db.String(20), nullable=True)  # competition/adventure/mastery/social
    onboarding_completed = db.Column(db.Boolean, default=False, nullable=False)

    # Parent-Student relationship
    children = db.relationship(
        'User', secondary=parent_student,
        primaryjoin=(id == parent_student.c.parent_id),
        secondaryjoin=(id == parent_student.c.student_id),
        backref=db.backref('parents', lazy='dynamic'),
        lazy='dynamic'
    )

    # Teacher relationships
    teaching_groups = db.relationship('Group', backref='teacher', lazy='dynamic',
                                     foreign_keys='Group.teacher_id')
    teaching_sessions = db.relationship('Session', backref='teacher', lazy='dynamic',
                                        foreign_keys='Session.teacher_id')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256')

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    @property
    def display_name(self):
        return self.name_ar or self.name_en

    @property
    def is_admin(self):
        return self.role == Role.ADMIN

    @property
    def is_teacher(self):
        return self.role == Role.TEACHER

    @property
    def is_student(self):
        return self.role == Role.STUDENT

    @property
    def is_parent(self):
        return self.role == Role.PARENT

    @property
    def is_assessor(self):
        return self.role == Role.ASSESSOR

    def __repr__(self):
        return f'<User {self.email} ({self.role.value})>'


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))
