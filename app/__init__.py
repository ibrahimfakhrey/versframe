import os
import json

from flask import Flask
from config import config
from app.extensions import db, migrate, login_manager, jwt, socketio, csrf, cors


def _load_railway_config(app):
    """Load config from railway.json if env vars are missing (Railway v2 workaround)."""
    config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'railway.json')
    if os.path.exists(config_path):
        with open(config_path) as f:
            cfg = json.load(f)
        for key, val in cfg.items():
            os.environ.setdefault(key, val)
        print(f"[BOOT] Loaded {len(cfg)} vars from railway.json")


def create_app(config_name='development'):
    # Detect Railway and load config file if env vars are missing
    on_railway = bool(os.environ.get('RAILWAY_SERVICE_ID'))
    if on_railway and not os.environ.get('DATABASE_URL'):
        _load_railway_config(None)

    # Pick production config on Railway automatically
    if on_railway:
        config_name = 'production'

    app = Flask(__name__)
    app.config.from_object(config.get(config_name, config['default']))

    # Override DATABASE_URL from env
    db_url = os.environ.get('DATABASE_URL', '')
    if db_url:
        if db_url.startswith('postgres://'):
            db_url = db_url.replace('postgres://', 'postgresql://', 1)
        app.config['SQLALCHEMY_DATABASE_URI'] = db_url

    # Apply other env overrides
    for key in ('SECRET_KEY', 'JWT_SECRET_KEY'):
        val = os.environ.get(key)
        if val:
            app.config[key] = val

    print(f"[BOOT] railway={on_railway}, config={config_name}, db={app.config.get('SQLALCHEMY_DATABASE_URI', '')[:50]}")

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
