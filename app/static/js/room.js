/* === Live Room - 100ms Video SDK Integration & Controls === */
/* Shalaby Verse EdTech Platform                              */
/* Depends on: app.js (apiFetch, showToast), socketio.js      */
/* 100ms SDK loaded via CDN in template:                      */
/*   @100mslive/hms-video-store/dist/index.js                 */

// ---------------------------------------------------------------------------
// 100ms SDK handles
// ---------------------------------------------------------------------------
let hmsActions = null;
let hmsStore = null;
let hmsNotifications = null;

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------
let isAudioMuted = false;
let isVideoMuted = false;
let isScreenSharing = false;
let sessionId = null;
let isTeacher = false;

// Peer tracking (peerId -> peer object)
const peers = new Map();

// Timer
let timerInterval = null;
let timerSeconds = 0;

// Connected user list (userId -> user data) - used by socketio.js callbacks
const connectedUsers = new Map();

// Resource management
let currentResourceType = null;

// Teacher mic lock state
let micLockedByTeacher = false;
const mutedStudents = new Set();

// Keep references to attached video elements so we can detach properly
// trackId -> { videoEl, container }
const attachedTracks = new Map();

// ---------------------------------------------------------------------------
// SDK availability check
// ---------------------------------------------------------------------------
function isSDKAvailable() {
    return typeof HMSReactiveStore !== 'undefined';
}

// ---------------------------------------------------------------------------
// initRoom(config)
//   config: { sessionId, isTeacher, authToken, userName }
//   Entry point called from the template after DOM is ready.
// ---------------------------------------------------------------------------
async function initRoom(config) {
    sessionId = config.sessionId;
    isTeacher = config.isTeacher;

    // Initialize SocketIO (defined in socketio.js)
    if (typeof initSocketIO === 'function') {
        initSocketIO(sessionId);
    }

    // Initialize 100ms SDK and join
    if (config.authToken) {
        await initHMS(config.authToken, config.userName || 'User');
    } else {
        console.warn('No authToken provided - running without video');
        renderPlaceholders();
    }

    // Control buttons are wired via onclick in the template — no setupControls() needed

    // Load session resources (slides, code exercises, etc.)
    loadResources();

    // Start the elapsed-time timer
    startRoomTimer();
}

// ---------------------------------------------------------------------------
// initHMS - create the reactive store, join, subscribe
// ---------------------------------------------------------------------------
async function initHMS(authToken, userName) {
    try {
        if (!isSDKAvailable()) {
            console.warn('100ms SDK not loaded - falling back to placeholders');
            renderPlaceholders();
            return;
        }

        const hmsManager = new HMSReactiveStore();
        hmsStore = hmsManager.getStore();
        hmsActions = hmsManager.getHMSActions();
        hmsNotifications = hmsManager.getNotifications();

        // Subscribe to peer list changes
        hmsStore.subscribe(handlePeerUpdate, selectPeers);

        // Subscribe to local audio/video state so UI stays in sync
        hmsStore.subscribe(function (enabled) {
            isAudioMuted = !enabled;
            updateMicButtonUI();
        }, selectIsLocalAudioEnabled);

        hmsStore.subscribe(function (enabled) {
            isVideoMuted = !enabled;
            updateCamButtonUI();
        }, selectIsLocalVideoEnabled);

        // Join the room
        await hmsActions.join({
            userName: userName,
            authToken: authToken,
        });

        console.log('100ms: joined room successfully');
    } catch (err) {
        console.error('100ms init/join error:', err);
        showToast('تعذر الاتصال بالفيديو', 'error');
        renderPlaceholders();
    }
}

// ---------------------------------------------------------------------------
// handlePeerUpdate(peers)
//   Called by hmsStore.subscribe whenever the peer list changes.
// ---------------------------------------------------------------------------
function handlePeerUpdate(updatedPeers) {
    if (!updatedPeers) return;

    // Refresh local map
    peers.clear();
    updatedPeers.forEach(function (peer) {
        peers.set(peer.id, peer);
    });

    renderPeers();
    updateParticipantsList();
}

