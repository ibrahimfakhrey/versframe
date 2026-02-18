import json
from flask import render_template, request, redirect, url_for, flash, jsonify
from flask_login import current_user
from app.blueprints.admin import bp
from app.extensions import db
from app.models.user import User, Role
from app.models.classroom import Group, GroupStudent, Session, SessionStatus
from app.models.resource import Resource, ResourceType
from app.models.curriculum import Track, Level
from app.models.gamification import StudentXP
from app.utils.decorators import admin_required
from app.utils.helpers import paginate, safe_int
from app.utils.uploads import (save_upload, get_upload_url, delete_upload,
                                ALLOWED_DOCUMENTS, ALLOWED_IMAGES, ALLOWED_ALL)
from datetime import datetime


@bp.route('/')
@admin_required
def dashboard():
    stats = {
        'total_users': User.query.count(),
        'students': User.query.filter_by(role=Role.STUDENT).count(),
        'teachers': User.query.filter_by(role=Role.TEACHER).count(),
        'parents': User.query.filter_by(role=Role.PARENT).count(),
        'groups': Group.query.filter_by(is_active=True).count(),
        'sessions_total': Session.query.count(),
        'sessions_live': Session.query.filter_by(status=SessionStatus.LIVE).count(),
        'resources': Resource.query.count(),
    }
    recent_users = User.query.order_by(User.created_at.desc()).limit(5).all()
    upcoming_sessions = Session.query.filter_by(status=SessionStatus.SCHEDULED).order_by(
        Session.scheduled_at
    ).limit(5).all()
    return render_template('admin/dashboard.html', stats=stats,
                           recent_users=recent_users, upcoming_sessions=upcoming_sessions)


# --- User Management ---

@bp.route('/users')
@admin_required
def users():
    page = safe_int(request.args.get('page', 1))
    role_filter = request.args.get('role', '')
    query = User.query.order_by(User.created_at.desc())
    if role_filter:
        try:
            query = query.filter_by(role=Role(role_filter))
        except ValueError:
            pass
    result = paginate(query, page, per_page=20)
    return render_template('admin/users.html', **result, role_filter=role_filter)


@bp.route('/users/new', methods=['GET', 'POST'])
@admin_required
def user_create():
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        name_ar = request.form.get('name_ar', '').strip()
        name_en = request.form.get('name_en', '').strip()
        password = request.form.get('password', '')
        role_str = request.form.get('role', 'student')
        phone = request.form.get('phone', '').strip()

        if not email or not name_ar or not password:
            flash('يرجى ملء جميع الحقول المطلوبة', 'error')
            return render_template('admin/user_form.html')

        if User.query.filter_by(email=email).first():
            flash('هذا البريد الإلكتروني مسجل مسبقاً', 'error')
            return render_template('admin/user_form.html')

        try:
            role = Role(role_str)
        except ValueError:
            role = Role.STUDENT

        user = User(email=email, name_ar=name_ar, name_en=name_en, role=role, phone=phone or None)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        flash('تم إنشاء المستخدم بنجاح', 'success')
        return redirect(url_for('admin.users'))

    return render_template('admin/user_form.html')


@bp.route('/users/<int:user_id>', methods=['GET', 'POST'])
@admin_required
def user_edit(user_id):
    user = db.session.get(User, user_id)
    if not user:
        flash('المستخدم غير موجود', 'error')
        return redirect(url_for('admin.users'))

    if request.method == 'POST':
        user.name_ar = request.form.get('name_ar', user.name_ar).strip()
        user.name_en = request.form.get('name_en', user.name_en).strip()
        user.phone = request.form.get('phone', '').strip() or None
        user.is_active = request.form.get('is_active') == 'on'

        new_email = request.form.get('email', '').strip().lower()
        if new_email and new_email != user.email:
            if User.query.filter_by(email=new_email).first():
                flash('هذا البريد الإلكتروني مسجل مسبقاً', 'error')
                return render_template('admin/user_form.html', user=user)
            user.email = new_email

        try:
            user.role = Role(request.form.get('role', user.role.value))
        except ValueError:
            pass

        new_password = request.form.get('password', '').strip()
        if new_password:
            user.set_password(new_password)

        db.session.commit()
        flash('تم تحديث المستخدم بنجاح', 'success')
        return redirect(url_for('admin.users'))

    return render_template('admin/user_form.html', user=user)


# --- Group Management ---

