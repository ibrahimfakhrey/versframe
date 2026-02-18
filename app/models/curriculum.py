from app.extensions import db


class Track(db.Model):
    __tablename__ = 'tracks'

    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    name_ar = db.Column(db.String(100), nullable=False)
    icon = db.Column(db.String(10), nullable=False, default='')
    color = db.Column(db.String(7), nullable=False, default='#6C5CE7')
    description_ar = db.Column(db.Text, nullable=False, default='')
    sort_order = db.Column(db.Integer, nullable=False, default=0)

    levels = db.relationship('Level', backref='track', lazy='dynamic',
                             order_by='Level.sort_order', cascade='all, delete-orphan')
    groups = db.relationship('Group', backref='track', lazy='dynamic')

    def __repr__(self):
        return f'<Track {self.id}>'


class Level(db.Model):
    __tablename__ = 'levels'

    id = db.Column(db.String(50), nullable=False)
    track_id = db.Column(db.String(50), db.ForeignKey('tracks.id', ondelete='CASCADE'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    name_ar = db.Column(db.String(100), nullable=False)
    icon = db.Column(db.String(10), nullable=False, default='')
    slogan = db.Column(db.Text, nullable=False, default='')
    goal = db.Column(db.Text, nullable=False, default='')
    sort_order = db.Column(db.Integer, nullable=False, default=0)

    units = db.relationship('Unit', backref='level', lazy='dynamic',
                            order_by='Unit.sort_order', cascade='all, delete-orphan')

    __table_args__ = (
        db.PrimaryKeyConstraint('track_id', 'id'),
    )

    def __repr__(self):
        return f'<Level {self.track_id}/{self.id}>'


class Unit(db.Model):
    __tablename__ = 'units'

    id = db.Column(db.String(50), nullable=False)
    level_id = db.Column(db.String(50), nullable=False)
    track_id = db.Column(db.String(50), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    name_en = db.Column(db.String(200), nullable=False, default='')
    description = db.Column(db.Text, nullable=False, default='')
    project_name = db.Column(db.String(200), nullable=False, default='')
    project_description = db.Column(db.Text, nullable=False, default='')
    sort_order = db.Column(db.Integer, nullable=False, default=0)

    objectives = db.relationship('Objective', backref='unit', lazy='dynamic',
                                 order_by='Objective.sort_order', cascade='all, delete-orphan')
    skills = db.relationship('Skill', backref='unit', lazy='dynamic',
                             order_by='Skill.sort_order', cascade='all, delete-orphan')

    __table_args__ = (
        db.PrimaryKeyConstraint('track_id', 'level_id', 'id'),
        db.ForeignKeyConstraint(
            ['track_id', 'level_id'],
            ['levels.track_id', 'levels.id'],
            ondelete='CASCADE'
        ),
    )

    def __repr__(self):
        return f'<Unit {self.track_id}/{self.level_id}/{self.id}>'


class Objective(db.Model):
    __tablename__ = 'objectives'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    track_id = db.Column(db.String(50), nullable=False)
    level_id = db.Column(db.String(50), nullable=False)
    unit_id = db.Column(db.String(50), nullable=False)
    bloom = db.Column(db.String(50), nullable=False, default='')
    bloom_en = db.Column(db.String(50), nullable=False, default='')
    objective = db.Column(db.Text, nullable=False, default='')
    outcome = db.Column(db.Text, nullable=False, default='')
    sort_order = db.Column(db.Integer, nullable=False, default=0)

    __table_args__ = (
        db.ForeignKeyConstraint(
            ['track_id', 'level_id', 'unit_id'],
            ['units.track_id', 'units.level_id', 'units.id'],
            ondelete='CASCADE'
        ),
    )


class Skill(db.Model):
    __tablename__ = 'skills'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    track_id = db.Column(db.String(50), nullable=False)
    level_id = db.Column(db.String(50), nullable=False)
    unit_id = db.Column(db.String(50), nullable=False)
    name = db.Column(db.String(200), nullable=False, default='')
    sort_order = db.Column(db.Integer, nullable=False, default=0)

    __table_args__ = (
        db.ForeignKeyConstraint(
            ['track_id', 'level_id', 'unit_id'],
            ['units.track_id', 'units.level_id', 'units.id'],
            ondelete='CASCADE'
        ),
    )