// ---------------------------------------------------------------------------
// renderPeers()
//   Splits peers into teacher / students and renders into the layout.
// ---------------------------------------------------------------------------
function renderPeers() {
    var allPeers = [];

    if (hmsStore) {
        try {
            allPeers = hmsStore.getState(selectPeers) || [];
        } catch (e) {
            console.error('renderPeers: failed to get peers', e);
        }
    }

    // If SDK is not available, use the peers map we maintain
    if (!allPeers.length && peers.size) {
        allPeers = Array.from(peers.values());
    }

    var teacherPeer = null;
    var studentPeers = [];

    allPeers.forEach(function (peer) {
        if (peer.roleName === 'teacher' || peer.roleName === 'host' || peer.role === 'teacher' || peer.role === 'host') {
            teacherPeer = peer;
        } else {
            studentPeers.push(peer);
        }
    });

    // --- Teacher video ---
    var teacherContainer = document.getElementById('teacherVideo');
    if (teacherContainer) {
        if (teacherPeer) {
            renderVideo(teacherPeer, teacherContainer);
        } else {
            // No teacher peer yet - show placeholder
            if (!teacherContainer.querySelector('.room-avatar-placeholder')) {
                teacherContainer.innerHTML = '';
                teacherContainer.appendChild(createPlaceholder('المعلم'));
            }
        }
    }

    // --- Student grid ---
    var studentGrid = document.getElementById('studentVideoGrid');
    if (studentGrid) {
        // Collect existing thumb elements keyed by peerId for reuse
        var existingThumbs = {};
        studentGrid.querySelectorAll('.room-student-thumb').forEach(function (el) {
            var pid = el.getAttribute('data-peer-id');
            if (pid) existingThumbs[pid] = el;
        });

        // Mark all as stale; we will un-mark the ones we still need
        Object.keys(existingThumbs).forEach(function (pid) {
            existingThumbs[pid]._stale = true;
        });

        studentPeers.forEach(function (peer) {
            var thumb = existingThumbs[peer.id];
            if (thumb) {
                // Already exists - update name & re-attach video if needed
                thumb._stale = false;
                var nameEl = thumb.querySelector('.room-student-name');
                if (nameEl) nameEl.textContent = peer.name || '';
                renderVideo(peer, thumb);
            } else {
                // Create new thumb
                var newThumb = document.createElement('div');
                newThumb.className = 'room-student-thumb';
                newThumb.setAttribute('data-peer-id', peer.id);

                var nameOverlay = document.createElement('div');
                nameOverlay.className = 'room-student-name';
                nameOverlay.textContent = peer.name || '';

                newThumb.appendChild(nameOverlay);
                studentGrid.appendChild(newThumb);
                renderVideo(peer, newThumb);
            }
        });

        // Remove thumbs for peers that left
        Object.keys(existingThumbs).forEach(function (pid) {
            if (existingThumbs[pid]._stale) {
                detachTrackForContainer(existingThumbs[pid]);
                existingThumbs[pid].remove();
            }
        });

        // Render per-student mute overlays for teacher
        renderStudentMuteOverlays();
    }
}

// ---------------------------------------------------------------------------
// renderVideo(peer, container)
//   Creates or reuses a <video> element inside container and attaches the
//   peer's video track via hmsActions.attachVideo.
// ---------------------------------------------------------------------------
function renderVideo(peer, container) {
    if (!peer) return;

    var videoTrackId = null;

    // The peer object has videoTrack (track ID string) in 100ms v2
    if (peer.videoTrack) {
        videoTrackId = peer.videoTrack;
    }

    // If no video track, show placeholder avatar
    if (!videoTrackId || !hmsActions) {
        showPlaceholderInContainer(peer, container);
        return;
    }

    // Remove placeholder if present
    var placeholder = container.querySelector('.room-avatar-placeholder');
    if (placeholder) placeholder.remove();

    // Find or create video element
    var videoEl = container.querySelector('video[data-track-id="' + videoTrackId + '"]');
    if (videoEl) {
        // Already attached for this track - nothing to do
        return;
    }

    // Detach any previous track in this container
    detachTrackForContainer(container);

    videoEl = document.createElement('video');
    videoEl.autoplay = true;
    videoEl.muted = true; // muted for local playback (audio goes through audio tracks)
    videoEl.playsInline = true;
    videoEl.setAttribute('data-track-id', videoTrackId);
    videoEl.setAttribute('data-peer-id', peer.id);
    videoEl.style.width = '100%';
    videoEl.style.height = '100%';
    videoEl.style.objectFit = 'cover';
    videoEl.style.borderRadius = 'inherit';

    container.insertBefore(videoEl, container.firstChild);

    try {
        hmsActions.attachVideo(videoTrackId, videoEl);
        attachedTracks.set(videoTrackId, { videoEl: videoEl, container: container });
    } catch (err) {
        console.error('Failed to attach video for peer', peer.id, err);
        showPlaceholderInContainer(peer, container);
    }
}