@bp.route('/groups')
@admin_required
def groups():
    page = safe_int(request.args.get('page', 1))
    query = Group.query.order_by(Group.created_at.desc())
    result = paginate(query, page)
    teachers = User.query.filter_by(role=Role.TEACHER, is_active=True).all()
    return render_template('admin/groups.html', **result, teachers=teachers)


@bp.route('/groups/new', methods=['GET', 'POST'])
@admin_required
def group_create():
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        track_id = request.form.get('track_id') or None
        level_id = request.form.get('level_id') or None
        teacher_id = safe_int(request.form.get('teacher_id'), None)
        max_students = safe_int(request.form.get('max_students', 12), 12)

        group = Group(name=name, track_id=track_id, level_id=level_id,
                      teacher_id=teacher_id, max_students=max_students)
        db.session.add(group)
        db.session.commit()

        # Add students
        student_ids = request.form.getlist('student_ids')
        for sid in student_ids:
            gs = GroupStudent(group_id=group.id, student_id=int(sid))
            db.session.add(gs)
        db.session.commit()

        flash('تم إنشاء المجموعة بنجاح', 'success')
        return redirect(url_for('admin.groups'))

    tracks = Track.query.order_by(Track.sort_order).all()
    teachers = User.query.filter_by(role=Role.TEACHER, is_active=True).all()
    students = User.query.filter_by(role=Role.STUDENT, is_active=True).all()
    return render_template('admin/group_form.html', tracks=tracks, teachers=teachers, students=students)


@bp.route('/groups/<int:group_id>', methods=['GET', 'POST'])
@admin_required
def group_edit(group_id):
    group = db.session.get(Group, group_id)
    if not group:
        flash('المجموعة غير موجودة', 'error')
        return redirect(url_for('admin.groups'))

    if request.method == 'POST':
        group.name = request.form.get('name', group.name).strip()
        group.track_id = request.form.get('track_id') or None
        group.level_id = request.form.get('level_id') or None
        group.teacher_id = safe_int(request.form.get('teacher_id'), group.teacher_id)
        group.max_students = safe_int(request.form.get('max_students', 12), 12)
        group.is_active = request.form.get('is_active') == 'on'

        # Update students
        GroupStudent.query.filter_by(group_id=group.id).delete()
        student_ids = request.form.getlist('student_ids')
        for sid in student_ids:
            gs = GroupStudent(group_id=group.id, student_id=int(sid))
            db.session.add(gs)
        db.session.commit()

        flash('تم تحديث المجموعة بنجاح', 'success')
        return redirect(url_for('admin.groups'))

    tracks = Track.query.order_by(Track.sort_order).all()
    teachers = User.query.filter_by(role=Role.TEACHER, is_active=True).all()
    students = User.query.filter_by(role=Role.STUDENT, is_active=True).all()
    current_student_ids = [gs.student_id for gs in group.students.all()]
    return render_template('admin/group_form.html', group=group, tracks=tracks,
                           teachers=teachers, students=students,
                           current_student_ids=current_student_ids)


# --- Session Management ---

@bp.route('/sessions')
@admin_required
def sessions():
    page = safe_int(request.args.get('page', 1))
    status_filter = request.args.get('status', '')
    query = Session.query.order_by(Session.scheduled_at.desc())
    if status_filter:
        try:
            query = query.filter_by(status=SessionStatus(status_filter))
        except ValueError:
            pass
    result = paginate(query, page)
    return render_template('admin/sessions.html', **result, status_filter=status_filter)


@bp.route('/sessions/<int:session_id>')
@admin_required
def session_detail(session_id):
    session = db.session.get(Session, session_id)
    if not session:
        flash('الجلسة غير موجودة', 'error')
        return redirect(url_for('admin.sessions'))
    return render_template('admin/session_detail.html', session=session)


# --- Resource Management ---

@bp.route('/resources')
@admin_required
def resources():
    page = safe_int(request.args.get('page', 1))
    type_filter = request.args.get('type', '')
    query = Resource.query.order_by(Resource.created_at.desc())
    if type_filter:
        try:
            query = query.filter_by(type=ResourceType(type_filter))
        except ValueError:
            pass
    result = paginate(query, page)
    return render_template('admin/resources.html', **result, type_filter=type_filter)


