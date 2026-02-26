"""Seed the database with curriculum data and initial admin user."""
import os
import sys
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

load_dotenv()

from app import create_app
from app.extensions import db
from app.models.user import User, Role
from app.models.curriculum import Track, Level, Unit, Objective, Skill
from app.models.gamification import Badge, BadgeCriteria
from app.models.classroom import Group, GroupStudent, Session, SessionStatus, SessionResource
from app.models.resource import Resource, ResourceType

app = create_app(os.environ.get('FLASK_ENV', 'development'))


def seed_curriculum():
    """Import curriculum data from existing data/*.py files."""
    from data.coding_verse import CODING_VERSE
    from data.computer_basics import COMPUTER_BASICS
    from data.digital_safety import DIGITAL_SAFETY
    from data.data_verse import DATA_VERSE

    tracks = [CODING_VERSE, COMPUTER_BASICS, DIGITAL_SAFETY, DATA_VERSE]

    for t_order, track_data in enumerate(tracks):
        # Check if track already exists
        existing = db.session.get(Track, track_data['id'])
        if existing:
            print(f'  Track "{track_data["id"]}" already exists, skipping.')
            continue

        t = Track(
            id=track_data['id'], name=track_data['name'], name_ar=track_data['name_ar'],
            icon=track_data['icon'], color=track_data['color'],
            description_ar=track_data.get('description_ar', track_data.get('description', '')),
            sort_order=t_order,
        )
        db.session.add(t)

        for l_order, level_data in enumerate(track_data['levels']):
            lvl = Level(
                id=level_data['id'], track_id=track_data['id'],
                name=level_data['name'], name_ar=level_data['name_ar'],
                icon=level_data['icon'], slogan=level_data['slogan'],
                goal=level_data['goal'], sort_order=l_order,
            )
            db.session.add(lvl)

            for u_order, unit_data in enumerate(level_data['units']):
                project = unit_data.get('project', {})
                u = Unit(
                    id=unit_data['id'], level_id=level_data['id'], track_id=track_data['id'],
                    name=unit_data['name'], name_en=unit_data['name_en'],
                    description=unit_data['description'],
                    project_name=project.get('name', ''),
                    project_description=project.get('description', ''),
                    sort_order=u_order,
                )
                db.session.add(u)

                for o_order, obj_data in enumerate(unit_data.get('objectives', [])):
                    obj = Objective(
                        track_id=track_data['id'], level_id=level_data['id'],
                        unit_id=unit_data['id'],
                        bloom=obj_data['bloom'], bloom_en=obj_data['bloom_en'],
                        objective=obj_data['objective'], outcome=obj_data['outcome'],
                        sort_order=o_order,
                    )
                    db.session.add(obj)

                for s_order, skill_name in enumerate(unit_data.get('skills', [])):
                    skill = Skill(
                        track_id=track_data['id'], level_id=level_data['id'],
                        unit_id=unit_data['id'],
                        name=skill_name, sort_order=s_order,
                    )
                    db.session.add(skill)

        print(f'  Seeded track: {track_data["name_ar"]}')

    db.session.commit()


def seed_admin():
    """Create default admin user."""
    email = 'admin@shalaby-verse.com'
    if User.query.filter_by(email=email).first():
        print('  Admin user already exists.')
        return
    admin = User(
        email=email, name_ar='مدير النظام', name_en='System Admin',
        role=Role.ADMIN,
    )
    admin.set_password('admin123')
    db.session.add(admin)
    db.session.commit()
    print('  Created admin: admin@shalaby-verse.com / admin123')


def seed_badges():
    """Create default badges."""
    if Badge.query.count() > 0:
        print('  Badges already exist.')
        return

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
    print(f'  Created {len(badges)} badges.')


def seed_demo_users():
    """Create demo users for testing."""
    demo_users = [
        ('teacher@shalaby-verse.com', 'أ. سارة', 'Ms. Sarah', Role.TEACHER),
        ('student1@shalaby-verse.com', 'أحمد', 'Ahmed', Role.STUDENT),
        ('student2@shalaby-verse.com', 'مايا', 'Maya', Role.STUDENT),
        ('student3@shalaby-verse.com', 'دانيال', 'Daniel', Role.STUDENT),
        ('student4@shalaby-verse.com', 'ليلى', 'Layla', Role.STUDENT),
        ('parent1@shalaby-verse.com', 'والد أحمد', 'Ahmed\'s Parent', Role.PARENT),
        ('assessor@shalaby-verse.com', 'د. أمل', 'Dr. Amal', Role.ASSESSOR),
    ]
    for email, name_ar, name_en, role in demo_users:
        if User.query.filter_by(email=email).first():
            continue
        u = User(email=email, name_ar=name_ar, name_en=name_en, role=role)
        u.set_password('demo123')
        db.session.add(u)
    db.session.commit()
    print('  Created demo users (password: demo123)')


