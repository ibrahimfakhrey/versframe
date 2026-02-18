from flask import Blueprint

bp = Blueprint('room', __name__, template_folder='../../templates/room')

from app.blueprints.room import routes  # noqa: E402, F401
