from flask import jsonify, request
from flask_login import current_user, login_required
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.blueprints.api import bp
from app.extensions import db
from app.models.user import User, Role
from app.models.gamification import StudentXP, Badge, Streak, StudentBadge
from app.models.notification import Notification
from app.models.classroom import Session, SessionStatus, Group
from app.models.resource import Resource, ResourceFile, FileType
from app.models.homework import Homework, HomeworkSubmission
from app.utils.helpers import safe_int
from datetime import datetime, timezone


@bp.route('/me')
@login_required
def me():
    total_xp = 0
    level = 1
    if current_user.role == Role.STUDENT:
        total_xp = StudentXP.total_xp(current_user.id)
        level = StudentXP.current_level(total_xp)
    return jsonify({
        'id': current_user.id,
        'email': current_user.email,
        'name_ar': current_user.name_ar,
        'name_en': current_user.name_en,
        'role': current_user.role.value,
        'avatar_url': current_user.avatar_url,
        'total_xp': total_xp,
        'level': level,
    })


@bp.route('/notifications')
@login_required
def notifications():
    page = safe_int(request.args.get('page', 1))
    per_page = 20
    query = Notification.query.filter_by(user_id=current_user.id).order_by(
        Notification.created_at.desc()
    )
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    unread = Notification.query.filter_by(user_id=current_user.id, is_read=False).count()
    return jsonify({
        'notifications': [{
            'id': n.id,
            'title': n.title,
            'message': n.message,
            'type': n.type.value,
            'is_read': n.is_read,
            'link': n.link,
            'created_at': n.created_at.isoformat() if n.created_at else None,
        } for n in items],
        'unread': unread,
    })


@bp.route('/notifications/read', methods=['POST'])
@login_required
def mark_read():
    data = request.get_json()
    notification_id = data.get('id')
    if notification_id:
        n = db.session.get(Notification, notification_id)
        if n and n.user_id == current_user.id:
            n.is_read = True
            db.session.commit()
    else:
        # Mark all as read
        Notification.query.filter_by(user_id=current_user.id, is_read=False).update(
            {'is_read': True}
        )
        db.session.commit()
    return jsonify({'ok': True})


@bp.route('/xp/award', methods=['POST'])
@login_required
def award_xp():
    if current_user.role not in (Role.ADMIN, Role.TEACHER):
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json()
    student_id = data.get('student_id')
    amount = safe_int(data.get('amount', 0))
    reason = data.get('reason', 'مكافأة')
    session_id = data.get('session_id')

    if not student_id or amount <= 0:
        return jsonify({'error': 'Invalid data'}), 400

    xp = StudentXP(student_id=student_id, amount=amount, reason=reason,
                    session_id=session_id)
    db.session.add(xp)
    db.session.commit()

    total = StudentXP.total_xp(student_id)
    level = StudentXP.current_level(total)

    return jsonify({'ok': True, 'total_xp': total, 'level': level})


@bp.route('/session/<int:session_id>/start', methods=['POST'])
@login_required
def start_session(session_id):
    if current_user.role not in (Role.ADMIN, Role.TEACHER):
        return jsonify({'error': 'Unauthorized'}), 403

    session = db.session.get(Session, session_id)
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    # Create 100ms room if not exists
    if not session.hundredms_room_id:
        try:
            from app.utils.hundredms import create_room
            room_id = create_room(f'session-{session.id}', session.title)
            session.hundredms_room_id = room_id
        except Exception:
            # Allow session to start even without 100ms
            pass

    session.status = SessionStatus.LIVE
    db.session.commit()

    # Award XP to teacher
    return jsonify({'ok': True, 'room_id': session.hundredms_room_id})


@bp.route('/session/<int:session_id>/end', methods=['POST'])
@login_required
def end_session(session_id):
    if current_user.role not in (Role.ADMIN, Role.TEACHER):
        return jsonify({'error': 'Unauthorized'}), 403

    session = db.session.get(Session, session_id)
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    session.status = SessionStatus.COMPLETED
    db.session.commit()

    # Award XP to attending students
    from app.models.classroom import Attendance, AttendanceStatus
    from app.utils.wallet import get_or_create_wallet
    from app.utils.gamification_service import update_student_streak, check_and_award_badges
    attendees = Attendance.query.filter_by(
        session_id=session_id, status=AttendanceStatus.PRESENT
    ).all()
    for att in attendees:
        xp = StudentXP(student_id=att.student_id, amount=50,
                        reason='حضور جلسة', session_id=session_id)
        db.session.add(xp)
        # Award coins for session attendance
        wallet = get_or_create_wallet(att.student_id)
        wallet.coins += 10
    db.session.commit()

    # Update streaks and badges for attendees
    for att in attendees:
        try:
            update_student_streak(att.student_id)
            check_and_award_badges(att.student_id)
        except Exception:
            pass

    return jsonify({'ok': True})