@bp.route('/resources/new', methods=['GET', 'POST'])
@admin_required
def resource_create():
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        name_ar = request.form.get('name_ar', '').strip()
        type_str = request.form.get('type', 'slides')
        track_id = request.form.get('track_id') or None
        config_json = request.form.get('config_json', '')

        try:
            rtype = ResourceType(type_str)
        except ValueError:
            rtype = ResourceType.SLIDES

        # Handle file upload
        uploaded_file = request.files.get('file')
        if uploaded_file and uploaded_file.filename:
            # Determine subfolder based on resource type
            subfolder = 'slides' if rtype == ResourceType.SLIDES else 'resources'
            allowed = ALLOWED_DOCUMENTS | ALLOWED_IMAGES
            saved_name = save_upload(uploaded_file, subfolder, allowed)
            if saved_name:
                file_url = get_upload_url(saved_name, subfolder)
                # Merge file_url into config_json
                try:
                    config_data = json.loads(config_json) if config_json else {}
                except (json.JSONDecodeError, TypeError):
                    config_data = {}
                config_data['file_url'] = file_url
                config_json = json.dumps(config_data, ensure_ascii=False)
            else:
                flash('فشل رفع الملف. تأكد من نوع وحجم الملف.', 'error')

        resource = Resource(
            name=name, name_ar=name_ar, type=rtype,
            track_id=track_id, created_by=current_user.id,
            config_json=config_json or None,
        )
        db.session.add(resource)
        db.session.commit()
        flash('تم إنشاء المورد بنجاح', 'success')
        return redirect(url_for('admin.resources'))

    tracks = Track.query.order_by(Track.sort_order).all()
    return render_template('admin/resource_form.html', tracks=tracks)


@bp.route('/resources/<int:resource_id>', methods=['GET', 'POST'])
@admin_required
def resource_edit(resource_id):
    resource = db.session.get(Resource, resource_id)
    if not resource:
        flash('المورد غير موجود', 'error')
        return redirect(url_for('admin.resources'))

    if request.method == 'POST':
        resource.name = request.form.get('name', resource.name).strip()
        resource.name_ar = request.form.get('name_ar', resource.name_ar).strip()
        config_json = request.form.get('config_json', '')

        # Handle file upload on edit
        uploaded_file = request.files.get('file')
        if uploaded_file and uploaded_file.filename:
            subfolder = 'slides' if resource.type == ResourceType.SLIDES else 'resources'
            allowed = ALLOWED_DOCUMENTS | ALLOWED_IMAGES
            saved_name = save_upload(uploaded_file, subfolder, allowed)
            if saved_name:
                # Delete old file if exists
                try:
                    old_config = json.loads(resource.config_json) if resource.config_json else {}
                    old_url = old_config.get('file_url', '')
                    if old_url:
                        old_filename = old_url.rsplit('/', 1)[-1]
                        old_subfolder = 'slides' if '/slides/' in old_url else 'resources'
                        delete_upload(old_filename, old_subfolder)
                except (json.JSONDecodeError, TypeError):
                    pass
                file_url = get_upload_url(saved_name, subfolder)
                try:
                    config_data = json.loads(config_json) if config_json else {}
                except (json.JSONDecodeError, TypeError):
                    config_data = {}
                config_data['file_url'] = file_url
                config_json = json.dumps(config_data, ensure_ascii=False)
            else:
                flash('فشل رفع الملف. تأكد من نوع وحجم الملف.', 'error')

        resource.config_json = config_json or None
        db.session.commit()
        flash('تم تحديث المورد بنجاح', 'success')
        return redirect(url_for('admin.resources'))

    tracks = Track.query.order_by(Track.sort_order).all()
    return render_template('admin/resource_form.html', resource=resource, tracks=tracks)


@bp.route('/resources/<int:resource_id>/delete', methods=['POST'])
@admin_required
def resource_delete(resource_id):
    resource = db.session.get(Resource, resource_id)
    if resource:
        # Clean up uploaded file
        try:
            config_data = json.loads(resource.config_json) if resource.config_json else {}
            file_url = config_data.get('file_url', '')
            if file_url:
                filename = file_url.rsplit('/', 1)[-1]
                subfolder = 'slides' if '/slides/' in file_url else 'resources'
                delete_upload(filename, subfolder)
        except (json.JSONDecodeError, TypeError):
            pass
        db.session.delete(resource)
        db.session.commit()
        flash('تم حذف المورد', 'success')
    return redirect(url_for('admin.resources'))


# --- Reports ---

@bp.route('/reports')
@admin_required
def reports():
    return render_template('admin/reports.html')


# --- Settings ---

@bp.route('/curriculum')
@admin_required
def curriculum():
    tracks = Track.query.all()
    return render_template('admin/curriculum.html', tracks=tracks)


@bp.route('/settings', methods=['GET', 'POST'])
@admin_required
def settings():
    return render_template('admin/settings.html')