// ---------------------------------------------------------------------------
// detachTrackForContainer - detach any previously attached track in container
// ---------------------------------------------------------------------------
function detachTrackForContainer(container) {
    var oldVideo = container.querySelector('video');
    if (oldVideo) {
        var oldTrackId = oldVideo.getAttribute('data-track-id');
        if (oldTrackId && hmsActions) {
            try {
                hmsActions.detachVideo(oldTrackId, oldVideo);
            } catch (e) {
                // Ignore detach errors
            }
            attachedTracks.delete(oldTrackId);
        }
        oldVideo.remove();
    }
}

// ---------------------------------------------------------------------------
// Placeholder helpers (when SDK not available or peer has no video)
// ---------------------------------------------------------------------------
function renderPlaceholders() {
    var teacherContainer = document.getElementById('teacherVideo');
    if (teacherContainer && !teacherContainer.querySelector('.room-avatar-placeholder')) {
        teacherContainer.innerHTML = '';
        teacherContainer.appendChild(createPlaceholder('المعلم'));
    }
}

function createPlaceholder(label) {
    var div = document.createElement('div');
    div.className = 'room-avatar-placeholder';
    div.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;' +
        'background:rgba(255,255,255,0.05);border-radius:inherit;color:rgba(255,255,255,0.4);' +
        'font-size:1.2rem;flex-direction:column;gap:0.5rem;';

    var icon = document.createElement('div');
    icon.style.cssText = 'width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,0.08);' +
        'display:flex;align-items:center;justify-content:center;font-size:2rem;';
    icon.innerHTML = '<svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>';

    var text = document.createElement('span');
    text.textContent = label || '';

    div.appendChild(icon);
    div.appendChild(text);
    return div;
}

function showPlaceholderInContainer(peer, container) {
    if (container.querySelector('.room-avatar-placeholder')) return;
    // Remove existing video
    detachTrackForContainer(container);
    container.insertBefore(createPlaceholder(peer.name || ''), container.firstChild);
}

// ---------------------------------------------------------------------------
// Control setup
// ---------------------------------------------------------------------------
function setupControls() {
    var micBtn = document.getElementById('micBtn');
    if (micBtn) micBtn.addEventListener('click', toggleMic);

    var camBtn = document.getElementById('camBtn');
    if (camBtn) camBtn.addEventListener('click', toggleCamera);

    var screenBtn = document.getElementById('screenBtn');
    if (screenBtn) screenBtn.addEventListener('click', toggleScreenShare);

    var handBtn = document.getElementById('handBtn');
    if (handBtn) handBtn.addEventListener('click', raiseHand);

    var leaveBtn = document.getElementById('leaveBtn');
    if (leaveBtn) leaveBtn.addEventListener('click', leaveRoom);

    var chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && chatInput.value.trim()) {
                if (typeof emitChat === 'function') {
                    emitChat(sessionId, window.currentUserId, chatInput.value.trim());
                }
                chatInput.value = '';
            }
        });
    }
}

// ---------------------------------------------------------------------------
// toggleMic
// ---------------------------------------------------------------------------
async function toggleMic() {
    if (micLockedByTeacher && !isTeacher) {
        showToast('المعلم قام بكتم الميكروفون', 'warning');
        return;
    }
    isAudioMuted = !isAudioMuted;
    updateMicButtonUI();

    if (hmsActions) {
        try {
            await hmsActions.setLocalAudioEnabled(!isAudioMuted);
        } catch (err) {
            console.error('toggleMic error:', err);
            // Revert state on failure
            isAudioMuted = !isAudioMuted;
            updateMicButtonUI();
            showToast('تعذر تبديل الميكروفون', 'error');
        }
    }
}