# ─────────────────────────────────────────────────────────────────────
# Admin CRUD Endpoints
# ─────────────────────────────────────────────────────────────────────

@bp.route('/admin/users/<int:user_id>', methods=['DELETE'])
@login_required
def admin_delete_user(user_id):
    """Delete a user (admin only)."""
    if current_user.role != Role.ADMIN:
        return jsonify({'error': 'Unauthorized'}), 403

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    # Prevent admin from deleting themselves
    if user.id == current_user.id:
        return jsonify({'error': 'Cannot delete your own account'}), 400

    db.session.delete(user)
    db.session.commit()
    return jsonify({'ok': True})


@bp.route('/admin/groups/<int:group_id>', methods=['DELETE'])
@login_required
def admin_delete_group(group_id):
    """Delete a group (admin only). Cascades to sessions, memberships."""
    if current_user.role != Role.ADMIN:
        return jsonify({'error': 'Unauthorized'}), 403

    group = db.session.get(Group, group_id)
    if not group:
        return jsonify({'error': 'Group not found'}), 404

    db.session.delete(group)
    db.session.commit()
    return jsonify({'ok': True})


@bp.route('/admin/resources/<int:resource_id>', methods=['DELETE'])
@login_required
def admin_delete_resource(resource_id):
    """Delete a resource (admin only)."""
    if current_user.role != Role.ADMIN:
        return jsonify({'error': 'Unauthorized'}), 403

    resource = db.session.get(Resource, resource_id)
    if not resource:
        return jsonify({'error': 'Resource not found'}), 404

    db.session.delete(resource)
    db.session.commit()
    return jsonify({'ok': True})


@bp.route('/admin/users/<int:user_id>/toggle-active', methods=['POST'])
@login_required
def admin_toggle_user_active(user_id):
    """Toggle user is_active status (admin only)."""
    if current_user.role != Role.ADMIN:
        return jsonify({'error': 'Unauthorized'}), 403

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    # Prevent admin from deactivating themselves
    if user.id == current_user.id:
        return jsonify({'error': 'Cannot deactivate your own account'}), 400

    user.is_active = not user.is_active
    db.session.commit()
    return jsonify({'ok': True, 'is_active': user.is_active})


# ─────────────────────────────────────────────────────────────────────
# Teacher Endpoints
# ─────────────────────────────────────────────────────────────────────

@bp.route('/teacher/award-xp', methods=['POST'])
@login_required
def teacher_award_xp():
    """Award XP to a student (teacher only)."""
    if current_user.role not in (Role.ADMIN, Role.TEACHER):
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json()
    student_id = data.get('student_id')
    amount = safe_int(data.get('amount', 0))
    reason = data.get('reason', 'مكافأة من المعلم')

    if not student_id or amount <= 0:
        return jsonify({'error': 'Invalid data'}), 400

    # Verify the student exists and is actually a student
    student = db.session.get(User, student_id)
    if not student or student.role != Role.STUDENT:
        return jsonify({'error': 'Student not found'}), 404

    xp = StudentXP(student_id=student_id, amount=amount, reason=reason)
    db.session.add(xp)

    # Create notification for the student
    try:
        from app.models.notification import NotificationType
        notif = Notification(
            user_id=student_id,
            title='نقاط جديدة!',
            message=f'حصلت على {amount} نقطة XP: {reason}',
            type=NotificationType.SYSTEM,
        )
        db.session.add(notif)
    except Exception:
        pass  # Notification is optional

    db.session.commit()

    total = StudentXP.total_xp(student_id)
    level = StudentXP.current_level(total)

    return jsonify({'ok': True, 'total_xp': total, 'level': level})


