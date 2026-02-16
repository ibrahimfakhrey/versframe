from flask import Flask, render_template, abort, request, jsonify
from db import get_db, close_db, init_db, log_edit

app = Flask(__name__)
app.teardown_appcontext(close_db)

with app.app_context():
    init_db(app)


# ─── Helper: build dict structures from DB rows ─────────────────────

def _build_track(row):
    return {
        "id": row["id"], "name": row["name"], "name_ar": row["name_ar"],
        "icon": row["icon"], "color": row["color"],
        "description_ar": row["description_ar"],
    }


def _build_level(row):
    return {
        "id": row["id"], "name": row["name"], "name_ar": row["name_ar"],
        "icon": row["icon"], "slogan": row["slogan"], "goal": row["goal"],
    }


def _build_unit(row):
    return {
        "id": row["id"], "name": row["name"], "name_en": row["name_en"],
        "description": row["description"],
        "project": {"name": row["project_name"], "description": row["project_description"]},
    }


def _attach_objectives(db, unit_dict, track_id, level_id, unit_id):
    rows = db.execute(
        "SELECT * FROM objectives WHERE track_id=? AND level_id=? AND unit_id=? ORDER BY sort_order",
        (track_id, level_id, unit_id)
    ).fetchall()
    unit_dict["objectives"] = [
        {"id": r["id"], "bloom": r["bloom"], "bloom_en": r["bloom_en"],
         "objective": r["objective"], "outcome": r["outcome"]}
        for r in rows
    ]


def _attach_skills(db, unit_dict, track_id, level_id, unit_id):
    rows = db.execute(
        "SELECT * FROM skills WHERE track_id=? AND level_id=? AND unit_id=? ORDER BY sort_order",
        (track_id, level_id, unit_id)
    ).fetchall()
    unit_dict["skills"] = [r["name"] for r in rows]
    unit_dict["skills_raw"] = [{"id": r["id"], "name": r["name"]} for r in rows]


def _get_units_for_level(db, track_id, level_id, full=False):
    rows = db.execute(
        "SELECT * FROM units WHERE track_id=? AND level_id=? ORDER BY sort_order",
        (track_id, level_id)
    ).fetchall()
    units = []
    for r in rows:
        u = _build_unit(r)
        if full:
            _attach_objectives(db, u, track_id, level_id, r["id"])
            _attach_skills(db, u, track_id, level_id, r["id"])
        else:
            # Lightweight: just counts and skill names for cards
            _attach_objectives(db, u, track_id, level_id, r["id"])
            _attach_skills(db, u, track_id, level_id, r["id"])
        units.append(u)
    return units


# ─── Page Routes ─────────────────────────────────────────────────────

@app.route("/")
def home():
    db = get_db()
    track_rows = db.execute("SELECT * FROM tracks ORDER BY sort_order").fetchall()
    tracks = []
    for tr in track_rows:
        t = _build_track(tr)
        levels = []
        level_rows = db.execute(
            "SELECT * FROM levels WHERE track_id=? ORDER BY sort_order", (tr["id"],)
        ).fetchall()
        for lr in level_rows:
            lvl = _build_level(lr)
            lvl["units"] = _get_units_for_level(db, tr["id"], lr["id"])
            levels.append(lvl)
        t["levels"] = levels
        tracks.append(t)
    return render_template("home.html", tracks=tracks)


@app.route("/track/<track_id>")
def track(track_id):
    db = get_db()
    tr = db.execute("SELECT * FROM tracks WHERE id=?", (track_id,)).fetchone()
    if not tr:
        abort(404)
    t = _build_track(tr)
    level_rows = db.execute(
        "SELECT * FROM levels WHERE track_id=? ORDER BY sort_order", (track_id,)
    ).fetchall()
    levels = []
    for lr in level_rows:
        lvl = _build_level(lr)
        lvl["units"] = _get_units_for_level(db, track_id, lr["id"])
        levels.append(lvl)
    t["levels"] = levels
    return render_template("track.html", track=t)


@app.route("/track/<track_id>/level/<level_id>")
def level(track_id, level_id):
    db = get_db()
    tr = db.execute("SELECT * FROM tracks WHERE id=?", (track_id,)).fetchone()
    if not tr:
        abort(404)
    t = _build_track(tr)
    lr = db.execute(
        "SELECT * FROM levels WHERE track_id=? AND id=?", (track_id, level_id)
    ).fetchone()
    if not lr:
        abort(404)
    lvl = _build_level(lr)
    lvl["units"] = _get_units_for_level(db, track_id, level_id)
    return render_template("level.html", track=t, level=lvl)


