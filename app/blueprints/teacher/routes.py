from flask import render_template, request, redirect, url_for, flash, jsonify
from flask_login import current_user
from app.blueprints.teacher import bp
from app.extensions import db
from app.models.user import User, Role
from app.models.classroom import Group, Session, SessionStatus, Attendance, AttendanceStatus
from app.models.homework import Homework, HomeworkSubmission
from app.models.gamification import StudentXP
from app.utils.decorators import teacher_required
from app.utils.helpers import paginate, safe_int
from datetime import datetime, date, timedelta, timezone


@bp.route('/')
@teacher_required
def dashboard():
    my_groups = Group.query.filter_by(teacher_id=current_user.id, is_active=True).all()
    upcoming_sessions = Session.query.filter_by(
        teacher_id=current_user.id, status=SessionStatus.SCHEDULED
    ).order_by(Session.scheduled_at).limit(5).all()
    recent_sessions = Session.query.filter_by(
        teacher_id=current_user.id, status=SessionStatus.COMPLETED
    ).order_by(Session.scheduled_at.desc()).limit(5).all()
    return render_template('teacher/dashboard.html',
                           groups=my_groups, upcoming=upcoming_sessions, recent=recent_sessions)


@bp.route('/timetable')
@teacher_required
def timetable():
    offset = request.args.get('week_offset', 0, type=int)
    today = date.today()
    # Saturday = start of Arabic week (weekday(): Mon=0 … Sun=6)
    start = today - timedelta(days=(today.weekday() + 2) % 7) + timedelta(weeks=offset)
    end = start + timedelta(days=7)

    sessions = Session.query.filter(
        Session.teacher_id == current_user.id,
        Session.scheduled_at >= datetime.combine(start, datetime.min.time()),
        Session.scheduled_at < datetime.combine(end, datetime.min.time())
    ).order_by(Session.scheduled_at).all()

    day_names = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']
    days = []
    for i in range(7):
        d = start + timedelta(days=i)
        day_sessions = [s for s in sessions if s.scheduled_at and s.scheduled_at.date() == d]
        days.append({'date': d, 'name': day_names[i], 'sessions': day_sessions, 'is_today': d == today})

    week_label = f"{start.strftime('%Y-%m-%d')} → {(end - timedelta(days=1)).strftime('%Y-%m-%d')}"

    return render_template('teacher/timetable.html',
                           days=days, week_offset=offset, week_label=week_label)


@bp.route('/groups')
@teacher_required
def groups():
    my_groups = Group.query.filter_by(teacher_id=current_user.id).order_by(Group.created_at.desc()).all()
    return render_template('teacher/groups.html', groups=my_groups)


@bp.route('/groups/<int:group_id>')
@teacher_required
def group_detail(group_id):
    group = db.session.get(Group, group_id)
    if not group or group.teacher_id != current_user.id:
        flash('المجموعة غير موجودة', 'error')
        return redirect(url_for('teacher.groups'))
    sessions = group.sessions.order_by(Session.scheduled_at.desc()).all()
    return render_template('teacher/group_detail.html', group=group, sessions=sessions)


# ========================================================
# Sessions
# ========================================================

@bp.route('/sessions')
@teacher_required
def sessions():
    page = safe_int(request.args.get('page', 1))
    query = Session.query.filter_by(teacher_id=current_user.id).order_by(Session.scheduled_at.desc())
    result = paginate(query, page)
    my_groups = Group.query.filter_by(teacher_id=current_user.id, is_active=True).all()
    return render_template('teacher/sessions.html', **result, groups=my_groups)


@bp.route('/sessions/<int:session_id>')
@teacher_required
def session_detail(session_id):
    session = db.session.get(Session, session_id)
    if not session or session.teacher_id != current_user.id:
        flash('الجلسة غير موجودة', 'error')
        return redirect(url_for('teacher.sessions'))
    attendance_list = session.attendance.all()
    return render_template('teacher/session_detail.html', session=session,
                           attendance_list=attendance_list)


