from flask import Blueprint

bp = Blueprint('student', __name__, template_folder='../../templates/student')

from app.blueprints.student import routes  # noqa: E402, F401
