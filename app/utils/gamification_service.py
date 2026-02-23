from datetime import datetime, timezone
from app.extensions import db
from app.models.gamification import StudentXP, Badge, StudentBadge, Streak, BadgeCriteria
from app.models.journey import (
    JourneyMilestone, MilestoneType, Quest, StudentQuest, QuestStatus,
    Activity, StudentActivity, StudentWallet
)
from app.models.classroom import Attendance
from app.models.homework import HomeworkSubmission
from app.utils.wallet import get_or_create_wallet, award_coins, award_gems


def check_and_award_badges(student_id):
    """Check all badge criteria and award any missing badges."""
    earned_ids = {row.badge_id for row in
                  db.session.query(StudentBadge.c.badge_id).filter(
                      StudentBadge.c.student_id == student_id).all()}
    all_badges = Badge.query.all()
    total_xp = StudentXP.total_xp(student_id)

    for badge in all_badges:
        if badge.id in earned_ids:
            continue

        earned = False
        if badge.criteria_type == BadgeCriteria.XP_EARNED:
            earned = total_xp >= badge.criteria_value
        elif badge.criteria_type == BadgeCriteria.SESSIONS_ATTENDED:
            count = Attendance.query.filter_by(student_id=student_id).count()
            earned = count >= badge.criteria_value
        elif badge.criteria_type == BadgeCriteria.STREAK_DAYS:
            streak = Streak.query.filter_by(student_id=student_id).first()
            earned = streak and streak.longest_streak >= badge.criteria_value
        elif badge.criteria_type == BadgeCriteria.ASSIGNMENTS_COMPLETED:
            count = HomeworkSubmission.query.filter(
                HomeworkSubmission.student_id == student_id,
                HomeworkSubmission.grade.isnot(None)
            ).count()
            earned = count >= badge.criteria_value

        if earned:
            db.session.execute(StudentBadge.insert().values(
                student_id=student_id, badge_id=badge.id
            ))
            record_milestone(student_id, MilestoneType.BADGE_EARNED,
                             f'حصلت على شارة {badge.name_ar}',
                             f'Earned badge: {badge.name}',
                             badge.name)

    db.session.commit()


def update_student_streak(student_id):
    """Update streak and check streak badges."""
    streak = Streak.query.filter_by(student_id=student_id).first()
    if not streak:
        streak = Streak(student_id=student_id)
        db.session.add(streak)
    streak.update_streak()
    db.session.commit()
    check_and_award_badges(student_id)


def record_milestone(student_id, milestone_type, title_ar, title_en='', detail=None):
    """Create a JourneyMilestone entry."""
    ms = JourneyMilestone(
        student_id=student_id,
        milestone_type=milestone_type,
        title_ar=title_ar,
        title_en=title_en,
        detail=detail,
    )
    db.session.add(ms)


def award_quest_rewards(student_id, quest_id):
    """Award XP + coins + gems for completing a quest, record milestone."""
    quest = db.session.get(Quest, quest_id)
    if not quest:
        return

    if quest.xp_reward:
        xp = StudentXP(student_id=student_id, amount=quest.xp_reward,
                        reason=f'إكمال مهمة: {quest.title_ar}')
        db.session.add(xp)

    if quest.coin_reward:
        wallet = get_or_create_wallet(student_id)
        wallet.coins += quest.coin_reward

    if quest.gem_reward:
        wallet = get_or_create_wallet(student_id)
        wallet.gems += quest.gem_reward

    record_milestone(student_id, MilestoneType.QUEST_COMPLETED,
                     f'أكملت مهمة: {quest.title_ar}',
                     f'Completed quest: {quest.title}',
                     quest.title)
    db.session.commit()
    check_and_award_badges(student_id)


def award_activity_rewards(student_id, activity_id):
    """Award XP + coins for completing an activity."""
    activity = db.session.get(Activity, activity_id)
    if not activity:
        return

    if activity.xp_reward:
        xp = StudentXP(student_id=student_id, amount=activity.xp_reward,
                        reason=f'إكمال نشاط: {activity.title_ar}')
        db.session.add(xp)

    if activity.coin_reward:
        wallet = get_or_create_wallet(student_id)
        wallet.coins += activity.coin_reward

    db.session.commit()
    check_and_award_badges(student_id)


def get_student_journey_stats(student_id):
    """Get aggregated stats for the student journey."""
    total_xp = StudentXP.total_xp(student_id)
    level = StudentXP.current_level(total_xp)
    level_title_ar, level_title_en = StudentXP.level_title(level)
    wallet = get_or_create_wallet(student_id)
    streak = Streak.query.filter_by(student_id=student_id).first()

    quests_completed = StudentQuest.query.filter_by(
        student_id=student_id, status=QuestStatus.COMPLETED).count()
    activities_completed = StudentActivity.query.filter_by(
        student_id=student_id, status='completed').count()

    # XP thresholds for progress
    thresholds = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5000,
                  6500, 8000, 10000, 12500, 15000, 18000, 21000, 25000]
    current_threshold = thresholds[level - 1] if level <= len(thresholds) else thresholds[-1]
    next_threshold = thresholds[level] if level < len(thresholds) else thresholds[-1] + 5000
    xp_progress = ((total_xp - current_threshold) / max(next_threshold - current_threshold, 1)) * 100

    return {
        'total_xp': total_xp,
        'level': level,
        'level_title_ar': level_title_ar,
        'level_title_en': level_title_en,
        'coins': wallet.coins,
        'gems': wallet.gems,
        'current_streak': streak.current_streak if streak else 0,
        'longest_streak': streak.longest_streak if streak else 0,
        'quests_completed': quests_completed,
        'activities_completed': activities_completed,
        'xp_progress': min(xp_progress, 100),
        'next_threshold': next_threshold,
    }
