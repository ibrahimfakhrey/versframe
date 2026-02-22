import os
import json
import base64
import string
from flask import render_template, jsonify, request
from flask_login import current_user, login_required
from app.blueprints.room import bp
from app.extensions import db, socketio, csrf
from app.models.classroom import Session, SessionStatus, Attendance, AttendanceStatus, SessionResource
from app.models.resource import Resource, ResourceType, ResourceFile, FileType
from app.models.user import Role
from app.models.gamification import StudentXP, Streak
from flask_socketio import emit, join_room, leave_room
from datetime import datetime, timezone

# Track current slide state per session: session_id -> {resource_id, slide_index}
_session_slide_state = {}

# Track whiteboard state per session: session_id -> {url}
_session_whiteboard_state = {}

# Track video state per session: session_id -> {youtube_url, current_time, is_playing}
_session_video_state = {}


@bp.route('/<int:session_id>')
@login_required
def room(session_id):
    session = db.session.get(Session, session_id)
    if not session:
        return 'الجلسة غير موجودة', 404

    is_teacher = current_user.role in (Role.TEACHER, Role.ADMIN)
    hms_role = 'teacher' if is_teacher else 'student'

    # Get session resources
    resources = SessionResource.query.filter_by(session_id=session_id).order_by(
        SessionResource.sort_order
    ).all()

    return render_template('room/room.html',
                           session=session,
                           is_teacher=is_teacher,
                           hms_role=hms_role,
                           resources=resources)


@bp.route('/<int:session_id>/token')
@login_required
def get_token(session_id):
    session = db.session.get(Session, session_id)
    if not session or not session.hundredms_room_id:
        return jsonify({'error': 'Room not configured'}), 404

    is_teacher = current_user.role in (Role.TEACHER, Role.ADMIN)
    role = 'teacher' if is_teacher else 'student'

    try:
        from app.utils.hundredms import generate_auth_token
        token = generate_auth_token(session.hundredms_room_id, current_user.id, role)
        return jsonify({'token': token})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/<int:session_id>/resources')
@login_required
def get_resources(session_id):
    resources = SessionResource.query.filter_by(session_id=session_id).order_by(
        SessionResource.sort_order
    ).all()
    return jsonify([{
        'id': r.id,
        'resource_id': r.resource_id,
        'name': r.resource.name if r.resource else '',
        'name_ar': r.resource.name_ar if r.resource else '',
        'type': r.resource.type.value if r.resource else '',
        'is_active': r.is_active,
        'sort_order': r.sort_order,
    } for r in resources])


@bp.route('/<int:session_id>/activate-resource', methods=['POST'])
@login_required
def activate_resource(session_id):
    csrf.protect()
    if current_user.role not in (Role.TEACHER, Role.ADMIN):
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json()
    resource_id = data.get('resource_id')

    # Deactivate all resources for this session
    SessionResource.query.filter_by(session_id=session_id).update({'is_active': False})

    # Activate the selected one
    sr = SessionResource.query.filter_by(session_id=session_id, resource_id=resource_id).first()
    if sr:
        sr.is_active = True
        db.session.commit()

        # Build extra data for video/game types
        extra = {}
        if sr.resource and sr.resource.config_json:
            try:
                extra = json.loads(sr.resource.config_json)
            except (json.JSONDecodeError, TypeError):
                pass

        # Emit to all users in room
        socketio.emit('resource_switch', {
            'session_id': session_id,
            'resource_id': resource_id,
            'resource_type': sr.resource.type.value if sr.resource else '',
            'config': extra,
        }, room=f'session_{session_id}')

    return jsonify({'ok': True})