@bp.route('/sessions/new', methods=['POST'])
@teacher_required
def session_create():
    """Create a new session."""
    title = request.form.get('title', '').strip()
    group_id = safe_int(request.form.get('group_id'))
    scheduled_at_str = request.form.get('scheduled_at', '')
    duration_minutes = safe_int(request.form.get('duration_minutes'), 60)

    if not title:
        flash('عنوان الجلسة مطلوب', 'error')
        return redirect(url_for('teacher.sessions'))

    group = db.session.get(Group, group_id)
    if not group or group.teacher_id != current_user.id:
        flash('المجموعة غير موجودة', 'error')
        return redirect(url_for('teacher.sessions'))

    scheduled_at = None
    if scheduled_at_str:
        try:
            scheduled_at = datetime.fromisoformat(scheduled_at_str)
        except ValueError:
            flash('تاريخ غير صالح', 'error')
            return redirect(url_for('teacher.sessions'))
    else:
        flash('موعد الجلسة مطلوب', 'error')
        return redirect(url_for('teacher.sessions'))

    new_session = Session(
        title=title,
        group_id=group_id,
        teacher_id=current_user.id,
        scheduled_at=scheduled_at,
        duration_minutes=duration_minutes,
        status=SessionStatus.SCHEDULED,
    )
    db.session.add(new_session)
    db.session.commit()
    flash('تم إنشاء الجلسة بنجاح', 'success')
    return redirect(url_for('teacher.sessions'))


@bp.route('/sessions/<int:session_id>/start', methods=['POST'])
@teacher_required
def session_start(session_id):
    """Start a session: create 100ms room, set status to live, redirect to room."""
    session = db.session.get(Session, session_id)
    if not session or session.teacher_id != current_user.id:
        flash('الجلسة غير موجودة', 'error')
        return redirect(url_for('teacher.sessions'))

    if session.status != SessionStatus.SCHEDULED:
        flash('لا يمكن بدء هذه الجلسة - الحالة الحالية: ' + session.status.value, 'error')
        return redirect(url_for('teacher.session_detail', session_id=session_id))

    # Create 100ms room
    try:
        from app.utils.hundredms import create_room
        room_name = f'session-{session.id}-group-{session.group_id}'
        room_id = create_room(room_name, description=session.title)
        session.hundredms_room_id = room_id
    except Exception as e:
        flash(f'خطأ في إنشاء غرفة الفيديو: {str(e)}', 'error')
        return redirect(url_for('teacher.session_detail', session_id=session_id))

    session.status = SessionStatus.LIVE
    db.session.commit()
    flash('تم بدء الجلسة بنجاح', 'success')
    return redirect(url_for('room.room', session_id=session_id))


@bp.route('/sessions/<int:session_id>/end', methods=['POST'])
@teacher_required
def session_end(session_id):
    """End a live session: mark completed, finalize attendance, award XP."""
    session = db.session.get(Session, session_id)
    if not session or session.teacher_id != current_user.id:
        flash('الجلسة غير موجودة', 'error')
        return redirect(url_for('teacher.sessions'))

    if session.status != SessionStatus.LIVE:
        flash('لا يمكن إنهاء هذه الجلسة - الحالة الحالية: ' + session.status.value, 'error')
        return redirect(url_for('teacher.session_detail', session_id=session_id))

    now = datetime.now(timezone.utc)

    # Mark session as completed
    session.status = SessionStatus.COMPLETED

    # End 100ms room if exists
    if session.hundredms_room_id:
        try:
            from app.utils.hundredms import end_room
            end_room(session.hundredms_room_id)
        except Exception:
            pass  # Non-critical: room may already be ended

    # Update attendance: set left_at for anyone still connected
    open_attendance = Attendance.query.filter_by(session_id=session_id).filter(
        Attendance.left_at.is_(None),
        Attendance.joined_at.isnot(None),
    ).all()
    for att in open_attendance:
        att.left_at = now
        if att.joined_at:
            joined = att.joined_at.replace(tzinfo=timezone.utc) if att.joined_at.tzinfo is None else att.joined_at
            att.duration_seconds = int((now - joined).total_seconds())

    db.session.commit()

    # Award +50 XP to each student who attended
    attended = Attendance.query.filter_by(session_id=session_id).filter(
        Attendance.status.in_([AttendanceStatus.PRESENT, AttendanceStatus.LATE])
    ).all()
    for att in attended:
        xp = StudentXP(
            student_id=att.student_id,
            amount=50,
            reason=f'حضور جلسة: {session.title}',
            session_id=session.id,
        )
        db.session.add(xp)
    db.session.commit()

    flash(f'تم إنهاء الجلسة بنجاح - تم منح 50 XP لـ {len(attended)} طالب', 'success')
    return redirect(url_for('teacher.session_detail', session_id=session_id))


@bp.route('/sessions/<int:session_id>/report', methods=['POST'])
@teacher_required
def session_report(session_id):
    session = db.session.get(Session, session_id)
    if not session or session.teacher_id != current_user.id:
        return jsonify({'error': 'Not found'}), 404
    session.teacher_notes = request.form.get('notes', '')
    db.session.commit()
    flash('تم حفظ ملاحظات الجلسة', 'success')
    return redirect(url_for('teacher.session_detail', session_id=session_id))


