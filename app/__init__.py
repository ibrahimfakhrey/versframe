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

    # Apply all env overrides
    for key in ('SECRET_KEY', 'JWT_SECRET_KEY', 'HMS_ACCESS_KEY', 'HMS_SECRET', 'HMS_TEMPLATE_ID'):
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

    # Ensure journey columns/tables exist before ORM touches them
    with app.app_context():
        _ensure_journey_schema()
        db.create_all()
        try:
            _auto_seed_if_empty()
        except Exception as e:
            db.session.rollback()
            print(f"[SEED] Skipped seeding (migration pending?): {e}")

    # Register blueprints
    _register_blueprints(app)

    # Register error handlers
    _register_error_handlers(app)

    # Context processor: inject student gamification data into all templates
    @app.context_processor
    def inject_student_context():
        from flask_login import current_user
        from app.models.user import Role
        if current_user.is_authenticated and current_user.role == Role.STUDENT:
            from app.models.gamification import StudentXP, Streak
            from app.models.journey import StudentWallet
            wallet = StudentWallet.query.filter_by(student_id=current_user.id).first()
            total_xp = StudentXP.total_xp(current_user.id)
            level = StudentXP.current_level(total_xp)
            streak = Streak.query.filter_by(student_id=current_user.id).first()
            thresholds = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5000,
                          6500, 8000, 10000, 12500, 15000, 18000, 21000, 25000]
            current_threshold = thresholds[level - 1] if level <= len(thresholds) else thresholds[-1]
            next_threshold = thresholds[level] if level < len(thresholds) else thresholds[-1] + 5000
            xp_progress = ((total_xp - current_threshold) / max(next_threshold - current_threshold, 1)) * 100
            return dict(
                coins=wallet.coins if wallet else 0,
                gems=wallet.gems if wallet else 0,
                g_total_xp=total_xp,
                total_xp=total_xp,
                g_level=level,
                level=level,
                g_xp_progress=min(xp_progress, 100),
                xp_progress=min(xp_progress, 100),
                g_streak=streak,
                g_next_threshold=next_threshold,
            )
        return {}

    return app


def _ensure_journey_schema():
    """Add journey columns/tables directly via SQL so the ORM doesn't crash on old DBs."""
    from sqlalchemy import text
    try:
        conn = db.engine.connect()
        dialect = db.engine.dialect.name

        if dialect == 'postgresql':
            # Add columns to existing tables
            for sql in [
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS motivation_type VARCHAR(20)",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE",
                "ALTER TABLE badges ADD COLUMN IF NOT EXISTS tier INTEGER NOT NULL DEFAULT 1",
            ]:
                conn.execute(text(sql))
            conn.execute(text("COMMIT"))
            print("[SCHEMA] Journey columns ensured on PostgreSQL")
        else:
            # SQLite: check if columns exist first
            result = conn.execute(text("PRAGMA table_info(users)"))
            existing = {row[1] for row in result}
            if 'bio' not in existing:
                conn.execute(text("ALTER TABLE users ADD COLUMN bio TEXT"))
            if 'motivation_type' not in existing:
                conn.execute(text("ALTER TABLE users ADD COLUMN motivation_type VARCHAR(20)"))
            if 'onboarding_completed' not in existing:
                conn.execute(text("ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT 0"))
            result2 = conn.execute(text("PRAGMA table_info(badges)"))
            existing2 = {row[1] for row in result2}
            if 'tier' not in existing2:
                conn.execute(text("ALTER TABLE badges ADD COLUMN tier INTEGER NOT NULL DEFAULT 1"))
            conn.execute(text("COMMIT"))
            print("[SCHEMA] Journey columns ensured on SQLite")

        conn.close()
    except Exception as e:
        print(f"[SCHEMA] Could not ensure journey columns: {e}")


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

    # --- 6. Journey / Gamification Seed Data ---
    _seed_journey_data()
    print("[SEED] All seeding complete!")