@bp.route('/<int:session_id>/upload-slides', methods=['POST'])
@login_required
def upload_slides(session_id):
    """Teacher uploads PDF/PPTX, converts to slide images, creates Resource."""
    csrf.protect()
    if current_user.role not in (Role.TEACHER, Role.ADMIN):
        return jsonify({'error': 'Unauthorized'}), 403

    session_obj = db.session.get(Session, session_id)
    if not session_obj:
        return jsonify({'error': 'Session not found'}), 404

    file = request.files.get('file')
    if not file or file.filename == '':
        return jsonify({'error': 'No file uploaded'}), 400

    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in ('pdf', 'pptx', 'ppt'):
        return jsonify({'error': 'Only PDF and PPTX files are supported'}), 400

    # Save uploaded file temporarily
    from app.utils.uploads import save_upload, ALLOWED_DOCUMENTS
    saved_name = save_upload(file, 'slides', ALLOWED_DOCUMENTS)
    if not saved_name:
        return jsonify({'error': 'File save failed. Check file size (max 50MB).'}), 400

    from app.utils.uploads import _UPLOAD_BASE
    file_path = os.path.join(_UPLOAD_BASE, 'slides', saved_name)

    # Create Resource record
    resource = Resource(
        name=file.filename,
        name_ar=file.filename,
        type=ResourceType.SLIDES,
        created_by=current_user.id,
    )
    db.session.add(resource)
    db.session.flush()  # get resource.id

    # Convert to slide images
    try:
        from app.utils.slides import convert_to_slide_images
        slide_urls = convert_to_slide_images(file_path, resource.id)
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Conversion failed: {str(e)}'}), 500

    # Create ResourceFile records for each slide image
    for i, url in enumerate(slide_urls):
        rf = ResourceFile(
            resource_id=resource.id,
            file_type=FileType.SLIDE_IMAGE,
            s3_key=url,  # using URL path as key for local storage
            filename=os.path.basename(url),
            sort_order=i,
        )
        db.session.add(rf)

    # Deactivate existing resources, add and activate this one
    SessionResource.query.filter_by(session_id=session_id).update({'is_active': False})
    sr = SessionResource(
        session_id=session_id,
        resource_id=resource.id,
        is_active=True,
        sort_order=0,
    )
    db.session.add(sr)
    db.session.commit()

    # Update slide state
    _session_slide_state[session_id] = {
        'resource_id': resource.id,
        'slide_index': 0,
    }

    # Broadcast to all users in the room
    socketio.emit('resource_switch', {
        'session_id': session_id,
        'resource_id': resource.id,
        'resource_type': 'slides',
        'slide_urls': slide_urls,
    }, room=f'session_{session_id}')

    # Clean up the original uploaded file
    try:
        os.remove(file_path)
    except OSError:
        pass

    return jsonify({
        'ok': True,
        'resource_id': resource.id,
        'slide_urls': slide_urls,
        'slide_count': len(slide_urls),
    })


@bp.route('/<int:session_id>/current-slide')
@login_required
def current_slide(session_id):
    """Return the current slide index for late joiners."""
    state = _session_slide_state.get(session_id, {})
    return jsonify({
        'resource_id': state.get('resource_id'),
        'slide_index': state.get('slide_index', 0),
    })


@bp.route('/<int:session_id>/start-whiteboard', methods=['POST'])
@login_required
def start_whiteboard(session_id):
    """Teacher starts a collaborative Excalidraw whiteboard for the session."""
    csrf.protect()
    if current_user.role not in (Role.TEACHER, Role.ADMIN):
        return jsonify({'error': 'Unauthorized'}), 403

    session_obj = db.session.get(Session, session_id)
    if not session_obj:
        return jsonify({'error': 'Session not found'}), 404

    # Reuse existing whiteboard if already active
    existing = _session_whiteboard_state.get(session_id)
    if existing and existing.get('url'):
        return jsonify({'ok': True, 'url': existing['url']})

    # Generate WBO collaborative whiteboard URL (auto-creates room on visit)
    import secrets
    board_id = f'verse-{session_id}-{secrets.token_hex(4)}'
    url = f'https://wbo.ophir.dev/boards/{board_id}'

    _session_whiteboard_state[session_id] = {'url': url}

    return jsonify({'ok': True, 'url': url})


# === SocketIO Event Handlers ===

