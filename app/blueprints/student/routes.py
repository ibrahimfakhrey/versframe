from flask import render_template, request, redirect, url_for, flash, jsonify
from flask_login import current_user
from app.blueprints.student import bp
from app.extensions import db
from app.models.user import User, Role
from app.models.classroom import Group, GroupStudent, Session, SessionStatus, Attendance
from app.models.homework import Homework, HomeworkSubmission
from app.models.gamification import StudentXP, Badge, Streak, StudentBadge
from app.models.notification import Notification
from app.models.curriculum import Track, Level, Unit
from app.models.journey import (
    StudentWallet, Quest, StudentQuest, QuestStatus, QuestDifficulty, QuestCategory,
    Activity, StudentActivity, ActivitySource,
    DailyReward, StudentDailyReward, RewardType,
    StudentUnitProgress, JourneyMilestone, MilestoneType,
    LessonContent, LessonProgress,
)
from app.utils.decorators import student_required
from app.utils.helpers import safe_int
from app.utils.uploads import (save_upload, get_upload_url, delete_upload,
                                ALLOWED_IMAGES, ALLOWED_DOCUMENTS, ALLOWED_ALL)
from app.utils.wallet import get_or_create_wallet, award_coins, award_gems
from app.utils.gamification_service import (
    award_quest_rewards, award_activity_rewards, record_milestone,
    check_and_award_badges, get_student_journey_stats,
)
from datetime import datetime, date, timezone, timedelta
from sqlalchemy import func


# ─── Onboarding before_request ──────────────────────────────────────────────

@bp.before_request
def check_onboarding():
    if current_user.is_authenticated and current_user.role == Role.STUDENT:
        if not current_user.onboarding_completed:
            # Allow access to onboarding and static files
            allowed = ('student.onboarding', 'student.onboarding_submit', 'static')
            if request.endpoint and request.endpoint not in allowed:
                return redirect(url_for('student.onboarding'))


# ─── Dashboard ──────────────────────────────────────────────────────────────

