import os
from dotenv import load_dotenv

load_dotenv()

from celery import Celery
from app import create_app

app = create_app(os.environ.get('FLASK_ENV', 'development'))

celery = Celery(app.name)
celery.conf.update(
    broker_url=app.config['CELERY_BROKER_URL'],
    result_backend=app.config['CELERY_RESULT_BACKEND'],
)


@celery.task
def process_slides(resource_id):
    """Convert PDF slides to individual images and upload to S3."""
    with app.app_context():
        from app.extensions import db
        from app.models.resource import Resource, ResourceFile, FileType

        resource = db.session.get(Resource, resource_id)
        if not resource:
            return

        # Get the PDF file
        pdf_file = resource.files.filter_by(file_type=FileType.PDF).first()
        if not pdf_file:
            return

        try:
            from app.utils.s3 import get_s3_client, upload_bytes
            from pdf2image import convert_from_bytes
            import io

            s3 = get_s3_client()
            bucket = app.config['S3_BUCKET']

            # Download PDF from S3
            response = s3.get_object(Bucket=bucket, Key=pdf_file.s3_key)
            pdf_bytes = response['Body'].read()

            # Convert to images
            images = convert_from_bytes(pdf_bytes, dpi=150)

            for i, img in enumerate(images):
                buf = io.BytesIO()
                img.save(buf, format='PNG')
                buf.seek(0)

                s3_key = f'slides/{resource.id}/slide_{i+1:03d}.png'
                upload_bytes(buf.getvalue(), s3_key, 'image/png')

                slide_file = ResourceFile(
                    resource_id=resource.id,
                    file_type=FileType.SLIDE_IMAGE,
                    s3_key=s3_key,
                    filename=f'slide_{i+1:03d}.png',
                    sort_order=i,
                )
                db.session.add(slide_file)

            db.session.commit()
        except Exception as e:
            print(f'Error processing slides for resource {resource_id}: {e}')


@celery.task
def check_badges(student_id):
    """Check and award any new badges for a student."""
    with app.app_context():
        from app.extensions import db
        from app.models.user import User
        from app.models.gamification import Badge, BadgeCriteria, StudentXP, Streak, StudentBadge
        from app.models.classroom import Attendance, AttendanceStatus
        from app.models.homework import HomeworkSubmission
        from app.models.notification import Notification, NotificationType

        student = db.session.get(User, student_id)
        if not student:
            return

        earned_ids = {b.id for b in student.badges_earned.all()}
        all_badges = Badge.query.all()

        for badge in all_badges:
            if badge.id in earned_ids:
                continue

            earned = False
            if badge.criteria_type == BadgeCriteria.SESSIONS_ATTENDED:
                count = Attendance.query.filter_by(
                    student_id=student_id, status=AttendanceStatus.PRESENT
                ).count()
                earned = count >= badge.criteria_value

            elif badge.criteria_type == BadgeCriteria.XP_EARNED:
                total = StudentXP.total_xp(student_id)
                earned = total >= badge.criteria_value

            elif badge.criteria_type == BadgeCriteria.STREAK_DAYS:
                streak = Streak.query.filter_by(student_id=student_id).first()
                earned = streak and streak.longest_streak >= badge.criteria_value

            elif badge.criteria_type == BadgeCriteria.ASSIGNMENTS_COMPLETED:
                count = HomeworkSubmission.query.filter(
                    HomeworkSubmission.student_id == student_id,
                    HomeworkSubmission.grade.isnot(None),
                ).count()
                earned = count >= badge.criteria_value

            if earned:
                db.session.execute(StudentBadge.insert().values(
                    student_id=student_id, badge_id=badge.id,
                ))
                # Notify student
                notif = Notification(
                    user_id=student_id,
                    title=f'شارة جديدة: {badge.name_ar}',
                    message=badge.description_ar,
                    type=NotificationType.BADGE,
                )
                db.session.add(notif)

        db.session.commit()


@celery.task
def send_session_reminder(session_id):
    """Send reminder notifications for an upcoming session."""
    with app.app_context():
        from app.extensions import db
        from app.models.classroom import Session, GroupStudent
        from app.models.notification import Notification, NotificationType

        session = db.session.get(Session, session_id)
        if not session:
            return

        # Get all students in the group
        group_students = GroupStudent.query.filter_by(group_id=session.group_id).all()
        for gs in group_students:
            notif = Notification(
                user_id=gs.student_id,
                title='تذكير بجلسة قادمة',
                message=f'جلسة "{session.title}" تبدأ قريباً',
                type=NotificationType.SESSION_REMINDER,
                link=f'/room/{session.id}',
            )
            db.session.add(notif)

        # Notify teacher
        notif = Notification(
            user_id=session.teacher_id,
            title='تذكير بجلسة قادمة',
            message=f'جلسة "{session.title}" تبدأ قريباً',
            type=NotificationType.SESSION_REMINDER,
            link=f'/room/{session.id}',
        )
        db.session.add(notif)
        db.session.commit()
