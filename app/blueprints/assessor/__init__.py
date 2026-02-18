from flask import Blueprint

bp = Blueprint('assessor', __name__, template_folder='../../templates/assessor')

from app.blueprints.assessor import routes  # noqa: E402, F401