@bp.route('/')
@student_required
def dashboard():
    student_id = current_user.id
    total_xp = StudentXP.total_xp(student_id)
    level = StudentXP.current_level(total_xp)
    level_title_ar, level_title_en = StudentXP.level_title(level)

    # Streak
    streak = Streak.query.filter_by(student_id=student_id).first()
    current_streak = streak.current_streak if streak else 0

    # My groups
    group_ids = [gs.group_id for gs in GroupStudent.query.filter_by(student_id=student_id).all()]

    # Upcoming sessions
    upcoming_sessions = Session.query.filter(
        Session.group_id.in_(group_ids),
        Session.status == SessionStatus.SCHEDULED,
    ).order_by(Session.scheduled_at).limit(3).all() if group_ids else []

    # Recent XP
    recent_xp = StudentXP.query.filter_by(student_id=student_id).order_by(
        StudentXP.created_at.desc()
    ).limit(10).all()

    # Badges
    badges_earned = current_user.badges_earned.all()
    all_badges = Badge.query.all()

    # Leaderboard - get top 10 students by XP
    leaderboard = db.session.query(
        User.id, User.name_ar, User.avatar_url,
        func.coalesce(func.sum(StudentXP.amount), 0).label('total_xp')
    ).outerjoin(StudentXP, User.id == StudentXP.student_id).filter(
        User.role == Role.STUDENT
    ).group_by(User.id).order_by(func.sum(StudentXP.amount).desc()).limit(10).all()

    # My rank
    my_rank_query = db.session.query(func.count()).filter(
        StudentXP.student_id != student_id
    ).group_by(StudentXP.student_id).having(
        func.sum(StudentXP.amount) > total_xp
    )
    my_rank = my_rank_query.count() + 1

    # Pending homework
    pending_homework = HomeworkSubmission.query.join(Homework).filter(
        HomeworkSubmission.student_id == student_id,
        HomeworkSubmission.grade.is_(None),
    ).all() if group_ids else []

    # Homework due soon (not yet submitted)
    my_submission_hw_ids = [s.homework_id for s in HomeworkSubmission.query.filter_by(
        student_id=student_id
    ).all()]
    homework_due = Homework.query.filter(
        Homework.group_id.in_(group_ids),
        ~Homework.id.in_(my_submission_hw_ids) if my_submission_hw_ids else Homework.id.isnot(None),
    ).order_by(Homework.due_date).limit(3).all() if group_ids else []

    # Notifications count
    unread_count = Notification.query.filter_by(user_id=student_id, is_read=False).count()

    # XP thresholds for level progress bar
    thresholds = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5000,
                  6500, 8000, 10000, 12500, 15000, 18000, 21000, 25000]
    current_threshold = thresholds[level - 1] if level <= len(thresholds) else thresholds[-1]
    next_threshold = thresholds[level] if level < len(thresholds) else thresholds[-1] + 5000
    xp_progress = ((total_xp - current_threshold) / max(next_threshold - current_threshold, 1)) * 100

    # Curriculum tracks (universes)
    tracks = Track.query.order_by(Track.sort_order).all()

    # Live sessions the student can join now
    live_sessions = Session.query.filter(
        Session.group_id.in_(group_ids),
        Session.status == SessionStatus.LIVE,
    ).all() if group_ids else []

    # My groups with details
    my_groups = Group.query.filter(Group.id.in_(group_ids)).all() if group_ids else []

    # Adventure map data
    adventure_nodes = StudentUnitProgress.query.filter_by(
        student_id=student_id
    ).order_by(StudentUnitProgress.id).all()
    adventure_completed = sum(1 for n in adventure_nodes if n.status == 'completed')
    adventure_total = len(adventure_nodes) if adventure_nodes else 1

    # Wallet
    wallet = get_or_create_wallet(student_id)

    return render_template('student/dashboard.html',
                           total_xp=total_xp, level=level,
                           level_title_ar=level_title_ar, level_title_en=level_title_en,
                           current_streak=current_streak,
                           upcoming_sessions=upcoming_sessions,
                           live_sessions=live_sessions,
                           recent_xp=recent_xp,
                           badges_earned=badges_earned, all_badges=all_badges,
                           leaderboard=leaderboard, my_rank=my_rank,
                           pending_homework=pending_homework,
                           homework_due=homework_due,
                           unread_count=unread_count,
                           xp_progress=min(xp_progress, 100),
                           next_threshold=next_threshold,
                           tracks=tracks,
                           my_groups=my_groups,
                           adventure_nodes=adventure_nodes,
                           adventure_completed=adventure_completed,
                           adventure_total=adventure_total,
                           wallet=wallet)


# ─── Quests ─────────────────────────────────────────────────────────────────

@bp.route('/quests')
@student_required
def quests():
    student_id = current_user.id
    total_xp = StudentXP.total_xp(student_id)
    level = StudentXP.current_level(total_xp)

    difficulty = request.args.get('difficulty', '')
    category = request.args.get('category', '')

    query = Quest.query
    if difficulty:
        try:
            query = query.filter(Quest.difficulty == QuestDifficulty(difficulty))
        except ValueError:
            pass
    if category:
        try:
            query = query.filter(Quest.category == QuestCategory(category))
        except ValueError:
            pass

    all_quests = query.order_by(Quest.sort_order).all()

    # Get student progress for each quest
    student_progress = {sq.quest_id: sq for sq in
                        StudentQuest.query.filter_by(student_id=student_id).all()}

    return render_template('student/quests.html',
                           quests=all_quests, student_progress=student_progress,
                           level=level, difficulty=difficulty, category=category)


@bp.route('/quest/<int:quest_id>')
@student_required
def quest_detail(quest_id):
    quest = db.session.get(Quest, quest_id)
    if not quest:
        flash('المهمة غير موجودة', 'error')
        return redirect(url_for('student.quests'))

    student_quest = StudentQuest.query.filter_by(
        student_id=current_user.id, quest_id=quest_id
    ).first()

    # Get related activities
    related_activities = Activity.query.filter_by(quest_id=quest_id).all()

    return render_template('student/quest_detail.html',
                           quest=quest, student_quest=student_quest,
                           related_activities=related_activities)


