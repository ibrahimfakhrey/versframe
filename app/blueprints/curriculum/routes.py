from flask import render_template, abort, request, jsonify
from app.blueprints.curriculum import bp
from app.extensions import db
from app.models.curriculum import Track, Level, Unit, Objective, Skill


@bp.route('/')
def home():
    tracks = Track.query.order_by(Track.sort_order).all()
    tracks_data = []
    for t in tracks:
        td = _track_dict(t)
        td['levels'] = []
        for lvl in t.levels.all():
            ld = _level_dict(lvl)
            ld['units'] = [_unit_dict_full(u) for u in lvl.units.all()]
            td['levels'].append(ld)
        tracks_data.append(td)
    return render_template('curriculum/home.html', tracks=tracks_data)


@bp.route('/track/<track_id>')
def track(track_id):
    t = db.session.get(Track, track_id)
    if not t:
        abort(404)
    td = _track_dict(t)
    td['levels'] = []
    for lvl in t.levels.all():
        ld = _level_dict(lvl)
        ld['units'] = [_unit_dict_full(u) for u in lvl.units.all()]
        td['levels'].append(ld)
    return render_template('curriculum/track.html', track=td)


@bp.route('/track/<track_id>/level/<level_id>')
def level(track_id, level_id):
    t = db.session.get(Track, track_id)
    if not t:
        abort(404)
    td = _track_dict(t)
    lvl = Level.query.filter_by(track_id=track_id, id=level_id).first()
    if not lvl:
        abort(404)
    ld = _level_dict(lvl)
    ld['units'] = [_unit_dict_full(u) for u in lvl.units.all()]
    return render_template('curriculum/level.html', track=td, level=ld)


@bp.route('/track/<track_id>/level/<level_id>/unit/<unit_id>')
def unit(track_id, level_id, unit_id):
    t = db.session.get(Track, track_id)
    if not t:
        abort(404)
    td = _track_dict(t)
    lvl = Level.query.filter_by(track_id=track_id, id=level_id).first()
    if not lvl:
        abort(404)
    ld = _level_dict(lvl)
    ld['units'] = [_unit_dict_full(u) for u in lvl.units.all()]
    u = Unit.query.filter_by(track_id=track_id, level_id=level_id, id=unit_id).first()
    if not u:
        abort(404)
    ud = _unit_dict_full(u)
    return render_template('curriculum/unit.html', track=td, level=ld, unit=ud)


# === API endpoints for inline editing (migrated from old app.py) ===

@bp.route('/api/track/<track_id>', methods=['PUT'])
def api_update_track(track_id):
    t = db.session.get(Track, track_id)
    if not t:
        return jsonify({'error': 'Track not found'}), 404
    data = request.get_json()
    for field in ('name_ar', 'description_ar'):
        if field in data:
            setattr(t, field, data[field])
    db.session.commit()
    return jsonify({'ok': True})


@bp.route('/api/level/<track_id>/<level_id>', methods=['PUT'])
def api_update_level(track_id, level_id):
    lvl = Level.query.filter_by(track_id=track_id, id=level_id).first()
    if not lvl:
        return jsonify({'error': 'Level not found'}), 404
    data = request.get_json()
    for field in ('name_ar', 'slogan', 'goal'):
        if field in data:
            setattr(lvl, field, data[field])
    db.session.commit()
    return jsonify({'ok': True})


@bp.route('/api/unit/<track_id>/<level_id>/<unit_id>', methods=['PUT'])
def api_update_unit(track_id, level_id, unit_id):
    u = Unit.query.filter_by(track_id=track_id, level_id=level_id, id=unit_id).first()
    if not u:
        return jsonify({'error': 'Unit not found'}), 404
    data = request.get_json()
    for field in ('name', 'name_en', 'description', 'project_name', 'project_description'):
        if field in data:
            setattr(u, field, data[field])
    db.session.commit()
    return jsonify({'ok': True})


@bp.route('/api/unit', methods=['POST'])
def api_add_unit():
    data = request.get_json()
    track_id = data['track_id']
    level_id = data['level_id']
    max_order = db.session.query(db.func.max(Unit.sort_order)).filter_by(
        track_id=track_id, level_id=level_id
    ).scalar() or 0
    unit_id = f'unit-{max_order + 2}'
    u = Unit(
        id=unit_id, level_id=level_id, track_id=track_id,
        name=data.get('name', 'وحدة جديدة'),
        name_en=data.get('name_en', 'New Unit'),
        description=data.get('description', ''),
        project_name=data.get('project_name', ''),
        project_description=data.get('project_description', ''),
        sort_order=max_order + 1,
    )
    db.session.add(u)
    db.session.commit()
    return jsonify({'ok': True, 'unit_id': unit_id})


