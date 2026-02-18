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

    # Create tables and auto-seed if empty (first deploy)
    with app.app_context():
        db.create_all()
        _auto_seed_if_empty()

    # Register blueprints
    _register_blueprints(app)

    # Register error handlers
    _register_error_handlers(app)

    return app


def _auto_seed_if_empty():
    """Auto-seed the database on first deploy when tables are empty."""
    from app.models.user import User, Role
    from app.models.curriculum import Track, Level, Unit, Objective, Skill
    from app.models.gamification import Badge, BadgeCriteria
    from app.models.classroom import Group, GroupStudent, Session, SessionStatus
    from app.models.resource import Resource, ResourceType
    from datetime import datetime, timedelta, timezone

    # Check if already seeded
    if User.query.first() is not None:
        print("[SEED] Database already has data, skipping seed.")
        return

    print("[SEED] Empty database detected — seeding all data...")

    # --- 1. Curriculum ---
    try:
        from data.coding_verse import CODING_VERSE
        from data.computer_basics import COMPUTER_BASICS
        from data.digital_safety import DIGITAL_SAFETY
        from data.data_verse import DATA_VERSE

        tracks_data = [CODING_VERSE, COMPUTER_BASICS, DIGITAL_SAFETY, DATA_VERSE]
        for t_order, td in enumerate(tracks_data):
            t = Track(
                id=td['id'], name=td['name'], name_ar=td['name_ar'],
                icon=td['icon'], color=td['color'],
                description_ar=td.get('description_ar', td.get('description', '')),
                sort_order=t_order,
            )
            db.session.add(t)
            for l_order, ld in enumerate(td['levels']):
                lvl = Level(
                    id=ld['id'], track_id=td['id'],
                    name=ld['name'], name_ar=ld['name_ar'],
                    icon=ld['icon'], slogan=ld['slogan'],
                    goal=ld['goal'], sort_order=l_order,
                )
                db.session.add(lvl)
                for u_order, ud in enumerate(ld['units']):
                    project = ud.get('project', {})
                    u = Unit(
                        id=ud['id'], level_id=ld['id'], track_id=td['id'],
                        name=ud['name'], name_en=ud['name_en'],
                        description=ud['description'],
                        project_name=project.get('name', ''),
                        project_description=project.get('description', ''),
                        sort_order=u_order,
                    )
                    db.session.add(u)
                    for o_order, od in enumerate(ud.get('objectives', [])):
                        db.session.add(Objective(
                            track_id=td['id'], level_id=ld['id'], unit_id=ud['id'],
                            bloom=od['bloom'], bloom_en=od['bloom_en'],
                            objective=od['objective'], outcome=od['outcome'],
                            sort_order=o_order,
                        ))
                    for s_order, skill_name in enumerate(ud.get('skills', [])):
                        db.session.add(Skill(
                            track_id=td['id'], level_id=ld['id'], unit_id=ud['id'],
                            name=skill_name, sort_order=s_order,
                        ))
        db.session.commit()
        print(f"[SEED] Curriculum: {len(tracks_data)} tracks seeded")
    except Exception as e:
        db.session.rollback()
        print(f"[SEED] Curriculum error: {e}")

    # --- 2. Admin user ---
    admin = User(
        email='admin@shalaby-verse.com', name_ar='مدير النظام', name_en='System Admin',
        role=Role.ADMIN,
    )
    admin.set_password('admin123')
    db.session.add(admin)
    db.session.commit()
    print("[SEED] Admin: admin@shalaby-verse.com / admin123")

    # --- 3. Badges ---
    badges = [
        Badge(name='First Launch', name_ar='الانطلاقة الأولى', icon='rocket',
              description='Attend your first session', description_ar='احضر أول جلسة لك',
              criteria_type=BadgeCriteria.SESSIONS_ATTENDED, criteria_value=1),
        Badge(name='Regular', name_ar='منتظم', icon='calendar',
              description='Attend 10 sessions', description_ar='احضر 10 جلسات',
              criteria_type=BadgeCriteria.SESSIONS_ATTENDED, criteria_value=10),
        Badge(name='Dedicated', name_ar='متفاني', icon='fire',
              description='Attend 25 sessions', description_ar='احضر 25 جلسة',
              criteria_type=BadgeCriteria.SESSIONS_ATTENDED, criteria_value=25),
        Badge(name='Code Warrior', name_ar='محارب الكود', icon='sword',
              description='Complete 10 code exercises', description_ar='أكمل 10 تمارين برمجية',
              criteria_type=BadgeCriteria.ASSIGNMENTS_COMPLETED, criteria_value=10),
        Badge(name='Streak Master', name_ar='سيد المواظبة', icon='flame',
              description='7-day streak', description_ar='حافظ على 7 أيام متتالية',
              criteria_type=BadgeCriteria.STREAK_DAYS, criteria_value=7),
        Badge(name='Streak Legend', name_ar='أسطورة المواظبة', icon='crown',
              description='30-day streak', description_ar='حافظ على 30 يوماً متتالياً',
              criteria_type=BadgeCriteria.STREAK_DAYS, criteria_value=30),
        Badge(name='Knowledge Seeker', name_ar='باحث عن المعرفة', icon='question',
              description='Ask 20 questions', description_ar='اسأل 20 سؤالاً',
              criteria_type=BadgeCriteria.QUESTIONS_ASKED, criteria_value=20),
        Badge(name='Rising Star', name_ar='نجم صاعد', icon='star',
              description='Earn 500 XP', description_ar='اجمع 500 نقطة خبرة',
              criteria_type=BadgeCriteria.XP_EARNED, criteria_value=500),
        Badge(name='XP Master', name_ar='خبير النقاط', icon='gem',
              description='Earn 2000 XP', description_ar='اجمع 2000 نقطة خبرة',
              criteria_type=BadgeCriteria.XP_EARNED, criteria_value=2000),
        Badge(name='Superstar', name_ar='نجم خارق', icon='trophy',
              description='Earn 5000 XP', description_ar='اجمع 5000 نقطة خبرة',
              criteria_type=BadgeCriteria.XP_EARNED, criteria_value=5000),
    ]
    for b in badges:
        db.session.add(b)
    db.session.commit()
    print(f"[SEED] Badges: {len(badges)} created")

    # --- 4. Demo users ---
    demo_users_data = [
        ('teacher@shalaby-verse.com', 'أ. سارة', 'Ms. Sarah', Role.TEACHER),
        ('student1@shalaby-verse.com', 'أحمد', 'Ahmed', Role.STUDENT),
        ('student2@shalaby-verse.com', 'مايا', 'Maya', Role.STUDENT),
        ('student3@shalaby-verse.com', 'دانيال', 'Daniel', Role.STUDENT),
        ('student4@shalaby-verse.com', 'ليلى', 'Layla', Role.STUDENT),
        ('parent1@shalaby-verse.com', 'والد أحمد', "Ahmed's Parent", Role.PARENT),
        ('assessor@shalaby-verse.com', 'د. أمل', 'Dr. Amal', Role.ASSESSOR),
    ]
    for email, name_ar, name_en, role in demo_users_data:
        u = User(email=email, name_ar=name_ar, name_en=name_en, role=role)
        u.set_password('demo123')
        db.session.add(u)
    db.session.commit()
    print("[SEED] Demo users: 7 created (password: demo123)")

    # --- 5. Demo classroom ---
    teacher = User.query.filter_by(email='teacher@shalaby-verse.com').first()
    students = User.query.filter(User.role == Role.STUDENT).all()

    group = Group(name='المستكشفون - Explorers', teacher_id=teacher.id,
                  max_students=12, is_active=True)
    db.session.add(group)
    db.session.flush()

    for s in students:
        db.session.add(GroupStudent(group_id=group.id, student_id=s.id))

    now = datetime.now(timezone.utc)
    s1 = Session(group_id=group.id, teacher_id=teacher.id,
                 title='مقدمة في Python - Introduction to Python',
                 scheduled_at=now + timedelta(hours=1), duration_minutes=60,
                 status=SessionStatus.SCHEDULED)
    s2 = Session(group_id=group.id, teacher_id=teacher.id,
                 title='المتغيرات والأنواع - Variables & Types',
                 scheduled_at=now + timedelta(days=1), duration_minutes=60,
                 status=SessionStatus.SCHEDULED)
    db.session.add_all([s1, s2])
    db.session.flush()

    from app.models.resource import Resource, ResourceType
    from app.models.classroom import SessionResource
    for name, name_ar, rtype in [
        ('Lesson Slides', 'شرائح الدرس', ResourceType.SLIDES),
        ('Code Exercise', 'تمرين برمجي', ResourceType.CODE_EXERCISE),
        ('Q&A', 'أسئلة وأجوبة', ResourceType.QNA),
        ('Whiteboard', 'السبورة', ResourceType.WHITEBOARD),
    ]:
        res = Resource(name=name, name_ar=name_ar, type=rtype, created_by=teacher.id)
        db.session.add(res)
        db.session.flush()
        db.session.add(SessionResource(session_id=s1.id, resource_id=res.id, sort_order=0))

    # Link parent to student
    parent = User.query.filter_by(email='parent1@shalaby-verse.com').first()
    student1 = User.query.filter_by(email='student1@shalaby-verse.com').first()
    if parent and student1:
        from sqlalchemy import text
        db.session.execute(
            text("INSERT INTO parent_student (parent_id, student_id) VALUES (:p, :s)"),
            {'p': parent.id, 's': student1.id}
        )

    db.session.commit()
    print(f"[SEED] Classroom: group '{group.name}', 2 sessions, 4 resources")
    print("[SEED] All seeding complete!")


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