@bp.route('/quest/<int:quest_id>/start', methods=['POST'])
@student_required
def start_quest(quest_id):
    quest = db.session.get(Quest, quest_id)
    if not quest:
        return jsonify({'error': 'Quest not found'}), 404

    existing = StudentQuest.query.filter_by(
        student_id=current_user.id, quest_id=quest_id
    ).first()

    if existing:
        if existing.status == QuestStatus.COMPLETED:
            flash('أكملت هذه المهمة بالفعل', 'info')
        return redirect(url_for('student.quest_detail', quest_id=quest_id))

    sq = StudentQuest(
        student_id=current_user.id, quest_id=quest_id,
        status=QuestStatus.IN_PROGRESS, started_at=datetime.now(timezone.utc)
    )
    db.session.add(sq)
    db.session.commit()
    flash('بدأت المهمة! حظاً سعيداً', 'success')
    return redirect(url_for('student.quest_detail', quest_id=quest_id))


@bp.route('/quest/<int:quest_id>/complete', methods=['POST'])
@student_required
def complete_quest(quest_id):
    sq = StudentQuest.query.filter_by(
        student_id=current_user.id, quest_id=quest_id
    ).first()
    if not sq or sq.status == QuestStatus.COMPLETED:
        flash('لا يمكن إكمال هذه المهمة', 'error')
        return redirect(url_for('student.quests'))

    sq.status = QuestStatus.COMPLETED
    sq.completed_at = datetime.now(timezone.utc)
    db.session.commit()

    award_quest_rewards(current_user.id, quest_id)
    flash('أحسنت! أكملت المهمة وحصلت على المكافآت', 'success')
    return redirect(url_for('student.quest_detail', quest_id=quest_id))


# ─── Activities ─────────────────────────────────────────────────────────────

@bp.route('/activities')
@student_required
def activities():
    student_id = current_user.id
    source_filter = request.args.get('source', '')

    query = Activity.query
    if source_filter:
        try:
            query = query.filter(Activity.source == ActivitySource(source_filter))
        except ValueError:
            pass

    all_activities = query.order_by(Activity.sort_order).all()

    # Student progress
    student_progress = {sa.activity_id: sa for sa in
                        StudentActivity.query.filter_by(student_id=student_id).all()}

    # Stats
    total_count = Activity.query.count()
    completed_count = StudentActivity.query.filter_by(
        student_id=student_id, status='completed'
    ).count()

    return render_template('student/activities.html',
                           activities=all_activities, student_progress=student_progress,
                           total_count=total_count, completed_count=completed_count,
                           source_filter=source_filter)


@bp.route('/activity/<int:activity_id>')
@student_required
def activity_detail(activity_id):
    activity = db.session.get(Activity, activity_id)
    if not activity:
        flash('النشاط غير موجود', 'error')
        return redirect(url_for('student.activities'))

    student_activity = StudentActivity.query.filter_by(
        student_id=current_user.id, activity_id=activity_id
    ).first()

    return render_template('student/activity_detail.html',
                           activity=activity, student_activity=student_activity)


@bp.route('/activity/<int:activity_id>/complete', methods=['POST'])
@student_required
def complete_activity(activity_id):
    activity = db.session.get(Activity, activity_id)
    if not activity:
        return jsonify({'error': 'Activity not found'}), 404

    sa = StudentActivity.query.filter_by(
        student_id=current_user.id, activity_id=activity_id
    ).first()

    if sa and sa.status == 'completed':
        flash('أكملت هذا النشاط بالفعل', 'info')
        return redirect(url_for('student.activities'))

    if not sa:
        sa = StudentActivity(
            student_id=current_user.id, activity_id=activity_id,
            status='completed', started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc)
        )
        db.session.add(sa)
    else:
        sa.status = 'completed'
        sa.completed_at = datetime.now(timezone.utc)

    db.session.commit()
    award_activity_rewards(current_user.id, activity_id)
    flash('أحسنت! أكملت النشاط', 'success')
    return redirect(url_for('student.activities'))


