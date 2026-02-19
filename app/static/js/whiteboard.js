/* === Whiteboard (Excalidraw Collaboration via iframe) === */

/**
 * Teacher clicks "Start Whiteboard" button.
 * POSTs to server, which generates an Excalidraw collab room URL,
 * stores it for late joiners, and broadcasts to all via SocketIO.
 */
function startWhiteboard() {
    var btn = document.getElementById('whiteboardStartBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'جاري التشغيل...';
    }

    var csrfMeta = document.querySelector('meta[name="csrf-token"]');
    var headers = { 'Content-Type': 'application/json' };
    if (csrfMeta) headers['X-CSRFToken'] = csrfMeta.content;

    fetch('/room/' + SESSION_ID + '/start-whiteboard', {
        method: 'POST',
        headers: headers,
        body: '{}',
    })
    .then(function(resp) { return resp.json(); })
    .then(function(data) {
        if (data.ok && data.url) {
            loadWhiteboard(data.url);
            // Broadcast to students via SocketIO
            if (typeof socket !== 'undefined' && socket && socketConnected) {
                socket.emit('whiteboard_started', { session_id: SESSION_ID, url: data.url });
            }
        } else {
            if (typeof showToast === 'function') showToast(data.error || 'خطأ في تشغيل السبورة', 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'تشغيل السبورة'; }
        }
    })
    .catch(function(err) {
        console.error('Whiteboard start error:', err);
        if (typeof showToast === 'function') showToast('خطأ في الاتصال', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'تشغيل السبورة'; }
    });
}

/**
 * Loads the Excalidraw collaborative whiteboard into the pane.
 * Teacher: full interactive iframe.
 * Student: iframe with pointer-events blocked + view-only badge.
 */
function loadWhiteboard(url) {
    var pane = document.getElementById('pane-whiteboard');
    if (!pane) return;

    var isTeacher = (typeof IS_TEACHER !== 'undefined') && IS_TEACHER;

    var html = '';
    if (!isTeacher) {
        html += '<div class="whiteboard-overlay">&#128065; مشاهدة فقط</div>';
    }
    html += '<iframe id="whiteboardFrame" class="whiteboard-frame" src="' + url + '" ' +
            'allow="clipboard-read; clipboard-write" ' +
            'frameborder="0" allowfullscreen></iframe>';

    pane.innerHTML = html;

    // Switch to whiteboard tab
    if (typeof switchSubTab === 'function') switchSubTab('whiteboard');

    if (typeof showToast === 'function') {
        showToast(isTeacher ? 'تم تشغيل السبورة التفاعلية' : 'السبورة التفاعلية متصلة', 'success');
    }
}

/**
 * Called by SocketIO when teacher starts whiteboard or for late-joiner sync.
 */
function handleWhiteboardStart(data) {
    if (data && data.url) {
        loadWhiteboard(data.url);
    }
}