def seed_demo_classroom():
    """Create demo Group, Sessions, Resources, and SessionResources."""
    # Check if already seeded
    if Group.query.filter_by(name='المستكشفون - Explorers').first():
        print('  Demo classroom already exists.')
        return

    teacher = User.query.filter_by(email='teacher@shalaby-verse.com').first()
    students = User.query.filter(
        User.email.in_([
            'student1@shalaby-verse.com',
            'student2@shalaby-verse.com',
            'student3@shalaby-verse.com',
            'student4@shalaby-verse.com',
        ])
    ).all()

    if not teacher:
        print('  Teacher not found — run with --demo first.')
        return

    # --- Group ---
    group = Group(
        name='المستكشفون - Explorers',
        teacher_id=teacher.id,
        max_students=12,
        is_active=True,
    )
    db.session.add(group)
    db.session.flush()  # get group.id

    # Enroll students
    for s in students:
        db.session.add(GroupStudent(group_id=group.id, student_id=s.id))

    # --- Sessions ---
    now = datetime.now(timezone.utc)
    session1 = Session(
        group_id=group.id,
        teacher_id=teacher.id,
        title='مقدمة في Python - Introduction to Python',
        scheduled_at=now + timedelta(hours=1),
        duration_minutes=60,
        status=SessionStatus.SCHEDULED,
    )
    session2 = Session(
        group_id=group.id,
        teacher_id=teacher.id,
        title='المتغيرات والأنواع - Variables & Types',
        scheduled_at=now + timedelta(days=1),
        duration_minutes=60,
        status=SessionStatus.SCHEDULED,
    )
    db.session.add_all([session1, session2])
    db.session.flush()  # get session IDs

    # --- Resources ---
    res_slides = Resource(
        name='Lesson Slides', name_ar='شرائح الدرس',
        type=ResourceType.SLIDES, created_by=teacher.id,
    )
    res_code = Resource(
        name='Code Exercise', name_ar='تمرين برمجي',
        type=ResourceType.CODE_EXERCISE, created_by=teacher.id,
    )
    res_qna = Resource(
        name='Q&A', name_ar='أسئلة وأجوبة',
        type=ResourceType.QNA, created_by=teacher.id,
    )
    res_wb = Resource(
        name='Whiteboard', name_ar='السبورة',
        type=ResourceType.WHITEBOARD, created_by=teacher.id,
    )
    db.session.add_all([res_slides, res_code, res_qna, res_wb])
    db.session.flush()  # get resource IDs

    # --- Link Resources to Session 1 ---
    for i, res in enumerate([res_slides, res_code, res_qna, res_wb]):
        db.session.add(SessionResource(
            session_id=session1.id,
            resource_id=res.id,
            sort_order=i,
            is_active=(i == 0),  # first resource active by default
        ))

    db.session.commit()
    print(f'  Created group "{group.name}" (id={group.id})')
    print(f'  Created 2 sessions (ids={session1.id}, {session2.id})')
    print(f'  Created 4 resources linked to session {session1.id}')


def seed_verse_activities():
    """Create 2-3 activities per curriculum unit for the Verses Adventure Map."""
    from app.models.journey import Activity, ActivityType, ActivitySource, QuestDifficulty
    from app.models.curriculum import Track, Unit

    # Check if already seeded (look for activities with unit_id set)
    existing = Activity.query.filter(Activity.unit_id.isnot(None)).first()
    if existing:
        print('  Verse activities already exist.')
        return

    activity_templates = [
        (ActivityType.CODING, 'تمرين برمجي', 'Coding Exercise', 20, 10),
        (ActivityType.QUIZ, 'اختبار قصير', 'Quick Quiz', 15, 8),
        (ActivityType.GAME, 'لعبة تفاعلية', 'Interactive Game', 25, 12),
    ]
    all_tracks = Track.query.all()
    sort_order = 100
    count = 0
    for t in all_tracks:
        units = Unit.query.filter_by(track_id=t.id).order_by(Unit.level_id, Unit.sort_order).all()
        for unit in units:
            for j, (atype, ar_label, en_label, xp, coins) in enumerate(activity_templates):
                if j == 2 and hash(unit.id) % 3 == 0:
                    continue
                db.session.add(Activity(
                    title=f'{en_label}: {unit.name_en or unit.name}',
                    title_ar=f'{ar_label}: {unit.name}',
                    activity_type=atype,
                    source=ActivitySource.SELF_PACED,
                    difficulty=QuestDifficulty.BEGINNER,
                    xp_reward=xp, coin_reward=coins,
                    track_id=t.id, level_id=unit.level_id, unit_id=unit.id,
                    estimated_minutes=10, sort_order=sort_order,
                ))
                sort_order += 1
                count += 1
    db.session.commit()
    print(f'  Created {count} verse activities across {len(all_tracks)} tracks.')


if __name__ == '__main__':
    with app.app_context():
        print('Creating tables...')
        db.create_all()

        print('Seeding curriculum...')
        seed_curriculum()

        print('Seeding admin...')
        seed_admin()

        print('Seeding badges...')
        seed_badges()

        if '--demo' in sys.argv:
            print('Seeding demo users...')
            seed_demo_users()

            print('Seeding demo classroom...')
            seed_demo_classroom()

        print('Seeding verse activities...')
        seed_verse_activities()

        print('Done!')
