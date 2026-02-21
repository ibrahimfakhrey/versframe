/* === SocketIO Client Setup === */

let socket = null;
let socketConnected = false;

function initSocketIO(sessionId) {
    if (socket && socketConnected) return socket;

    try {
        socket = io({
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
        });
    } catch (e) {
        console.warn('SocketIO not available:', e.message);
        return null;
    }

    socket.on('connect', () => {
        console.log('SocketIO connected');
        socketConnected = true;
        socket.emit('join_session', { session_id: sessionId });

        // Update connection indicator
        const indicator = document.getElementById('connectionStatus');
        if (indicator) {
            indicator.classList.add('connected');
            indicator.title = 'متصل';
        }
    });

    socket.on('disconnect', () => {
        console.log('SocketIO disconnected');
        socketConnected = false;

        const indicator = document.getElementById('connectionStatus');
        if (indicator) {
            indicator.classList.remove('connected');
            indicator.title = 'غير متصل';
        }
    });

    socket.on('reconnect', () => {
        console.log('SocketIO reconnected');
        socket.emit('join_session', { session_id: sessionId });
    });

    // === User Events ===
    socket.on('user_joined', (data) => {
        console.log('User joined:', data.name);
        if (typeof updateUserList === 'function') updateUserList(data);
        // Show toast for new users (not self)
        if (data.user_id !== (typeof USER_ID !== 'undefined' ? USER_ID : -1)) {
            if (typeof showToast === 'function') showToast(`${data.name} انضم للجلسة`, 'info');
        }
    });

    socket.on('user_left', (data) => {
        console.log('User left:', data.user_id);
        if (typeof removeUser === 'function') removeUser(data.user_id);
    });

    socket.on('session_ended', (data) => {
        console.log('Session ended by teacher');
        if (typeof showToast === 'function') showToast(data.message || 'تم إنهاء الجلسة', 'warning');
        // Leave 100ms room
        if (typeof hmsActions !== 'undefined' && hmsActions) {
            try { hmsActions.leave(); } catch(e) {}
        }
        // Disconnect socket
        socket.disconnect();
        // Redirect after brief delay
        setTimeout(function() {
            window.location.href = '/student/';
        }, 2000);
    });

    // === Resource Switching ===
    socket.on('resource_switch', (data) => {
        if (typeof switchResource === 'function') switchResource(data.resource_id, data.resource_type, data.slide_urls);
    });

    // === Slide Sync ===
    socket.on('slide_change', (data) => {
        if (typeof setSlideIndex === 'function') setSlideIndex(data.slide_index);
    });

    // === Slide Sync for Late Joiners ===
    socket.on('slide_sync', (data) => {
        if (typeof handleSlideSync === 'function') handleSlideSync(data);
    });

    // === Code Events ===
    socket.on('code_broadcast', (data) => {
        if (typeof setEditorCode === 'function') setEditorCode(data.code_content);
        if (typeof showToast === 'function') showToast('تم استلام كود من المعلم', 'info');
    });

    socket.on('code_submit', (data) => {
        if (typeof handleCodeSubmit === 'function') handleCodeSubmit(data);
    });

    // === Q&A ===
    socket.on('question_submit', (data) => {
        if (typeof addQuestion === 'function') addQuestion(data);
    });

    // === Hand Raise ===
    socket.on('hand_raise', (data) => {
        if (typeof handleHandRaise === 'function') handleHandRaise(data);
    });

    // === Chat ===
    socket.on('chat_message', (data) => {
        if (typeof addChatMessage === 'function') addChatMessage(data);
    });

    // === Timer ===
    socket.on('timer_start', (data) => {
        if (typeof startActivityTimer === 'function') startActivityTimer(data.duration);
    });

    socket.on('timer_stop', () => {
        if (typeof stopActivityTimer === 'function') stopActivityTimer();
    });

    // === Teacher Mic Control ===
    socket.on('mic_locked', (data) => {
        if (typeof handleMicLock === 'function') handleMicLock(data);
    });

    // === In-Class Activities ===
    socket.on('activity_start', (data) => {
        console.log('Activity started:', data);
        if (typeof handleActivityStart === 'function') handleActivityStart(data);
    });

    socket.on('activity_end', (data) => {
        console.log('Activity ended:', data);
        if (typeof handleActivityEnd === 'function') handleActivityEnd(data);
    });

    socket.on('activity_result', (data) => {
        console.log('Activity result:', data);
        if (typeof handleActivityResult === 'function') handleActivityResult(data);
    });

    socket.on('activity_submission_update', (data) => {
        console.log('Activity submission update:', data);
        if (typeof handleActivitySubmissionUpdate === 'function') handleActivitySubmissionUpdate(data);
    });

    // === Whiteboard ===
    socket.on('whiteboard_start', (data) => {
        console.log('whiteboard_start received:', data);
        if (typeof handleWhiteboardStart === 'function') handleWhiteboardStart(data);
        else console.warn('handleWhiteboardStart not defined');
    });

    socket.on('whiteboard_sync', (data) => {
        console.log('whiteboard_sync received:', data);
        if (typeof handleWhiteboardStart === 'function') handleWhiteboardStart(data);
        else console.warn('handleWhiteboardStart not defined');
    });

    return socket;
}

