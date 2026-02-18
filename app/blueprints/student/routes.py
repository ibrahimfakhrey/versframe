from flask import render_template, request, redirect, url_for, flash, jsonify
from flask_login import current_user
from app.blueprints.student import bp
from app.extensions import db
from app.models.user import User, Role
from app.models.classroom import Group, GroupStudent, Session, SessionStatus, Attendance
from app.models.homework import Homework, HomeworkSubmission
from app.models.gamification import StudentXP, Badge, Streak, StudentBadge
from app.models.notification import Notification
from app.models.curriculum import Track
from app.utils.decorators import student_required
from app.utils.helpers import safe_int
from app.utils.uploads import (save_upload, get_upload_url, delete_upload,
                                ALLOWED_IMAGES, ALLOWED_DOCUMENTS, ALLOWED_ALL)
from datetime import datetime, timezone
from sqlalchemy import func


@bp.route('/')
@student_required
def dashboard():
    student_id = current_user.id
    total_xp = StudentXP.total_xp(student_id)
    level = StudentXP.current_level(total_xp)
    level_title_ar, level_title_en = StudentXP.level_title(level)

    # Streak
    streak = Streak.query.filter_by(student_id=student_id).first()
    current_streak = streak.current_streak if streak else 0

    # My groups
    group_ids = [gs.group_id for gs in GroupStudent.query.filter_by(student_id=student_id).all()]

    # Upcoming sessions
    upcoming_sessions = Session.query.filter(
        Session.group_id.in_(group_ids),
        Session.status == SessionStatus.SCHEDULED,
    ).order_by(Session.scheduled_at).limit(3).all() if group_ids else []

    # Recent XP
    recent_xp = StudentXP.query.filter_by(student_id=student_id).order_by(
        StudentXP.created_at.desc()
    ).limit(10).all()

    # Badges
    badges_earned = current_user.badges_earned.all()
    all_badges = Badge.query.all()

    # Leaderboard - get top 10 students by XP
    leaderboard = db.session.query(
        User.id, User.name_ar, User.avatar_url,
        func.coalesce(func.sum(StudentXP.amount), 0).label('total_xp')
    ).outerjoin(StudentXP, User.id == StudentXP.student_id).filter(
        User.role == Role.STUDENT
    ).group_by(User.id).order_by(func.sum(StudentXP.amount).desc()).limit(10).all()

    # My rank
    my_rank_query = db.session.query(func.count()).filter(
        StudentXP.student_id != student_id
    ).group_by(StudentXP.student_id).having(
        func.sum(StudentXP.amount) > total_xp
    )
    my_rank = my_rank_query.count() + 1

    # Pending homework
    pending_homework = HomeworkSubmission.query.join(Homework).filter(
        HomeworkSubmission.student_id == student_id,
        HomeworkSubmission.grade.is_(None),
    ).all() if group_ids else []

    # Homework due soon (not yet submitted)
    my_submission_hw_ids = [s.homework_id for s in HomeworkSubmission.query.filter_by(
        student_id=student_id
    ).all()]
    homework_due = Homework.query.filter(
        Homework.group_id.in_(group_ids),
        ~Homework.id.in_(my_submission_hw_ids) if my_submission_hw_ids else Homework.id.isnot(None),
    ).order_by(Homework.due_date).limit(3).all() if group_ids else []

    # Notifications count
    unread_count = Notification.query.filter_by(user_id=student_id, is_read=False).count()

    # XP thresholds for level progress bar
    thresholds = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5000,
                  6500, 8000, 10000, 12500, 15000, 18000, 21000, 25000]
    current_threshold = thresholds[level - 1] if level <= len(thresholds) else thresholds[-1]
    next_threshold = thresholds[level] if level < len(thresholds) else thresholds[-1] + 5000
    xp_progress = ((total_xp - current_threshold) / max(next_threshold - current_threshold, 1)) * 100

    # Curriculum tracks (universes)
    tracks = Track.query.order_by(Track.sort_order).all()

    # Live sessions the student can join now
    live_sessions = Session.query.filter(
        Session.group_id.in_(group_ids),
        Session.status == SessionStatus.LIVE,
    ).all() if group_ids else []

    # My groups with details
    my_groups = Group.query.filter(Group.id.in_(group_ids)).all() if group_ids else []

    return render_template('student/dashboard.html',
                           total_xp=total_xp, level=level,
                           level_title_ar=level_title_ar, level_title_en=level_title_en,
                           current_streak=current_streak,
                           upcoming_sessions=upcoming_sessions,
                           live_sessions=live_sessions,
                           recent_xp=recent_xp,
                           badges_earned=badges_earned, all_badges=all_badges,
                           leaderboard=leaderboard, my_rank=my_rank,
                           pending_homework=pending_homework,
                           homework_due=homework_due,
                           unread_count=unread_count,
                           xp_progress=min(xp_progress, 100),
                           next_threshold=next_threshold,
                           tracks=tracks,
                           my_groups=my_groups)


