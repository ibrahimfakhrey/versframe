from flask import render_template, redirect, url_for, flash
from flask_login import current_user
from app.blueprints.parent import bp
from app.extensions import db
from app.models.user import User, Role
from app.models.classroom import Attendance, Session, SessionStatus, GroupStudent
from app.models.homework import HomeworkSubmission, Homework
from app.models.gamification import StudentXP, Streak
from app.models.assessment import Assessment
from app.utils.decorators import parent_required


@bp.route('/')
@parent_required
def dashboard():
    children = current_user.children.all()
    children_data = {}
    for child in children:
        total_xp = StudentXP.total_xp(child.id)
        level = StudentXP.current_level(total_xp)
        streak = Streak.query.filter_by(student_id=child.id).first()
        group_ids = [gs.group_id for gs in GroupStudent.query.filter_by(student_id=child.id).all()]
        upcoming_count = Session.query.filter(
            Session.group_id.in_(group_ids),
            Session.status == SessionStatus.SCHEDULED
        ).count() if group_ids else 0
        children_data[child.id] = {
            'xp': total_xp,
            'level': level,
            'level_title': StudentXP.level_title(level),
            'streak': streak.current_streak if streak else 0,
            'upcoming_sessions_count': upcoming_count,
        }
    return render_template('parent/dashboard.html', children=children, children_data=children_data)


@bp.route('/children')
@parent_required
def children():
    children = current_user.children.all()
    return render_template('parent/children.html', children=children)


@bp.route('/children/<int:child_id>')
@parent_required
def child_detail(child_id):
    child = db.session.get(User, child_id)
    if not child or child not in current_user.children.all():
        flash('لا يمكنك الوصول إلى هذا الطالب', 'error')
        return redirect(url_for('parent.dashboard'))

    xp_total = StudentXP.total_xp(child.id)
    level = StudentXP.current_level(xp_total)
    level_title_ar, _ = StudentXP.level_title(level)
    streak_obj = Streak.query.filter_by(student_id=child.id).first()
    streak = streak_obj.current_streak if streak_obj else 0

    # Groups
    group_ids = [gs.group_id for gs in GroupStudent.query.filter_by(student_id=child.id).all()]
    from app.models.classroom import Group
    groups = Group.query.filter(Group.id.in_(group_ids)).all() if group_ids else []

    # Recent sessions
    recent_sessions = Session.query.filter(
        Session.group_id.in_(group_ids),
    ).order_by(Session.scheduled_at.desc()).limit(10).all() if group_ids else []

    # Homework summary
    submissions = HomeworkSubmission.query.filter_by(student_id=child.id).all()
    hw_completed = sum(1 for s in submissions if s.grade is not None)
    hw_pending = sum(1 for s in submissions if s.grade is None and s.submitted_at is not None)
    homework_summary = {'completed': hw_completed, 'pending': hw_pending, 'overdue': 0}

    # Badges
    from app.models.gamification import StudentBadge, Badge
    badge_ids = [sb.badge_id for sb in StudentBadge.query.filter_by(student_id=child.id).all()]
    badges = Badge.query.filter(Badge.id.in_(badge_ids)).all() if badge_ids else []

    return render_template('parent/child_detail.html',
                           child=child, xp_total=xp_total, level=level,
                           level_title=level_title_ar,
                           streak=streak,
                           recent_sessions=recent_sessions,
                           homework_summary=homework_summary,
                           groups=groups, badges=badges)


@bp.route('/children/<int:child_id>/reports')
@parent_required
def child_reports(child_id):
    child = db.session.get(User, child_id)
    if not child or child not in current_user.children.all():
        flash('لا يمكنك الوصول إلى هذا الطالب', 'error')
        return redirect(url_for('parent.dashboard'))

    assessments = Assessment.query.filter_by(student_id=child.id).order_by(
        Assessment.scheduled_at.desc()
    ).all()
    from app.models.assessment import AssessmentReport
    assessment_reports = [a.report for a in assessments if a.report]
    return render_template('parent/child_reports.html', child=child,
                           assessment_reports=assessment_reports,
                           session_reports=[])


@bp.route('/messages')
@parent_required
def messages():
    return render_template('parent/messages.html')