# ─── Rewards (Daily Rewards + Badges) ───────────────────────────────────────

@bp.route('/rewards')
@student_required
def rewards():
    student_id = current_user.id
    daily_rewards = DailyReward.query.order_by(DailyReward.day_number).all()

    # Determine current cycle and which days are claimed
    today = date.today()
    # Cycle resets every 5 days from last cycle_start
    last_claim = StudentDailyReward.query.filter_by(student_id=student_id).order_by(
        StudentDailyReward.claimed_at.desc()
    ).first()

    if last_claim and (today - last_claim.cycle_start).days < 5:
        cycle_start = last_claim.cycle_start
    else:
        cycle_start = today

    claimed_days = {r.day_number for r in StudentDailyReward.query.filter_by(
        student_id=student_id, cycle_start=cycle_start
    ).all()}

    # Current day to claim
    current_day = len(claimed_days) + 1 if len(claimed_days) < 5 else 5

    # Badges
    badges_earned = current_user.badges_earned.all()
    all_badges = Badge.query.all()
    earned_ids = {b.id for b in badges_earned}

    # Streak
    streak = Streak.query.filter_by(student_id=student_id).first()

    return render_template('student/rewards.html',
                           daily_rewards=daily_rewards,
                           claimed_days=claimed_days,
                           current_day=current_day,
                           cycle_start=cycle_start,
                           badges_earned=badges_earned,
                           all_badges=all_badges,
                           earned_ids=earned_ids,
                           streak=streak)


@bp.route('/rewards/claim', methods=['POST'])
@student_required
def claim_daily_reward():
    student_id = current_user.id
    today = date.today()

    # Determine cycle
    last_claim = StudentDailyReward.query.filter_by(student_id=student_id).order_by(
        StudentDailyReward.claimed_at.desc()
    ).first()

    if last_claim and (today - last_claim.cycle_start).days < 5:
        cycle_start = last_claim.cycle_start
    else:
        cycle_start = today

    claimed_days = StudentDailyReward.query.filter_by(
        student_id=student_id, cycle_start=cycle_start
    ).count()

    next_day = claimed_days + 1
    if next_day > 5:
        flash('أكملت مكافآت هذه الدورة!', 'info')
        return redirect(url_for('student.rewards'))

    reward = DailyReward.query.filter_by(day_number=next_day).first()
    if not reward:
        flash('خطأ في المكافأة', 'error')
        return redirect(url_for('student.rewards'))

    # Claim
    claim = StudentDailyReward(
        student_id=student_id, day_number=next_day, cycle_start=cycle_start
    )
    db.session.add(claim)

    # Award based on type
    if reward.reward_type == RewardType.COINS:
        wallet = get_or_create_wallet(student_id)
        wallet.coins += reward.amount
    elif reward.reward_type == RewardType.GEMS:
        wallet = get_or_create_wallet(student_id)
        wallet.gems += reward.amount
    elif reward.reward_type == RewardType.MYSTERY:
        # Mystery: random coins 10-50
        import random
        bonus = random.choice([10, 15, 20, 25, 30, 50])
        wallet = get_or_create_wallet(student_id)
        wallet.coins += bonus
    elif reward.reward_type == RewardType.CHEST:
        # Chest: coins + gems + XP
        wallet = get_or_create_wallet(student_id)
        wallet.coins += 50
        wallet.gems += 3
        xp = StudentXP(student_id=student_id, amount=30, reason='صندوق كنز يومي')
        db.session.add(xp)

    db.session.commit()
    flash(f'حصلت على مكافأة اليوم {next_day}!', 'success')
    return redirect(url_for('student.rewards'))


# ─── Library / Lesson Viewer ────────────────────────────────────────────────

@bp.route('/library')
@student_required
def library():
    student_id = current_user.id
    tracks = Track.query.order_by(Track.sort_order).all()

    # Per-track progress
    track_progress = {}
    for track in tracks:
        total_units = Unit.query.filter_by(track_id=track.id).count()
        completed_units = StudentUnitProgress.query.filter_by(
            student_id=student_id, track_id=track.id, status='completed'
        ).count()
        pct = (completed_units / total_units * 100) if total_units > 0 else 0
        track_progress[track.id] = {
            'total': total_units, 'completed': completed_units, 'pct': int(pct)
        }

    return render_template('student/library.html',
                           tracks=tracks, track_progress=track_progress)