@socketio.on('join_session')
def handle_join(data):
    session_id = data.get('session_id')
    join_room(f'session_{session_id}')

    # Record attendance for students
    if current_user.is_authenticated and current_user.role == Role.STUDENT:
        att = Attendance.query.filter_by(
            session_id=session_id, student_id=current_user.id
        ).first()
        if not att:
            att = Attendance(
                session_id=session_id, student_id=current_user.id,
                joined_at=datetime.now(timezone.utc),
                status=AttendanceStatus.PRESENT,
            )
            db.session.add(att)
        else:
            att.joined_at = att.joined_at or datetime.now(timezone.utc)
            att.status = AttendanceStatus.PRESENT
        db.session.commit()

        # Update streak
        streak = Streak.query.filter_by(student_id=current_user.id).first()
        if not streak:
            streak = Streak(student_id=current_user.id)
            db.session.add(streak)
        streak.update_streak()
        db.session.commit()

    emit('user_joined', {
        'user_id': current_user.id if current_user.is_authenticated else 0,
        'name': current_user.name_ar if current_user.is_authenticated else 'ضيف',
        'role': current_user.role.value if current_user.is_authenticated else 'guest',
    }, room=f'session_{session_id}')

    # Send current slide state to the joining user (late joiner sync)
    slide_state = _session_slide_state.get(session_id)
    if slide_state:
        emit('slide_sync', slide_state)

    # Send current whiteboard state to the joining user (late joiner sync)
    wb_state = _session_whiteboard_state.get(session_id)
    if wb_state and wb_state.get('url'):
        emit('whiteboard_sync', {'url': wb_state['url']})

    # Send current video state to the joining user (late joiner sync)
    video_state = _session_video_state.get(session_id)
    if video_state and video_state.get('youtube_url'):
        emit('video_sync', video_state)


@socketio.on('leave_session')
def handle_leave(data):
    session_id = data.get('session_id')
    leave_room(f'session_{session_id}')

    if current_user.is_authenticated and current_user.role == Role.STUDENT:
        att = Attendance.query.filter_by(
            session_id=session_id, student_id=current_user.id
        ).first()
        if att:
            att.left_at = datetime.now(timezone.utc)
            if att.joined_at:
                att.duration_seconds = int((att.left_at - att.joined_at).total_seconds())
            db.session.commit()

    emit('user_left', {
        'user_id': current_user.id if current_user.is_authenticated else 0,
    }, room=f'session_{session_id}')


@socketio.on('slide_change')
def handle_slide_change(data):
    session_id = data.get('session_id')
    slide_index = data.get('slide_index', 0)
    resource_id = data.get('resource_id')
    # Store current slide state for late joiners
    if session_id:
        state = _session_slide_state.get(session_id, {})
        state['slide_index'] = slide_index
        if resource_id:
            state['resource_id'] = resource_id
        _session_slide_state[session_id] = state
    emit('slide_change', data, room=f'session_{session_id}', include_self=False)


@socketio.on('whiteboard_started')
def handle_whiteboard_started(data):
    """Teacher broadcasts whiteboard URL to all students in the room."""
    session_id = data.get('session_id')
    url = data.get('url')
    if session_id and url:
        emit('whiteboard_start', {'url': url}, room=f'session_{session_id}', include_self=False)


@socketio.on('code_broadcast')
def handle_code_broadcast(data):
    emit('code_broadcast', data, room=f'session_{data.get("session_id")}', include_self=False)


@socketio.on('code_submit')
def handle_code_submit(data):
    emit('code_submit', data, room=f'session_{data.get("session_id")}')


@socketio.on('question_submit')
def handle_question(data):
    emit('question_submit', data, room=f'session_{data.get("session_id")}')


@socketio.on('hand_raise')
def handle_hand_raise(data):
    emit('hand_raise', data, room=f'session_{data.get("session_id")}')


@socketio.on('chat_message')
def handle_chat(data):
    emit('chat_message', data, room=f'session_{data.get("session_id")}')


@socketio.on('end_session_broadcast')
def handle_end_session_broadcast(data):
    """Teacher ends session — notify all users in the room to leave."""
    if not current_user.is_authenticated or current_user.role not in (Role.TEACHER, Role.ADMIN):
        return
    session_id = data.get('session_id')
    emit('session_ended', {
        'session_id': session_id,
        'message': 'تم إنهاء الجلسة من قبل المعلم',
    }, room=f'session_{session_id}', include_self=False)


@socketio.on('timer_start')
def handle_timer_start(data):
    emit('timer_start', data, room=f'session_{data.get("session_id")}')


@socketio.on('timer_stop')
def handle_timer_stop(data):
    emit('timer_stop', data, room=f'session_{data.get("session_id")}')


# === In-Class Activity Handlers ===

# Track active activities per session: session_id -> activity_data
_active_activities = {}
# Track submissions per activity: activity_id -> {student_id: answer_data}
_activity_submissions = {}


@socketio.on('start_activity')
def handle_start_activity(data):
    """Teacher starts an activity - broadcasts to all students in the room."""
    if not current_user.is_authenticated:
        return
    if current_user.role not in (Role.TEACHER, Role.ADMIN):
        emit('error', {'message': 'Only teachers can start activities'})
        return

    session_id = data.get('session_id')
    activity = data.get('activity')
    if not session_id or not activity:
        return

    # Store the active activity
    _active_activities[session_id] = activity
    _activity_submissions[activity.get('id', '')] = {}

    # Broadcast to all users in the room (including teacher)
    emit('activity_start', activity, room=f'session_{session_id}')


