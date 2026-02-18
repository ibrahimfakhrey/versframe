from flask import jsonify, request
from flask_login import current_user, login_required
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.blueprints.api import bp
from app.extensions import db
from app.models.user import User, Role
from app.models.gamification import StudentXP, Badge, Streak, StudentBadge
from app.models.notification import Notification
from app.models.classroom import Session, SessionStatus, Group
from app.models.resource import Resource
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
    attendees = Attendance.query.filter_by(
        session_id=session_id, status=AttendanceStatus.PRESENT
    ).all()
    for att in attendees:
        xp = StudentXP(student_id=att.student_id, amount=50,
                        reason='حضور جلسة', session_id=session_id)
        db.session.add(xp)
    db.session.commit()

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

    # Award XP based on grade
    if grade >= 50:
        xp_amount = 10 + (grade // 10) * 5  # 10-60 XP based on grade
        xp = StudentXP(
            student_id=submission.student_id,
            amount=xp_amount,
            reason=f'تقييم واجب: {submission.homework.title}',
        )
        db.session.add(xp)
        db.session.commit()

    return jsonify({'ok': True, 'grade': grade, 'feedback': feedback})


# ─────────────────────────────────────────────────────────────────────
# Notification Endpoints (individual mark-as-read)
# ─────────────────────────────────────────────────────────────────────

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