function updateMicButtonUI() {
    var btn = document.getElementById('micBtn');
    if (!btn) return;
    btn.classList.toggle('muted', isAudioMuted);
    var icon = btn.querySelector('i, svg, .icon');
    if (icon) {
        // If using an icon element, toggle classes
        icon.classList.toggle('fa-microphone', !isAudioMuted);
        icon.classList.toggle('fa-microphone-slash', isAudioMuted);
    } else {
        // Fallback: swap innerHTML
        btn.innerHTML = isAudioMuted
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12m14 0a7 7 0 01-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
    }
}

// ---------------------------------------------------------------------------
// toggleCamera
// ---------------------------------------------------------------------------
async function toggleCamera() {
    isVideoMuted = !isVideoMuted;
    updateCamButtonUI();

    if (hmsActions) {
        try {
            await hmsActions.setLocalVideoEnabled(!isVideoMuted);
        } catch (err) {
            console.error('toggleCamera error:', err);
            isVideoMuted = !isVideoMuted;
            updateCamButtonUI();
            showToast('تعذر تبديل الكاميرا', 'error');
        }
    }
}

function updateCamButtonUI() {
    var btn = document.getElementById('camBtn');
    if (!btn) return;
    btn.classList.toggle('muted', isVideoMuted);
    var icon = btn.querySelector('i, svg, .icon');
    if (icon && icon.classList) {
        icon.classList.toggle('fa-video', !isVideoMuted);
        icon.classList.toggle('fa-video-slash', isVideoMuted);
    } else {
        btn.innerHTML = isVideoMuted
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 7.5l-5 3.5 5 3.5V7.5z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
    }
}

// ---------------------------------------------------------------------------
// toggleScreenShare (teacher only)
// ---------------------------------------------------------------------------
async function toggleScreenShare() {
    if (!isTeacher) {
        showToast('مشاركة الشاشة متاحة للمعلم فقط', 'warning');
        return;
    }

    if (hmsActions) {
        try {
            isScreenSharing = !isScreenSharing;
            await hmsActions.setScreenShareEnabled(isScreenSharing);
            updateScreenButtonUI();
        } catch (err) {
            console.error('toggleScreenShare error:', err);
            // If user cancelled the browser picker, revert
            isScreenSharing = !isScreenSharing;
            updateScreenButtonUI();
            if (err.name !== 'NotAllowedError') {
                showToast('تعذر مشاركة الشاشة', 'error');
            }
        }
    } else {
        showToast('خدمة الفيديو غير متصلة', 'warning');
    }
}

function updateScreenButtonUI() {
    var btn = document.getElementById('screenBtn');
    if (!btn) return;
    btn.classList.toggle('active', isScreenSharing);
}

// ---------------------------------------------------------------------------
// raiseHand
// ---------------------------------------------------------------------------
function raiseHand() {
    if (typeof emitHandRaise === 'function') {
        emitHandRaise(sessionId, window.currentUserId);
    }
    showToast('تم رفع اليد', 'info');
}

// ---------------------------------------------------------------------------
// leaveRoom
// ---------------------------------------------------------------------------
async function leaveRoom() {
    if (!confirm('هل تريد مغادرة الغرفة؟')) return;

    // Leave 100ms room
    if (hmsActions) {
        try {
            await hmsActions.leave();
        } catch (err) {
            console.error('Error leaving 100ms room:', err);
        }
    }

    // Emit leave via SocketIO
    if (typeof leaveSession === 'function') {
        leaveSession(sessionId);
    }

    // Stop timer
    stopRoomTimer();

    // Redirect to dashboard
    window.location.href = isTeacher ? '/teacher/' : '/student/';
}

// ---------------------------------------------------------------------------
// updateParticipantsList
// ---------------------------------------------------------------------------
function updateParticipantsList() {
    var count = peers.size || connectedUsers.size;
    var el = document.getElementById('studentCount');
    if (el) el.textContent = count;

    var participantCountEl = document.getElementById('participantCount');
    if (participantCountEl) participantCountEl.textContent = count;
}

// ---------------------------------------------------------------------------
// Room Timer - counts UP from 00:00 (session elapsed time)
// ---------------------------------------------------------------------------
function startRoomTimer() {
    timerSeconds = 0;
    var display = document.getElementById('topTimer') || document.getElementById('roomTimer');
    if (display) display.textContent = formatTime(0);

    clearInterval(timerInterval);
    timerInterval = setInterval(function () {
        timerSeconds++;
        var display = document.getElementById('topTimer') || document.getElementById('roomTimer');
        if (display) display.textContent = formatTime(timerSeconds);
    }, 1000);
}

