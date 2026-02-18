import jwt
import uuid
import time
import requests
from flask import current_app


def _get_management_token():
    """Generate a management token for 100ms API calls."""
    now = int(time.time())
    payload = {
        'access_key': current_app.config['HMS_ACCESS_KEY'],
        'type': 'management',
        'version': 2,
        'iat': now,
        'nbf': now,
        'exp': now + 86400,
        'jti': str(uuid.uuid4()),
    }
    return jwt.encode(payload, current_app.config['HMS_SECRET'], algorithm='HS256')


def create_room(name, description=''):
    """Create a new 100ms room."""
    token = _get_management_token()
    resp = requests.post(
        'https://api.100ms.live/v2/rooms',
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
        json={
            'name': name,
            'description': description,
            'template_id': current_app.config['HMS_TEMPLATE_ID'],
        },
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get('id')


def generate_auth_token(room_id, user_id, role='student'):
    """Generate an auth token for a user to join a 100ms room.

    role should be 'teacher' or 'student'. Mapped to 100ms template roles
    (host/guest) automatically.
    """
    role_map = {'teacher': 'host', 'student': 'guest'}
    hms_role = role_map.get(role, 'guest')

    now = int(time.time())
    payload = {
        'access_key': current_app.config['HMS_ACCESS_KEY'],
        'room_id': room_id,
        'user_id': str(user_id),
        'role': hms_role,
        'type': 'app',
        'version': 2,
        'iat': now,
        'nbf': now,
        'exp': now + 86400,
        'jti': str(uuid.uuid4()),
    }
    return jwt.encode(payload, current_app.config['HMS_SECRET'], algorithm='HS256')


def end_room(room_id):
    """End an active 100ms room session."""
    token = _get_management_token()
    resp = requests.post(
        f'https://api.100ms.live/v2/rooms/{room_id}/end',
        headers={'Authorization': f'Bearer {token}'},
    )
    return resp.status_code == 200