@bp.route('/library/<track_id>/<level_id>/<unit_id>')
@student_required
def lesson_viewer(track_id, level_id, unit_id):
    unit = Unit.query.filter_by(
        track_id=track_id, level_id=level_id, id=unit_id
    ).first()
    if not unit:
        flash('الوحدة غير موجودة', 'error')
        return redirect(url_for('student.library'))

    lessons = LessonContent.query.filter_by(
        track_id=track_id, level_id=level_id, unit_id=unit_id
    ).order_by(LessonContent.chapter_number).all()

    # Student progress for these lessons
    lesson_ids = [l.id for l in lessons]
    completed_ids = set()
    if lesson_ids:
        completed_ids = {lp.lesson_id for lp in LessonProgress.query.filter(
            LessonProgress.student_id == current_user.id,
            LessonProgress.lesson_id.in_(lesson_ids),
            LessonProgress.completed == True
        ).all()}

    # Track/level info
    track = Track.query.get(track_id)
    level = Level.query.filter_by(track_id=track_id, id=level_id).first()

    # Sibling units for sidebar navigation
    sibling_units = Unit.query.filter_by(
        track_id=track_id, level_id=level_id
    ).order_by(Unit.sort_order).all()

    return render_template('student/lesson_viewer.html',
                           unit=unit, lessons=lessons, completed_ids=completed_ids,
                           track=track, level=level, sibling_units=sibling_units)


# ─── Onboarding ─────────────────────────────────────────────────────────────

@bp.route('/onboarding')
@student_required
def onboarding():
    if current_user.onboarding_completed:
        return redirect(url_for('student.dashboard'))

    tracks = Track.query.order_by(Track.sort_order).all()
    return render_template('student/onboarding.html', tracks=tracks)


@bp.route('/onboarding/submit', methods=['POST'])
@student_required
def onboarding_submit():
    motivation = request.form.get('motivation', 'adventure')
    bio = request.form.get('bio', '').strip()
    first_track = request.form.get('first_track', '')

    current_user.motivation_type = motivation
    current_user.bio = bio or None
    current_user.onboarding_completed = True

    # Create wallet with welcome bonus
    wallet = get_or_create_wallet(current_user.id)
    if wallet.coins == 0 and wallet.gems == 0:
        wallet.coins = 50
        wallet.gems = 2

    # Record joined milestone
    existing_ms = JourneyMilestone.query.filter_by(
        student_id=current_user.id, milestone_type=MilestoneType.JOINED
    ).first()
    if not existing_ms:
        record_milestone(current_user.id, MilestoneType.JOINED,
                         'انضم إلى شلبي فيرس', 'Joined Shalaby Verse')

    db.session.commit()
    flash('مرحباً بك في شلبي فيرس! رحلتك تبدأ الآن', 'success')
    return redirect(url_for('student.dashboard'))


# ─── Existing Routes (kept) ─────────────────────────────────────────────────

@bp.route('/timetable')
@student_required
def timetable():
    student_id = current_user.id
    group_ids = [gs.group_id for gs in GroupStudent.query.filter_by(student_id=student_id).all()]
    sessions = Session.query.filter(
        Session.group_id.in_(group_ids),
        Session.status.in_([SessionStatus.SCHEDULED, SessionStatus.LIVE]),
    ).order_by(Session.scheduled_at).all() if group_ids else []

    days = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']
    weekday_map = {5: 'السبت', 6: 'الأحد', 0: 'الاثنين', 1: 'الثلاثاء',
                   2: 'الأربعاء', 3: 'الخميس', 4: 'الجمعة'}
    timetable_dict = {d: [] for d in days}
    for s in sessions:
        day_name = weekday_map.get(s.scheduled_at.weekday(), 'السبت')
        timetable_dict[day_name].append(s)

    return render_template('student/timetable.html', days=days, timetable=timetable_dict)