/* ---------- Emit Helpers ---------- */

function emitSlideChange(sessionId, slideIndex, resourceId) {
    if (socket && socketConnected) {
        socket.emit('slide_change', { session_id: sessionId, slide_index: slideIndex, resource_id: resourceId || null });
    }
}

function emitCodeBroadcast(sessionId, code) {
    if (socket && socketConnected) {
        socket.emit('code_broadcast', { session_id: sessionId, code_content: code });
    }
}

function emitCodeSubmit(sessionId, studentId, code) {
    if (socket && socketConnected) {
        socket.emit('code_submit', {
            session_id: sessionId,
            student_id: studentId,
            code_content: code,
            student_name: typeof USER_NAME !== 'undefined' ? USER_NAME : '',
        });
    }
}

function emitQuestion(sessionId, text) {
    if (socket && socketConnected) {
        socket.emit('question_submit', {
            session_id: sessionId,
            question_text: text,
            student_id: typeof USER_ID !== 'undefined' ? USER_ID : 0,
            student_name: typeof USER_NAME !== 'undefined' ? USER_NAME : 'طالب',
            timestamp: new Date().toISOString(),
        });
    }
}

function emitHandRaise(sessionId, studentId) {
    if (socket && socketConnected) {
        socket.emit('hand_raise', {
            session_id: sessionId,
            student_id: studentId,
            student_name: typeof USER_NAME !== 'undefined' ? USER_NAME : '',
        });
    }
}

function emitChat(sessionId, userId, message) {
    if (socket && socketConnected) {
        socket.emit('chat_message', {
            session_id: sessionId,
            user_id: userId,
            user_name: typeof USER_NAME !== 'undefined' ? USER_NAME : '',
            message: message,
            timestamp: new Date().toISOString(),
        });
    }
}

function emitTimerStart(sessionId, duration) {
    if (socket && socketConnected) {
        socket.emit('timer_start', { session_id: sessionId, duration: duration });
    }
}

function emitTimerStop(sessionId) {
    if (socket && socketConnected) {
        socket.emit('timer_stop', { session_id: sessionId });
    }
}

function leaveSession(sessionId) {
    if (socket) {
        socket.emit('leave_session', { session_id: sessionId });
        socket.disconnect();
        socketConnected = false;
    }
}

/* ---------- Activity Emit Helpers ---------- */

function emitActivityStart(sessionId, activityData) {
    if (socket && socketConnected) {
        socket.emit('start_activity', {
            session_id: sessionId,
            activity: activityData,
        });
    }
}

function emitActivitySubmit(sessionId, answerData) {
    if (socket && socketConnected) {
        socket.emit('activity_submit', {
            session_id: sessionId,
            activity_id: answerData.activity_id,
            answer: answerData.answer,
            student_id: answerData.student_id,
            student_name: answerData.student_name,
        });
    }
}

function emitActivityEnd(sessionId, activityId) {
    if (socket && socketConnected) {
        socket.emit('end_activity', {
            session_id: sessionId,
            activity_id: activityId,
        });
    }
}

/* ---------- Teacher Mic Control Emit Helpers ---------- */

function emitMuteAll(sessionId) {
    if (socket && socketConnected) {
        socket.emit('mute_all_students', { session_id: sessionId });
    }
}

function emitUnmuteAll(sessionId) {
    if (socket && socketConnected) {
        socket.emit('unmute_all_students', { session_id: sessionId });
    }
}

function emitMuteStudent(sessionId, studentId) {
    if (socket && socketConnected) {
        socket.emit('mute_student', { session_id: sessionId, student_id: studentId });
    }
}

function emitUnmuteStudent(sessionId, studentId) {
    if (socket && socketConnected) {
        socket.emit('unmute_student', { session_id: sessionId, student_id: studentId });
    }
}
