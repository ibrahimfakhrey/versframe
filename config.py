import os
from datetime import timedelta

basedir = os.path.abspath(os.path.dirname(__file__))


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-change-in-production')
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'jwt-dev-secret')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)

    # Flask-Login
    REMEMBER_COOKIE_DURATION = timedelta(days=30)

    # File uploads
    UPLOAD_FOLDER = os.path.join(basedir, 'app', 'static', 'uploads')
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB

    # S3
    S3_BUCKET = os.environ.get('S3_BUCKET', '')
    S3_REGION = os.environ.get('S3_REGION', 'eu-west-1')
    AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID', '')
    AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY', '')

    # 100ms
    HMS_ACCESS_KEY = os.environ.get('HMS_ACCESS_KEY', '')
    HMS_SECRET = os.environ.get('HMS_SECRET', '')
    HMS_TEMPLATE_ID = os.environ.get('HMS_TEMPLATE_ID', '')

    # Celery
    CELERY_BROKER_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
    CELERY_RESULT_BACKEND = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')

    # SocketIO
    SOCKETIO_MESSAGE_QUEUE = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')


class DevelopmentConfig(Config):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        'DATABASE_URL',
        'sqlite:///' + os.path.join(basedir, 'instance', 'verse.db')
    )
    # No Redis needed for local dev — use in-memory SocketIO queue
    SOCKETIO_MESSAGE_QUEUE = None
    CELERY_BROKER_URL = None
    CELERY_RESULT_BACKEND = None


class ProductionConfig(Config):
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', '')

    @staticmethod
    def init_app(app):
        # Fix Heroku/Railway postgres:// -> postgresql://
        uri = app.config.get('SQLALCHEMY_DATABASE_URI', '')
        if uri.startswith('postgres://'):
            app.config['SQLALCHEMY_DATABASE_URI'] = uri.replace(
                'postgres://', 'postgresql://', 1
            )


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    WTF_CSRF_ENABLED = False


config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig,
}