@socketio.on('activity_submit')
def handle_activity_submit(data):
    """Student submits an answer - check correctness, emit result."""
    if not current_user.is_authenticated:
        return

    session_id = data.get('session_id')
    activity_id = data.get('activity_id')
    answer = data.get('answer')
    student_id = data.get('student_id', current_user.id)
    student_name = data.get('student_name', '')

    if not session_id or not activity_id or answer is None:
        return

    # Retrieve the active activity
    activity = _active_activities.get(session_id)
    if not activity or activity.get('id') != activity_id:
        emit('activity_result', {
            'correct': 0, 'total': 1, 'xp_earned': 0,
            'message': 'Activity not found or expired',
        })
        return

    # Track this submission
    submissions = _activity_submissions.setdefault(activity_id, {})
    submissions[student_id] = answer

    # Check correctness based on activity type
    correct_count = 0
    total_count = 1
    activity_type = activity.get('type', '')

    if activity_type == 'mcq':
        correct_answer = activity.get('correct')
        selected = answer.get('selected', -1) if isinstance(answer, dict) else -1
        if selected == correct_answer:
            correct_count = 1
        total_count = 1

    elif activity_type == 'dragdrop':
        correct_order = activity.get('correctOrder', [])
        student_order = answer.get('order', []) if isinstance(answer, dict) else []
        if student_order == correct_order:
            correct_count = len(correct_order)
        else:
            # Count how many items are in the correct position
            for i in range(min(len(student_order), len(correct_order))):
                if student_order[i] == correct_order[i]:
                    correct_count += 1
        total_count = len(correct_order) if correct_order else 1

    elif activity_type == 'fillblank':
        answers_list = answer.get('answers', []) if isinstance(answer, dict) else []
        lines = activity.get('lines', [])
        total_count = 0
        for line in lines:
            blanks = line.get('blanks', [])
            total_count += len(blanks)

        for ans in answers_list:
            line_idx = ans.get('line', 0)
            blank_idx = ans.get('blank', 0)
            value = ans.get('value', '').strip()
            if line_idx < len(lines):
                line_blanks = lines[line_idx].get('blanks', [])
                if blank_idx < len(line_blanks):
                    expected = line_blanks[blank_idx].get('answer', '').strip()
                    if value == expected:
                        correct_count += 1

        if total_count == 0:
            total_count = 1

    elif activity_type == 'code':
        # For code challenges, mark as submitted (teacher reviews manually)
        correct_count = 1
        total_count = 1

    # Calculate XP (base: 10 per correct, bonus for full score)
    xp_earned = correct_count * 10
    if correct_count == total_count and total_count > 0:
        xp_earned += 15  # Perfect score bonus

    # Award XP in the database
    if xp_earned > 0 and current_user.role == Role.STUDENT:
        try:
            xp_record = StudentXP(
                student_id=current_user.id,
                amount=xp_earned,
                reason=f'نشاط: {activity.get("title", "نشاط")}',
                session_id=session_id,
            )
            db.session.add(xp_record)
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f'XP award error: {e}')

    # Count total completions for progress
    num_completions = len(submissions)

    # Send result back to the submitting student
    emit('activity_result', {
        'correct': correct_count,
        'total': total_count,
        'xp_earned': xp_earned,
        'activity_id': activity_id,
        'student_id': student_id,
        'completions': num_completions,
    })

    # Also notify teacher about the submission (broadcast to room)
    emit('activity_submission_update', {
        'activity_id': activity_id,
        'student_id': student_id,
        'student_name': student_name,
        'correct': correct_count,
        'total': total_count,
        'completions': num_completions,
    }, room=f'session_{session_id}', include_self=False)


@socketio.on('end_activity')
def handle_end_activity(data):
    """Teacher ends the current activity."""
    if not current_user.is_authenticated:
        return
    if current_user.role not in (Role.TEACHER, Role.ADMIN):
        emit('error', {'message': 'Only teachers can end activities'})
        return

    session_id = data.get('session_id')
    activity_id = data.get('activity_id')

    if not session_id:
        return

    # Clean up stored activity data
    if session_id in _active_activities:
        del _active_activities[session_id]
    if activity_id and activity_id in _activity_submissions:
        del _activity_submissions[activity_id]

    emit('activity_end', {
        'session_id': session_id,
        'activity_id': activity_id,
    }, room=f'session_{session_id}')