function stopRoomTimer() {
    clearInterval(timerInterval);
}

function formatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0');
}

// ---------------------------------------------------------------------------
// Activity Timer (countdown) - triggered by teacher via SocketIO
// ---------------------------------------------------------------------------
var activityTimerInterval = null;
var activityTimerSeconds = 0;

function startTimer(duration) {
    activityTimerSeconds = duration;
    var display = document.getElementById('timerDisplay');
    if (display) {
        display.textContent = formatTime(activityTimerSeconds);
        if (display.parentElement) display.parentElement.classList.add('active');
    }

    clearInterval(activityTimerInterval);
    activityTimerInterval = setInterval(function () {
        activityTimerSeconds--;
        var display = document.getElementById('timerDisplay');
        if (display) display.textContent = formatTime(activityTimerSeconds);

        if (activityTimerSeconds <= 0) {
            stopTimer();
            showToast('انتهى الوقت!', 'warning');
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(activityTimerInterval);
    var display = document.getElementById('timerDisplay');
    if (display && display.parentElement) {
        display.parentElement.classList.remove('active');
    }
}

// ---------------------------------------------------------------------------
// User list management (called by socketio.js event handlers)
// ---------------------------------------------------------------------------
function updateUserList(data) {
    if (!data || !data.user_id) return;
    connectedUsers.set(data.user_id, data);
    updateParticipantsList();

    // Optionally show a join toast
    if (data.name) {
        showToast(data.name + ' انضم للغرفة', 'info');
    }
}

function removeUser(userId) {
    var userData = connectedUsers.get(userId);
    connectedUsers.delete(userId);
    updateParticipantsList();

    if (userData && userData.name) {
        showToast(userData.name + ' غادر الغرفة', 'info');
    }
}

// ---------------------------------------------------------------------------
// Hand raise handler (called by socketio.js)
// ---------------------------------------------------------------------------
function handleHandRaise(data) {
    if (!data) return;
    var name = data.student_name || data.student_id || 'طالب';
    showToast(name + ' رفع يده', 'info');

    // If teacher, highlight in participant list
    if (isTeacher) {
        var handIndicator = document.getElementById('hand-' + data.student_id);
        if (handIndicator) {
            handIndicator.classList.add('raised');
            setTimeout(function () {
                handIndicator.classList.remove('raised');
            }, 10000);
        }
    }
}

// ---------------------------------------------------------------------------
// Chat message handler (called by socketio.js)
// ---------------------------------------------------------------------------
function addChatMessage(data) {
    if (!data) return;

    var chatContainer = document.getElementById('chatMessages') || document.getElementById('chatList');
    if (!chatContainer) {
        console.log('Chat:', data.message);
        return;
    }

    // Clear placeholder on first message
    var placeholder = document.getElementById('chatPlaceholder');
    if (placeholder) placeholder.remove();

    var msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';

    // Check if this is the current user's message
    var isMine = data.user_id && data.user_id === window.currentUserId;
    if (isMine) msgDiv.classList.add('chat-message-mine');

    var senderSpan = document.createElement('span');
    senderSpan.className = 'chat-sender';
    senderSpan.textContent = data.sender_name || data.user_name || data.user_id || '';

    var textSpan = document.createElement('span');
    textSpan.className = 'chat-text';
    textSpan.textContent = data.message || '';

    var timeSpan = document.createElement('span');
    timeSpan.className = 'chat-time';
    timeSpan.textContent = data.timestamp
        ? new Date(data.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
        : '';

    msgDiv.appendChild(senderSpan);
    msgDiv.appendChild(textSpan);
    msgDiv.appendChild(timeSpan);

    chatContainer.appendChild(msgDiv);

    // Auto-scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// ---------------------------------------------------------------------------
// Resource management
// ---------------------------------------------------------------------------
async function loadResources() {
    try {
        var response = await fetch('/room/' + sessionId + '/resources');
        if (!response.ok) return;
        var resources = await response.json();
        renderResourceTabs(resources);
    } catch (e) {
        console.error('Failed to load resources:', e);
    }
}

function renderResourceTabs(resources) {
    var tabsContainer = document.getElementById('resourceTabs');
    if (!tabsContainer || !resources || !resources.length) return;

    tabsContainer.innerHTML = '';
    resources.forEach(function (r) {
        var tab = document.createElement('button');
        tab.className = 'room-tab' + (r.is_active ? ' active' : '');
        tab.textContent = r.name_ar || r.name;
        tab.onclick = function () {
            if (isTeacher) activateResource(r.resource_id);
            switchResource(r.resource_id, r.type);
        };
        tabsContainer.appendChild(tab);
    });

    // Show currently active resource
    var active = resources.find(function (r) { return r.is_active; });
    if (active) {
        switchResource(active.resource_id, active.type);
    }
}

async function activateResource(resourceId) {
    try {
        await apiFetch('/room/' + sessionId + '/activate-resource', {
            method: 'POST',
            body: JSON.stringify({ resource_id: resourceId }),
        });
    } catch (e) {
        console.error('Failed to activate resource:', e);
    }
}

function switchResource(resourceId, resourceType, slideUrls) {
    currentResourceType = resourceType;

    // Handle slides directly — the viewer lives in pane-slides, not resourceContent
    if (resourceType === 'slides') {
        if (typeof switchSubTab === 'function') switchSubTab('slides');
        if (typeof initSlides === 'function') initSlides(resourceId, slideUrls);
        return;
    }

    var content = document.getElementById('resourceContent');
    if (!content) return;

    // Update active tab
    document.querySelectorAll('.room-tab').forEach(function (t) {
        t.classList.remove('active');
    });

    switch (resourceType) {
        case 'slides':
            // handled above
            break;

        case 'code_exercise':
            content.innerHTML =
                '<div class="code-editor-wrapper" id="codeWrapper">' +
                '<div class="code-task" id="codeTask"></div>' +
                '<div class="code-editor" id="codeEditor"></div>' +
                '<div class="code-actions">' +
                '<button class="run-code-btn" onclick="runCode()">&#9654; شغّل الكود</button>' +
                '</div>' +
                '<div class="code-output" id="codeOutput"></div>' +
                '</div>';
            if (typeof initEditor === 'function') initEditor();
            break;

        case 'qna':
            content.innerHTML =
                '<div class="qna-list" id="qnaList"></div>' +
                '<div class="qna-input-area">' +
                '<input class="qna-input" id="qnaInput" placeholder="اكتب سؤالك هنا...">' +
                '<button class="btn btn-orange btn-sm" onclick="submitQuestion()">إرسال</button>' +
                '</div>';
            if (typeof initQnA === 'function') initQnA();
            break;

        case 'whiteboard':
            content.innerHTML =
                '<iframe id="whiteboardFrame" src="https://excalidraw.com" ' +
                'style="width:100%;height:100%;border:none;border-radius:var(--radius-md);"></iframe>';
            break;

        default:
            content.innerHTML =
                '<div style="text-align:center;padding:var(--space-2xl);color:rgba(255,255,255,0.5);">' +
                'اختر مورداً لعرضه</div>';
    }
}

// ---------------------------------------------------------------------------
// Teacher Mic Control
// ---------------------------------------------------------------------------

/**
 * handleMicLock(data) — called when 'mic_locked' SocketIO event is received.
 * data: { locked: bool, target: 'all'|'student', student_id?: int }
 */
function handleMicLock(data) {
    if (!data) return;

    if (isTeacher) {
        // Teacher side: track which students are muted
        if (data.target === 'all') {
            if (data.locked) {
                // Mark all current students as muted
                connectedUsers.forEach(function(u, uid) {
                    if (u.role !== 'teacher' && u.role !== 'admin') mutedStudents.add(uid);
                });
            } else {
                mutedStudents.clear();
            }
        } else if (data.target === 'student' && data.student_id) {
            if (data.locked) {
                mutedStudents.add(data.student_id);
            } else {
                mutedStudents.delete(data.student_id);
            }
        }
        updateMuteAllButtonsUI();
        renderStudentMuteOverlays();
        return;
    }

    // Student side
    var isTargeted = data.target === 'all' ||
        (data.target === 'student' && data.student_id === window.USER_ID);
    if (!isTargeted) return;

    if (data.locked) {
        micLockedByTeacher = true;
        // Force mute local audio
        if (hmsActions) {
            try { hmsActions.setLocalAudioEnabled(false); } catch(e) {}
        }
        isAudioMuted = true;
        updateMicButtonUI();
        updateMicLockedUI(true);
        showToast('المعلم قام بكتم الميكروفون', 'warning');
    } else {
        micLockedByTeacher = false;
        updateMicLockedUI(false);
        showToast('يمكنك الآن تشغيل الميكروفون', 'info');
    }
}

function updateMicLockedUI(locked) {
    var btn = document.getElementById('micBtn');
    if (!btn) return;
    if (locked) {
        btn.classList.add('mic-locked');
        btn.setAttribute('title', 'الميكروفون مقفل من المعلم');
    } else {
        btn.classList.remove('mic-locked');
        btn.setAttribute('title', 'الميكروفون');
    }
}

function updateMuteAllButtonsUI() {
    var btnMuteAll = document.getElementById('btnMuteAll');
    var btnUnmuteAll = document.getElementById('btnUnmuteAll');
    if (btnMuteAll && btnUnmuteAll) {
        if (mutedStudents.size > 0) {
            btnMuteAll.classList.add('active-state');
            btnUnmuteAll.classList.remove('active-state');
        } else {
            btnMuteAll.classList.remove('active-state');
            btnUnmuteAll.classList.add('active-state');
        }
    }
}

function muteAllStudents() {
    if (typeof emitMuteAll === 'function') emitMuteAll(sessionId);
}

function unmuteAllStudents() {
    if (typeof emitUnmuteAll === 'function') emitUnmuteAll(sessionId);
}

/**
 * Renders mute/unmute overlay buttons on each student thumbnail (teacher only).
 */
function renderStudentMuteOverlays() {
    if (!isTeacher) return;
    var grid = document.getElementById('studentVideoGrid');
    if (!grid) return;

    grid.querySelectorAll('.room-student-thumb').forEach(function(thumb) {
        var peerId = thumb.getAttribute('data-peer-id');
        // Find the user ID for this peer from connectedUsers
        var userId = findUserIdForPeer(peerId);

        // Remove existing overlay if any
        var existing = thumb.querySelector('.student-mute-overlay');
        if (existing) existing.remove();

        if (!userId) return;

        var isMuted = mutedStudents.has(userId);
        var overlay = document.createElement('button');
        overlay.className = 'student-mute-overlay' + (isMuted ? ' is-muted' : '');
        overlay.title = isMuted ? 'فتح الميكروفون' : 'كتم الميكروفون';
        overlay.innerHTML = isMuted
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12m14 0a7 7 0 01-.11 1.23"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>';

        overlay.onclick = function(e) {
            e.stopPropagation();
            if (isMuted) {
                if (typeof emitUnmuteStudent === 'function') emitUnmuteStudent(sessionId, userId);
            } else {
                if (typeof emitMuteStudent === 'function') emitMuteStudent(sessionId, userId);
            }
        };

        thumb.appendChild(overlay);
    });
}

/**
 * Find the userId associated with a 100ms peerId by matching names.
 */
function findUserIdForPeer(peerId) {
    if (!peerId) return null;
    var peer = peers.get(peerId);
    if (!peer) return null;

    // Try to match by name with connectedUsers
    var found = null;
    connectedUsers.forEach(function(u, uid) {
        if (u.name === peer.name) found = uid;
    });
    return found;
}

// ---------------------------------------------------------------------------
// Expose functions globally so template onclick handlers and socketio.js
// can call them.
// ---------------------------------------------------------------------------
window.initRoom = initRoom;
window.toggleMic = toggleMic;
window.toggleCamera = toggleCamera;
window.toggleScreenShare = toggleScreenShare;
window.raiseHand = raiseHand;
window.leaveRoom = leaveRoom;
window.startTimer = startTimer;
window.stopTimer = stopTimer;
window.updateUserList = updateUserList;
window.removeUser = removeUser;
window.handleHandRaise = handleHandRaise;
window.addChatMessage = addChatMessage;
window.switchResource = switchResource;
window.activateResource = activateResource;
window.formatTime = formatTime;
window.renderPeers = renderPeers;
window.updateParticipantsList = updateParticipantsList;
window.handleMicLock = handleMicLock;
window.muteAllStudents = muteAllStudents;
window.unmuteAllStudents = unmuteAllStudents;
window.renderStudentMuteOverlays = renderStudentMuteOverlays;