@bp.route('/api/unit/<track_id>/<level_id>/<unit_id>', methods=['DELETE'])
def api_delete_unit(track_id, level_id, unit_id):
    u = Unit.query.filter_by(track_id=track_id, level_id=level_id, id=unit_id).first()
    if not u:
        return jsonify({'error': 'Unit not found'}), 404
    db.session.delete(u)
    db.session.commit()
    return jsonify({'ok': True})


@bp.route('/api/objective/<int:obj_id>', methods=['PUT'])
def api_update_objective(obj_id):
    obj = db.session.get(Objective, obj_id)
    if not obj:
        return jsonify({'error': 'Objective not found'}), 404
    data = request.get_json()
    for field in ('bloom', 'bloom_en', 'objective', 'outcome'):
        if field in data:
            setattr(obj, field, data[field])
    db.session.commit()
    return jsonify({'ok': True})


@bp.route('/api/objective', methods=['POST'])
def api_add_objective():
    data = request.get_json()
    max_order = db.session.query(db.func.max(Objective.sort_order)).filter_by(
        track_id=data['track_id'], level_id=data['level_id'], unit_id=data['unit_id']
    ).scalar() or 0
    obj = Objective(
        track_id=data['track_id'], level_id=data['level_id'], unit_id=data['unit_id'],
        bloom=data.get('bloom', 'تذكر'), bloom_en=data.get('bloom_en', 'Remember'),
        objective=data.get('objective', ''), outcome=data.get('outcome', ''),
        sort_order=max_order + 1,
    )
    db.session.add(obj)
    db.session.commit()
    return jsonify({'ok': True, 'id': obj.id})


@bp.route('/api/objective/<int:obj_id>', methods=['DELETE'])
def api_delete_objective(obj_id):
    obj = db.session.get(Objective, obj_id)
    if not obj:
        return jsonify({'error': 'Objective not found'}), 404
    db.session.delete(obj)
    db.session.commit()
    return jsonify({'ok': True})


@bp.route('/api/skill', methods=['POST'])
def api_add_skill():
    data = request.get_json()
    max_order = db.session.query(db.func.max(Skill.sort_order)).filter_by(
        track_id=data['track_id'], level_id=data['level_id'], unit_id=data['unit_id']
    ).scalar() or 0
    skill = Skill(
        track_id=data['track_id'], level_id=data['level_id'], unit_id=data['unit_id'],
        name=data.get('name', 'مهارة جديدة'), sort_order=max_order + 1,
    )
    db.session.add(skill)
    db.session.commit()
    return jsonify({'ok': True, 'id': skill.id})


@bp.route('/api/skill/<int:skill_id>', methods=['DELETE'])
def api_delete_skill(skill_id):
    skill = db.session.get(Skill, skill_id)
    if not skill:
        return jsonify({'error': 'Skill not found'}), 404
    db.session.delete(skill)
    db.session.commit()
    return jsonify({'ok': True})


# === Helper functions ===

def _track_dict(t):
    return {
        'id': t.id, 'name': t.name, 'name_ar': t.name_ar,
        'icon': t.icon, 'color': t.color, 'description_ar': t.description_ar,
    }


def _level_dict(lvl):
    return {
        'id': lvl.id, 'name': lvl.name, 'name_ar': lvl.name_ar,
        'icon': lvl.icon, 'slogan': lvl.slogan, 'goal': lvl.goal,
    }


def _unit_dict_full(u):
    return {
        'id': u.id, 'name': u.name, 'name_en': u.name_en,
        'description': u.description,
        'project': {'name': u.project_name, 'description': u.project_description},
        'objectives': [
            {'id': o.id, 'bloom': o.bloom, 'bloom_en': o.bloom_en,
             'objective': o.objective, 'outcome': o.outcome}
            for o in u.objectives.all()
        ],
        'skills': [s.name for s in u.skills.all()],
        'skills_raw': [{'id': s.id, 'name': s.name} for s in u.skills.all()],
    }
