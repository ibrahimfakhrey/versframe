import enum
from datetime import datetime, timezone
from app.extensions import db


class ResourceType(enum.Enum):
    SLIDES = 'slides'
    CODE_EXERCISE = 'code_exercise'
    QNA = 'qna'
    WHITEBOARD = 'whiteboard'
    SCREEN_SHARE = 'screen_share'
    VIDEO = 'video'
    GAME = 'game'


class FileType(enum.Enum):
    PDF = 'pdf'
    IMAGE = 'image'
    CODE_TEMPLATE = 'code_template'
    SLIDE_IMAGE = 'slide_image'


class Resource(db.Model):
    __tablename__ = 'resources'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(300), nullable=False)
    name_ar = db.Column(db.String(300), nullable=False, default='')
    type = db.Column(db.Enum(ResourceType), nullable=False)
    track_id = db.Column(db.String(50), db.ForeignKey('tracks.id'), nullable=True)
    level_id = db.Column(db.String(50), nullable=True)
    unit_id = db.Column(db.String(50), nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    config_json = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    files = db.relationship('ResourceFile', backref='resource', lazy='dynamic',
                            order_by='ResourceFile.sort_order', cascade='all, delete-orphan')
    creator = db.relationship('User', backref='created_resources')

    def __repr__(self):
        return f'<Resource {self.name} ({self.type.value})>'


class ResourceFile(db.Model):
    __tablename__ = 'resource_files'

    id = db.Column(db.Integer, primary_key=True)
    resource_id = db.Column(db.Integer, db.ForeignKey('resources.id', ondelete='CASCADE'), nullable=False)
    file_type = db.Column(db.Enum(FileType), nullable=False)
    s3_key = db.Column(db.String(500), nullable=False)
    filename = db.Column(db.String(300), nullable=False)
    sort_order = db.Column(db.Integer, default=0)