# ========================================================
# Homework
# ========================================================

@bp.route('/homework')
@teacher_required
def homework():
    page = safe_int(request.args.get('page', 1))
    query = Homework.query.filter_by(teacher_id=current_user.id).order_by(Homework.created_at.desc())
    result = paginate(query, page)
    my_groups = Group.query.filter_by(teacher_id=current_user.id, is_active=True).all()
    return render_template('teacher/homework.html', **result, groups=my_groups)


@bp.route('/homework/new', methods=['POST'])
@teacher_required
def homework_create():
    title = request.form.get('title', '').strip()
    description = request.form.get('description', '').strip()
    group_id = safe_int(request.form.get('group_id'))
    due_date_str = request.form.get('due_date', '')

    if not title:
        flash('عنوان الواجب مطلوب', 'error')
        return redirect(url_for('teacher.homework'))

    group = db.session.get(Group, group_id)
    if not group or group.teacher_id != current_user.id:
        flash('المجموعة غير موجودة', 'error')
        return redirect(url_for('teacher.homework'))

    due_date = None
    if due_date_str:
        try:
            due_date = datetime.fromisoformat(due_date_str)
        except ValueError:
            pass

    hw = Homework(
        title=title, description=description,
        group_id=group_id, teacher_id=current_user.id,
        due_date=due_date,
    )
    db.session.add(hw)
    db.session.commit()
    flash('تم إنشاء الواجب بنجاح', 'success')
    return redirect(url_for('teacher.homework'))


@bp.route('/homework/<int:hw_id>')
@teacher_required
def homework_detail(hw_id):
    """View homework submissions for grading."""
    hw = db.session.get(Homework, hw_id)
    if not hw or hw.teacher_id != current_user.id:
        flash('الواجب غير موجود', 'error')
        return redirect(url_for('teacher.homework'))
    submissions = hw.submissions.order_by(HomeworkSubmission.submitted_at.desc()).all()
    return render_template('teacher/homework_detail.html', hw=hw, submissions=submissions)


@bp.route('/homework/<int:hw_id>/grade/<int:submission_id>', methods=['POST'])
@teacher_required
def homework_grade(hw_id, submission_id):
    """Grade a specific homework submission."""
    hw = db.session.get(Homework, hw_id)
    if not hw or hw.teacher_id != current_user.id:
        flash('الواجب غير موجود', 'error')
        return redirect(url_for('teacher.homework'))

    sub = db.session.get(HomeworkSubmission, submission_id)
    if not sub or sub.homework_id != hw.id:
        flash('التسليم غير موجود', 'error')
        return redirect(url_for('teacher.homework_detail', hw_id=hw_id))

    grade_val = safe_int(request.form.get('grade'), None)
    if grade_val is None or grade_val < 0 or grade_val > 100:
        flash('الدرجة يجب أن تكون بين 0 و 100', 'error')
        return redirect(url_for('teacher.homework_detail', hw_id=hw_id))

    sub.grade = grade_val
    sub.feedback = request.form.get('feedback', '').strip()
    sub.graded_at = datetime.now(timezone.utc)
    db.session.commit()

    # Award XP based on grade: A(90+)=+50, B(80+)=+30, C(70+)=+20, else +10
    if sub.grade >= 90:
        xp_amount = 50
    elif sub.grade >= 80:
        xp_amount = 30
    elif sub.grade >= 70:
        xp_amount = 20
    else:
        xp_amount = 10

    xp = StudentXP(
        student_id=sub.student_id,
        amount=xp_amount,
        reason=f'واجب: {hw.title} (درجة: {sub.grade})',
    )
    db.session.add(xp)
    db.session.commit()

    flash(f'تم تقييم الواجب بنجاح - تم منح {xp_amount} XP', 'success')
    return redirect(url_for('teacher.homework_detail', hw_id=hw_id))


@bp.route('/students/<int:student_id>')
@teacher_required
def student_profile(student_id):
    student = db.session.get(User, student_id)
    if not student or student.role != Role.STUDENT:
        flash('الطالب غير موجود', 'error')
        return redirect(url_for('teacher.dashboard'))
    total_xp = StudentXP.total_xp(student_id)
    level = StudentXP.current_level(total_xp)
    return render_template('teacher/student_profile.html', student=student,
                           total_xp=total_xp, level=level)
