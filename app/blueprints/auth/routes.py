from flask import render_template, redirect, url_for, flash, request
from flask_login import login_user, logout_user, login_required, current_user
from app.blueprints.auth import bp
from app.extensions import db
from app.models.user import User, Role


@bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return _redirect_by_role(current_user)

    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        remember = request.form.get('remember') == 'on'

        user = User.query.filter_by(email=email).first()
        if user and user.check_password(password):
            if not user.is_active:
                flash('هذا الحساب معطل. تواصل مع الإدارة.', 'error')
                return render_template('auth/login.html')
            login_user(user, remember=remember)
            next_page = request.args.get('next')
            if next_page:
                return redirect(next_page)
            return _redirect_by_role(user)
        flash('البريد الإلكتروني أو كلمة المرور غير صحيحة', 'error')

    return render_template('auth/login.html')


@bp.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return _redirect_by_role(current_user)

    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        name_ar = request.form.get('name_ar', '').strip()
        name_en = request.form.get('name_en', '').strip()
        password = request.form.get('password', '')
        confirm = request.form.get('password_confirm', '')
        role_str = request.form.get('role', 'student')

        if not email or not name_ar or not password:
            flash('يرجى ملء جميع الحقول المطلوبة', 'error')
            return render_template('auth/register.html')

        if password != confirm:
            flash('كلمات المرور غير متطابقة', 'error')
            return render_template('auth/register.html')

        if len(password) < 6:
            flash('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error')
            return render_template('auth/register.html')

        if User.query.filter_by(email=email).first():
            flash('هذا البريد الإلكتروني مسجل مسبقاً', 'error')
            return render_template('auth/register.html')

        # Only allow student and parent self-registration
        allowed_roles = {'student': Role.STUDENT, 'parent': Role.PARENT}
        role = allowed_roles.get(role_str, Role.STUDENT)

        user = User(email=email, name_ar=name_ar, name_en=name_en, role=role)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()

        login_user(user)
        flash('تم إنشاء الحساب بنجاح! مرحباً بك', 'success')
        return _redirect_by_role(user)

    return render_template('auth/register.html')


@bp.route('/logout')
@login_required
def logout():
    logout_user()
    flash('تم تسجيل الخروج بنجاح', 'success')
    return redirect(url_for('auth.login'))


@bp.route('/forgot-password', methods=['GET', 'POST'])
def forgot_password():
    if request.method == 'POST':
        flash('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني', 'success')
        return redirect(url_for('auth.login'))
    return render_template('auth/forgot.html')


def _redirect_by_role(user):
    role_routes = {
        Role.ADMIN: 'admin.dashboard',
        Role.TEACHER: 'teacher.dashboard',
        Role.STUDENT: 'student.dashboard',
        Role.PARENT: 'parent.dashboard',
        Role.ASSESSOR: 'assessor.dashboard',
    }
    return redirect(url_for(role_routes.get(user.role, 'auth.login')))
