import os

from flask import Flask
from config import config
from app.extensions import db, migrate, login_manager, jwt, socketio, csrf, cors


def create_app(config_name='development'):
    app = Flask(__name__)
    app.config.from_object(config.get(config_name, config['default']))

    # Always prefer DATABASE_URL from env (Railway, Heroku, etc.)
    db_url = os.environ.get('DATABASE_URL', '')
    print(f"[BOOT] config_name={config_name}, DATABASE_URL set={bool(db_url)}, current_uri={app.config.get('SQLALCHEMY_DATABASE_URI', 'NOT SET')[:40]}")
    if db_url:
        # Fix Heroku/Railway postgres:// -> postgresql://
        if db_url.startswith('postgres://'):
            db_url = db_url.replace('postgres://', 'postgresql://', 1)
        app.config['SQLALCHEMY_DATABASE_URI'] = db_url
        print(f"[BOOT] Overrode DB URI to: {db_url[:40]}...")
    else:
        print(f"[BOOT] WARNING: DATABASE_URL not found in env! Using: {app.config.get('SQLALCHEMY_DATABASE_URI', '')[:40]}")

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    jwt.init_app(app)
    csrf.init_app(app)
    cors.init_app(app)
    socketio.init_app(app, cors_allowed_origins='*',
                      message_queue=app.config.get('SOCKETIO_MESSAGE_QUEUE'))

    # Import models so they are registered with SQLAlchemy
    from app import models  # noqa: F401

    # Create tables if they don't exist (safe for first deploy)
    with app.app_context():
        db.create_all()

    # Register blueprints
    _register_blueprints(app)

    # Register error handlers
    _register_error_handlers(app)

    return app


def _register_blueprints(app):
    from app.blueprints.auth import bp as auth_bp
    from app.blueprints.admin import bp as admin_bp
    from app.blueprints.teacher import bp as teacher_bp
    from app.blueprints.student import bp as student_bp
    from app.blueprints.parent import bp as parent_bp
    from app.blueprints.assessor import bp as assessor_bp
    from app.blueprints.room import bp as room_bp
    from app.blueprints.api import bp as api_bp
    from app.blueprints.curriculum import bp as curriculum_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp, url_prefix='/admin')
    app.register_blueprint(teacher_bp, url_prefix='/teacher')
    app.register_blueprint(student_bp, url_prefix='/student')
    app.register_blueprint(parent_bp, url_prefix='/parent')
    app.register_blueprint(assessor_bp, url_prefix='/assessor')
    app.register_blueprint(room_bp, url_prefix='/room')
    app.register_blueprint(api_bp, url_prefix='/api')
    app.register_blueprint(curriculum_bp)


def _register_error_handlers(app):
    from flask import render_template

    @app.errorhandler(404)
    def not_found(e):
        return render_template('errors/404.html'), 404

    @app.errorhandler(403)
    def forbidden(e):
        return render_template('errors/403.html'), 403

    @app.errorhandler(500)
    def server_error(e):
        return render_template('errors/500.html'), 500
