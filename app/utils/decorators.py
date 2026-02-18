from functools import wraps
from flask import abort, flash, redirect, url_for
from flask_login import current_user, login_required as flask_login_required
from app.models.user import Role


def role_required(*roles):
    """Decorator that requires the user to have one of the specified roles."""
    def decorator(f):
        @wraps(f)
        @flask_login_required
        def decorated_function(*args, **kwargs):
            if current_user.role not in roles:
                abort(403)
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def admin_required(f):
    return role_required(Role.ADMIN)(f)


def teacher_required(f):
    return role_required(Role.TEACHER, Role.ADMIN)(f)


def student_required(f):
    return role_required(Role.STUDENT)(f)


def parent_required(f):
    return role_required(Role.PARENT)(f)


def assessor_required(f):
    return role_required(Role.ASSESSOR, Role.ADMIN)(f)