# === Teacher Mic Control Handlers ===

@socketio.on('mute_all_students')
def handle_mute_all(data):
    """Teacher mutes all students and locks their mic buttons."""
    if not current_user.is_authenticated or current_user.role not in (Role.TEACHER, Role.ADMIN):
        return
    session_id = data.get('session_id')
    if not session_id:
        return
    emit('mic_locked', {
        'locked': True,
        'target': 'all',
    }, room=f'session_{session_id}')


@socketio.on('unmute_all_students')
def handle_unmute_all(data):
    """Teacher unlocks all students' mic buttons."""
    if not current_user.is_authenticated or current_user.role not in (Role.TEACHER, Role.ADMIN):
        return
    session_id = data.get('session_id')
    if not session_id:
        return
    emit('mic_locked', {
        'locked': False,
        'target': 'all',
    }, room=f'session_{session_id}')


@socketio.on('mute_student')
def handle_mute_student(data):
    """Teacher mutes a specific student and locks their mic button."""
    if not current_user.is_authenticated or current_user.role not in (Role.TEACHER, Role.ADMIN):
        return
    session_id = data.get('session_id')
    student_id = data.get('student_id')
    if not session_id or not student_id:
        return
    emit('mic_locked', {
        'locked': True,
        'target': 'student',
        'student_id': student_id,
    }, room=f'session_{session_id}')


@socketio.on('unmute_student')
def handle_unmute_student(data):
    """Teacher unlocks a specific student's mic button."""
    if not current_user.is_authenticated or current_user.role not in (Role.TEACHER, Role.ADMIN):
        return
    session_id = data.get('session_id')
    student_id = data.get('student_id')
    if not session_id or not student_id:
        return
    emit('mic_locked', {
        'locked': False,
        'target': 'student',
        'student_id': student_id,
    }, room=f'session_{session_id}')


# === YouTube Video Sync Handlers ===

@socketio.on('video_load')
def handle_video_load(data):
    """Teacher loads a YouTube video — broadcast URL to room."""
    if not current_user.is_authenticated or current_user.role not in (Role.TEACHER, Role.ADMIN):
        return
    session_id = data.get('session_id')
    youtube_url = data.get('youtube_url', '')
    if not session_id or not youtube_url:
        return
    _session_video_state[session_id] = {
        'youtube_url': youtube_url,
        'current_time': 0,
        'is_playing': False,
    }
    emit('video_load', {'youtube_url': youtube_url}, room=f'session_{session_id}')


@socketio.on('video_play')
def handle_video_play(data):
    """Teacher plays video — broadcast to room."""
    if not current_user.is_authenticated or current_user.role not in (Role.TEACHER, Role.ADMIN):
        return
    session_id = data.get('session_id')
    current_time = data.get('current_time', 0)
    if not session_id:
        return
    state = _session_video_state.get(session_id, {})
    state['is_playing'] = True
    state['current_time'] = current_time
    _session_video_state[session_id] = state
    emit('video_play', {'current_time': current_time}, room=f'session_{session_id}', include_self=False)


@socketio.on('video_pause')
def handle_video_pause(data):
    """Teacher pauses video — broadcast to room."""
    if not current_user.is_authenticated or current_user.role not in (Role.TEACHER, Role.ADMIN):
        return
    session_id = data.get('session_id')
    current_time = data.get('current_time', 0)
    if not session_id:
        return
    state = _session_video_state.get(session_id, {})
    state['is_playing'] = False
    state['current_time'] = current_time
    _session_video_state[session_id] = state
    emit('video_pause', {'current_time': current_time}, room=f'session_{session_id}', include_self=False)


@socketio.on('video_seek')
def handle_video_seek(data):
    """Teacher seeks video — broadcast to room."""
    if not current_user.is_authenticated or current_user.role not in (Role.TEACHER, Role.ADMIN):
        return
    session_id = data.get('session_id')
    current_time = data.get('current_time', 0)
    if not session_id:
        return
    state = _session_video_state.get(session_id, {})
    state['current_time'] = current_time
    _session_video_state[session_id] = state
    emit('video_seek', {'current_time': current_time}, room=f'session_{session_id}', include_self=False)