@app.route("/track/<track_id>/level/<level_id>/unit/<unit_id>")
def unit(track_id, level_id, unit_id):
    db = get_db()
    tr = db.execute("SELECT * FROM tracks WHERE id=?", (track_id,)).fetchone()
    if not tr:
        abort(404)
    t = _build_track(tr)

    lr = db.execute(
        "SELECT * FROM levels WHERE track_id=? AND id=?", (track_id, level_id)
    ).fetchone()
    if not lr:
        abort(404)
    lvl = _build_level(lr)
    lvl["units"] = _get_units_for_level(db, track_id, level_id, full=True)

    u_row = db.execute(
        "SELECT * FROM units WHERE track_id=? AND level_id=? AND id=?",
        (track_id, level_id, unit_id)
    ).fetchone()
    if not u_row:
        abort(404)
    u = _build_unit(u_row)
    _attach_objectives(db, u, track_id, level_id, unit_id)
    _attach_skills(db, u, track_id, level_id, unit_id)

    return render_template("unit.html", track=t, level=lvl, unit=u)


# ─── API Endpoints ───────────────────────────────────────────────────

@app.route("/api/track/<track_id>", methods=["PUT"])
def api_update_track(track_id):
    db = get_db()
    tr = db.execute("SELECT * FROM tracks WHERE id=?", (track_id,)).fetchone()
    if not tr:
        return jsonify({"error": "Track not found"}), 404
    data = request.get_json()
    for field in ("name_ar", "description_ar"):
        if field in data:
            log_edit(db, "tracks", track_id, field, tr[field], data[field])
            db.execute(f"UPDATE tracks SET {field}=? WHERE id=?", (data[field], track_id))
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/level/<track_id>/<level_id>", methods=["PUT"])
def api_update_level(track_id, level_id):
    db = get_db()
    lr = db.execute(
        "SELECT * FROM levels WHERE track_id=? AND id=?", (track_id, level_id)
    ).fetchone()
    if not lr:
        return jsonify({"error": "Level not found"}), 404
    data = request.get_json()
    key = f"{track_id}/{level_id}"
    for field in ("name_ar", "slogan", "goal"):
        if field in data:
            log_edit(db, "levels", key, field, lr[field], data[field])
            db.execute(
                f"UPDATE levels SET {field}=? WHERE track_id=? AND id=?",
                (data[field], track_id, level_id)
            )
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/unit/<track_id>/<level_id>/<unit_id>", methods=["PUT"])
def api_update_unit(track_id, level_id, unit_id):
    db = get_db()
    u = db.execute(
        "SELECT * FROM units WHERE track_id=? AND level_id=? AND id=?",
        (track_id, level_id, unit_id)
    ).fetchone()
    if not u:
        return jsonify({"error": "Unit not found"}), 404
    data = request.get_json()
    key = f"{track_id}/{level_id}/{unit_id}"
    for field in ("name", "name_en", "description", "project_name", "project_description"):
        if field in data:
            log_edit(db, "units", key, field, u[field], data[field])
            db.execute(
                f"UPDATE units SET {field}=? WHERE track_id=? AND level_id=? AND id=?",
                (data[field], track_id, level_id, unit_id)
            )
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/unit", methods=["POST"])
def api_add_unit():
    db = get_db()
    data = request.get_json()
    track_id = data["track_id"]
    level_id = data["level_id"]
    # Determine next sort_order and unit id
    max_row = db.execute(
        "SELECT MAX(sort_order) as mx FROM units WHERE track_id=? AND level_id=?",
        (track_id, level_id)
    ).fetchone()
    next_order = (max_row["mx"] or 0) + 1
    unit_id = f"unit-{next_order + 1}"
    db.execute(
        "INSERT INTO units (id, level_id, track_id, name, name_en, description, "
        "project_name, project_description, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (unit_id, level_id, track_id,
         data.get("name", "وحدة جديدة"),
         data.get("name_en", "New Unit"),
         data.get("description", ""),
         data.get("project_name", ""),
         data.get("project_description", ""),
         next_order)
    )
    key = f"{track_id}/{level_id}/{unit_id}"
    log_edit(db, "units", key, "*", None, "created")
    db.commit()
    return jsonify({"ok": True, "unit_id": unit_id})