@bp.route('/sessions')
@student_required
def sessions():
    student_id = current_user.id
    group_ids = [gs.group_id for gs in GroupStudent.query.filter_by(student_id=student_id).all()]

    all_sessions = Session.query.filter(
        Session.group_id.in_(group_ids),
    ).order_by(Session.scheduled_at).all() if group_ids else []

    live_sessions = [s for s in all_sessions if s.status == SessionStatus.LIVE]
    upcoming_sessions = [s for s in all_sessions if s.status == SessionStatus.SCHEDULED]
    completed_sessions = sorted(
        [s for s in all_sessions if s.status == SessionStatus.COMPLETED],
        key=lambda s: s.scheduled_at, reverse=True
    )

    return render_template('student/sessions.html',
                           live_sessions=live_sessions,
                           upcoming_sessions=upcoming_sessions,
                           completed_sessions=completed_sessions)


@bp.route('/progress')
@student_required
def progress():
    student_id = current_user.id
    total_xp = StudentXP.total_xp(student_id)
    level = StudentXP.current_level(total_xp)
    xp_history = StudentXP.query.filter_by(student_id=student_id).order_by(
        StudentXP.created_at.desc()
    ).limit(50).all()
    attendance_records = Attendance.query.filter_by(student_id=student_id).all()
    total_sessions = len(attendance_records)
    attended = sum(1 for a in attendance_records if a.status.value in ('present', 'late'))
    attendance_pct = (attended / total_sessions * 100) if total_sessions > 0 else 0
    return render_template('student/progress.html', total_xp=total_xp, level=level,
                           xp_history=xp_history, attendance_pct=attendance_pct,
                           total_sessions=total_sessions, attended=attended)


@bp.route('/badges')
@student_required
def badges():
    return redirect(url_for('student.rewards'))


@bp.route('/leaderboard')
@student_required
def leaderboard():
    period = request.args.get('period', 'all_time')
    rows = db.session.query(
        User.id, User.name_ar, User.avatar_url,
        func.coalesce(func.sum(StudentXP.amount), 0).label('total_xp')
    ).outerjoin(StudentXP, User.id == StudentXP.student_id).filter(
        User.role == Role.STUDENT
    ).group_by(User.id).order_by(func.sum(StudentXP.amount).desc()).limit(50).all()

    leaderboard_data = []
    student_rank = None
    for i, row in enumerate(rows):
        level = StudentXP.current_level(row.total_xp)
        entry = {
            'rank': i + 1, 'name': row.name_ar, 'name_ar': row.name_ar,
            'avatar': row.avatar_url, 'xp': row.total_xp, 'level': level,
        }
        leaderboard_data.append(type('Entry', (), entry)())
        if row.id == current_user.id:
            student_rank = i + 1

    return render_template('student/leaderboard.html',
                           leaderboard=leaderboard_data, period=period,
                           student_rank=student_rank)


@bp.route('/homework')
@student_required
def homework_list():
    student_id = current_user.id
    group_ids = [gs.group_id for gs in GroupStudent.query.filter_by(student_id=student_id).all()]
    homework_items = Homework.query.filter(Homework.group_id.in_(group_ids)).order_by(
        Homework.due_date.desc()
    ).all() if group_ids else []
    my_submissions = {s.homework_id: s for s in HomeworkSubmission.query.filter_by(
        student_id=student_id
    ).all()}
    return render_template('student/homework.html',
                           homework_items=homework_items, my_submissions=my_submissions)