@bp.route('/timetable')
@student_required
def timetable():
    student_id = current_user.id
    group_ids = [gs.group_id for gs in GroupStudent.query.filter_by(student_id=student_id).all()]
    sessions = Session.query.filter(
        Session.group_id.in_(group_ids),
        Session.status.in_([SessionStatus.SCHEDULED, SessionStatus.LIVE]),
    ).order_by(Session.scheduled_at).all() if group_ids else []

    # Arabic weekday names (Saturday–Friday)
    days = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']
    weekday_map = {5: 'السبت', 6: 'الأحد', 0: 'الاثنين', 1: 'الثلاثاء',
                   2: 'الأربعاء', 3: 'الخميس', 4: 'الجمعة'}
    timetable_dict = {d: [] for d in days}
    for s in sessions:
        day_name = weekday_map.get(s.scheduled_at.weekday(), 'السبت')
        timetable_dict[day_name].append(s)

    return render_template('student/timetable.html', days=days, timetable=timetable_dict)


@bp.route('/sessions')
@student_required
def sessions():
    student_id = current_user.id
    group_ids = [gs.group_id for gs in GroupStudent.query.filter_by(student_id=student_id).all()]

    all_sessions = Session.query.filter(
        Session.group_id.in_(group_ids),
    ).order_by(Session.scheduled_at).all() if group_ids else []

    live_sessions = [s for s in all_sessions if s.status == SessionStatus.LIVE]
    upcoming_sessions = [s for s in all_sessions if s.status == SessionStatus.SCHEDULED]
    completed_sessions = sorted(
        [s for s in all_sessions if s.status == SessionStatus.COMPLETED],
        key=lambda s: s.scheduled_at, reverse=True
    )

    return render_template('student/sessions.html',
                           live_sessions=live_sessions,
                           upcoming_sessions=upcoming_sessions,
                           completed_sessions=completed_sessions)


@bp.route('/progress')
@student_required
def progress():
    student_id = current_user.id
    total_xp = StudentXP.total_xp(student_id)
    level = StudentXP.current_level(total_xp)
    xp_history = StudentXP.query.filter_by(student_id=student_id).order_by(
        StudentXP.created_at.desc()
    ).limit(50).all()
    attendance_records = Attendance.query.filter_by(student_id=student_id).all()
    total_sessions = len(attendance_records)
    attended = sum(1 for a in attendance_records if a.status.value in ('present', 'late'))
    attendance_pct = (attended / total_sessions * 100) if total_sessions > 0 else 0
    return render_template('student/progress.html', total_xp=total_xp, level=level,
                           xp_history=xp_history, attendance_pct=attendance_pct,
                           total_sessions=total_sessions, attended=attended)


@bp.route('/badges')
@student_required
def badges():
    badges_earned = current_user.badges_earned.all()
    all_badges = Badge.query.all()
    earned_ids = {b.id for b in badges_earned}
    return render_template('student/badges.html',
                           badges_earned=badges_earned, all_badges=all_badges,
                           earned_ids=earned_ids)


@bp.route('/leaderboard')
@student_required
def leaderboard():
    period = request.args.get('period', 'all_time')
    rows = db.session.query(
        User.id, User.name_ar, User.avatar_url,
        func.coalesce(func.sum(StudentXP.amount), 0).label('total_xp')
    ).outerjoin(StudentXP, User.id == StudentXP.student_id).filter(
        User.role == Role.STUDENT
    ).group_by(User.id).order_by(func.sum(StudentXP.amount).desc()).limit(50).all()

    leaderboard_data = []
    student_rank = None
    for i, row in enumerate(rows):
        level = StudentXP.current_level(row.total_xp)
        entry = {
            'rank': i + 1, 'name': row.name_ar, 'name_ar': row.name_ar,
            'avatar': row.avatar_url, 'xp': row.total_xp, 'level': level,
        }
        leaderboard_data.append(type('Entry', (), entry)())
        if row.id == current_user.id:
            student_rank = i + 1

    return render_template('student/leaderboard.html',
                           leaderboard=leaderboard_data, period=period,
                           student_rank=student_rank)


