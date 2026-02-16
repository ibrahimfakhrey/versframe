CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#6C5CE7',
    description_ar TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS levels (
    id TEXT NOT NULL,
    track_id TEXT NOT NULL,
    name TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '',
    slogan TEXT NOT NULL DEFAULT '',
    goal TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (track_id, id),
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS units (
    id TEXT NOT NULL,
    level_id TEXT NOT NULL,
    track_id TEXT NOT NULL,
    name TEXT NOT NULL,
    name_en TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    project_name TEXT NOT NULL DEFAULT '',
    project_description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (track_id, level_id, id),
    FOREIGN KEY (track_id, level_id) REFERENCES levels(track_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS objectives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id TEXT NOT NULL,
    level_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    bloom TEXT NOT NULL DEFAULT '',
    bloom_en TEXT NOT NULL DEFAULT '',
    objective TEXT NOT NULL DEFAULT '',
    outcome TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (track_id, level_id, unit_id) REFERENCES units(track_id, level_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id TEXT NOT NULL,
    level_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (track_id, level_id, unit_id) REFERENCES units(track_id, level_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS edit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_key TEXT NOT NULL,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