@bp.route('/homework/<int:hw_id>', methods=['GET', 'POST'])
@student_required
def homework_detail(hw_id):
    hw = db.session.get(Homework, hw_id)
    if not hw:
        flash('الواجب غير موجود', 'error')
        return redirect(url_for('student.homework_list'))

    existing = HomeworkSubmission.query.filter_by(
        homework_id=hw_id, student_id=current_user.id
    ).first()

    if request.method == 'POST' and not existing:
        content = request.form.get('content', '')
        file_url = None

        uploaded_file = request.files.get('file')
        if uploaded_file and uploaded_file.filename:
            allowed = ALLOWED_DOCUMENTS | ALLOWED_IMAGES | {'zip'}
            saved_name = save_upload(uploaded_file, 'homework', allowed)
            if saved_name:
                file_url = get_upload_url(saved_name, 'homework')
            else:
                flash('فشل رفع الملف. تأكد من نوع وحجم الملف (حد أقصى 10 ميجا).', 'error')

        sub = HomeworkSubmission(
            homework_id=hw_id, student_id=current_user.id,
            content=content, file_url=file_url,
        )
        db.session.add(sub)
        db.session.commit()
        flash('تم تسليم الواجب بنجاح', 'success')
        return redirect(url_for('student.homework_list'))

    return render_template('student/homework_detail.html', homework=hw, submission=existing)


@bp.route('/profile', methods=['GET', 'POST'])
@student_required
def profile():
    if request.method == 'POST':
        current_user.name_ar = request.form.get('name_ar', current_user.name_ar).strip()
        current_user.name_en = request.form.get('name_en', current_user.name_en).strip()
        current_user.phone = request.form.get('phone', '').strip() or None
        current_user.bio = request.form.get('bio', '').strip() or None

        avatar_file = request.files.get('avatar')
        if avatar_file and avatar_file.filename:
            saved_name = save_upload(avatar_file, 'avatars', ALLOWED_IMAGES)
            if saved_name:
                if current_user.avatar_url:
                    old_filename = current_user.avatar_url.rsplit('/', 1)[-1]
                    delete_upload(old_filename, 'avatars')
                current_user.avatar_url = get_upload_url(saved_name, 'avatars')
            else:
                flash('فشل رفع الصورة. الأنواع المسموحة: PNG, JPG, GIF, WEBP (حد أقصى 10 ميجا)', 'error')

        db.session.commit()
        flash('تم تحديث الملف الشخصي', 'success')

    student_id = current_user.id
    xp_total = StudentXP.total_xp(student_id)
    level = StudentXP.current_level(xp_total)
    _title_ar, _title_en = StudentXP.level_title(level)
    level_title = _title_ar

    streak = Streak.query.filter_by(student_id=student_id).first()
    if not streak:
        streak = Streak(student_id=student_id, current_streak=0, longest_streak=0)

    badges_earned = current_user.badges_earned.all()
    all_badges = Badge.query.all()
    earned_ids = {b.id for b in badges_earned}
    badges_count = len(badges_earned)
    sessions_attended = Attendance.query.filter_by(student_id=student_id).count()

    # Wallet
    wallet = get_or_create_wallet(student_id)

    # Journey stats
    quests_completed = StudentQuest.query.filter_by(
        student_id=student_id, status=QuestStatus.COMPLETED
    ).count()
    total_quests = Quest.query.count()

    # Track progress
    tracks = Track.query.order_by(Track.sort_order).all()
    tracks_with_progress = []
    for track in tracks:
        total_units = Unit.query.filter_by(track_id=track.id).count()
        completed_units = StudentUnitProgress.query.filter_by(
            student_id=student_id, track_id=track.id, status='completed'
        ).count()
        pct = (completed_units / total_units * 100) if total_units > 0 else 0
        tracks_with_progress.append({
            'track': track, 'completed': completed_units,
            'total': total_units, 'pct': int(pct)
        })

    # Milestones (last 20)
    milestones = JourneyMilestone.query.filter_by(student_id=student_id).order_by(
        JourneyMilestone.created_at.desc()
    ).limit(20).all()

    return render_template('student/profile.html',
                           xp_total=xp_total, level=level, level_title=level_title,
                           streak=streak, badges_count=badges_count,
                           sessions_attended=sessions_attended,
                           wallet=wallet,
                           badges_earned=badges_earned, all_badges=all_badges,
                           earned_ids=earned_ids,
                           quests_completed=quests_completed, total_quests=total_quests,
                           tracks_with_progress=tracks_with_progress,
                           milestones=milestones)
