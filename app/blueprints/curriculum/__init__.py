from flask import Blueprint

bp = Blueprint('curriculum', __name__, template_folder='../../templates/curriculum')

from app.blueprints.curriculum import routes  # noqa: E402, F401
