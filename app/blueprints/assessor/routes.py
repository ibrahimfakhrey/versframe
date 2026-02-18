from flask import render_template, request, redirect, url_for, flash, jsonify
from flask_login import current_user
from app.blueprints.assessor import bp
from app.extensions import db
from app.models.user import User, Role
from app.models.assessment import Assessment, AssessmentReport, AssessmentStatus
from app.models.curriculum import Track
from app.models.gamification import StudentXP
from app.utils.decorators import assessor_required
from app.utils.helpers import paginate, safe_int
from datetime import datetime, timezone


@bp.route('/')
@assessor_required
def dashboard():
    upcoming_assessments = Assessment.query.filter_by(
        assessor_id=current_user.id, status=AssessmentStatus.SCHEDULED
    ).order_by(Assessment.scheduled_at).all()
    completed = Assessment.query.filter_by(
        assessor_id=current_user.id, status=AssessmentStatus.COMPLETED
    ).order_by(Assessment.scheduled_at.desc()).limit(10).all()
    total = Assessment.query.filter_by(assessor_id=current_user.id).count()
    stats = {
        'total_assessments': total,
        'completed': len(completed),
        'pending': len(upcoming_assessments),
    }
    recent_reports = []
    return render_template('assessor/dashboard.html',
                           upcoming_assessments=upcoming_assessments,
                           completed=completed, stats=stats,
                           recent_reports=recent_reports)


@bp.route('/assessments')
@assessor_required
def assessments():
    page = safe_int(request.args.get('page', 1))
    query = Assessment.query.filter_by(assessor_id=current_user.id).order_by(
        Assessment.scheduled_at.desc()
    )
    result = paginate(query, page)
    return render_template('assessor/assessments.html', assessments=result['items'],
                           page=result['page'], pages=result['pages'], total=result['total'])


@bp.route('/assessments/<int:assessment_id>')
@assessor_required
def assessment_detail(assessment_id):
    assessment = db.session.get(Assessment, assessment_id)
    if not assessment or assessment.assessor_id != current_user.id:
        flash('التقييم غير موجود', 'error')
        return redirect(url_for('assessor.assessments'))
    return render_template('assessor/assessment_detail.html',
                           assessment=assessment,
                           student=assessment.student,
                           report=assessment.report)


@bp.route('/assessments/<int:assessment_id>/report', methods=['POST'])
@assessor_required
def submit_report(assessment_id):
    assessment = db.session.get(Assessment, assessment_id)
    if not assessment or assessment.assessor_id != current_user.id:
        flash('التقييم غير موجود', 'error')
        return redirect(url_for('assessor.assessments'))

    report = assessment.report or AssessmentReport(assessment_id=assessment.id)
    report.strengths = request.form.get('strengths', '')
    report.weaknesses = request.form.get('weaknesses', '')
    report.recommended_track_id = request.form.get('recommended_track_id') or None
    report.recommended_level = request.form.get('recommended_level') or None
    report.personality_notes = request.form.get('personality_notes', '')
    report.overall_score = safe_int(request.form.get('overall_score'), None)

    if not assessment.report:
        db.session.add(report)
    assessment.status = AssessmentStatus.COMPLETED
    db.session.commit()

    flash('تم حفظ تقرير التقييم بنجاح', 'success')
    return redirect(url_for('assessor.assessment_detail', assessment_id=assessment_id))


@bp.route('/students')
@assessor_required
def students():
    """List all students the assessor has assessed or is scheduled to assess."""
    assessed_ids = db.session.query(Assessment.student_id).filter_by(
        assessor_id=current_user.id
    ).distinct().all()
    student_ids = [r[0] for r in assessed_ids]
    students_list = User.query.filter(User.id.in_(student_ids), User.role == Role.STUDENT).all() if student_ids else []
    return render_template('assessor/students.html', students=students_list)


@bp.route('/students/<int:student_id>')
@assessor_required
def student_profile(student_id):
    student = db.session.get(User, student_id)
    if not student or student.role != Role.STUDENT:
        flash('الطالب غير موجود', 'error')
        return redirect(url_for('assessor.dashboard'))
    total_xp = StudentXP.total_xp(student_id)
    level = StudentXP.current_level(total_xp)
    assessment_history = Assessment.query.filter_by(student_id=student_id).order_by(
        Assessment.scheduled_at.desc()
    ).all()
    from app.models.classroom import GroupStudent, Group
    group_ids = [gs.group_id for gs in GroupStudent.query.filter_by(student_id=student_id).all()]
    groups = Group.query.filter(Group.id.in_(group_ids)).all() if group_ids else []
    return render_template('assessor/student_profile.html', student=student,
                           xp_total=total_xp, level=level,
                           assessment_history=assessment_history, groups=groups)