@bp.route('/homework')
@student_required
def homework_list():
    student_id = current_user.id
    group_ids = [gs.group_id for gs in GroupStudent.query.filter_by(student_id=student_id).all()]
    homework_items = Homework.query.filter(Homework.group_id.in_(group_ids)).order_by(
        Homework.due_date.desc()
    ).all() if group_ids else []
    # Get my submissions
    my_submissions = {s.homework_id: s for s in HomeworkSubmission.query.filter_by(
        student_id=student_id
    ).all()}
    return render_template('student/homework.html',
                           homework_items=homework_items, my_submissions=my_submissions)


@bp.route('/homework/<int:hw_id>', methods=['GET', 'POST'])
@student_required
def homework_detail(hw_id):
    hw = db.session.get(Homework, hw_id)
    if not hw:
        flash('الواجب غير موجود', 'error')
        return redirect(url_for('student.homework_list'))

    existing = HomeworkSubmission.query.filter_by(
        homework_id=hw_id, student_id=current_user.id
    ).first()

    if request.method == 'POST' and not existing:
        content = request.form.get('content', '')
        file_url = None

        # Handle optional file upload
        uploaded_file = request.files.get('file')
        if uploaded_file and uploaded_file.filename:
            allowed = ALLOWED_DOCUMENTS | ALLOWED_IMAGES | {'zip'}
            saved_name = save_upload(uploaded_file, 'homework', allowed)
            if saved_name:
                file_url = get_upload_url(saved_name, 'homework')
            else:
                flash('فشل رفع الملف. تأكد من نوع وحجم الملف (حد أقصى 10 ميجا).', 'error')

        sub = HomeworkSubmission(
            homework_id=hw_id, student_id=current_user.id,
            content=content, file_url=file_url,
        )
        db.session.add(sub)
        db.session.commit()
        flash('تم تسليم الواجب بنجاح', 'success')
        return redirect(url_for('student.homework_list'))

    return render_template('student/homework_detail.html', homework=hw, submission=existing)


@bp.route('/profile', methods=['GET', 'POST'])
@student_required
def profile():
    if request.method == 'POST':
        current_user.name_ar = request.form.get('name_ar', current_user.name_ar).strip()
        current_user.name_en = request.form.get('name_en', current_user.name_en).strip()
        current_user.phone = request.form.get('phone', '').strip() or None

        # Handle avatar upload
        avatar_file = request.files.get('avatar')
        if avatar_file and avatar_file.filename:
            saved_name = save_upload(avatar_file, 'avatars', ALLOWED_IMAGES)
            if saved_name:
                # Delete old avatar if exists
                if current_user.avatar_url:
                    old_filename = current_user.avatar_url.rsplit('/', 1)[-1]
                    delete_upload(old_filename, 'avatars')
                current_user.avatar_url = get_upload_url(saved_name, 'avatars')
            else:
                flash('فشل رفع الصورة. الأنواع المسموحة: PNG, JPG, GIF, WEBP (حد أقصى 10 ميجا)', 'error')

        db.session.commit()
        flash('تم تحديث الملف الشخصي', 'success')

    student_id = current_user.id
    xp_total = StudentXP.total_xp(student_id)
    level = StudentXP.current_level(xp_total)
    _title_ar, _title_en = StudentXP.level_title(level)
    level_title = _title_ar

    streak = Streak.query.filter_by(student_id=student_id).first()
    if not streak:
        streak = Streak(student_id=student_id, current_streak=0, longest_streak=0)

    badges_count = current_user.badges_earned.count()
    sessions_attended = Attendance.query.filter_by(student_id=student_id).count()

    return render_template('student/profile.html',
                           xp_total=xp_total, level=level, level_title=level_title,
                           streak=streak, badges_count=badges_count,
                           sessions_attended=sessions_attended)