@bp.route('/teacher/grade', methods=['POST'])
@login_required
def teacher_grade_submission():
    """Grade a homework submission (teacher only)."""
    if current_user.role not in (Role.ADMIN, Role.TEACHER):
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json()
    submission_id = data.get('submission_id')
    grade = safe_int(data.get('grade'))
    feedback = data.get('feedback', '')

    if submission_id is None or grade is None:
        return jsonify({'error': 'Missing submission_id or grade'}), 400

    if grade < 0 or grade > 100:
        return jsonify({'error': 'Grade must be between 0 and 100'}), 400

    submission = db.session.get(HomeworkSubmission, submission_id)
    if not submission:
        return jsonify({'error': 'Submission not found'}), 404

    submission.grade = grade
    submission.feedback = feedback
    submission.graded_at = datetime.now(timezone.utc)
    db.session.commit()

    # Award XP and coins based on grade
    if grade >= 50:
        xp_amount = 10 + (grade // 10) * 5  # 10-60 XP based on grade
        xp = StudentXP(
            student_id=submission.student_id,
            amount=xp_amount,
            reason=f'تقييم واجب: {submission.homework.title}',
        )
        db.session.add(xp)
        # Award coins based on grade tier
        from app.utils.wallet import get_or_create_wallet
        coin_amount = 5 + (grade // 20) * 5  # 5-30 coins
        wallet = get_or_create_wallet(submission.student_id)
        wallet.coins += coin_amount
        db.session.commit()

    return jsonify({'ok': True, 'grade': grade, 'feedback': feedback})


# ─────────────────────────────────────────────────────────────────────
# Notification Endpoints (individual mark-as-read)
# ─────────────────────────────────────────────────────────────────────

@bp.route('/resources/<int:resource_id>/slides')
@login_required
def get_slide_urls(resource_id):
    """Return slide image URLs for a resource."""
    resource = db.session.get(Resource, resource_id)
    if not resource:
        return jsonify({'error': 'Resource not found'}), 404

    files = ResourceFile.query.filter_by(
        resource_id=resource_id, file_type=FileType.SLIDE_IMAGE
    ).order_by(ResourceFile.sort_order).all()

    return jsonify({
        'resource_id': resource_id,
        'slides': [{'url': f.s3_key, 'filename': f.filename} for f in files],
    })


@bp.route('/notifications/<int:notif_id>/read', methods=['POST'])
@login_required
def mark_notification_read(notif_id):
    """Mark a single notification as read."""
    n = db.session.get(Notification, notif_id)
    if not n or n.user_id != current_user.id:
        return jsonify({'error': 'Notification not found'}), 404

    n.is_read = True
    db.session.commit()
    return jsonify({'ok': True})


@bp.route('/setup-journey-tables')
def setup_journey_tables():
    """One-time route to add gamified journey columns and tables to PostgreSQL."""
    from sqlalchemy import text
    results = []

    try:
        conn = db.engine.connect()

        # --- Add columns to existing tables (IF NOT EXISTS) ---
        alter_columns = [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS motivation_type VARCHAR(20)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE badges ADD COLUMN IF NOT EXISTS tier INTEGER NOT NULL DEFAULT 1",
        ]
        for sql in alter_columns:
            try:
                conn.execute(text(sql))
                results.append(f"OK: {sql}")
            except Exception as e:
                results.append(f"SKIP: {sql} ({e})")

        # --- Mark all existing students as onboarded ---
        try:
            conn.execute(text("UPDATE users SET onboarding_completed = TRUE WHERE role = 'student'"))
            results.append("OK: Existing students marked as onboarded")
        except Exception as e:
            results.append(f"SKIP: mark onboarded ({e})")

        # --- Create new tables ---
        create_tables = [
            """CREATE TABLE IF NOT EXISTS student_wallets (
                id SERIAL PRIMARY KEY,
                student_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                coins INTEGER NOT NULL DEFAULT 0,
                gems INTEGER NOT NULL DEFAULT 0
            )""",
            """CREATE TABLE IF NOT EXISTS currency_transactions (
                id SERIAL PRIMARY KEY,
                student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                currency VARCHAR(10) NOT NULL,
                amount INTEGER NOT NULL,
                reason VARCHAR(200) NOT NULL DEFAULT '',
                created_at TIMESTAMP
            )""",
            """CREATE TABLE IF NOT EXISTS quests (
                id SERIAL PRIMARY KEY,
                title VARCHAR(200) NOT NULL,
                title_ar VARCHAR(200) NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                description_ar TEXT NOT NULL DEFAULT '',
                difficulty VARCHAR(20) NOT NULL DEFAULT 'beginner',
                category VARCHAR(20) NOT NULL DEFAULT 'coding',
                xp_reward INTEGER NOT NULL DEFAULT 50,
                coin_reward INTEGER NOT NULL DEFAULT 20,
                gem_reward INTEGER NOT NULL DEFAULT 0,
                required_level INTEGER NOT NULL DEFAULT 1,
                prerequisite_quest_id INTEGER REFERENCES quests(id),
                track_id VARCHAR(50) REFERENCES tracks(id),
                estimated_minutes INTEGER NOT NULL DEFAULT 15,
                sort_order INTEGER NOT NULL DEFAULT 0
            )""",
            """CREATE TABLE IF NOT EXISTS student_quests (
                id SERIAL PRIMARY KEY,
                student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                quest_id INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
                status VARCHAR(20) NOT NULL DEFAULT 'available',
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                UNIQUE(student_id, quest_id)
            )""",
            """CREATE TABLE IF NOT EXISTS activities (
                id SERIAL PRIMARY KEY,
                title VARCHAR(200) NOT NULL,
                title_ar VARCHAR(200) NOT NULL,
                activity_type VARCHAR(20) NOT NULL DEFAULT 'coding',
                source VARCHAR(20) NOT NULL DEFAULT 'self_paced',
                difficulty VARCHAR(20) NOT NULL DEFAULT 'beginner',
                xp_reward INTEGER NOT NULL DEFAULT 20,
                coin_reward INTEGER NOT NULL DEFAULT 10,
                track_id VARCHAR(50) REFERENCES tracks(id),
                quest_id INTEGER REFERENCES quests(id),
                session_id INTEGER REFERENCES sessions(id),
                due_date TIMESTAMP,
                estimated_minutes INTEGER NOT NULL DEFAULT 10,
                sort_order INTEGER NOT NULL DEFAULT 0
            )""",
            """CREATE TABLE IF NOT EXISTS student_activities (
                id SERIAL PRIMARY KEY,
                student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                score INTEGER,
                UNIQUE(student_id, activity_id)
            )""",
            """CREATE TABLE IF NOT EXISTS daily_rewards (
                id SERIAL PRIMARY KEY,
                day_number INTEGER NOT NULL UNIQUE,
                reward_type VARCHAR(20) NOT NULL,
                amount INTEGER NOT NULL DEFAULT 10,
                label_ar VARCHAR(100) NOT NULL DEFAULT '',
                label_en VARCHAR(100) NOT NULL DEFAULT ''
            )""",
            """CREATE TABLE IF NOT EXISTS student_daily_rewards (
                id SERIAL PRIMARY KEY,
                student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                day_number INTEGER NOT NULL,
                claimed_at TIMESTAMP,
                cycle_start DATE NOT NULL,
                UNIQUE(student_id, day_number, cycle_start)
            )""",
            """CREATE TABLE IF NOT EXISTS student_unit_progress (
                id SERIAL PRIMARY KEY,
                student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                track_id VARCHAR(50) NOT NULL,
                level_id VARCHAR(50) NOT NULL,
                unit_id VARCHAR(50) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'locked',
                completed_at TIMESTAMP,
                UNIQUE(student_id, track_id, level_id, unit_id),
                FOREIGN KEY (track_id, level_id, unit_id) REFERENCES units(track_id, level_id, id) ON DELETE CASCADE
            )""",
            """CREATE TABLE IF NOT EXISTS journey_milestones (
                id SERIAL PRIMARY KEY,
                student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                milestone_type VARCHAR(30) NOT NULL,
                title_ar VARCHAR(200) NOT NULL,
                title_en VARCHAR(200) NOT NULL DEFAULT '',
                detail VARCHAR(500),
                created_at TIMESTAMP
            )""",
            """CREATE TABLE IF NOT EXISTS lesson_contents (
                id SERIAL PRIMARY KEY,
                track_id VARCHAR(50) NOT NULL,
                level_id VARCHAR(50) NOT NULL,
                unit_id VARCHAR(50) NOT NULL,
                chapter_number INTEGER NOT NULL DEFAULT 1,
                title_ar VARCHAR(200) NOT NULL,
                title_en VARCHAR(200) NOT NULL DEFAULT '',
                content_html TEXT NOT NULL DEFAULT '',
                quiz_json TEXT,
                glossary_json TEXT,
                FOREIGN KEY (track_id, level_id, unit_id) REFERENCES units(track_id, level_id, id) ON DELETE CASCADE
            )""",
            """CREATE TABLE IF NOT EXISTS lesson_progress (
                id SERIAL PRIMARY KEY,
                student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                lesson_id INTEGER NOT NULL REFERENCES lesson_contents(id) ON DELETE CASCADE,
                completed BOOLEAN NOT NULL DEFAULT FALSE,
                completed_at TIMESTAMP,
                UNIQUE(student_id, lesson_id)
            )""",
        ]

        for sql in create_tables:
            try:
                conn.execute(text(sql))
                table_name = sql.split('IF NOT EXISTS')[1].split('(')[0].strip()
                results.append(f"OK: Table {table_name}")
            except Exception as e:
                results.append(f"ERROR: {e}")

        conn.execute(text("COMMIT"))
        conn.close()

        return jsonify({'status': 'success', 'results': results}), 200

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