@app.route("/api/unit/<track_id>/<level_id>/<unit_id>", methods=["DELETE"])
def api_delete_unit(track_id, level_id, unit_id):
    db = get_db()
    u = db.execute(
        "SELECT * FROM units WHERE track_id=? AND level_id=? AND id=?",
        (track_id, level_id, unit_id)
    ).fetchone()
    if not u:
        return jsonify({"error": "Unit not found"}), 404
    key = f"{track_id}/{level_id}/{unit_id}"
    log_edit(db, "units", key, "*", u["name"], "deleted")
    # Delete cascades objectives and skills due to FK
    db.execute(
        "DELETE FROM objectives WHERE track_id=? AND level_id=? AND unit_id=?",
        (track_id, level_id, unit_id)
    )
    db.execute(
        "DELETE FROM skills WHERE track_id=? AND level_id=? AND unit_id=?",
        (track_id, level_id, unit_id)
    )
    db.execute(
        "DELETE FROM units WHERE track_id=? AND level_id=? AND id=?",
        (track_id, level_id, unit_id)
    )
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/objective/<int:obj_id>", methods=["PUT"])
def api_update_objective(obj_id):
    db = get_db()
    obj = db.execute("SELECT * FROM objectives WHERE id=?", (obj_id,)).fetchone()
    if not obj:
        return jsonify({"error": "Objective not found"}), 404
    data = request.get_json()
    for field in ("bloom", "bloom_en", "objective", "outcome"):
        if field in data:
            log_edit(db, "objectives", str(obj_id), field, obj[field], data[field])
            db.execute(f"UPDATE objectives SET {field}=? WHERE id=?", (data[field], obj_id))
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/objective", methods=["POST"])
def api_add_objective():
    db = get_db()
    data = request.get_json()
    track_id = data["track_id"]
    level_id = data["level_id"]
    unit_id = data["unit_id"]
    max_row = db.execute(
        "SELECT MAX(sort_order) as mx FROM objectives WHERE track_id=? AND level_id=? AND unit_id=?",
        (track_id, level_id, unit_id)
    ).fetchone()
    next_order = (max_row["mx"] or 0) + 1
    cursor = db.execute(
        "INSERT INTO objectives (track_id, level_id, unit_id, bloom, bloom_en, objective, outcome, sort_order) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (track_id, level_id, unit_id,
         data.get("bloom", "تذكر"), data.get("bloom_en", "Remember"),
         data.get("objective", ""), data.get("outcome", ""), next_order)
    )
    new_id = cursor.lastrowid
    log_edit(db, "objectives", str(new_id), "*", None, "created")
    db.commit()
    return jsonify({"ok": True, "id": new_id})


@app.route("/api/objective/<int:obj_id>", methods=["DELETE"])
def api_delete_objective(obj_id):
    db = get_db()
    obj = db.execute("SELECT * FROM objectives WHERE id=?", (obj_id,)).fetchone()
    if not obj:
        return jsonify({"error": "Objective not found"}), 404
    log_edit(db, "objectives", str(obj_id), "*", obj["objective"], "deleted")
    db.execute("DELETE FROM objectives WHERE id=?", (obj_id,))
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/skill", methods=["POST"])
def api_add_skill():
    db = get_db()
    data = request.get_json()
    track_id = data["track_id"]
    level_id = data["level_id"]
    unit_id = data["unit_id"]
    max_row = db.execute(
        "SELECT MAX(sort_order) as mx FROM skills WHERE track_id=? AND level_id=? AND unit_id=?",
        (track_id, level_id, unit_id)
    ).fetchone()
    next_order = (max_row["mx"] or 0) + 1
    cursor = db.execute(
        "INSERT INTO skills (track_id, level_id, unit_id, name, sort_order) VALUES (?, ?, ?, ?, ?)",
        (track_id, level_id, unit_id, data.get("name", "مهارة جديدة"), next_order)
    )
    new_id = cursor.lastrowid
    log_edit(db, "skills", str(new_id), "*", None, "created")
    db.commit()
    return jsonify({"ok": True, "id": new_id})


@app.route("/api/skill/<int:skill_id>", methods=["DELETE"])
def api_delete_skill(skill_id):
    db = get_db()
    sk = db.execute("SELECT * FROM skills WHERE id=?", (skill_id,)).fetchone()
    if not sk:
        return jsonify({"error": "Skill not found"}), 404
    log_edit(db, "skills", str(skill_id), "*", sk["name"], "deleted")
    db.execute("DELETE FROM skills WHERE id=?", (skill_id,))
    db.commit()
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True, port=5050)