def _seed_journey_data():
    """Seed journey models: daily rewards, wallets, quests, activities, milestones."""
    from app.models.user import User, Role
    from app.models.journey import (
        DailyReward, RewardType, StudentWallet, Quest, QuestDifficulty, QuestCategory,
        Activity, ActivityType, ActivitySource, JourneyMilestone, MilestoneType,
        StudentUnitProgress,
    )
    from app.models.curriculum import Track, Level, Unit

    # Daily Rewards (5-day cycle)
    daily_rewards = [
        DailyReward(day_number=1, reward_type=RewardType.COINS, amount=10,
                    label_ar='+10 عملات', label_en='+10 Coins'),
        DailyReward(day_number=2, reward_type=RewardType.GEMS, amount=1,
                    label_ar='+1 جوهرة', label_en='+1 Gem'),
        DailyReward(day_number=3, reward_type=RewardType.COINS, amount=25,
                    label_ar='+25 عملات', label_en='+25 Coins'),
        DailyReward(day_number=4, reward_type=RewardType.MYSTERY, amount=0,
                    label_ar='مكافأة غامضة', label_en='Mystery Reward'),
        DailyReward(day_number=5, reward_type=RewardType.CHEST, amount=0,
                    label_ar='صندوق كنز', label_en='Treasure Chest'),
    ]
    for dr in daily_rewards:
        db.session.add(dr)

    # Student Wallets (welcome bonus for demo students)
    students = User.query.filter_by(role=Role.STUDENT).all()
    for s in students:
        wallet = StudentWallet(student_id=s.id, coins=50, gems=2)
        db.session.add(wallet)
        # "Joined" milestone
        db.session.add(JourneyMilestone(
            student_id=s.id, milestone_type=MilestoneType.JOINED,
            title_ar='انضم إلى شلبي فيرس', title_en='Joined Shalaby Verse'
        ))

    # Sample Quests
    coding_track = Track.query.filter_by(id='coding-verse').first()
    track_id = coding_track.id if coding_track else None

    quests_data = [
        ('Hello World Challenge', 'تحدي Hello World', 'Write your first program', 'اكتب أول برنامج لك',
         QuestDifficulty.BEGINNER, QuestCategory.CODING, 30, 15, 0, 1, 10),
        ('Variable Explorer', 'مستكشف المتغيرات', 'Learn about variables', 'تعلم عن المتغيرات',
         QuestDifficulty.BEGINNER, QuestCategory.CODING, 40, 20, 0, 1, 15),
        ('Loop Master', 'سيد الحلقات', 'Master loops and iterations', 'أتقن الحلقات والتكرار',
         QuestDifficulty.INTERMEDIATE, QuestCategory.CODING, 60, 30, 1, 2, 20),
        ('Function Builder', 'بناء الدوال', 'Create reusable functions', 'أنشئ دوال قابلة لإعادة الاستخدام',
         QuestDifficulty.INTERMEDIATE, QuestCategory.CODING, 75, 35, 1, 3, 25),
        ('Data Detective', 'محقق البيانات', 'Analyze data patterns', 'حلل أنماط البيانات',
         QuestDifficulty.INTERMEDIATE, QuestCategory.DATA, 80, 40, 2, 3, 20),
        ('AI Explorer', 'مستكشف الذكاء الاصطناعي', 'Explore AI basics', 'استكشف أساسيات الذكاء الاصطناعي',
         QuestDifficulty.ADVANCED, QuestCategory.AI, 100, 50, 3, 4, 30),
        ('Security Guardian', 'حارس الأمان', 'Learn digital safety', 'تعلم الأمان الرقمي',
         QuestDifficulty.BEGINNER, QuestCategory.SECURITY, 40, 20, 0, 1, 15),
        ('Robot Commander', 'قائد الروبوتات', 'Program a virtual robot', 'برمج روبوت افتراضي',
         QuestDifficulty.ADVANCED, QuestCategory.ROBOTICS, 120, 60, 5, 5, 35),
    ]
    for i, (title, title_ar, desc, desc_ar, diff, cat, xp, coins, gems, req_lvl, est_min) in enumerate(quests_data):
        db.session.add(Quest(
            title=title, title_ar=title_ar, description=desc, description_ar=desc_ar,
            difficulty=diff, category=cat, xp_reward=xp, coin_reward=coins, gem_reward=gems,
            required_level=req_lvl, track_id=track_id, estimated_minutes=est_min, sort_order=i,
        ))

    # Sample Activities
    activities_data = [
        ('Drag & Drop Variables', 'سحب وإفلات المتغيرات', ActivityType.DRAG_DROP, ActivitySource.LIVE_CLASS, QuestDifficulty.BEGINNER, 15, 8, 10),
        ('Print Quiz', 'اختبار الطباعة', ActivityType.QUIZ, ActivitySource.ASSIGNED, QuestDifficulty.BEGINNER, 10, 5, 5),
        ('Loop Game', 'لعبة الحلقات', ActivityType.GAME, ActivitySource.SELF_PACED, QuestDifficulty.BEGINNER, 20, 10, 12),
        ('Read: What is Python?', 'قراءة: ما هو بايثون؟', ActivityType.READING, ActivitySource.SELF_PACED, QuestDifficulty.BEGINNER, 10, 5, 8),
        ('Code: Calculator', 'كود: الآلة الحاسبة', ActivityType.CODING, ActivitySource.ASSIGNED, QuestDifficulty.INTERMEDIATE, 30, 15, 20),
        ('Function Quiz', 'اختبار الدوال', ActivityType.QUIZ, ActivitySource.QUEST, QuestDifficulty.INTERMEDIATE, 20, 10, 10),
        ('Data Chart Game', 'لعبة الرسوم البيانية', ActivityType.GAME, ActivitySource.SELF_PACED, QuestDifficulty.INTERMEDIATE, 25, 12, 15),
        ('Project: Story App', 'مشروع: تطبيق القصة', ActivityType.PROJECT, ActivitySource.ASSIGNED, QuestDifficulty.ADVANCED, 50, 25, 30),
        ('Security Quiz', 'اختبار الأمان', ActivityType.QUIZ, ActivitySource.SELF_PACED, QuestDifficulty.BEGINNER, 15, 8, 8),
        ('AI Sorting Game', 'لعبة ترتيب الذكاء الاصطناعي', ActivityType.GAME, ActivitySource.SELF_PACED, QuestDifficulty.INTERMEDIATE, 25, 12, 15),
        ('Read: Digital Safety', 'قراءة: الأمان الرقمي', ActivityType.READING, ActivitySource.SELF_PACED, QuestDifficulty.BEGINNER, 10, 5, 7),
        ('Code: Pattern Maker', 'كود: صانع الأنماط', ActivityType.CODING, ActivitySource.QUEST, QuestDifficulty.INTERMEDIATE, 35, 18, 20),
    ]
    for i, (title, title_ar, atype, src, diff, xp, coins, est_min) in enumerate(activities_data):
        db.session.add(Activity(
            title=title, title_ar=title_ar, activity_type=atype, source=src,
            difficulty=diff, xp_reward=xp, coin_reward=coins, track_id=track_id,
            estimated_minutes=est_min, sort_order=i,
        ))

    # Student Unit Progress for demo students (adventure map backbone)
    if coding_track:
        units = Unit.query.filter_by(track_id=coding_track.id).order_by(
            Unit.level_id, Unit.sort_order
        ).all()
        for s in students:
            for idx, unit in enumerate(units[:6]):  # first 6 units
                if idx < 2:
                    status = 'completed'
                elif idx == 2:
                    status = 'current'
                else:
                    status = 'locked'
                db.session.add(StudentUnitProgress(
                    student_id=s.id, track_id=unit.track_id,
                    level_id=unit.level_id, unit_id=unit.id, status=status,
                ))

    db.session.commit()
    print("[SEED] Journey: daily rewards, wallets, quests, activities, milestones seeded")


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
