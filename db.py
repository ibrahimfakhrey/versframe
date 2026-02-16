import sqlite3
import os

from flask import g, current_app

DATABASE = os.path.join(os.path.dirname(__file__), 'instance', 'verse.db')


def get_db():
    if 'db' not in g:
        os.makedirs(os.path.dirname(DATABASE), exist_ok=True)
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(e=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_db(app):
    with app.app_context():
        db = get_db()
        with open(os.path.join(os.path.dirname(__file__), 'schema.sql')) as f:
            db.executescript(f.read())
        # Seed only if tracks table is empty
        row = db.execute("SELECT COUNT(*) FROM tracks").fetchone()
        if row[0] == 0:
            seed_data(db)
        db.commit()


def seed_data(db):
    from data.coding_verse import CODING_VERSE
    from data.computer_basics import COMPUTER_BASICS
    from data.digital_safety import DIGITAL_SAFETY
    from data.data_verse import DATA_VERSE

    tracks = [CODING_VERSE, COMPUTER_BASICS, DIGITAL_SAFETY, DATA_VERSE]

    for t_order, track in enumerate(tracks):
        db.execute(
            "INSERT INTO tracks (id, name, name_ar, icon, color, description_ar, sort_order) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (track["id"], track["name"], track["name_ar"], track["icon"],
             track["color"], track.get("description_ar", track.get("description", "")), t_order)
        )

        for l_order, level in enumerate(track["levels"]):
            db.execute(
                "INSERT INTO levels (id, track_id, name, name_ar, icon, slogan, goal, sort_order) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (level["id"], track["id"], level["name"], level["name_ar"],
                 level["icon"], level["slogan"], level["goal"], l_order)
            )

            for u_order, unit in enumerate(level["units"]):
                project = unit.get("project", {})
                db.execute(
                    "INSERT INTO units (id, level_id, track_id, name, name_en, description, "
                    "project_name, project_description, sort_order) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (unit["id"], level["id"], track["id"], unit["name"],
                     unit["name_en"], unit["description"],
                     project.get("name", ""), project.get("description", ""), u_order)
                )

                for o_order, obj in enumerate(unit.get("objectives", [])):
                    db.execute(
                        "INSERT INTO objectives (track_id, level_id, unit_id, bloom, bloom_en, "
                        "objective, outcome, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (track["id"], level["id"], unit["id"],
                         obj["bloom"], obj["bloom_en"], obj["objective"], obj["outcome"], o_order)
                    )

                for s_order, skill in enumerate(unit.get("skills", [])):
                    db.execute(
                        "INSERT INTO skills (track_id, level_id, unit_id, name, sort_order) "
                        "VALUES (?, ?, ?, ?, ?)",
                        (track["id"], level["id"], unit["id"], skill, s_order)
                    )


def log_edit(db, table_name, record_key, field_name, old_value, new_value):
    db.execute(
        "INSERT INTO edit_log (table_name, record_key, field_name, old_value, new_value) "
        "VALUES (?, ?, ?, ?, ?)",
        (table_name, record_key, field_name, str(old_value) if old_value is not None else None,
         str(new_value) if new_value is not None else None)
    )
