from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager
from flask_jwt_extended import JWTManager
from flask_socketio import SocketIO
from flask_wtf.csrf import CSRFProtect
from flask_cors import CORS

db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()
jwt = JWTManager()
socketio = SocketIO()
csrf = CSRFProtect()
cors = CORS()

login_manager.login_view = 'auth.login'
login_manager.login_message = 'يرجى تسجيل الدخول للوصول إلى هذه الصفحة'
login_manager.login_message_category = 'warning'


@login_manager.unauthorized_handler
def unauthorized():
    from flask import request, jsonify, redirect, url_for
    # Return JSON for API/AJAX requests instead of redirecting to login
    if request.path.startswith('/api/') or request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({'error': 'يرجى تسجيل الدخول'}), 401
    return redirect(url_for('auth.login', next=request.url))
